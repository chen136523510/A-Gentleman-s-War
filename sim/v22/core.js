// sim/v22/core.js — 白机版 v22 全量核心盘（五账联立：人口/粮/消费/财政/军费）
// 依据：数值尺度重定 v22（S=8）+ 人口算法 §7.2 生育率公式 + 消费力专题 §1.1/§2.6
// 定位：core 盘（AI 建造简化、电力/污染/科技树细节不覆盖）；full 盘由黑机交接 sim/v22/full-*.js
// 运行：node sim/v22/core.js [turns] [seed]
// 输出：stdout 报告（关键回合五账），可存 tmp/ 原始输出

'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ============ 参数（全部集中，依据 v22 文档） ============
const P = {
  S: 8,                          // 全局尺度
  turns: 200,
  // 人口（单一自然增长公式，人口算法 §7.2；平衡点=1.5 倍承载）
  growthBase: 0.008,             // 每回自然增长基准
  growthBalance: 1.5,            // 平衡点：r=P/C=1.5 时 g=0
  growthHospital: [1, 1.05, 1.10, 1.20, 1.30], // 药店/诊所/医院/三甲（乘区）
  // 粮（全国池；单位=千人份）
  farmYield: 320,                // 农田 ×8
  farmLand: 3,                   // 每城耕地上限
  importPrice: 8,                // 财/粮（1×8）
  importCap: 800,                // 财/回封顶
  foodPerPop: 1.0,               // P/1000
  foodPerSoldier: 1.5,           // 服役×1.5/1000
  // 税与财政
  taxConst: 800,                 // 100×8
  taxPerPop: 1 / 1500,           // P/1500（人口已×8）
  // 消费池（消费力专题 §1.1）
  poolK: 2.5,                    // 财/千人/回（人口已×8）
  shares: { retail: 0.60, ent: 0.25, tour: 0.15 },
  // 建筑卡（×8；简化子集）
  B: {
    residence: { name: '居民楼', cap: 96000, cost: 2000, prod: 320, upkeep: 0.01, jobs: 0 },
    farm:      { name: '农田', cost: 2400, prod: 480, upkeep: 0.01 },
    street:    { name: '商业街', cap: 96, jobs: 4800, cost: 800, prod: 160, upkeep: 0.03 },
    mall:      { name: '商场', cap: 480, jobs: 12000, cost: 2400, prod: 480, upkeep: 0.03, gate: 240000 },
    office:    { name: '写字楼', income: 280, jobs: 24000, cost: 1600, prod: 320, upkeep: 0.03 },
    cinema:    { name: '影城(娱乐)', cap: 144, jobs: 5600, cost: 3200, prod: 640, upkeep: 0.01, culture: 8, heat: 2 },
    resort:    { name: '度假区(文旅)', cap: 320, jobs: 12000, cost: 4800, prod: 960, upkeep: 0.01, culture: 32, heat: 4 },
    academy:   { name: '学院', tech: 8, cost: 4000, prod: 800, upkeep: 0.01 },
    hosp:      { name: '医院(三甲)', liv: 8, grow: 0.006, cost: 6400, prod: 1280, upkeep: 0.01 },
    factory:   { name: '工业', prodOut: 64, jobs: 8000, cost: 2400, prod: 480, upkeep: 0.01 },
  },
  // 军（×8 尺度）
  salary: 0.05,                  // 财/兵/回
  peaceService: 0.005,           // 和平服役率
  warService: 0.10,              // 战时动员率
  // AI
  maxBuildPerTurn: 1,
  caps: { residence: 4, farm: 3, street: 6, mall: 2, office: 8, cinema: 6, resort: 2, academy: 2, hosp: 1, factory: 4 },
  totalBuildCap: 35,           // 每城建筑总数上限（简化 L2 地块）
  // 战争（简化：t80 后每 15 回判定，强弱差>1.3 开战）
  warStart: 100,
  warEvery: 20,
  warRatio: 1.3,
  maxWars: 2,
  occupationPop: 0.8,
};

