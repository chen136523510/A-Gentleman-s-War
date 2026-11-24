// sim/tools/semantic-audit.js — 机械回写文档的「语义待核」分流审计
// 背景：bulk-pointer.js 机械回写只建立了权威源指针（stale 归零），正文语义未核。
// 做什么：对每篇含「⚠ 权威源指针（…机械回写）」段的文档，比对
//   ①本文原 syncDate（机械段里记录）
//   ②机械段列出的上游文档的「实质内容最后变更日」= docs/meta/doc-hashes.json 的 changedAt（已剔除机械段/syncDate）
// 判定：
//   real = 存在上游实质变更晚于本文原 syncDate → 正文可能仍是旧口径，需人工核对
//   clear = 全部上游实质变更都不晚于本文原 syncDate → 正文无需改，只删机械段即可
//   unknown = 上游无法定位/无 changedAt → 需人工看一眼
// 输出：docs/meta/semantic-pending.json（结构化，供批量处理）
// 用法：node sim/tools/semantic-audit.js [--delete-clear]   （--delete-clear 删除 clear 类的机械段）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs/meta/semantic-pending.json');
const HASHES = path.join(ROOT, 'docs/meta/doc-hashes.json');
const DO_DELETE = process.argv.includes('--delete-clear');

const hashes = JSON.parse(fs.readFileSync(HASHES, 'utf8')).docs || {};

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'meta'].includes(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

// 机械段（仅工具生成的两类，含「机械生成」或「机械回写」字样）：
//   ## ⚠ 权威源指针（2026-11-24 机械生成）      ← bulk-pointer 第一批
//   ## ⚠ 权威源指针（2026-11-24 机械回写 · 语义待核） ← 第二批
// 子 agent 实质回写的「（2026-11-24 回写）」段不属于机械段，不能删。
// 段边界：按行找，到下一个 "## " 标题（非本行）或文件尾。
const HEAD_RE = /^## ⚠ 权威源指针（(\d{4}-\d{2}-\d{2})[^\n]*机械(?:生成|回写)/;
function extractBlock(txt) {
  const lines = txt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(HEAD_RE);
    if (!hm) continue;
    let j = i + 1;
    while (j < lines.length && !/^## /.test(lines[j])) j++;
    // 段前后可能各有一空行：向前吸收一个空行、向后留给下一段
    let start = i, end = j;
    if (start > 0 && lines[start - 1].trim() === '') start--;
    return { date: hm[1], startLine: start, endLine: end, block: lines.slice(i, j).join('\n') };
  }
  return null;
}

const results = [];
for (const abs of walk(path.join(ROOT, 'docs'))) {
  const txt = fs.readFileSync(abs, 'utf8');
  const m = extractBlock(txt);
  if (!m) continue;
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const genDate = m.date;
  const block = m.block;
  const origSync = (block.match(/原 syncDate=(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  // 上游：表格行 | 名称 | [名称](路径)（最后更新 YYYY-MM-DD） | 处置 |
  const ups = [];
  for (const line of block.split('\n')) {
    const lm = line.match(/^\|\s*([^|]+?)\s*\|\s*\[[^\]]*\]\(([^)]+\.md)\)（最后更新 (\d{4}-\d{2}-\d{2})）/);
    if (!lm) continue;
    const target = path.resolve(path.dirname(abs), lm[2]);
    const targetRel = fs.existsSync(target) ? path.relative(ROOT, target).replace(/\\/g, '/') : null;
    const h = targetRel && hashes[targetRel];
    const changedAt = h ? h.changedAt : null;
    ups.push({ name: lm[1].trim(), path: targetRel, listedDate: lm[3], changedAt });
  }
  if (!ups.length) {
    results.push({ path: rel, genDate, origSync, verdict: 'unknown', reason: '机械段无上游行（或被格式改动）', upstream: [] });
    continue;
  }
  const unknown = ups.filter((u) => !u.path || !u.changedAt);
  const real = origSync ? ups.filter((u) => u.changedAt && u.changedAt > origSync) : [];
  let verdict, reason;
  if (!origSync) { verdict = 'unknown'; reason = '未记录原 syncDate'; }
  else if (unknown.length) { verdict = 'unknown'; reason = `${unknown.length} 个上游缺 changedAt/路径`; }
  else if (real.length) {
    verdict = 'real';
    reason = `上游实质变更晚于原 syncDate ${origSync}：` + real.map((u) => `${u.name}@${u.changedAt}`).join(' ');
  } else {
    verdict = 'clear';
    reason = `所有上游实质变更 ≤ 原 syncDate ${origSync}，正文无需改，删机械段即可`;
  }
  results.push({ path: rel, genDate, origSync, verdict, reason, upstream: ups });
}

// 按模块聚合
const group = (p) => {
  const m = p.match(/^docs\/06-设计\/([^/]+)\//);
  return m ? m[1] : (p.match(/^docs\/([^/]+)\//) || [])[1] || 'other';
};
const byVerdict = { real: [], clear: [], unknown: [] };
for (const r of results) byVerdict[r.verdict].push(r);

console.log('===== 机械回写文档 · 语义分流审计 =====');
console.log(`[ASSERT] 含机械段文档=${results.length}  real(需改正文)=${byVerdict.real.length}  clear(只需删段)=${byVerdict.clear.length}  unknown(待看)=${byVerdict.unknown.length}`);
for (const v of ['real', 'unknown', 'clear']) {
  if (!byVerdict[v].length) continue;
  console.log(`\n--- ${v}（${byVerdict[v].length}）---`);
  for (const r of byVerdict[v]) console.log(`  ${r.path}  ← ${r.reason}`);
}

// 删除 clear 类机械段（幂等、只删该段；syncDate 保持在机械回写日 2026-11-24）
let deleted = 0;
if (DO_DELETE) {
  for (const r of byVerdict.clear) {
    const abs = path.join(ROOT, r.path);
    const txt = fs.readFileSync(abs, 'utf8');
    const eol = txt.includes('\r\n') ? '\r\n' : '\n';
    const lines = txt.split(/\r?\n/);
    const m = extractBlock(txt);
    if (!m) continue;
    lines.splice(m.startLine, m.endLine - m.startLine);
    fs.writeFileSync(abs, lines.join(eol));
    deleted++;
  }
  console.log(`\n[ASSERT] 已删除 clear 类机械段=${deleted}/${byVerdict.clear.length}${byVerdict.real.length + byVerdict.unknown.length ? `，余 ${byVerdict.real.length + byVerdict.unknown.length} 篇待人工` : ''}`);
}

fs.writeFileSync(OUT, JSON.stringify({
  schema: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '机械回写文档语义分流：real=上游实质变更晚于原syncDate，需核对正文；clear=正文无需改，删机械段；unknown=上游缺失信息需人工看。由 sim/tools/semantic-audit.js 生成。',
  total: results.length,
  counts: { real: byVerdict.real.length, clear: byVerdict.clear.length, unknown: byVerdict.unknown.length },
  groups: results.reduce((a, r) => { const g = group(r.path); (a[g] = a[g] || { real: 0, clear: 0, unknown: 0 })[r.verdict]++; return a; }, {}),
  items: results,
}, null, 1));
console.log(`\n[ASSERT] 清单已写入 ${path.relative(ROOT, OUT)}`);
