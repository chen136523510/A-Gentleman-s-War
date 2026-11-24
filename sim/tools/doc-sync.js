// sim/tools/doc-sync.js — 文档同步哨兵（结构化文档索引 + staleness 检测）
// 院长 2026-11-24 第 1/2 条：要的是**结构化数据**（批量阅读/批量操作），不是自然语言摘要块。
// 原理：扫全部 md → 解析站内链接 → 用 git 历史时间建"引用依赖图" → 被引用文档更新晚于本文档即 stale。
//   零人工维护（不靠人填 syncDate）；改完设计文档跑一次即知"还有哪些文档需要跟着改"。
// 用法：
//   node sim/tools/doc-sync.js scan           # 只扫描摘要（文档数/链接数/孤立数）
//   node sim/tools/doc-sync.js gen            # 生成 docs/meta/docs-index.json（结构化索引）
//   node sim/tools/doc-sync.js stale [--all]  # 列出 stale 文档（默认只看 docs/06-设计 与 docs/08-百科 的读者）
//   node sim/tools/doc-sync.js who <文件>     # 反查：谁引用了这个文件（改前影响面评估）
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs/meta/docs-index.json');

// ---------- 扫描 ----------
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'meta'].includes(e.name)) continue;
      walk(p, acc);
    } else if (e.name.endsWith('.md') && !e.name.startsWith('.')) acc.push(p);
  }
  return acc;
}

