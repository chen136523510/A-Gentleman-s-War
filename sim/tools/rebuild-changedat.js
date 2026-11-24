// sim/tools/rebuild-changedat.js — 用 git 历史重建 docs/meta/doc-hashes.json 的 changedAt
// 为什么：doc-sync 的 changedAt 原为"hash 变了就记今天"，会被批量元信息/机械段/行尾变化污染，
//   导致 stale 判定失真（11-24 的机械同步把 69 篇上游全刷成 11-24）。
// 做什么：对每个 docs/*.md，取 git 历史各版本的内容，按与 doc-sync 完全相同的口径算 contentHash
//   （剔除 syncDate/机械段 + 行尾归一化），从新到旧找"当前内容最后一次实质变化"所在的提交日。
// 用法：node sim/tools/rebuild-changedat.js [--write]   （不带 --write 只打印差异）
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const HASHES = path.join(ROOT, 'docs/meta/doc-hashes.json');
const WRITE = process.argv.includes('--write');

// 与 doc-sync.js parseDoc 的 contentHash 同口径（两处必须一致）
function bodyHash(txt) {
  let body = txt.replace(/[ \t]*·[ \t]*同步日期[:：][^\n]*/g, '').replace(/同步日期[:：][^\n]*/g, '');
  body = body.replace(/## ⚠ 权威源指针（[^\n]*机械(?:生成|回写)[^\n]*\n(?:[^\n]*\n)*?(?=## |$)/g, '');
  body = body.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return crypto.createHash('md5').update(body).digest('hex').slice(0, 12);
}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'meta'].includes(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md') && !e.name.startsWith('.')) acc.push(p);
  }
  return acc;
}
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const files = walk(path.join(ROOT, 'docs')).filter((abs) => {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return true;
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  return rel.includes(arg.slice('--only='.length));
});
const old = fs.existsSync(HASHES) ? JSON.parse(fs.readFileSync(HASHES, 'utf8')) : { schema: 1, docs: {} };
const next = { schema: old.schema || 1, docs: {} };
const changed = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const curHash = bodyHash(fs.readFileSync(abs, 'utf8'));
  // 该文件的提交列表（新→旧）：sha + 日期
  let log = [];
  try {
    log = git('log', '--format=%H|%cs', '--follow', '--', rel).trim().split('\n').filter(Boolean)
      .map((l) => { const [sha, date] = l.split('|'); return { sha, date }; });
  } catch (e) { log = []; }
  let changedAt = null;
  // 从新到旧找第一个 hash != curHash 的版本；其上一个版本即"当前内容首次出现"的提交日
  let prev = null;
  for (const c of log) {
    let txt;
    try { txt = git('show', `${c.sha}:${rel}`); } catch (e) { continue; }
    const h = bodyHash(txt);
    if (h !== curHash) break;
    prev = c;
  }
  changedAt = prev ? prev.date : (log.length ? log[log.length - 1].date : new Date().toISOString().slice(0, 10));
  next.docs[rel] = { hash: curHash, changedAt };
  const o = old.docs[rel];
  if (!o || o.hash !== curHash || o.changedAt !== changedAt) changed.push({ rel, was: o ? o.changedAt : '-', now: changedAt });
}
console.log(`[ASSERT] 扫描 ${files.length} 篇；changedAt/hash 有变化 ${changed.length} 篇`);
for (const c of changed.slice(0, 40)) console.log(`  ${c.rel}: ${c.was} → ${c.now}`);
if (changed.length > 40) console.log(`  ... 其余 ${changed.length - 40} 篇`);
if (WRITE) {
  fs.writeFileSync(HASHES, JSON.stringify(next, null, 1));
  console.log(`[ASSERT] 已写入 ${path.relative(ROOT, HASHES)}`);
} else {
  console.log('[ASSERT] 演练模式（加 --write 写入）');
}
