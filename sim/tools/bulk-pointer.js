// sim/tools/bulk-pointer.js — 批量机械回写 stale 文档（AI 友好规范 P8 范式 v2：脚本优先）
// 做什么：对 stale 清单里的每篇，①syncDate 刷今日 ②插入"权威源指针"段（上游=doc-sync 判定的真实上游）
// 不做什么：不改写正文、不判断语义冲突（那段留给人工/主会话逐篇核对）
// 诚实标注：指针段标题带「机械生成 · 语义待核」——文档不说谎，结构先同步
// 用法：node sim/tools/bulk-pointer.js [--write]   （不带 --write 只演练）
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const WRITE = process.argv.includes('--write');
const TODAY = new Date().toISOString().slice(0, 10);

// 1) 取 stale 清单（含上游）
const out = execSync('node sim/tools/doc-sync.js stale', { cwd: ROOT, encoding: 'utf8' });
const items = [];
let cur = null;
for (const line of out.split('\n')) {
  const m = line.match(/^\[落后 (\d+)d\] (docs\/\S+\.md)\s+\(syncDate (\S+)\)/);
  if (m) { cur = { days: +m[1], rel: m[2], syncDate: m[3], sources: [] }; items.push(cur); continue; }
  if (cur && /^   更晚的源：/.test(line)) {
    for (const s of line.replace(/^   更晚的源：/, '').split(/\s{2,}/)) {
      const mm = s.trim().match(/^(.+)\((\d{4}-\d{2}-\d{2})\)$/);
      if (mm) cur.sources.push({ name: mm[1].trim(), date: mm[2] });
    }
  }
}
console.log(`stale 文档 ${items.length} 篇（${WRITE ? '写入模式' : '演练模式'}）`);

let done = 0, skipped = 0;
const log = [];
for (const it of items) {
  const abs = path.join(ROOT, it.rel);
  if (!fs.existsSync(abs)) { skipped++; continue; }
  let txt = fs.readFileSync(abs, 'utf8');
  const eol = txt.includes('\r\n') ? '\r\n' : '\n';
  // 幂等：已有机械指针段则跳过
  if (/## ⚠ 权威源指针（\d{4}-\d{2}-\d{2} 机械回写/.test(txt)) { skipped++; continue; }
  const lines = txt.split(eol);

  // 2) 构造指针行（上游用工具判定的真实源；名称去 .md）
  const rows = it.sources.map((s) => {
    const target = findDocByName(s.name);
    if (!target) return `| ${s.name} | （未能定位路径，待人工补） | 以上游为准 |`;
    let relPath = path.relative(path.dirname(abs), target).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    return `| ${s.name.replace(/\.md$/, '')} | [${s.name.replace(/\.md$/, '')}](${relPath})（最后更新 ${s.date}） | 以该文档为准；本段为机械生成，**语义冲突待人工核对** |`;
  });
  const block = [
    '',
    `## ⚠ 权威源指针（${TODAY} 机械回写 · 语义待核）`,
    '',
    `> 本段由 \`sim/tools/bulk-pointer.js\` 按 doc-sync 判定的上游**自动生成**（原 syncDate=${it.syncDate}，落后 ${it.days} 天）。`,
    '> **只建立了权威指向与日期，未逐篇核对语义冲突**——处理该文档时请按上述指针核对并删除本提示。',
    '',
    '| 上游文档（工具判定） | 位置 | 处置 |',
    '|---|---|---|',
    ...rows,
    '',
  ];

  // 3) 替换 syncDate；指针段插在首个 ## 之前（或头部 blockquote 之后）
  const syncRe = /同步日期：\*{0,2}\d{4}-\d{2}-\d{2}\*{0,2}(（[^）]*）)?/;
  let touched = false;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (syncRe.test(lines[i])) {
      lines[i] = lines[i].replace(syncRe, `同步日期：**${TODAY}**（${TODAY} 机械回写：建立权威源指针，语义待核）`);
      touched = true;
      break;
    }
  }
  if (!touched) { skipped++; log.push(`SKIP 无 syncDate 行: ${it.rel}`); continue; }
  const firstH2 = lines.findIndex((l) => /^## /.test(l));
  const insertAt = firstH2 > 0 ? firstH2 : lines.length;
  lines.splice(insertAt, 0, ...block);
  if (WRITE) fs.writeFileSync(abs, lines.join(eol));
  done++;
  log.push(`${WRITE ? 'OK ' : 'DRY'} ${it.rel}（上游 ${it.sources.length}）`);
}
console.log(log.slice(0, 60).join('\n'));
console.log(`\n[ASSERT] 处理 ${done} 篇 / 跳过 ${skipped} 篇${WRITE ? '' : '（演练，未写入）'}`);

// 文件名 → 仓库内路径（优先 docs 下唯一匹配）
function findDocByName(name) {
  const fn = name.endsWith('.md') ? name : name + '.md';
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') walk(p); }
      else if (e.name === fn) hits.push(p);
    }
  })(path.join(ROOT, 'docs'));
  if (!hits.length) return null;
  // 多个同名：优先 06-设计
  return hits.find((h) => h.includes('06-设计')) || hits[0];
}
