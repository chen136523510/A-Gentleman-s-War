# AI 科技细则（TechAI · 五线细则 1/4 · 2026-11-18）

> 定位：[AI 决策专题开题](./AI决策专题开题.md) v0.3 §4.2 的施工细则（白机 P1 移交黑机执行，B组交接单 §二）。
> 依据：裁点 2（逐节点效用，"有倾向不一条路走到黑"）· [科技节点收益标签表](../03-内政/科技节点收益标签表-2026-11-18.md)（打分标签权威）· `tech.json`（引擎数值权威）· `officers.json aiPersonality`（人格权威）。
> **B6#1 口径（✅ 11-20 落库，A 案条件已达成）**：`tech.json` 已 **40 节点**（含 `grn2b/grn2c`，11-20）；本细则公式不变，sim v24 按 38 归一化（只读基线），Unity 按 40 实跑。

## 一、输入与候选集接口

| 输入 | 来源 | 用途 |
|---|---|---|
| 节点表（40 节点：id/name/line/era/prereq） | `tech.json` | 候选集+成本 |
| 成本公式 `2000×(1+0.15×已研总数)×eraMult[era]` | `tech.json` costBase/costGrowth/eraMult | 成本项 |
| 节点收益标签（类型+幅度） | [40 节点收益标签表](../03-内政/科技节点收益标签表-2026-11-18.md) §二~四 | 收益当量 |
| 人格（`temperature`/`pathBias`/`tech` 倾向） | `officers.json aiPersonality`（挂大统领） | 路径权重+温度 |
| 主路径 `mainPath`（military/culture/tech/economy，每 10 回合重算） | 既有 A1.6 | 线权重 |
| 局势（atWar/被制裁/环境/资源短缺） | 感知步（骨架①） | 局势修正 |
| 研速 `SciencePerTurn`（学院链+政策+乘区） | `FactionState` | 成本→回合折算 |

**候选集**：`cand(f) = { n ∈ tech.nodes | !n.Disabled ∧ ¬f.Techs.Contains(n.Id) ∧ prereq⊂f.Techs }`
- 剧本 `TechTreeOverrides.Disabled` 节点剔除（教学局可裁线）；N 阵营无特判（候选集天然与阵营数无关）。
- **同时 1 节点**（科技树规则，既有）；换线无损耗（既有）。

## 二、效用公式

```
U(n) = W(n.line) × B(n) × δ^k(n.line)        ← 路径权重 × 收益当量 × 同线边际递减
     + A_prereq × (|children(n)| + 0.3 × |children²(n)|)   ← 前置完成度奖励（开枝价值）
     − A_cost × T(n)                          ← 成本压力：T(n) = TechCost / max(1, SciencePerTurn)
     + S(n.line, 局势)                        ← 局势修正（加法，只对收益当量达标节点）
```

| 项 | 定义 | 说明 |
|---|---|---|
| `B(n)` | `类型分 × 幅度系数`（见 §二.1 打分表） | 收益当量，程序化映射自标签表 |
| `W(n.line)` | `pathLineBias[mainPath][line] × pathBias[mainPath]` | 人格放大主力线（§二.2） |
| `δ^k` | 同线已研 k 个节点 → ×`decay^k` | **四机制①**边际递减 |
| 前置奖励 | 直接后继数 + 0.3×二阶后继数 | **四机制②**跨线前置由树结构自带，此项鼓励开枝 |
| `S(...)` | 战争→mil / 制裁→ai / 环境→grn / 资源短缺→对应链 | **四机制④**局势修正（§二.3） |

**四机制③工程入场券**不进 `U_node`，由 §四工程冲刺单独评估（入场券=该线全研+他线各≥4，树规则既有）。

### 2.1 收益当量打分表（`ai.tech.typeScore`）

| 类型 | 分 | 类型 | 分 | 类型 | 分 |
|---|---|---|---|---|---|
| qTech | 10 | unlock | 8 | mult | 7 |
| power | 6 | special | 6 | combat | 6 |
| jobs | 5 | defense | 5 | vision | 4 |
| prereq | 3 | | | | |

- **幅度系数**：效果幅度 ≥25% → ×1.5；10~25% → ×1.2；<10% → ×1.0；多类型节点取 Σ。
- 映射源=标签表"收益类型/收益值"两列；实现时程序化生成（`tech.json` 节点 × 标签表查表），不手抄 38 行。
- 负向效果（如 `ai3` 岗位×0.70、`ai10` 岗位−800）按净效应计负分项，不单列。
- 节点解锁的建筑/单位（unlock 类）收益随目标建筑价值浮动：粗口径=解锁分 8 固定 + 该建筑在建造 AI 需求表中的角色权重 ×2（二期精细化，一期固定 8）。