function parseDoc(abs) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const txt = fs.readFileSync(abs, 'utf8');
  const lines = txt.split(/\r?\n/);
  const title = (lines.find((l) => l.startsWith('# ')) || '').replace(/^# /, '').trim();
  // 版本：优先标题里的 vX.Y，其次状态行的 vX.Y
  const vTitle = title.match(/\bv(\d+\.\d+[a-z]?)\b/);
  const vBody = (lines.slice(0, 12).join(' ') || '').match(/\bv(\d+\.\d+[a-z]?)\b/);
  const version = (vTitle && vTitle[1]) || (vBody && vBody[1]) || null;
  // 状态标记：从头部 12 行抓 emoji 状态
  const head = lines.slice(0, 12).join(' ');
  const status = /✅/.test(head) ? 'done' : /🏗️/.test(head) ? 'wip' : /📝/.test(head) ? 'draft' : /⏸/.test(head) ? 'paused' : /🟡/.test(head) ? 'partial' : 'unmarked';
  // 站内链接（相对路径 .md）。分两类：
  //   upstream = 头部 12 行内的链接（"权威源/上游/依据/相关"——文档自称依赖的源）→ 触发 stale
  //   refs     = 正文全部链接（交叉引用/举例）→ 只做断链与影响面分析，不判定 stale
  const links = [];
  // 剔除 ``` 代码块（模板示例/代码样例里的链接不算文档链接），保持换行与偏移对齐
  const noCode = txt.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ''));
  const ncLines = noCode.split(/\r?\n/);
  const headEnd = ncLines.slice(0, 12).join('\n').length;
  for (const m of noCode.matchAll(/\]\(([^)#]+\.md)(#[^)]*)?\)/g)) {
    const raw = m[1];
    if (/^https?:/.test(raw)) continue;
    const inHead = m.index < headEnd;
    const target = path.resolve(path.dirname(abs), raw);
    if (!fs.existsSync(target)) { links.push({ target: raw, broken: true, inHead }); continue; }
    links.push({ target: path.relative(ROOT, target).replace(/\\/g, '/'), broken: false, inHead, anchor: m[2] || '' });
  }
  // 同步日期（若有）
  const sync = txt.match(/同步日期[:：]\s*\**(\d{4}-\d{2}-\d{2})/);
  // contentHash：剔除 syncDate 元信息后取 md5 —— 纯元信息变更不算内容变更（防批量补 syncDate 造成假 stale）
  // contentHash：剔除元信息后取 md5 —— 纯元信息变更不算内容变更
  //  剔除①syncDate 行 ②**机械回写指针段**（bulk-pointer 生成的"权威源指针…语义待核"整段）
  //  为什么要剔②：机械回写只是建立指向，不含实质口径；若算内容变更会让下游无限级联、并污染权威源文档
  let body = txt.replace(/同步日期[:：][^\n]*/g, '').replace(/·\s*同步日期[^\n]*/g, '');
  body = body.replace(/## ⚠ 权威源指针（[^\n]*机械回写[^\n]*\n(?:[^\n]*\n)*?(?=## |$)/g, '');
  const contentHash = require('crypto').createHash('md5').update(body).digest('hex').slice(0, 12);
  return { path: rel, title, version, status, syncDate: sync ? sync[1] : null, size: lines.length, links, contentHash };
}


// ---------- 内容哈希台账（changedAt 驱动的 stale 判定）----------
const HASHES = path.join(ROOT, 'docs/meta/doc-hashes.json');
const TODAY = new Date().toISOString().slice(0, 10);
function loadHashes() {
  try { return JSON.parse(fs.readFileSync(HASHES, 'utf8')); } catch (e) { return { schema: 1, docs: {} }; }
}
function saveHashes(h) { fs.mkdirSync(path.dirname(HASHES), { recursive: true }); fs.writeFileSync(HASHES, JSON.stringify(h, null, 1)); }
// 返回 path → changedAt（内容最后变更日）。冷启动用 git 提交日；哈希不变则沿用旧 changedAt
function syncHashes(docs) {
  const h = loadHashes();
  for (const d of docs) {
    const old = h.docs[d.path];
    if (!old) h.docs[d.path] = { hash: d.contentHash, changedAt: stamp(d.path) || TODAY };
    else if (old.hash !== d.contentHash) h.docs[d.path] = { hash: d.contentHash, changedAt: TODAY };
  }
  saveHashes(h);
  return h.docs;
}

// ---------- git 最后提交时间 ----------
function gitTimes() {
  const map = new Map();
  try {
    const out = execSync('git log --format="%ct" --name-only -- docs/', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
    let cur = 0;
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^\d+$/.test(t)) { cur = Number(t); continue; }
      if (!map.has(t)) map.set(t, cur); // 首次出现=最近一次提交
    }
  } catch (e) { console.error('[warn] git log 失败，stale 判定降级为 null', e.message); }
  return map;
}

// ---------- 主 ----------
const files = walk(path.join(ROOT, 'docs'));
const docs = files.map(parseDoc);
const times = gitTimes();
const HASH_TABLE = syncHashes(docs);
const byPath = new Map(docs.map((d) => [d.path, d]));

// 依赖（被引用）与反查
const inbound = new Map();
for (const d of docs) {
  for (const l of d.links) {
    if (l.broken) continue;
    if (!inbound.has(l.target)) inbound.set(l.target, []);
    inbound.get(l.target).push(d.path);
  }
}

function stamp(p) {
  const t = times.get(p);
  return t ? new Date(t * 1000).toISOString().slice(0, 10) : null;
}

// 同步义务判定（v3，院长 11-24）：
//   syncDate = 文档自己声明的"我已同步到此日"承诺。**只有声明了 syncDate 的规格类文档才有同步义务**。
//   stale ⟺ 本文档头部引用的某个上游，其 git 最后提交日 > 本文档 syncDate。
//   **类型豁免**（无同步义务，不判 stale）：changelog（流水账只增不改）/ ADR 决策档（永久历史）/
//     调研（时点快照）/ README（导航）/ 索引表（由生成或人工活表维护）/ 需求池（活表，来源=院长口径）。
function exemptType(d) {
  const p = d.path;
  if (/changelog\.md$/.test(p)) return 'changelog';
  {
    const fn = p.split('/').pop();
    if (/^\d\d-\d\d-/.test(fn) || /-20\d\d-\d\d-\d\d\.md$/.test(fn)) return 'dated'; // 日期化交接单/方案（时点快照）
    if (/-报告\.md$/.test(fn) || /沙盘报告/.test(fn)) return 'report';                 // 沙盘/验证报告=证据
    if (/命名名池\.md$/.test(fn)) return 'namepool';                                   // 名称池=只放名字，不承载数值/规则，无同步义务
  }
  if (p.includes('/02-决策/')) return 'adr';
  if (p.includes('/00-调研/') || p.includes('调研')) return 'research';
  if (/(^|\/)README\.md$/.test(p)) return 'readme';
  if (/索引-(公式|参数|决策)\.md$/.test(p)) return 'index';
  if (/需求池\.md$/.test(p)) return 'backlog';
  if (/全量模拟-.*\.md$/.test(p)) return 'sim-report';  // 模拟报告=时点证据，数字是当时口径，绝不"同步"
  return null;
}
function staleInfo(d) {
  if (!d.syncDate || exemptType(d)) return [];
  const newer = [];
  const seen = new Set();
  for (const l of d.links) {
    if (l.broken || !l.inHead) continue;
    if (seen.has(l.target)) continue;
    seen.add(l.target);
    const ds = (HASH_TABLE[l.target] && HASH_TABLE[l.target].changedAt) || stamp(l.target);
    if (ds && ds > d.syncDate) newer.push({ path: l.target, date: ds });
  }
  return newer;
}

const cmd = process.argv[2] || 'scan';
if (cmd === 'scan') {
  const broken = docs.flatMap((d) => d.links.filter((l) => l.broken).map((l) => `${d.path} → ${l.target}`));
  const noInbound = docs.filter((d) => !inbound.has(d.path));
  console.log('===== 文档同步哨兵 · scan =====');
  console.log(`[ASSERT] 文档总数=${docs.length} 站内链接=${docs.reduce((a, d) => a + d.links.filter((l) => !l.broken).length, 0)} 断链=${broken.length}`);
  if (broken.length) { console.log('断链清单：'); for (const b of broken.slice(0, 20)) console.log('  ' + b); }
  console.log(`[ASSERT] 无入链文档（孤立）=${noInbound.length}`);
  console.log(`[ASSERT] 有 syncDate 的文档=${docs.filter((d) => d.syncDate).length}/${docs.length}`);
  const st = docs.map((d) => ({ d, n: staleInfo(d) })).filter((x) => x.n.length);
  console.log(`[ASSERT] stale 文档（引用了比自己更新的文档）=${st.length}`);
  for (const { d, n } of st.slice(0, 12)) {
    console.log(`  ⚠ ${d.path}  ← 更新于更晚: ${n.slice(0, 3).map((x) => `${path.basename(x.path)}(${x.date})`).join(', ')}`);
  }
  if (st.length > 12) console.log(`  ... 其余 ${st.length - 12} 篇见 stale 模式`);
} else if (cmd === 'gen') {
  // 紧凑格式（院长 11-24：要结构化、批量可读）：docs 用数组而非对象数组，省 key 重复
  // [path, title, version, status, syncDate, lastCommit, lines, refCount, staleCount]
  const staleRows = [];
  const compact = docs.map((d) => {
    const st = staleInfo(d);
    if (st.length) staleRows.push({ path: d.path, by: st.map((x) => `${x.path}@${x.date}`) });
    return [
      d.path, d.title, d.version || '', d.status, d.syncDate || '',
      stamp(d.path) || '', d.size,
      d.links.filter((l) => !l.broken).length, st.length,
    ];
  });
  const idx = {
    schema: 2,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'AI 批量阅读入口。docs=紧凑数组 [path,title,version,status,syncDate,lastCommit,lines,refCount,staleCount]；status 枚举 done|wip|draft|paused|partial|unmarked；stale 明细单列。由 sim/tools/doc-sync.js gen 生成，勿手改。',
    total: docs.length,
    docs: compact,
    stale: staleRows,
    broken: docs.flatMap((d) => d.links.filter((l) => l.broken).map((l) => [d.path, l.target])),
    noSyncDate: docs.filter((d) => !d.syncDate).length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(idx));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`[ASSERT] 生成 ${path.relative(ROOT, OUT)}：${docs.length} 文档 / ${kb} KB（紧凑数组格式）`);
  console.log(`[ASSERT] stale=${staleRows.length} | 断链=${idx.broken.length} | 未声明 syncDate=${idx.noSyncDate}/${docs.length}`);
  console.log(`[ASSERT] 单次读取成本≈${Math.round(kb * 0.3)}k token（替代逐篇读 243 文档头部）`);
} else if (cmd === 'stale') {
  const only = process.argv.includes('--all') ? null : ['docs/06-设计/', 'docs/08-百科/', 'docs/01-需求/', 'docs/02-决策/'];
  const rows = docs.map((d) => ({ d, n: staleInfo(d) })).filter((x) => x.n.length && (!only || only.some((p) => x.d.path.startsWith(p))));
  // 按落后天数降序（最旧的最危险），并给类型标签
  const days = (r) => Math.max(...r.n.map((x) => (new Date(x.date) - new Date(r.d.syncDate)) / 86400000));
  rows.sort((a, b) => days(b) - days(a));
  console.log(`===== stale 清单（${only ? '设计+百科+需求+决策' : '全部'}，${rows.length} 篇；按落后天数降序）=====`);
  for (const r of rows) {
    console.log(`[落后 ${Math.round(days(r))}d] ${r.d.path}  (syncDate ${r.d.syncDate})`);
    console.log(`   更晚的源：${r.n.map((x) => `${path.basename(x.path)}(${x.date})`).join('  ')}`);
  }
  if (rows.length) console.log(`\n提示：模拟报告/ADR/调研/changelog/README/索引 已豁免（无同步义务）。逐篇回写后更新其 syncDate 即从本清单消失。`);
} else if (cmd === 'who') {
  const q = (process.argv[3] || '').replace(/\\/g, '/');
  const hit = docs.find((d) => d.path.endsWith(q));
  if (!hit) { console.log('未找到文档：' + q); process.exit(1); }
  const who = inbound.get(hit.path) || [];
  console.log(`${hit.path}（${hit.lines} 行，最后提交 ${stamp(hit.path) || '-'}）`);
  console.log(`被 ${who.length} 篇引用${who.length ? '：' : ''}`);
  for (const w of who) console.log('  ' + w);
} else {
  console.log('用法: node sim/tools/doc-sync.js scan|gen|stale [--all]|who <文件名>');
}
