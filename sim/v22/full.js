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
  growthBase: 0.006, growthBalance: 1.5, growthLivExp: 1.5,
  growthCap: 0.02, // 院长 11-13 第 7 条：限速但不过度（-2%~+2%）
  // 科技胜利（院长 11-13 "科技拉力你来收束"）：率先建成任一终极工程 = 科技胜利
  // 文档口径 2,000 财 + 2,500 生产；模拟器按 60 回合工程周期折算
  projectTurns: 60,
  recruitFee: 1, // A1.4 征募费（财/兵，自定；文档 8 财/兵为基准口径）
  buyPrice: { iron: 1.2, coal: 1.0, oil: 2.0 }, // A1.4 外交采购价
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
  arsenal:   { name: '兵工厂', cost: 24000, prod: 4800, upkeep: 0.01, jobs: 0, max: 3 }, // A1.4：Lv1~3 = 1/2/3 产线（升级不占地）
  airport:   { name: '机场', cost: 4800, prod: 960, upkeep: 0.01, jobs: 0, max: 1 },      // 驻机 8（Lv1）
  aaGun:     { name: '防空炮', cost: 960, prod: 160, upkeep: 0.01, jobs: 0, max: 2 },     // 射程 4 格
  // B1 战斗层（2026-11-13 方案，数值自定）
  bomber:    { name: '轰炸机', wealth: 4800, iron: 240, oil: 160, turns: 2, qAir: 22, qGroundTroops: 11, ammoWealth: 800, ammoOil: 80, cd: 3 },
  drone:     { name: '无人机', wealth: 960, oil: 40, turns: 1, qGround: 8, maxPerCity: 10 },
  street:    { name: '商业街', cap: 96, jobs: 4800, cost: 800, prod: 160, upkeep: 0.03, max: 6 },
  mall:      { name: '商场', cap: 480, jobs: 12000, cost: 2400, prod: 480, upkeep: 0.03, gate: 240000, max: 2 },
  office:    { name: '写字楼', income: 280, jobs: 24000, cost: 1600, prod: 320, upkeep: 0.03, max: 8 },
  // 学院链（学院区开题 §3.1；Lv1 学校→Lv2→Lv3，升级不占地；科技 10/16/24）
  academy:   { name: '学院链', tech: [0, 10, 16, 24], cost: 4000, prod: 800, upkeep: 0.01, power: 3, max: 3,
               upCost: [0, 0, 4480, 7168] },
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
    b: { residence: 0, farm: 0, coal: 0, plant: 0, hydro: 0, solar: 0, factory: 0, arsenal: 0, airport: 0, aaGun: 0, street: 0, mall: 0, office: 0, academy: 0, hosp: 0, police: 0 },
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
      bombers: 0, drones: 0, airQueue: null, airProgress: 0, // A1.4 空军（机场独立队列）
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
  const g = P.growthBase * h * Math.pow(fL, P.growthLivExp) * fF * (P.growthBalance - r); // 宜居权重 1.5 次方（院长第 7 条）
  const dP = c.P * clamp(g, -P.growthCap, P.growthCap);
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
    + b.airport * B.airport.cost + b.aaGun * B.aaGun.cost
    + b.street * B.street.cost * 3 + b.mall * B.mall.cost * 3 + b.office * B.office.cost * 3
    + b.academy * B.academy.cost + b.hosp * B.hosp.cost + b.police * B.police.cost
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].costs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.costs[c.tour - 1] : 0) + (c.pub ? PUB.costs[c.pub - 1] : 0);
  const income = officeInc + retail + ent + tour;
  return { jobs, employed, employmentRate, L, H, r, g, dP, tax, pool, retail, ent, tour, officeInc, upkeep: upkeep * 0.01, income, heat, C_out, powerOut, powerIn, pr, U };
}

// ================= AI 建造 =================
function aiBuild(c, s, F, fac, devMode) {
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
  // A1.2 科技拉力（院长第 9 条，所有阵营）：多建学院区建筑——三级学院是人才培养主来源
  if (fac.tech < 40 && c.b.academy < 3) {
    const acCost = c.b.academy === 0 ? B.academy.cost : B.academy.upCost[c.b.academy];
    want.push(['academy', acCost]);
  }
  // JP 军事优先（院长第 7 条）：兵工厂先行；遇强邻 devMode 已转 tech
  if (devMode === 'military' && fac.tech > 5 && c.b.arsenal < 1) want.push(['arsenal', B.arsenal.cost]);
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
  // 文化
  if (c.pub < 3 && s.C_out < 30) want.push(['pub', PUB.costs[c.pub]]);
  // 市政
  if (!c.b.hosp) want.push(['hosp', B.hosp.cost]);
  if (!c.b.police) want.push(['police', B.police.cost]);
  // 兵工厂（A1.4：Lv1/2/3 按科技 5/15/25 逐级补；升级不占地）
  const arsenalNeed = fac.tech > 25 ? 3 : fac.tech > 15 ? 2 : fac.tech > 5 ? 1 : 0;
  if (c.b.arsenal < arsenalNeed) want.push(['arsenal', B.arsenal.cost * (c.b.arsenal + 1)]);
  // 机场（科技 10 后每城 1 座）与防空（战时补到 2）
  if (fac.tech > 10 && c.b.airport < 1) want.push(['airport', B.airport.cost]);
  if (fac.atWar && c.b.aaGun < 2) want.push(['aaGun', B.aaGun.cost]);
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
  // A1.2 制衡层（外交AI决策规范 §十五；院长 2026-11-13 十裁）
  coalitionRepHard: 20, coalitionAggression: 4, coalitionCooldown: 60,
  coalitionAbstainU: 0.25, coalitionMinMembers: 2, coalitionJoinRelDrop: 20, coalitionFailCd: 3,
  aggressionWindow: 30, aggressionDecay: 4 / 30, // 滚动 30 回合衰减
  sanctionRep: 20, sanctionVoteR: 40, sanctionAbstainR: 60, sanctionTerm: 12, sanctionCooldown: 10, sanctionAllyCut: 15,
  leadCheckEvery: 20, leadStart: 80, leadCooldown: 40, leadTechDiff: 8, leadRatio: 1.5,
  napMinRelation: -10, napStart: 40, napTerm: 12, napMax: 2,
  surrenderRepMin: 30,
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
  return { rel, repos: 0, rep: Object.fromEntries(ids.map((x) => [x, 50])), treaties: [], cooldown, memory: [], contracts: [], war: null,
    sanctions: [], coalitionCd: {}, sanctionCd: 0, napCd: {},
    aggression: Object.fromEntries(ids.map((x) => [x, 0])), // A1.2 侵略记录（滚动 30 回合）
    lastSanction: {} }; // A1.2 同类制裁冷却：key=`${target}:${type}`
}

