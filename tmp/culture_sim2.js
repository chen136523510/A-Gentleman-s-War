// 第二轮：扫描 k 参数，找"60 回合内最强国可达成 1~2 个完全入侵，但全图制霸不可能"的平衡区间
const NATIONS = ["CN", "JP", "KR", "AU"];
const FULL_INV = 0.60, FLOOR = 0.20;
const cfg = {
  CN: { growth: 10, coef: { JP: 0.6, KR: 0.8, AU: 0.6 }, invest: 0.3 },
  JP: { growth: 9,  coef: { CN: 0.8, KR: 0.8, AU: 0.0 }, invest: 1.0, warPattern: [15,16,17,30,31,32,45,46] },
  KR: { growth: 11, coef: { CN: 0.8, JP: 0.8, AU: 0.0 }, invest: 1.0 },
  AU: { growth: 7,  coef: { CN: 0.0, JP: 0.0, KR: 0.0 }, invest: 1.0, unlockAt: 25 },
};
function simulate(mode, K) {
  const culture = { CN: 50, JP: 40, KR: 35, AU: 30 };
  const identity = {};
  for (const B of NATIONS) { identity[B] = { self: 1.0 }; for (const A of NATIONS) if (A!==B) identity[B][A] = 0; }
  const inv = {};
  for (let t = 1; t <= 60; t++) {
    for (const n of NATIONS) culture[n] += cfg[n].growth;
    const out = {};
    for (const A of NATIONS) { out[A] = {};
      for (const B of NATIONS) { if (A===B) continue;
        let base = mode==="sqrt" ? Math.sqrt(culture[A]) : culture[A]/10;
        const war = cfg[A].warPattern?.includes(t) ? 0 : 1;
        const unlock = t >= Math.max(cfg[A].unlockAt ?? 0, cfg[B].unlockAt ?? 0);
        out[A][B] = base * (cfg[A].coef[B] ?? 0) * cfg[A].invest * war * (unlock?1:0);
      } }
    for (const B of NATIONS) {
      const total = NATIONS.filter(A=>A!==B).reduce((s,A)=>s+(out[A][B]??0),0);
      if (total<=0) continue;
      const drain = Math.min(identity[B].self - FLOOR, K * total);
      if (drain<=0) continue;
      identity[B].self -= drain;
      for (const A of NATIONS) if (A!==B) identity[B][A] += drain * ((out[A][B]??0)/total);
    }
    for (const B of NATIONS) for (const A of NATIONS) { if (A===B) continue;
      const key = `${A}→${B}`;
      if (identity[B][A] >= FULL_INV && !(key in inv)) inv[key] = t; }
  }
  return { inv, identity };
}
console.log("k 扫描（每行=k 值）：线性 | √Culture");
console.log("k      线性:入侵数 首次   | √:入侵数 首次");
for (const K of [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.02]) {
  const L = simulate("linear", K), S = simulate("sqrt", K);
  const f = r => { const e = Object.entries(r.inv); return e.length ? `${e.length}个 T${Math.min(...e.map(x=>x[1]))}` : "0个"; };
  console.log(`${K.toString().padEnd(6)} ${f(L).padEnd(14)} | ${f(S).padEnd(14)}`);
}
// k=0.005 时两模式的终局明细
for (const [name, mode] of [["线性 k=0.005","linear"], ["√ k=0.005","sqrt"]]) {
  const r = simulate(mode, 0.005);
  console.log(`\n== ${name} 终局认同度 ==`);
  for (const B of NATIONS) {
    console.log(`  ${B}: ` + NATIONS.map(A => A===B ? `本国${(r.identity[B].self*100).toFixed(0)}%` : `${A}${(r.identity[B][A]*100).toFixed(0)}%`).join(" "));
  }
}
