# RTS 战斗层设计调研（红警 / 星际 / 魔兽3 / 三国志12）

> 调研时间：2026-11-22（信息时效以此为准）
> 调研人：AI（黑机调研工兵×2，主会话合并交叉验证）
> 背景：院长 2026-11-22 开启 L3 战斗层开发。AGW L3 口径=**实时演算（可暂停/缩略加速）、手动指挥与自动结算并存、禁用抽象战力比**；三国志12 为大参考（本游戏形态即仿三国志12），魔兽3 提供单位数值与手感基准，红警/星际提供操控与克制面基准。调研结果用于 L3 战斗层开题（`docs/06-设计/04-军事/`）。
> 关联文档：[军事专题开题](../06-设计/04-军事/军事专题开题.md) · [全量模拟-v22-B1战斗层验证](../06-设计/00-总纲/全量模拟-v22-B1战斗层验证.md) · sim/v22/full.js B1 段（兵种/counter/城防/战损已全量验证）

---

## 一、核心结论（先看这个）

1. **"克制做在伤害公式里"是四个系列的共同答案**：魔兽3=攻防类型系数矩阵+比例减伤公式；星际=尺寸修正+固定减伤（护甲每点减 1）；红警=弹头 Verses 百分比矩阵（RA2 11 类甲）。全部表驱动、可 JSON 冻结——与 AGW"禁抽象战力比、加数据不改规则"完全兼容（四源交叉）。
2. **命中口径两路线，AGW 取确定性**：SC1/BW 是真骰子（上坡 53.125%、常态 1/256 失手），SC2 彻底删骰改"视野门控"（有视野必中/无视野打不了）；C&C 系确定性（散布只偏弹着点）。AGW 可暂停+可复盘+教学剧本确定性 → **必中+明示例外**（两份独立调研同结论，交叉验证成立）。
3. **三国志12 会战制=AGW L3 形态先例**：双层制（经营图→会战图）、据点三件套（陣/城门/本阵+预备队）、士气→动摇→溃走→俘获链、采配+战法分档、**时间停止+倍速**。**证伪：三国志12 没有阵形选择**（那是三国志11 战棋），出阵只选兵科兵力。
4. **低微操的三层旋钮**（A 工兵设计推论，与 RTK12 部队级粒度互证）：①姿势档（默认 Guard+主动/守地/停火）②每单位一个手动副技能 ③全局暂停/调速；寻路、索敌（克制表驱动）、驻扎、老兵全部自动演算。
5. **RA2 Verses 的 0%/1%/负值语义**：克制表直接驱动自动索敌（0%=禁击目标不主动攻击）、"能否被某类技能作用"——AI 行为从克制表免费获得，无需另写目标评估。
6. **老兵两套精确公式**（RA2 两档：击毁价值>自身造价 3 倍晋升，+10%伤/+20%速/+50%甲；RA3 三档经验掉落=造价×段位倍率 2x/3x/4x——防刷兵+正反馈）。
7. **驻扎系统**（建筑替驻军承伤、血量阈值自动撤离）契合 AGW"城市底图独一无二+建筑通用套件"；**电力=防御硬闸门**（C&C 特有的经营→战斗耦合）。
8. **防误导清单**（调研中拦截）：SC2 5.0 "formation movement" 是触发器功能非对战默认；"SC2 4.10 移除盲射"为搜索摘要虚构；"RA2 伤害随机 50%~100%"无任何一手来源（四页引擎文档核查零结果）不采信。
9. **共同警示**：自动结算=同一套实时模拟跑 AI vs AI（RTK12 无跳过→战斗疲劳、AI 窝弓死守=纯状态机退化）；AI 出兵规则防反向套利（RTK12"你出多少 AI 出两倍"被 6000 破 10 万）。
10. ⏳→✅ 红警/星际半场已补齐（本版为合并终稿）。

## 二、《星际争霸》系列（SC1/BW → SC2）

### 2.1 单位与操控模型

