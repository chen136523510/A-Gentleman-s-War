# AI 建造细则（BuildAI · 五线细则 2/4 · 2026-11-18）

> 定位：[AI 决策专题开题](./AI决策专题开题.md) v0.3 §4.1 的施工细则（白机 P1 移交黑机执行）。 · 同步日期：**2026-11-24**（11-24 回写：政策卡 52 张定版 + v26 复苏盘单城国收入结构/建造护栏，补权威源指针并标注教学盘口径）
> 依据：[建造角色表](../../04-技术笔记/建造角色表-2026-11-18.md)（145 卡 `role[]` 13 需求词表，数据权威=`buildings.json`）· sim v20/v21 已验证方向（需求驱动/维护预算 75%/六倾向）。
> 替换对象：sim `aiBuild()` 规则式 IF 链（v22 full.js:230）与 Unity 侧占位建造逻辑；**骨架六步不变，只换候选集与效用**。

## ⚠ 权威源指针（2026-11-24 回写）

> 本文是 BuildAI 的施工细则；以下事实以对应权威源为准（本文旧口径不删除，只在行末标注）。

| 本文涉及内容 | 现行权威源 | 本文旧口径处置 |
|---|---|---|
| 建筑卡 role[]/字段/145 卡 | [建造角色表](../../04-技术笔记/建造角色表-2026-11-18.md) + 黑机 `buildings.json` | 仍有效 |
| 政策卡对建造的乘区 | [政策卡内容专题](./政策卡内容专题.md) v3.0 §12.4（52 张；如基建狂魔 cost×0.9、私有化 comm×1.15、国有化 fisc×1.07） | 本文需求/效用式不变；乘区以卡表为准，不在本文重定义 |
| 全量模拟基线（复苏副本） | `sim/data/scenarios.js`（`revival`：8 阵营各 1 城+6 空城/最小建筑/起步国库 **30000**；单城税约 **880/回**、消费池 2400 **需商业建筑变现**）+ [索引-决策](./索引-决策.md) 2026-11-24「模拟」行 | §七 验收"t200 总建筑 ≥300"为教学盘 14 城口径，复苏盘不适用（见行末 ❌ 标注） |
| 建造预算护栏 | `sim/v26/policy.js`（`buildReserve` 实测无效：阻断商业建筑→消费池无法变现→国库更差；保留开关）+ 本文 §三 `maintBudget` 75% 硬约束 | §三 maintBudget 仍有效；buildReserve 是复苏盘新增护栏，实测结论按脚本注释 |
| 开题/落库状态 | [AI决策专题开题](./AI决策专题开题.md)（P2 Unity 落库 2026-11-20：`BuildAI.cs` 等 21 绿） | 仍有效 |

## 一、输入与候选集接口

| 输入 | 来源 | 用途 |
|---|---|---|
| 建筑卡（145 张：role/maintenance/buildCostWealth/buildCostProduction/buildTurns/产出字段/upgradeOf/maxPerCity/status/requiresTech） | `buildings.json` | 候选集+贡献度 |
| 城状态（人口/住房容量/粮电供需/就业/消费三池/治安医疗覆盖/文化产出/污染） | 城结算（既有） | 需求表 |
| 阵营（mainPath/pathBias/aiPersonality/treasury/净收入/科技） | 感知步（骨架①） | 权重+约束 |
| 科技 `f.Techs` | 科技线（细则 1/4） | requiresTech 校验 |

**候选集**（每城每回合）：
```
cand(city, f) = { card ∈ buildings.json |
  card.status != "draft"                          ← draft 三态，不可建（防踩坑 #1）
  ∧ (card.requiresTech ∈ f.Techs 或缺省)          ← 科技解锁（本线为 requiresTech 首个消费点，B6#3 修复生效）
  ∧ card.upgradeOf 链不可跳级                      ← 升级走 upgradeOf 链逐级
  ∧ 同 id 城内数 < maxPerCity（缺省=不限）
  ∧ 城内总数 < cityCap(40)
  ∧ 建造队列余量 > 0 ∧ 财/生产首付可付
}
```
- **每城每回合 1 座**（`builtThisTurn` 既有）；**队列上限 8**（11-05 多队列制 v2，工程也占 1 条）。
- 铁律：**升级不变占地、不可跳级**（既有）；开局每城 1 学校由需求表保底项实现（见 §三.2），不再写 IF 特例。

## 二、需求表（每城每回合重算，13 项）

每项输出归一化缺口 `gap_r ∈ [0,1] = clamp((需求 − 供给)/需求, 0, 1)`；需求/目标值全部参数化（§六 `demand.*`）：