### 2.2 主路径 × 线权重 `pathLineBias[mainPath][mil/ai/grn]`（默认值，v24 标定）

| mainPath | mil | ai | grn | 说明 |
|---|---|---|---|---|
| military | 1.6 | 0.8 | 0.7 | 红线优先；核链（mil4→grn6→mil9）由树前置自然拉动 |
| tech（工程） | 1.0 | 1.2 | 1.0 | 三线均摊，入场券主导 |
| economy | 0.6 | 1.5 | 0.9 | ai 线=工业化/互联网/智能交通 |
| culture | 0.5 | 1.0 | 1.2 | grn 线=化肥/糖茶卷烟消费品链 |

- 再乘 `aiPersonality.pathBias[mainPath]`（既有，0.3~1.8）——同路径不同人格仍分化。

### 2.3 局势修正 `S`（参数见 §六）

| 局势 | 触发条件 | 加成对象 |
|---|---|---|
| 战争中 | `atWar` | mil 线 +situWar |
| 被制裁 | 存在对本制裁 | ai 线 +situSanction |
| 环境危机 | `envTemp>50` 或 SO₂/酸雨超标 | grn 线 +situEnv |
| 缺油 | 石油产出<消耗 | grn2 及其链 +situResource |
| 缺铀 | 铀产出<消耗且核依赖 | grn6/7 链 +situResource×0.7 |

### 2.4 掷骰（骨架⑤）

- `p(n) = softmax(U(n) / T)`；`T = aiPersonality.temperature × tempBase`（人格既有 temperature 0.25~0.45）。
- 同 seed RNG 派生（骨架⑤既有口径）；softmax 保底：`U` 最高者 `p ≥ 0.5` 时不强制（随机是性格的表达）。

## 三、节奏与行动预算

| 节拍 | 触发 | 动作 |
|---|---|---|
| 节点完成 | 结算步检测 `Science ≥ TechCost` | 扣费入 `f.Techs` → **立即重评**选下一节点 |
| 换线检查 | 每 `reevalEvery`(5) 回合 | 全候选重评（换线无损耗，softmax 自然换线，无额外惩罚） |
| 工程评估 | 与换线检查同拍 | §四 |
| 性能预算 | — | 科技线重评 O(38) 极廉价，**≤5ms/阵营/回合**（开题裁点 7 从宽口径内） |

- Science 进度条：节点部分付款不累积（扣费制，现行引擎口径 `f.Science` 库存扣减）；换线=已付库存保留（Science 是资源不是进度）。

## 四、工程冲刺（3 终极工程）

- **触发**：换线检查同拍；入场券（本线全研+他线各≥4）满足才进入评估。
- `U_工程 = V_win × pathBias[mainPath] × 领先修正 − A_cost × T_工程`
  - `T_工程 = projProd / max(1, 本城生产速度) + projCost / max(1, 净财/回)`（机会成本折回合）
  - **领先修正**：领先最快对手 ≥`leadGap`(8) 节点 → ×`leadRatio`(1.5) 加急；落后（同口径落后）→ ×`lagFactor`(0.3) 放弃，转点他线等入场券。
  - `V_win`(40)：建成即科技胜利的 U 当量（一期能接受"AI 会冲工程"，不设神秘化门槛）。
- **冲刺期节点配合**：入场券差什么补什么（如他线差 1 节点 → 该节点 U 强制置顶，实现为 `S` 加成复用：`ticketGapBonus`）；本线已全研则不选本线节点。
- **验收挂钩**：科技胜利 ≥1 次/5 seed（v21 缺口，开题 §二）。

## 五、U 分解日志（骨架⑥记账）

每次重评输出一条（`DecisionLog`，debug 级全量 / 战报级只记 pick）：

```
{ turn, faction, event:"tech.pick",
  pick: {id, name, line, era, cost},
  U: { benefit, pathW, decayK, prereqBonus, costTerm, situ },
  p, alt: [ {id, U, p} × 前三 ],
  state: { done, total, sciencePerTurn } }
```

- 玩家可见口径（政策/战报面板二期接）："AI 研 X 因为：主力路径权重 1.5 × 军线收益 12 − 成本 6 + 战争修正 3"。
- 教学局默认关 debug 级（日志量控制，政策线同口径）。

## 六、参数表（`balance.json → ai.tech`，全部可缺省回退=默认值）

