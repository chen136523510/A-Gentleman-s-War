# AI 政策细则（PolicyAI · 五线细则 3/4 · 2026-11-18）

> 定位：[AI 决策专题开题](./AI决策专题开题.md) v0.3 §4.3 的施工细则（白机 P1 移交黑机执行）。
> 依据：裁点 3（可频繁切卡 + 变动因子 + 预览复用 + 100 财入 U + 两算法对照）· [政策卡架构](./政策卡架构.md) §十一 6 接口 · [政策卡内容专题](./政策卡内容专题.md) v1.0（卡面权威，50 卡）· 黑机底座（11-17 落库：`policies.json` 50 张 + `PolicySystem.cs` + 五槽 2/2/2/2/2 + 互斥 10 组 + 冻结 t1-t2-t3 + 三套预设）。
> 纪律：**只走 6 接口，不改 `PolicySystem` 内部**（防踩坑 #13）；效果参数名固定（mult/bias/switch），新卡只进 `policies.json`。

## 一、输入与候选集接口（6 接口 × 现有实现映射）

| 架构接口 | 现有实现（PolicySystem.cs） | 用途 |
|---|---|---|
| `getPolicyCandidates(f)` | `AllCards` + `IsUnlocked` + `SlotCapacity`/`IsFrozen` + `Validate` | 可装池过滤 |
| `getPolicyState(f)` | `StateOf` + `Equipped` + `SlotUnlockTurn` + `CostPerCard` | 槽/冻结/财 |
| `previewPolicyPlan(f, plan)` | `Validate`（合法性+净费用）+ **Mods diff**（§三.1，P2 加纯函数包装） | 收益评估 |
| `commitPolicyPlan(f, plan)` | `Confirm` | 批量提交 |
| `grantPolicyCard(f, cardId)` | `UnlockCard`（外交发卡=强制卡入口） | 事件/外交联动 |
| `addSlot(f, attr, n)` | `GrantSlot`（典藏/事件加槽） | 槽扩展 |

**候选方案集**：合法方案 = 每槽（军/经/文/外/通，槽色=卡色）从可装池选卡组合，满足互斥组（Validate 拒非法）+ 槽容量 + 冻结约束。AI 评估的是**整槽方案 diff**（装/换/卸混合），不是单卡孤立评估——卸卡损失与换卡收益在 diff 里自动对冲。

## 二、评估触发：变动因子 `policyPressure`（方案 A，采用）

```
每回合（每阵营）:
  pressure += Δ_base × (1 + 灵活度) + 事件加权
  灵活度 = clamp(temperature × 2, 0.5, 1.5)        ← 人格温度即开放度（既有 aiPersonality.temperature 0.25~0.45）
  事件加权（一次性脉冲 + 底座）:
    宣战       脉冲 +0.15 ∧ 底座 max(pressure, 0.8)
    被制裁     脉冲 +0.20 ∧ 底座 max(pressure, 0.8)
    UN 选举    脉冲 +0.10
    主路径变化 脉冲 +0.30
    强制卡送达 脉冲 +0.50 ∧ 立即评估（当回合追加一拍）
  掷骰: p(评估) = pressure（≤1.0）
  评估后: 执行变动 → pressure = 0（参数 resetTo）；未变动 → pressure ×= 0.5
  强制: pressure ≥ 1 → 必评估（长期必决策）
约束: 单回合评估 ≤1 次（强制卡拍除外）；变动只受财/槽冻结/互斥约束，无低频硬上限（院长裁）
```

- **方案 B（对照）**：`policyEvalMode:'fixed'` 每 N 回合必评一次（N=10/20 两档）；机制同上但跳过压力锅。
- **事件底座 `eventFloor`(0.8)**：保证宣战/制裁后 1~2 回合内必评估 → 满足开题"≤5 回合出现对应卡"验收（纯脉冲 0.15/0.20 从零起需 7~10 回合，不达标）。
- 教学局：CN 为玩家手操不跑本线；AI 对手默认 `pressure` 模式。

