# GitHub 纯文档仓与双机协作（R24k 定稿）

> 院长 2026-10-25 定：**黑机在本仓（全量代码仓）工作；每次收尾把文档同步到隔壁纯文档仓；白机只在纯文档仓工作。代码/工程/美术/构建一律不入库。**
> 仓库：https://github.com/chen136523510/A-Gentleman-s-War
> 本地双仓：
> - `G:\A Gentleman's War` = **黑机工作仓**（`master`，代码+文档，**不配 remote**）
> - `G:\A Gentleman's War-docs` = **纯文档仓**（`main`，`origin`=GitHub；白机工作区/发布副本）

## 一、入库范围（硬边界）

**只入纯文档仓**：
- `docs/**`
- `.ai/handoff.md`、`.ai/worklog-R23.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`

**一律不入库**：
- `Assets/`、`Packages/`、`ProjectSettings/`、`Builds/`、`Library/`、`Logs/`、`Temp/`、`UserSettings/`
- `tools/`、`local/`、`tmp/`
- `.zcode/`、`.playwright-mcp/`、解决方案/csproj、Unity 场景/贴图/LFS 对象

> 结果：白机 clone 后**看不到任何代码**；黑机全量仓没有 remote，**不可能误推代码**。
> `README.md` 两仓各自维护（文本仓=白机看板，全量仓=黑机看板），同步脚本不覆盖。

## 二、日常节奏

### 黑机（本仓工作）
```text
开工（若白机动过文档）：
  git -C "G:/A Gentleman's War-docs" pull --rebase
  powershell -ExecutionPolicy Bypass -File "G:/A Gentleman's War/tools/sync-docs-repo.ps1" pull
  # -> 文本仓文档镜像进本仓，再开始改代码/文档

收尾：
  # 1) 本仓文档先 commit（文档改动进入本仓历史）
  git add -A && git commit -m "[docs|feat|art](模块): …"
  # 2) 本仓文档 -> 文本仓 -> GitHub
  powershell -ExecutionPolicy Bypass -File "G:/A Gentleman's War/tools/sync-docs-repo.ps1" push
```

- `pull`：文本仓 → 本仓 `docs/.ai/AGENTS/CHANGELOG/README`；会覆盖本仓文档，**本仓文档有未提交改动时脚本会中止**。
- `push`：本仓 → 文本仓 → GitHub。脚本会先 `fetch`：若文本仓有白机新提交（比上次同步新），**中止并要求先 `pull`**，避免把白机改动覆盖掉。
- 同步基线记在 `tmp/docs-sync-base.txt`（git 忽略）。

### 白机（只在文本仓）
```bash
git clone https://github.com/chen136523510/A-Gentleman-s-War.git
cd A-Gentleman-s-War
git pull --rebase
# 只改 docs/.ai/AGENTS/CHANGELOG/README
git add -A
git commit -m "[docs](模块): …"
git push
```

- 白机**禁止**碰代码；仓库里也没有代码。
- 白机 push 后，黑机下次开工先 `pull` 镜像。

## 三、首次建仓（已由黑机完成）

```bash
cd "G:/A Gentleman's War-docs"
git init -b main
# 复制全量仓的 docs/.ai/AGENTS/CHANGELOG/README
git add -A
git commit -m "[docs] R24j：纯文档仓首推（代码不入库）"
git remote add origin https://github.com/chen136523510/A-Gentleman-s-War.git
git push -u origin main
```

- 纯文档仓不需要 LFS；约 0.5MB。
- GitHub 默认分支 `main`。

## 四、冲突与纪律

- 尽量**不要黑机/白机同时改同一篇文档**；按“一边改完、同步、另一边再改”的顺序。
- 白机 push 后，黑机 `pull` 前先 commit 本仓文档；`pull` 会覆盖本仓未提交文档。
- `push` 若提示文本仓有白机新提交：先 `pull`，必要时手动合并/取舍，再 `push`。
- 禁止给全量仓加这个 remote；禁止 `git push` 全量仓。
- 发布 exe 只在黑机 `Builds/`，不入库、不 push。

## 五、风险与备份

- GitHub 只有文档，**代码/美术没有远程备份**——黑机是唯一副本。建议院长定期把全量仓（至少 `Assets/`+`tools/`+`ProjectSettings/`）备份到移动硬盘/私有位置。
- 文档仓是白机工作区与发布副本；黑机全量仓是文档的工作源，二者在每次同步后一致。

## 六、验证清单

- [ ] GitHub 页面只有 `docs/`、`.ai/`、`AGENTS.md`、`CHANGELOG.md`、`README.md`，无 `Assets/`/`tools/`/`Builds/`。
- [ ] 白机 clone 后看不到任何代码/贴图/LFS 对象。
- [ ] 黑机 `pull` 后全量仓文档与文本仓一致。
- [ ] 黑机收尾 `push` 后 GitHub 出现 `[docs] sync from full repo …` 提交。
- [ ] 全量仓 `git remote -v` 为空；代码提交只存在本地。