// ============ 城市初始（v22 人口表 ×8；承载=人口×1.5） ============
function makeCities() {
  const raw = [
    ['北京', 'CN', 256000, 55], ['上海', 'CN', 360000, 55], ['深圳', 'CN', 320000, 50],
    ['香港', 'CN', 224000, 35], ['台北', 'CN', 200000, 50], ['西安', 'CN', 160000, 55],
    ['东京', 'JP', 400000, 60], ['名古屋', 'JP', 208000, 55], ['长崎', 'JP', 144000, 50],
    ['首尔', 'KR', 304000, 55], ['仁川', 'KR', 176000, 50],
    ['悉尼', 'AU', 208000, 65], ['墨尔本', 'AU', 176000, 70],
    ['达尔文', 'NONE', 48000, 40],
  ];
  return raw.map(([name, fac, pop, q]) => ({
    name, fac, P: pop, C: pop * 1.5, q,
    // 初始建筑（简化：每城市政府生产基础 + 少量初始件）
    b: { residence: 0, farm: 0, street: 0, mall: 0, office: 0, cinema: 0, resort: 0, academy: 0, hosp: 0, factory: 0 },
    prodBank: 0, builtThisTurn: 0,
    // 初始建筑补贴：按原 cities.json 初始件粗略给（农田/高新/学院等折算）
    init: true,
  }));
}

function makeFactions(cities) {
  const f = {};
  for (const c of cities) {
    if (c.fac === 'NONE') continue;
    f[c.fac] = f[c.fac] || { id: c.fac, cities: [], treasury: 12000, soldiers: 0, service: 0, tech: 0, atWar: false, warTarget: null, wars: 0 };
    f[c.fac].cities.push(c);
  }
  return f;
}

// ============ 单城结算 ============
function cityStats(c, facs, F, desire) {
  const B = c.b;
  // 岗位与就业
  const jobs = B.street * P.B.street.jobs + B.mall * P.B.mall.jobs + B.office * P.B.office.jobs
    + B.cinema * P.B.cinema.jobs + B.resort * P.B.resort.jobs + B.factory * P.B.factory.jobs;
  const employed = Math.min(c.P * 0.6, jobs);          // 就业上限=人口60%（其余老幼）
  const employmentRate = jobs > 0 ? employed / jobs : 0.95;
  // 住房分 H 与宜居 L（简化：住房 + 医疗 + 娱乐+2/座）
  const r = c.P / c.C;
  const crowd = clamp(1.10 - 0.60 * r, 0, 1);
  const H = 100 * (0.5 * c.q / 100 + 0.5 * crowd);
  const L = clamp(50 + 0.40 * (H - 50) + 0.15 * (B.hosp > 0 ? 60 : 0) + 2 * (B.cinema + B.resort), 0, 100);
  // 人口（单一自然增长公式 · 平衡 1.5 倍承载；不暴露出生/死亡）
  const fL = clamp(L / 60, 0.5, 1.5);
  const fF = clamp(F / 70, 0, 1);
  const h = B.hosp > 0 ? P.growthHospital[4] : (c.init ? P.growthHospital[2] : 1);
  const g = P.growthBase * h * fL * fF * (P.growthBalance - r);
  const dP = c.P * clamp(g, -0.03, 0.03);
  // 税与消费
  const tax = P.taxConst + c.P * P.taxPerPop;
  const civilian = c.P * (1 - (facs[c.fac] ? facs[c.fac].service : 0));
  const pool = civilian / 1000 * P.poolK * desire * P.S;
  // 消费回收（类内按上限依次；简化为每类建筑上限×座数，份额内取 min）
  const retailCap = B.street * P.B.street.cap + B.mall * P.B.mall.cap;
  const entCap = B.cinema * P.B.cinema.cap;
  const tourCap = B.resort * P.B.resort.cap;
  let retail = Math.min(pool * P.shares.retail, retailCap);
  let ent = Math.min(pool * P.shares.ent, entCap);
  let tourBase = Math.min(pool * P.shares.tour, tourCap);
  // 缺类/剩余回流（简化：某类无建筑则份额回流给其他类；简化为零售吃剩余）
  const missing = (entCap === 0 ? pool * P.shares.ent : 0) + (tourCap === 0 ? pool * P.shares.tour : 0);
  retail = Math.min(pool * P.shares.retail + missing, retailCap);
  // 文旅热度乘区（简化 heat=10+文化产出×0.8；无文化=0.5 保底）
  const heat = 10 + (B.cinema * P.B.cinema.culture + B.resort * P.B.resort.culture) * 0.8;
  const tourMult = clamp(0.5 + heat / 100, 0.5, 2.0);
  const tour = tourBase * tourMult;
  // 维护
  const upkeep = B.residence * P.B.residence.cost * P.B.residence.upkeep
    + B.farm * P.B.farm.cost * P.B.farm.upkeep
    + B.street * P.B.street.cost * P.B.street.upkeep
    + B.mall * P.B.mall.cost * P.B.mall.upkeep
    + B.office * P.B.office.cost * P.B.office.upkeep
    + B.cinema * P.B.cinema.cost * P.B.cinema.upkeep
    + B.resort * P.B.resort.cost * P.B.resort.upkeep
    + B.academy * P.B.academy.cost * P.B.academy.upkeep
    + B.hosp * P.B.hosp.cost * P.B.hosp.upkeep
    + B.factory * P.B.factory.cost * P.B.factory.upkeep;
  const income = B.office * P.B.office.income * employmentRate + retail + ent + tour;
  return { jobs, employed, employmentRate, L, H, r, g, dP, tax, pool, retail, ent, tour, upkeep, income, heat };
}

