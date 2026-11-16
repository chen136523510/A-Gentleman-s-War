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
  recruitFee: 8, // A1.4 征募费（财/兵；院长 2026-11-13 裁定：8 财/兵）
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
  // 文化输出（文化输出算法 v1 份额收敛式；2026-11-05 院长定稿；院长 11-13 第 4 条：文化胜利=文化入侵全球并维持）
  culture: {
    convergeR: 0.05,        // 收敛速率 r（balance 留 0.03/0.05/0.08 三档）
    resistCap: 0.5,         // 抵抗总上限 +50%（cultureResistanceCap）
    resistPub: 0.03, resistTour: 0.05, resistEnt: 0.02, // 文化建筑抵抗（博物馆 3%/会展 5%/娱乐 2% 每座级）
    gapExp: 0.5, gapCap: 2.0, // 势差乘区 clamp((Ca/Cb)^0.5, 1.0, 2.0)；门槛=攻击方有文化建筑
    invadeThreshold: 0.6, invadeRelease: 0.5, invadeHold: 5, // 完全入侵 60% 入 / 50% 出 / 持续 5 回
    victoryHold: 10,        // 文化胜利：对所有国完全入侵维持 10 回合
    contactTech: 7,        // AU 联系门槛（双方科技 ≥7 才可跨海文化输出；A1.6 由 10 下调，AU 发育慢）
    distAdj: 1.0, distSea: 0.6, // 距离系数（邻接/远洋；v0 系数表）
    peaceDecay: 0.3,        // 停战期输出 0.3（恢复期简化）
    lostSelf: 0.4, lostRelease: 0.45, // 文化失所：本国认同 <40% 且无单极 → 解除 ≥45%
    lostRecruit: 0.85, lostWar: 0.9,  // 失所效果：征兵 ×0.85 / 战争能力 ×0.9
    // A1.6 KR 文化种子：每城槽位上限 + 仅 2 城 → 种子路径靠"文化产出乘区"（文化区开题 §九 已指出）
    facMult: { CN: 1.0, JP: 1.0, KR: 2.0, AU: 1.0 },
  },
  // 环境（环境系统 §十一/§12 碳回收/§四 碳额度；R42 院长定稿）
  env: {
    emit: { factory: 8, plant: 6, coal: 2 }, // 钢铁冶炼/火电/矿业（碳/回）
    tempK: 50000,           // 温度指数 = 累计碳 / 50000 × 100（§11.3 标定）
    recycle: { park: 1, nature: [0, 3, 3, 5], ccs: 20 }, // 绿化带 −1/级；自然线 1/2/3 级=国家公园/生态保护区；CCS −20
    seaRates: [[30, 3], [60, 6], [80, 10], [101, 14]], // 温度带速率 mm/回（§11.4）
    netZeroHold: 20,        // 净负碳持续 20 回 → 海平面停涨（气候恢复）
    level1: 0.5, level2: 1.0, level3: 1.5, // 海平面三级：产出损/淹没/全局失败
    coastPenalty: 0.2,      // 一级沿海产出损 20%（文档未给数值，模拟器自定，报告标注）
    quotaRatio: 0.8,        // 配额法案：上限=签约时排放×0.8（§四）
    quotaBuyPrice: 10,      // 超排自动购买额度 10 财/碳（§四）
    quotaFine: 20,          // 无钱超排罚 20 财/回 + rep −2
    quotaTerm: 20,          // 法案任期
    unGreen: { emitMult: 0.55, recycleBonus: 12 }, // A1.6 UN 环保合作：成员国排放 ×0.55、全球回收 +12
  },
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
  ccs:       { name: '碳捕集站', cost: 12000, prod: 2400, upkeep: 0.01, jobs: 0, power: 8, max: 1 }, // 环境 §12.3：市政区，−20 碳/回（科技 20 解锁）
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
  ['北京', 'CN', 256000, 55, 5], ['上海', 'CN', 360000, 55, 6], ['深圳', 'CN', 320000, 50, 3],
  ['香港', 'CN', 224000, 35, 4], ['台北', 'CN', 200000, 50, 3], ['西安', 'CN', 160000, 55, 5],
  ['东京', 'JP', 400000, 60, 7], ['名古屋', 'JP', 208000, 55, 3], ['长崎', 'JP', 144000, 50, 3],
  ['首尔', 'KR', 304000, 55, 4], ['仁川', 'KR', 176000, 50, 2],
  ['悉尼', 'AU', 208000, 65, 5], ['墨尔本', 'AU', 176000, 70, 5],
  ['达尔文', 'NONE', 48000, 40, 1],
];
const ADJ = { CN: ['KR', 'JP'], KR: ['CN', 'JP'], JP: ['CN', 'KR'], AU: [] }; // AU 远洋：仅强者可跨海
const COASTAL = ['上海', '深圳', '香港', '台北', '东京', '名古屋', '长崎', '首尔', '仁川', '悉尼', '墨尔本', '达尔文']; // 沿海城（海平面三级受影响；北京/西安内陆）