| role | 需求口径 | 供给口径 | 生存级 |
|---|---|---|---|
| food | 人口粮耗×(1+缓冲 20%) | 粮产出 | ★ |
| power | 建筑耗电+人口电 | 发电量 | ★ |
| housing | 人口×(1+增长余量 15%) | 住房容量 | ★ |
| wealth | 净收入<安全线时的缺口 | 财产出/维护差 | — |
| security | 人口/警力覆盖比目标 | 治安产出 | — |
| medical | 人口/医疗覆盖比目标 | 医疗产出 | — |
| science | 学院链拉力（主线 tech/工程冲刺=高，其他保底 1 学院） | 科技产出 | — |
| culture | 文化路径=持续拉满；其他=保底（1 博物馆当量） | 文化产出 | — |
| jobs | 劳动人口×目标就业率 45% | 岗位产出 | — |
| consumption | 消费三池（零售/娱乐/文旅）目标占比 | 三池供给 | — |
| military | 兵工厂需求（科技 5/15/25→1/2/3）+战时机场/防空/兵营 | 军事建筑数 | 战时★ |
| greenPower | 绿能占比目标（环保政策/UN 合作加权） | 水电+风光电 | — |
| environment | 污染治理缺口（SO₂/碳/污水当量） | 治理产出 | — |

- 需求函数只读城/阵营结算状态，**不做阵营 IF**；"文化路径拉满/军事路径军备"由 `gap` 目标值 + §三.2 路径权重表达（A1.6 既有口径参数化）。
- 生存级（★）项 `gap>0` 时优先权压制其他项（§三.2 权重 2.0），且允许突破维护预算至 `surviveBudget`。

## 三、效用公式

```
U(card, city) = Σ_r gapWeight_r × gap_r × contrib(card, r) × W_path × δ^m(card)
              − A_maint × maintRatio(card)        ← 维护压力
              − A_turns × card.buildTurns × 0.1   ← 工期机会成本
```

| 项 | 定义 |
|---|---|
| `contrib(card, r)` | 卡对需求 r 的贡献 = role 映射的产出字段值 / 该需求当前总需求（如 power 卡 `powerGen/总耗电`）；多 role 卡各取各的贡献（商业中心=wealth+jobs+consumption 三项各算） |
| `role→产出字段` | food→food/feedBonus；wealth→wealth；power→powerGen；housing→capacity；security→security；medical→medical/servicePopulation；science→science；culture→culture；jobs→jobs；consumption→poolClass/poolRecovery/entertainment；military→defense/tags.military；greenPower→powerGen∧绿能 tags；environment→pollution<0 取绝对值 |
| `W_path` | `pathRoleBias[mainPath][role]`：主路径相关 role ×1.5，其余 1.0（culture→culture/consumption；military→military；tech→science；economy→wealth/consumption），再乘 `pathBias[mainPath]` |
| `δ^m` | **边际递减**：同 role 已有 m 座 ×`decaySameRole^m`；同 id 已有 n 座再 ×`decaySameId^n`（防堆同类） |
| `maintRatio` | `card.maintenance / max(1, 净收入)`；**硬约束**：装上后全城总维护 ≤`maintBudget`(0.75)×净收入（v20 已验证），超则候选剔除——生存项放宽到 `surviveBudget`(0.9) |
| 财约束 | 首付不可付 → 候选剔除（`buildCostWealth` 首付比例沿用既有支付模型） |

- **掷骰**：`p = softmax(U/T)`，`T = aiPersonality.temperature × tempBase`（同科技线）。
- 升级候选（upgradeOf 链下一级）与新卡同公式；升级贡献按**增量产出**计算，占地不变天然占优（铁律表达，无需加成项）。

## 四、节拍与预算

| 节拍 | 动作 |
|---|---|
| 每城每回合 | 重算需求表 → 拉候选 → 打分 → softmax 选 1 执行（含"不建"选项：最高 U 低于阈值 `idleFloor` 时不建，防景气和乱建） |
| 队列结算 | 既有建造系统扣首付/生产银行；完工入城 |
| 性能预算 | 13 项需求 × ~145 卡每城每回合 ≈ 2k 次乘算，**≤10ms/阵营**（4 城×40 卡实际更少；裁点 7 从宽内） |

## 五、U 分解日志（骨架⑥）

```
{ turn, faction, city, event:"build.pick",
  pick: {id, cost:{wealth,production}, turns},
  U: { gaps:{r: gap×w 简表}, pathW, decay, maint, turnsTerm },
  p, alt: [ {id, U, p} ×3 ],
  city: { pop, housingFill, powerFill, foodFill, netIncome } }
```