// ============ AI 建造（缺口驱动，简化） ============
function aiBuild(c, s, F, fac) {
  if (c.builtThisTurn >= P.maxBuildPerTurn) return;
  const totalB = Object.values(c.b).reduce((a, b) => a + b, 0);
  if (totalB >= P.totalBuildCap) return;
  const room = (k) => c.b[k] < P.caps[k];
  const prod = 64 + c.b.factory * P.B.factory.prodOut; // 市政府 64 + 工业
  c.prodBank += prod;
  const want = [];
  // 粮安
  if (F < 90 && room('farm')) want.push(['farm', P.B.farm.cost]);
  // 承载
  if (c.P / c.C > 0.95 && room('residence')) want.push(['residence', P.B.residence.cost]);
  // 消费供给不足（利用率<50% 且池大）
  if (s.retail < s.pool * 0.6 * P.shares.retail && room('street')) want.push(['street', P.B.street.cost]);
  if (c.P >= P.B.mall.gate && s.retail < s.pool * 0.6 * P.shares.retail && room('mall')) want.push(['mall', P.B.mall.cost]);
  // 岗位
  if (s.jobs < c.P * 0.45 && room('office')) want.push(['office', P.B.office.cost]);
  // 科技
  if (fac.tech < 38 && room('academy')) want.push(['academy', P.B.academy.cost]);
  // 医院（宜居/增速）
  if (room('hosp')) want.push(['hosp', P.B.hosp.cost]);
  // 娱乐/文旅（消费升级，缺类回流结束后）
  if (s.ent < s.pool * P.shares.ent * 0.5 && room('cinema')) want.push(['cinema', P.B.cinema.cost]);
  if (s.tour < s.pool * P.shares.tour * 0.5 && room('resort')) want.push(['resort', P.B.resort.cost]);
  for (const [key, cost] of want) {
    if (c.prodBank < cost / 5) continue; // 生产进度
    if (fac.treasury < cost * 0.1) continue;
    // 简化：生产+财双付，1 回建成（工期折算进成本）
    c.b[key] += 1;
    fac.treasury -= cost * 0.10; // 财买 10% 象征（完整版按财造价）
    c.prodBank -= cost / 5;
    c.builtThisTurn += 1;
    return;
  }
}

