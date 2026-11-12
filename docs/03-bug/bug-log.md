# bug-log — A Gentleman's War

> 阅读纪律：**只读下方快速索引表**，需要细节再下钻对应条目。编号 BUG-Gxxx（G=Gentleman's War），全局连续不重编。
> 写记录保持「索引行 + 正文条目」成对存在；字段：发现时间、环境、现象、根因、修复、教训。

## 快速索引

| 编号 | 一句话 | 日期 |
|---|---|---|
| BUG-G013 | 消费池口径三冲突：①文档定稿池系数 **2.5** 财/千人/回，v17a/v21 模拟报告却用 **4.0**（另含未定义乘区"欲望×民用就业"）；②商业区开题残留废弃口径"商场=人口/1000×2"（消费力专题已废：随人口版导致任何城恒 1.25 座饱和）；③"消费力/消费池/消费力池"三名混用、术语表无词条。**文档侧已修（11-12），模拟器待核并按 2.5 重跑** | 2026-11-12 |
| BUG-G012 | 建筑目录双源：模拟器 CAT 150 条 vs `buildings.json` 126 条——13 个 legacy/重复 ID（school/research/police/internet/nuclear…）与新版并存，30 条 draft 无输出字段；v21 实际只用到 46/150 类型，审计噪声大 | 2026-11-12 |
| BUG-G011 | v21 战争滚雪球过强：300 局 10/10 种子均由 CN 统治胜利（13 城），military 倾向 5/5 速胜；弱国无防御/恢复/外交反制，统治胜利单一 | 2026-11-12 |
| BUG-G010 | v21 科技胜利 200/300 局均未出现：需求 AI 无科技终局拉力，t200 科技节点仅 10~19/38，工程未完成；tech 倾向 0/5 胜利 | 2026-11-12 |
| BUG-G009 | L2 建筑标记与底图**融合度不足**（badge+描边占位表达 vs 有机融合）——院长判"建筑在地图上完全贴图味道"；未修，方向=L2 运行时用真建筑 sprite（影子/接地/透视一致），UI 标记层只做占位 | 2026-11-08 |
| BUG-G008 | L2 烘焙图**平铺单元边界仍可察觉**（偏移+羽化混合后海面/城区大尺度仍见直线割裂与旋转重复）——羽化算法对"非真无缝纹理"有上限；未修，方向=同地形多变体纹理池/更大源纹理/图像接缝修补（inpaint） | 2026-11-08 |
| BUG-G007 | 军事链双口径冲突：MilitaryTick 国家层征募的兵力**下一回合被 SyncFactionArmy 城级重算冲掉**（征募不落城级驻军、城级重算反向覆盖）；未修，征募落点（城驻军 vs 国家军力池）留军事流程细则裁决 | 2026-11-08 |
| BUG-G006 | 院长两次反馈「空白」真身=**编辑器 Game 视图不 Play 时只有相机背景色**（地图是运行时构建的，编辑态什么都没有）；修=L1MapBuilder 加 ExecuteAlways 编辑态预建世界层（底图/航路/城池，DontSave 不落盘），打开场景即见地图；UI（标签/菜单）仍为 Play 后构建 | 2026-10-25 |
| BUG-G005 | ESC 菜单三按钮文字全部溢出按钮右缘：MakeMenuButton 里按钮文字 Text 锚点 (1,1)+sizeDelta 0+pivot 残留 (0,1) → 零尺寸矩形悬在按钮右上角，文字从角点向外画；修=四向拉伸锚点(0,0)→(1,1)+pivot 重置中心。附带清掉 UI 构建时 30+ 条「Can't add component 'RectTransform'」警告刷屏（uGUI 组件 RequireComponent 已自动带 RectTransform，再显式 typeof(RectTransform) 即冲突） | 2026-10-25 |
| BUG-G004 | exe 双击全屏启动的偏好会被注册表 HKCU\Software\AGW 覆盖（旧残留在会还原坏状态）；修=PlayerSettings 显式 FullScreenWindow(无边框)+默认 1920×1080+可缩放窗口；若再现空白先清注册表键再验 | 2026-10-25 |
| BUG-G003 | uGUI 按钮全部无响应：代码建 Canvas 只挂 Canvas/CanvasScaler，缺 GraphicRaycaster + 场景缺 EventSystem → 按钮命中检测不存在；修=Canvas 挂 GraphicRaycaster+运行时建 EventSystem(StandaloneInputModule)。exe 全屏实测按钮点击/悬停高亮均正常 | 2026-10-25 |
| BUG-G002 | exe 打包后航路材质 Shader.Find 返回 null → Material 构造抛 ArgumentNullException → Awake 中断 → **游戏窗口全空**（编辑器不暴露：Shader.Find 在编辑器内永远找得到）；修=材质资产化（场景引用 URP 包内 Sprite-Lit-Default.mat，必然进包） | 2026-10-25 |
| BUG-G001 | 手写 C# 两连编译错致 Unity Safe Mode：①TextAsset 无隐式布尔被三元使用②AgwMenu 用 BuildResult 漏 using UnityEditor.Build.Reporting——教训：无本地编译器时必须跑类型-命名空间静态审计（tools/audit-csharp-usings.py 已转正） | 2026-10-25 |