| 参数 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `decay` | 0.85 | 0.8~0.95 | 同线边际递减 δ（四机制①，v24 首标定项） |
| `tempBase` | 1.0 | 0.5~2.0 | softmax 温度基数（×人格 temperature） |
| `prereqBonus` | 2.0 | 0~5 | 每直接后继奖励 |
| `secondPrereqRatio` | 0.3 | 0~1 | 二阶后继折扣 |
| `costPerTurn` | 1.5 | 0.5~3 | 每预期研造回合的成本压力 A_cost |
| `typeScore.*` | §2.1 表 | — | 类型分 |
| `pathLineBias.*` | §2.2 表 | — | 主路径×线权重 |
| `situWar` | 3.0 | 0~10 | 战争→mil |
| `situSanction` | 3.0 | 0~10 | 制裁→ai |
| `situEnv` | 2.0 | 0~10 | 环境→grn |
| `situResource` | 3.0 | 0~10 | 资源短缺→对应链 |
| `ticketGapBonus` | 4.0 | 0~10 | 入场券缺口节点置顶加成 |
| `reevalEvery` | 5 | 3~10 | 换线/工程检查周期 |
| `winValue` | 40 | 10~100 | 工程胜利 U 当量 |
| `leadGap` | 8 | 4~15 | 领先判定节点差 |
| `leadRatio` | 1.5 | 1~3 | 领先加急 |
| `lagFactor` | 0.3 | 0~1 | 落后放弃乘数 |
| `projCost/projProd` | 2000/2500 | — | 工程体量（读[科技树](../03-内政/科技树.md)口径，与建筑数值表同源） |

- **禁内联魔法数**（防踩坑 #4）：所有上表参数进 `balance.json ai.tech` 组；sim v24 用 `D.ai` 块同源同值。

## 七、验收标准（40 节点口径 · A 案，11-20 落库恢复）

| # | 指标 | 标准 |
|---|---|---|
| 1 | 确定性 | 同 seed 两次研究序列完全一致 |
| 2 | 研究量 | t200 平均 ≥**25/40**（A 案条件已达成：11-20 落库 40 节点；Unity 实测 t200=27/40；sim v22/v24 历史盘按 38 折算 ≥24/38，只读基线） |
| 3 | 科技胜利 | ≥1 次/5 seed（工程冲刺生效；v21 缺口补上） |
| 4 | 路径分化 | 四国前 10 节点序列 ≥3 种不同（softmax+人格差异） |
| 5 | 不一条路走到黑 | 任一 AI 前 20 节点中同线连续段 ≤6（decay 自然产生；不达标调 `decay`，不写 IF 限制） |
| 6 | 局势响应 | 被制裁后 ≤5 回合 ai 线 U 排名上升（日志可查） |
| 7 | 教学局 | 默认 CN 前 10 回合和平不因科技线破坏（软引导既有） |
| 8 | 性能 | ≤5ms/阵营/回合 |

## 八、N 阵营裁剪

- 候选集/公式/打分与阵营数无关；无任何 `factionId` 特判。
- 单城小国 SciencePerTurn 低 → `T(n)` 大自动排后，无需特判。
- 内战/无外交局：局势修正只剩 `situWar`；制裁/环境项按各自系统有无自然缺席。
- 剧本裁线：`Disabled` 节点剔除后公式不变；2/4/7/8 阵营 smoke 必过（开题 §八）。

## 九、Unity 落库对接（P2 · 黑机）

- `TechAI.cs`（`Assets/_Project/Scripts/L1/AI/`）替换 `GameState.TechTick` 占位选点（现行"最便宜优先 + ai1/grn1 硬编码先行"，GameState.cs:1159）。
  - 起手 ai1/grn1 不再硬编码：era1 节点成本最低+unlock 分，U 自然排前；教学局若需确定性开局，用 `TechTreeOverrides.CompletedNodes` 种子（既有接口）。
- `RecomputeTechQ`/`qTechBonus` 不改（qTechBonus 落数据后自然生效）。
- 存档：科技线零新增状态（决策是纯函数，`f.Techs` 已存）；`state.ai` 预留组不涉及本线。
- **日志**：`DecisionLog.cs` 静态开关（debug 级），输出走既有 `AddEventLog` 通道或独立 JSONL（P2 定）。

## 十、v24 模拟映射（B2 接口约定）

- sim 侧 `fac.tech` 标量（0~40 学院直增）→ **节点制**：已完成节点集合 + Science 收入按节点成本扣；每完成 1 节点 `fac.tech += 1`（下游 `tech>10`/`tech>25` 等条件全部兼容）。
- 学院链产出改挂 `SciencePerTurn`（研速），数值沿用 v22 学院链产出（0/10/16/24 不动，标定留 v24）。
- 节点成本按 `tech.json` 公式（2000×(1+0.15×已研)×eraMult）；**报告按 40 节点口径**（Unity 实跑）；sim v22/v24 历史盘注明按 38 归一化（只读基线）。
- 本细则所有参数进 `sim/v24/ai.js` 的 `D.ai.tech` 块，与 `balance.json ai.tech` 同名同值。
