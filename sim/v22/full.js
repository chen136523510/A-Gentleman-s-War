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
  // 军（B1 v1.2：批次制；1 批 = 8,000 兵；轻 1 回合/批、重 2 回合/批）
  soldierSalary: 0.05, peaceService: 0.005, warService: 0.10, stressService: 0.02,
  batchSize: 8000,
  units: {
    inf:     { name: '普通步兵', branch: 'step', q: 1.00, turns: 0, wealth: 0,     iron: 0,   coal: 0,   oil: 0 },
    assault: { name: '突击步兵', branch: 'step', q: 1.00, turns: 1, wealth: 1920,  iron: 64,  coal: 0,   oil: 0 },
    special: { name: '特种小队', branch: 'step', q: 1.05, turns: 1, wealth: 3840,  iron: 64,  coal: 0,   oil: 16 },
    tank:    { name: '坦克',     branch: 'cav',  q: 1.00, turns: 2, wealth: 12800, iron: 512, coal: 128, oil: 256 },
    heli:    { name: '武装直升机', branch: 'cav', q: 1.00, turns: 2, wealth: 12800, iron: 384, coal: 128, oil: 320 },
    mobile:  { name: '机动炮兵', branch: 'bow',  q: 1.00, turns: 1, wealth: 3200,  iron: 256, coal: 64,  oil: 0 },
    heavy:   { name: '重炮兵',   branch: 'bow',  q: 1.00, turns: 2, wealth: 6400,  iron: 512, coal: 128, oil: 0 },
  },
  counter: { step: { cav: 1.5, bow: 0.7 }, cav: { bow: 1.5, step: 0.7 }, bow: { step: 1.5, cav: 0.7 } },
  // 资源（首版国家级简化；油按 v22 石油表，铁/煤按“2 座矿场/城 × 48/回”估）
  resources: {
    CN: { iron: 576, coal: 576, oil: 86.4 },
    JP: { iron: 288, coal: 288, oil: 48 },
    KR: { iron: 192, coal: 192, oil: 24 },
    AU: { iron: 576, coal: 192, oil: 115.2 },
  },
  resourceCapTurns: 5,
  // 电力/污染
  power: { plant: 40, hydro: 30, solar: 20, nuclear: 80 },
  pollution: { plant: 3, coal: 4, factory: 2 },
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
  arsenal:   { name: '兵工厂', cost: 24000, prod: 4800, upkeep: 0.01, jobs: 0, max: 1 },
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
const POWERIN = { factory: 6, academy: 3, hosp: 3, police: 3, ent: 2, tour: 2, pub: 2, office: 1 };
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
    b: { residence: 0, farm: 0, coal: 0, plant: 0, hydro: 0, solar: 0, factory: 0, arsenal: 0, street: 0, mall: 0, office: 0, academy: 0, hosp: 0, police: 0 },
    ent: { park: 0, sport: 0, play: 0, movie: 0, esport: 0, nature: 0 },
    tour: 0, pub: 0, prodBank: 0, builtThisTurn: 0, corr: 0,
    arsenalJob: null, arsenalProgress: 0,
  }));
}
function makeFactions(cities) {
  const f = {};
  for (const c of cities) {
    if (c.fac === 'NONE') continue;
    f[c.fac] = f[c.fac] || { id: c.fac, cities: [], treasury: 12000, soldiers: 0, service: 0, tech: 0, wars: 0, allies: [], warTarget: null, policy: 'none', loyalty: 60,
      units: { inf: 0, assault: 0, special: 0, tank: 0, heli: 0, mobile: 0, heavy: 0 },
      resources: { iron: 0, coal: 0, oil: 0 } };
    f[c.fac].cities.push(c);
  }
  for (const fac of Object.values(f)) {
    const inc = P.resources[fac.id] || { iron: 0, coal: 0, oil: 0 };
    fac.resources = { iron: inc.iron * 2, coal: inc.coal * 2, oil: inc.oil * 2 };
  }
  return f;
}