---

## BUG-G013 · 消费池口径三冲突（参数 2.5 vs 4.0 / 商场废弃公式残留 / 术语三名混用）

- 发现时间：2026-11-12（院长令"列出消费概念定义和公式检查"）
- 环境：`消费力专题` / `商业区开题` / `文化区数值` / v17a 报告 / 术语表
- 现象：①**池系数双口径**——文档定稿 `消费力 = 民用人口/1000 × 2.5 财/回`（消费力专题 §三、文化区数值 §七、百科 `consumptionPoolK=2.5`），但 v17a 报告写"消费力池：总池 **4.0** 财/千人/回"，且含文档未定义的乘区"欲望 × 民用就业"；v21 延续该盘。②**商场废弃公式残留**——商业区开题主表与 §4.5③ 还写着"人口/1000×2"（消费力专题 §三已明确废弃：随人口版使池/单座比恒 1.25、任何城都 1.25 座饱和）。③**术语三名混用**——消费力/消费池/消费力池，术语表无任何消费词条。
- 根因：11-05 定稿后模拟器未回改参数（或引入了未文档化的"欲望"乘区）；11-12 消费池扩为 60/25/15 时只改了文化区一侧，商业区开题未同步；术语从未入术语表。
- 修复：**文档侧已修（11-12 白机）**——消费力专题统一公式（本类份额剩余口径）、新增 §1.1 同池分配公式（固定份额+剩余回流）、商业区开题废弃口径全部替换、术语表补消费/消费力/消费池/消费回收/消费饱和/消费份额 6 词。**模拟器侧未修**：待黑机核对 `sim-full` 实现的池系数与"欲望"乘区，按 **2.5** 重跑（v22 一并）；v11d-c 是否实现"吃不完回流"同批核对。
- 教训：**参数定稿后必须回写模拟器，报告要标注所用参数版本**；同一公式只能有一个权威出处，其余文档只许引用不许复写。

## BUG-G012 · 建筑目录双源：legacy/重复 ID + 无输出 draft

- 发现时间：2026-11-12（v21 全量盘建筑使用审计）
- 环境：`tmp/sim-full-v21.js` + `Assets/_Project/Data/buildings.json`
- 现象：模拟器 CAT 150 条，`buildings.json` 126 条；v21 mixed seed1 实际使用 46/150。未建 118 条中 13 条是旧 CAT legacy/重复 ID（school/research/police/internet/nuclear 等与新版 academy/policeStation 等并存）、84 条 draft、21 条非 draft、30 条无输出字段。
- 根因：v17a 旧 CAT 与新版 buildings.json 未合并；draft 建筑没有统一角色/产出映射；AI 需求规划器无法给无输出建筑打分。
- 修复：未修。方向=①删/合并 13 个 legacy 重复 ID；②给 draft 补 `category/tags/产出` 或标“未定稿不入内容池”；③审计以最终城市建筑为准（v21 已改）。
- 教训：**内容全量盘的前提是目录单源**；双源会让“未使用”无法区分设计漏洞与数据重复。

## BUG-G011 · v21 战争滚雪球过强，统治胜利单一 CN

