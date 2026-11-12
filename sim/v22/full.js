// sim/v22/full.js — 白机版 v22 全量盘（full：多建筑谱系/电力/污染/军备/文化/19项财出口/人口政策/外交AI）
// 依据：数值尺度重定 v22（S=8）+ 人口算法 §7.2（单一式，平衡 1.5）+ 文化区 v1.0 + 市政 v1.0 + 军事数值 + 财政 19 项出口
// 运行：node sim/v22/full.js [turns] [seed]
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ================= 参数（×8 尺度；相对值同基准表） =================
const P = {
  turns: 200,
  // 人口（单一自然增长公式，人口算法 §7.2）
  growthBase: 0.008, growthBalance: 1.5,
  growthHospital: [0, 1.05, 1.10, 1.20, 1.30],
  // 粮
  farmYield: 320, foodPerPop: 1.0, foodPerSoldier: 1.5, importPrice: 8, importCap: 800,
  // 税
  taxConst: 800, taxPerPop: 1 / 1500,
  // 消费
  poolK: 2.5, shares: { retail: 0.60, ent: 0.25, tour: 0.15 },
  // 俸禄（回归公式：20×(0.8+五维/500)=32 财/将/回，×8=256；每城按 2 将）
  salaryPerGeneral: 256, generalsPerCity: 2,
  // 军
  soldierSalary: 0.05, peaceService: 0.005, warService: 0.10,
  epPerFactory: 4, epPer1000: 1, epUpkeep: 0.5, // 装备维护 0.5 财/EP/回
  // 电力/污染
  power: { plant: 40, hydro: 30, solar: 20, nuclear: 80 },
  pollution: { plant: 3, coal: 4, factory: 2, ep: 2 },
  // 政策（人口·院长 11-12：只保留生育补贴/计划生育；补贴耗财；无延迟）
  policy: { subsidyCostPer1000: 1, subsidyMult: 1.12, limitMult: 0.85 },
  // 外交
  warStart: 100, warEvery: 20, maxWarsPerFaction: 2, allyRatio: 0.6, joinWarRatio: 2.0, allyDefense: 1.5,
};
// ================= 建筑谱系（×8；上限/成本/岗位/产出） =================
const B = {
  residence: { name: '居民楼', cap: 96000, cost: 2000, prod: 320, upkeep: 0.01, jobs: 0, max: 4 },
  farm:      { name: '农田', cost: 2400, prod: 480, upkeep: 0.01, yield: 320, max: 3 },
  coal:      { name: '煤矿', cost: 1600, prod: 320, upkeep: 0.01, jobs: 4800, poll: 4, max: 2 },
  plant:     { name: '火电', cost: 2400, prod: 480, upkeep: 0.01, jobs: 3200, power: 40, poll: 3, max: 3 },
  hydro:     { name: '水电', cost: 3200, prod: 640, upkeep: 0.01, jobs: 1600, power: 30, max: 1 },
  solar:     { name: '光伏', cost: 2400, prod: 480, upkeep: 0.01, jobs: 800, power: 20, max: 3 },
  factory:   { name: '工业', cost: 2400, prod: 480, upkeep: 0.01, jobs: 8000, prodOut: 64, poll: 2, max: 4 },
  ep:        { name: '装备厂', cost: 4000, prod: 800, upkeep: 0.01, jobs: 24000, ep: 4, poll: 2, max: 2 },
  street:    { name: '商业街', cap: 96, jobs: 4800, cost: 800, prod: 160, upkeep: 0.03, max: 6 },
  mall:      { name: '商场', cap: 480, jobs: 12000, cost: 2400, prod: 480, upkeep: 0.03, gate: 240000, max: 2 },
  office:    { name: '写字楼', income: 280, jobs: 24000, cost: 1600, prod: 320, upkeep: 0.03, max: 8 },
  academy:   { name: '学院', tech: 8, cost: 4000, prod: 800, upkeep: 0.01, power: 3, max: 2 },
  hosp:      { name: '医院(三甲)', liv: 8, cost: 6400, prod: 1280, upkeep: 0.01, power: 3, max: 1 },
  police:    { name: '警察厅', sb: 20, cost: 6144, prod: 1232, upkeep: 0.01, jobs: 6400, power: 3, max: 1 },
};
// 娱乐 6 线（文化区 v1.0 ×8；每线逐级升，取最高级一座）
const ENT = {
  park:   { name: '公园线', caps: [0, 40, 80], costs: [1200, 2000, 3200], jobs: [1600, 3200, 6400], cul: [0, 8, 16], liv: [2, 3, 4] },
  sport:  { name: '体育线', caps: [0, 80, 200], costs: [1600, 2800, 4800], jobs: [2400, 6400, 16000], cul: [0, 8, 16], liv: [1, 2, 3] },
  play:   { name: '游乐线', caps: [64, 200], costs: [1600, 4000], jobs: [3200, 12000], cul: [8, 16], liv: [1, 2] },
  movie:  { name: '电影线', caps: [48, 80, 144], costs: [1200, 2000, 3200], jobs: [1600, 3200, 5600], cul: [0, 8, 8], liv: [0, 1, 1] },
  esport: { name: '电竞线', caps: [48, 80, 160], costs: [1200, 2000, 4000], jobs: [1600, 3200, 9600], cul: [0, 0, 8], liv: [0, 1, 1] },
  nature: { name: '自然线', caps: [64, 96, 120], costs: [1600, 2800, 4000], jobs: [3200, 5600, 8000], cul: [8, 8, 16], liv: [1, 2, 2] },
};
const TOUR = { name: '文旅线', caps: [64, 160, 320], costs: [1200, 2800, 4800], jobs: [2400, 6400, 12000], cul: [8, 16, 32], max: 3 };
const PUB = { name: '公共文化(博物馆线)', caps: [0, 120, 320], costs: [2000, 3600, 5600], jobs: [3200, 8000, 16000], cul: [32, 48, 80], max: 3 };
const POWERIN = { factory: 6, ep: 8, academy: 3, hosp: 3, police: 3, ent: 2, tour: 2, pub: 2, office: 1 };
const CITY_INIT = [
  ['北京', 'CN', 256000, 55], ['上海', 'CN', 360000, 55], ['深圳', 'CN', 320000, 50],
  ['香港', 'CN', 224000, 35], ['台北', 'CN', 200000, 50], ['西安', 'CN', 160000, 55],
  ['东京', 'JP', 400000, 60], ['名古屋', 'JP', 208000, 55], ['长崎', 'JP', 144000, 50],
  ['首尔', 'KR', 304000, 55], ['仁川', 'KR', 176000, 50],
  ['悉尼', 'AU', 208000, 65], ['墨尔本', 'AU', 176000, 70],
  ['达尔文', 'NONE', 48000, 40],
];
const ADJ = { CN: ['KR', 'JP'], KR: ['CN', 'JP'], JP: ['CN', 'KR'], AU: [] }; // AU 远洋：仅强者可跨海

