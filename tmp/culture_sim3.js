// 第三轮：定位平衡区间细节——谁在入侵谁？两国瓜分是否真的锁死 60%？AU 解锁后的表现？
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
  const inv = {}; const timeline = [];
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
      if (identity[B][A] >= FULL_INV && !(key in inv)) { inv[key] = t; timeline.push(`T${t} ${key} 达成（${B}对${A}认同 ${(identity[B][A]*100).toFixed(0)}%）`); } }
  }
  return { inv, identity, timeline };
}
for (const [name, mode, K] of [["线性 k=0.002","linear",0.002], ["√ k=0.003","sqrt",0.003]]) {
  const r = simulate(mode, K);
  console.log(`\n===== ${name} =====`);
  r.timeline.forEach(x => console.log("  " + x));
  console.log("  终局：");
  for (const B of NATIONS) console.log(`    ${B}: ` + NATIONS.map(A => A===B?`本国${(r.identity[B].self*100).toFixed(0)}%`:`${A}${(r.identity[B][A]*100).toFixed(0)}%`).join(" "));
}
// 两国瓜分锁死验证：JP 与 KR 同时高输出 CN（模拟两极），看 CN 认同是否到得了 60%
console.log("\n===== 两极瓜分锁死验证（JP+KR 同强度输出 CN，√ 模式 k=0.005）=====");
{
  const K = 0.005;
  const culture = { JP: 500, KR: 500 };
  const idCN = { self: 1.0, JP: 0, KR: 0 };
  for (let t = 1; t <= 200; t++) {
    const outJP = Math.sqrt(500) * 0.8, outKR = Math.sqrt(500) * 0.8; // 恒定对等输出
    const total = outJP + outKR;
    const drain = Math.min(idCN.self - FLOOR, K * total);
    idCN.self -= drain; idCN.JP += drain * outJP/total; idCN.KR += drain * outKR/total;
  }
  console.log(`  200 回合后 CN 认同：本国${(idCN.self*100).toFixed(0)}% JP${(idCN.JP*100).toFixed(0)}% KR${(idCN.KR*100).toFixed(0)}% → ${idCN.JP>=0.6||idCN.KR>=0.6?"有人达成 60%（锁死失败！）":"双双 <60%（锁死成功）"}`);
}