// ================= 单城结算 =================
function cityStats(c, facs, F, desire, powerRatio) {
  const b = c.b;
  const jobs = b.street * B.street.jobs + b.mall * B.mall.jobs + b.office * B.office.jobs
    + b.factory * B.factory.jobs + b.arsenal * B.arsenal.jobs + b.coal * B.coal.jobs + b.plant * B.plant.jobs
    + b.solar * B.solar.jobs + b.academy * 0
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].jobs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.jobs[c.tour - 1] : 0) + (c.pub ? PUB.jobs[c.pub - 1] : 0);
  const employed = Math.min(c.P * 0.6, jobs);
  const employmentRate = jobs > 0 ? employed / jobs : 0.95;
  // 电力
  const powerOut = b.plant * P.power.plant + b.hydro * P.power.hydro + b.solar * P.power.solar;
  const powerIn = b.factory * POWERIN.factory + b.academy * POWERIN.academy + b.hosp * POWERIN.hosp
    + b.police * POWERIN.police + (Object.values(c.ent).reduce((a, v) => a + v, 0)) * POWERIN.ent
    + (c.tour ? POWERIN.tour : 0) + (c.pub ? POWERIN.pub : 0) + b.office * POWERIN.office;
  const pr = clamp(powerIn > 0 ? powerOut / powerIn : 1, 0, 1);
  // 污染
  const poll = b.coal * P.pollution.coal + b.plant * P.pollution.plant + b.factory * P.pollution.factory;
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
    + b.hydro * B.hydro.cost + b.solar * B.solar.cost + b.factory * B.factory.cost + b.arsenal * B.arsenal.cost
    + b.street * B.street.cost * 3 + b.mall * B.mall.cost * 3 + b.office * B.office.cost * 3
    + b.academy * B.academy.cost + b.hosp * B.hosp.cost + b.police * B.police.cost
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].costs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.costs[c.tour - 1] : 0) + (c.pub ? PUB.costs[c.pub - 1] : 0);
  const income = officeInc + retail + ent + tour;
  return { jobs, employed, employmentRate, L, H, r, g, dP, tax, pool, retail, ent, tour, officeInc, upkeep: upkeep * 0.01, income, heat, C_out, powerOut, powerIn, pr, U };
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
      if (epRoom(k, ENT[k].caps.length)) { want.push([`ent:${k}`, ENT[k].costs[c.ent[k]]]); break; }
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
  // 市政
  if (!c.b.hosp) want.push(['hosp', B.hosp.cost]);
  if (!c.b.police) want.push(['police', B.police.cost]);
  // 兵工厂（军事产线；科技 5 后逐城补建，每城 1 座）
  if (fac.tech > 5 && c.b.arsenal < 1) want.push(['arsenal', B.arsenal.cost]);
  for (const [key, cost] of want) {
    if (c.prodBank < cost / 5 || fac.treasury < cost * 0.1) continue;
    if (key.startsWith('ent:')) c.ent[key.slice(4)] += 1; else if (key === 'tour') c.tour += 1; else if (key === 'pub') c.pub += 1; else c.b[key] += 1;
    fac.treasury -= cost * 0.10; c.prodBank -= cost / 5; c.builtThisTurn += 1;
    return;
  }
}