- 验收"四国建筑谱系"即由日志聚合：同 seed 报告输出各阵营 role 构成占比表。

## 六、参数表（`balance.json → ai.build`，可缺省回退）

| 参数 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `gapWeight.food/power/housing` | 2.0 | — | 生存级 |
| `gapWeight.security/medical` | 1.5 | — | 基础民生 |
| `gapWeight.wealth/jobs/consumption/military` | 1.2 | — | 经济/军备（战时 military ×1.7） |
| `gapWeight.science/culture/environment` | 1.0 | — | 发展 |
| `gapWeight.greenPower` | 0.8 | — | 绿能 |
| `decaySameRole` | 0.9 | 0.8~0.95 | 同 role 递减 |
| `decaySameId` | 0.7 | 0.5~0.9 | 同 id 递减 |
| `pathRoleMult` | 1.5 | 1.0~2.5 | 主路径 role 加成 |
| `maintBudget` | 0.75 | 0.5~0.9 | 维护预算=净收入比（v20 已验证值） |
| `surviveBudget` | 0.9 | — | 生存项放宽线 |
| `maintPenalty` | 5.0 | — | A_maint |
| `turnsPenalty` | 0.3 | — | A_turns |
| `idleFloor` | 0.5 | 0~2 | "不建"阈值 |
| `queueMax` | 8 | — | 城建造队列上限 |
| `cityCap` | 40 | — | 每城建筑总数上限 |
| `demand.*` | §二表 | — | 13 项需求目标值（就业率 45%/缓冲 20%/增长余量 15%/消费池占比等） |
| `tempBase` | 1.0 | 同科技线 | softmax 温度基数 |

- 禁内联魔法数（防踩坑 #4）；sim v24 `D.ai.build` 同名同值。

## 七、验收标准

| # | 指标 | 标准 |
|---|---|---|
| 1 | 建造量 | t200 总建筑 ≥300（v20 常态 375~429；开题 §4.1） ❌**已被 2026-11-24 裁定覆盖：全量模拟基座=复苏副本（8 阵营单城+6 空城）——此指标为教学盘 14 城口径，复苏盘不适用（目标值待 v27 标定）** |
| 2 | 无破产 | 全程 `treasury > 0`（维护预算硬约束生效） |
| 3 | 谱系分化 | 文化国 pub/tour/ent 类占比显著高；军事国 arsenal/airport/aaGun 先行；日志聚合表可查 |
| 4 | 生存优先 | 粮/电/住房缺口期不建文化娱乐卡（gap 权重压制，抽样日志验证） |
| 5 | 铁律 | 升级不占新地、无跳级；draft 卡零动工 |
| 6 | 教学局 | 默认 CN 前 10 回合：生存链+每城 1 学校，无军备扩张 |
| 7 | 确定性/性能 | 同 seed 建造序列一致；≤10ms/阵营/回合 |

## 八、N 阵营裁剪

- 需求表/公式/打分零阵营特判；候选集由 buildings.json 数据决定（剧本可裁卡）。
- 单城国=需求集中单一城，公式不变；7/8 阵营多小国各自独立评估，无跨城调配（一期口径）。 ❌**已被 2026-11-24 裁定覆盖：单城国=复苏副本基线（8 阵营各 1 城），不再是小众裁剪；需求目标值待 v27 标定**
- 2/4/7/8 阵营 smoke 必过。

## 九、Unity 落库对接（P2 · 黑机）

- `BuildAI.cs`（`Scripts/L1/AI/`）：消费 `buildings.json` role/产出字段/maintenance/upgradeOf/requiresTech；对接 `ConstructionSystem` 队列接口（8 队列）。
- `requiresTech` 校验在本线生效（B6#3 修复后的首个消费点；引擎校验器后续可复用同一判断）。
- 教学局开局建造覆写走 `ScenarioDefinition/TutorialDefinition`（数据，不改本线代码）。

## 十、v24 模拟映射（B2 接口约定）

- sim `aiBuild()` 整体替换为 U 驱动；卡集从 v22 缩略 B 表（~20 类）**升级为卡级映射**：`D.buildCards` 内嵌关键卡（role/成本/维护/工期/产出当量，源自 buildings.json 提取脚本，role 词表与 13 需求一致），sim 不直接读 JSON 文件（自包含惯例）。
- 支付模型沿用 sim 既有（首付 10% + 生产银行 /5）；`totalB<40` 对应 `cityCap`。
- 消费池/文化/绿能结算公式不动（执行层既有）；只换"建什么"的决策层。
