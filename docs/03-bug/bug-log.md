# bug-log — A Gentleman's War

> 阅读纪律：**只读下方快速索引表**，需要细节再下钻对应条目。编号 BUG-Gxxx（G=Gentleman's War），全局连续不重编。
> 写记录保持「索引行 + 正文条目」成对存在；字段：发现时间、环境、现象、根因、修复、教训。

## 快速索引

| 编号 | 一句话 | 日期 |
|---|---|---|
| BUG-G006 | 院长两次反馈「空白」真身=**编辑器 Game 视图不 Play 时只有相机背景色**（地图是运行时构建的，编辑态什么都没有）；修=L1MapBuilder 加 ExecuteAlways 编辑态预建世界层（底图/航路/城池，DontSave 不落盘），打开场景即见地图；UI（标签/菜单）仍为 Play 后构建 | 2026-10-25 |
| BUG-G005 | ESC 菜单三按钮文字全部溢出按钮右缘：MakeMenuButton 里按钮文字 Text 锚点 (1,1)+sizeDelta 0+pivot 残留 (0,1) → 零尺寸矩形悬在按钮右上角，文字从角点向外画；修=四向拉伸锚点(0,0)→(1,1)+pivot 重置中心。附带清掉 UI 构建时 30+ 条「Can't add component 'RectTransform'」警告刷屏（uGUI 组件 RequireComponent 已自动带 RectTransform，再显式 typeof(RectTransform) 即冲突） | 2026-10-25 |
| BUG-G004 | exe 双击全屏启动的偏好会被注册表 HKCU\Software\AGW 覆盖（旧残留在会还原坏状态）；修=PlayerSettings 显式 FullScreenWindow(无边框)+默认 1920×1080+可缩放窗口；若再现空白先清注册表键再验 | 2026-10-25 |
| BUG-G003 | uGUI 按钮全部无响应：代码建 Canvas 只挂 Canvas/CanvasScaler，缺 GraphicRaycaster + 场景缺 EventSystem → 按钮命中检测不存在；修=Canvas 挂 GraphicRaycaster+运行时建 EventSystem(StandaloneInputModule)。exe 全屏实测按钮点击/悬停高亮均正常 | 2026-10-25 |
| BUG-G002 | exe 打包后航路材质 Shader.Find 返回 null → Material 构造抛 ArgumentNullException → Awake 中断 → **游戏窗口全空**（编辑器不暴露：Shader.Find 在编辑器内永远找得到）；修=材质资产化（场景引用 URP 包内 Sprite-Lit-Default.mat，必然进包） | 2026-10-25 |
| BUG-G001 | 手写 C# 两连编译错致 Unity Safe Mode：①TextAsset 无隐式布尔被三元使用②AgwMenu 用 BuildResult 漏 using UnityEditor.Build.Reporting——教训：无本地编译器时必须跑类型-命名空间静态审计（tools/audit-csharp-usings.py 已转正） | 2026-10-25 |

---

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