// ============ 主循环 ============
function run(turns, seed) {
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const cities = makeCities();
  const facs = makeFactions(cities);
  // 初始建筑补贴（按原初始件：首都/大城市各给少量）
  for (const c of cities) {
    if (c.fac === 'NONE') { c.b.farm = 1; continue; }
    c.b.farm = c.fac === 'CN' ? 2 : 1;
    c.b.residence = 1;
    c.b.office = 1;
    c.b.street = 1;
    if (c.P >= 300000) { c.b.academy = 1; c.b.mall = 1; }
    c.b.hosp = 1;
  }
  const log = [];
  for (let t = 1; t <= turns; t++) {
    // 全国粮（先按上回合人口算需求；单位=千人份）
    let totalQ = 0, totalD = 0;
    let totalPop = 0;
    for (const c of cities) totalQ += c.b.farm * P.farmYield;
    for (const c of cities) totalPop += c.P;
    for (const f of Object.values(facs)) {
      for (const c of f.cities) totalD += c.P / 1000 + f.soldiers * P.foodPerSoldier / 1000;
    }
    // 进口（缺口 1:1，按阵营人口占比分摊；封顶）
    let imported = 0;
    for (const f of Object.values(facs)) {
      const campPop = f.cities.reduce((a, c) => a + c.P, 0);
      const share = totalPop > 0 ? campPop / totalPop : 0;
      const gap = Math.max(0, totalD * share - totalQ * share); // 千人份
      const afford = Math.min(gap * P.importPrice, P.importCap, Math.max(0, f.treasury));
      imported += afford / P.importPrice;
      f.treasury -= afford;
    }
    const F = clamp(100 * (totalQ + imported) / (1.2 * totalD), 0, 100);
    // 阵营：欲望 + 服役 + 税
    for (const f of Object.values(facs)) {
      const citiesOf = f.cities;
      if (citiesOf.length === 0) continue;
      const avgL = citiesOf.reduce((a, c) => a + cityStats(c, facs, F, 1).L, 0) / citiesOf.length;
      const employmentRate = citiesOf.reduce((a, c) => a + cityStats(c, facs, F, 1).employmentRate, 0) / citiesOf.length;
      const warPen = f.atWar ? 0.15 : 0;
      const desire = clamp(1 + 0.3 * (employmentRate - 0.95) + 0.2 * (avgL - 50) / 50 - warPen, 0.5, 1.5);
      // 服役：开战动员 10%，和平 0.5%
      f.service = f.atWar ? P.warService : P.peaceService;
      let stats = [];
      let taxSum = 0, incomeSum = 0, upkeepSum = 0;
      for (const c of citiesOf) {
        const s = cityStats(c, facs, F, desire);
        stats.push(s);
        taxSum += s.tax;
        incomeSum += s.income;
        upkeepSum += s.upkeep;
        // 人口
        c.P = Math.max(1000, c.P + s.dP);
        // AI 建造
        c.builtThisTurn = 0;
        aiBuild(c, s, F, f);
      }
      // 军费
      f.soldiers = Math.min(citiesOf.reduce((a, c) => a + c.P, 0) * f.service, 999999);
      const salary = f.soldiers * P.salary;
      // 财出口（回归既有 19 项口径的简化：行政/俸禄/文化维护合并为固定项）
      const adm = citiesOf.length * 200 + 2000;
      f.treasury += taxSum + incomeSum - upkeepSum - salary - adm;
      // 科技
      f.tech = Math.min(38, f.tech + citiesOf.reduce((a, c) => a + c.b.academy * P.B.academy.tech, 0) / 400);
      // 记录
      if (t % 50 === 0 || t === 1) {
        const popTotal = citiesOf.reduce((a, c) => a + c.P, 0);
        log.push({ t, fac: f.id, pop: Math.round(popTotal), soldiers: Math.round(f.soldiers), treasury: Math.round(f.treasury), F: r2(F), tech: Math.floor(f.tech), L: r2(avgL), desire: r2(desire), service: f.service });
      }
    }
    // 战争判定（简化：t100 起每 20 回、全图每回合最多 1 场；强弱差>1.3；胜者占一城，败国城市归零才灭国）
    if (t >= P.warStart && t % P.warEvery === 0) {
      const ids = Object.keys(facs);
      let warDone = false;
      for (const a of ids) {
        if (warDone) break;
        if (facs[a].atWar || facs[a].wars >= P.maxWars || facs[a].cities.length === 0) continue;
        for (const b of ids) {
          if (a === b) continue;
          const A = facs[a], Bf = facs[b];
          const strength = (f) => f.soldiers * (1 + f.tech * 0.01);
          if (strength(A) > strength(Bf) * P.warRatio && rand() < 0.5) {
            A.atWar = true; A.warTarget = b; A.wars += 1;
            // 简化为即时结算：攻方胜，占一城
            const target = Bf.cities.reduce((x, c) => (x && x.P > c.P ? x : c), null);
            if (target) {
              Bf.cities = Bf.cities.filter((c) => c !== target);
              target.fac = a;
              target.P *= P.occupationPop;
              A.cities.push(target);
              if (Bf.cities.length === 0) {
                log.push({ t, event: `${b} 被 ${a} 灭国` });
              }
            }
            A.atWar = false; A.warTarget = null;
            warDone = true;
            break;
          }
        }
      }
    }
  }
  return { log, cities, facs };
}