// ================= 生成 =================
function makeCities() {
  return CITY_INIT.map(([name, fac, pop, q, cul]) => ({
    name, fac, origFac: fac, P: pop, C: pop * 1.5, q, baseCulture: cul, // 城市基础文化值（文化区数值 v1.0 压低档）；origFac=复国原属
    coastal: COASTAL.includes(name),
    b: { residence: 0, farm: 0, coal: 0, plant: 0, hydro: 0, solar: 0, factory: 0, arsenal: 0, airport: 0, aaGun: 0, street: 0, mall: 0, office: 0, academy: 0, hosp: 0, police: 0, ccs: 0 },
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
      mainPath: 'military', // A1.6 胜利路径（每 10 回合重算）
      culture: 0, identity: {}, invasionSince: {}, lostCulture: false, // 文化存量/认同度/完全入侵计时/文化失所
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
function aiBuild(c, s, F, fac, devMode, envTemp = 0) {
  if (c.builtThisTurn >= 1) return;
  const totalB = Object.values(c.b).reduce((a, b) => a + b, 0) + Object.values(c.ent).reduce((a, b) => a + b, 0) + (c.tour ? 1 : 0) + (c.pub ? 1 : 0);
  if (totalB >= 40) return;
  const prod = 64 + c.b.factory * B.factory.prodOut;
  c.prodBank += prod;
  const want = [];
  const mainPath = fac.mainPath || 'military'; // A1.6 路径（computePaths 每 10 回合重算）
  const room = (k, max) => c.b[k] < (max ?? B[k].max);
  const epRoom = (k, max) => c.ent[k] < max;
  // 生存优先：粮 → 电 → 住房
  if (F < 90 && room('farm')) want.push(['farm', B.farm.cost]);
  if (s.pr < 0.9) {
    if (envTemp > 40 && c.b.solar < B.solar.max) want.push(['solar', B.solar.cost]); // 环保：高温优先清洁能源（0 碳）
    else if (c.b.plant < B.plant.max) want.push(['plant', B.plant.cost]);
  }
  if (c.P / c.C > 0.95 && room('residence')) want.push(['residence', B.residence.cost]);
  // A1.6 文化路径：pub/tour/ent 优先拉满（不因消费满足而停；文化=主路径的建造表达）
  if (mainPath === 'culture') {
    if (c.pub < PUB.max) want.push(['pub', PUB.costs[c.pub]]);
    if (c.tour < TOUR.max) want.push(['tour', TOUR.costs[c.tour]]);
    for (const k of ['park', 'sport', 'play', 'movie', 'esport', 'nature']) {
      if (epRoom(k, ENT[k].caps.length)) { want.push([`ent:${k}`, ENT[k].costs[c.ent[k]]]); break; }
    }
  }
  // A1.2 科技拉力（院长第 9 条，所有阵营）：多建学院区建筑——三级学院是人才培养主来源
  if (fac.tech < 40 && c.b.academy < 3) {
    const acCost = c.b.academy === 0 ? B.academy.cost : B.academy.upCost[c.b.academy];
    want.push(['academy', acCost]);
  }
  // JP 军事优先（院长第 7 条）：兵工厂先行；遇强邻 devMode 已转 tech
  if (devMode === 'military' && fac.tech > 5 && c.b.arsenal < 1) want.push(['arsenal', B.arsenal.cost]);
  // 消费供给（多娱乐线，前移到岗位前——娱乐也是就业；文化路径已在上面拉满）
  if (mainPath !== 'culture' && s.ent < s.pool * P.shares.ent * 0.6) {
    for (const k of ['park', 'movie', 'sport', 'play', 'esport', 'nature']) {
      if (epRoom(k, ENT[k].caps.length)) { want.push([`ent:${k}`, ENT[k].costs[c.ent[k]]]); break; }
    }
  }
  if (mainPath !== 'culture' && s.tour < s.pool * P.shares.tour * 0.6 && c.tour < 3) want.push(['tour', TOUR.costs[c.tour]]);
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
  // 文化（非文化路径每城只保 1 座博物馆；文化路径已在上面拉满）
  if (mainPath !== 'culture' && c.pub < 1 && s.C_out < 30) want.push(['pub', PUB.costs[c.pub]]);
  // 市政
  if (!c.b.hosp) want.push(['hosp', B.hosp.cost]);
  if (!c.b.police) want.push(['police', B.police.cost]);
  // 环境治理：温度高且科技到位 → 碳捕集站（市政区，−20 碳/回）
  if (envTemp > 50 && fac.tech >= 20 && c.b.ccs < 1) want.push(['ccs', B.ccs.cost]);
  // 兵工厂（A1.4：Lv1/2/3 按科技 5/15/25 逐级补；升级不占地）；文化路径只在战时补
  const arsenalNeed = fac.tech > 25 ? 3 : fac.tech > 15 ? 2 : fac.tech > 5 ? 1 : 0;
  if ((mainPath !== 'culture' || fac.atWar) && c.b.arsenal < arsenalNeed) want.push(['arsenal', B.arsenal.cost * (c.b.arsenal + 1)]);
  // 机场（科技 10 后每城 1 座）与防空（战时补到 2）；文化路径只在战时补
  if ((mainPath !== 'culture' || fac.atWar) && fac.tech > 10 && c.b.airport < 1) want.push(['airport', B.airport.cost]);
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
  // A1.5 会议体系（院长 11-13 第 3 条；[外交会议体系](../docs/06-设计/05-外交/外交会议体系.md) §3.0/3.2）
  summitEvery: 20,       // 定期全球大会：每 20 回合
  emergencyCooldown: 10, // 紧急会议：发起国冷却 10 回合
  extinctWindow: 10,     // 灭国事由窗口 10 回合（一次性）
  meetingFailRep: 3,     // 否决：发起国 rep −3
  // A1.6 文化与同盟收口（2026-11-16 院长裁：最小复国 + UN 全票 + 联合进攻/经济制裁）
  trade: { minRel: 20, term: 24, link: 0.20, relPerTurn: 2 },      // 贸易协定/航线（贸易最小规则 v0.2：关系 +2/回）
  econAlly: { minRel: 40, term: 24, link: 0.10, max: 1 },          // 经济同盟（每类限 1 盟友）
  un: { start: 100, charterCd: 20, electionEvery: 25, voteThreshold: 0.45, leaderTrade: 1.15 },
  revive: { wait: 3, militiaRate: 0.03, rep: 30, relYes: 100, relKiller: -100, cooldown: 10 },
  culturePush: { cost: 30000, duration: 20, mult: 4.0, cooldown: 25, relDrop: 0 }, // A1.6 文化推广（周期性文化攻势）
  allianceMeeting: { cd: 5, voteThreshold: 0.50, relFail: 5 },
  pathBias: {
    CN: { military: 1.80, culture: 0.30, tech: 0.90, economy: 0.60 }, // 四大闸门 #3：CN 倾向吞并，不投资文化输出竞争
    JP: { military: 1.60, culture: 0.40, tech: 0.70, economy: 0.50 },
    KR: { military: 0.50, culture: 1.80, tech: 0.90, economy: 0.60 }, // 文化种子选手
    AU: { military: 0.60, culture: 0.50, tech: 1.50, economy: 1.00 },
  },
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
    extinct: [], meetingCd: {}, initiated: {}, // A1.5 会议：灭国事由/发起冷却/每回合 1 次
    un: null, unCd: 0, reviveCd: {}, jointCd: {}, econMeetCd: {}, tradeCd: {}, econAllyCd: {}, // A1.6 文化与同盟收口
    culturePush: {}, pushCd: {}, // A1.6 文化推广
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
  const culture = {}, pop = {}, commercial = {};
  for (const x of ids) {
    culture[x] = facs[x].cities.reduce((a, c) => a + c.pub * 40 + c.tour * 20 + Object.values(c.ent).reduce((s, v) => s + v * 8, 0), 0);
    pop[x] = facs[x].cities.reduce((a, c) => a + c.P, 0);
    commercial[x] = facs[x].cities.reduce((a, c) => a + c.b.office * B.office.income + c.b.street * B.street.cap + c.b.mall * B.mall.cap, 0);
  }
  return {
    military: 0.6 * rankNorm(id, ids, (x) => fpower[x] || 0) + 0.4 * rankNorm(id, ids, (x) => facs[x].cities.length),
    culture: rankNorm(id, ids, (x) => culture[x]),
    tech: clamp(facs[id].tech / 40, 0, 1),
    economy: 0.5 * rankNorm(id, ids, (x) => facs[x].treasury) + 0.5 * rankNorm(id, ids, (x) => commercial[x]),
  };
}

// A1.6 胜利路径选择器（外交AI规范 §五 + pathBias；每 10 回合重算）
// 经济进度用"国库+商业产出"（规范口径），不用人口——否则大国永远选经济
function computePaths(facs, allIds) {
  const ids = allIds.filter((x) => facs[x] && facs[x].cities.length > 0);
  if (!ids.length) return;
  const commercial = (x) => facs[x].cities.reduce((a, c) =>
    a + c.b.office * B.office.income + c.b.street * B.street.cap + c.b.mall * B.mall.cap, 0);
  for (const x of ids) {
    const L = D.leaders[x];
    const bias = D.pathBias[x] || { military: 1, culture: 1, tech: 1, economy: 1 };
    if (!L) continue;
    const p = {
      military: 0.6 * rankNorm(x, ids, (y) => facs[y].soldiers || 0) + 0.4 * rankNorm(x, ids, (y) => facs[y].cities.length),
      culture: rankNorm(x, ids, (y) => facs[y].culture || 0),
      tech: clamp(facs[x].tech / 40, 0, 1),
      economy: 0.5 * rankNorm(x, ids, (y) => facs[y].treasury || 0) + 0.5 * rankNorm(x, ids, commercial),
    };
    const w = {
      military: p.military * L.aggression * bias.military,
      culture: p.culture * L.culture * bias.culture,
      tech: p.tech * L.tech * bias.tech,
      economy: p.economy * L.economy * bias.economy,
    };
    facs[x].mainPath = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    facs[x].pathW = w;
  }
}

// 交战对判定（贸易/航线前置）
function atWarPair(diplo, a, b) {
  if (!diplo.war) return false;
  const sa = diplo.war.sideA || [diplo.war.a], sb = diplo.war.sideB || [diplo.war.b];
  return (sa.includes(a) && sb.includes(b)) || (sa.includes(b) && sb.includes(a));
}

// 某类条约数量（A1.6：经济同盟每类限 1 盟友）
function treatyCount(diplo, type, x, t) {
  return diplo.treaties.filter((tr) => tr.type === type && !tr.dead && tr.expire > t && (tr.a === x || tr.b === x)).length;
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
  if (diplo.un) return; // A1.6 UN 和平锁：联合国成立后不再有包围网战争
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

// A1.5 会议阶段（[外交会议体系](../docs/06-设计/05-外交/外交会议体系.md) §3.0/3.2；院长 11-13 第 3 条）
// 时序：[N 回合结算] → [会议阶段] → [N 回合行动]；结果（CB/经济/裁军）本回合行动即可用
// 定期全球大会每 20 回合（领先制裁）；全球紧急会议事由触发（rep<20/侵略≥4/灭国 10 回合内）
// 每阵营每回合最多发起 1 次；发起无成本；紧急会议发起国冷却 10 回合；否决发起国 rep −3
function meetingPhase(t, facs, diplo, dipPower, ids, rand, log, env) {
  if (t < P.warStart) return;
  diplo.sanctions = diplo.sanctions.filter((s) => s.expire > t);
  diplo.extinct = diplo.extinct || [];
  diplo.meetingCd = diplo.meetingCd || {};
  diplo.initiated = diplo.initiated || {};
  const alive = ids.filter((x) => facs[x] && facs[x].cities.length > 0);
  if (alive.length < 3) return;
  const cultureOf = (x) => facs[x].cities.reduce((a, c) => a + c.pub * 40 + c.tour * 20 + Object.values(c.ent).reduce((s, v) => s + v * 8, 0), 0);
  // ---- 议程收集（同 target+type 去重）----
  const agenda = [];
  const addCase = (o) => {
    const ex = agenda.find((x) => x.target === o.target && x.type === o.type);
    if (ex) { // 同议程去重：灭国事由升级标签（否则被 rep/侵略事由吞掉，不可观测）
      if (o.extinct && !ex.extinct) { ex.label = o.label; ex.extinct = o.extinct; }
      return;
    }
    agenda.push(o);
  };
  // ① 定期全球大会（每 20 回合）：领先制裁（科技/文化/军事遥遥领先）
  if (t >= D.leadStart && t % D.summitEvery === 0) {
    const rank = (val) => alive.slice().sort((a, b) => val(b) - val(a));
    const techRank = rank((x) => facs[x].tech);
    if (techRank.length >= 2 && facs[techRank[0]].tech >= facs[techRank[1]].tech + D.leadTechDiff)
      addCase({ target: techRank[0], type: 'econ', label: '科技领先→经济制裁', track: 'summit' });
    const culRank = rank(cultureOf);
    if (culRank.length >= 2 && cultureOf(culRank[0]) >= cultureOf(culRank[1]) * D.leadRatio && cultureOf(culRank[1]) > 0)
      addCase({ target: culRank[0], type: 'econ', label: '文化领先→经济制裁', track: 'summit' });
    const milRank = rank((x) => dipPower[x] || 0);
    if (milRank.length >= 2 && (dipPower[milRank[0]] || 0) >= (dipPower[milRank[1]] || 0) * D.leadRatio)
      addCase({ target: milRank[0], type: 'disarm', label: '军事领先→裁军制裁', track: 'summit' });
    // 环保提案（环境 §3.5/§四）：温度 ≥40 或海平面 ≥0.5；已有未过期法案不再提
    if (env && (env.temp >= 40 || env.sea >= P.env.level1) && (!diplo.carbonBill || diplo.carbonBill.expire <= t))
      addCase({ target: null, type: 'carbon', label: `碳排放配额法案（上限=排放×${P.env.quotaRatio}）`, track: 'summit' });
  }
  // ② 全球紧急会议（事由触发）：rep<20 / 侵略记录≥4 / 灭国 10 回合内
  for (const x of alive) {
    if (diplo.rep[x] < D.sanctionRep) addCase({ target: x, type: 'cb', label: 'rep<20→战争制裁', track: 'emergency' });
    else if ((diplo.aggression[x] || 0) >= D.coalitionAggression) addCase({ target: x, type: 'cb', label: '侵略记录→战争制裁', track: 'emergency' });
  }
  for (const e of diplo.extinct) {
    if (e.called) continue;
    if (t - e.t > D.extinctWindow || !facs[e.by] || facs[e.by].cities.length === 0) { e.called = true; continue; }
    addCase({ target: e.by, type: 'cb', label: `灭国(${e.fac})→战争制裁`, track: 'emergency', extinct: e });
  }
  // ---- 逐场召开：每阵营每回合最多发起 1 次（定期大会自动，不占配额）----
  for (const cs of agenda) {
    const key = `${cs.target}:${cs.type}`;
    if (diplo.sanctions.some((s) => s.target === cs.target && s.type === cs.type && s.expire > t)) continue;
    if (!cs.extinct && (diplo.lastSanction[key] || 0) > t) continue; // 灭国=一次性事由，可插队冷却
    // 发起国：非目标、按动员潜力从强到弱；紧急会议受"每回合 1 次 + 冷却 10 回合"约束
    const cands = alive.filter((x) => x !== cs.target
      && (cs.track === 'summit' || ((diplo.initiated[x] || 0) !== t && (diplo.meetingCd[x] || 0) <= t)))
      .sort((a, b) => (dipPower[b] || 0) - (dipPower[a] || 0));
    if (!cands.length) continue;
    const initiator = cands[0];
    if (cs.track === 'emergency') { diplo.initiated[initiator] = t; diplo.meetingCd[initiator] = t + D.emergencyCooldown; }
    // ---- 三选项投票：同意=参与 / 弃权=随大流 / 反对=不参与（弃权不算同意，严格过半）----
    let yes = 1, abstain = 0;
    const yesIds = [initiator], absIds = [];
    const votes = [`${initiator}:同意`];
    for (const Y of alive) {
      if (Y === cs.target || Y === initiator) continue;
      if (cs.type === 'carbon') {
        // 环保倾向（环境 §八 AI）：文化高、排放占比低 → 同意；高排放国反对
        const share = (env.facEmit[Y] || 0) / Math.max(1, env.emit);
        const u = 0.25 + 0.35 * ((D.leaders[Y] || { culture: 0.5 }).culture) - 0.6 * share;
        if (u > 0.30) { yes++; yesIds.push(Y); votes.push(`${Y}:同意`); }
        else if (u > 0.15) { abstain++; absIds.push(Y); votes.push(`${Y}:弃权`); }
        else votes.push(`${Y}:反对`);
        continue;
      }
      const allied = hasTreaty(diplo, 'ally', Y, cs.target, t) || hasTreaty(diplo, 'nap', Y, cs.target, t);
      const R = diplo.rel[Y][cs.target];
      if (allied && diplo.rep[cs.target] >= D.sanctionAllyCut) { abstain++; absIds.push(Y); votes.push(`${Y}:弃权(条约随大流)`); continue; }
      if (R < D.sanctionVoteR) { yes++; yesIds.push(Y); votes.push(`${Y}:同意`); }
      else if (R < D.sanctionAbstainR) { abstain++; absIds.push(Y); votes.push(`${Y}:弃权(随大流)`); }
      else votes.push(`${Y}:反对(不参与)`);
    }
    const need = Math.floor(alive.length / 2) + 1;
    const passed = yes >= need; // 弃权/反对不计入同意
    diplo.lastSanction[key] = t + D.leadCooldown;
    const track = cs.track === 'summit' ? '定期大会' : '紧急会议';
    if (passed) {
      if (cs.type === 'carbon') {
        // 配额法案：成员国（同意+弃权）执行；上限=签约时排放×系数；任期 20 回合
        diplo.carbonBill = { ratio: P.env.quotaRatio, expire: t + P.env.quotaTerm, members: yesIds.concat(absIds),
          base: Object.fromEntries(alive.map((x) => [x, env.facEmit[x] || 0])) };
        log.push({ t, event: `${track}：${initiator} 提案「${cs.label}」——${votes.join(' ')} → 通过（同意${yes}/需${need}；参与 ${yesIds.concat(absIds).join('/')}，任期${P.env.quotaTerm}回）` });
      } else {
        // 参与范围：战争制裁=安全型全员参与（强制力）；经济/裁军=同意+弃权参与
        const support = cs.type === 'cb' ? alive.filter((x) => x !== cs.target) : yesIds.concat(absIds);
        diplo.sanctions.push({ target: cs.target, type: cs.type, label: cs.label, expire: t + D.sanctionTerm, by: initiator, support });
        log.push({ t, event: `${track}：${initiator} 提案「${cs.label} ${cs.target}」——${votes.join(' ')} → 通过（同意${yes}/需${need}，弃权${abstain}不计入；${cs.type === 'cb' ? '全员参与' : '同意+弃权参与'}）` });
      }
    } else {
      diplo.rep[initiator] = clamp(diplo.rep[initiator] - D.meetingFailRep, 0, 100);
      log.push({ t, event: `${track}：${initiator} 提案「${cs.label} ${cs.target}」——${votes.join(' ')} → 否决（同意${yes}/需${need}，弃权${abstain}不计入；发起国 rep −${D.meetingFailRep}）` });
    }
    if (cs.extinct) cs.extinct.called = true;
  }
}

// ================= A1.6 文化与同盟收口（2026-11-16 院长裁） =================
// 时序：全球会议之后、常规外交行动之前；含 复国 → UN 宪章 → 盟主选举 → 联合进攻 → 经济制裁
function a1_6Phase(t, facs, diplo, dipPower, ids, rand, log) {
  const allIds = Object.keys(facs);
  const alive = ids.filter((x) => facs[x] && facs[x].cities.length > 0);
  if (alive.length < 2) return;
  const atWarAny = (x) => !!(diplo.war && ((diplo.war.sideA || [diplo.war.a]).includes(x) || (diplo.war.sideB || [diplo.war.b]).includes(x)));

  // ---- ① 最小复国会议（院长 11-16：本轮加最小复国，保全阵营存活）----
  diplo.reviveCd = diplo.reviveCd || {};
  for (const e of diplo.extinct || []) {
    if (e.revived) continue;
    const X = e.fac, killer = e.by;
    if (t - e.t < D.revive.wait || (diplo.reviveCd[X] || 0) > t) continue;
    // 发起人：非灭国者、持有 X 原属城且不止一城（不能把自己唯一城送掉）
    const holders = alive.filter((y) => y !== killer && facs[y].cities.length > 1
      && facs[y].cities.some((c) => c.origFac === X));
    if (!holders.length) continue;
    const cands = holders.slice().sort((a, b) => {
      const pa = facs[a].mainPath === 'culture' ? 2 : facs[a].mainPath === 'economy' ? 1 : 0;
      const pb = facs[b].mainPath === 'culture' ? 2 : facs[b].mainPath === 'economy' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (dipPower[b] || 0) - (dipPower[a] || 0);
    });
    const initiator = cands[0];
    const city = facs[initiator].cities.find((c) => c.origFac === X);
    const participants = alive.filter((y) => y !== killer);
    const votes = [`${initiator}:同意`]; const yesSet = new Set([initiator]);
    for (const Y of participants) {
      if (Y === initiator) continue;
      const want = diplo.rel[Y][killer] < 0 || diplo.rep[killer] < 40 || facs[Y].mainPath === 'culture';
      if (want) { yesSet.add(Y); votes.push(`${Y}:同意`); } else votes.push(`${Y}:反对`);
    }
    const need = Math.floor(participants.length / 2) + 1;
    if (yesSet.size >= need) {
      // 城转归复国方
      facs[initiator].cities = facs[initiator].cities.filter((c) => c !== city);
      city.fac = X; facs[X].cities.push(city);
      // 复国国重置
      const f = facs[X];
      const inc = P.resources[X] || { iron: 0, coal: 0, oil: 0 };
      f.units = { inf: Math.round(city.P * D.revive.militiaRate), assault: 0, special: 0, tank: 0, heli: 0, mobile: 0, heavy: 0 };
      f.soldiers = f.units.inf; f.service = P.peaceService; f.treasury = 0;
      f.culture = city.baseCulture * 8; f.identity = Object.fromEntries(allIds.map((y) => [y, y === X ? 1 : 0]));
      f.invasionSince = {}; f.lostCulture = false; f.atWar = false; f.project = 0; f.policy = 'none';
      f.bombers = 0; f.drones = 0; f.airQueue = null; f.airProgress = 0; f.mainPath = 'military';
      f.resources = { iron: inc.iron, coal: inc.coal, oil: inc.oil };
      f.arsenalJob = null; f.arsenalProgress = 0;
      for (const c of f.cities) { c.arsenalJob = null; c.arsenalProgress = 0; }
      // 关系/声誉：对同意国 +100、对灭国者 −100（双向）
      for (const Y of allIds) {
        diplo.rel[X][Y] = Y === killer ? D.revive.relKiller : (yesSet.has(Y) ? D.revive.relYes : 0);
        diplo.rel[Y][X] = Y === killer ? D.revive.relKiller : (yesSet.has(Y) ? 50 : 0);
      }
      diplo.rep[X] = D.revive.rep; diplo.aggression[X] = 0;
      diplo.cooldown[X] = { war: 0, peace: 0 };
      if (!hasTreaty(diplo, 'ally', X, initiator, t))
        diplo.treaties.push({ type: 'ally', a: X, b: initiator, expire: t + D.allyTerm });
      if (diplo.un && !diplo.un.members.includes(X)) diplo.un.members.push(X);
      e.revived = true;
      log.push({ t, event: `复国会议：${initiator} 以 ${city.name} 复国 ${X}——${votes.join(' ')} → 通过（同意${yesSet.size}/需${need}；${X} 回归，民兵 ${fmt(f.units.inf)}，与 ${initiator} 结盟）` });
    } else {
      diplo.rep[initiator] = clamp(diplo.rep[initiator] - D.meetingFailRep, 0, 100);
      diplo.reviveCd[X] = t + D.revive.cooldown;
      log.push({ t, event: `复国会议：${initiator} 提案复国 ${X}——${votes.join(' ')} → 否决（同意${yesSet.size}/需${need}；发起国 rep −${D.meetingFailRep}）` });
    }
  }

  // ---- ② UN 宪章（全票；可在战争期发起，通过=全球停战+和平锁）----
  diplo.unCd = diplo.unCd || 0;
  if (!diplo.un && t >= D.un.start && diplo.unCd <= t) {
    const allAlive = allIds.every((x) => facs[x] && facs[x].cities.length > 0);
    if (allAlive) {
      // 发起人：非军事路径中"最有人缘"者（关系总和+rep；文化路径小幅加分）——避免被单一低关系对象卡死
      const score = (x) => alive.reduce((s, y) => s + (y === x ? 0 : diplo.rel[x][y]), 0)
        + 0.3 * diplo.rep[x] + (facs[x].mainPath === 'culture' ? 20 : 0);
      const cands = alive.filter((x) => facs[x].mainPath !== 'military').sort((a, b) => score(b) - score(a));
      const initiator = cands[0];
      if (initiator) {
        const votes = [`${initiator}:同意`]; let allYes = true;
        for (const Y of alive) {
          if (Y === initiator) continue;
          const L = D.leaders[Y] || {};
          const u = 0.35 + 0.30 * (diplo.rep[initiator] / 100) + 0.30 * (diplo.rel[Y][initiator] / 100)
            - 0.35 * (L.aggression || 0.5) + (atWarAny(Y) ? 0.25 : 0) + 0.10 * (L.culture || 0.5);
          if (u >= D.un.voteThreshold) votes.push(`${Y}:同意`);
          else { votes.push(`${Y}:反对`); allYes = false; }
        }
        if (allYes) {
          if (diplo.war) {
            const w = diplo.war;
            for (const x of (w.sideA || [w.a])) for (const y of (w.sideB || [w.b])) signPeace(t, facs, diplo, x, y);
            diplo.war = null;
          }
          for (const f of Object.values(facs)) f.atWar = false;
          diplo.un = { founded: t, members: alive.slice(), leader: null, nextElection: t + D.un.electionEvery };
          log.push({ t, event: `联合国成立：${initiator} 提出宪章——${votes.join(' ')} → 全票通过（全球停战，和平锁生效）` });
        } else {
          diplo.rep[initiator] = clamp(diplo.rep[initiator] - D.meetingFailRep, 0, 100);
          diplo.unCd = t + D.un.charterCd;
          log.push({ t, event: `联合国宪章：${initiator} 提案——${votes.join(' ')} → 未通过（需全票；发起国 rep −${D.meetingFailRep}）` });
        }
      }
    }
  }

  // ---- ③ 盟主选举（每 25 回；每国 1 票；严格过半/空位）----
  if (diplo.un && t >= diplo.un.nextElection) {
    const members = diplo.un.members.filter((x) => facs[x] && facs[x].cities.length > 0);
    if (members.length >= 2) {
      const tally = {};
      for (const v of members) {
        const L = D.leaders[v] || {};
        let best = null, bestU = -1;
        for (const c of members) {
          if (c === v) continue; // 不投自己（现实联合国选举惯例；防 1-1-1-1 永久僵局）
          const u = 0.45 * (facs[v].identity[c] || 0) + 0.25 * (diplo.rel[v][c] / 100)
            + 0.15 * (diplo.rep[c] / 100) + 0.15 * ((L.affinity && L.affinity[c]) || 0.3);
          if (u > bestU) { bestU = u; best = c; }
        }
        if (best) tally[best] = (tally[best] || 0) + 1;
      }
      const need = Math.floor(members.length / 2) + 1;
      const ranked = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || (facs[b].culture || 0) - (facs[a].culture || 0));
      // 4 阵营小样本：绝对多数常不可得（2-2 僵局）→ 相对多数（≥半数票）当选；1-1-1-1 才空位
      const relNeed = members.length === 2 ? 2 : Math.ceil(members.length / 2);
      const leader = ranked.length && tally[ranked[0]] >= relNeed ? ranked[0] : null;
      diplo.un.leader = leader;
      diplo.un.nextElection = t + D.un.electionEvery;
      log.push({ t, event: `联合国大会：盟主选举——${Object.entries(tally).map(([k, v]) => `${k}:${v}`).join(' ')} → ${leader ? `${leader} 当选常任理事国（贸易 ×${D.un.leaderTrade}）` : '无过半者，盟主空缺'}` });
    } else {
      diplo.un.leader = null; diplo.un.nextElection = t + D.un.electionEvery;
    }
  }

  // ---- ④ 同盟会议·联合进攻（全票；通过=盟友加入现有战争 sideA）----
  diplo.jointCd = diplo.jointCd || {};
  if (diplo.war) {
    const w = diplo.war, a = w.a, b = w.b;
    const sideA = w.sideA || [a], sideB = w.sideB || [b];
    if ((diplo.jointCd[a] || 0) <= t) {
      const allies = [...new Set(diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === a || x.b === a))
        .map((x) => (x.a === a ? x.b : x.a))
        .filter((y) => !sideA.includes(y) && !sideB.includes(y) && facs[y] && facs[y].cities.length > 0))];
      if (allies.length) {
        const votes = [`${a}:同意`]; let yes = 1;
        for (const Y of allies) {
          const L = D.leaders[Y] || {};
          const winChance = clamp(((dipPower[a] || 0) - (dipPower[b] || 0)) / Math.max(1, dipPower[b] || 0), 0, 1);
          const u = 0.30 + 0.20 * (diplo.rel[Y][a] / 100) + 0.20 * (diplo.rep[a] / 100)
            - 0.25 * (L.caution || 0.5) + 0.15 * (L.aggression || 0.5)
            + 0.20 * winChance + 0.10 * ((L.affinity && L.affinity[a]) || 0.3);
          if (u >= D.allianceMeeting.voteThreshold) { yes++; votes.push(`${Y}:同意`); } else votes.push(`${Y}:反对`);
        }
        if (yes < allies.length + 1) {
          diplo.jointCd[a] = t + 15; // AI 预判会被否，不发起
        } else {
          w.sideA = sideA.concat(allies);
          for (const Y of allies) if (facs[Y]) facs[Y].atWar = true;
          log.push({ t, event: `同盟会议：${a} 提案联合进攻 ${b}——${votes.join(' ')} → 全票通过（${allies.join('/')} 参战）` });
        }
      }
    }
  }

  // ---- ⑤ 经济同盟会议·经济制裁（全票；通过=成员对目标经济制裁 12 回）----
  diplo.econMeetCd = diplo.econMeetCd || {};
  for (const tr of diplo.treaties.filter((x) => x.type === 'econAlly' && !x.dead && x.expire > t)) {
    const A = tr.a, B = tr.b;
    if (!facs[A] || !facs[B] || !facs[A].cities.length || !facs[B].cities.length) continue;
    if ((diplo.econMeetCd[A] || 0) > t || (diplo.econMeetCd[B] || 0) > t) continue;
    const outsiders = alive.filter((x) => x !== A && x !== B);
    if (!outsiders.length) continue;
    // 目标=非成员中动员潜力最高者；需 A/B 至少一方对其关系 <20
    const target = outsiders.sort((x, y) => (dipPower[y] || 0) - (dipPower[x] || 0))[0];
    if (sanctionActive(diplo, target, 'econ', t)) continue;
    if (diplo.rel[A][target] >= 20 && diplo.rel[B][target] >= 20) continue;
    // 全票：A 发起、B 表决
    const L = D.leaders[B] || {};
    const u = 0.25 + 0.25 * (diplo.rel[B][target] < 0 ? 1 : 0) + 0.20 * (diplo.rep[A] / 100)
      - 0.20 * (L.economy || 0.5) * 0.3 + 0.20 * (1 - clamp((dipPower[target] || 0) / Math.max(1, dipPower[B] || 0), 0, 1));
    if (u < D.allianceMeeting.voteThreshold) {
      // AI 预判会被否 → 不发起（防每 5 回刷屏与无谓 rep 损失）
      diplo.econMeetCd[A] = t + 20; diplo.econMeetCd[B] = t + 20;
      continue;
    }
    diplo.sanctions.push({ target, type: 'econ', label: '经济同盟制裁', expire: t + D.sanctionTerm, by: A, support: [A, B] });
    diplo.econMeetCd[A] = t + D.allianceMeeting.cd; diplo.econMeetCd[B] = t + D.allianceMeeting.cd;
    log.push({ t, event: `经济同盟会议：${A}+${B} 提案制裁 ${target}——${A}:同意 ${B}:同意 → 全票通过（商业/科技 ×0.7，${D.sanctionTerm} 回）` });
  }
}

function diploTick(t, facs, diplo, fpower, ids, rand, log, env) {
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
      // 文化失所：战争能力 ×0.9（征兵不愿为迷茫之国而战）
      const atk = sideA.reduce((s, x) => s + compositionPower(facs[x], brA) * (facs[x].lostCulture ? P.culture.lostWar : 1), 0);
      const def = sideB.reduce((s, x) => s + compositionPower(facs[x], brB) * (facs[x].lostCulture ? P.culture.lostWar : 1), 0)
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
          if (Bf.cities.length === 0) {
            log.push({ t, event: `${b} 被 ${sideA.join('+')} 灭国` });
            diplo.extinct.push({ fac: b, by: a, t }); // A1.5 紧急会议事由（10 回合窗口）
          }
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

  // ---- A1.5 会议阶段（院长 11-13 第 3 条：N 结算后 → 会议 → N 行动前；战争期也开紧急会议）----
  meetingPhase(t, facs, diplo, dipPower, ids, rand, log, env);

  // ---- A1.6 文化与同盟收口：复国 → UN 宪章 → 盟主选举 → 联合进攻 → 经济制裁 ----
  a1_6Phase(t, facs, diplo, dipPower, ids, rand, log);

  if (diplo.war) return; // 处于战争（含刚成型的包围网）：本轮不做常规外交行动

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

  // ---- A1.6 贸易/经济同盟到期：贸易关系≥20 续约；经济同盟需贸易仍在 + 关系≥30 ----
  for (const tr of diplo.treaties.filter((x) => x.type === 'trade' && !x.dead && x.expire <= t)) {
    const alive = facs[tr.a] && facs[tr.a].cities.length > 0 && facs[tr.b] && facs[tr.b].cities.length > 0;
    if (alive && diplo.rel[tr.a][tr.b] >= D.trade.minRel) tr.expire = t + D.trade.term;
    else tr.dead = true;
  }
  for (const tr of diplo.treaties.filter((x) => x.type === 'econAlly' && !x.dead && x.expire <= t)) {
    const alive = facs[tr.a] && facs[tr.a].cities.length > 0 && facs[tr.b] && facs[tr.b].cities.length > 0;
    if (alive && diplo.rel[tr.a][tr.b] >= 30 && hasTreaty(diplo, 'trade', tr.a, tr.b, t)) tr.expire = t + D.econAlly.term;
    else tr.dead = true;
  }

  // ---- 关系自然回归（和平期缓慢回中并小幅上升；A1.6 贸易协定 +2/回）----
  for (const a of ids) for (const b of ids) if (a !== b) {
    const atWar = diplo.war && ((diplo.war.a === a && diplo.war.b === b) || (diplo.war.a === b && diplo.war.b === a));
    if (!atWar) {
      diplo.rel[a][b] = clamp(diplo.rel[a][b] * 0.99 + 0.05, -100, 100);
      if (hasTreaty(diplo, 'trade', a, b, t)) diplo.rel[a][b] = clamp(diplo.rel[a][b] + D.trade.relPerTurn, -100, 100);
    }
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
      const trade = hasTreaty(diplo, 'trade', a, b, t);       // A1.6 贸易协定/航线
      const econAlly = hasTreaty(diplo, 'econAlly', a, b, t); // A1.6 经济同盟
      const cb = sanctionCb(diplo, a, b, t); // A1.2：参与制裁国对目标有合法战争 CB
      const pr = (dipPower[a] || 0) / Math.max(1, dipPower[b] || 0);
      const adj = (ADJ[a] || []).includes(b);
      // 宣战 U（A1 §6.1；A1.1：制裁 CB 门槛 0.8、U+0.3、无声誉代价）
      // A1.6 UN 和平锁：成员国之间禁止宣战
      const unLocked = !!(diplo.un && diplo.un.members.includes(a) && diplo.un.members.includes(b));
      if (!unLocked && !ally && !peace && !nap && t >= P.warStart && t >= (diplo.cooldown[a].war || 0)) {
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
      // A1.6 贸易协定/航线（文化/经济路径主动签；link +0.2、关系 +2/回）
      if (!trade && !atWarPair(diplo, a, b) && t >= D.napStart && R >= D.trade.minRel
        && diplo.rep[a] >= 30 && t >= ((diplo.tradeCd && diplo.tradeCd[a + b]) || 0)) {
        const pathBonus = facs[a].mainPath === 'culture' ? 0.25 : facs[a].mainPath === 'economy' ? 0.15 : 0;
        const Ut = 0.30 * (L.affinity[b] || 0.3) + 0.20 * L.economy + 0.20 * (1 - Math.min(pr, 1))
          + pathBonus - 0.10 * L.caution * 0.3;
        cands.push({ type: 'trade', b, U: Ut, label: `贸易协定${b}` });
      }
      // A1.6 经济同盟（贸易协定前置 + R≥40；每类限 1 盟友）
      if (trade && !econAlly && R >= D.econAlly.minRel
        && treatyCount(diplo, 'econAlly', a, t) < D.econAlly.max && diplo.rep[a] >= 30
        && t >= ((diplo.econAllyCd && diplo.econAllyCd[a + b]) || 0)) {
        const pathBonus = facs[a].mainPath === 'economy' ? 0.20 : facs[a].mainPath === 'culture' ? 0.15 : 0;
        const Ue = 0.35 * L.economy + 0.20 * (L.affinity[b] || 0.3) + 0.15 * (1 - Math.min(pr, 1))
          + pathBonus - 0.10 * L.caution * 0.3;
        cands.push({ type: 'econAlly', b, U: Ue, label: `经济同盟${b}` });
      }
      // A1.6 文化推广候选在 b 循环外按"最低认同份额"选目标（逐国击破）
    }
    // A1.6 文化推广：文化路径 AI 主操作（全局文化攻势；周期性）
    if (facs[a].mainPath === 'culture' && t >= 60 && t >= (diplo.pushCd[a] || 0) && facs[a].treasury >= D.culturePush.cost) {
      cands.push({ type: 'push', b: null, U: 0.55 + 0.30 * L.culture, label: '文化推广' });
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
    } else if (pick.type === 'trade') {
      if (diplo.rep[a] < 30 || diplo.rel[b][a] < 0) {
        diplo.tradeCd = diplo.tradeCd || {};
        diplo.tradeCd[a + b] = t + 5;
        log.push({ t, event: `${a} 提议与 ${b} 签贸易协定被拒（对方 rep ${diplo.rep[a].toFixed(0)} R ${diplo.rel[b][a].toFixed(0)}）` });
        continue;
      }
      diplo.treaties.push({ type: 'trade', a, b, expire: t + D.trade.term });
      diplo.rel[a][b] = clamp(diplo.rel[a][b] + 5, -100, 100);
      diplo.rel[b][a] = clamp(diplo.rel[b][a] + 5, -100, 100);
      log.push({ t, event: `${a} 与 ${b} 签订贸易协定/航线（${D.trade.term} 回合，文化 link +${D.trade.link}）` });
    } else if (pick.type === 'econAlly') {
      if (diplo.rep[a] < 30 || diplo.rel[b][a] < 0) {
        diplo.econAllyCd = diplo.econAllyCd || {};
        diplo.econAllyCd[a + b] = t + 5;
        log.push({ t, event: `${a} 提议与 ${b} 结经济同盟被拒（对方 rep ${diplo.rep[a].toFixed(0)} R ${diplo.rel[b][a].toFixed(0)}）` });
        continue;
      }
      diplo.treaties.push({ type: 'econAlly', a, b, expire: t + D.econAlly.term });
      diplo.rel[a][b] = clamp(diplo.rel[a][b] + 5, -100, 100);
      diplo.rel[b][a] = clamp(diplo.rel[b][a] + 5, -100, 100);
      log.push({ t, event: `${a} 与 ${b} 结成经济同盟（${D.econAlly.term} 回合，U=${pick.U.toFixed(2)}）` });
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
      diplo.extinct.push({ fac: b, by: a, t }); // A1.5 劝降=灭国，紧急会议事由
      diplo.rep[a] = clamp(diplo.rep[a] - 10, 0, 100);
      diplo.aggression[a] = (diplo.aggression[a] || 0) + 3; // A1.2 劝降计入侵略记录
      log.push({ t, event: `${a} 劝降 ${b}（不战而屈人之兵，潜力比 ${(pick.pr || 0).toFixed(2)} = ${Math.round(dipPower[a] || 0)}/${Math.round(dipPower[b] || 0)}）` });
    } else if (pick.type === 'push') {
      facs[a].treasury -= D.culturePush.cost;
      diplo.culturePush[a] = { until: t + D.culturePush.duration, mult: D.culturePush.mult };
      diplo.pushCd[a] = t + D.culturePush.cooldown;
      log.push({ t, event: `${a} 发动文化推广（文化压力 ×${D.culturePush.mult}，${D.culturePush.duration} 回，耗 ${fmt(D.culturePush.cost)} 财）` });
    }
  }
}

// ================= 文化输出（文化输出算法 v1 份额收敛式；2026-11-05 院长定稿） =================
// P[A→B] = √Culture_A × 距离 × 联系 × 情报(1.0，情报系统未接) × 战争衰减 × 势差乘区
// 认同度每回向目标份额收敛 r=0.05；完全入侵 ≥60% 持续 5 回；文化胜利=对所有国完全入侵维持 10 回
function cultureResist(f) {
  let r = 0;
  for (const c of f.cities) {
    r += c.pub * P.culture.resistPub + c.tour * P.culture.resistTour
      + Object.values(c.ent).reduce((a, v) => a + v, 0) * P.culture.resistEnt;
  }
  return clamp(r, 0, P.culture.resistCap);
}

function culturePressure(A, B, facs, diplo, t) {
  const fa = facs[A], fb = facs[B];
  if (!fa || !fb || !fa.cities.length || !fb.cities.length) return 0;
  const ca = Math.max(1, fa.culture), cb = Math.max(1, fb.culture);
  const hasBld = fa.cities.some((c) => c.pub > 0 || c.tour > 0 || Object.values(c.ent).some((v) => v > 0));
  const gap = hasBld ? clamp(Math.pow(ca / cb, P.culture.gapExp), 1.0, P.culture.gapCap) : 1.0; // 势差乘区（门槛=有文化建筑）
  const adj = (ADJ[A] || []).includes(B) || (ADJ[B] || []).includes(A);
  let dist = adj ? P.culture.distAdj : P.culture.distSea;
  if ((A === 'AU' || B === 'AU') && Math.min(fa.tech, fb.tech) < P.culture.contactTech) dist = 0; // 澳洲隔绝门槛
  if (dist === 0) return 0;
  // A1.6 联系系数：基线 1.0 + 贸易/航线 0.2 + 军事同盟 0.2 + 经济同盟 0.1
  let link = 1.0;
  if (hasTreaty(diplo, 'trade', A, B, t)) link += D.trade.link;
  if (hasTreaty(diplo, 'ally', A, B, t)) link += 0.2;
  if (hasTreaty(diplo, 'econAlly', A, B, t)) link += D.econAlly.link;
  if (diplo.un && diplo.un.leader === A) link += 0.5; // A1.6 盟主文化平台（非对称；仅盟主）
  if (diplo.culturePush[A] && diplo.culturePush[A].until > t) link *= diplo.culturePush[A].mult; // A1.6 文化推广（全局文化攻势）
  let dec = 1.0;
  if (diplo.war) {
    const sa = diplo.war.sideA || [diplo.war.a], sb = diplo.war.sideB || [diplo.war.b];
    if ((sa.includes(A) && sb.includes(B)) || (sa.includes(B) && sb.includes(A))) dec = 0; // 交战双边清零
  }
  if (dec > 0 && hasTreaty(diplo, 'peace', A, B, t)) dec = P.culture.peaceDecay; // 停战恢复期
  return Math.sqrt(ca) * dist * link * dec * gap;
}

function cultureTick(t, facs, diplo, ids) {
  const alive = ids.filter((x) => facs[x] && facs[x].cities.length > 0);
  if (alive.length < 2) return;
  // 文化存量：每回结算（建筑直产×电力满足率×阵营文化乘区；失城不回溯——存量只加不减）
  for (const x of alive) {
    const out = facs[x].cities.reduce((a, c) => a + cityStats(c, facs, 100, 1, 1).C_out, 0)
      * (P.culture.facMult[x] || 1);
    facs[x].culture = (facs[x].culture || 0) + out;
  }
  // ---- 认同度：向输出份额收敛（本国自压 = √C × (1+抵抗)）----
  for (const B of alive) {
    const fb = facs[B];
    const self = Math.sqrt(Math.max(1, fb.culture)) * (1 + cultureResist(fb));
    let total = self;
    const press = {};
    for (const A of alive) if (A !== B) { press[A] = culturePressure(A, B, facs, diplo, t); total += press[A]; }
    const id = fb.identity;
    id[B] = (id[B] || 0) + P.culture.convergeR * (self / total - (id[B] || 0));
    for (const A of alive) if (A !== B) id[A] = (id[A] || 0) + P.culture.convergeR * ((press[A] || 0) / total - (id[A] || 0));
    // 死国份额清零 + Σ 归一（差额回本国）
    let sum = 0;
    for (const k of Object.keys(id)) { if (k !== B && !alive.includes(k)) id[k] = 0; sum += id[k]; }
    if (sum > 0) for (const k of Object.keys(id)) id[k] /= sum;
    if (id[B] < 0.2) id[B] = 0.2; // 本国认同底线 20%（负反馈纪律）
    // ---- 完全入侵计时：≥60% 起算；<50% 解除 ----
    fb.invasionSince = fb.invasionSince || {};
    for (const A of alive) if (A !== B) {
      if (id[A] >= P.culture.invadeThreshold) { if (!fb.invasionSince[A]) fb.invasionSince[A] = t; }
      else if (id[A] < P.culture.invadeRelease) fb.invasionSince[A] = 0;
    }
    // ---- 文化失所：本国认同<40% 且无单极（最大外国<60%）；解除 ≥45% ----
    const maxForeign = Math.max(0, ...alive.filter((A) => A !== B).map((A) => id[A] || 0));
    if (id[B] < P.culture.lostSelf && maxForeign < P.culture.invadeThreshold) fb.lostCulture = true;
    else if (id[B] >= P.culture.lostRelease) fb.lostCulture = false;
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
  let winner = null; // { id, type, t }：科技/军事/文化胜利（先到先得）
  let doom = null; // 海平面 +1.5m 全局失败（所有阵营失败，无胜者）
  let env = { carbon: 0, temp: 0, sea: 0, netZeroRun: 0, level: 0, emit: 0, recycle: 0, facEmit: {} };
  const facs = makeFactions(cities);
  const allIds = Object.keys(facs);
  for (const f of Object.values(facs)) {
    f.culture = f.cities.reduce((a, c) => a + c.baseCulture * 8, 0); // 城市基础文化值 ×8（文化区 v1.0）
    f.identity = Object.fromEntries(allIds.map((x) => [x, x === f.id ? 1 : 0]));
  }
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
    if (t === 1 || t % 10 === 0) computePaths(facs, allIds); // A1.6 胜利路径（每 10 回合重算）
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
        const coastHit = c.coastal && env.level >= 1 ? (1 - P.env.coastPenalty) : 1; // 海平面一级：沿海产出损
        taxSum += s.tax * coastHit; incomeSum += s.income * coastHit; upkeepSum += s.upkeep;
        let gg = s.g;
        if (f.policy === 'subsidy') gg *= P.policy.subsidyMult;
        if (f.policy === 'limit') gg *= P.policy.limitMult;
        c.P = Math.max(1000, c.P + c.P * clamp(gg, -P.growthCap, P.growthCap));
        c.builtThisTurn = 0;
        aiBuild(c, s, F, f, devMode, env.temp);
      }
      if (econHit) incomeSum *= 0.7;
      if (diplo.un && diplo.un.leader === f.id) incomeSum *= D.un.leaderTrade; // A1.6 盟主贸易优势
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
      const target = Math.min(popTotal * (f.atWar ? (stress ? stressService : P.warService) : P.peaceService) * (disarmHit ? 0.5 : 1) * (f.lostCulture ? P.culture.lostRecruit : 1), 2000000);
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
          winner = { id: f.id, type: 'tech', t };
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
    // ==== 环境账（全球碳 → 温度 → 海平面；环境系统 §十一；压力盘不接）====
    if (!stress) {
      let emit = 0, recycle = 0;
      const facEmit = {};
      for (const f of Object.values(facs)) {
        let fe = 0;
        for (const c of f.cities) {
          fe += c.b.factory * P.env.emit.factory + c.b.plant * P.env.emit.plant + c.b.coal * P.env.emit.coal;
          recycle += c.ent.park * P.env.recycle.park + P.env.recycle.nature[c.ent.nature] + c.b.ccs * P.env.recycle.ccs;
        }
        if (diplo.un && diplo.un.members.includes(f.id)) fe *= P.env.unGreen.emitMult; // A1.6 UN 环保合作
        facEmit[f.id] = fe; emit += fe;
      }
      if (diplo.un) recycle += P.env.unGreen.recycleBonus; // A1.6 UN 全球回收
      // 碳额度法案：成员国超排自动购买额度（10 财/碳）；无钱罚 20 财/回 + rep −2
      const bill = diplo.carbonBill;
      if (bill && bill.expire > t) {
        for (const x of bill.members) {
          const f = facs[x]; if (!f || !f.cities.length) continue;
          const over = (facEmit[x] || 0) - (bill.base[x] || 0) * bill.ratio;
          if (over <= 0) continue;
          const cost = over * P.env.quotaBuyPrice;
          if (f.treasury >= cost) f.treasury -= cost;
          else { f.treasury -= Math.min(P.env.quotaFine, Math.max(0, f.treasury)); diplo.rep[x] = clamp(diplo.rep[x] - 2, 0, 100); }
        }
      }
      const netC = emit - recycle;
      env.emit = emit; env.recycle = recycle; env.facEmit = facEmit; env.carbon += netC;
      env.temp = Math.max(env.temp, clamp(env.carbon / P.env.tempK * 100, 0, 100)); // 温度单调不减
      if (netC <= 0) env.netZeroRun++; else env.netZeroRun = 0;
      const rate = env.netZeroRun >= P.env.netZeroHold ? 0 : P.env.seaRates.find(([th]) => env.temp < th)[1];
      env.sea += rate / 1000;
      const lv = env.sea >= P.env.level3 ? 3 : env.sea >= P.env.level2 ? 2 : env.sea >= P.env.level1 ? 1 : 0;
      if (lv !== env.level) {
        env.level = lv;
        if (lv === 1) log.push({ t, event: `海平面 +0.5m：沿海城产出 −${(P.env.coastPenalty * 100).toFixed(0)}%` });
        if (lv === 2) {
          for (const f of Object.values(facs)) {
            const gone = f.cities.filter((c) => c.coastal);
            if (!gone.length) continue;
            f.cities = f.cities.filter((c) => !c.coastal);
            for (const c of gone) { c.drowned = true; c.P = 0; }
            log.push({ t, event: `海平面 +1.0m：${f.id} ${gone.map((c) => c.name).join('/')} 被淹没（海底遗迹）` });
          }
        }
        if (lv === 3 && !winner) {
          doom = { t };
          log.push({ t, event: `海平面 +1.5m——全局失败（大陆陷落，所有阵营失败）` });
          break;
        }
      }
    }
    // ==== 外交 AI（A1 v1 意图机）====
    if (stress) {
      for (const f of Object.values(facs)) f.atWar = true;
    } else {
      diploTick(t, facs, diplo, factionPower, Object.keys(facs), rand, log, env);
      cultureTick(t, facs, diplo, Object.keys(facs));
      // A1.6 文化快照（调研用；每 25 回合）
      if (t % 25 === 0) {
        const idsNow = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
        const parts = idsNow.map((B) => {
          const id = facs[B].identity || {};
          const top = idsNow.filter((x) => x !== B && (id[x] || 0) > 0.25)
            .map((x) => `${x}:${Math.round((id[x] || 0) * 100)}%`);
          return `${B}[自${Math.round((id[B] || 0) * 100)}% ${top.join(' ')}]`;
        });
        log.push({ t, event: `文化快照：${idsNow.map((A) => `${A}存量${Math.round(facs[A].culture)}`).join(' ')} | ${parts.join(' ')}` });
      }
      // ==== 胜利判定（军事/文化；科技在结算内）====
      const aliveIds = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
      if (!winner && aliveIds.length === 1) {
        winner = { id: aliveIds[0], type: 'military', t };
        log.push({ t, event: `${aliveIds[0]} 统一全球——军事胜利（t${t}）` });
      }
      // A1.6 文化胜利（11-16 院长裁）：UN 盟主 + 对所有其他**存活阵营**完全入侵并维持 10 回
      // 不要求初始阵营全存活；复国=UN 多一票（不阻塞文化胜利，反而增加目标/票数）
      if (!winner && diplo.un && diplo.un.leader) {
        const A = diplo.un.leader;
        if (!facs[A] || facs[A].cities.length === 0) { diplo.un.leader = null; } // 盟主失国=空位
        else {
          const others = aliveIds.filter((B) => B !== A);
          const ok = others.length > 0 && others.every((B) => (facs[B].invasionSince || {})[A] > 0
            && t - facs[B].invasionSince[A] >= P.culture.victoryHold && (facs[B].identity[A] || 0) >= P.culture.invadeRelease);
          if (ok) {
            winner = { id: A, type: 'culture', t };
            const shares = others.map((B) => `${B}:${Math.round((facs[B].identity[A] || 0) * 100)}%`).join(' ');
            log.push({ t, event: `${A} 文化入侵全球（UN 盟主）——文化胜利（t${t}）；认同 ${shares}` });
          }
        }
      }
    }
  }
  return { log, cities, facs, diplo, winner, doom, env };
}

const turns = Number(process.argv[2] || 200);
const seed = Number(process.argv[3] || 1);
const stress = process.argv[4] === 'stress';
const stressService = Number(process.argv[5] || P.stressService);
const { log, cities, facs, diplo, winner, doom, env } = run(turns, seed, stress, stressService);
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
console.log(`胜利=${doom ? `全局失败（灭世 t${doom.t}）` : winner ? `${winner.id}（${winner.type} t${winner.t}）` : '无'}`);
console.log(`\n[环境] 累计碳=${fmt(env.carbon)} | 温度指数=${env.temp.toFixed(1)} | 海平面=${env.sea.toFixed(2)}m（${env.level}级） | 净碳=${fmt(env.emit - env.recycle)}（排放${fmt(env.emit)}/回收${fmt(env.recycle)}） | 配额法案=${diplo.carbonBill ? `系数${diplo.carbonBill.ratio} 至t${diplo.carbonBill.expire}` : '无'}${stress ? '（压力盘未接环境账）' : ''}`);
console.log('\n[文化] 阵营 | 文化存量 | 本国认同 | 最大外国 | 完全入侵(≥60%) | 失所');
{
  const ids = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  for (const f of Object.values(facs)) {
    if (!f.cities.length) continue;
    const maxA = ids.filter((x) => x !== f.id).sort((a, b) => (f.identity[b] || 0) - (f.identity[a] || 0))[0];
    const inv = ids.filter((x) => x !== f.id && (f.invasionSince[x] || 0) > 0)
      .map((x) => `${x}:${((f.identity[x] || 0) * 100).toFixed(0)}%`).join(' ');
    console.log(`${f.id} | ${fmt(f.culture)} | ${((f.identity[f.id] || 0) * 100).toFixed(0)}% | ${maxA ? `${maxA}:${((f.identity[maxA] || 0) * 100).toFixed(0)}%` : '-'} | ${inv || '-'} | ${f.lostCulture ? '是' : '否'}`);
  }
}
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
const trades = diplo.treaties.filter((x) => x.type === 'trade' && !x.dead).map((x) => `${x.a}-${x.b}(至t${x.expire})`);
const econAllies = diplo.treaties.filter((x) => x.type === 'econAlly' && !x.dead).map((x) => `${x.a}-${x.b}(至t${x.expire})`);
console.log(`同盟：${allies.join(' ') || '无'}`);
console.log(`停战：${peaces.join(' ') || '无'}`);
console.log(`贸易/航线：${trades.join(' ') || '无'}`);
console.log(`经济同盟：${econAllies.join(' ') || '无'}`);

// A1.6 路径 / UN
console.log('\n[A1.6 路径]');
for (const x of Object.keys(facs)) {
  if (!facs[x].cities.length) continue;
  const w = facs[x].pathW ? Object.entries(facs[x].pathW).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(' ') : '-';
  console.log(`${x} mainPath=${facs[x].mainPath} | ${w}`);
}
console.log('\n[UN]');
console.log(diplo.un
  ? `成立 t${diplo.un.founded} | 成员 ${diplo.un.members.join('/')} | 盟主 ${diplo.un.leader || '空位'} | 下届 t${diplo.un.nextElection}`
  : '未成立');
const revived = (diplo.extinct || []).filter((e) => e.revived).map((e) => `${e.fac}(t${e.t}被${e.by}灭→复国)`);
console.log(`复国：${revived.join(' ') || '无'}`);