## 三、效用公式（方案内择优，方案间比较）

### 3.1 预览增益 `gain(plan)`——复用 `previewPolicyPlan` 的数值 diff

```
gain(plan) = Σ_f w_f × impact_f
  impact_f（按字段型制）:
    mult 型  : Δmult × 载体规模_f          （如 TaxIncomeMult +0.1 × 净财/回）
    bias 型  : Δbias × w_f                 （如 LoyaltyPerTurn 直接按当量）
    switch 型: 固定当量（InternetDisabled 等按开关价值表）
  载体规模_f = 对应结算线每回合产出（净财/消费池/文化产出/科技产出/粮/军备产能…，读阵营结算快照）
```

- diff 计算：`Mods(现装) vs Mods(方案后)` —— P2 在 `PolicySystem` 外加纯函数 `PreviewMods(s, factionId, desired)`（复用 `Mods` 聚合逻辑、不落状态），**不改 PolicySystem 内部**。
- `w_f` 权重表见 §五（`modWeight.*`，约 30 个高频字段给权重，其余缺省 1.0）；权重单位=U 当量/单位产出，使政策增益可与建造/科技 U 同尺度比较（同一国家的行动取舍）。

### 3.2 方案 U

```
U(plan) = pathMatch(plan) × gain(plan) × 财约束(plan) − swapCost(plan) − freezeCost(plan) − risk(plan)
```

| 项 | 定义 |
|---|---|
| `pathMatch` | 方案卡色 × 主路径亲和：military→军卡 ×1.5；culture→文卡 ×1.5；economy→经卡 ×1.5；tech→通/经卡 ×1.3；非亲和 ×1.0；再乘 `pathBias[mainPath]` |
| `财约束` | 净费用 > 库财×`cashGuard`(0.5) → 方案剔除；否则 ×1.0（100 财/张已含在净费用） |
| `swapCost` | 新卡数 × `CostPerCard`(100) 折 U：`× A_cash`(0.01 财→U 系数，与 §3.1 载体规模同尺度) |
| `freezeCost` | 变动槽位冻结 `SlotUnlockDelay`(2) 回合 × `A_freeze`(2.0/回合) × 该槽紧迫度（战时军槽 ×2） |
| `risk` | 高危卡（宣战阈值降低/外交惩罚类）在 `caution` 高人格 ×(1+caution) 惩罚；被制裁中环保卡 ×1.3（UN 环保合作顺从） |
| **强制卡** | 送达即当回合评估；"接受履约/违约"二选一：`U(履约) = gain(卡) − 违约惩罚折算 × (1+caution)` vs `U(违约) = −违约代价`；违约细则归 B4.1 外交内容专题（挂账 #12），本线只留决策位 |

- **不装"什么都不换"**：`U(∅)=0` 是基线——所有方案与基线比，负增益自然不换（评估≠变动，院长裁）。

## 四、节拍与预算

| 节拍 | 动作 |
|---|---|
| 每回合 | pressure 累积 + 掷骰（≤1 次评估） |
| 评估拍 | 拉候选方案集（有界：每槽最多取 U 前 3 候选卡 → 组合 ≤ 3^5=243，实际受槽容量裁剪）→ 逐方案 preview → softmax 择优 → Confirm 或不动 |
| 性能预算 | 评估拍 ~243 方案 × Mods diff（~50 字段）≈ 12k 乘算/次，全 AI ≤500ms/回合预算内（裁点 7）；非评估拍零开销 |
| 日志量控制 | 只记"评估结果+变动"（开题验收），方案级 diff 明细 debug 级 |

## 五、参数表（`balance.json → ai.policy`，可缺省回退）