- 发现时间：2026-11-12（v21 200/300 种子扫描）
- 环境：v21 动态宣战/占领/灭国/统治胜利
- 现象：200 局 mixed 5/10 种子 CN 统治；300 局 10/10 种子 CN 统治（13 城）；military 倾向 5/5 速胜（t119~151）；commercial/industrial 2/5；tech/green 0/5。
- 根因：CN 初始 6 城/10 将，战争胜者每场占一城且建筑/人口随城转移；弱国无防御加成/外交反制/恢复窗口，滚雪球不可逆。
- 修复：未修。方向=①一次战役只割一城/设停战冷却；②弱国防御/城防加成；③外交/联合国制衡；④按剧本给弱国初始补偿。
- 教训：**滚雪球是特性，但不能让结局在开局就确定**；需要给弱国“止损/翻盘”机制。

## BUG-G010 · v21 科技胜利缺失（200/300 均无）

- 发现时间：2026-11-12（v21 多倾向盘）
- 环境：v21 需求驱动 AI + 科技树/工程
- 现象：t200 科技节点 CN10~19/38、JP 等更低；200/300 局无科技胜利；tech 倾向 0/5 胜利。
- 根因：需求 AI 的 science need 只在“落后领先者”时升高，所有阵营同步落后→无人拉科技；学院/研究院/工程缺少阶段目标与终局拉力；工程攒钱被战争/维护挤压。
- 修复：未修。方向=①科技胜利倒计时/阶段目标（t80 后 science 基线上升）；②学院/研究院/工程前置的 AI 权重；③tech 倾向的工程攒钱优先级。
- 教训：**“科技胜利是常规获胜手段”必须在 AI 需求函数里显式存在**，不能只靠落后差。

## BUG-G009 · L2 建筑标记与底图融合度不足（"贴图味道"）

- 发现时间：2026-11-08（院长看 L2 样张 v7，红框批注"建筑在地图上也是完全贴图味道"）
- 环境：L2 UI 样张（烘焙底图+HTML 交互层）；同样适用于未来 Unity L2 运行时
- 现象：建筑用 badge 图标+描边占位框表达，浮在写实航拍底图上，无影子/无接地/无透视一致性——信息可读但"贴图味道"重
- 根因：样张阶段建筑=纯 UI 标记层，没有 sprite 化（无接地阴影、无与地表的光照统一、无建筑自身纹理细节）
- 修复：未修。方向=①L2 运行时改用真建筑 sprite（FLUX/Seedream 出单体顶视图，接地阴影烘焙进图）②占位期先把 badge 缩小、footprint 填充透明度再降，弱化"贴纸感"③建筑档位纪律（小区档基线已认）继续执行
- 教训：**"信息正确"与"视觉融合"是两条验收线**——院长明确要求截图自评走视觉标准，不能只验交互逻辑

## BUG-G008 · L2 烘焙图平铺单元边界仍可察觉

- 发现时间：2026-11-08（院长看 v8 全图，批注"完全是割裂的"+"依旧不平滑"）
- 环境：tools/l2planner/bake_art.py 区域分层合成（随机偏移平铺+边缘羽化前向混合 v2 算法）
- 现象：海面大尺度仍有直线割裂带（平铺单元边界两侧波纹方向/亮度突变）；城区旋转重复感仍在
- 根因：源纹理不是真无缝——任何平铺/旋转/偏移组合在"单元边界"两侧内容不连续，羽化只能让突变变宽变软，不能消除内容不连续；海面波纹方向性强，羽化后依旧可辨
- 修复：未修（院长令：先记录，以后再修）。方向（按性价比）：①**同地形多变体纹理池**（同提示词不同 seed 出 3~4 张，混合使用降低同图重复）②更大源纹理（2048 出图，GPU 允许时）③图像接缝修补（inpaint 类后处理）④海面改程序化着色器渲染（运行时方案，彻底无缝）
- 教训：FLUX"seamless"提示词产出的纹理只是"内容适合平铺"，不是数学无缝；**无缝必须靠算法混合或多变体掩护**，提示词解决不了

## BUG-G007 · 军事链双口径冲突：国家层征募兵力被城级重算冲掉

- 发现时间：2026-11-08（建造系统最小版自测，兵营初始 5 城新基线 `tmp/sim-report-barracks5-baseline.txt`）
- 环境：C# BatchSimulation 200 回合（军事链 v2 + 建造系统 f38b944）
- 现象：MilitaryTick 征募产生的兵力当回合生效，**下一回合被 SyncFactionArmy 城级重算冲掉**——征募结果不落城级驻军，城级重算反向覆盖国家层增量；伴随现象=CN/WLT 财被征募花空（征募按财/兵持续扣费但兵力不积累）
- 根因：军事链 v2 存在**国家层军力池与城级驻军两套口径**，SyncFactionArmy（城级重算）与 ForceRecruit/MilitaryTick（国家层征募）数据流向未定——征募增量没有持久化载体
- 修复：未修。征募落点（城驻军 vs 国家军力池）属设计口径，随 ③L1 战争流程细则 一起裁决后修
- 关联：财被征募花空与挂账 #1「财的出口」同源（B12 财政侧）
- 教训：国家层/城层双口径必须先定**单向数据流**（谁写谁读），否则任何增量都会在重算时被静默回滚