// ================= 生成 =================
function makeCities() {
  return CITY_INIT.map(([name, fac, pop, q]) => ({
    name, fac, P: pop, C: pop * 1.5, q,
    b: { residence: 0, farm: 0, coal: 0, plant: 0, hydro: 0, solar: 0, factory: 0, ep: 0, street: 0, mall: 0, office: 0, academy: 0, hosp: 0, police: 0 },
    ent: { park: 0, sport: 0, play: 0, movie: 0, esport: 0, nature: 0 },
    tour: 0, pub: 0, prodBank: 0, builtThisTurn: 0, corr: 0,
  }));
}
function makeFactions(cities) {
  const f = {};
  for (const c of cities) {
    if (c.fac === 'NONE') continue;
    f[c.fac] = f[c.fac] || { id: c.fac, cities: [], treasury: 12000, soldiers: 0, service: 0, tech: 0, wars: 0, allies: [], warTarget: null, policy: 'none', loyalty: 60, ep: 0 };
    f[c.fac].cities.push(c);
  }
  return f;
}

// ================= 单城结算 =================
function cityStats(c, facs, F, desire, powerRatio) {
  const b = c.b;
  const jobs = b.street * B.street.jobs + b.mall * B.mall.jobs + b.office * B.office.jobs
    + b.factory * B.factory.jobs + b.ep * B.ep.jobs + b.coal * B.coal.jobs + b.plant * B.plant.jobs
    + b.solar * B.solar.jobs + b.academy * 0
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].jobs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.jobs[c.tour - 1] : 0) + (c.pub ? PUB.jobs[c.pub - 1] : 0);
  const employed = Math.min(c.P * 0.6, jobs);
  const employmentRate = jobs > 0 ? employed / jobs : 0.95;
  // 电力
  const powerOut = b.plant * P.power.plant + b.hydro * P.power.hydro + b.solar * P.power.solar;
  const powerIn = b.factory * POWERIN.factory + b.ep * POWERIN.ep + b.academy * POWERIN.academy + b.hosp * POWERIN.hosp
    + b.police * POWERIN.police + (Object.values(c.ent).reduce((a, v) => a + v, 0)) * POWERIN.ent
    + (c.tour ? POWERIN.tour : 0) + (c.pub ? POWERIN.pub : 0) + b.office * POWERIN.office;
  const pr = clamp(powerIn > 0 ? powerOut / powerIn : 1, 0, 1);
  // 污染
  const poll = b.coal * P.pollution.coal + b.plant * P.pollution.plant + b.factory * P.pollution.factory + b.ep * P.pollution.ep;
  const U = clamp(poll * 2, 0, 100);
  // 住房/宜居
  const r = c.P / c.C;
  const crowd = clamp(1.10 - 0.60 * r, 0, 1);
  const H = 100 * (0.5 * c.q / 100 + 0.5 * crowd);
  const livEnt = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].liv[c.ent[k] - 1] : 0), 0);
  const L = clamp(50 + 0.40 * (H - 50) + 0.15 * (b.hosp ? 60 : 0) + livEnt - 0.30 * U, 0, 100);
  // 人口（单一式）
  const fL = clamp(L / 60, 0.5, 1.5), fF = clamp(F / 70, 0, 1);
  const h = b.hosp ? P.growthHospital[4] : P.growthHospital[2];
  const g = P.growthBase * h * fL * fF * (P.growthBalance - r);
  const dP = c.P * clamp(g, -0.03, 0.03);
  // 税/消费
  const fac = facs[c.fac];
  const tax = P.taxConst + c.P * P.taxPerPop;
  const civilian = c.P * (1 - (fac ? fac.service : 0));
  const pool = civilian / 1000 * P.poolK * desire * 8;
  const retailCap = b.street * B.street.cap + b.mall * B.mall.cap;
  const entCap = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].caps[c.ent[k] - 1] : 0), 0);
  const tourCap = c.tour ? TOUR.caps[c.tour - 1] : 0;
  let retail = Math.min(pool * P.shares.retail, retailCap);
  let ent = Math.min(pool * P.shares.ent, entCap) * pr;
  const entMissing = entCap === 0 ? pool * P.shares.ent : 0;
  retail = Math.min(pool * P.shares.retail + entMissing, retailCap);
  const culEnt = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].cul[c.ent[k] - 1] : 0), 0);
  const culPub = c.pub ? PUB.cul[c.pub - 1] : 0;
  const culTour = c.tour ? TOUR.cul[c.tour - 1] : 0;
  const C_out = (culEnt + culPub + culTour) * pr;
  const heat = 10 + C_out * 0.8;
  const tourMult = clamp(0.5 + heat / 100, 0.5, 2.0);
  const tour = Math.min(pool * P.shares.tour, tourCap) * tourMult * pr;
  // 商业产出（电力满足率乘区）
  const officeInc = b.office * B.office.income * employmentRate * pr;
  // 维护
  const upkeep = b.residence * B.residence.cost + b.farm * B.farm.cost + b.coal * B.coal.cost + b.plant * B.plant.cost
    + b.hydro * B.hydro.cost + b.solar * B.solar.cost + b.factory * B.factory.cost + b.ep * B.ep.cost
    + b.street * B.street.cost * 3 + b.mall * B.mall.cost * 3 + b.office * B.office.cost * 3
    + b.academy * B.academy.cost + b.hosp * B.hosp.cost + b.police * B.police.cost
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].costs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.costs[c.tour - 1] : 0) + (c.pub ? PUB.costs[c.pub - 1] : 0);
  // 军备
  const epOut = b.ep * P.epPerFactory;
  const income = officeInc + retail + ent + tour;
  return { jobs, employed, employmentRate, L, H, r, g, dP, tax, pool, retail, ent, tour, officeInc, upkeep: upkeep * 0.01, income, heat, C_out, powerOut, powerIn, pr, U, epOut };
}