const turns = Number(process.argv[2] || 200);
const seed = Number(process.argv[3] || 1);
const { log, cities, facs } = run(turns, seed);

console.log(`\n===== v22 core 盘 seed=${seed} turns=${turns} =====`);
console.log('\n[阵营] t | 人口 | 兵 | 国库 | 粮安F | 科技 | 宜居 | 欲望 | 服役');
for (const row of log) {
  if (!row.fac) { console.log('EVENT', row.t, row.event); continue; }
  console.log(`${row.fac.padEnd(3)} t${String(row.t).padStart(3)} | ${fmt(row.pop).padStart(10)} | ${fmt(row.soldiers).padStart(8)} | ${fmt(row.treasury).padStart(9)} | ${String(row.F).padStart(5)} | ${String(row.tech).padStart(2)}/38 | ${String(row.L).padStart(5)} | ${String(row.desire).padStart(4)} | ${row.service}`);
}
// 最终城况
console.log('\n[城况] 城 | 人口 | 承载 | r=P/C | 农田 | 居民楼 | 商业街 | 商场 | 写字楼 | 娱乐 | 文旅 | 学院 | 医院');
for (const c of cities) {
  console.log(`${c.name.padEnd(4)} | ${fmt(c.P).padStart(9)} | ${fmt(c.C).padStart(9)} | ${(c.P / c.C).toFixed(2)} | ${c.b.farm} | ${c.b.residence} | ${c.b.street} | ${c.b.mall} | ${c.b.office} | ${c.b.cinema} | ${c.b.resort} | ${c.b.academy} | ${c.b.hosp}`);
}
// 验收
const cn = facs['CN'];
const cnCities = cn ? cn.cities : [];
const cnPop = cnCities.reduce((a, c) => a + c.P, 0);
const cnSoldiers = cn ? cn.soldiers : 0;
const survivors = Object.values(facs).filter((f) => f.cities.length > 0).length;
console.log('\n[验收]');
console.log(`CN 人口=${fmt(cnPop)}（初始1,520,000）| CN 10% 动员=${fmt(cnPop * 0.1)}（目标≥100,000）`);
console.log(`CN 当前兵=${fmt(cnSoldiers)} | 五阵营存活=${survivors}/4 | 国库=${fmt(cn ? cn.treasury : 0)}`);
console.log(`最差粮安 F=${Math.min(...log.filter(r => r.fac).map(r => r.F))}（目标>20）`);
