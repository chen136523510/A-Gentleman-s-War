# AGENTS.md — A Gentleman's War（国男志）行为指令

> 本文件是 ZCode 在本仓库的统一行为指令。**必须精简（≤120 行）**——上下文成本纪律。

## 一、项目定位

**A Gentleman's War（《国男志》）**：仿三国志 12 的现代架空策略经营游戏（东亚微缩地图 14 城：东亚 11+澳洲 3 含达尔文无主村落 / CN·JP·KR·AU 四阵营+NONE / 学院 21 群友为武将）。独立项目、独立仓（对齐 nono 先例），从主仓 nandexueyuan 迁移而来（迁移清单见 `docs/04-技术笔记/设计文档与工程经验迁移清单.md`）。

- 引擎：**Unity 2022.3.62f3c1 LTS（中国版）+ URP 2D Renderer**；编辑器 `F:\Unity\unityEditor1.0\2022.3.62f3c1`；构建链 VS2022
- 使命：**打包单机可执行文件发给朋友直接玩**——一切技术选型为此服务
- 设计权威：`docs/06-设计/`（00-总纲 ~ 07-技术架构 八模块，自主仓整树迁入）；L1 大地图 Web 验证版已在主仓归档（画风定调=三国群英传7 参考写实）
- 铁律（原 R1 设计约束，继续有效）：L1/L2/L3 三层同一份数据；每城独一无二；数值一期成型后统一微调；负反馈纪律（不教玩家/前期少战事）；单局时长不设上限

## 二、技术栈

| 层 | 技术 | 备注 |
|---|---|---|
| 引擎 | Unity 2022.3.62f3c1（中国版） | URP，2D；官方 MCP 不可用（<Unity 6），社区 unity-mcp 替代 ⛏待接线 |
| L1 底图 | 离线烘焙大纹理（2560×1440 Seedream 写实卫星底图，`Assets/_Project/Art/Map/`） | 烘焙器=`tools/bakery/`（cities 模式）；运行时只做相机/交互 |
| 数据 | `Assets/_Project/Data/*.json`（cities/geo-coastlines/links） | 运行时 JsonUtility/Newtonsoft 读取；一份服三层数据 |
| 城市贴图 | `Assets/_Project/Art/Cities/` 14 张（Seedream 写实城图；13 城+达尔文村落） | 管线与登记见 `docs/07-美术/` |
| AI 直驱 | unity-mcp（社区版）⛏ 待接线 | 接线后补环境笔记 |

## 三、设备身份与协作模式

- **双机分工（R24i 院长定）**：**黑机=全部内容**（工程/美术/出图/构建/场景，RTX 4070 + Unity 所在机）；**白机=仅文档**（`docs/`、`.ai/handoff.md`、CHANGELOG/AGENTS 等文档），**完全不接触代码**——`Assets/`、`Packages/`、`ProjectSettings/`、`Builds/`、`tools/` 一律不动，不装 Unity、不跑 LFS 大件。白机 clone 用 sparse-checkout 只拉 docs（见 `docs/04-技术笔记/GitHub建仓与双机协作.md`）。每次会话起手读 `.ai/handoff.md` 恢复状态
- **三段式协作（长期有效）**：主会话（满血）出规划/施工单 → 院长切 flash 窗口执行 → 回主会话验收。flash 工兵定义在 `.zcode/agents/flash-executor.md`；**代码/美术/构建只允许黑机执行，白机只接文档任务**
- **GitHub 纯文档仓（R24j 院长定）**：<https://github.com/chen136523510/A-Gentleman-s-War> **只放文档**（`docs/`、`.ai/`、`AGENTS.md`、`CHANGELOG.md`、`README.md`）；`Assets/`/`Packages/`/`ProjectSettings/`/`Builds/`/`tools/`/`local/`/`tmp/`/`.zcode/` 等代码/工程/美术/构建**一律不入库**。本地 `G:\A Gentleman's War-docs` = 文档仓 `main`（origin=GitHub，权威）；`G:\A Gentleman's War` = 全量代码仓 `master`，**不配 remote**，代码只留黑机。黑机用 `tools/sync-docs-repo.ps1 pull` 把文档仓镜像进全量仓；白机只 clone 文档仓
- 每次会话结束：代码提交到本地 `master`（**不 push**）；文档在本仓/文档仓提交并 push；更新 handoff/changelog。白机提交前缀 `[docs]`

## 四、目录纪律

- **Assets/_Project/** = 自有资产唯一根（Art/Scripts/Scenes/Prefabs/Data/Audio）；第三方走 UPM/Packages，不散落 Assets
- **meta 文件必须随资产一起提交**；Assets 内英文命名，docs/ 用中文
- 新建文件先查后建；**过程/调试产物一律进根 `tmp/`**（git 忽略；勿用 temp——Windows 不分大小写撞 Unity 的 Temp/）
- **`local/` = 美术源文件本地专区**（git 忽略）；定版资产才进 `Assets/_Project/` 走 LFS
- 场景 .unity 归黑机单人管

## 五、文档与 Git 纪律

- **需求**：`docs/01-需求/需求池.md`（一需求一条目，R 编号延续主仓 R-059 起步）；决策落 `docs/02-决策/`（adr-generator）；踩坑/环境落 `docs/04-技术笔记/`（一主题一文件）；bug 登记 `docs/03-bug/bug-log.md`（BUG-Gxxx 编号，只读顶部索引）
- **美术**：`docs/07-美术/`（美术纪律全文迁入 + 资产登记表——凡入 Assets 的图必须登记实际内容）；ComfyUI 出图管线见登记文档 §二
- **CHANGELOG** 根目录倒序（接口/架构变更必落档）；commit 格式 `[feat|fix|refactor|chore|docs](模块): 动作及意图`，禁模糊词
- **LFS 大件**：GitHub **纯文档仓不走 LFS**；全量代码仓若日后配私有远程，贴图/音视频/模型仍走 LFS（免费 1GB+1GB/月，超限请示院长）；push 前 fetch 防覆盖
- 主仓（nandexueyuan）关系：设计文档历史版本+Web 验证资产仍在主仓归档（只读）；**设计文档以纯文档仓（GitHub）为唯一权威**；黑机全量仓 `docs/` 是工作镜像（`tools/sync-docs-repo.ps1 pull`）；改设计优先改文档仓

## 六、红线

1. **禁止未经确认调用 AI 生成 API**（Seedream/Seedance 等付费 API）——提示词须经院长确认；ComfyUI 本地出图免费可用（提示词仍建议展示）
2. **美术过程件不入库**（源文件留 `local/`，定版才进 `Art/`）；禁止提交敏感文件
3. 单机项目无部署线——打包 exe 属黑机本地产物，分发由所有者执行；发布节奏定版化（build 存 `Builds/`，git 忽略）
4. 成本纪律：全免费/开源路线（引擎个人版/ComfyUI/自研），商用订阅一律先请示

## 七、上下文成本纪律

1. 会话起手只读本文件 + `.ai/handoff.md`，设计细节按需下钻 `docs/06-设计/` 对应模块
2. 禁止全量加载所有设计文档；changelog/bug-log 只读顶部索引
3. AI 会话产出：代码进 Assets/_Project，文档进 docs/，过程件进 tmp/，别处不放