// ================= 外交 AI（A1 v1 · 意图机 + softmax） =================
// 依据：docs/06-设计/05-外交/外交AI决策规范.md v1（2026-11-12）
const D = {
  actionPerTurn: 2, warCooldown: 30, peaceCooldown: 10, allyTerm: 24, peaceTerm: 12,
  acceptThreshold: 0.10, warMinTurns: 2, allyMinRelation: 20,
  // 大统领人格（officers.json aiPersonality；模拟器内联）
  leaders: {
    CN: { aggression: 0.35, caution: 0.70, loyalty: 0.80, greed: 0.45, culture: 0.85, tech: 0.80, economy: 0.75, temperature: 0.45, governance: 'culture', affinity: { JP: 0.25, KR: 0.75, AU: 0.60 }, seekProtection: null },
    JP: { aggression: 0.90, caution: 0.30, loyalty: 0.40, greed: 0.80, culture: 0.40, tech: 0.60, economy: 0.55, temperature: 0.25, governance: 'military', affinity: { CN: 0.20, KR: 0.40, AU: 0.30 }, seekProtection: null },
    KR: { aggression: 0.20, caution: 0.85, loyalty: 0.90, greed: 0.30, culture: 1.00, tech: 0.85, economy: 0.65, temperature: 0.55, governance: 'culture', affinity: { CN: 0.90, JP: 0.15, AU: 0.45 }, seekProtection: { target: 'CN', weight: 0.6 } },
    AU: { aggression: 0.25, caution: 0.75, loyalty: 0.70, greed: 0.60, culture: 0.45, tech: 1.00, economy: 0.90, temperature: 0.50, governance: 'commerce', affinity: { CN: 0.60, JP: 0.30, KR: 0.50 }, seekProtection: { target: 'CN', weight: 0.3 } },
  },
};

function makeDiplo(ids) {
  const rel = {}, cooldown = {};
  for (const a of ids) {
    rel[a] = {}; cooldown[a] = { war: 0, peace: 0 };
    for (const b of ids) if (a !== b) rel[a][b] = 0;
  }
  return { rel, repos: 0, rep: Object.fromEntries(ids.map((x) => [x, 50])), treaties: [], cooldown, memory: [], contracts: [], war: null };
}

function rankNorm(id, ids, val) {
  const sorted = ids.slice().sort((a, b) => val(b) - val(a));
  const i = sorted.indexOf(id);
  return ids.length <= 1 ? 1 : 1 - i / (ids.length - 1);
}

function victoryProgress(id, ids, facs, fpower) {
  const culture = {}, pop = {};
  for (const x of ids) {
    culture[x] = facs[x].cities.reduce((a, c) => a + c.pub * 40 + c.tour * 20 + Object.values(c.ent).reduce((s, v) => s + v * 8, 0), 0);
    pop[x] = facs[x].cities.reduce((a, c) => a + c.P, 0);
  }
  return {
    military: 0.6 * rankNorm(id, ids, (x) => fpower[x] || 0) + 0.4 * rankNorm(id, ids, (x) => facs[x].cities.length),
    culture: rankNorm(id, ids, (x) => culture[x]),
    tech: clamp(facs[id].tech / 40, 0, 1),
    economy: 0.5 * rankNorm(id, ids, (x) => facs[x].treasury) + 0.5 * rankNorm(id, ids, (x) => pop[x]),
  };
}