// ================= AI 建造 =================
function aiBuild(c, s, F, fac) {
  if (c.builtThisTurn >= 1) return;
  const totalB = Object.values(c.b).reduce((a, b) => a + b, 0) + Object.values(c.ent).reduce((a, b) => a + b, 0) + (c.tour ? 1 : 0) + (c.pub ? 1 : 0);
  if (totalB >= 40) return;
  const prod = 64 + c.b.factory * B.factory.prodOut;
  c.prodBank += prod;
  const want = [];
  const room = (k, max) => c.b[k] < (max ?? B[k].max);
  const epRoom = (k, max) => c.ent[k] < max;
  // 生存优先：粮 → 电 → 住房
  if (F < 90 && room('farm')) want.push(['farm', B.farm.cost]);
  if (s.pr < 0.9 && c.b.plant < B.plant.max) want.push(['plant', B.plant.cost]);
  if (c.P / c.C > 0.95 && room('residence')) want.push(['residence', B.residence.cost]);
  // 消费供给（多娱乐线，前移到岗位前——娱乐也是就业）
  if (s.ent < s.pool * P.shares.ent * 0.6) {
    for (const k of ['park', 'movie', 'sport', 'play', 'esport', 'nature']) {
      if (epRoom(k, 3)) { want.push([`ent:${k}`, ENT[k].costs[c.ent[k]]]); break; }
    }
  }
  if (s.tour < s.pool * P.shares.tour * 0.6 && c.tour < 3) want.push(['tour', TOUR.costs[c.tour]]);
  // 岗位
  if (s.jobs < c.P * 0.45) {
    if (room('office')) want.push(['office', B.office.cost]);
    if (room('factory')) want.push(['factory', B.factory.cost]);
  }
  // 消费供给·零售
  if (s.retail < s.pool * 0.6 * P.shares.retail) {
    if (room('street')) want.push(['street', B.street.cost]);
    if (c.P >= 240000 && room('mall')) want.push(['mall', B.mall.cost]);
  }
  // 文化/科技
  if (fac.tech < 38 && room('academy')) want.push(['academy', B.academy.cost]);
  if (c.pub < 3 && s.C_out < 30) want.push(['pub', PUB.costs[c.pub]]);
  // 军备（常备：和平期也建装备厂）
  if (c.b.ep < 2 && fac.tech > 1) want.push(['ep', B.ep.cost]);
  // 市政
  if (!c.b.hosp) want.push(['hosp', B.hosp.cost]);
  if (!c.b.police) want.push(['police', B.police.cost]);
  for (const [key, cost] of want) {
    if (c.prodBank < cost / 5 || fac.treasury < cost * 0.1) continue;
    if (key.startsWith('ent:')) c.ent[key.slice(4)] += 1; else if (key === 'tour') c.tour += 1; else if (key === 'pub') c.pub += 1; else c.b[key] += 1;
    fac.treasury -= cost * 0.10; c.prodBank -= cost / 5; c.builtThisTurn += 1;
    return;
  }
}