// A1.2 制裁效果查询（economic 对科技/商业、culture 对文化、disarm 对服役/军饷）
function sanctionActive(diplo, id, type, t) {
  return diplo.sanctions.some((s) => s.type === type && s.target === id && s.expire > t);
}

// 条约查询（A1.1 起 nap 与 peace 共用禁战语义）
function hasTreaty(diplo, type, x, y, t) {
  return diplo.treaties.some((tr) => tr.type === type && !tr.dead && tr.expire > t
    && ((tr.a === x && tr.b === y) || (tr.a === y && tr.b === x)));
}
// 对 x 生效的合法战争 CB（制裁）
function sanctionCb(diplo, attacker, target, t) {
  return diplo.sanctions.some((s) => s.type === 'cb' && s.target === target && s.expire > t && (s.support || []).includes(attacker));
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

function signPeace(t, facs, diplo, x, y) {
  if (!facs[x] || !facs[y] || x === y) return;
  diplo.treaties.push({ type: 'peace', a: x, b: y, expire: t + D.peaceTerm });
  diplo.rel[x][y] = clamp(diplo.rel[x][y] + 5, -100, 100);
  diplo.rel[y][x] = clamp(diplo.rel[y][x] + 5, -100, 100);
  diplo.cooldown[x].peace = t + D.peaceCooldown;
}

// A1.4 战损（按比例减兵种，从步兵起）
function applyLoss(f, ratio) {
  if (!f || ratio <= 0) return;
  let cut = Math.floor(totalUnits(f) * ratio);
  for (const k of ['inf', 'assault', 'special', 'mobile', 'heavy', 'heli', 'tank']) {
    const d = Math.min(cut, f.units[k]); f.units[k] -= d; cut -= d;
    if (cut <= 0) break;
  }
}

// A1.2 §15.1 包围网：侵略者触发红线 → 其余国家按人格掷骰决定是否联合围殴（不背刺条约对象）
function coalitionCheck(t, facs, diplo, dipPower, ids, rand, log) {
  if (t < P.warStart) return;
  for (const X of ids) {
    if (!facs[X] || facs[X].cities.length === 0) continue;
    const others = ids.filter((x) => x !== X && facs[x] && facs[x].cities.length > 0);
    if (others.length < 2) continue;
    const maxOther = Math.max(...others.map((x) => dipPower[x] || 0));
    const threat = (dipPower[X] || 0) / Math.max(1, maxOther);
    const rep = diplo.rep[X];
    const aggr = diplo.aggression[X] || 0;
    // 院长第 10 条：只有"先行侵略"（或 rep<20）触发军事包围；领先走经济/裁军制裁（15.4）
    const triggered = aggr >= D.coalitionAggression || rep < D.coalitionRepHard;
    if (!triggered) continue;
    if ((diplo.coalitionCd[X] || 0) > t) continue;
    // 参与判定（逐国二选一 softmax：围殴 vs 旁观）；X 的同盟/互不侵犯对象不参与（院长第 4 条不背刺）
    const joiners = [];
    for (const Y of others) {
      const L = D.leaders[Y];
      if (!L) continue;
      if (hasTreaty(diplo, 'ally', Y, X, t) || hasTreaty(diplo, 'nap', Y, X, t)) continue;
      const R = diplo.rel[Y][X];
      const U = 0.45 * clamp((threat - 1.2) / 0.8, 0, 1)
        + 0.20 * (1 - clamp(R / 100, -1, 1)) / 2
        + 0.20 * (1 - L.loyalty)
        + 0.30 * (aggr >= D.coalitionAggression ? 1 : 0.5)
        - 0.25 * L.caution * clamp((dipPower[X] || 0) / Math.max(1, dipPower[Y] || 0) - 1, 0, 1);
      const pick = softmaxPick([{ type: 'join', U }, { type: 'stay', U: D.coalitionAbstainU }], L.temperature, rand);
      if (pick.type === 'join') joiners.push(Y);
    }
    if (!joiners.length) continue;
    if (joiners.length < D.coalitionMinMembers) {
      for (const Y of joiners) diplo.rel[Y][X] = clamp(diplo.rel[Y][X] - D.coalitionJoinRelDrop, -100, 100);
      diplo.coalitionCd[X] = t + D.coalitionFailCd;
      log.push({ t, event: `包围网未成军：${joiners.join('/')} 对 ${X} 关系 −${D.coalitionJoinRelDrop}（aggr ${aggr.toFixed(1)} rep ${rep.toFixed(0)}）` });
      continue;
    }
    // 国际干预：打断目标正在进行的战争；受害国与仇视 X 的弱势国纳入反法西斯同盟（防灭国/防劝降）
    const victims = new Set();
    if (diplo.war && (diplo.war.b === X || (diplo.war.sideB || []).includes(X))) {
      const w = diplo.war;
      victims.add(w.b);
      signPeace(t, facs, diplo, w.a, w.b);
      log.push({ t, event: `${w.a} 与 ${w.b} 停战（国际干预：${joiners.join('/')} 包围 ${X}）` });
      diplo.war = null;
    }
    for (const Y of ids) {
      if (Y === X || joiners.includes(Y) || !facs[Y] || facs[Y].cities.length === 0) continue;
      if (hasTreaty(diplo, 'ally', Y, X, t) || hasTreaty(diplo, 'nap', Y, X, t)) continue; // 不背刺条约对象
      if (diplo.rel[Y][X] < -50) victims.add(Y); // 被 X 打残/深度仇视的弱势国
    }
    const leader = joiners.slice().sort((a, b) => (dipPower[b] || 0) - (dipPower[a] || 0))[0];
    diplo.war = { a: leader, b: X, start: t, sideA: joiners, sideB: [X], coalition: true };
    diplo.coalitionCd[X] = t + D.coalitionCooldown;
    for (const Y of joiners) diplo.rel[Y][X] = clamp(diplo.rel[Y][X] - 40, -100, 100);
    log.push({ t, event: `包围网成型：${joiners.join('+')} 联合宣战 ${X}（aggr ${aggr.toFixed(1)} threat ${threat.toFixed(2)} rep ${rep.toFixed(0)}）` });
    // 联军成员互相结盟（反法西斯同盟）：阻止"无盟友保护"劝降与各个击破
    for (let i = 0; i < joiners.length; i++) for (let j = i + 1; j < joiners.length; j++) {
      const Y = joiners[i], Z = joiners[j];
      if (hasTreaty(diplo, 'ally', Y, Z, t)) continue;
      diplo.treaties.push({ type: 'ally', a: Y, b: Z, expire: t + D.allyTerm });
      diplo.rel[Y][Z] = clamp(diplo.rel[Y][Z] + 20, -100, 100);
      diplo.rel[Z][Y] = clamp(diplo.rel[Z][Y] + 20, -100, 100);
    }
    if (joiners.length >= 2) log.push({ t, event: `${joiners.join('/')} 结成反法西斯同盟（互相防御 ${D.allyTerm} 回合）` });
    for (const V of victims) {
      if (!facs[V] || facs[V].cities.length === 0) continue;
      for (const Y of joiners) {
        if (Y === V) continue;
        if (!hasTreaty(diplo, 'ally', Y, V, t)) diplo.treaties.push({ type: 'ally', a: Y, b: V, expire: t + D.allyTerm });
        diplo.rel[Y][V] = clamp(diplo.rel[Y][V] + 30, -100, 100);
        diplo.rel[V][Y] = clamp(diplo.rel[V][Y] + 30, -100, 100);
      }
      log.push({ t, event: `${joiners.filter((y) => y !== V).join('/')} 与 ${V} 结成反法西斯同盟（保护 ${D.allyTerm} 回合，阻断劝降）` });
    }
    return; // 一次只成一场
  }
}

// A1.2 §15.2/15.4 制裁会议：事由（领先/rep<20/侵略）→ 三选项投票 → 半数通过（院长 11-13 第 6/10 条）
function councilCheck(t, facs, diplo, dipPower, ids, rand, log) {
  if (t < P.warStart) return;
  diplo.sanctions = diplo.sanctions.filter((s) => s.expire > t);
  const alive = ids.filter((x) => facs[x] && facs[x].cities.length > 0);
  if (alive.length < 3) return;
  const cultureOf = (x) => facs[x].cities.reduce((a, c) => a + c.pub * 40 + c.tour * 20 + Object.values(c.ent).reduce((s, v) => s + v * 8, 0), 0);
  // ---- 收集事由 ----
  const cases = [];
  // ① 领先制裁（每 20 回合检查一次，t≥80；院长第 10 条：科技/文化/军事遥遥领先）
  if (t >= D.leadStart && (t - D.leadStart) % D.leadCheckEvery === 0) {
    const rank = (val) => alive.slice().sort((a, b) => val(b) - val(a));
    const techRank = rank((x) => facs[x].tech);
    if (techRank.length >= 2 && facs[techRank[0]].tech >= facs[techRank[1]].tech + D.leadTechDiff)
      cases.push({ target: techRank[0], type: 'econ', label: '科技领先→经济制裁' });
    const culRank = rank(cultureOf);
    if (culRank.length >= 2 && cultureOf(culRank[0]) >= cultureOf(culRank[1]) * D.leadRatio && cultureOf(culRank[1]) > 0)
      cases.push({ target: culRank[0], type: 'econ', label: '文化领先→经济制裁' });
    const milRank = rank((x) => dipPower[x] || 0);
    if (milRank.length >= 2 && (dipPower[milRank[0]] || 0) >= (dipPower[milRank[1]] || 0) * D.leadRatio)
      cases.push({ target: milRank[0], type: 'disarm', label: '军事领先→裁军制裁' });
  }
  // ② rep<20 / 侵略记录 → 战争制裁
  for (const x of alive) {
    if (diplo.rep[x] < D.sanctionRep) cases.push({ target: x, type: 'cb', label: 'rep<20→战争制裁' });
    else if ((diplo.aggression[x] || 0) >= D.coalitionAggression) cases.push({ target: x, type: 'cb', label: '侵略记录→战争制裁' });
  }
  for (const cs of cases) {
    const key = `${cs.target}:${cs.type}`;
    if (diplo.sanctions.some((s) => s.target === cs.target && s.type === cs.type && s.expire > t)) continue;
    if ((diplo.lastSanction[key] || 0) > t) continue;
    const initiator = alive.filter((x) => x !== cs.target).sort((a, b) => (dipPower[b] || 0) - (dipPower[a] || 0))[0];
    // ---- 三选项投票：同意=参与 / 弃权=随大流 / 反对=不参与 ----
    let yes = 1, abstain = 0;
    const yesIds = [initiator], absIds = [];
    const votes = [`${initiator}:同意`];
    for (const Y of alive) {
      if (Y === cs.target || Y === initiator) continue;
      const allied = hasTreaty(diplo, 'ally', Y, cs.target, t) || hasTreaty(diplo, 'nap', Y, cs.target, t);
      const R = diplo.rel[Y][cs.target];
      if (allied && diplo.rep[cs.target] >= D.sanctionAllyCut) { abstain++; absIds.push(Y); votes.push(`${Y}:弃权(条约随大流)`); continue; }
      if (R < D.sanctionVoteR) { yes++; yesIds.push(Y); votes.push(`${Y}:同意`); }
      else if (R < D.sanctionAbstainR) { abstain++; absIds.push(Y); votes.push(`${Y}:弃权(随大流)`); }
      else votes.push(`${Y}:反对(不参与)`);
    }
    // 院长 11-13 第 3 条：弃权不算同意，同意票严格过半（5→3/4→3/3→2/2→2）
    const need = Math.floor(alive.length / 2) + 1;
    const passed = yes >= need; // 弃权/反对不计入同意
    diplo.lastSanction[key] = t + D.leadCooldown;
    if (passed) {
      // 参与范围：战争制裁=安全型全员参与（强制力）；经济/裁军=同意+弃权参与
      const support = cs.type === 'cb' ? alive.filter((x) => x !== cs.target) : yesIds.concat(absIds);
      diplo.sanctions.push({ target: cs.target, type: cs.type, label: cs.label, expire: t + D.sanctionTerm, by: initiator, support });
      log.push({ t, event: `制裁会议：${initiator} 发起「${cs.label} ${cs.target}」——${votes.join(' ')} → 通过（同意${yes}/需${need}，弃权${abstain}不计入；${cs.type === 'cb' ? '全员参与' : '同意+弃权参与'}）` });
    } else {
      log.push({ t, event: `制裁会议：${initiator} 发起「${cs.label} ${cs.target}」——${votes.join(' ')} → 否决（同意${yes}/需${need}，弃权${abstain}不计入）` });
    }
    return; // 一次会议 1 个事由
  }
}

function diploTick(t, facs, diplo, fpower, ids, rand, log) {
  ids = ids.filter((x) => facs[x].cities.length > 0);
  // 战争状态：交战成员 + 守方盟友（防御性参战，动员潜力直接计入守方）
  for (const f of Object.values(facs)) {
    if (!diplo.war) { f.atWar = false; continue; }
    const wA = diplo.war.sideA || [diplo.war.a], wB = diplo.war.sideB || [diplo.war.b];
    let at = wA.includes(f.id) || wB.includes(f.id);
    if (!at) for (const x of wB) if (hasTreaty(diplo, 'ally', f.id, x, t)) { at = true; break; }
    f.atWar = at;
  }
  // 外交决策用"动员潜力"（人口×10%）而非当前士兵——避免战争动员 10% vs 和平 0.5% 的 20 倍误判
  const dipPower = {};
  for (const x of ids) dipPower[x] = facs[x].cities.reduce((a, c) => a + c.P, 0) * 0.10;

  // ---- 战争结算（A1.1：支持多国联军 sideA/sideB；开战后 warMinTurns 判定一次）----
  if (diplo.war) {
    const { a, b, start } = diplo.war;
    const sideA = diplo.war.sideA || [a], sideB = diplo.war.sideB || [b];
    // A1.4 轰炸阶段（开战后第 1 回合、之后每 3 回合；战争 2 回合即可触发一次）
    if (t - start >= 1 && (t - start - 1) % B.bomber.cd === 0) {
      const Bf = facs[b];
      const A = facs[sideA[0]];
      if (A && A.bombers > 0) {
        let alive = A.bombers;
        const aa = Bf.cities.reduce((s, c) => s + (c.b.aaGun || 0), 0);
        if (aa > 0) {
          let shot = 0;
          for (let i = 0; i < A.bombers; i++) if (rand() < 0.75) shot++;
          alive -= shot; A.bombers -= shot;
          log.push({ t, event: `${A.id} 轰炸 ${b}：防空击落 ${shot}/${shot + alive} 架（防空×${aa}）` });
        }
        if (alive > 0 && A.treasury >= B.bomber.ammoWealth && A.resources.oil >= B.bomber.ammoOil) {
          A.treasury -= B.bomber.ammoWealth; A.resources.oil -= B.bomber.ammoOil;
          // 每架摧毁 1 座建筑（直接摧毁；建筑内驻军同吃伤害）
          const city = Bf.cities.reduce((x, c) => (!x || c.P > x.P ? c : x), null);
          let destroyed = 0;
          for (let i = 0; i < alive && city; i++) {
            const keys = Object.keys(city.b).filter((k) => city.b[k] > 0);
            if (!keys.length) break;
            const k = keys[Math.floor(rand() * keys.length)];
            city.b[k] -= 1; destroyed++;
          }
          // 驻军杀伤（攻防数值：q_对地 22×0.5=11/架 vs 守军 S_def）
          const killRatio = clamp((alive * B.bomber.qGroundTroops) / Math.max(1, totalUnits(Bf)), 0, 0.5);
          applyLoss(Bf, killRatio);
          log.push({ t, event: `${A.id} 轰炸 ${b}：${alive} 架投弹，摧毁 ${destroyed} 座建筑、驻军损 ${(killRatio * 100).toFixed(0)}%` });
        }
        // 无人机（消耗品，一次全派）
        if (A.drones > 0) {
          const n = A.drones;
          const killRatio = clamp((n * B.drone.qGround) / Math.max(1, totalUnits(Bf)), 0, 0.3);
          applyLoss(Bf, killRatio); A.drones = 0;
          log.push({ t, event: `${A.id} 无人机 ${n} 架打击 ${b}：驻军损 ${(killRatio * 100).toFixed(0)}%` });
        }
      }
    }
    if (t - start >= D.warMinTurns) {
      const Bf = facs[b];
      // 同盟参战（防御性，A1.1）：盟友按动员潜力（人口×10%）直接计入守方战力
      const alliesOfB = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && sideB.some((y) => x.a === y || x.b === y))
        .map((x) => (sideB.includes(x.a) ? x.b : x.a))
        .filter((x) => !sideB.includes(x) && facs[x] && facs[x].cities.length > 0);
      const brA = dominantBranch(facs[b]);
      const brB = dominantBranch(facs[sideA[0]]);
      const atk = sideA.reduce((s, x) => s + compositionPower(facs[x], brA), 0);
      const def = sideB.reduce((s, x) => s + compositionPower(facs[x], brB), 0)
        + alliesOfB.reduce((s, x) => s + (dipPower[x] || 0), 0);
      const pr = atk / Math.max(1, def);
      // 院长 11-13 第 3 条：不要求绝对和平、被灭国可接受 → 取消 A1.1 最后一城死守，统一 pr>1.3
      if (pr > 1.3) {
        const target = Bf.cities.reduce((x, c) => (!x || c.P < x.P ? c : x), null); // 占最小城（不一次打崩）
        if (target) {
          Bf.cities = Bf.cities.filter((c) => c !== target);
          target.fac = a; target.P *= 0.8; facs[a].cities.push(target);
          diplo.rep[a] = clamp(diplo.rep[a] - 5, 0, 100);
          diplo.aggression[a] = (diplo.aggression[a] || 0) + 2; // A1.2 侵略记录
          diplo.rel[b][a] = clamp(diplo.rel[b][a] - 40, -100, 100);
          for (const x of ids) if (!sideA.includes(x) && x !== b) diplo.rel[x][a] = clamp(diplo.rel[x][a] - 10, -100, 100);
          log.push({ t, event: `${sideA.join('+')} 攻 ${b}：占领 ${target.name}（战力比 ${pr.toFixed(2)}）` });
          if (Bf.cities.length === 0) log.push({ t, event: `${b} 被 ${sideA.join('+')} 灭国` });
        }
      } else {
        for (const x of sideA) signPeace(t, facs, diplo, x, b);
        log.push({ t, event: `${sideA.join('+')} 与 ${b} 停战（战力比 ${pr.toFixed(2)}）` });
      }
      // A1.4 战争消耗（代理值，L3 成型后按真实战损替换）：攻 8%（胜）/12%（未果）、守 15%
      applyLoss(facs[sideA[0]], pr > 1.3 ? 0.08 : 0.12);
      applyLoss(Bf, 0.15);
      diplo.war = null;
      diplo.cooldown[a].peace = t + D.peaceCooldown;
    }
  }

  // ---- A1.1 包围网（自动事件，不占行动槽；可打断进行中的战争）----
  coalitionCheck(t, facs, diplo, dipPower, ids, rand, log);
  if (diplo.war) return; // 处于战争（含刚成型的包围网）：本轮不做常规外交行动

  // ---- A1.2 制裁会议（领先/rep/侵略；三选项投票）----
  councilCheck(t, facs, diplo, dipPower, ids, rand, log);

  // ---- A1.2 侵略记录滚动衰减（30 回合清空）----
  for (const x of ids) diplo.aggression[x] = Math.max(0, (diplo.aggression[x] || 0) - D.aggressionDecay);

  // ---- 同盟到期：（院长第 4 条：条约期内不背刺，但到期可不续）关系≥0 且双方声誉≥30 才续约 ----
  for (const tr of diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire <= t)) {
    const alive = facs[tr.a] && facs[tr.a].cities.length > 0 && facs[tr.b] && facs[tr.b].cities.length > 0;
    if (alive && diplo.rel[tr.a][tr.b] >= 0 && Math.min(diplo.rep[tr.a], diplo.rep[tr.b]) >= 30) tr.expire = t + D.allyTerm;
    else tr.dead = true; // 到期不续（静默；避免刷屏）
  }

  // ---- A1.2 互不侵犯（NAP）到期：关系≥30 静默续约（安全感），否则失效 ----
  for (const tr of diplo.treaties.filter((x) => x.type === 'nap' && !x.dead && x.expire <= t)) {
    const alive = facs[tr.a] && facs[tr.a].cities.length > 0 && facs[tr.b] && facs[tr.b].cities.length > 0;
    if (alive && diplo.rel[tr.a][tr.b] >= 30) tr.expire = t + D.napTerm;
    else tr.dead = true;
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
    const maxDipOther = Math.max(...ids.filter((x) => x !== a).map((x) => dipPower[x] || 0));
    const commonThreat = clamp(maxDipOther / Math.max(1, dipPower[a] || 0) - 1, 0, 1);
    for (const b of ids) {
      if (b === a) continue;
      const R = diplo.rel[a][b];
      const ally = hasTreaty(diplo, 'ally', a, b, t);
      const peace = hasTreaty(diplo, 'peace', a, b, t);
      const nap = hasTreaty(diplo, 'nap', a, b, t);
      const cb = sanctionCb(diplo, a, b, t); // A1.2：参与制裁国对目标有合法战争 CB
      const pr = (dipPower[a] || 0) / Math.max(1, dipPower[b] || 0);
      const adj = (ADJ[a] || []).includes(b);
      // 宣战 U（A1 §6.1；A1.1：制裁 CB 门槛 0.8、U+0.3、无声誉代价）
      if (!ally && !peace && !nap && t >= P.warStart && t >= (diplo.cooldown[a].war || 0)) {
        const repFactor = diplo.rep[b] < 30 ? 0.80 : 1; // 声誉低 → 更容易被宣战（A1 §九）
        if (pr < (cb ? 0.80 : (adj ? 1.30 : 1.60) * repFactor)) continue;
        const feasibility = clamp(pr * 0.8, 0, 1.5) / 1.5;
        const threat = clamp((dipPower[b] / Math.max(1, dipPower[a])) * 0.4, 0, 1);
        const intervene = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b)).length * 0.35;
        let U = 0.30 * 0.6 + 0.15 * 0.5 + 0.25 * feasibility + 0.20 * threat
          - 0.30 * (1 - Math.min(pr, 1.5) / 1.5) * L.caution
          - 0.25 * intervene * L.caution - (cb ? 0 : 0.15 * 0.5)
          + 0.20 * L.aggression + (adj ? 0.10 : -0.15);
        if (cb) U += 0.30;
        // 胜利路径修正（A1 §五）
        const milPath = prog.military * L.aggression;
        const culPath = prog.culture * L.culture;
        U *= milPath >= culPath ? 1.10 : 0.90;
        cands.push({ type: 'war', b, U, pr, label: `宣战${b}` });
      }
      // 结盟 U（A1 §6.2；军事同盟可多成员，边际效用递减；相性高可在低关系下结盟）
      const allyCount = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === a || x.b === a)).length;
      // A1.2：不与低声誉侵略者（rep<30）新签同盟——安全感；已有同盟到期也不续；失败冷却 5 回合防刷屏
      const allyOpen = diplo.rep[b] >= 30 && (R >= D.allyMinRelation || ((L.affinity[b] || 0) >= 0.70 && R >= -20) || (L.seekProtection && L.seekProtection.target === b))
        && t >= ((diplo.allyCd && diplo.allyCd[a + b]) || 0);
      if (!ally && !peace && !cb && allyOpen) {
        const seek = L.seekProtection && L.seekProtection.target === b ? L.seekProtection.weight * 0.25 : 0;
        let U = 0.35 * 0.5 + 0.30 * (L.affinity[b] || 0.3) + 0.20 * (1 - Math.min(pr, 1)) - 0.25 * 0.3 * L.caution + seek
          - 0.15 * (diplo.rep[b] < 30 ? 1 : 0) - 0.10 * Math.min((diplo.aggression[b] || 0) / 4, 1); // 与侵略者结盟要慎重
        U /= (1 + allyCount); // 已有盟友越多，再结盟的边际效用越低
        cands.push({ type: 'ally', b, U, label: `结盟${b}` });
      }
      // 劝降 U（A1 §6.4；2026-11-12 修：目标仅剩 1 城、战力比≥2.5、有盟友保护则不可行、失败冷却）
      const hasAllyProtect = diplo.treaties.some((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b));
      // 院长 11-13 第 2 条：劝降方声誉门槛 rep≥30（低声誉侵略者不能"不战而屈人之兵"）
      if (!ally && !hasAllyProtect && pr >= 2.5 && adj && diplo.rep[a] >= D.surrenderRepMin && t >= P.warStart && facs[b].cities.length <= 1 && t >= (diplo.annexCd && diplo.annexCd[a + b] || 0)) {
        const U = 0.45 * Math.min(pr / 3, 1) + 0.25 * 0.5 + 0.15 * (R / 100) + 0.15 * L.greed;
        cands.push({ type: 'annex', b, U, pr, label: `劝降${b}` });
      }
      // A1.2 §15.3 互不侵犯（NAP）：仅非邻接（远洋）对象——全对象开放会锁死大陆战场（实测）
      const napCount = diplo.treaties.filter((x) => x.type === 'nap' && !x.dead && x.expire > t && (x.a === a || x.b === a)).length;
      if (!adj && !ally && !peace && !nap && t >= D.napStart && R >= D.napMinRelation && napCount < D.napMax && t >= (diplo.napCd[a + b] || 0)) {
        let Un = 0.25 * commonThreat + 0.20 * (L.affinity[b] || 0.3) + 0.20 * (1 - Math.min(pr, 1))
          + 0.15 * (adj ? 0 : 1) - 0.20 * L.caution * 0.3;
        Un /= (1 + napCount * 0.5);
        cands.push({ type: 'nap', b, U: Un, label: `互不侵犯${b}` });
      }
    }
    cands.push({ type: 'none', U: 0.15, label: '观望' });
    const pick = softmaxPick(cands, L.temperature, rand);
    if (pick.type === 'none') continue;
    actions++;
    const b = pick.b;
    if (pick.type === 'war') {
      const cb = sanctionCb(diplo, a, b, t);
      diplo.war = { a, b, start: t, sideA: [a], sideB: [b] };
      diplo.cooldown[a].war = t + D.warCooldown;
      if (!cb) {
        diplo.rep[a] = clamp(diplo.rep[a] - 5, 0, 100);
        diplo.aggression[a] = (diplo.aggression[a] || 0) + 2; // A1.2 侵略记录
        for (const x of ids) if (x !== a && x !== b) diplo.rel[x][a] = clamp(diplo.rel[x][a] - 10, -100, 100);
      }
      log.push({ t, event: `${a} 宣战 ${b}（U=${pick.U.toFixed(2)} 军力比 ${(pick.pr || 0).toFixed(2)}${cb ? ' 制裁CB' : ''}）` });
    } else if (pick.type === 'ally') {
      // A1.2 接受判定（A1 §8.1）：对方不与低声誉侵略者（rep<30）/关系为负者结盟
      if (diplo.rep[a] < 30 || diplo.rel[b][a] < 0) {
        diplo.allyCd = diplo.allyCd || {};
        diplo.allyCd[a + b] = t + 5;
        log.push({ t, event: `${a} 提议与 ${b} 结盟被拒（对方 rep ${diplo.rep[a].toFixed(0)} R ${diplo.rel[b][a].toFixed(0)}）` });
        continue;
      }
      diplo.treaties.push({ type: 'ally', a, b, expire: t + D.allyTerm });
      diplo.rel[a][b] = clamp(diplo.rel[a][b] + 10, -100, 100);
      diplo.rel[b][a] = clamp(diplo.rel[b][a] + 10, -100, 100);
      diplo.rep[a] = clamp(diplo.rep[a] + 2, 0, 100);
      log.push({ t, event: `${a} 与 ${b} 结盟（${D.allyTerm} 回合，U=${pick.U.toFixed(2)}）` });
    } else if (pick.type === 'nap') {
      if (diplo.rep[a] < 30 || diplo.rel[b][a] < 0) {
        diplo.napCd[a + b] = t + 5;
        log.push({ t, event: `${a} 提议与 ${b} 互不侵犯被拒（对方 rep ${diplo.rep[a].toFixed(0)} R ${diplo.rel[b][a].toFixed(0)}）` });
        continue;
      }
      diplo.treaties.push({ type: 'nap', a, b, expire: t + D.napTerm });
      diplo.rel[a][b] = clamp(diplo.rel[a][b] + 5, -100, 100);
      diplo.rel[b][a] = clamp(diplo.rel[b][a] + 5, -100, 100);
      log.push({ t, event: `${a} 与 ${b} 签订互不侵犯（${D.napTerm} 回合，U=${pick.U.toFixed(2)}）` });
    } else if (pick.type === 'annex') {
      // 目标接受判定（A1 §8.1：关系/声誉/战力综合；弱势+低声誉的劝降方易被拒）
      // A1.2：劝降方声誉越高越容易被接受（院长第 2 条）
      const accept = clamp(0.15 + (pick.pr - 2.5) * 0.25 + (diplo.rep[a] - 50) * 0.003, 0.05, 0.90);
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
      diplo.aggression[a] = (diplo.aggression[a] || 0) + 3; // A1.2 劝降计入侵略记录
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
  let winner = null; // 科技胜利者（A1.3 收束）
  const facs = makeFactions(cities);
  for (const c of cities) {
    if (c.fac === 'NONE') { c.b.farm = 1; continue; }
    c.b.farm = c.fac === 'CN' ? 2 : 1; c.b.residence = 1; c.b.office = 1; c.b.street = 1; c.b.hosp = 1;
    c.b.academy = 1; // A1.2 科技拉力：开局每城一座学校（三级学院=人才主来源）
    if (c.P >= 300000) { c.b.mall = 1; c.b.plant = 1; }
    c.ent.park = 1; c.ent.movie = 1;
    // B1 v1.2 初始兵工厂：深圳(CN)/长崎(JP)/首尔(KR)/悉尼(AU)
    if (['深圳', '长崎', '首尔', '悉尼'].includes(c.name)) { c.b.arsenal = 1; c.b.airport = 1; } // A1.4 初始机场
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
      // A1.2 发展模式（院长第 7/8 条）：军事优先；JP 遇强邻（潜力≥我×1.1）转科技；AU 按 tech/economy 倾向
      const leaderP = D.leaders[f.id];
      let devMode = leaderP ? leaderP.governance : 'culture';
      if (devMode === 'military') {
        const myPot = f.cities.reduce((a, c) => a + c.P, 0) * 0.1;
        const maxAdj = Math.max(0, ...(ADJ[f.id] || []).map((x) => (facs[x] ? facs[x].cities.reduce((a, c) => a + c.P, 0) * 0.1 : 0)));
        if (maxAdj >= myPot * 1.1) devMode = 'tech';
      } else if (devMode === 'commerce' && leaderP && leaderP.tech >= 0.85) devMode = 'tech';
      // 制裁效果（A1.2）：经济制裁 → 商业收入/科技增速 ×0.7；裁军 → 服役上限 ×0.5、军饷 ×1.2
      const econHit = sanctionActive(diplo, f.id, 'econ', t);
      const disarmHit = sanctionActive(diplo, f.id, 'disarm', t);
      let taxSum = 0, incomeSum = 0, upkeepSum = 0;
      let stats = [];
      for (const c of f.cities) {
        const s = cityStats(c, facs, F, desire, 1);
        stats.push(s);
        taxSum += s.tax; incomeSum += s.income; upkeepSum += s.upkeep;
        let gg = s.g;
        if (f.policy === 'subsidy') gg *= P.policy.subsidyMult;
        if (f.policy === 'limit') gg *= P.policy.limitMult;
        c.P = Math.max(1000, c.P + c.P * clamp(gg, -P.growthCap, P.growthCap));
        c.builtThisTurn = 0;
        aiBuild(c, s, F, f, devMode);
      }
      if (econHit) incomeSum *= 0.7;
      // ==== 资源收入（国家级简化；库存上限 5 回合）====
      const inc = P.resources[f.id] || { iron: 0, coal: 0, oil: 0 };
      for (const k of ['iron', 'coal', 'oil'])
        f.resources[k] = Math.min(f.resources[k] + inc[k], inc[k] * P.resourceCapTurns);
      // ==== 外交采购（A1.4 P0 出口）：国库 >50 万时按缺口买入（和平期消化国库）====
      if (f.treasury > 500000) {
        for (const k of ['iron', 'coal', 'oil']) {
          const cap = inc[k] * P.resourceCapTurns;
          if (f.resources[k] < cap * 0.5) {
            const buy = Math.min((cap * 0.5 - f.resources[k]), (f.treasury - 500000) * 0.2 / P.buyPrice[k]);
            if (buy > 0) { f.resources[k] += buy; f.treasury -= buy * P.buyPrice[k]; }
          }
        }
      }
      // ==== 征募（普通步兵）====
      const popTotal = f.cities.reduce((a, c) => a + c.P, 0);
      const target = Math.min(popTotal * (f.atWar ? (stress ? stressService : P.warService) : P.peaceService) * (disarmHit ? 0.5 : 1), 2000000);
      let total = totalUnits(f);
      // A1.4 征募费（P0 出口，自定 1 财/兵；v22 兵员 ×8 与国库口径折中）
      if (target > total) {
        const add = target - total;
        const fee = add * P.recruitFee;
        const afford = Math.max(0, Math.min(add, Math.floor(Math.max(0, f.treasury) / P.recruitFee)));
        f.treasury -= afford * P.recruitFee;
        f.units.inf += afford;
        if (afford < add) log.push({ t, event: `${f.id} 征募受限：国库不足（需 ${Math.round(fee)}，仅征 ${afford}/${add}）` });
      }
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
      // ==== 空军生产（A1.4：机场独立队列；轰炸机 2 回/架、无人机 1 回/架）====
      const airBase = f.cities.filter((c) => c.b.airport > 0).length;
      const bomberCap = airBase * 8; // Lv1 机场驻机 8（简化）
      if (f.bombers < bomberCap && f.treasury > 100000) { // 富裕后才产空军（避免小国破产）
        if (!f.airQueue) {
          if (f.treasury >= B.bomber.wealth && f.resources.iron >= B.bomber.iron && f.resources.oil >= B.bomber.oil) {
            f.treasury -= B.bomber.wealth; f.resources.iron -= B.bomber.iron; f.resources.oil -= B.bomber.oil;
            f.airQueue = 'bomber'; f.airProgress = 0;
          }
        } else {
          f.airProgress += 1;
          if (f.airProgress >= B.bomber.turns) { f.bombers += 1; f.airQueue = null; f.airProgress = 0; }
        }
      }
      const droneCap = f.cities.length * B.drone.maxPerCity; // 每城上限 10
      if (f.drones < droneCap && f.treasury > 50000 && f.treasury >= B.drone.wealth && f.resources.oil >= B.drone.oil) {
        f.drones += 1; f.treasury -= B.drone.wealth; f.resources.oil -= B.drone.oil;
      }
      f.soldiers = totalUnits(f);
      const salary = f.soldiers * P.soldierSalary * (disarmHit ? 1.2 : 1); // 裁军制裁：军饷 +20%
      // 俸禄（回归公式 32×8=256/将/回；每城 2 将）
      const salaryOfficers = f.cities.length * P.generalsPerCity * P.salaryPerGeneral;
      // 人口政策成本（补贴：1 财/千人/回）
      const policyCost = f.policy === 'subsidy' ? f.cities.reduce((a, c) => a + c.P, 0) / 1000 * P.policy.subsidyCostPer1000 : 0;
      f.treasury += taxSum + incomeSum - upkeepSum - salary - salaryOfficers - policyCost;
      // 学院链科技产出（Lv1/2/3 = 10/16/24）；经济制裁 → 科技增速 ×0.7
      f.tech = Math.min(40, f.tech + f.cities.reduce((a, c) => a + (B.academy.tech[c.b.academy] || 0), 0) / 800 * (econHit ? 0.7 : 1));
      // 科技胜利收束（院长 11-13）：科技 40/40 后启动终极工程，60 回合建成者胜
      if (f.tech >= 40) {
        f.project = (f.project || 0) + 1;
        if (f.project >= P.projectTurns && !winner) {
          winner = f.id;
          log.push({ t, event: `${f.id} 率先建成终极工程——科技胜利（t${t}）` });
        }
      }
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
  return { log, cities, facs, diplo, winner };
}

const turns = Number(process.argv[2] || 200);
const seed = Number(process.argv[3] || 1);
const stress = process.argv[4] === 'stress';
const stressService = Number(process.argv[5] || P.stressService);
const { log, cities, facs, diplo, winner } = run(turns, seed, stress, stressService);
console.log(`\n===== v22 FULL 盘 seed=${seed} turns=${turns}${stress ? ` 模式=战时压力(${(stressService * 100).toFixed(1)}%)` : ''} =====`);
console.log('\n[阵营] t | 人口 | 兵 | 国库 | 粮安F | 科技 | 宜居 | 欲望 | 政策 | 油 | 兵工厂');
for (const r of log) {
  if (!r.fac) { console.log('EVENT', r.t, r.event); continue; }
  console.log(`${r.fac.padEnd(3)} t${String(r.t).padStart(3)} | ${fmt(r.pop).padStart(9)} | ${fmt(r.soldiers).padStart(8)} | ${fmt(r.treasury).padStart(9)} | ${String(r.F).padStart(5)} | ${String(r.tech).padStart(2)}/40 | ${String(r.L).padStart(5)} | ${String(r.desire).padStart(4)} | ${r.policy.padEnd(7)} | ${String(Math.round(r.oil)).padStart(6)} | ${r.factories}`);
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
console.log(`CN 兵=${fmt(cn ? cn.soldiers : 0)} | 存活=${survivors}/4 | 国库=${fmt(cn ? cn.treasury : 0)} | 科技=${cn ? cn.tech.toFixed(0) : 0}/40`);
console.log(`科技胜利=${winner || '无'}${winner ? `（t${log.find((r) => r.event && r.event.includes('科技胜利'))?.t || '?'}）` : ''}`);
console.log('\n[兵种构成 t200] 阵营 | 普通 | 突击 | 特种 | 坦克 | 武直 | 机动炮 | 重炮 | 轰炸机 | 无人机 | 防空 | 铁 | 煤 | 油 | 兵工厂');
for (const f of Object.values(facs)) {
  if (!f.cities.length) continue;
  const u = f.units, facN = f.cities.reduce((a, c) => a + (c.b.arsenal ? 1 : 0), 0);
  const aaN = f.cities.reduce((a, c) => a + (c.b.aaGun || 0), 0);
  console.log(`${f.id} | ${fmt(u.inf)} | ${fmt(u.assault)} | ${fmt(u.special)} | ${fmt(u.tank)} | ${fmt(u.heli)} | ${fmt(u.mobile)} | ${fmt(u.heavy)} | ${fmt(f.bombers)} | ${fmt(f.drones)} | ${aaN} | ${fmt(f.resources.iron)} | ${fmt(f.resources.coal)} | ${fmt(f.resources.oil)} | ${facN}`);
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