function softmaxPick(items, T, rand) {
  const maxU = Math.max(...items.map((i) => i.U));
  const exps = items.map((i) => Math.exp((i.U - maxU) / Math.max(0.05, T)));
  const sum = exps.reduce((a, b) => a + b, 0);
  let x = rand() * sum;
  for (let i = 0; i < items.length; i++) { x -= exps[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
}

function diploTick(t, facs, diplo, fpower, ids, rand, log) {
  ids = ids.filter((x) => facs[x].cities.length > 0);
  for (const f of Object.values(facs)) f.atWar = diplo.war ? (f.id === diplo.war.a || f.id === diplo.war.b) : false;
  // 外交决策用"动员潜力"（人口×10%）而非当前士兵——避免战争动员 10% vs 和平 0.5% 的 20 倍误判
  const dipPower = {};
  for (const x of ids) dipPower[x] = facs[x].cities.reduce((a, c) => a + c.P, 0) * 0.10;

  // ---- 战争结算（开战后 warMinTurns 判定一次：占城 or 停战）----
  if (diplo.war) {
    const { a, b, start } = diplo.war;
    if (t - start >= D.warMinTurns) {
      const A = facs[a], Bf = facs[b];
      // 同盟参战（军事同盟防御性自动参战）：盟友潜力折算为守方有效战力
      const alliesOfB = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b));
      const allyBonus = alliesOfB.reduce((s, x) => {
        const aid = x.a === b ? x.b : x.a;
        return s + 0.5 * ((dipPower[aid] || 0) / Math.max(1, dipPower[b] || 0));
      }, 0);
      const pr = warRatio(facs[a], facs[b]) / (1 + allyBonus);
      if (pr > 1.3) {
        const target = Bf.cities.reduce((x, c) => (!x || c.P < x.P ? c : x), null); // 占最小城（不一次打崩）
        if (target) {
          Bf.cities = Bf.cities.filter((c) => c !== target);
          target.fac = a; target.P *= 0.8; A.cities.push(target);
          diplo.rep[a] = clamp(diplo.rep[a] - 5, 0, 100);
          diplo.rel[b][a] = clamp(diplo.rel[b][a] - 40, -100, 100);
          for (const x of ids) if (x !== a && x !== b) diplo.rel[x][a] = clamp(diplo.rel[x][a] - 10, -100, 100);
          log.push({ t, event: `${a} 攻 ${b}：占领 ${target.name}（战力比 ${pr.toFixed(2)}）` });
          if (Bf.cities.length === 0) log.push({ t, event: `${b} 被 ${a} 灭国` });
        }
      } else {
        diplo.treaties.push({ type: 'peace', a, b, expire: t + D.peaceTerm });
        diplo.rel[a][b] = clamp(diplo.rel[a][b] + 5, -100, 100);
        diplo.rel[b][a] = clamp(diplo.rel[b][a] + 5, -100, 100);
        log.push({ t, event: `${a} 与 ${b} 停战（战力比 ${pr.toFixed(2)}）` });
      }
      diplo.war = null;
      diplo.cooldown[a].peace = t + D.peaceCooldown;
    }
    return;
  }

  // ---- 同盟到期：关系≥0 自动续约（静默）；关系破裂或一方灭国则解散 ----
  for (const tr of diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire <= t)) {
    const alive = facs[tr.a] && facs[tr.a].cities.length > 0 && facs[tr.b] && facs[tr.b].cities.length > 0;
    if (alive && diplo.rel[tr.a][tr.b] >= -50) tr.expire = t + D.allyTerm;
    else { tr.dead = true; log.push({ t, event: `${tr.a}-${tr.b} 同盟解散` }); }
  }

  // ---- 关系自然回归（和平期缓慢回中并小幅上升）----
  for (const a of ids) for (const b of ids) if (a !== b) {
    const atWar = diplo.war && ((diplo.war.a === a && diplo.war.b === b) || (diplo.war.a === b && diplo.war.b === a));
    if (!atWar) diplo.rel[a][b] = clamp(diplo.rel[a][b] * 0.99 + 0.05, -100, 100);
  }

  // ---- 意图生成 + softmax 掷骰（随机行动顺序，防第一个阵营垄断）----
  const order = ids.slice().sort(() => rand() - 0.5);
  let actions = 0;
  for (const a of order) {
    if (actions >= D.actionPerTurn) break;
    const L = D.leaders[a];
    if (!L) continue;
    const prog = victoryProgress(a, ids, facs, dipPower);
    const cands = [];
    for (const b of ids) {
      if (b === a) continue;
      const R = diplo.rel[a][b];
      const ally = diplo.treaties.some((x) => x.type === 'ally' && !x.dead && x.expire > t && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
      const peace = diplo.treaties.some((x) => x.type === 'peace' && x.expire > t && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
      const pr = (dipPower[a] || 0) / Math.max(1, dipPower[b] || 0);
      const adj = (ADJ[a] || []).includes(b);
      // 宣战 U（A1 §6.1；2026-11-12 修：可胜门槛 pr≥1.3、跨海≥1.6、低声誉目标门槛 −20%）
      if (!ally && !peace && t >= P.warStart && t >= (diplo.cooldown[a].war || 0)) {
        const repFactor = diplo.rep[b] < 30 ? 0.80 : 1; // 声誉低 → 更容易被宣战（A1 §九）
        if (pr < (adj ? 1.30 : 1.60) * repFactor) continue;
        const feasibility = clamp(pr * 0.8, 0, 1.5) / 1.5;
        const threat = clamp((dipPower[b] / Math.max(1, dipPower[a])) * 0.4, 0, 1);
        const intervene = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b)).length * 0.35;
        let U = 0.30 * 0.6 + 0.15 * 0.5 + 0.25 * feasibility + 0.20 * threat
          - 0.30 * (1 - Math.min(pr, 1.5) / 1.5) * L.caution
          - 0.25 * intervene * L.caution - 0.15 * 0.5
          + 0.20 * L.aggression + (adj ? 0.10 : -0.15);
        // 胜利路径修正（A1 §五）
        const milPath = prog.military * L.aggression;
        const culPath = prog.culture * L.culture;
        U *= milPath >= culPath ? 1.10 : 0.90;
        cands.push({ type: 'war', b, U, pr, label: `宣战${b}` });
      }
      // 结盟 U（A1 §6.2；军事同盟可多成员，边际效用递减；相性高可在低关系下结盟）
      const allyCount = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === a || x.b === a)).length;
      const allyOpen = R >= D.allyMinRelation * (diplo.rep[b] < 30 ? 1.20 : 1) || ((L.affinity[b] || 0) >= 0.70 && R >= -20) || (L.seekProtection && L.seekProtection.target === b);
      if (!ally && !peace && allyOpen) {
        const seek = L.seekProtection && L.seekProtection.target === b ? L.seekProtection.weight * 0.25 : 0;
        let U = 0.35 * 0.5 + 0.30 * (L.affinity[b] || 0.3) + 0.20 * (1 - Math.min(pr, 1)) - 0.25 * 0.3 * L.caution + seek;
        U /= (1 + allyCount); // 已有盟友越多，再结盟的边际效用越低
        cands.push({ type: 'ally', b, U, label: `结盟${b}` });
      }
      // 劝降 U（A1 §6.4；2026-11-12 修：目标仅剩 1 城、战力比≥2.5、有盟友保护则不可行、失败冷却）
      const hasAllyProtect = diplo.treaties.some((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b));
      if (!ally && !hasAllyProtect && pr >= 2.5 && adj && t >= P.warStart && facs[b].cities.length <= 1 && t >= (diplo.annexCd && diplo.annexCd[a + b] || 0)) {
        const U = 0.45 * Math.min(pr / 3, 1) + 0.25 * 0.5 + 0.15 * (R / 100) + 0.15 * L.greed;
        cands.push({ type: 'annex', b, U, pr, label: `劝降${b}` });
      }
    }
    cands.push({ type: 'none', U: 0.15, label: '观望' });
    const pick = softmaxPick(cands, L.temperature, rand);
    if (pick.type === 'none') continue;
    actions++;
    const b = pick.b;
    if (pick.type === 'war') {
      diplo.war = { a, b, start: t };
      diplo.cooldown[a].war = t + D.warCooldown;
      diplo.rep[a] = clamp(diplo.rep[a] - 5, 0, 100);
      for (const x of ids) if (x !== a && x !== b) diplo.rel[x][a] = clamp(diplo.rel[x][a] - 10, -100, 100);
      log.push({ t, event: `${a} 宣战 ${b}（U=${pick.U.toFixed(2)} 军力比 ${(pick.pr || 0).toFixed(2)}）` });
    } else if (pick.type === 'ally') {
      diplo.treaties.push({ type: 'ally', a, b, expire: t + D.allyTerm });
      diplo.rel[a][b] = clamp(diplo.rel[a][b] + 10, -100, 100);
      diplo.rel[b][a] = clamp(diplo.rel[b][a] + 10, -100, 100);
      diplo.rep[a] = clamp(diplo.rep[a] + 2, 0, 100);
      log.push({ t, event: `${a} 与 ${b} 结盟（${D.allyTerm} 回合，U=${pick.U.toFixed(2)}）` });
    } else if (pick.type === 'annex') {
      // 目标接受判定（A1 §8.1：关系/声誉/战力综合；弱势+低声誉的劝降方易被拒）
      const accept = clamp(0.15 + (pick.pr - 2.5) * 0.25 + (50 - diplo.rep[a]) * 0.003, 0.05, 0.90);
      if (rand() > accept) {
        diplo.annexCd = diplo.annexCd || {};
        diplo.annexCd[a + b] = t + 5; // 劝降失败冷却 5 回合
        log.push({ t, event: `${a} 劝降 ${b} 被拒（接受率 ${(accept * 100).toFixed(0)}%）` });
        continue;
      }
      const Bf = facs[b];
      for (const c of Bf.cities) { c.fac = a; c.P *= 0.8; facs[a].cities.push(c); }
      Bf.cities = [];
      diplo.rep[a] = clamp(diplo.rep[a] - 10, 0, 100);
      log.push({ t, event: `${a} 劝降 ${b}（不战而屈人之兵，潜力比 ${(pick.pr || 0).toFixed(2)} = ${Math.round(dipPower[a] || 0)}/${Math.round(dipPower[b] || 0)}）` });
    }
  }
}