| 参数 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `policyEvalMode` | `'pressure'` | pressure/fixed | 两算法开关（v24 对照） |
| `pressureBase` | 0.03 | 0.01~0.08 | Δ_base：和平期 ≈3 回合 1 点压力（200 回合约 6~7 次评估） |
| `flexFromTemp` | 2.0 | 0~3 | 灵活度=temperature×系数 |
| `eventPulse.war/sanction/unElection/pathChange/mandate` | 0.15/0.20/0.10/0.30/0.50 | — | 事件脉冲（开题给定值） |
| `eventFloor.war/sanction` | 0.8/0.8 | 0~1 | 事件压力底座 |
| `resetTo` | 0 | 0~0.2 | 变动后压力重置 |
| `coolFactor` | 0.5 | 0.3~0.7 | 评估未变动衰减 |
| `fixedN` | 10 | 5~20 | fixed 模式周期（对照 N=10/20） |
| `cashGuard` | 0.5 | 0.3~0.8 | 净费用/库财上限 |
| `A_cash` | 0.01 | — | 财→U 折算系数 |
| `A_freeze` | 2.0 | 0~5 | 冻结回合成本 |
| `pathMult` | 1.5 | 1~2 | 主路径卡色加成 |
| `modWeight.*` | §3.1 | — | PolicyModifiers 字段权重（约 30 项，其余 1.0） |
| `topKPerSlot` | 3 | 2~4 | 评估拍每槽候选上限 |
| `mandateCaution` | 1.0 | — | 强制卡违约谨慎乘数 |

## 六、验收标准

| # | 指标 | 标准 |
|---|---|---|
| 1 | 频率合理 | 变动次数/100 回合 ∈ [1, 8]/阵营（不刷屏财不僵化；v24 实测标定带宽） |
| 2 | 财健康 | 政策财支出 ≤ 净财 5%（v23 无破产无失控保持） |
| 3 | 路径匹配 | 文化国文卡占比 ≥50%；军事国军卡 ≥40%（日志聚合） |
| 4 | 事件响应 | 宣战/被制裁后 ≤5 回合出现对应卡（`eventFloor` 保证） |
| 5 | 评估≠变动 | 存在"评估后不动"的日志样本（未变动 ×0.5 生效） |
| 6 | 两算法对照 | pressure vs fixed(N=10/20)：变动次数/政策财支出/路径匹配/响应延迟/同 seed 确定性五指标对照表（v24 必出） |
| 7 | 确定性 | 同 seed 两次变动序列一致（含 pressure 路径） |
| 8 | 兼容 | 旧档缺省 `policyPressure` 字段不崩（`state.ai` 可缺省） |

## 七、N 阵营裁剪

- 候选集/评估/压力锅零阵营特判（PolicySystem 本身 per-faction 无关）。
- 无外交局：强制卡/制裁事件缺席，机制自然降级；UN 选举项缺席。
- 2/4/7/8 阵营 smoke 必过；`policyEvalMode` 可 per-scenario 配置（教学局 AI 可切 fixed 便于讲解）。

## 八、Unity 落库对接（P2 · 黑机）

- `PolicyAI.cs`（`Scripts/L1/AI/`）：只调 6 接口映射的方法（§一表）；`PreviewMods` 纯函数包装随本线落库。
- 存档：`state.ai.policyPressure`（double，可缺省=0）；评估节拍无跨回合状态。
- 临时政策面板（IMGUI）已落（11-17），正式 UI 五槽红黄紫绿白与 AI 无关（UI 规格 B3/挂账 #8）。
- 外交发卡联动：`grantPolicyCard` 由外交线调用后本线当回合强制评估（事件钩子）。

## 九、v24 模拟映射（B2 接口约定）

- sim 侧政策结算已按 v23 口径（50 卡/互斥/冻结/预设）；v24 增补决策层：`D.ai.policy` 参数块 + pressure 锅 + 方案评估（方案集用 v23 卡效果聚合式近似，与 Unity `Mods` 字段同名同义）。
- **两算法对照在 v24 必跑**（指标 §六.6），报告单列对照表。
- 教学局 CN 前 10 回合和平验收不受政策线影响（CN 玩家手操）。
