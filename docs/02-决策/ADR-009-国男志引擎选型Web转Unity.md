# ADR-009 · 国男志引擎选型：Web Canvas 验证后转向 Unity

> 状态：✅ 已接受（2026-10-24 院长拍板）
> 关联：R-059 · [07-技术架构/changelog R16~R18](../06-设计/07-技术架构/changelog.md) · 先例 ADR/纪要：nono 仓 Unity 2022.3 定版（2026-10-11）
>
> 📌 后记（R19 落地，2026-10-24）：决策已全部执行——①仓已建：**A Gentleman's War**（本仓，`G:\A Gentleman's War`，Unity 2022.3.62f3c1 + URP 2D）；②决策 3 中"仓名待定"已解决；③决策 4 中"主仓保留设计文档权威"**已被 R19 迁移取代**——设计权威随整树迁入本仓 `docs/06-设计/`，主仓国男志部分转只读归档；④迁移清单五项已执行（数据 JSON/13 城贴图/L1 底图烘焙 PNG 均已就位，见 `docs/04-技术笔记/设计文档与工程经验迁移清单.md`）。

## 背景

R-059 国男志（仿三国志12策略经营，13 城/四阵营）最初定 Web 单机（Vue3+TS+Canvas，浏览器权威）。R16~R17 已用 Web Canvas 交付 L1 战略大地图雏形并验收（真实地理程序化手绘 + 13 城 ComfyUI 贴图，FPS 146 / JS 堆 15MB），证明**画风与性能在 Web 侧可达**。

院长 2026-10-24 复验后拍板转向：**核心诉求是打包成单机可执行文件发给朋友直接玩**（20 人朋友圈分发），Web 版无法提供「双击即玩」的分发形态。

## 决策

1. **国男志运行时改为 Unity**，版本对齐 nono 先例：**2022.3.62f3c1（LTS 中国版）**——本机已装（`F:\Unity\unityEditor1.0\2022.3.62f3c1`，Unity Hub 3.3.3-c5 + VS2022 Community 构建链齐备），团队（单人+AI）已有 nono 线使用经验。
2. 渲染采用 **Unity 2D（URP）**：L1 大地图 = 离线烘焙大幅面底图纹理（现有 Web Canvas 手绘引擎可改造为离线烘焙器出 PNG，或按同算法移植 C#）+ 13 城贴图 Sprite + 相机 pan/zoom（沿用 Web 版参数）。
3. **独立仓承载**（对齐 nono 先例：Unity Library 缓存数 GB 不进主仓）：新建 `guonanzhi` 仓（GitHub 私有 + LFS 管美术资产），仓内自建 AGENTS/handoff/docs——**仓名与英文名待院长定名后一并确认**。
4. 主仓（nandexueyuan）保留：设计文档权威（00~07 模块文档全部继续有效，游戏设计不受引擎影响）+ Web 验证资产归档（`src/guonanzhi/`、`poc/guonanzhi-ui/`、`public/guonanzhi/` 留作参考，不再迭代）。

## 替代方案（否决理由存档）

| 方案 | 结论 | 理由 |
|---|---|---|
| Web 继续 + Electron/Tauri 打包 | 否决 | 能达成"双击即玩"，但多一层壳且体积大；二期 2D RTS（路径 C 右键时停/全军部署）、天灾、军师 LLM 在 Unity 生态成本更低；院长点名 Unity |
| Godot 4 | 否决 | 免费轻量、2D 强，但资产生态/教程与既有 Unity 经验不如 Unity；单人项目换引擎学习成本不值 |
| Unity 3D 管线 | 否决 | 本作明确 2D 轻量 RTS，3D 管线是多余复杂度；URP 2D Renderer 即可 |

## 影响评估

- **正**：打包分发一步到位（Windows/Mac 构建）；二期 RTS/寻路/战斗表现力上限提高；资产管线（贴图/音频）工业成熟；与 nono 线共用 Unity 经验与工具链。
- **负/代价**：主仓已交付的 Web 渲染引擎不可直接运行（约 1500 行 Canvas 代码中，数据与算法可移植、渲染层重写）；需求池中"浏览器权威"定案作废（原 R1 决策被 R18 决策取代）。
- **迁移清单（Web → Unity）**：①geo-data.js 烘焙海岸线 → JSON 资产；②map-data.js（13 城/21 将/15 连线/四阵营）→ JSON + ScriptableObject；③13 城贴图 PNG 直接进 Assets；④L1 底图：优先离线烘焙整图 PNG（跑一次现引擎），运行时只做相机与交互；⑤L2 网格/建造/UI 设计照 07-技术架构 文档在 uGUI/UI Toolkit 重做。