## BUG-G006 · 编辑器 Game 视图「空白」=编辑态无预览（运行时构建的反面代价）

- 发现时间：2026-10-25（院长截图指认：Game 视图非 Play 状态整片钢蓝色）
- 环境：Unity 编辑器，L1Map 场景非 Play 状态
- 现象：Game 视图只有相机背景色（0.165/0.373/0.502 钢蓝），Hierarchy 仅 Main Camera/L1Map/Global Light 2D
- 根因：地图全部由 L1MapBuilder.Awake() **运行时构建**——编辑态不执行 Awake，场景里没有一砖一瓦；exe/Play 正常、编辑态空白。「空白」是两拨人看到的两个东西（院长=编辑器 Game 视图；此前 BUG-G002=exe）
- 修复：`[ExecuteAlways]` + OnEnable 编辑态预建**世界层**（底图/航路/城池+落影），产物 hideFlags=DontSave 不落场景文件；域重载后按命名清单 PurgePreview 清旧建新；Update 加 isPlaying 守卫（编辑态零交互零逐帧开销）。UI 层（标签/tooltip/菜单）保持运行时构建（含交互逻辑，编辑态无意义）
- 教训：**「运行时构建」必须补「编辑态预览」，否则编辑器里游戏等于不存在**——院长验收第一眼就是 Game 视图；同一句「空白」要先问清是 exe 还是编辑器

## BUG-G005 · ESC 菜单按钮文字溢出按钮右缘（全分辨率可见）

- 发现时间：2026-10-25（本轮 exe 全屏识图验收，ESC 打开菜单即现）
- 环境：Windows Player 2560×1440 无边框全屏；编辑器同样复现（纯布局 bug）
- 现象：「存 档 / 读 档 / 退出游戏」三按钮的文字全部画在按钮矩形右缘之外，按钮内空白
- 根因：`MakeMenuButton` 给按钮文字设 `anchorMin = anchorMax = (1,1)` 且 `sizeDelta = 0`，而 `MakeText` 预设的 pivot (0,1) 未重置——Text 得到一个**悬在按钮右上角的零尺寸矩形**，Overflow 模式下文字从该点向外绘制
- 修复：文字改四向拉伸（anchorMin (0,0) / anchorMax (1,1) + 零边距）并重置 pivot 为中心；实测三按钮文字居中
- 附带修复：UI 构建 30+ 条 `Can't add component 'RectTransform'` 警告刷屏——uGUI 组件（Text/Image/Button）自带 `RequireComponent(RectTransform)`，`new GameObject(name, typeof(Image), typeof(RectTransform))` 显式再加必然冲突；全部改为只传 UI 组件。修复后单次启动警告 0 条
- 教训：**uGUI 里给 Text 摆位时先想清楚「锚点+pivot+sizeDelta」三元组**；拉伸锚点（min≠max）下 pivot 不参与布局，点锚点（min=max）下三者共同决定矩形——代码里 pivot 残留是最常见的隐形杀手；**识图验收要看菜单内部，不能只看地图渲染**

## BUG-G004 · exe 全屏启动偏好被注册表覆盖（空白问题嫌疑链一环）

- 发现时间：2026-10-25（上轮登记于 AgwMenu 注释，本轮落档+实测）
- 环境：Windows Player；Unity 存屏偏好位置 `HKCU\Software\AGW\A Gentleman's War`
- 现象：用户侧 exe 双击启动出现空白，而自验管线 `-screen-fullscreen 0` 窗口化启动始终正常——两条启动路径的差异全在屏参
- 根因：Unity Player 的分辨率/全屏模式偏好持久化在注册表，**优先于 PlayerSettings 默认值**；若曾存过坏状态（如独占全屏失败分辨率），后续启动还原坏状态
- 修复：构建时显式 `PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow`（无边框全屏，兼容性最好）+ 默认 1920×1080 + `resizableWindow = true`；本轮清注册表残留后双击式全屏启动实测渲染正常（2560×1440）
- 教训：**exe 行为问题先分清启动路径**（双击 vs 带参自验），注册表偏好是 Unity Player 的隐形配置层；复现「只有某些机器/某些时候」的屏参问题先查 `HKCU\Software\<公司名>`

