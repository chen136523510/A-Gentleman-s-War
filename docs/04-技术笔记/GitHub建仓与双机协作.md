# GitHub 纯文档仓与双机协作（R24j）

> 院长 2026-10-25 定：**GitHub 仓只放文档；所有代码/工程/美术/构建一律不入库**，避免白机误操作。
> 仓库：https://github.com/chen136523510/A-Gentleman-s-War
> 本地双仓：
> - `G:\A Gentleman's War` = **全量代码仓**（`master`，**不配 remote**，代码/美术/构建只在这里）
> - `G:\A Gentleman's War-docs` = **纯文档仓**（`main`，`origin`=GitHub，唯一入库内容）

## 一、入库范围（硬边界）

**只入库**：
- `docs/**`（设计/调研/技术笔记/美术登记）
- `.ai/handoff.md`、`.ai/worklog-R23.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`

**一律不入库**：
- `Assets/`、`Packages/`、`ProjectSettings/`、`Builds/`、`Library/`、`Logs/`、`Temp/`、`UserSettings/`
- `tools/`（烘焙器/脚本）、`local/`（美术源文件）、`tmp/`
- `.zcode/`（AI 技能/代理配置）、`.playwright-mcp/`、解决方案/csproj、Unity 场景/贴图/LFS 对象

> 结果：白机 clone 后**看不到任何代码**，只能读/写文档；黑机全量仓没有 remote，**不可能误推代码**。

## 二、建仓与首次推送（已由黑机完成）

```bash
# 黑机文档仓
cd "G:/A Gentleman's War-docs"
git init -b main
# 复制全量仓的 docs/.ai/AGENTS/CHANGELOG/README 到这里
git add -A
git commit -m "[docs] R24i 文档快照（代码不入库）"
git remote add origin https://github.com/chen136523510/A-Gentleman-s-War.git
git push -u origin main
```

- 认证走 Git Credential Manager；token 不写进任何文件。
- 纯文档仓不需要 LFS；仓库大小约 0.5MB。
- GitHub 默认分支设为 `main`（首次 push 后确认）。

## 三、日常同步（文档仓 = 权威）

**推荐：所有文档编辑都在文档仓做**（黑机/白机都一样），全量仓的 `docs/` 是黑机读代码上下文用的**镜像**。

### 白机（仅文档）
```bash
git clone https://github.com/chen136523510/A-Gentleman-s-War.git
cd A-Gentleman-s-War
# 只改 docs/.ai/AGENTS/CHANGELOG/README
git pull --rebase
git add -A
git commit -m "[docs](模块): …"
git push
```

### 黑机（先拉文档，再干活）
```bash
# 文档仓拉到最新
git -C "G:/A Gentleman's War-docs" pull --rebase
# 用脚本把文档仓镜像到全量仓（覆盖全量仓 docs/.ai/AGENTS/CHANGELOG）
powershell -ExecutionPolicy Bypass -File "G:/A Gentleman's War/tools/sync-docs-repo.ps1" pull
```

- `tools/sync-docs-repo.ps1 pull`：文档仓 → 全量仓镜像；**会覆盖全量仓文档**，不要在未提交的全量仓文档上直接跑。
- 黑机要改文档：改 `G:\A Gentleman's War-docs` 里的文件 → `git add/commit/push` → 再跑 `pull` 更新镜像。
- 黑机只改代码：全量仓本地 `git commit`，**不 push**（没有 remote）。
- 白机**禁止**碰代码；若 clone 后发现 `Assets/`/`tools/`，说明推错东西了，立即停手并找黑机。

## 四、风险与备份

- GitHub 只有文档，**代码/美术没有远程备份**——黑机是唯一副本。建议院长定期把全量仓（或至少 `Assets/`+`tools/`+`ProjectSettings/`）备份到移动硬盘/另一台机器/私有仓。
- 不要给全量仓添加这个 GitHub remote；不要 `git push` 全量仓。
- 文档冲突：白机 `pull --rebase` 解决；黑机镜像以文档仓为准。
- 发布 exe 只在黑机 `Builds/`，不入库、不 push。

## 五、验证清单

- [ ] GitHub 页面只有 `docs/`、`.ai/`、`AGENTS.md`、`CHANGELOG.md`、`README.md`，无 `Assets/`/`tools/`/`Builds/`。
- [ ] 白机 clone 后看不到任何代码/贴图/LFS 对象。
- [ ] 白机改文档 push → 黑机 `pull` 后全量仓镜像同步。
- [ ] 全量仓 `git remote -v` 为空；代码提交只存在本地。