// ================= B1 兵种/兵工厂 =================
function totalUnits(f) {
  return Object.values(f.units).reduce((a, b) => a + b, 0);
}
function dominantBranch(f) {
  const by = { step: 0, cav: 0, bow: 0 };
  for (const [k, n] of Object.entries(f.units)) by[P.units[k].branch] += n;
  return Object.keys(by).sort((a, b) => by[b] - by[a])[0];
}
function compositionPower(f, targetBranch) {
  let p = 0;
  for (const [k, n] of Object.entries(f.units)) {
    if (!n) continue;
    const u = P.units[k];
    const c = targetBranch && P.counter[u.branch] ? (P.counter[u.branch][targetBranch] || 1) : 1;
    p += n * u.q * c;
  }
  return p * (1 + f.tech * 0.01);
}
function warRatio(A, B) {
  const atk = compositionPower(A, dominantBranch(B));
  const def = compositionPower(B, dominantBranch(A));
  return atk / Math.max(1, def);
}
// 产线选型：战时/军事人格优先机械化；否则先补步兵（便宜、不吃油）
function pickUnit(f) {
  const can = (k) => {
    const u = P.units[k];
    if (f.units.inf < P.batchSize) return false;
    if (f.treasury < u.wealth) return false;
    if (f.resources.iron < u.iron || f.resources.coal < u.coal || f.resources.oil < u.oil) return false;
    return true;
  };
  const leader = D.leaders[f.id];
  const military = f.atWar || (leader && leader.aggression > 0.7);
  const order = military
    ? ['tank', 'heli', 'assault', 'special', 'heavy', 'mobile']
    : ['assault', 'special', 'mobile', 'heavy', 'tank', 'heli'];
  const affordable = order.filter(can);
  if (!affordable.length) return null;
  // 在可负担类型里选“当前数量最少”的，避免单一兵种海（也保证特种/炮兵会出现）
  affordable.sort((a, b) => f.units[a] - f.units[b]);
  return affordable[0];
}

