# 下一窗口任务清单（2026-11-24 交接）

> **AI 摘要**：本文件=换窗口后的**待办总表**。按"谁能做/前置条件/参考文档"分组；做完一项划掉并在 handoff/changelog 记一行。状态锚点：`docs/meta/docs-index.json`（台账）、`node sim/tools/doc-sync.js stale`（**当前 stale=0**）、`.ai/mechanical-sync-pending.md`（**69 篇语义待核**）。
> 用法：新窗口先读 `AGENTS.md` + `.ai/handoff.md` + 本文件；不要读本文件以外的旧交接。

## 一、白机任务（文档侧，可在当前环境做）

### 1.1 语义回写（✅ **2026-11-24 已完成：69 篇清零**）

> **结果**：`doc-sync stale` = 0、机械指针段 = 0、断链 = 0。
> **做法**：①修 `doc-sync` hash 三处污染（机械"生成"段未剔除 / `· 同步日期` 残留 / 连续空行）②`rebuild-changedat.js` 用 git 历史重建 changedAt（3m18s）③`old-terms-scan.js` + `outdated-terms.js`（18 条已裁变更点）扫描 69 篇：49 篇零命中直接删机械段、16 篇按裁定回写（52 张卡池/采配 D6/消费刺激删卡/抵抗删除/部队编制 D1）、其余历史注记判定保留。
> **纪律（新裁定落地时）**：先把变更点加进 `sim/data/outdated-terms.js` → 跑 `node sim/tools/old-terms-scan.js` → 按 hitA/hitB 处理 → `doc-sync stale` 验收。
> **注意**：词表只覆盖"已登记变更点"，是定位工具不是正确性证明；新增裁定必须扩词表。

| 工具 | 用途 |
|---|---|
| `node sim/tools/doc-sync.js scan/stale/gen/who` | 结构同步债（syncDate × 上游实质变更） |
| `node sim/tools/old-terms-scan.js` | 过时口径词扫描（语义失真定位） |
| `node sim/tools/semantic-audit.js` | 机械指针段分流（real/clear/unknown；未来再用 bulk-pointer 时复用） |
| `node sim/tools/rebuild-changedat.js [--write]` | 用 git 历史重建 changedAt（hash 判定被污染时） |

### 1.2 待确认的文档内矛盾（B/A 组发现，需判断）

| 项 | 位置 | 问题 |
|---|---|---|
| 政策卡内容专题 §十一 残留 | 已修（2026-11-24） | ~~遗产保护仍写 resistPub~~ → 已改为 culEnt |
| `数值公式总纲` 内部矛盾 | §2.3 "粮安 F 已删除" vs §3.5 "见 §2.3" | ✅ **已修（11-24 黑机）：§3.5 改为 ❌已删除 + 现行口径指针** |
| `间谍专题开题` 内部冲突 | §七④ 负伤 5 回合 vs §五/§十 8 回合 | ✅ **已裁（11-24）：统一 8 回合、医院减半→4**；§七④ 已改 |
| `maxWars` 事实不符 | AI战争细则 L95 | `ai.war.maxWars=1` 已落，但 sim D 块 `maxWarsPerFaction` 仍 2 → 需黑机统一 |
| `突袭士气 ±20` | 兵种数值表 | ✅ **已裁（11-24）：作废**；伏兵减士气 −15 **已裁保留**（见 §三 #4） |

### 1.3 百科（进度：11 词条全部 11-24 已同步；剩概念化改造）