// ================= 主循环 =================
function run(turns, seed) {
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const cities = makeCities();
  const facs = makeFactions(cities);
  for (const c of cities) {
    if (c.fac === 'NONE') { c.b.farm = 1; continue; }
    c.b.farm = c.fac === 'CN' ? 2 : 1; c.b.residence = 1; c.b.office = 1; c.b.street = 1; c.b.hosp = 1;
    if (c.P >= 300000) { c.b.academy = 1; c.b.mall = 1; c.b.plant = 1; }
    c.ent.park = 1; c.ent.movie = 1;
  }
  const log = [];
  for (let t = 1; t <= turns; t++) {
    // ==== 全国粮 ====
    let totalQ = 0, totalD = 0, totalPop = 0;
    for (const c of cities) { totalQ += c.b.farm * B.farm.yield; totalPop += c.P; }
    for (const f of Object.values(facs)) {
      for (const c of f.cities) totalD += c.P / 1000 + f.soldiers * P.foodPerSoldier / 1000;
    }
    let imported = 0;
    for (const f of Object.values(facs)) {
      const campPop = f.cities.reduce((a, c) => a + c.P, 0);
      const share = totalPop > 0 ? campPop / totalPop : 0;
      const gap = Math.max(0, totalD * share - totalQ * share);
      const afford = Math.min(gap * P.importPrice, P.importCap, Math.max(0, f.treasury));
      imported += afford / P.importPrice; f.treasury -= afford;
    }
    const F = clamp(100 * (totalQ + imported) / (1.2 * totalD), 0, 100);
    // ==== 阵营结算 ====
    let totalPower = 0;
    const factionPower = {};
    for (const f of Object.values(facs)) {
      if (f.cities.length === 0) continue;
      // 欲望
      const sample = f.cities.map((c) => cityStats(c, facs, F, 1, 1));
      const avgL = sample.reduce((a, s) => a + s.L, 0) / sample.length;
      const avgEmp = sample.reduce((a, s) => a + s.employmentRate, 0) / sample.length;
      const desire = clamp(1 + 0.3 * (avgEmp - 0.95) + 0.2 * (avgL - 50) / 50 - (f.atWar ? 0.15 : 0), 0.5, 1.5);
      // 人口政策（院长 11-12：只两张；补贴耗财；无延迟；AI 按局势选）
      const avgR = f.cities.reduce((a, c) => a + c.P / c.C, 0) / f.cities.length;
      const policyWant = (F < 85 || avgR > 1.35) ? 'limit' : (f.atWar || avgR < 1.1 ? 'subsidy' : 'none');
      f.policy = policyWant;
      let taxSum = 0, incomeSum = 0, upkeepSum = 0, epOutSum = 0;
      let stats = [];
      for (const c of f.cities) {
        const s = cityStats(c, facs, F, desire, 1);
        stats.push(s);
        taxSum += s.tax; incomeSum += s.income; upkeepSum += s.upkeep; epOutSum += s.epOut;
        let gg = s.g;
        if (f.policy === 'subsidy') gg *= P.policy.subsidyMult;
        if (f.policy === 'limit') gg *= P.policy.limitMult;
        c.P = Math.max(1000, c.P + c.P * clamp(gg, -0.03, 0.03));
        c.builtThisTurn = 0;
        aiBuild(c, s, F, f);
      }
      // 军备
      f.ep += epOutSum;
      f.soldiers = Math.min(f.cities.reduce((a, c) => a + c.P, 0) * (f.atWar ? P.warService : P.peaceService), 2000000);
      const salary = f.soldiers * P.soldierSalary;
      const epNeed = f.soldiers / 8000;
      const equip = Math.min(1, f.ep / Math.max(1, epNeed));
      const epUpkeep = Math.min(f.ep, epNeed) * P.epUpkeep;
      // 俸禄（回归公式 32×8=256/将/回；每城 2 将）
      const salaryOfficers = f.cities.length * P.generalsPerCity * P.salaryPerGeneral;
      // 人口政策成本（补贴：1 财/千人/回）
      const policyCost = f.policy === 'subsidy' ? f.cities.reduce((a, c) => a + c.P, 0) / 1000 * P.policy.subsidyCostPer1000 : 0;
      f.treasury += taxSum + incomeSum - upkeepSum - salary - salaryOfficers - epUpkeep - policyCost;
      f.tech = Math.min(38, f.tech + f.cities.reduce((a, c) => a + c.b.academy * B.academy.tech, 0) / 400);
      factionPower[f.id] = f.soldiers * (1 + 0.3 * equip);
      totalPower += factionPower[f.id];
      if (t % 50 === 0 || t === 1) {
        const pop = f.cities.reduce((a, c) => a + c.P, 0);
        log.push({ t, fac: f.id, pop: Math.round(pop), soldiers: Math.round(f.soldiers), treasury: Math.round(f.treasury), F: F.toFixed(1), tech: Math.floor(f.tech), L: avgL.toFixed(1), desire: desire.toFixed(2), policy: f.policy, equip: equip.toFixed(2) });
      }
    }
    // ==== 外交 AI（威胁评估/结盟/制衡）====
    const ids = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
    // 结盟：弱者（<第1名×0.6）自动互盟
    for (const a of ids) {
      facs[a].allies = [];
      for (const b of ids) {
        if (a === b) continue;
        const pa = factionPower[a] || 0, pb = factionPower[b] || 0;
        const strongest = Math.max(...ids.map((x) => factionPower[x] || 0));
        if (pa < strongest * P.allyRatio && pb < strongest * P.allyRatio) facs[a].allies.push(b);
      }
    }
    // 战争：每 warEvery 回、全图最多 1 场；选"最弱邻国"（非最强）；强者被联合
    if (t >= P.warStart && t % P.warEvery === 0) {
      let warDone = false;
      const ranked = ids.slice().sort((x, y) => (factionPower[y] || 0) - (factionPower[x] || 0));
      const top = ranked[0], second = ranked[1];
      // ① 被联合：第1名 > 第2名×2 → 第2/3/4 联合对其宣战（占一城）
      if (top && second && (factionPower[top] > (factionPower[second] || 0) * P.joinWarRatio) && rand() < 0.6) {
        const aggressors = ranked.slice(1);
        const a = aggressors[Math.floor(rand() * aggressors.length)];
        facs[a].warTarget = top;
        const target = facs[top].cities.reduce((x, c) => (!x || c.P > x.P ? c : x), null);
        if (target) {
          facs[top].cities = facs[top].cities.filter((c) => c !== target);
          target.fac = a; target.P *= 0.8; facs[a].cities.push(target);
          warDone = true;
          log.push({ t, event: `${a} 联合制衡 ${top}：占领 ${target.name}` });
          if (facs[top].cities.length === 0) log.push({ t, event: `${top} 被 ${a} 灭国` });
        }
      }
      // ② 弱邻扩张：非最强攻击者选最弱邻国
      if (!warDone) {
        for (const a of ids) {
          if (warDone) break;
          if (facs[a].wars >= P.maxWarsPerFaction || facs[a].cities.length === 0) continue;
          if (a === top) continue; // 最强不主动欺弱（防滚雪球）
          const targets = (ADJ[a] || []).filter((x) => ids.includes(x) && !facs[a].allies.includes(x) && x !== top)
            .sort((x, y) => (factionPower[x] || 0) - (factionPower[y] || 0));
          // AU 远洋：允许但需 2 倍战力
          const cands = targets.concat(ids.filter((x) => x !== a && x !== top && !(ADJ[a] || []).includes(x) && (factionPower[a] || 0) > (factionPower[x] || 0) * 2 && !facs[a].allies.includes(x)));
          const targetId = cands[0];
          if (!targetId) continue;
          const A = facs[a], Bf = facs[targetId];
          const defenseBonus = Bf.allies.length > 0 ? P.allyDefense : 1; // 联盟共同防御
          if ((factionPower[a] || 0) > (factionPower[targetId] || 0) * 1.3 * defenseBonus && rand() < 0.5) {
            A.wars += 1;
            const target = Bf.cities.reduce((x, c) => (!x || c.P > x.P ? c : x), null);
            if (target) {
              Bf.cities = Bf.cities.filter((c) => c !== target);
              target.fac = a; target.P *= 0.8; A.cities.push(target);
              warDone = true;
              log.push({ t, event: `${a} 攻 ${targetId}：占领 ${target.name}` });
              if (Bf.cities.length === 0) log.push({ t, event: `${targetId} 被 ${a} 灭国` });
            }
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
console.log(`\n===== v22 FULL 盘 seed=${seed} turns=${turns} =====`);
console.log('\n[阵营] t | 人口 | 兵 | 国库 | 粮安F | 科技 | 宜居 | 欲望 | 政策 | 装备率');
for (const r of log) {
  if (!r.fac) { console.log('EVENT', r.t, r.event); continue; }
  console.log(`${r.fac.padEnd(3)} t${String(r.t).padStart(3)} | ${fmt(r.pop).padStart(9)} | ${fmt(r.soldiers).padStart(8)} | ${fmt(r.treasury).padStart(9)} | ${String(r.F).padStart(5)} | ${String(r.tech).padStart(2)}/38 | ${String(r.L).padStart(5)} | ${String(r.desire).padStart(4)} | ${r.policy.padEnd(7)} | ${r.equip}`);
}
console.log('\n[城况] 城 | 人口 | 承载 | r | 农田 | 火电 | 工业 | 娱乐(6线) | 文旅 | 博物馆 | 商业 | 写字楼 | 学院');
for (const c of cities) {
  const ent = Object.values(c.ent).reduce((a, v) => a + v, 0);
  console.log(`${c.name.padEnd(4)} | ${fmt(c.P).padStart(9)} | ${fmt(c.C).padStart(8)} | ${(c.P / c.C).toFixed(2)} | ${c.b.farm} | ${c.b.plant} | ${c.b.factory} | ${ent} | ${c.tour} | ${c.pub} | ${c.b.street + c.b.mall} | ${c.b.office} | ${c.b.academy}`);
}
const cn = facs['CN'];
const cnPop = cn ? cn.cities.reduce((a, c) => a + c.P, 0) : 0;
const survivors = Object.values(facs).filter((f) => f.cities.length > 0).length;
console.log('\n[验收]');
console.log(`CN 人口=${fmt(cnPop)}（初始1,520,000）| 5% 动员=${fmt(cnPop * 0.05)} | 10%=${fmt(cnPop * 0.1)}`);
console.log(`CN 兵=${fmt(cn ? cn.soldiers : 0)} | 存活=${survivors}/4 | 国库=${fmt(cn ? cn.treasury : 0)} | 科技=${cn ? cn.tech.toFixed(0) : 0}/38`);