// ================= 主循环 =================
function run(turns, seed, stress = false, stressService = P.stressService) {
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const cities = makeCities();
  const facs = makeFactions(cities);
  for (const c of cities) {
    if (c.fac === 'NONE') { c.b.farm = 1; continue; }
    c.b.farm = c.fac === 'CN' ? 2 : 1; c.b.residence = 1; c.b.office = 1; c.b.street = 1; c.b.hosp = 1;
    if (c.P >= 300000) { c.b.academy = 1; c.b.mall = 1; c.b.plant = 1; }
    c.ent.park = 1; c.ent.movie = 1;
    // B1 v1.2 初始兵工厂：深圳(CN)/长崎(JP)/首尔(KR)/悉尼(AU)
    if (['深圳', '长崎', '首尔', '悉尼'].includes(c.name)) c.b.arsenal = 1;
  }
  const log = [];
  const diplo = makeDiplo(['CN', 'JP', 'KR', 'AU']);
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
      let taxSum = 0, incomeSum = 0, upkeepSum = 0;
      let stats = [];
      for (const c of f.cities) {
        const s = cityStats(c, facs, F, desire, 1);
        stats.push(s);
        taxSum += s.tax; incomeSum += s.income; upkeepSum += s.upkeep;
        let gg = s.g;
        if (f.policy === 'subsidy') gg *= P.policy.subsidyMult;
        if (f.policy === 'limit') gg *= P.policy.limitMult;
        c.P = Math.max(1000, c.P + c.P * clamp(gg, -0.03, 0.03));
        c.builtThisTurn = 0;
        aiBuild(c, s, F, f);
      }
      // ==== 资源收入（国家级简化；库存上限 5 回合）====
      const inc = P.resources[f.id] || { iron: 0, coal: 0, oil: 0 };
      for (const k of ['iron', 'coal', 'oil'])
        f.resources[k] = Math.min(f.resources[k] + inc[k], inc[k] * P.resourceCapTurns);
      // ==== 征募（普通步兵）====
      const popTotal = f.cities.reduce((a, c) => a + c.P, 0);
      const target = Math.min(popTotal * (f.atWar ? (stress ? stressService : P.warService) : P.peaceService), 2000000);
      let total = totalUnits(f);
      if (target > total) f.units.inf += target - total;
      else if (target < total) {
        let cut = total - target;
        for (const k of ['inf', 'assault', 'special', 'mobile', 'heavy', 'heli', 'tank']) {
          const d = Math.min(cut, f.units[k]); f.units[k] -= d; cut -= d;
          if (cut <= 0) break;
        }
      }
      // ==== 兵工厂产出（每城 1 座；Lv1=1 条产线；轻 1 回合/批、重 2 回合/批）====
      for (const c of f.cities) {
        if (c.b.arsenal <= 0) continue;
        if (!c.arsenalJob) {
          const job = pickUnit(f);
          if (job) {
            const u = P.units[job];
            f.units.inf -= P.batchSize;
            f.treasury -= u.wealth;
            f.resources.iron -= u.iron;
            f.resources.coal -= u.coal;
            f.resources.oil -= u.oil;
            c.arsenalJob = job;
            c.arsenalProgress = 0;
          }
        }
        if (c.arsenalJob) {
          c.arsenalProgress += 1;
          if (c.arsenalProgress >= P.units[c.arsenalJob].turns) {
            f.units[c.arsenalJob] += P.batchSize;
            c.arsenalJob = null;
            c.arsenalProgress = 0;
          }
        }
      }
      f.soldiers = totalUnits(f);
      const salary = f.soldiers * P.soldierSalary;
      // 俸禄（回归公式 32×8=256/将/回；每城 2 将）
      const salaryOfficers = f.cities.length * P.generalsPerCity * P.salaryPerGeneral;
      // 人口政策成本（补贴：1 财/千人/回）
      const policyCost = f.policy === 'subsidy' ? f.cities.reduce((a, c) => a + c.P, 0) / 1000 * P.policy.subsidyCostPer1000 : 0;
      f.treasury += taxSum + incomeSum - upkeepSum - salary - salaryOfficers - policyCost;
      f.tech = Math.min(38, f.tech + f.cities.reduce((a, c) => a + c.b.academy * B.academy.tech, 0) / 400);
      factionPower[f.id] = compositionPower(f, null);
      totalPower += factionPower[f.id];
      if (t % 50 === 0 || t === 1) {
        const pop = f.cities.reduce((a, c) => a + c.P, 0);
        log.push({ t, fac: f.id, pop: Math.round(pop), soldiers: Math.round(f.soldiers), treasury: Math.round(f.treasury), F: F.toFixed(1), tech: Math.floor(f.tech), L: avgL.toFixed(1), desire: desire.toFixed(2), policy: f.policy, oil: f.resources.oil, factories: f.cities.reduce((a, c) => a + (c.b.arsenal ? 1 : 0), 0) });
      }
    }
    // ==== 外交 AI（A1 v1 意图机）====
    if (stress) {
      for (const f of Object.values(facs)) f.atWar = true;
    } else {
      diploTick(t, facs, diplo, factionPower, Object.keys(facs), rand, log);
    }
  }
  return { log, cities, facs, diplo };
}

