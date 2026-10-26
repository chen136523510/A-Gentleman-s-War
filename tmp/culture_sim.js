// 文化输出算法仿真：线性 vs √Culture 对比（R28 议题 2，"都跑一遍，用数据说话"）
// 场景设定依据：
//   - 阵营特性（R27/R27b）：CN 文化体量深厚/AI 不投资输出竞争；KR 文化增速最快但国力弱；
//     JP 文化增速高但频繁战争（输出衰减）；AU 前期隔绝（联系系数 0），N 回合后解锁
//   - 阈值三数（R28 议题 3）：完全入侵 60% / 解除 50% / 本国底线 20%
//   - 输出公式（文化输出算法.md §三）：Output[A→B] = f(Culture_A) × 距离 × 联系 × 情报 × 战争衰减
const TURNS = 60;
const NATIONS = ["CN", "JP", "KR", "AU"];

// ---- 参数 v0（试运行值，调参协议管后续微调）----
const cfg = {
  CN: { growth: 10, coef: { JP: 0.6, KR: 0.8, AU: 0.6 }, invest: 0.3 }, // AI-CN 不热衷输出竞争→有效输出打 3 折
  JP: { growth: 9,  coef: { CN: 0.8, KR: 0.8, AU: 0.0 }, invest: 1.0, warPattern: [15, 16, 17, 30, 31, 32, 45, 46] }, // 每 15 回合打一仗，每仗 3 回合
  KR: { growth: 11, coef: { CN: 0.8, JP: 0.8, AU: 0.0 }, invest: 1.0 }, // 文化增速最快
  AU: { growth: 7,  coef: { CN: 0.0, JP: 0.0, KR: 0.0 }, invest: 1.0, unlockAt: 25 }, // 前期隔绝，25 回合解锁联系
};
const K_TRANSFER = 0.02;      // 认同度转移系数 kconst FULL_INV = 0.60, RELAX = 0.50, FLOOR = 0.20;

function warFactor(nation, t) {
  if (!cfg[nation].warPattern) return 1.0;
  return cfg[nation].warPattern.includes(t) ? 0.0 : 1.0; // 交战回合输出归零
}
function contactUnlocked(a, b, t) {
  const ua = cfg[a].unlockAt, ub = cfg[b].unlockAt;
  const u = Math.max(ua ?? 0, ub ?? 0);
  return t >= u;
}

function simulate(mode /* "linear" | "sqrt" */) {
  const culture = { CN: 50, JP: 40, KR: 35, AU: 30 };            // 初始文化存量
  const identity = {};                                            // identity[B][A] = B 国对 A 的认同
  for (const B of NATIONS) {
    identity[B] = { self: 1.0 };
    for (const A of NATIONS) if (A !== B) identity[B][A] = 0;
  }
  const fullInvasions = {};                                       // 首次达成完全入侵的回合
  const log = [];
  for (let t = 1; t <= TURNS; t++) {
    // ① 文化值结算
    for (const n of NATIONS) culture[n] += cfg[n].growth;
    // ② 输出矩阵
    const out = {};
    for (const A of NATIONS) {
      out[A] = {};
      for (const B of NATIONS) {
        if (A === B) continue;
        let base = mode === "sqrt" ? Math.sqrt(culture[A]) : culture[A] / 10; // 线性档除 10 对齐量级
        out[A][B] = base * (cfg[A].coef[B] ?? 0) * cfg[A].invest * warFactor(A, t) * (contactUnlocked(A, B, t) ? 1 : 0);
      }
    }
    // ③ 认同度转移（多国瓜分 + 本国底线）
    for (const B of NATIONS) {
      const total = NATIONS.filter(A => A !== B).reduce((s, A) => s + (out[A][B] ?? 0), 0);
      if (total <= 0) continue;
      const self = identity[B].self;
      const drain = Math.min(self - FLOOR, K_TRANSFER * Math.sqrt(total) * 0.05); // 每回合最多转移量
      if (drain <= 0) continue;
      identity[B].self -= drain;
      for (const A of NATIONS) if (A !== B) identity[B][A] += drain * ((out[A][B] ?? 0) / total);
    }
    // ④ 完全入侵判定（迟滞带由"首次达成"口径简化观察）
    for (const B of NATIONS) for (const A of NATIONS) {
      if (A === B) continue;
      const key = `${A}→${B}`;
      if (identity[B][A] >= FULL_INV && !(key in fullInvasions)) fullInvasions[key] = t;
    }
    if (t % 20 === 0 || t === TURNS) {
      log.push({ t, culture: { ...culture }, id: JSON.parse(JSON.stringify(identity)) });
    }
  }
  return { fullInvasions, log };
}

function report(name, r) {
  console.log(`\n===== ${name} =====`);
  const entries = Object.entries(r.fullInvasions);
  if (entries.length === 0) console.log("60 回合内：无任何完全入侵达成");
  for (const [k, t] of entries) console.log(`  完全入侵 ${k} 首次达成于第 ${t} 回合`);
  const last = r.log[r.log.length - 1];
  console.log(`\n  终局（T${last.t}）文化值: ` + NATIONS.map(n => `${n}=${Math.round(last.culture[n])}`).join(" "));
  for (const B of NATIONS) {
    const parts = NATIONS.map(A => A === B ? `本国${(last.id[B].self * 100).toFixed(0)}%` : `${A}${(last.id[B][A] * 100).toFixed(0)}%`).join(" ");
    console.log(`  ${B} 认同度: ${parts}`);
  }
}

const lin = simulate("linear");
const sqr = simulate("sqrt");
report("线性公式 Linear（Culture/10 × 系数）", lin);
report("√Culture 凹函数（√Culture × 系数）", sqr);
console.log("\n说明：CN 有效输出 ×0.3（AI 不热衷输出）；JP 每 15 回合战争 3 回合（输出归零）；AU 25 回合前隔绝；KR 增速最高。");