**SC1/BW**【已确认·多源：TeamLiquid 编队讨论 / Reddit 开发者访谈 / Blizzard 论坛】
- 选择上限 12 单位、10 编队——**开发者证实是有意设计而非技术限制**；SC2 起取消上限。
- 指令集：Move/Stop/Attack(攻击移动)/Patrol/**Hold Position**/Gather/Return Cargo（[Liquipedia Shortcuts](https://liquipedia.net/starcraft/Shortcuts)）；**无姿势系统**——Hold 是唯一"不追击"手段，无法还击时站桩挨打。
- **阵型：完全没有**；编队移动一窝蜂，"坡口漩涡"（ramp vortex）被 Liquipedia 作为引擎级怪癖记载（[Game Mechanics and Glitches](https://liquipedia.net/starcraft/Game_Mechanics_and_Glitches)）。
- 寻路：格网式+大碰撞盒，"龙骑士之舞"（狭窄地形来回横跳）催生 BW 拉兵微操文化（[TeamLiquid 路径分析](https://tl.net/blogs/429573-broodwar-and-starcraft-2-pathing)）。

**SC2**：A* 全局寻路 + steering 局部避让（分离/滑动），几乎永不卡死——出处=SC2 首席工程师 James Anhalt GDC 演讲（[Reddit 转述](https://www.reddit.com/r/starcraft/comments/vld7v9/)、[GameDev.SE 印证](https://gamedev.stackexchange.com/questions/191954/)）。
- **阵型：对战默认无**；2020-07 5.0 补丁的 "formation movement" 是**触发器功能（仅自定义模式）**——官方原文核对（[SC2 5.0 Patch Notes](https://news.blizzard.com/en-us/article/23482838/starcraft-ii-5-0-patch-notes)）。

### 2.2 战斗数值结构

**SC1/BW**【已确认·一手：Liquipedia Damage】
- 伤害公式：命中判定 → 伤害 = (攻击力 − 目标护甲) × 尺寸修正；**护甲=每击固定减 1**。
- 类型克制表（3 战斗型+2 特殊型）：

| 伤害类型 | Small | Medium | Large/建筑 | 代表 |
|---|---|---|---|---|
| Normal | 100% | 100% | 100% | 枪兵/狂徒/近战全系 |
| Explosive | **50%** | **75%** | **100%** | 坦克/龙骑/刺蛇 |
| Concussive | **100%** | **50%** | **25%** | 火蝙蝠/雷车/幽灵 |
| Ability（技能） | 100% 且**无视护甲**（有目标限制） | | | 科学球/圣堂/蝎子 |

- Protoss 护盾吃全类型 100%（只被盾甲减免）；**多段攻击每段独立结算护甲**（狂徒 2×8——升满甲对连击武器的超额收益是设计副作用）；溅射径向衰减 100/50/25 且**友军会被敌方溅射波及**；**最低伤害 0.5**（防绝对肉盾）；恢复三家不同（Zerg 自愈/Protoss 盾回/Terran 修车）。

**命中骰子（仅远程）**【已确认·引擎级数字】：上坡打无视野高地 **53.125%（136/256）**（社区误传 30%，Liquipedia 引 OpenBW 源码纠错）；掩体下同 53.125%；暗影 Swarm 下 **0%**；常态远程失手 **1/256**；近战上坡必中；对空永不 miss。

**SC2**【已确认·一手：Liquipedia Armor/Attributes】：护甲 1:1 固定减伤；**属性制**（每单位必属 Light/Armored 之一 + Biological/Mechanical/Psionic/Massive/Structure/Heroic 标签）；**武器加伤在护甲减伤前结算**；技能无视护甲；**属性门控技能**（修理只对 Mechanical 等）——克制不只在伤害，还在"能不能被这个技能碰"。**无命中骰子**。

### 2.3 地形/视野/高地

- SC1/BW：高地价值=低地吃 46.875% 失手骰+高地看低地；坡道=战术咽喉。
- SC2【已确认·一手：[High Ground and Low Ground](https://liquipedia.net/starcraft2/High_Ground_and_Low_Ground)】：**低地看不见高地；高地攻击"显示位置"≠可被攻击**（显示/暴露两级状态）；空中单位"直接作用于敌人"即暴露；**无命中率惩罚——有视野必中、无视野打不了**（运气→视野战）。"4.10 移除盲射"查无实据（官方补丁全文已核）。

### 2.4 节奏控制

- SC1/BW：6 档速度，**Fastest=42ms/帧（≈23.81 逻辑帧/秒，竞技标准）**（[Game Speed](https://liquipedia.net/starcraft/Game_Speed)）；对战无暂停。
- SC2：模拟 16 循环/秒，天梯锁 Faster=**22.4 循环/秒**（[s2client-proto 协议](https://github.com/Blizzard/s2client-proto/blob/master/docs/protocol.md)、[DeepMind SC2LE 论文](https://arxiv.org/abs/1708.04782) 双源）；**单人/自定义可调速（0.6x~1.4x）并随时暂停**——节奏档位本身就是难度旋钮。

### 2.5 战斗与战略衔接

- 经济=水晶（存量库存）+瓦斯（恒速流水）双时间结构强制不同攻防节奏；人口 200；**分基地=地图控制=资源控制**——经济扩张本身创造战线（[Resources](https://liquipedia.net/starcraft/Resources)）。
- 侦察与战斗强耦合：视野=目标获取权（BW 上坡骰/SC2 门控都把"有没有那只眼"变成火力前置；溅射能打到未侦测的隐形单位）。


## 三、《红色警戒》系列（RA2/YR → RA3）

### 3.1 单位与操控模型

**RA2/YR**（[StrategyWiki Controls](https://strategywiki.org/wiki/Command_%26_Conquer:_Red_Alert_2/Controls)）：Attack Move(A)、Scatter(X)、Guard(G)、Deploy(D)、Force Fire/Move（Ctrl/Alt+点击）、**Z 路径点**、T 选同型、**Ctrl+0-9 十组编队**；**无姿势档**（Guard 最接近守卫）；"Formation move" 仅单源提及【存疑】。寻路问题远不如 BW 显眼（开阔平原图）；单位可碾压步兵。

**RA3**（[官方手册镜像](https://manuals.plus/m/ed5f710a0076d7480daf780d8ac1e1777b988ea5cdb2ce3592651493c87e2f86)、[GameReplays 热键指南](https://www.gamereplays.org/redalert3/portals.php?show=page&name=red-alert-3-feature-wilko-hotkey-guide)）：**RA 系首次完整姿势系统**——默认 Guard + Aggressive/Hold Ground/Hold Fire（Alt+A/S/D/G）；**每单位一个"F"键副技能**（武士 Banzai/维和举盾/水翼切机炮——"每个单位都带一个战术开关"）；Reverse Move 倒车（炮口朝敌倒退撤离）。

### 3.2 战斗数值结构

**RA2**【已确认·一手：ModEnc 引擎文档】
- **护甲 11 类**（none/flak/plate/light/medium/heavy/wood/steel/concrete/special_1/special_2）；**克制=弹头 Verses 百分比矩阵**：实际伤害 = Damage × Verses[目标甲] 向下取整；Damage×Verses<1 则无伤（[Verses](https://modenc.renegadeprojects.com/Verses)、[Damage](https://modenc.renegadeprojects.com/Damage)）。
- **Verses 特殊值语义（对 AGW 极有借鉴）**：**0%=该武器视此类甲为禁击目标**（不索敌/不还击/不强制攻击）；1%=不主动索敌可手动强攻；**负值=治疗**（维修单位就是这么实现的）。
- **命中率：无掷骰**；失手只来自弹道散布旗标（偏弹着点）。**"每击伤害随机 50%~100%"社区说法在引擎四页文档中零记载——判存疑不采信**。
- **卧倒减伤 50%**（GameFAQs【单源】）；CellSpread+DamageRadius 双溅射参数；**负伤害=维修**（原版硬编码限制一堆，Ares/Phobos 才修好——治疗是伤害公式的镜像）。
- **老兵**（[cnc.fandom Veterancy](https://cnc.fandom.com/wiki/Veterancy)）：两档；晋升=**击毁敌单位总价值>自身造价 3 倍**；Veteran +10%伤/+20%速/+50%甲/+40%射速；Elite 自愈+专属升级武器。

**RA3**：SAGE 引擎 **DamageType × ArmorSet 矩阵**（结构同 RA2 乘数矩阵，重新划档）；**老兵三档**：Veteran +25%伤、Elite +25%血、Heroic +25%射程/+25%视野/+20%速度/免贿赂/自愈；**经验掉落=造价×段位倍率（2x/3x/4x）**——杀老兵涨经验快=正反馈；命中无掷骰（C&C 确定性传统）。

### 3.3 地形/视野/掩体

- RA2 海拔分层：崖顶可射崖下、崖下弹道被崖缘阻挡——**用"能不能打得到"而非"打不打得准"表达高地优势**（无命中率惩罚）。
- **步兵掩体三件套**：①**驻扎 Garrison**（RA2 引入，仅基础步兵；**建筑替驻军承伤、血量跌破阈值自动撤出**；RA2 本体"建筑在开火"、YR 改驻军各自开火）②卧倒 50% ③树丛/围栏掩护（[Garrisoning](https://cnc.fandom.com/wiki/Garrisoning)）。
- RA3：驻扎开放到全部步兵（军犬除外）、**驻扎建筑不可再被修理**（阵地一次性化）；城墙可建造；**海陆一体**（Vessels 独立编制+大量两栖单位）。

### 3.4 节奏控制

- RA2：**Skirmish 与 Esc 菜单内置游戏速度滑块可随时调**；**战役模式默认隐藏该滑块**（社区十六进制补丁解锁——前车之鉴）；多人无暂停（[CnCNet](https://forums.cncnet.org/topic/12625)）。
- RA3：Skirmish Esc 含速度选项、单人开菜单即暂停；多人不可暂停。**"暂停菜单里调速"= AGW 缩略加速的最接近先例**。
- 微操强度：RA2 自动索敌+自动反击为主；RA3 用姿势档+副技能把干预点标准化成两三个按键。

### 3.5 战斗与战略衔接

- RA2 经济：矿石/宝石采集，**矿场会缓慢再生**；油井=工程师占领第二收入线；**电力=战斗力硬闸门**（电力不足→防御塔全部离线/生产减速/雷达关闭）——**电厂直接是防御体系的血条**。
- **生产加速曲线**：同类生产建筑越多产得越快（1 战车工厂 38s→2 座 16s→3 座 11s，收益递减 ~6 座封顶）（[CnCNet 实测](https://forums.cncnet.org/topic/7500-red-alert-2-laboratory)）；**全局分类队列**（建筑/防御/步兵/载具各一条）——多线爆兵=多造工厂而非多开队列。
- RA3 基地=可移动的战斗前置：取消邻建、**anywhere-on-视野 放置**、扩张靠 MCV 展开指挥枢纽、精炼厂自带矿车、可海上建造（[盟军建造场](https://cnc.fandom.com/wiki/Allied_construction_yard_(Red_Alert_3))、[GameDeveloper 开发者文章](https://www.gamedeveloper.com/design/a-nod-to-the-construction-yard)）——**前线=一座能产兵的指挥枢纽**。

（A 工兵另拦截两条 AI 摘要虚构：SC2 4.10 移除盲射=官方补丁无此条；RA2 伤害随机 50~100%=引擎文档零记载。）


## 四、《魔兽争霸3》（RoC 2002 / TFT 2003 / Reforged 2020）

### 2.1 攻防类型克制系统

**核心结论：表驱动克制 + 护甲减伤公式两层结构，攻击类型决定对什么甲打几折，护甲值再按公式减伤。**

**① 攻击×护甲伤害系数表（TFT，Blizzard 官方）【已确认：官方+Liquipedia 双源】**

来源（一手）：[Battle.net 经典官方页 Armor and Weapon Types](https://classic.battle.net/war3/basics/armorandweapontypes.shtml)；交叉：[Liquipedia - Armor and Attack types](https://liquipedia.net/warcraft/Armor_and_Attack_types)

| 攻击↓ / 甲→ | 轻甲 | 中甲 | 重甲 | 加强甲(Fortified) | 英雄甲 | 无甲 |
|---|---|---|---|---|---|---|
| 普通 Normal | 100% | 150% | 100% | 70% | 100% | 100% |
| 穿刺 Pierce | 200% | 75% | 100%* | 35% | 50% | 150% |
| 攻城 Siege | 100% | 50% | 100% | 150% | 50% | 150% |
| 魔法 Magic | 125% | 75% | 200% | 35% | 50% | 100% |
| 混沌 Chaos | 100% | 100% | 100% | 100% | 100% | 100% |
| 法术 Spells | 100% | 100% | 100% | 100% | **70%** | 100% |
| 英雄攻击 Hero | 100% | 100% | 100% | 50% | 100% | 100% |

\* 穿刺×重甲：官方页 100%，2004 年 1.15 补丁起 90%（[Liquipedia](https://liquipedia.net/warcraft/Armor_and_Attack_types)）——**用表注意版本**。

**② RoC v1.06 旧表（同官方页）**：RoC 里轻甲怕普通(150%)、中甲怕魔法(200%)、重甲怕穿刺(150%)；TFT 把克制环整体转了向——**克制环方向可整体旋转而不动骨架，是成熟的平衡手段**。

**③ 护甲值公式（官方原文）【已确认】**
- 正甲：`减免 = 护甲 × 0.06 / (1 + 0.06 × 护甲)`（甲 1≈5.7%；甲 20≈55% 减伤）
- 负甲：`增伤 = 2 − 0.94^(−护甲)`（甲 −10 ≈ 多受 46.1%）
- 特性：减伤递减；克制系数是乘在减免前的独立一档。

**④ 特殊规则【已确认：官方+Liquipedia】**：虚灵只吃魔法（且 +66%）；魔免只吃物理；神甲除混沌只受 5%；Chaos 无视全表；Spells 是技能伤害类型（英雄甲固定 70%——"英雄技能减伤"藏在护甲类型上）。

### 2.2 单位模型

**参数结构【已确认：官方单位表 + wiki】**（来源：[人族单位统计表](http://classic.battle.net/war3/human/unitstats.shtml)、[Footman 页](https://warcraft.wiki.gg/wiki/Footman_(Warcraft_III))）

参数集 = HP / 护甲类型 / 护甲值 / 视野(昼/夜) / 移速 / 攻击类型 / 伤害(基础+骰) / 攻击间隔 / 射程 / 碰撞体积 / 攻击优先级。人族节选：

| 单位 | HP | 甲型 | 甲 | 移速 | 攻击型 | 伤害 | 间隔 | 射程 |
|---|---|---|---|---|---|---|---|---|
| 步兵 Footman | 420 | 重 | 2 | 270 | 普通 | 12.5 | 1.35s | 近战 |
| 火枪手 Rifleman | 535 | 中 | 0 | 270 | 穿刺 | 21 | 1.5s | 400/600 |
| 骑士 Knight | 835 | 重 | 5 | 350 | 普通 | 34 | 1.4s | 近战 |
| 牧师 Priest | 290 | 无 | 0 | 270 | 魔法 | 8.5 | 2.0s | 600 |
| 迫击炮 Mortar | 360 | 重 | 0 | 270 | 攻城 | 58 | 3.5s | 250–1150 |
| 攻城机器 | 700 | **加强** | 2 | 220 | 攻城 | 50 | 2.1s | 190/500 |
| 狮鹫骑士 | 825 | **轻** | 0 | 320 | 魔法 | 50 | 2.2s | 450 |

要点：血量跨度约 4.5 倍；伤害与间隔反比；射程分档（近战<100 / 远程 400–600 / 炮兵 1150）；攻城机器自挂加强甲（同型自洽）；空中单位挂轻甲/魔法攻击形成第二克制轴。

**命中率【已确认】**：**无基础命中率掷骰，攻击默认必中**；Miss 只来自技能/道具（闪避/致盲/诅咒），且有连 Miss 上限保护（[Liquipedia - Miss](https://liquipedia.net/warcraft/Miss)）。伤害结算 = 攻击骰 × 克制系数 × 护甲减伤。

**魔法/控制的角色【已确认】**：控制类（晕眩/缠绕/变形/放逐）是战斗核心（[Crowd control](https://warcraft.wiki.gg/wiki/Crowd_control)）；魔免/虚灵构成独立于物理的第二张攻防表。

### 2.3 阵型/碰撞/寻路/拉扯

- **转向速率与碰撞【已确认：Blizzard 官方论坛深度帖】**（[来源](https://us.forums.blizzard.com/en/​warcraft3/t/an-in-depth-look-at-wc3-collision-mechanics/1110)）：真实转向速率是卡位（body blocking）成立前提；方形碰撞盒；友军让路行为造成"拥堵感"。格网 A*（8 方向）为【单源：社区帖】。
- **拉扯（kiting）【已确认：官方指南】**（[Unit Control](http://classic.battle.net/war3/basics/unitcontrol.shtml)）：hit-and-run 是官方明文核心战术；底层=攻击流程"前摇→**伤害点**（判定）→后摆（可取消不损失伤害）→冷却"，拉扯窗口=伤害点后、后摆中（[Liquipedia - Attack](https://liquipedia.net/warcraft/Attack)）。
- **阵型：没有**——无队形/朝向加成系统，"阵型"由玩家手工摆位实现。【已确认：官方手册无此章节】

### 2.4 节奏与经营游戏适配问题

- 战斗 30 秒–2 分钟一触即分；个体级微操（拉扯/集火/卡位/围杀）APM 需求 RTS 最高档。【已确认：官方指南定性】
- 对 AGW 的适配推演【推测】：①个体级微操不可承接；②底层参数体系完全可承接（透明物理参数=禁抽象战力比的答案）；③转向+碰撞是"部队感"手感资产；④拉扯保留为高手收益，AI 默认站桩也能打赢教学剧本。

---

## 五、《三国志12》（光荣 2012 / PK 2013）

### 3.1 会战制结构

**① 双层制【已确认：官方+Famitsu】**：大地图内政 → 点城"出阵"→ 独立实时会战图。战前=**军议**（选秘策/看战力）→**部队配置**（只有守方可预置部队于兵法阵/强化阵/本阵并自由出阵）。来源：[光荣官方战斗页](https://www.gamecity.ne.jp/sangokushi/12cn/sentou/sentou_01.htm)、[Famitsu 战斗流程专题](https://www.famitsu.com/news/201211/01023734.html)。

**② "6 种阵形"证伪【已确认】**：三国志12 **没有阵形选择**（阵形是三国志11 战棋系统）；出阵只选兵科与兵力，阵形感来自据点布防与地形。

**③ 据点体系【已确认（官方+转述混合）】**
- **陣**：占得越多**采配点**积攒越快（[官方 sentou_04](https://www.gamecity.ne.jp/sangokushi/12cn/sentou/sentou_04.htm)）。
- **强化阵/兵法阵（PK 新增，带耐久）**：强化阵=特定兵科在周围获增益，打爆耐久失效；兵法阵=战场级效果，破坏敌阵使其瞬间弱化。
- **城门**：有防御值，打穿才可通过；**投石以外兵科须邻接攻击**（[Famitsu](https://www.famitsu.com/news/201211/01023734.html)）。
- **本阵**：放**备兵（预备队）**，部队可回补；**攻方掏空备兵或全歼守方部队=胜；守方可拖到时间结束取胜**（守方兜底条件，攻方被迫进攻）。

**④ 战争迷雾**：每部队有视野值，有视野+100% 战法（【单源转述】）。

### 3.2 兵科克制

**三角克制 + 周期性"兵击"【已确认：官方+攻略双源】**（[兵科页](https://sangokushi.grappli.net/sangokushi12/heika)、[官方 sentou_02](https://www.gamecity.ne.jp/sangokushi/12cn/sentou/sentou_02.htm)）：
- 枪克骑（奋迅）、骑克弓（突击）、弓克枪（猛射）——**克制不是固定倍率**，而是对劣势兵科每隔一定时间触发基于**武力差**的大伤害。
- **兵击倍率/触发间隔：未找到官方数值**【玩家整理缺口】。
- 五兵科基础值【玩家整理：grappli】：枪(攻10/破18/防10/机15)、骑(10/13/10/18)、弓(8/间接10/10/15/射程12)、冲车(破坏40/机8【单源】)、投石(间接最强/破坏次之/防机低)。特性：枪可登墙（威力约70%不可兵击）/森林不减速；骑兵森林减速/唯一对兵器兵击；弓森林攻击减半。

### 3.3 战斗参数

- **部队四维**：攻撃/防御/破壊/士気【已确认存在；公式未找到官方数值】。部队数值由武将统率算出；破坏与兵数相关【玩家整理】。
- **士气与溃走链【已确认：官方】**（[sentou_06/07](https://www.gamecity.ne.jp/sangokushi/12cn/sentou/sentou_06.htm)）：单挑胜利削士气+战力大幅下降；士气 0=部队直接战败；**動揺**（被伏兵袭击：攻防机动大降、定时自恢复）；**潰走链**：兵力归 0→武将溃走逃离→继续攻击打空体力→**退却/捕縛/討死**三选一（俘获可登用）。
- **单挑【已确认：官方多源】**：交战随机触发（勇猛高/武力差小更易）；**天地人三系技札猜拳**（天>地>人>天，数字合计威力，5 合目）；必殺×2/反撃（两源细节分歧以官方为准）；PK 加天地人大招与弾返。**注意：单挑切入独占画面**。
- **战法与采配【已确认：官方+全表】**：采配随时间积攒、**占阵加速**；约 40 个战法分自身/范围/全军三类，成本 2–7 点（攻击强化 2=攻+30、猛攻 4=攻+60、铁壁 5=防+125、千里行 6=攻+90+全兵科兵击、義勇兵/八陣の法等专属）；知力 100+ 计略战法耗点 −1；一部队最多同时 6 个战法效果。**采配上限未找到官方值**（攻略囤 18/20 点→推测 ≥18）。秘策=战役级预置技（军议选）；PK 加参军/防策。

### 3.4 操作粒度与自动战斗

- **部队=软件单位**（个体士兵只是渲染），命令集=移动/指定攻击/防御/登墙/攻门，场上本队最多 **6 部队**（每队 ≥1000 兵【单源】）+援军（上限说法不一【未确认】）。
- **暂停+倍速【已确认：多源】**：一時停止中从容下命令，速度可调——与 AGW"暂停/缩略加速"完全同构。
- **自动战斗**：**本编无跳过会战选项**（玩家城市必须亲手打→战斗疲劳被诟病）；委任军团与 AI 的战斗离线解算【推测】。AI 缺陷：战术单一/窝弓死守/城防脆弱；"AI 出兵≈玩家出兵 2 倍"被玩家反向利用（6000 兵破十万兵城：先控规模再火计连发——[游民星空](https://www.gamersky.com/handbook/201205/199225.shtml)）【玩家整理，高流传度】。

---

## 六、对 AGW L3 的借鉴清单（合并裁决素材）

### 6.1 照搬（结构层，来自三国志12）
1. **双层制整体结构**（经营图→会战图；军议+守方预部署两阶段战前）。
2. **据点三件套→AGW 语义**：陣→哨所/检查站（占点加速指挥点）；城门→封锁线/工事入口（带耐久，非爆破器材须邻接作业）；本阵→指挥部+预备役池（回补；攻方掏空预备役或全歼守方=胜）。
3. **守方兜底胜利条件**（拖时间取胜→迫使攻方主动进攻）。
4. **士气→动摇→溃走链**（现代替换：溃走=失去建制撤退；俘获=战俘/缴械→对接监狱系统战俘；武将死亡口径随 AGW 玩法）。
5. **指挥点数+战法=技能系统**（时间+占点积攒；成本分档 2–7；信息化等级高耗点 −1；现代映射：无人机侦察/烟雾遮障/电子压制/精确打击/装甲突击/工事加固）。
6. **时间停止+倍速**（与 AGW 缩略加速完全同构；RA2"Esc 菜单内调速滑块"是交互范式先例——且要吸取其"战役模式锁滑块"的前车之鉴，AGW 全模式可用）。
7. **部队级操作粒度**（部队=软件单位；场上 10~30 支——与军事专题开题"一屏 10~30 支可操作"口径一致）。
8. **战争迷雾+单位视野属性**（侦察兵/无人机直接对位）。

### 6.2 数值与手感层（魔兽3）
1. **克制走 WC3 表驱动**（6×6 系数矩阵 JSON 冻结；护甲比例公式照抄；克制环方向可整体旋转做平衡——RoC→TFT 先例）。现代映射建议：突击组/压制组/火力平台/电子特种/指挥官 × 无防护/轻/中/重/载具/工事六甲；**电子战独立成第二张表**（对应魔免/虚灵）。
2. **单位参数集照抄 WC3 字段**（HP/甲型/甲值/移速/攻防破坏士气合并 RTK12 四维/间隔/射程/碰撞/视野/优先级——全进 JSON；sim B1 已验证的七兵种 counter 公式为基准，调研表作校准参考）。
3. **转向速率+碰撞体积必做**（部队重量感/冲锋卡位突围的手感来源；SC2 的 A*+steering 分离寻路避免 BW 式卡坡）。
4. **拉扯窗口保留但交给 AI 默认**（前摇→伤害点→可取消后摆→冷却；手动取消=高手收益；教学剧本 AI 站桩可打赢）。
5. **必中+明示例外**（不做基础命中率；偏差只来自明示规则——烟雾/压制=闪避率）。
6. RTK12 兵击风味若保留→降格为**特长攻击**（反器材狙击/破甲弹：冷却限定的专攻高伤）——待开题裁决。

### 6.3 直接吸收（红警/星际，低微操高度兼容）
| 机制 | 出处 | 为什么适合 AGW |
|---|---|---|
| 护甲类型×弹头 Verses 百分比矩阵 | RA2 ModEnc Verses | 纯数据表驱动；克制可读性强 |
| Verses=0/1% 驱动自动索敌 | ModEnc Verses | AI 行为从克制表免费获得 |
| RA3 姿势档（Guard 默认+主动/守地/停火） | RA3 手册/热键指南 | 挂机合理、干预有效的标准旋钮 |
| 每单位一个副技能（F 键） | RA3 官方/cncnz | 决策面小而深，微操压力可控 |
| 老兵按"击毁价值"晋升+段位经验掉落倍率 | cnc.fandom Veterancy | 防"刷兵升级"；正反馈 |
| 驻扎系统（建筑承伤/阈值自动撤离） | cnc.fandom Garrisoning | 契合"城市底图独一无二+建筑通用套件" |
| 电力/后勤作为防御硬闸门 | RA2 低电力机制 | 经营侧决策直接决定战斗侧上限 |
| 多生产建筑加速曲线（收益递减 38s→16s→11s） | CnCNet 实测 | 用空间换速度，爆兵=基建决策 |
| SC2 高地"视野门控"+显示/暴露两级状态 | Liquipedia High Ground | 确定性结算对自动演算与战报复盘友好 |
| SC1 尺寸克制 3×3 小表起步方案 | Liquipedia Damage | 若嫌 11 甲太重的小表替代案 |
| 溅射衰减 100/50/25+友伤开关 | Liquipedia Damage | 溅射参数化；教学局关友伤 |
| 0.5 最低伤害+护甲固定减伤 | Liquipedia Damage/Armor | 防"绝对肉盾"；城墙耐久可直接套用 |
| Hold Position 守地不追击档 | Liquipedia Shortcuts | 补 RA2 系缺失档位，防自动演算追击脱节 |

### 6.4 不建议吸收
| 机制 | 为什么不适合 |
|---|---|
| SC1 上坡命中骰（53.125%）与 1/256 常态失手 | 骰子让战报不可复盘、教学剧本确定性落空——SC2 自己都删了 |
| SC1 12 单位选择上限 | 是 BW 微操文化的根，对经营玩家纯惩罚（AGW 部队规模小） |
| BW 式笨寻路（龙骑之舞/坡口漩涡） | 战斗层是配角，寻路卡顿会被读成 bug——直接 A*+steering |
| BW 式 APM 微操强度 | 与"低微操"定位冲突；手动指挥=决定打哪/撤哪/开哪个技能 |
| RA3 全海军/两栖维度（一期） | 14 城战斗在城内/城郊，水域维度一期纯成本；二期新图再议 |
| "RA2 伤害随机 50%~100%" | 无一手来源且不符合确定性需求；要随机性放进明示规则（事件骰） |

### 6.5 一条设计推论（供开题讨论）
SC1→SC2 删骰子/删选择上限/把运气换成视野信息；RA2→RA3 加姿势档/加副技能/基地变可移动前置——**RTS 的"战斗层自动化+低微操化"是被验证的主流演进方向**。AGW L3 的"手动指挥与自动结算并存"具体化=三层旋钮（姿势档/副技能/暂停调速）+全自动演算底盘（寻路/索敌/驻扎/老兵），战报确定性可复盘。

### 6.6 警示（踩坑清单）
1. 自动结算=同一套实时模拟跑 AI vs AI（不做抽象战力比）；AI 需行为模板（突击/压制/据点防御/诱饵/撤退）+允许中途接管（RTK12 窝弓教训）。
2. 克制不承担全部平衡（离散事件方差大；连续表系数+护甲公式可平滑调参）。
3. 单挑类插入事件谨慎（RTK12 单挑切画面打乱节奏→AGW 若做对峙/斩首，做成不暂停的高亮事件或并入技能）。
4. AI 出兵规则防反向套利（诚实全量防守或明示规则）。
5. 结构定版后克制系数/阈值=纯数据问题（WC3 克制环旋转/PK 据点重做=只动数据）——与 AGW"基础数值定版后冻结"完全兼容。

## 七、缺口清单（如实标注，L3 开题勿引用为实值）
- RTK12：兵击倍率与触发间隔、士气数值区间与衰减公式、部队攻防公式、采配上限、冲车/投石完整数值（单源）、援军上限、会战时间与游戏日映射——**均未获官方数值**。
- WC3：Footman 射程显示口径不一（官方仅标 Melee）；碰撞体积 16 vs 31 有【单源】分歧。
- 知乎专栏内容（登录墙）未采信；sangokushi12.glei.net 检证站域名已失效。

## 八、来源汇总

### 一手来源（官方）
- [Battle.net：护甲与武器类型（两版克制表+护甲公式+虚灵/魔免）](https://classic.battle.net/war3/basics/armorandweapontypes.shtml)
- [Battle.net：人族单位统计表](http://classic.battle.net/war3/human/unitstats.shtml) · [Unit Control 微操指南](http://classic.battle.net/war3/basics/unitcontrol.shtml)
- [光荣官方 三國志12 战斗页 sentou_01~07](https://www.gamecity.ne.jp/sangokushi/12cn/sentou/sentou_01.htm)（军议/兵科/战法/采配与动摇/秘策/单挑/溃走捕缚）
- [Blizzard 官方论坛：WC3 碰撞机制深度帖](https://us.forums.blizzard.com/en/warcraft3/t/an-in-depth-look-at-wc3-collision-mechanics/1110)

### 二手来源（权威媒体/百科）
- [Liquipedia：Armor and Attack types](https://liquipedia.net/warcraft/Armor_and_Attack_types)（1.15 改动/神甲/Spells）· [Miss](https://liquipedia.net/warcraft/Miss) · [Attack](https://liquipedia.net/warcraft/Attack)
- [warcraft.wiki.gg：Footman](https://warcraft.wiki.gg/wiki/Footman_(Warcraft_III)) · [Crowd control](https://warcraft.wiki.gg/wiki/Crowd_control) · [Stun](https://warcraft.wiki.gg/wiki/Stun)
- [Famitsu：三國志12 战斗流程详解（2012-11-01）](https://www.famitsu.com/news/201211/01023734.html)

### 二手来源（社区攻略，单源处已标注）
- [grappli：兵科](https://sangokushi.grappli.net/sangokushi12/heika) / [战法全表](https://sangokushi.grappli.net/sangokushi12/senpou/) / [一骑打](https://sangokushi.grappli.net/sangokushi12/ikkiuchi/) / [PK 版](https://sangokushi.grappli.net/sangokushi12/pk/)
- [游民星空：6000 人破城法](https://www.gamersky.com/handbook/201205/199225.shtml) / [兵种分类](https://www.gamersky.com/handbook/201204/197490.shtml) / [PK 评价](https://www.gamersky.com/handbook/201303/228339_2.shtml)
- [巴哈姆特 PK 心得](https://forum.gamer.com.tw/C.php?bsn=60001&snA=31330)（转述）· [Reddit：WC3 寻路讨论](https://www.reddit.com/r/rust_gamedev/comments/1fyxely/how_pathfinding_and_collision_detection_work_in)（单源）

- 红警/星际补充缺口（A 工兵如实标注）：RA2/RA3 弹道散布参数级细节（Inaccuracy 数值表）、SC2 协同攻击 AI 参数、RA3 地形高度射程修正（无技术文档，未下结论）——L3 开题如需可再做 PPM/Ares/Phobos 引擎文档定向核查。
- SC2 单人战役暂停机制【推测·常识，无专页】；RA3 倒车机动/RA2 Z·T 键位【单源】。

### 红警/星际半场来源（A 工兵）

#### 一手（官方补丁/协议/引擎文档/引擎级数据页）
- Liquipedia SC1：[Damage](https://liquipedia.net/starcraft/Damage)（伤害公式/类型克制/命中骰/溅射/恢复）· [Game Speed](https://liquipedia.net/starcraft/Game_Speed) · [Resources](https://liquipedia.net/starcraft/Resources) · [Shortcuts](https://liquipedia.net/starcraft/Shortcuts) · [Game Mechanics and Glitches](https://liquipedia.net/starcraft/Game_Mechanics_and_Glitches)
- Liquipedia SC2：[Armor](https://liquipedia.net/starcraft2/Armor) · [Attributes](https://liquipedia.net/starcraft2/Attributes) · [High Ground and Low Ground](https://liquipedia.net/starcraft2/High_Ground_and_Low_Ground)
- Blizzard 官方：[SC2 5.0 补丁（formation movement 原文）](https://news.blizzard.com/en-us/article/23482838/starcraft-ii-5-0-patch-notes) · [SC2 4.10.0 补丁（核对盲射谣言）](https://news.blizzard.com/en-us/article/23091081/starcraft-ii-4-10-0-patch-notes) · [s2client-proto 协议（22.4 gameloops/s）](https://github.com/Blizzard/s2client-proto/blob/master/docs/protocol.md)
- ModEnc 引擎文档：[Verses（11 甲类/0%/1%/负值语义）](https://modenc.renegadeprojects.com/Verses) · [Damage（取整/负伤害）](https://modenc.renegadeprojects.com/Damage)
- cnc.fandom：[Veterancy](https://cnc.fandom.com/wiki/Veterancy) · [Garrisoning](https://cnc.fandom.com/wiki/Garrisoning) · [Flak cannon RA3](https://cnc.fandom.com/wiki/Flak_cannon_(Red_Alert_3)) · [盟军建造场 RA3](https://cnc.fandom.com/wiki/Allied_construction_yard_(Red_Alert_3)) · [Ore](https://cnc.fandom.com/wiki/Ore)
- [DeepMind SC2LE 论文](https://arxiv.org/abs/1708.04782) · [GameDeveloper：A 'Nod' to the Construction Yard](https://www.gamedeveloper.com/design/a-nod-to-the-construction-yard)

#### 二手（攻略/社区，交叉验证与背景）
- [StrategyWiki RA2 Controls](https://strategywiki.org/wiki/Command_%26_Conquer:_Red_Alert_2/Controls)（403，经快照确认）· [GameFAQs RA2/YR 武器护甲](https://gamefaqs.gamespot.com/pc/476890-command-and-conquer-red-alert-2-yuris-revenge/faqs/14539) · [GameFAQs RA2 战术](https://gamefaqs.gamespot.com/pc/914165-command-and-conquer-red-alert-2/faqs/9349)
- [TeamLiquid：BW 路径分析](https://tl.net/blogs/429573-broodwar-and-starcraft-2-pathing) · [12 上限讨论](https://tl.net/forum/broow-war/518540-control-groups)
- [CnCNet：RA2 速度滑块](https://forums.cncnet.org/topic/12625) · [多工厂实测](https://forums.cncnet.org/topic/7500-red-alert-2-laboratory) · [矿石再生](https://forums.cncnet.org/topic/10709)
- [GameReplays RA3 热键指南](https://www.gamereplays.org/redalert3/portals.php?show=page&name=red-alert-3-feature-wilko-hotkey-guide)（RA3 伤害类型指南当日 520，引用检索摘要已标注转述）· [Anhalt GDC 转述](https://www.reddit.com/r/starcraft/comments/vld7v9/) · [GameDev.SE SC2 寻路](https://gamedev.stackexchange.com/questions/191954/) · [Arqade Blizzard Time](https://gaming.stackexchange.com/questions/108629/what-is-blizzard-time) · [cncnz RA3 单位档案](https://cncnz.com/games/red-alert-3/allied-units)
