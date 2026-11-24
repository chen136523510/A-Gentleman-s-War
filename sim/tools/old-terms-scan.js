// sim/tools/old-terms-scan.js — 过时口径扫描（语义回写核对器）
// 用途：改动上游裁定后，快速找出哪些下游文档仍在使用旧口径词（抵抗/采配/删卡/旧计数…）
// 判定：clean（零命中）=无需改正文；hitA（确定过时）逐处改；hitB（需判断）多为历史注记，人工确认
// 注意：词表只能覆盖"已登记的变更点"——它是定位工具，不是正确性证明；新裁定须先加进 sim/data/outdated-terms.js
// 用法：
//   node sim/tools/old-terms-scan.js                   # 扫全部 docs/06-设计 + docs/08-百科
//   node sim/tools/old-terms-scan.js --file=<子串>     # 只扫路径含该子串的文档
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const TERMS = require('../data/outdated-terms.js');
const ONLY = (process.argv.find((a) => a.startsWith('--file=')) || '').slice(7);
// 已显式标注作废/已删/已砍/原口径的行 = 已处理（历史注记）
const HANDLED = /已砍|作废|❌|已删|删除|无采配|不消耗|原采配|原 syncDate|已裁|砍采配|D1|D6|历史|旧口径/;
const MECH = /^## ⚠ 权威源指针（[^\n]*机械(?:生成|回写)/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'meta'].includes(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}
const files = [...walk(path.join(ROOT, 'docs/06-设计')), ...walk(path.join(ROOT, 'docs/08-百科'))]
  .filter((abs) => !ONLY || abs.replace(/\\/g, '/').includes(ONLY));

const out = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  let mech = false;
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (MECH.test(lines[i])) { mech = true; continue; }
    if (/^## /.test(lines[i])) mech = false;
    if (mech || HANDLED.test(lines[i])) continue;
    for (const [re, why, sev] of TERMS) if (re.test(lines[i])) hits.push({ line: i + 1, sev, why, text: lines[i].trim().slice(0, 90) });
  }
  if (hits.length) out.push({ path: rel, hits });
}
const A = out.filter((o) => o.hits.some((h) => h.sev === 'A'));
const B = out.filter((o) => o.hits.length && !o.hits.some((h) => h.sev === 'A'));
console.log(`===== 过时口径扫描（${files.length} 篇，词表 ${TERMS.length} 条）=====`);
console.log(`[ASSERT] clean=${files.length - out.length}  hitA(确定过时)=${A.length}  hitB(需判断)=${B.length}`);
for (const [label, arr] of [['hitA', A], ['hitB', B]]) {
  if (!arr.length) continue;
  console.log(`\n--- ${label} ---`);
  for (const o of arr) {
    console.log(`## ${o.path}`);
    for (const h of o.hits) console.log(`  L${h.line} [${h.sev}] ${h.why}: ${h.text}`);
  }
}