## BUG-G003 · uGUI 按钮全部无响应（缺 GraphicRaycaster + EventSystem）

- 发现时间：2026-10-25（上轮发现并修复于工作区，本轮提交+实测确认）
- 环境：编辑器与 Player 均复现（纯代码构建 UI 的通病）
- 现象：ESC 菜单能显示，但存档/读档/退出按钮点击无任何反应
- 根因：`BuildUi()` 只创建了 `Canvas + CanvasScaler`——**缺 `GraphicRaycaster`**（Canvas 无射线器=命中检测不存在）且全场景**无 `EventSystem`**（无输入分发）；两者缺一按钮即死
- 修复：Canvas 挂 `GraphicRaycaster`，运行时创建 `EventSystem + StandaloneInputModule`；本轮 exe 全屏实测按钮点击（存档落盘/读档回显/退出干净关闭）与悬停高亮全部正常
- 教训：**uGUI 三件套缺一不可：Canvas + GraphicRaycaster + EventSystem**；「UI 显示正常」≠「UI 可交互」，验收必须点一遍

## BUG-G002 · 打包后 Shader.Find 为 null → 游戏窗口空白（仅 Player 复现）

- 发现时间：2026-10-25（院长验收：exe 构建成功但"Game 窗口什么都没有"）
- 环境：Unity 2022.3.62f3c1 + URP 14.0.12；Windows Player
- 现象：exe 启动后画面全空（相机背景色都没有的城市/航路/标签）；Player.log 报 `ArgumentNullException: shader at Material..ctor ← L1MapBuilder.BuildRoutes`
- 根因：`Shader.Find("Universal Render Pipeline/2D/Sprite-Lit-Default")` **在打包后返回 null**——该 shader 无任何资产引用时不进包（Shader.Find 只对已包含的 shader 生效）；`new Material(null)` 抛异常打断 `Awake`，整个地图构建中止。编辑器里 Shader.Find 永远可用 → 编辑器验证掩盖此 bug
- 修复：材质资产化——场景 `routeMaterial` 字段引用 URP 包内 `Runtime/Materials/Sprite-Lit-Default.mat`（guid a97c105638bdf8b4a8650670310a4cd3），被场景引用=shader 必进包；运行时 `Instantiate` 出实例再贴虚线纹理；编辑器内 Shader.Find 仅作兜底。附带修复：CS0109（删多余 new）、菜单启动 exe 改绝对路径（Win32Exception 根因=相对路径+编辑器 CWD 不定）
- 教训：**Unity 打包资源包含规则：Shader.Find/动态加载只对"被引用或显式包含"的资产生效——运行时用 shader 必须走资产引用**；"编辑器能跑"≠"包能跑"，**验收必须在真实 exe 上做**（tools/verify-build.bat 无头构建+启动自验管线已建立）

---

## BUG-G001 · 手写 C# 编译错误两连（Safe Mode 两次拦截）

- 发现时间：2026-10-25（R22/R23 之间，院长两次被 Safe Mode 拦）
- 环境：Unity 2022.3.62f3c1；错误来自 AI 在无本地编译条件下手写 C# 直接入仓
- 现象：打开项目弹 Safe Mode「The project you are opening contains compilation errors」
- 根因：①R21 夜写入的 L1MapBuilder.cs 把 TextAsset 放进三元布尔（TextAsset 无隐式 bool 转换，CS1503 系）；②修复①后第二错暴露——AgwMenu.cs 引用 `BuildResult` 但缺 `using UnityEditor.Build.Reporting;`（CS0103）。两次都因只修首错未全量复扫
- 修复：两处分别改正；新增 `tools/audit-csharp-usings.py`（标识符→命名空间对账静态审计，四个脚本全过）
- 教训：**没有编译器的环境下写 C#，入库前必须过静态审计清单**（using 域/Unity 版本专属 API/文件全量复扫，不能只看报错行）；Unity 报错格式 `文件(行,列): error CSxxxx` 要逐条清零才算修完
