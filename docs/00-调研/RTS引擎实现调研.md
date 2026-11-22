# RTS 引擎实现调研（L3 战斗层·工程选型）

> 调研时间：2026-11-22（信息时效以此为准）
> 调研人：AI（黑机调研工兵×2，主会话合并交叉验证）
> 性质：**工程实现选型调研**（院长令：不只是游戏设计，要开发层面/引擎层面）
> 背景：Unity 2022.3 LTS **单机**；L3 战场=部队级软件单位（场上 10~30 支），每支渲染数十士兵，同屏士兵 1000~3000；暂停/倍速/大倍速快进（缩略加速）；同 seed 战报复盘；已有 utility 意图机骨架。
> 关联：[RTS 战斗层设计调研](./RTS战斗层设计调研.md)（游戏机制半场）· [L3战斗层开题](../06-设计/04-军事/L3战斗层开题.md)（本调研供其技术架构章节与技术裁决点）

---

## 一、核心结论（先看这个）

1. **仿真架构标准答案 = 累加器固定时间步 + Sim/Presentation 双域分离**：渲染帧产时间、逻辑以固定 dt 消费（accumulator 模式）；SupCom 实证 Sim 层 10Hz + User 层全帧率插值渲染；OpenRA 源码同构（World.Tick 与 TickRender 分离）。逻辑帧率建议 **10~20Hz**（战略级部队单位不需要更高）。（来源：[Gaffer On Games](https://gafferongames.com/post/fix_your_timestep/) / [Forrest Smith](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/) / OpenRA 源码——三一手交叉）
2. **确定性：单机单平台下 float+纪律即可**——同编译产物内 float 确定（SupCom 百万级 lockstep 实证）；Unity 官方 DOTS 样例给出完整确定性清单（固定步长/Unity.Mathematics.Random/系统更新顺序/Burst FloatMode.Deterministic/实体创建顺序）。**升级定点数的触发条件=跨版本/跨平台复盘**，一期不启用。
3. **回放 = 命令流（tick 号+指令）+ 初始种子 + 场景数据版本号**——SC2/OpenRA/SupCom/0 A.D./Spring 五案全同构；快照只做存档/中途入点。"lockstep 架构的单机化是 RTS 回放/快进的最小成本路径"（确定性纪律 100% 重叠、网络机制 0% 重叠）。
4. **倍速/暂停实现**：**每渲染帧多跑 N 个 sim tick**（模式 1）为主；**不用 Unity timeScale 做倍速**（语义不符+污染协程/物理；只留给慢镜头演出）；暂停=停止 tick 消费、渲染照常插值；回放可独立调 tick 时长（OpenRA ReplayTimestep 先例）。
5. **Unity 技术路线：一期纯 C# 轻量仿真层（Mono）+ 自管 ITick 管理器，不开 DOTS**——Unity 官方博客实测：Mono 自管 manager 遍历 10k 对象仅 ~0.23ms（每对象 MonoBehaviour.Update 慢一个数量级）；千级 agent 的瓶颈在寻路/AI 评估而非 Tick 机制。DOTS 留给二期士兵个体化（5000+ 个体逻辑）时再上；**Sim 域写成无 Unity 依赖纯 C#** 保证未来可平滑迁移。
6. **AI 三层复用现有资产**：战略层=现有 utility 意图机（低频）；战术层=TPS 式空间评分流水线（生成→硬过滤→软加权，与意图机同构）+ 低分辨率影响力图；单位层=简化 FSM/BT。**AI 与确定性隔离**（0 A.D. Petra 模式）：AI 非确定评估只产出"命令"，命令进流即确定——AI 性能优化与确定性解耦。
7. **寻路走部队级**：Total War 实证=部队锚点寻路+士兵偏移跟随（请求数 O(部队) 不 O(士兵)）；城市权重地图用网格 A*（A*PP 官方文档推荐区间，JPS 的 uniform-cost 限定不适用）；多部队同目标叠加流场 tile（SupCom2 三场结构）。
8. **群渲正解=动画烘焙纹理+GPU Instancing**（GPU Gems 3 定义的业界标准；SkinnedMesh 不支持 instancing、逐士兵 Animator ~50 个即瓶颈）：士兵走 RenderMeshIndirect 低模+烘焙蒙皮（Indirect 无 1023 上限），武将 30 个高模 SkinnedMesh；三国志12 sprite 群=美术降级预案。
9. **broad-phase=均匀 spatial hash**（quadtree 不适合均匀移动对象）；逐士兵"完整 agent"不可行（NavMeshAgent 数百即掉帧）、"位置积分+偏移+分离力"可行；分帧=脏区时间片（Emerson+Chou）。
10. **迷雾=sim 三态数组（视野计数器±1）+渲染双 RT+可分离模糊**，sim/渲染可见性彻底分离（Riot LoL+Gemserk Iron Marines 两手工程文同构），天然支持 SC2 式"显示/暴露"两级状态。

---

## 二、仿真架构与确定性

### 2.1 固定时间步与逻辑帧/渲染帧分离 【已确认】

- **累加器模式**（[Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) 一手原文）：每帧累入 frameTime，`while (accumulator >= dt)` 恒定 dt 跑逻辑步，余量保留；钳制单帧上限防 spiral of death；渲染插值 `alpha = accumulator/dt` 消除抖动；**固定 dt 的必要性根源=可复现性**（回放地基）。
- **双域实战版**（[SupCom 经验原文](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/)）：Sim 层固定 10Hz 跑单位/AI/物理，User 层全帧率跑 UI/渲染/动画+插值。
- **OpenRA 同构**【源码直读：[World.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/World.cs)】：World.Tick（WorldTick++→actor tick→ITick traits→effects→frameEndActions）与 TickRender 完全分离；步长来自 GameSpeeds.Timestep；另有 ReplayTimestep 回放单独调速。

### 2.2 确定性：浮点/定点/RNG

- **浮点不确定性边界**（[Gaffer On Games 原文](https://gafferongames.com/post/floating_point_determinism/)）：同平台同编译产物下 float 确定（SupCom 设 FPU 控制字 `_PC_24/_RC_NEAR` 并逐 tick 断言）；跨编译器/平台极难（超越函数/FMA/代数重排/libm）。补救=strict IEEE 或**定点数**。
- **Unity 官方确定性清单**（[ECSGalaxySample determinism.md](https://github.com/Unity-Technologies/ECSGalaxySample/blob/main/_Documentation/determinism.md) 一手）：①固定步长驱动 SimulationSystemGroup ②随机数全用 `Unity.Mathematics.Random`（固定种子+调用序一致）③系统按相同顺序更新 ④浮点仿真代码 `[BurstCompile(FloatPrecision.High, FloatMode.Deterministic)]` ⑤实体创建顺序确定 ⑥并行写入与线程数无关（原子预留+按 Entity.Index 排序）。
- **确定性 RNG**：自持种子自实现（OpenRA 大厅种子→World.SharedRandom【源码直读】）；纪律还包括**禁止迭代 Dictionary/HashSet 影响逻辑、无隐藏状态**（Fiedler+Forrest Smith 交叉）。
- **AGW 推论**【推测】：单机+Windows+不跨版本复盘 → float+纪律足够；触发升级定点数（FixMath.NET）的条件写进代码注释。

### 2.3 回放：命令流 vs 快照

| 作品 | 回放内容 | 置信度 |
|---|---|---|
| SC2 | 命令流+开局随机种子（s2protocol 官方解码器，含 m_randomValue） | 单源（官方仓库摘要） |
| OpenRA | 订单流+种子；失步即冻结回放世界 | **已确认（源码直读）** |
| SupCom/PA | 只存输入序列；打补丁毁回放；PA ChronoCam=确定性时间旅行回放 | 已确认（原文） |
| 0 A.D. | 命令日志重放；`-rejointest=N` 逐 turn 校验状态序列化 | 单源（摘要） |
| Spring | demo=全部输入+开局元数据，本地重模拟 | 单源（摘要） |

取舍【推测】：命令流体积小、天然即回放、即存档差量；工程惯例=**混合**（全量快照做存档/中途入点，命令流做回放主线）。

### 2.4 暂停/倍速三模式

1. **逻辑帧倍速**（每渲染帧跑 N 个 sim tick）——与 accumulator 天然兼容；OpenRA ReplayTimestep/0 A.D. SetSimRate 先例【已确认/单源】；上限受单帧 N 步预算约束。
2. **timeScale**——Unity 语义=缩放 deltaTime；timeScale=0 时 FixedUpdate 不跑/协程停摆（暂停 UI 需 unscaledDeltaTime）【官方文档直读】；**适合慢动作演出，不适合确定性大倍速**。
3. **步长缩短**——OpenRA 改 Timestep（其确定性已实证：结果与 tick 时长无关【单源 gist】）。

**AGW 推荐**【推测】：模式 1 为主+模式 3 为辅（超快进压缩 tick 物理时长）；暂停=停止消费、渲染照常插值；**不碰 timeScale**。

### 2.5 lockstep 与单机的重叠度

**确定性纪律 100% 重叠，网络机制 0% 重叠**【推测，基于已确认来源】：照单全收=固定逻辑帧/RNG 纪律/更新顺序/命令流记录/周期性状态哈希（OpenRA [Sync.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/Sync.cs) 的 [VerifySync] XOR 哈希；SupCom 每秒 checksum）；直接丢弃=输入延迟窗口/同步等待/desync 恢复/join-in-progress。**lockstep 架构单机化=RTS 回放/快进的最小成本路径**。

---

## 三、Unity 技术路线

### 3.1 Mono vs DOTS：千级 agent 可行性

- **Mono 侧量化**（[10000 Update() calls 官方博客](https://unity.com/blog/engine-platform/10000-update-calls) 直读）：魔法方法开销=native→managed 调用链；**自管 update manager（数组遍历）10k 对象仅 ~0.23ms**——比每对象 MonoBehaviour.Update 快数倍到十余倍。推论【推测，量级可靠】：千级士兵+30 部队，Mono+自管 tick 完全可行；瓶颈在寻路/AI 评估。
- **DOTS 侧**（ECSGalaxySample 官方样例=固定逻辑帧+确定性成体系；Megacity Metro 展示 entity 密集规模）【已确认】：代价=Subscene/Baking 工作流+混合 GameObject+调试门槛（Code Monkey DOTS RTS 课明示 "NOT for beginners"）。
- **裁决素材**：一期 Mono；士兵个体化（5000+ 逻辑实体）是二期 DOTS 的触发条件；Sim 域纯 C# 无 Unity 依赖=未来平滑迁移的保险。

### 3.2 官方与社区成熟方案

- Unity 官方 RTS 形态样例=ECSGalaxySample（宏观自动化仿真+确定性文档+调试视图）【已确认】。
- Code Monkey：DOTS RTS 课程（框选/移动/Fog of War/流场寻路/建造/射击）【已确认】；GameObject 线=传统 Mono 架构【单源】。
- Unity Network Update Loop RFC：Player Loop API 注册固定 tick——官方对"仿真 tick 与渲染帧解耦"背书【单源（摘要）】。

### 3.3 Update 循环组织

管线式 **input→sim→presentation 分离**被三个一手来源共同印证（Fiedler/SupCom/OpenRA）：manager 单例驱动 ITick 列表（数组遍历）做逻辑主干；事件驱动只用于表现层（飘字/特效）；事件顺序需确定故不进逻辑帧主干【推测】。

---

## 四、AI 架构（战术层）

### 4.1 行为树 vs GOAP vs Utility（社区多源共识【已确认】）

| 方法 | 适合 | 不适合 |
|---|---|---|
| 行为树 BT | 单位/小队**可预测可调试的执行层**（战斗姿态/技能序列） | 巨型树；开放性目标 |
| GOAP | 多步规划涌现行为 | 强掌控的固定演出 |
| Utility AI | **持续权衡动态选项**（AGW 意图机所在层） | 精确时序执行 |

（[gamedev SE](https://gamedev.stackexchange.com/questions/188831/behavior-trees-or-goap-for-rimworld-like-game)、[r/gamedev 混合](https://www.reddit.com/r/gamedev/comments/z6af79/)）常见混合=utility 选目标→GOAP 规划→BT 执行。**AGW 对应**【推测】：意图机=战略/战术决策层；之下接简化 FSM/BT 做单位执行即可，无需 GOAP。

### 4.2 Squad/编队 AI

**Slot-based formation**【已确认：[Game AI Patterns ch18](https://www.socratopia.app/library/game-ai-patterns-en/chapter-18) 直读】：编队=锚点坐标系+相对槽位；每帧 `world = anchor.pos + forward*z + right*x`；成员用 ARRIVAL+SEPARATION 朝槽位移动——**编队只替换目标点**；转向低通滤波；障碍三连（slot 不可达→替代点→skip→过多失效解散）；Line/Wedge/Column/Scatter 标准形状；SC2/Total War/COH/AoE 自 1990s 皆此。元原则："显式指派管粗形状，涌现规则管细间距"（50+ 密集才上 ORCA/boid）。

### 4.3 TPS 与影响力图

- **Crytek TPS**【已确认（转述+原章 PDF 定位）】："从哪个位置行动"三阶段流水线=**生成（NavMesh 采样/掩护点）→硬条件过滤→软加权评分（0 即否决）**；二叉堆+惰性求值；directness 点积；异步射线分帧。**与 utility 意图机同构**——把效用函数作用在"候选空间位置"上【推测】，AGW 可低成本复用评分框架。
- **影响力图**【已确认·多源定位】：网格化空间影响力，用于战术评估/攻防/kiting（[GameAIPro2 ch30](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf)、[AIIDE kiting 论文](https://ojs.aaai.org/index.php/AIIDE/article/download/12544/12395/16064)）。AGW 建议部队级低分辨率（8~16 格/战场边长，每 N tick 更新）。

### 4.4 RTS AI 分层经典结构

strategic/tactical/unit 三层（[AI Magazine 2014 综述](https://ojs.aaai.org/index.php/aimagazine/article/view/2478)【单源摘要】；GRAIL 白皮书同构【单源】）：**战略层（低频，意图=AGW 意图机）→战术层（中频，TPS/影响力图/编队指派）→单位层（每逻辑帧，FSM/BT 执行）**，频率递增/状态量递减，层间用"命令/宏指令"传递【推测，综合】。

---

## 五、开源引擎架构参考

### 5.1 OpenRA（C#，与 Unity 同语言）——最佳参考【源码直读，已确认】

- 实体=Actor，行为=Trait 组合（Info 类共享+实例类）；mod 用 YAML 组装。
- 行为=**Activity 队列**（命令队列+协程式行为树替代品）。
- 命令：IIssueOrder/IOrderTargeter→IssueOrder→Order；**订单流=网络/回放唯一载体**。
- Tick 顺序固定（存档恢复→暂停检查→WorldTick++→actor→traits→effects→frameEnd）；**暂停本身是订单**（PauseGame order）。
- 确定性：[VerifySync] XOR 哈希（IL 发射+缓存）+RunUnsynced 守卫；回放失步即冻结。

### 5.2 0 A.D.（C++ 核心+JS 玩法）【单源（摘要）为主】

ECS 式 simulation2 component 体系；确定性 lockstep **默认 turn 200ms**，命令排队到下一 turn；`Engine.SetSimRate(2)` 调速；**AI（Petra）跑独立 worker 线程，经 AIInterface 只读序列化状态视图，决策以普通命令回注**——非确定 AI 与确定性 sim 隔离的教科书设计；`-rejointest=N` 逐 turn 校验。

### 5.3 Spring / Warzone 2100 / Glest【单源（摘要）】

Spring：client-server 确定性 lockstep+demo=全部输入；Warzone：droid 每 tick 处理 order/action 队列；Glest：全 XML 数据驱动+UnitUpdater 命令队列。**共性=tick 驱动+命令队列+数据驱动单位定义**【推测，综合】。

### 5.4 确定性/回放横向对比

| 引擎 | 逻辑帧 | RNG | 校验 | 回放 | 置信度 |
|---|---|---|---|---|---|
| OpenRA | ~25Hz（回放单独调速） | 大厅种子→SharedRandom | [VerifySync] XOR+守卫 | 订单流 | 已确认（源码） |
| SupCom | 10Hz Sim 层 | — | 每秒全状态 checksum | 输入流 | 已确认（原文） |
| 0 A.D. | 200ms/turn | gamesetup 种子 | -rejointest 逐 turn 校验 | 命令日志 | 单源（摘要） |
| SC2 | — | m_randomValue | — | 命令流（s2protocol） | 单源（摘要） |
| Spring | lockstep | — | sync checksum | 输入流 demo | 单源（摘要） |

---

## 六、对 AGW L3 的技术选型建议（仿真层+AI 层）

**总推荐：纯 C# 轻量仿真层（Mono，不开 DOTS）+ 命令流确定性回放。**

1. **双域分离**：Sim 域（纯 C# 类，无 MonoBehaviour/无 UnityEngine.Time 依赖）+ Presentation 域（GameObject 只读 Sim 状态插值渲染）。逻辑帧 **10~20Hz**（定为数据，随 ScenarioDefinition 可调）。
2. **主循环**：渲染帧内 accumulator 消费固定 dt 跑 N 个逻辑 tick；倍速=每帧多跑 N 倍 tick；暂停=停止消费渲染照常；**timeScale 只留慢镜头**。
3. **确定性纪律**：自实现 RNG（Unity.Mathematics.Random 或 xorshift，种子入回放头）；固定系统更新顺序；禁迭代无序集合影响逻辑；float 可接受（单机同平台）；每逻辑帧/秒轻量状态哈希写入回放（OpenRA VerifySync 简化版）。
4. **回放**：命令流（tick 号+指令）+种子+场景数据版本号；快照=存档/复盘入点；回放兼容随版本冻结（SupCom 教训）。
5. **Tick 组织**：BattleSimManager 驱动 ITick 数组列表（官方数据：manager 模式比 MonoBehaviour.Update 快一个数量级）。
6. **AI 三层**：战略层=现有意图机（每 1~2s 决策）；战术层=TPS 空间评分（复用意图机评分代码）+部队级低分辨率影响力图；单位层=简化 FSM/BT；编队=锚点+slot（Line/Wedge/Column 按 scenario 配）。
7. **AI 与确定性隔离**（Petra 模式）：非确定评估只产出命令，命令进流即确定——AI 性能优化与确定性解耦（大倍速快进的关键）。

**备选**：DOTS（二期士兵个体化 5000+ 逻辑实体时启用）；定点数（仅跨版本复盘成硬需求时）。
**明确不推荐**：快照式主回放；每士兵 MonoBehaviour.Update；timeScale 当倍速引擎。

**落地路线**：①BattleSimManager+固定 tick+插值渲染 → ②命令流+种子+状态哈希（与①同建）→ ③部队实体（移动/接敌/伤害）+士兵表现层 → ④意图机接入+TPS 选址+影响力图 → ⑤编队 slot → ⑥倍速/暂停 UI+战报复盘器。**每步以"同 seed 两跑哈希一致"为验收**。

---

## 七、寻路 / 群体渲染 / 性能工程

### 7.1 寻路与群体移动

**JPS（Jump Point Search）**【已确认：AAAI-11 论文全文（[PDF](https://harabor.net/data/papers/harabor-grastien-aaai11.pdf)，已存 `tmp/research-l3/`）】
- 原理：网格寻路的对称路径导致 A* 重复展开等价节点；JPS 用 jump points 宏算子只展开拐点，"speed up A* by an order of magnitude and more"，零预处理零内存开销且最优。
- **关键限定（论文原文）**：作用域="uniform-cost grid environments"（均匀代价网格）——**带权重地形（街道/掩体代价）不适用**；权重地图需 JPS+ 变体或退回普通 A*。

**HPA***【已确认（摘要层）】：地图切 cluster 预计算入口距离，抽象层 A*+cluster 内细化；近最优、大图提速、需离线预处理（[ResearchGate](https://www.researchgate.net/publication/228785110_Near_optimal_hierarchical_path-finding_HPA)）。

**Unity NavMesh vs 网格 A***【已确认：[A* Pathfinding Project 官方文档](https://arongranberg.com/astar/docs/graphtypes.html)】：网格图"especially good when you need to **update the graph during runtime** (RTS/TD)"，**tag/penalty 权重表达精确可预测**（navmesh 更差）；经验阈值=网格 >400×400 才换 navmesh；navmesh 更新靠 carving（只能挖洞）或慢分块重算。**AGW 城市网格远小于 400×400 且需要权重+动态更新 → 网格 A* 是文档推荐区间，NavMesh 不做主寻路层**。

**流场寻路（SupCom2 / Elijah Emerson）**【单源（技术原创者亲述）：GameAIPro Ch.23 全文（[PDF](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf)）】
- 动机：SupCom1 每单位固定 A*→碰撞→重寻路→连锁碰撞"grind to a halt"。
- 结构：世界=sector(10×10m)×格(1×1m)，sector 间 portal 连图；**三种场**=cost field(8bit)/integration field(24bit)/flow field(8bit：4bit 方向+4bit 标志)；寻路=portal 图 merging A*→路径上每个 portal 提交流场请求；场构建=Eikonal 波前扩散+LOS pass（防目标周围菱形伪流向）；**flow field cache**（portal ID 缓存+引用计数）；动态墙→sector 标脏→**优先队列时间片重建**；steering 层混合新旧方向平滑+物理化推挤。
- 结论（原文）："moving **hundreds of units** to a goal" 且 "computationally cheap"；Red Blob Games 独立印证：一次波前=任意格到目标的最优方向（[塔防教程](https://www.redblobgames.com/pathfinding/tower-defense/)）。

**局部避让 ORCA/RVO**【已确认：[UNC GAMMA](https://gamma.cs.unc.edu/ORCA/) + [snape/RVO2](https://github.com/snape/RVO2)】：每对碰撞双方各负一半责任，每 agent 每帧解一个低维线性规划；"thousands of agents…in only a few milliseconds"（25,000 agent 麦加人群演示）。ORCA 是速度层避让，不管去哪（全局寻路互补）。**Unity 内置 NavMeshAgent 避让就是 RVO 家族**（官方手册），但稠密人群下数百 agent 即掉帧（社区多源共识）。

**Steering 行为集**【已确认：[Reynolds GDC 1999](https://www.red3d.com/cwr/steer/)】：三层=locomotion（机动限制/转向执行）←steering（seek/arrival/avoidance/flow field following 等）←strategy（全局寻路）。**flow field following 本身就是 Reynolds 行为集成员**——流场+steering 是官方组合。

**部队级寻路（Total War 实证）**【已确认：[CA 访谈](https://www.gamedeveloper.com/design/designing-i-total-war-warhammer-ii-i-to-handle-tons-of-units-and-massive-battles) 全文】：
- "battle logic…decoupled from display…**the logic generates the 'future' whilst the display renders the 'now'**"——逻辑跑在未来、可用多个显示帧计算（暂停/倍速的同构解）；
- **部队锚点寻路+士兵偏移跟随**（[A*PP 论坛](https://forum.arongranberg.com/t/formation-movement-all-agents-follow-one-path-but-offset-in-formation-arrangement/13450)、[Unity 经典帖](https://forum.unity.com/threads/pathfinding-formation.54136/)、[现成实现](https://github.com/Goodgulf281/Unity-Formation-Movement)）：寻路请求数=部队数（30 级）而非士兵数（3000 级）；
- Ultra 档步兵 160 人/队（社区多源）——同屏数千士兵是 RTT 常态；城市街道网对 AI 可通行性要**手工设计**。

**转向模型（重量感）**：Reynolds 三层中 locomotion 层承载机动限制；实现=受限角速度朝向逼近（MoveTowardsAngle 模式）+位移沿当前朝向积分→自然转弯弧线；坦克类加加减速上限；"网格 A* 加转弯半径约束"（Pinter 2001）可选后置【已确认原理/估算参数】。

### 7.2 群体渲染与动画

**方案谱系（1000~3000 人形同屏）**：
- **A. 逐单位 SkinnedMesh+Animator——不可行**：GPU instancing 不支持 SkinnedMeshRenderer（[piti6 仓库](https://github.com/piti6/UnityGpuInstancedAnimation) 原文）；每-unit Animator 不 scale——约 50 个人形即压力、`Animator.Update` 占 CPU>50% 案例（社区多帖共识）。
- **B. 动画烘焙纹理+GPU Instancing（业界标准）**【已确认：[GPU Gems 3 Ch.2](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering)（NVIDIA 2007 鼻祖）+piti6 实测锚点（81 bones/4 anims/8s@30fps=纹理 0.5MB）+GPU Instancer-Crowd（Compute Shader 蒙皮+instancing）】：骨骼矩阵烘进纹理，顶点着色器按 (instanceID, 时间) 取矩阵 GPU 蒙皮。
- **Unity API**【已确认·官方】：`DrawMeshInstanced` **硬上限 1023 实例/次**（MaterialPropertyBlock 下社区观察到降为 511）；`DrawMeshInstancedIndirect`/`RenderMeshIndirect` 实例数由 args buffer 给（官方示例一次 500 万），无剔除不排序 → **3000 士兵走 Indirect，按"兵种×阵营"分 batch（≈2~10 draw call，估算）**。
- **C. Sprite 小兵群（三国志12 路线）**【部分确认】：RTK12=系列首次实时部队制，部队视觉 2D 精灵+兵科标记（Famitsu 一手确认实时制；sprite 构成单源推断）——**美术降级预案，成立且更便宜**。
- LOD：Total War 官方确认动态 unit LOD 是 GPU 主手段；士兵 300~800 tri 低模+全身动画、近景武将高模 SkinnedMesh 混编【估算】。

### 7.3 空间数据结构与逻辑性能

- **broad-phase=均匀 spatial hash/grid 是单位密集移动的默认正解**【已确认：[Game Programming Patterns](https://gameprogrammingpatterns.com/spatial-partition.html)（示例即 RTS 战场）+社区多源对比（"均匀、频繁移动的对象用 spatial hashmap"）】：quadtree 单次查询/插入开销更高，对象非均匀分布才划算。索敌查询：**cell ≥ 2×典型索敌半径**时半径查询只扫本格+邻格（GPP 半邻居原则+社区经验值）。
- **千级 agent 主线程 Mono 可行性**：逐士兵"完整 agent"（物理+避让+寻路）**不可行**（NavMeshAgent 数百即掉帧，社区共识）；逐士兵"位置积分+编队偏移+分离力"**可行**（3000 次纯数学，Burst 后 <0.1ms 估算；ORCA 数学层千级几毫秒为上界锚点，一手）。
- **分帧（time slicing）**：Emerson 脏 sector 重建=优先队列+固定毫秒时间片（一手）；通用三策略=分桶轮转/预算窗口/优先级（[Allen Chou](https://allenchou.net/2021/05/time-slicing)）；每帧逻辑预算建议 1~2ms（估算）。
- **Burst 收益排序**【估算】：①移动积分（纯数学 SoA）②instance 矩阵写入（NativeArray 送 Indirect）③索敌邻格扫描；不划算：寻路请求（30 部队量级）/事件状态机（分支多量小）。数据层 NativeArray 化、Mono 只做薄壳。

### 7.4 战争迷雾/视野

**两手工程文结构互相印证**【已确认】：
- Riot（LoL，[原文](https://www.riotgames.com/en/news/story-fog-and-war)）：全图视野=**128×128 低清网格**（刻意低分辨率）；**gameplay 与表现分离**（逻辑=二值可见 flag；表现=放大 4×4+16 邻域图案+窄 Gaussian blur，可分离 blur+线性采样压成本；直接高分辨率"quadrupled CPU cost"）。
- Gemserk（Iron Marines，[原文](https://blog.gemserk.com/2018/08/27/implementing-fog-of-war-for-rts-games-in-unity-1-2/)）：sim 层每玩家 int 矩阵**视野计数器**（旧位 −1/新位 +1），敌可见=格>0，不可见 GameObject 切 hidden 层；渲染层 FogCamera→RenderTexture 反 alpha 叠图+模糊柔边；**双 RT**（FogTexture+PreviousVisionTexture Don't Clear）实现 unexplored(黑)/explored(灰)/visible(透明) 三态；丢失视野建筑显示"最后已知状态"替身（SC 同款）。
- **AGW 拆解**：sim=`byte[W×H]` 三态数组+计数器增量更新（**逻辑只读数组、绝不读渲染产物**）；渲染=双 RT+separable blur，minimap 共用纹理；天然支持 SC2 式"显示(当前可见)/暴露(曾可见)"两级状态。建议 sim 96×96~128×128、RT 256~512（估算）。

## 七b、对 AGW L3 的技术选型建议（寻路/群渲/性能/迷雾）

| 领域 | 推荐 | 备选/不采用 | 预算（估算级） |
|---|---|---|---|
| 寻路 | **部队级网格 A*（tag/penalty 权重，与 L2 城市格网同构）+多部队同目标叠加流场 tile（三场+cache+脏区时间片）；士兵无寻路只偏移跟随** | 全流场 portal 方案（部队目标多样不划算，后置）；武将近景演出可用 NavMesh（30 个量级安全） | 寻路总预算 <1ms/帧 |
| 不采用 | JPS 为主寻路（uniform-cost 限定不适用权重地图；30 部队请求量用不着） | — | — |
| 转向 | locomotion/steering 分层+受限角速度+加减速上限 | 转弯半径约束后置 | — |
| 群渲 | **士兵=低模+烘焙纹理蒙皮+RenderMeshIndirect（兵种×阵营分 batch）；武将=高模 SkinnedMesh** | DrawMeshInstanced 兜底（≤1023/次）；sprite 群=美术降级预案 | 3000×500tri≈1.5M tri/帧，中端 GPU 60fps 可行 |
| 动画 | 烘焙 5~8 clip×≤20 bones×30fps；程序混合切状态 | 逐士兵 Animator（明确不采用） | 纹理 ~0.5MB 量级（piti6 锚点） |
| 更新架构 | **固定步长确定性模拟（部队级逻辑+士兵轻量积分）+渲染插值**；暂停=不步进、倍速=多步进 | — | 每帧逻辑 1~2ms 预算 |
| broad-phase | 均匀 spatial hash（cell≥2×索敌半径） | quadtree（均匀移动对象不划算） | 千级查询毫秒内 |
| 分帧/Burst | 脏区/索敌/动画混合时间片；Burst=移动积分+矩阵写入+索敌扫描（NativeArray 化） | 状态机/寻路留主线程 | — |
| 迷雾 | **sim 三态数组+计数器增量；渲染双 RT+separable blur+minimap 共用** | 逐格布尔+纯色 quad（首版原型） | sim 96~128 格；增量更新可忽略 |
| 避让 | 部队级 RVO（30 agent）；士兵轻量分离力 | 逐士兵 ORCA（不需要） | ORCA 千级=毫秒级上界（一手） |

## 八、来源汇总

### 一手来源（本次直读）
- [Fix Your Timestep! — Gaffer on Games](https://gafferongames.com/post/fix_your_timestep/) · [Floating Point Determinism](https://gafferongames.com/post/floating_point_determinism/)
- [10000 Update() calls — Unity 官方博客](https://unity.com/blog/engine-platform/10000-update-calls) · [Time.timeScale 官方参考](https://docs.unity.com/en-us/engine/current/script-reference/unityengine/time/timescale)
- [ECSGalaxySample determinism.md — Unity 官方](https://github.com/Unity-Technologies/ECSGalaxySample/blob/main/_Documentation/determinism.md)
- [OpenRA Hacking 概览](https://raw.githubusercontent.com/wiki/OpenRA/OpenRA/Hacking.md) · [World.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/World.cs) · [Sync.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/Sync.cs)
- [Synchronous RTS Engines and a Tale of Desyncs — Forrest Smith](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/)
- [Game AI Patterns ch18 Formation Movement](https://www.socratopia.app/library/game-ai-patterns-en/chapter-18) · [TPS 转述 gdad.wiki](https://gdad.wiki/wiki/programming/game-ai/tactical-position-selection) · [Code Monkey DOTS RTS 课程页](https://unitycodemonkey.com/dotsfreecourse.php)

### 一手来源（已定位未直读，引用已标注）
- [1500 Archers on a 28.8（AOE GDC 论文）](https://zoo.cs.yale.edu/classes/cs538/readings/papers/terrano_1500arch.pdf) · [GameAIPro ch26 TPS PDF](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter26_Tactical_Position_Selection.pdf) · [GameAIPro2 ch30 影响力图 PDF](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf) · [AI Magazine RTS AI 综述](https://ojs.aaai.org/index.php/aimagazine/article/view/2478) · [Blizzard/s2protocol](https://github.com/Blizzard/s2protocol) · [0 A.D. 仓库](https://gitea.wildfiregames.com/0ad/0ad)/[DeepWiki](https://deepwiki.com/0ad/0ad) · [Burst FloatMode](https://docs.unity3d.com/Packages/com.unity.burst@1.2.3/api/Unity.Burst.FloatMode.html) · [Unity Network Update Loop RFC](https://github.com/Unity-Technologies/EntityComponentSystemSamples/blob/master/NetworkEntitySamples/Documentation/0008-network-update-loop.md) · [Spring 论坛](https://springrts.com/phpbb/viewtopic.php?t=37637) · [Warzone2100](https://github.com/Warzone2100/warzone2100) · [Glest](https://glest.org/en/engine.php) · [ChronoCam](https://www.forrestthewoods.com/blog/tech_of_planetary_annihilation_chrono_cam/index.html)

### 二手来源（社区/交叉印证）
- [OpenRA 确定性实证 gist](https://gist.github.com/koaning/835982a6b9b3898fc4d56fd651535dff) · [OpenRA-RL 架构页](https://openra-rl.dev/docs/architecture) · [SO 跨平台浮点](https://stackoverflow.com/questions/20963419/cross-platform-floating-point-consistency) · [Unity Update 基准帖](https://discussions.unity.com/t/a-lot-of-update-call-performance-test-results-why-unity-not-using-array/1542201) · [Megacity Metro 压测](https://discussions.unity.com/t/1700-players-in-megacity-metro-netcode-for-entities-loadtest/945952) · [BT/GOAP 选择](https://gamedev.stackexchange.com/questions/188831/behavior-trees-or-goap-for-rimworld-like-game) · [GOAP+BT 混合](https://www.reddit.com/r/gamedev/comments/z6af79/) · [AIIDE kiting 影响力图](https://ojs.aaai.org/index.php/AIIDE/article/download/12544/12395/16064) · [Michael Buro RTS AI](https://www.michaelburo.ca/) · [Unity ECS 官方页](https://unity.com/ecs)

### 缺口与风险提示
- 0 A.D. 源码注释/AI Magazine 综述未直读（反爬/拒答），相关结论依赖摘要转述；OpenRA RNG 具体实现（MT19937 一说）未核验；GameAIPro 两章 PDF 为定位引用。需要时可用浏览器通道补读。

### 寻路/群渲/性能半场来源（第二工兵）

#### 一手（论文/官方文档/技术原创者/开发者访谈）
- [GameAIPro Ch.23 Emerson 流场 tile（SupCom2，全文）](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf) · [Harabor & Grastien JPS (AAAI-11)](https://harabor.net/data/papers/harabor-grastien-aaai11.pdf) · [Red Blob Games 塔防流场](https://www.redblobgames.com/pathfinding/tower-defense/)
- [UNC GAMMA ORCA](https://gamma.cs.unc.edu/ORCA/) · [snape/RVO2](https://github.com/snape/RVO2) · [Reynolds Steering (GDC99)](https://www.red3d.com/cwr/steer/) · [A*PP Graph Types](https://arongranberg.com/astar/docs/graphtypes.html)
- [CA 访谈：Total War WH2 大规模战斗](https://www.gamedeveloper.com/design/designing-i-total-war-warhammer-ii-i-to-handle-tons-of-units-and-massive-battles) · [GDC Vault TW:3K Instancing](https://www.gdcvault.com/play/1026177/Instancing-and-Order-Independent-Transparency)
- [Unity：NavMesh Inner Workings（内置=RVO）](https://docs.unity3d.com/2017.1/Documentation/Manual/nav-InnerWorkings.html) · [DrawMeshInstanced（1023 上限）](https://docs.unity3d.com/6000.2/Documentation/ScriptReference/Graphics.DrawMeshInstanced.html) · [DrawMeshInstancedIndirect (2022.3)](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/Graphics.DrawMeshInstancedIndirect.html) · [Mecanim 性能官方](https://docs.unity.com/en-us/engine/6000.6/manual/animation-section/animation-mecanim/mecanim-peformanceand-optimization) · [Job System Overview](https://docs.unity3d.com/2022.3/Documentation/Manual/JobSystemOverview.html)
- [GPU Gems 3 Ch.2 Animated Crowd Rendering](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering) · [piti6/UnityGpuInstancedAnimation](https://github.com/piti6/UnityGpuInstancedAnimation) · [GPU Instancer Crowd 发布帖](https://discussions.unity.com/t/released-gpu-instancer-crowd-animations/741394)
- [Game Programming Patterns Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html) · [Allen Chou Time Slicing](https://allenchou.net/2021/05/time-slicing/) · [Gemserk 迷雾 (Iron Marines)](https://blog.gemserk.com/2018/08/27/implementing-fog-of-war-for-rts-games-in-unity-1-2/) · [Riot A Story of Fog and War (LoL)](https://www.riotgames.com/en/news/story-fog-and-war)

#### 二手（社区交叉/单源标注）
- HPA*：[ResearchGate](https://www.researchgate.net/publication/228785110_Near_optimal_hierarchical_path-finding_HPA) · 编队锚点：[A*PP 论坛](https://forum.arongranberg.com/t/formation-movement-all-agents-follow-one-path-but-offset-in-formation-arrangement/13450)/[Unity 论坛](https://forum.unity.com/threads/pathfinding-formation.54136/)/[Goodgulf281 实现](https://github.com/Goodgulf281/Unity-Formation-Movement) · TW 单位规模：[r/totalwar](https://www.reddit.com/r/totalwar/comments/b3d5rm/on_extreme_unit_size_there_will_be_240_models_per)/[totalwar.org 表](https://forums.totalwar.org/vb/showthread.php/36860-Unit-Size-Setting-Comparison-Chart) · 空间结构对比：[gamedev.SE](https://gamedev.stackexchange.com/questions/69776/when-is-a-quadtree-preferable-over-spatial-hashing)/[gamedev.net](https://www.gamedev.net/forums/topic/661021-quad-trees-vs-r-trees-vs-spacial-hashmaps) · NavMeshAgent 规模：[Reddit](https://www.reddit.com/r/Unity3D/comments/9vuunm/navmechagents_cause_terrible_performances_issue)/[Unity Discussions](https://discussions.unity.com/t/too-many-navmeshagents-too-complex-navmesh-causing-movement-delay/920275) · Animator 规模：[862247](https://discussions.unity.com/t/animator-controller-performance/862247)/[102658](https://discussions.unity.com/t/animator-update-has-high-cpu-usage/102658) · 1023 上限佐证：[723510](https://discussions.unity.com/t/gpu-instancing-count-limit/723510)