- **11 篇词条游戏概念化改造**（玩家视角重写，模板见 [百科 README §二](file:///D:/product/AGW/docs/08-百科/README.md)）——节奏待院长点单。
- 百科数值段数据源化：等黑机 `tools/wiki/build_wiki.py` 扩展。

## 二、黑机任务（Unity/代码侧）

| # | 任务 | 前置/参考 | 优先级 |
|:--:|---|---|:--:|
| 1 | **`policies.json` 52 张落库**（初始 50 + 特殊 2，统一结构 `initial/acquire`；数值 v1.2 定版） | 数据源=`sim/data/cards.js`；内容专题 v3.0 §10/§12.4 | **最高**（政策卡唯一未落库项） |
| 2 | **复苏副本定稿**（空城占领/爆铺刹车/21 将池） | [游戏模式与副本规划](../06-设计/00-总纲/游戏模式与副本规划.md) §复苏；`sim/data/scenarios.js` 已留空城数据 | **高**（模拟基座阻塞） |
| 3 | L3 M1 施工（BattleSimManager+30Hz tick+命令流+4060 压测） | [L3战斗层开题](../06-设计/04-军事/L3战斗层开题.md) v0.3（D1~D14/E1~E10） | 高 |
| 4 | 事件卡落库（events.json 3 卡 + EventSystem + 卡面 UI） | [事件卡专题](../06-设计/06-事件/事件卡专题.md) v1.0 | 中 |
| 5 | `balance.json` 同步抵抗参数删除 | ✓ `cultureResistanceCap/resistPub/resistTour/resistEnt` 全删；`P[B→B]=√Culture_B` | **高**（与白机已对齐） |
| 6 | 21 将火柴人建模（1 基底 + 装饰件） | [武将3D形象-火柴人方案](../07-美术/武将3D形象-火柴人方案.md) | 中 |
| 7 | `maxWarsPerFaction` sim=2 → 1 统一 | AI战争细则 L95 已标 | 低 |
| 8 | 96draft 余 6 draft（L3 五卡+公园） | 随 L3/空军/海军 | 低 |

## 三、院长待裁（阻塞项）

| # | 事项 | 影响 |
|:--:|---|---|
| 1 | `self` 是否算"抵抗概念"（已定为言论管制专属特殊乘区，**已按此落**） | ✅ 已落，无需再裁 |
| 2 | ~~间谍负伤 5 vs 8 回合~~ | ✅ **11-24 已裁：统一 8 回合可解，医院减半→4**（`spyWoundTurns=8`） |
| 3 | ~~突袭士气 ±20 是否随 L3 D8 作废~~ | ✅ **11-24 已裁：作废**（只留突袭 ×1.20 乘区） |
| 4 | ~~伏兵减士气 −15 是否作废~~ | ✅ **11-24 已裁：保留**（伏兵攻击减士气） |
| 5 | 百科口径 | ✅ **已定：数据类词条按同步纪律随裁定即时更新（`doc-sync stale` 机器强制）；游戏内图鉴 UI=待排期（等 UI 专题/手绘稿）** |
| 6 | 政策卡机制存废 | ✅ **11-24 已裁：保留**（52 张定版；国策事件化方案留档不采用） |

> 当前无阻塞性待裁项。设计层余项：L3 战斗数值初值待黑机、图鉴排期；`serviceRatio*` 已由黑机定值（5%/8%/10%，未冻结可调）。

## 四、快速验证命令（新窗口起手自检）

```bash
cd "D:\product\AGW"
node sim/tools/doc-sync.js scan          # 全景：245 文档/断链/stale
node sim/tools/doc-sync.js stale         # 同步债清单（按落后天数）
node sim/tools/doc-sync.js who <文件>     # 改前查影响面
node sim/v26/policy.js 200 1             # 教学盘（历史口径）
node sim/v26/policy.js 200 1 --scenario=revival   # 复苏盘（基础版，待定稿）
```

## 五、已知的坑（新窗口必读）

1. **模拟暂停**：全量模拟等复苏副本定稿（院长 11-24 第 2 条）；复苏盘目前只是基础版。
2. **抵抗已删**：文化公式 `P[B→B]=√Culture_B`；不要再写 resistance/resistPub；`self` 仅言论管制。
3. **写死阵营/城市数 = 违规**（AGENTS §七.1）；已修 `makeDiplo` 一处，新代码注意。
4. **doc-sync 判定用内容哈希**：批量改 syncDate 不产生假 stale；但**改动正文会让下游级联 stale**（正常，属下一批）。
5. **模拟报告永不回改**：口径变→出新报告（v27），不修旧报告数字。
6. **政策卡数值唯一源=`sim/data/cards.js`**；改值只改 1 行；内容专题卡表只是设计意图说明。
7. **文档头部状态/「待裁」字样 ≠ 当前事实**：盘点"未讨论/待裁"必须以 [索引-决策](../docs/06-设计/00-总纲/索引-决策.md) 与 AGENTS 的最新裁定为准，禁止直接采信文档里的"待裁/待定/待填"关键词（多为历史写作文本或拆分模板残留）。**反面案例（2026-11-24 白机）**：曾把 L2 3D 建模（11-12 已定）、政策卡保留（11-24 已定）、红灯区/起义叛乱（已定版/作废留档）、21 将档案（✅ 定稿）误报为"未讨论"。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | **语义回写完成版**：§1.1 更新为已完成 + 工具链四条（doc-sync/semantic-audit/old-terms-scan/rebuild-changedat）；mechanical-sync-pending 归档 |
| 2026-11-24 | 首版：白机 stale 46 篇分组 + 5 项待确认矛盾 + 黑机 8 项 + 院长待裁 5 项 + 验证命令 + 6 条坑 |