const turns = Number(process.argv[2] || 200);
const seed = Number(process.argv[3] || 1);
const stress = process.argv[4] === 'stress';
const stressService = Number(process.argv[5] || P.stressService);
const { log, cities, facs, diplo } = run(turns, seed, stress, stressService);
console.log(`\n===== v22 FULL 盘 seed=${seed} turns=${turns}${stress ? ` 模式=战时压力(${(stressService * 100).toFixed(1)}%)` : ''} =====`);
console.log('\n[阵营] t | 人口 | 兵 | 国库 | 粮安F | 科技 | 宜居 | 欲望 | 政策 | 油 | 兵工厂');
for (const r of log) {
  if (!r.fac) { console.log('EVENT', r.t, r.event); continue; }
  console.log(`${r.fac.padEnd(3)} t${String(r.t).padStart(3)} | ${fmt(r.pop).padStart(9)} | ${fmt(r.soldiers).padStart(8)} | ${fmt(r.treasury).padStart(9)} | ${String(r.F).padStart(5)} | ${String(r.tech).padStart(2)}/38 | ${String(r.L).padStart(5)} | ${String(r.desire).padStart(4)} | ${r.policy.padEnd(7)} | ${String(Math.round(r.oil)).padStart(6)} | ${r.factories}`);
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
console.log('\n[兵种构成 t200] 阵营 | 普通 | 突击 | 特种 | 坦克 | 武直 | 机动炮 | 重炮 | 铁 | 煤 | 油 | 兵工厂');
for (const f of Object.values(facs)) {
  if (!f.cities.length) continue;
  const u = f.units, facN = f.cities.reduce((a, c) => a + (c.b.arsenal ? 1 : 0), 0);
  console.log(`${f.id} | ${fmt(u.inf)} | ${fmt(u.assault)} | ${fmt(u.special)} | ${fmt(u.tank)} | ${fmt(u.heli)} | ${fmt(u.mobile)} | ${fmt(u.heavy)} | ${fmt(f.resources.iron)} | ${fmt(f.resources.coal)} | ${fmt(f.resources.oil)} | ${facN}`);
}

// 胜利路径（A1 §五）
console.log('\n[胜利路径]');
{
  const idsAlive = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  const fp = {};
  for (const x of idsAlive) fp[x] = compositionPower(facs[x], null) * 1.2;
  for (const x of idsAlive) {
    const p = victoryProgress(x, idsAlive, facs, fp);
    const L = D.leaders[x];
    const w = { military: p.military * L.aggression, culture: p.culture * L.culture, tech: p.tech * L.tech, economy: p.economy * L.economy };
    const main = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    console.log(`${x} 主路径=${main}（军${p.military.toFixed(2)} 文${p.culture.toFixed(2)} 科${p.tech.toFixed(2)} 经${p.economy.toFixed(2)}）`);
  }
}

// 外交摘要（A1）
console.log('\n[外交]');
for (const a of Object.keys(diplo.rel)) {
  const rels = Object.keys(diplo.rel[a]).map((b) => `${b}:${diplo.rel[a][b].toFixed(0)}`).join(' ');
  console.log(`${a} rep=${diplo.rep[a].toFixed(0)} | ${rels}`);
}
const allies = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead).map((x) => `${x.a}-${x.b}(至t${x.expire})`);
const peaces = diplo.treaties.filter((x) => x.type === 'peace').map((x) => `${x.a}-${x.b}(至t${x.expire})`);
console.log(`同盟：${allies.join(' ') || '无'}`);
console.log(`停战：${peaces.join(' ') || '无'}`);
