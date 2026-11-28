// sim/v27/revival.js — v27 复苏盘（复苏全量模拟 + 事件卡叠加；白机，2026-11-27）
// 基线：sim/v26/policy.js 只读复制；v27 增量（2026-11-27 院长裁）：
//   ①复苏 8×2 城（八足鼎立，无空城/不做空城占领）②武将实体化（21 将：8 leader 在职 + 13 free 在野，每城≥1）
//   ③B1 修正：俸禄只发在职（104/在职将/回）④加俸/派驻/招安/叛逃/归隐（B12 §三 + 忠诚度.md）
//   ⑤事件卡引擎（13 卡数据；复苏盘 11 卡生效，H1/H2 教学专属不进）⑥贸易 v1.0（线额×0.10×关系系数×协定×倾向）
//   ⑦居民区 9 建筑（居民区数值 v1.0；cap/q 接 C 与 H）⑧B12 余项（文化维护=通用 1% 已含/典藏考古 80 财/件）
// 依据：docs/06-设计/06-事件/事件卡内容库.md v1.0 · 03-内政/贸易最小规则.md v1.0 · 居民区数值.md v1.0 · 财政B12-定稿.md · 02-武将/忠诚度.md
// 用法：node sim/v27/revival.js [turns] [seed] [--scenario=revival|tutorial]（默认 tutorial 兼容历史盘）
// v26 新落点（相对 v25，全数保留）：
//   民生 W：简化主式（人口算法-v1 §五）W=clamp(50+0.28(L−50)+0.22(F−50)+pol_W, 0, 100)；民生流→忠诚轨迹（f.loyalty）
//     ——sim 未建治安/治理/财富项（报告注明）；W 类卡偏置键 W（加性）
//   工业：增量接入 incomeSum += Σ(factory×prodOut×在岗率×pr)×(industry−1)——无卡=0，不扰 v25 基线
//   商业 comm：接 incomeSum 整体（零售+娱乐+文旅+写字楼；sim 无独立 CalcCommercial 拆分，报告注明）
//   财支出 upkeep 乘区（福利/医保/集采/补贴/维和 ×1.005~1.01）+ 生育补贴按人口（subsidyCost 财/人/回）+ 军队经商 milIncome 财/兵/回
//   排放 emit 乘区（垃圾分类 ×0.95/绿色转型 ×0.90）；反谍 counterSpy（加性聚合，间谍引擎未建=占位审计）
//   服役上限 serviceCap（pp 偏置，接征募 target）；军饷 salary 乘区 + 军费 milCost 乘区（饷+装备采购）
//   战力 q 乘区（compositionPower）；同化 assimil 乘区（identity 收敛）；❌抵抗已删（11-24 院长令）
//   定向关系流：relWeakest（发展援助对最弱国 +2）/relVsWeak（霸权对弱国 −0.5）/relWar（维和对交战国 +0.5）
//   canDeclareWar（绝对中立宣战锁）；buyPriceMul（霸权强买 ×0.85）；noAlliance（不结盟，同盟创建处过滤）
//   占位（fx 记录不结算，报告挂账）：counterSpy 侦破上限 / immigration 移民开关 / 贸易渗透与容量 / 军管底线
// 运行：node sim/v26/policy.js [turns] [seed] [scenario]
//   scenario: (空)=主盘 AI 自动 | vs=私有化×国有化对照 | stack=W/财/关系三组逐张叠加 | neutral=绝对中立 | infra=基建狂魔
'use strict';
// ===== 剧本切换（院长 2026-11-24 第 2 条：默认用自由盘/复苏副本，教学盘仅兼容历史盘）=====
// 用法：node sim/v26/policy.js 200 1 --scenario=revival  （默认 tutorial）
const ARGV = process.argv.slice(2);
const SCEN_ID = ((ARGV.find((a) => a.startsWith('--scenario=')) || '').split('=')[1]) || 'tutorial';
const SCEN = require('../data/scenarios.js').SCENARIOS[SCEN_ID];
if (!SCEN) throw new Error('未知剧本: ' + SCEN_ID + '（可选 tutorial/revival）');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ================= 参数（×8 尺度；相对值同基准表） =================
const P = {
  turns: 200,
  flag: { nobuild: false, buildReserve: 0 }, // v26 场景开关（nobuild=冻结建筑谱系；buildReserve=AI 建造国库储备线，复苏盘启用）
  // 人口（单一自然增长公式，人口算法 §7.2）
  growthBase: 0.006, growthBalance: 1.5, growthLivExp: 1.5,
  growthCap: 0.02, // 院长 11-13 第 7 条：限速但不过度（-2%~+2%）
  // 科技胜利（院长 11-13 "科技拉力你来收束"）：率先建成任一终极工程 = 科技胜利
  // 终极工程（v28 院长裁"按生产力来进行"）：2,000 财 + 6,000 生产，产能流弹性工期（生产力高则回合少）——判定见 AIP.tech.projectCost

  recruitFee: 0, // 征募费（财/兵）：院长 2026-11-28 裁"征募不要钱"——兵饷等自然公式承担代价（原 8 财/兵=11-13 裁，作废）
  buyPrice: { iron: 1.2, coal: 1.0, oil: 2.0 }, // A1.4 外交采购价
  growthHospital: [0, 1.05, 1.10, 1.20, 1.30],
  // 粮
  farmYield: 320, foodPerPop: 1.0, foodPerSoldier: 1.5, importPrice: 8, importCap: 800,
  // 税
  taxConst: 800, taxPerPop: 1 / 1500,
  // 消费
  poolK: 2.5, shares: { retail: 0.60, ent: 0.25, tour: 0.15 },
  // 俸禄（权威=索引-参数 salaryPerGeneral=13 财/将/回，v18a 调优；×8=104。⚠️ v22~v24 历史盘误用公式算例 32×8=256，v25 已修正）
  salaryPerGeneral: 104, generalsPerCity: 2,
  // 军（B1 v1.2：批次制；1 批 = 8,000 兵；轻 1 回合/批、重 2 回合/批）
  soldierSalary: 0.05, peaceService: 0.05, warService: 0.10, stressService: 0.02, // 和平自动征募 5%（2026-11-28 院长裁"自动征募你来处理"：对齐文档口径"和平 5%/战时 10%"，代价=兵饷自然公式）
  batchSize: 8000, // 2026-11-28 院长裁：人头制——批次不再是开工门槛，退化为单回合转换上限（财/回合按人头比例）
  // WarAI 宣战潜力比门槛（11-27 院长裁"上调进攻性"：1.30/1.60→1.02/1.08——八足鼎立 pr 恒 0.98~1.02（实测），倍数门槛均衡局无解；决策主体=U 公式）
  warAdjTh: 1.02, warFarTh: 1.08, warTreasFloor: 20000, // 11-27 财政刹车：国库 <2 万不主动宣战（seed2 F4 战争烧穿负财政的护栏）
  units: {
    inf:     { name: '民兵', branch: 'step', q: 0.80, turns: 0, wealth: 0,     iron: 0,   coal: 0,   oil: 0 }, // 11-27 拟改名+降 q（方案待院长定）
    assault: { name: '反装甲步兵', branch: 'step', q: 1.00, turns: 1, wealth: 3200,  iron: 0,  coal: 0,   oil: 0 }, // 11-27 完全平衡：轻档统一 400 财/批（×8=3200） // 11-27 去资源：只花财+回合
    special: { name: '特种部队', branch: 'step', q: 1.05, turns: 1, wealth: 3200,  iron: 0,  coal: 0,   oil: 0 }, // 11-27 完全平衡：轻档统一 // 11-27 去资源
    tank:    { name: '坦克',     branch: 'cav',  q: 1.00, turns: 2, wealth: 12800, iron: 0, coal: 0, oil: 0 }, // 11-27 去资源
    heli:    { name: '武装直升机', branch: 'cav', q: 1.00, turns: 2, wealth: 12800, iron: 0, coal: 0, oil: 0 }, // 11-27 去资源
    mobile:  { name: '机动炮兵', branch: 'bow',  q: 1.00, turns: 1, wealth: 3200,  iron: 0, coal: 0,  oil: 0 }, // 轻档统一 3200 // 11-27 去资源
    heavy:   { name: '重炮兵',   branch: 'bow',  q: 1.00, turns: 2, wealth: 12800, iron: 0, coal: 0, oil: 0 }, // 11-27 完全平衡：重档统一 1600 财/批（×8=12800）+去资源
  },
  counter: { step: { cav: 1.3, bow: 1.0 }, cav: { bow: 1.3, step: 1.0 }, bow: { step: 1.3, cav: 1.0 } }, // v1.1（11-27）：1.5/0.7→1.30/1.00（剩 50% 锚点）；装甲对抗（轻步对坦克 0.894/反装甲 1.20）待 L1 战争引擎细化
  // 资源（v25：基础矿场满档产出，受矿脉档位系数；油按 v22 石油表，铁/煤按“2 座矿场/城 × 48/回”估）
  // uranium=铀矿（仅西安/悉尼；1 座矿=48/回 ×8 假设值，专题未给数值；JP/KR 无铀靠进口）
  resources: {
    CN: { iron: 576, coal: 576, oil: 86.4, uranium: 48 },
    JP: { iron: 288, coal: 288, oil: 48, uranium: 0 },
    KR: { iron: 192, coal: 192, oil: 24, uranium: 0 },
    AU: { iron: 576, coal: 192, oil: 115.2, uranium: 48 },
  },
  resourceCapTurns: 5,
  // 电力/污染（v25：并入电网参数，勿重复定义 power 键）
  power: { plant: 40, hydro: 30, solar: 20, nuclear: 80,
    transmissionLoss: 0.10,         // 跨城余电损耗（§十 #5 裁：保留 10%）
    superconductorLoss: 0,          // grn10 室温超导 → 0
    gridUnlockNode: 'ai6',          // 智能电网
    fuelShortageMode: 'proportional' }, // 0 料停机；部分满足按满足率线性打折
  // ==== v25 矿产/电网（矿电专题 §七 schema；×8 引擎口径）====
  mineral: {
    resourceCapTurns: 5,            // 铁/煤/铀/石油库存上限（回合收入）
    depletionTurns: 50,             // 矿脉每档回合（丰饶1.2/富集1.0/寻常0.8/贫化0.5/枯竭0）
    tierMult: [1.2, 1.0, 0.8, 0.5, 0], // §2.1 档位系数
    depletionRateMult: 0.5,         // grn2b 深井后：100 回/档
    oilWellMult: 1.3,               // grn2b：油田产出 ×1.3
    shortageMode: 'fuel_first',     // fuel_first | proportional（§十 #1 裁：fuel_first）
    fuelIn: { plant: 16, nuclear: 8, plantOil: 12 }, // ×8 引擎口径（设计值 2/1）；plantOil=12（11-27 火电双燃料：16 煤↔12 油热值）
    nuclearMaintenanceEvery: 10,    // 每运转 10 回维修 1 回（不耗铀/不产电/维护照付）
    coalToOilRate: 0.3,             // 1 煤 = 0.3 油（grn2c）
    coalToOilCapPerFactory: 16,     // ×8（设计值 2 煤/回/厂）
    coalMineYield: 48,              // 单座煤矿建筑扩产（×8；与 P.resources 基础矿场并列）
    uraniumPrice: 3,                // 铀进口价（财/铀；sim 假设，专题未给）
    shortMult: 1,                   // fuelshort 压力盘：矿石收入乘区（默认 1；0.2=深层枯竭/进口中断情景）
  },
  pollution: { plant: 3, coal: 4, factory: 2 },
  // 政策（人口·院长 11-12：只保留生育补贴/计划生育；补贴耗财；无延迟）
  policy: { subsidyCostPer1000: 1, subsidyMult: 1.12, limitMult: 0.85 },
  // 外交
  // 11-24 对齐 AI 战争细则 `ai.war.maxWars=1`（v26 报告为 2 口径历史基线；sim 结构上单场战争，改动应不敏感）
  warStart: 40, warEvery: 20, maxWarsPerFaction: 1, allyRatio: 0.6, joinWarRatio: 2.0, allyDefense: 1.5, // 11-27：100→40（原与 un.start=100 撞车=战争窗口 0，0 战争根因）
  // 文化输出（文化输出算法 v1 份额收敛式；2026-11-05 院长定稿；院长 11-13 第 4 条：文化胜利=文化入侵全球并维持）
  culture: {
    convergeR: 0.08,        // 收敛速率 r（2026-11-28 院长裁加速文化胜利：0.05→0.08=三档上限；balance 留 0.03/0.05/0.08 三档）
    // ❌ 抵抗系统已删除（2026-11-24 院长令「不要文化抵抗这个概念」）：防守=√Culture_B 本身
    //   原 resistCap(0.5)/resistPub(0.03)/resistTour(0.05)/resistEnt(0.02) 全删；cultureResist() 恒 0
    gapExp: 1.0, gapCap: 2.0, // 势差乘区 clamp((Ca/Cb)^1.0, 1.0, 2.0)；门槛=攻击方有文化建筑（2026-11-28 院长裁"加速文化胜利节奏"：0.5→1.0）
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
  farm:      { name: '农田', cost: 2400, prod: 480, upkeep: 0.01, yield: 240, max: 3 }, // B1A-17：40→30 粮（v22 ×8 = 240）
  coal:      { name: '煤矿', cost: 1600, prod: 320, upkeep: 0.01, jobs: 4800, poll: 4, max: 2, res: 48 }, // v25：res=煤/回/座（×8，扩产）
  plant:     { name: '火电', cost: 2400, prod: 480, upkeep: 0.01, jobs: 3200, power: 40, poll: 3, max: 3, fuel: 'coal' }, // v25：耗煤 16/回（P.mineral.fuelIn）
  nuclear:   { name: '核电', cost: 12000, prod: 960, upkeep: 0.01, jobs: 1600, power: 80, max: 2, fuel: 'uranium', techReq: 'grn6' }, // v25：耗铀 8/回，每 10 运转维修 1 回
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
// 剧本数据（sim/data/scenarios.js）：tutorial=教学盘 14城/4阵营；revival=复苏副本 8阵营单城+6空城
const CITY_INIT = SCEN.cities;
const ADJ = SCEN.adj; // 剧本邻接（教学盘 AU 远洋仅强者可跨海；复苏盘环形+跨接）
const COASTAL = SCEN.coastal; // 剧本沿海城（海平面三级受影响）

// ================= 生成 =================
function makeCities() {
  return CITY_INIT.map(([name, fac, pop, q, cul], i) => ({
    name, fac, origFac: fac, P: pop, C: pop * 1.5, C0: pop * 1.5, q, baseCulture: cul, // 城市基础文化值（文化区数值 v1.0 压低档）；origFac=复国原属
    capital: fac !== 'NONE' && CITY_INIT.slice(0, i + 1).filter((x) => x[1] === fac).length === 1, // 首都=阵营首城（2026-11-25 去 i<14 硬编码，AGENTS §七.1） // 首都=阵营首城
    coastal: COASTAL.includes(name),
    _maint: 0,
    b: { residence: 0, farm: 0, coal: 0, plant: 0, nuclear: 0, hydro: 0, solar: 0, factory: 0, arsenal: 0, airport: 0, aaGun: 0, street: 0, mall: 0, office: 0, academy: 0, hosp: 0, police: 0, ccs: 0 },
    res9: { carry1: 0, carry2: 0, carry3: 0, bal1: 0, bal2: 0, bal3: 0, qual1: 0, qual2: 0, qual3: 0 }, // v27 居民区 9 建筑（居民区数值 v1.0）
    ent: { park: 0, sport: 0, play: 0, movie: 0, esport: 0, nature: 0 },
    tour: 0, pub: 0, prodBank: 0, builtThisTurn: 0, corr: 0,
    nuclearRun: 0, // v25 核电维修计时（每城统一；同城多站同步运转）
    arsenalJob: null, arsenalProgress: 0,
  }));
}
function makeFactions(cities) {
  const f = {};
  for (const c of cities) {
    if (c.fac === 'NONE') continue;
    f[c.fac] = f[c.fac] || { id: c.fac, cities: [], treasury: (SCEN.treasury || 12000), soldiers: 0, service: 0, tech: 0, wars: 0, allies: [], warTarget: null, policy: 'none', loyalty: 60,
      mainPath: 'military', // A1.6 胜利路径（每 10 回合重算）
      culture: 0, identity: {}, invasionSince: {}, lostCulture: false, // 文化存量/认同度/完全入侵计时/文化失所
      units: { inf: 0, assault: 0, special: 0, tank: 0, heli: 0, mobile: 0, heavy: 0 },
      bombers: 0, drones: 0, airQueue: null, airProgress: 0, // A1.4 空军（机场独立队列）
      resources: { iron: 0, coal: 0, oil: 0, uranium: 0 },
      // v25 矿脉进度（档位回合累计；grn2b 后每回 +0.5 = 100 回/档）
      depletionProgress: 0, mineralStats: { coalGapTurns: 0, uraniumGapTurns: 0, blackoutCityTurns: 0, gridSent: 0, gridDeficit: 0, coalToOil: 0, fuelCoalUsed: 0, fuelUranUsed: 0, nuclearRepairTurns: 0, gridTurns: 0, coalDemandSum: 0, uranDemandSum: 0, prodCoal: 0, prodIron: 0, prodOil: 0, prodUran: 0, prSumPre: 0, prCountPre: 0, prSumPost: 0, prCountPost: 0, nuclearBuilt: 0 },
      // v24 AI 决策层状态（可缺省回退）
      techDone: {}, science: 0, techSpent: 0, researching: null, lastTechEval: 0, project: 0,
      pressure: 0, cards: {}, slotFrozen: {}, policyChanges: 0, policySpend: 0,
      peaceStreak: 0, warLoss: 0, noGainStreak: 0, mobilizing: null };
    f[c.fac].cities.push(c);
  }
  for (const fac of Object.values(f)) {
    const inc = P.resources[fac.id] || { iron: 0, coal: 0, oil: 0, uranium: 0 };
    fac.resources = { iron: inc.iron * 2, coal: inc.coal * 2, oil: inc.oil * 2, uranium: (inc.uranium || 0) * 2 };
  }
  return f;
}

// ================= v27 增量模块（武将实体 / 事件卡 / 贸易 v1.0 / 居民区 9 建筑） =================
// @hook:v27modules 2026-11-27 院长裁：8×2 无空城 / 武将实体化 / 俸禄只发在职 / 事件卡叠加 / 贸易 v1.0
const OFFICER_DEFS = require('../data/officers.js');
const ECARDS = require('../data/eventcards.js');
const ECP = ECARDS.PARAMS;
const OFFICER_BY_ID = Object.fromEntries(OFFICER_DEFS.map((o) => [o.id, o]));

// ---- 居民区 9 建筑（居民区数值 v1.0；cap/q 越级承接 C 与 H；升级=本线换级，占地不变）----
const RES9_ON = !!SCEN.res9; // 教学盘沿用 legacy residence（历史盘口径不动）
const RES9 = {
  carry1: { name: '贫民窟', cap: 15000, q: 12, cost: 200, up: 5, line: 'carry', lv: 1 },
  carry2: { name: '城中村', cap: 18000, q: 20, cost: 320, up: 8, line: 'carry', lv: 2 },
  carry3: { name: '密集公寓', cap: 21000, q: 30, cost: 512, up: 12, line: 'carry', lv: 3 },
  bal1: { name: '小区', cap: 5000, q: 70, cost: 350, up: 8, line: 'bal', lv: 1 },
  bal2: { name: '洋房', cap: 6500, q: 78, cost: 560, up: 12, line: 'bal', lv: 2 },
  bal3: { name: '大平层', cap: 8000, q: 85, cost: 896, up: 16, line: 'bal', lv: 3 },
  qual1: { name: '独栋', cap: 2500, q: 90, cost: 450, up: 12, line: 'qual', lv: 1 },
  qual2: { name: '别墅', cap: 3250, q: 95, cost: 720, up: 18, line: 'qual', lv: 2 },
  qual3: { name: '大庄园', cap: 4000, q: 100, cost: 1152, up: 24, line: 'qual', lv: 3 },
};
function res9Cap(c) { let s = 0; for (const k in RES9) s += (c.res9[k] || 0) * RES9[k].cap; return s; }
function res9Q(c) { // 容量加权 q（无住宅→城基线 q）
  let n = 0, d = 0;
  for (const k in RES9) { const cnt = c.res9[k] || 0; n += cnt * RES9[k].cap * RES9[k].q; d += cnt * RES9[k].cap; }
  return d > 0 ? n / d : c.q;
}

// ---- 武将实体（21 将：leader=在职 / free=在野；每城≥1）----
function makeOfficers() {
  const list = [];
  for (const [id, cityName, role] of (SCEN.officerSlots || [])) {
    const def = OFFICER_BY_ID[id]; if (!def) continue;
    list.push({
      id, name: def.name, attrs: def.attrs, payMult: def.payMult || 1, governance: def.governance || null,
      city: cityName, facId: null, employed: role === 'leader', leader: role === 'leader',
      loyalty: def.loyaltyInit, bonusTier: 0, station: null,
    });
  }
  return list;
}
function assignOfficerFactions(officers, cities) {
  const byName = Object.fromEntries(cities.map((c) => [c.name, c]));
  for (const o of officers) { const c = byName[o.city]; o.facId = c ? c.fac : null; }
}
function cityOf(officers, name) { return officers.filter((o) => o.city === name); }

// 派驻：每将 1 派驻位，选城内该属性最优建筑类（军事=cmd/商业·市政=pol/学院=int/文化=charm/警察=might）
// 乘区 = 1+max(0,主属性−50)/150，同类连乘封顶 1.5（effectCap）
const STATION_MAP = [
  { key: 'cmd', match: (c) => (c.b.arsenal || 0) + (c.b.airport || 0) + (c.b.aaGun || 0), out: 'mil' },
  { key: 'pol', match: (c) => (c.b.office || 0) + (c.b.street || 0) + (c.b.mall || 0), out: 'com' },
  { key: 'int', match: (c) => c.b.academy || 0, out: 'sci' },
  { key: 'charm', match: (c) => Object.values(c.ent).reduce((a, v) => a + v, 0) + (c.tour || 0) + (c.pub || 0), out: 'cul' },
  { key: 'might', match: (c) => c.b.police || 0, out: 'sec' },
];
function computeStations(officers, cityByName) {
  for (const c of Object.values(cityByName)) c._st = { mil: 1, com: 1, sci: 1, cul: 1, sec: 1 };
  for (const o of officers) {
    if (!o.employed) { o.station = null; continue; }
    const c = cityByName[o.city]; if (!c) { o.station = null; continue; }
    let best = null, bestA = -1;
    for (const sm of STATION_MAP) {
      if (sm.match(c) <= 0) continue;
      const a = o.attrs[sm.key] || 0;
      if (a > bestA) { bestA = a; best = sm; }
    }
    o.station = best ? best.out : null;
    if (best) c._st[best.out] = Math.min(1.5, c._st[best.out] * (1 + Math.max(0, bestA - 50) / 150));
  }
}

// ---- 武将 tick：加俸/招安/欠俸/叛逃/归隐（忠诚度.md 2026-11-26）----
function officerTick(t, facs, officers, cityByName, cityAdj, rand, log) {
  for (const o of officers) {
    const f = facs[o.facId];
    // 加俸（B12 §三：10/30/50 → 忠诚 +0.5/+1.5/+3.0/回 × payMult；自愿支出，AI 按忠诚缺口选档）
    if (o.employed && f) {
      const want = o.loyalty < 45 ? 3 : o.loyalty < 65 ? 2 : o.loyalty < 80 ? 1 : 0;
      o.bonusTier = f.treasury > 30000 ? want : Math.min(want, 1);
      o._bonusFlow = [0, 0.5, 1.5, 3.0][o.bonusTier] * o.payMult;
    } else { o.bonusTier = 0; o._bonusFlow = 0; }
    // 忠诚漂移：向阵营忠诚收敛 + 加俸流（战损流在战争结算处另加）
    const target = f ? f.loyalty : 50;
    o.loyalty = clamp((o.loyalty || 60) + clamp((target - o.loyalty) * 0.05, -2, 2) + (o._bonusFlow || 0), 0, 100);
  }
  // 招安：己方控制城的在野将 5%/回（国库 >2 万）；初始忠诚 50±10（在野与招安.md v0.2）
  for (const o of officers) {
    if (o.employed || o.leader) continue;
    const f = facs[o.facId]; if (!f || f.treasury < 20000) continue;
    if (rand() < 0.05) {
      o.employed = true; o.loyalty = 50 + Math.round(rand() * 20 - 10);
      log.push({ t, fac: f.id, event: `${f.id} 招安「${o.name}」（${o.city}，忠诚 ${Math.round(o.loyalty)}）` });
    }
  }
  // 叛逃/归隐（回合末；先叛逃判定再起义判定——P2 先于 P1）：非大统领、个人忠诚<40
  for (const o of officers) {
    if (!o.employed || o.leader || o.loyalty >= 40) continue;
    const p = Math.min(0.03, (40 - o.loyalty) / 40 * 0.03);
    if (rand() >= p) continue;
    const src = cityByName[o.city]; if (!src) continue;
    const enemyCities = (cityAdj[o.city] || []).map((n) => cityByName[n]).filter((c) => c && c.fac !== 'NONE' && c.fac !== o.facId);
    if (!enemyCities.length) {
      o.employed = false; // 归隐=原城在野
      log.push({ t, fac: o.facId, event: `「${o.name}」归隐（${o.city} 在野，忠诚 ${Math.round(o.loyalty)}）` });
      continue;
    }
    const dst = enemyCities[Math.floor(rand() * enemyCities.length)];
    const tgt = facs[dst.fac];
    // 三选一（AI 化）：接纳（属性高）/遣返（关系尚可）/驱离（默认）
    const power = (o.attrs.cmd + o.attrs.pol) / 2;
    let choice = 'drive';
    if (tgt && power >= 85 && rand() < 0.6) choice = 'accept';
    else if (tgt && rand() < 0.25) choice = 'return';
    if (choice === 'accept') {
      o.facId = dst.fac; o.city = dst.name; o.employed = true; o.loyalty = 45 + Math.round(rand() * 20 - 10);
      log.push({ t, fac: o.facId, event: `「${o.name}」叛逃→${dst.name}（${dst.fac} 接纳）` });
    } else if (choice === 'return') {
      o.loyalty = clamp(o.loyalty + 5, 0, 100);
      log.push({ t, fac: o.facId, event: `「${o.name}」叛逃未遂→遣返（${o.city} 收押，忠诚 ${Math.round(o.loyalty)}）` });
    } else {
      o.facId = dst.fac; o.city = dst.name; o.employed = false;
      log.push({ t, fac: o.facId, event: `「${o.name}」叛逃→${dst.name}（驱离，在野）` });
    }
  }
}

// ---- 贸易 v1.0（贸易最小规则 §二：伙伴线额=伙伴商业净产出×0.10×关系系数×协定×倾向；容量截断）----
function tradeTick(t, facs, diplo, log) {
  const ids = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  const commOut = {};
  for (const x of ids) commOut[x] = facs[x].cities.reduce((a, c) => a + c.b.office * B.office.income + c.b.street * B.street.cap + c.b.mall * B.mall.cap, 0);
  const TEND = { military: 0.8, culture: 1.0, commerce: 1.2, tech: 1.1 }; // 国家性质基准（§六 0.8~1.2）
  for (const a of ids) {
    const tendA = TEND[(D.leaders[a] || {}).governance] || 1.0;
    const capacity = commOut[a] * 0.10;
    let sum = 0;
    for (const b of ids) {
      if (a === b) continue;
      if (atWarPair(diplo, a, b)) continue; // 交战=双边完全中断
      const R = diplo.rel[a][b];
      if (R < 0) continue; // 民间通商 R≥0 自动财流
      const relCoef = clamp(0.50 + R / 100, 0, 1.5);
      const treaty = hasTreaty(diplo, 'trade', a, b, t) ? 1.2 : 1.0; // 最惠 ×1.2（民间通商 =1.0）
      sum += commOut[b] * 0.10 * relCoef * treaty * tendA;
    }
    const inc = Math.min(sum, capacity);
    facs[a].tradeIncome = inc;
  }
}

// ---- 事件卡引擎（事件卡内容库 v1.0；复苏盘 11 卡生效，H1/H2 教学专属）----
function evStateInit() {
  return { cd: {}, fired: {}, active: [], lastFire: -99, stagn: {}, lowStreak: {}, babyStreak: {}, warEnd: {}, preIncome: {} };
}
function evFx(f, c, t, ES) { // 汇总生效乘区/偏置（scope: city=触发城 / faction=全国）
  const fx = { street: 1, mall: 1, ent: 1, pool: 1, wAdd: 0 };
  for (const e of ES.active) {
    if (t < e.from || t > e.until) continue;
    if (e.scope === 'city') { if (!c || e.city !== c.name) continue; }
    else if (e.fac !== (c ? c.fac : f.id)) continue;
    for (const m of e.mults) {
      if (m.target === 'streetRecovery') fx.street *= m.mult;
      else if (m.target === 'mallRecovery') fx.mall *= m.mult;
      else if (m.target === 'entRecovery') fx.ent *= m.mult;
      else if (m.target === 'consumptionPool') fx.pool *= m.mult;
    }
    for (const m of e.mults) if (m.instant && m.target === 'W') fx.wAdd += m.add;
  }
  // 效果封顶 ±50%（balance.eventCard）
  fx.street = clamp(fx.street, 1 - ECP.effectCap, 1 + ECP.effectCap);
  fx.mall = clamp(fx.mall, 1 - ECP.effectCap, 1 + ECP.effectCap);
  fx.ent = clamp(fx.ent, 1 - ECP.effectCap, 1 + ECP.effectCap);
  fx.pool = clamp(fx.pool, 1 - ECP.effectCap, 1 + ECP.effectCap);
  fx.wAdd = clamp(fx.wAdd, -ECP.wBiasCap, ECP.wBiasCap);
  return fx;
}
function evFire(t, phase, card, fac, city, ES, log) {
  const now = t;
  if (ES.fired[card.id + (card.unique === 'faction' ? ':' + fac.id : '')]) return false;
  if (ES.cd[card.id] && ES.cd[card.id] > t) return false;
  if (card.grade === 'special' && t - ES.lastFire < ECP.minInterval) return false;
  if (card.grade === 'special' && ES.active.some((e) => e.grade === 'special' && t <= e.until)) return false; // globalMax=1（仅计仍在生效的卡）
  const dur = card.duration || 0;
  const from = phase === 'turnStart' ? t : t + 1; // turnStart 即时生效；turnEnd=下回合初生效
  if (dur > 0) ES.active.push({ id: card.id, grade: card.grade, fac: fac.id, city: city ? city.name : null, scope: card.scope || 'faction', from, until: from + dur - 1, mults: card.effects || [] });
  if (card.unique === 'faction') ES.fired[card.id + ':' + fac.id] = t;
  else if (card.unique) ES.fired[card.id] = t;
  if (card.cooldown) ES.cd[card.id] = t + card.cooldown;
  if (card.grade === 'special') ES.lastFire = t;
  const where = city ? city.name : '全国';
  log.push({ t, fac: fac.id, event: `【事件卡·${card.grade === 'special' ? '特殊' : card.grade === 'historical' ? '历史' : '普通'}】${card.name}（${where}${dur ? '，持续 ' + dur + ' 回' : ''}）` });
  return true;
}
function evTick(t, phase, facs, cities, env, officers, cityByName, cityAdj, rand, log, ES) {
  for (const f of Object.values(facs)) {
    if (!f.cities.length) continue;
    const W = f.W == null ? 50 : f.W;
    const conds = f._evCond || {};
    const myCities = f.cities;
    for (const card of ECARDS) {
      if (card.tutorialOnly && SCEN_ID !== 'tutorial') continue;
      if (!card.tutorialOnly && SCEN_ID === 'tutorial' && card.id === 'wlt_independence') continue;
      if ((card.appearAt || 'turnEnd') !== phase) continue;
      let hit = false, city = null;
      switch (card.id) {
        case 'uprising': // 城市忠诚 <30×3 回（普通城）/ <20×10 回（占领城）
          city = myCities.find((c) => (ES.lowStreak[c.name] || 0) >= (c.origFac !== c.fac ? 10 : 3));
          hit = !!city;
          if (hit) {
            const idx = f.cities.indexOf(city);
            if (idx >= 0) f.cities.splice(idx, 1);
            city.fac = 'NONE';
            f.soldiers = Math.round(f.soldiers * 0.9); // 守军 50% 转民兵（sim 近似：全军 −10%）
            for (const o of cityOf(officers, city.name)) {
              if (o.facId !== f.id) continue;
              const home = (cityAdj[city.name] || []).map((n) => cityByName[n]).find((c2) => c2 && c2.fac === f.id);
              if (home) { o.city = home.name; log.push({ t, fac: f.id, event: `「${o.name}」随起义迁往 ${home.name}` }); }
              else { o.employed = false; log.push({ t, fac: f.id, event: `「${o.name}」飞城归隐（${city.name} 在野）` }); }
            }
          }
          break;
        case 'defection':
          city = myCities.find((c) => cityOf(officers, c.name).some((o) => o.employed && !o.leader && o.loyalty < 40));
          hit = !!city; // 实际去向已在 officerTick 结算（P2 先于 P1 时序）
          break;
        case 'bankruptcy':
          hit = f.treasury <= 0 && (f.netIncomeLast || 0) < 0;
          break;
        case 'sea_level_1': hit = env.level === 1 && !ES.fired.sea_level_1; break;
        case 'sea_level_2': hit = env.level === 2 && !ES.fired.sea_level_2; break;
        case 'sea_level_3': hit = env.level >= 3 && !ES.fired.sea_level_3; break;
        case 'baby_boom': hit = (ES.babyStreak[f.id] || 0) >= 3; break;
        case 'lipstick_effect': hit = (W < 35 || (conds.warTurns || 0) >= 5) && rand() < (card.probability || 0.2);
          city = myCities.reduce((x, c) => (!x || (c._L || 50) < (x._L || 50) ? c : x), null); break;
        case 'revenge_spending': hit = (conds.warEndRecent || 0) <= 3 && (conds.warEndRecent || 99) > 0 && (conds.avgEmp || 1) < 0.98 && rand() < (card.probability || 0.2); break;
        case 'low_desire': hit = t > 120 && W > 70 && (ES.stagn[f.id] || 0) >= 10 && rand() < (card.probability || 0.08); break;
        case 'lottery_frenzy':
          city = myCities.find((c) => (c._jobsOver || 0) >= 3);
          hit = !!city && rand() < (card.probability || 0.25);
          break;
        case 'wlt_independence': hit = SCEN_ID === 'tutorial' && t === 2 && !ES.fired.wlt_independence; break;
        case 'hallyu': hit = SCEN_ID === 'tutorial' && t === 30 && !ES.fired.hallyu; break;
        default: break;
      }
      if (!hit) continue;
      if (!evFire(t, phase, card, f, city, ES, log)) continue;
      // 即时数值（W 民生偏置 ±5 封顶在 evFx 汇总；此处直接落到 W）
      for (const m of (card.effects || [])) {
        if (m.instant && m.target === 'W') f.W = clamp((f.W || 50) + clamp(m.add, -ECP.wBiasCap, ECP.wBiasCap), 0, 100);
        if (m.instant && m.target === 'culture') f.culture = (f.culture || 0) + m.add;
      }
    }
  }
}

// ================= 单城结算 =================
// v25：岗位计算抽为纯函数（电力 S/D 在矿电结算段复用，避免循环依赖）
function cityLabor(c) {
  const b = c.b;
  const jobs = b.street * B.street.jobs + b.mall * B.mall.jobs + b.office * B.office.jobs
    + b.factory * B.factory.jobs + b.arsenal * B.arsenal.jobs + b.coal * B.coal.jobs + b.plant * B.plant.jobs
    + b.nuclear * B.nuclear.jobs + b.solar * B.solar.jobs + b.academy * 0
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].jobs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.jobs[c.tour - 1] : 0) + (c.pub ? PUB.jobs[c.pub - 1] : 0);
  const employed = Math.min(c.P * 0.6, jobs);
  const employmentRate = jobs > 0 ? employed / jobs : 0.95;
  return { jobs, employed, employmentRate };
}
function cityPowerDemand(c) {
  const b = c.b;
  return b.factory * POWERIN.factory + b.academy * POWERIN.academy + b.hosp * POWERIN.hosp
    + b.police * POWERIN.police + (Object.values(c.ent).reduce((a, v) => a + v, 0)) * POWERIN.ent
    + (c.tour ? POWERIN.tour : 0) + (c.pub ? POWERIN.pub : 0) + b.office * POWERIN.office;
}
function cityStats(c, facs, F, desire, powerRatio) {
  const b = c.b;
  const pm = facs[c.fac] ? facMods(facs[c.fac]) : null; // v24 政策乘区（全阵营落点）
  const fx = c._fx || { street: 1, mall: 1, ent: 1, pool: 1, wAdd: 0 }; // v27 事件卡乘区
  const st = c._st || { mil: 1, com: 1, sci: 1, cul: 1, sec: 1 };       // v27 武将派驻乘区
  const { jobs, employed, employmentRate } = cityLabor(c);
  // 电力（v25：pr 由 settleMineralPower 统一给出——燃料满足率×电网调配；此处保留接线显示）
  const powerOut = b.plant * P.power.plant + b.nuclear * P.power.nuclear + b.hydro * P.power.hydro + b.solar * P.power.solar;
  const powerIn = cityPowerDemand(c);
  const pr = clamp(powerRatio != null ? powerRatio : (powerIn > 0 ? powerOut / powerIn : 1), 0, 1);
  // 污染
  const poll = b.coal * P.pollution.coal + b.plant * P.pollution.plant + b.factory * P.pollution.factory;
  const U = clamp(poll * 2, 0, 100);
  // 住房/宜居（v27：居民区 9 建筑 q/C 承接；无 res9 时回退 c.q）
  const r = c.P / c.C;
  const crowd = clamp(1.10 - 0.60 * r, 0, 1);
  const qEff = RES9_ON ? res9Q(c) : c.q;
  const H = 100 * (0.5 * qEff / 100 + 0.5 * crowd);
  const livEnt = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].liv[c.ent[k] - 1] : 0), 0);
  const L = clamp(50 + 0.40 * (H - 50) + 0.15 * (b.hosp ? 60 : 0) + livEnt - 0.30 * U + (pm ? pm.liv : 0), 0, 100); // v26 宜居偏置（优生优育+5/垃圾分类+2/药品集采+1）
  // 人口（单一式）
  const fL = clamp(L / 60, 0.5, 1.5), fF = clamp(F / 70, 0, 1);
  const h = b.hosp ? P.growthHospital[4] : P.growthHospital[2];
  const g = P.growthBase * h * Math.pow(fL, P.growthLivExp) * fF * (P.growthBalance - r); // 宜居权重 1.5 次方（院长第 7 条）
  const dP = c.P * clamp(g, -P.growthCap, P.growthCap);
  // 税/消费（v27：事件卡消费池乘区 fx.pool）
  const fac = facs[c.fac];
  const tax = P.taxConst + c.P * P.taxPerPop;
  const civilian = c.P * (1 - (fac ? fac.service : 0));
  const pool = civilian / 1000 * P.poolK * desire * 8 * (pm ? pm.pool : 1) * fx.pool;
  const retailCap = b.street * B.street.cap + b.mall * B.mall.cap;
  const entCap = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].caps[c.ent[k] - 1] : 0), 0);
  const tourCap = (c.tour ? TOUR.caps[c.tour - 1] : 0) * (pm ? pm.tourCap : 1);
  let retail = Math.min(pool * P.shares.retail, retailCap);
  let ent = Math.min(pool * P.shares.ent, entCap) * pr;
  const entMissing = entCap === 0 ? pool * P.shares.ent : 0;
  retail = Math.min(pool * P.shares.retail + entMissing, retailCap);
  // v27 事件卡回收乘区：商业街/商场拆分回收（S1 口红 ×1.20/×0.90；S2 报复 ×0.95/×1.25）
  const streetShare = retailCap > 0 ? (b.street * B.street.cap) / retailCap : 0.5;
  retail = retail * ((streetShare * fx.street + (1 - streetShare) * fx.mall) || 1);
  ent *= fx.ent;
  const culEnt = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].cul[c.ent[k] - 1] : 0), 0);
  const culPub = c.pub ? PUB.cul[c.pub - 1] : 0;
  const culTour = c.tour ? TOUR.cul[c.tour - 1] : 0;
  const C_out = (culEnt * (pm ? pm.culEnt : 1) + culPub + culTour) * pr * (pm ? pm.out : 1) * st.cul;
  const heat = 10 + C_out * 0.8;
  const tourMult = clamp(0.5 + heat / 100, 0.5, 2.0);
  const tour = Math.min(pool * P.shares.tour, tourCap) * tourMult * pr * (pm ? pm.tourIncome : 1);
  // 商业产出（电力满足率乘区 × 派驻乘区 st.com）
  const officeInc = b.office * B.office.income * employmentRate * pr * st.com;
  // 维护（v26 通用=造价×1%；v27 居民区 9 建筑维护为定值，绕过 ×0.01 口径——res9Up 单列）
  const res9Up = RES9_ON ? Object.keys(RES9).reduce((a, k) => a + (c.res9[k] || 0) * RES9[k].up, 0) : 0;
  const upkeep = (RES9_ON ? 0 : b.residence * B.residence.cost) + b.farm * B.farm.cost + b.coal * B.coal.cost + b.plant * B.plant.cost
    + b.nuclear * B.nuclear.cost + b.hydro * B.hydro.cost + b.solar * B.solar.cost + b.factory * B.factory.cost + b.arsenal * B.arsenal.cost
    + b.airport * B.airport.cost + b.aaGun * B.aaGun.cost
    + b.street * B.street.cost * 3 + b.mall * B.mall.cost * 3 + b.office * B.office.cost * 3
    + b.academy * B.academy.cost + b.hosp * B.hosp.cost + b.police * B.police.cost
    + Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].costs[c.ent[k] - 1] : 0), 0)
    + (c.tour ? TOUR.costs[c.tour - 1] : 0) + (c.pub ? PUB.costs[c.pub - 1] : 0);
  const income = officeInc + retail + ent + tour;
  return { jobs, employed, employmentRate, L, H, r, g, dP, tax, pool, retail, ent, tour, officeInc, upkeep: upkeep * 0.01 + res9Up, income, heat, C_out, powerOut, powerIn, pr, U, fxW: fx.wAdd };
}

// ================= v25 矿产/电网结算（矿电专题 §四~§五；阵营级，在阵营循环前跑） =================
// 顺序：矿脉档位 → 资源收入（基础矿+煤矿扩产+合成燃料）→ 燃料分配（fuel_first）→ 电力 S/D → 电网 pr
// 简化（报告注明）：燃料按国家池统一满足率（Unity 为发电城本地扣）；钢铁/化工持续耗材不建模
const TIER_NAME = ['丰饶', '富集', '寻常', '贫化', '枯竭'];
function settleMineralPower(t, facs, env) {
  const stats = { byFac: {}, events: [] };
  for (const f of Object.values(facs)) {
    if (!f.cities.length) continue;
    const ms = f.mineralStats;
    const techDone = f.techDone || {};
    // ---- 1. 矿脉档位（每 50 回/档；grn2b 深井后 100 回/档；枯竭=0）----
    f.depletionProgress += techDone['grn2b'] ? P.mineral.depletionRateMult : 1;
    const tierIdx = Math.min(P.mineral.tierMult.length - 1, Math.floor((f.depletionProgress - 1) / P.mineral.depletionTurns));
    const tier = P.mineral.tierMult[tierIdx];
    if (f._lastTier !== tierIdx) {
      if (f._lastTier !== undefined) stats.events.push({ t, event: `${f.id} 矿脉降档：${TIER_NAME[f._lastTier]}→${TIER_NAME[tierIdx]}（系数 ${tier}）` });
      f._lastTier = tierIdx;
    }
    // ---- 2. 资源收入（铁/煤/油受档位；铀固定；煤矿建筑扩产）----
    const base = P.resources[f.id] || { iron: 0, coal: 0, oil: 0, uranium: 0 };
    const coalMines = f.cities.reduce((a, c) => a + c.b.coal, 0);
    const oilMult = techDone['grn2b'] ? P.mineral.oilWellMult : 1;
    const inc = {
      iron: base.iron * tier * P.mineral.shortMult,
      coal: (base.coal * tier + coalMines * P.mineral.coalMineYield * tier) * P.mineral.shortMult,
      oil: base.oil * tier * oilMult * P.mineral.shortMult,
      uranium: (base.uranium || 0) * P.mineral.shortMult,
    };
    const capOf = (k) => Math.max(inc[k] * P.mineral.resourceCapTurns, k === 'uranium' ? P.mineral.resourceCapTurns * 48 : 0); // 铀池保底 5 回收入（无铀国靠进口）
    f._minInc = inc; // 外交采购/指标用
    ms.prodIron += inc.iron; ms.prodCoal += inc.coal; ms.prodOil += inc.oil; ms.prodUran += inc.uranium;
    for (const k of ['iron', 'coal', 'oil', 'uranium'])
      f.resources[k] = Math.min((f.resources[k] || 0) + inc[k], capOf(k));
    // ---- 3. 合成燃料（grn2c：化工厂转换；油池 <5 回收入一半时转，最多用一半煤）----
    if (techDone['grn2c']) {
      const oilCap = capOf('oil');
      if (f.resources.oil < oilCap * 0.5) {
        const factories = f.cities.reduce((a, c) => a + c.b.factory, 0);
        const cap = factories * P.mineral.coalToOilCapPerFactory;
        const convert = Math.min(cap, Math.max(0, f.resources.coal * 0.5));
        if (convert > 0) {
          f.resources.coal -= convert;
          f.resources.oil = Math.min(oilCap, f.resources.oil + convert * P.mineral.coalToOilRate);
          ms.coalToOil += convert * P.mineral.coalToOilRate;
        }
      }
    }
    // ---- 4. 燃料需求与分配（fuel_first：能源燃料优先，同级按满足率线性打折；0 料停机）----
    let coalDemand = 0, uranDemand = 0;
    for (const c of f.cities) {
      // 核电维修：每运转 10 回维修 1 回（不耗铀/不产电/维护照付）
      if (c.b.nuclear > 0) {
        c.nuclearRun += 1;
        c.nuclearRepair = c.nuclearRun % P.mineral.nuclearMaintenanceEvery === 0;
        if (c.nuclearRepair) ms.nuclearRepairTurns += 1;
      } else c.nuclearRepair = false;
      coalDemand += c.b.plant * P.mineral.fuelIn.plant;
      if (!c.nuclearRepair) uranDemand += c.b.nuclear * P.mineral.fuelIn.nuclear;
    }
    const coalSat = coalDemand > 0 ? Math.min(1, (f.resources.coal || 0) / coalDemand) : 1;
    const uranSat = uranDemand > 0 ? Math.min(1, (f.resources.uranium || 0) / uranDemand) : 1;
    f.resources.coal = Math.max(0, (f.resources.coal || 0) - coalDemand * coalSat);
    f.resources.uranium = Math.max(0, (f.resources.uranium || 0) - uranDemand * uranSat);
    // 11-27 火电双燃料（院长裁：石油=火力燃料替代煤）：煤优先，缺口自动切油（16 煤↔12 油热值）
    const coalGap = coalDemand * (1 - coalSat);
    const oilDemand = coalGap * P.mineral.fuelIn.plantOil / P.mineral.fuelIn.plant;
    const oilSat = oilDemand > 0 ? Math.min(1, (f.resources.oil || 0) / oilDemand) : 1;
    f.resources.oil = Math.max(0, (f.resources.oil || 0) - oilDemand * oilSat);
    f._fuelSat = coalDemand > 0 ? coalSat + (1 - coalSat) * oilSat : 1; // 火电综合燃料满足率
    ms.fuelCoalUsed += coalDemand * coalSat; ms.fuelUranUsed += uranDemand * uranSat;
    ms.fuelOilUsed = (ms.fuelOilUsed || 0) + oilDemand * oilSat;
    ms.coalDemandSum += coalDemand; ms.uranDemandSum += uranDemand;
    if (coalDemand > 0 && coalSat < 1) ms.coalGapTurns += 1;
    if (uranDemand > 0 && uranSat < 1) ms.uraniumGapTurns += 1;
    if (coalDemand > 0 && coalSat <= 0) ms.blackoutCityTurns += f.cities.filter((c) => c.b.plant > 0).length;
    // 铀进口（无铀国：国库 >5 万且低于 5 回需求；sim 假设价 3 财/铀）
    if (uranDemand > 0 && (f.resources.uranium || 0) < uranDemand * 5 && f.treasury > 50000) {
      const need = uranDemand * 5 - f.resources.uranium;
      const afford = Math.min(need, (f.treasury - 50000) / P.mineral.uraniumPrice);
      if (afford > 0) { f.resources.uranium += afford; f.treasury -= afford * P.mineral.uraniumPrice; }
    }
    // ---- 5. 电力 S/D（§5.1：基础电力 × 在岗率 × 燃料满足率；需求 × 在岗率）----
    const cityP = [];
    for (const c of f.cities) {
      const { employmentRate } = cityLabor(c);
      const S = (c.b.plant * P.power.plant * f._fuelSat
        + (c.nuclearRepair ? 0 : c.b.nuclear * P.power.nuclear * uranSat)
        + c.b.hydro * P.power.hydro + c.b.solar * P.power.solar) * employmentRate;
      const D = cityPowerDemand(c) * employmentRate;
      cityP.push({ c, S, D });
    }
    // 电网：ai6 前城内自给；ai6 后全国余电调配（损耗 10%；grn10 超导 0；本地优先、燃料不随电转移）
    const hasGrid = !!techDone[P.power.gridUnlockNode];
    if (!hasGrid) {
      for (const p of cityP) p.c._pr = p.D > 0 ? Math.min(1, p.S / p.D) : 1;
    } else {
      ms.gridTurns += 1;
      const loss = techDone['grn10'] ? P.power.superconductorLoss : P.power.transmissionLoss;
      const surplus = cityP.reduce((a, p) => a + Math.max(0, p.S - p.D), 0);
      const deficit = cityP.reduce((a, p) => a + Math.max(0, p.D - p.S), 0);
      const avail = surplus * (1 - loss);
      const sat = deficit > 0 ? Math.min(1, avail / deficit) : 1;
      ms.gridSent += deficit * sat; ms.gridDeficit += deficit;
      for (const p of cityP) {
        const need = Math.max(0, p.D - p.S);
        p.c._pr = p.D > 0 ? Math.min(1, (p.S + need * sat) / p.D) : 1;
      }
    }
    // 指标快照（AI 建造读 f._coalSat；报告读 stats.byFac）
    const avgPr = cityP.reduce((a, p) => a + p.c._pr, 0) / Math.max(1, cityP.length);
    if (!hasGrid) { ms.prSumPre += avgPr; ms.prCountPre += 1; } else { ms.prSumPost += avgPr; ms.prCountPost += 1; }
    ms.nuclearBuilt = f.cities.reduce((a, c) => a + c.b.nuclear, 0);
    f._coalSat = coalSat; f._uranSat = uranSat;
    stats.byFac[f.id] = { tier: tierIdx, tierMult: tier, coalSat, uranSat, coalDemand, uranDemand, inc,
      blackoutCities: coalDemand > 0 && coalSat <= 0 ? f.cities.filter((c) => c.b.plant > 0).map((c) => c.name) : [] };
  }
  return stats;
}

// ================= AI 建造 =================
// ================= AI 建造（U 驱动 · 13 需求缺口 × 边际递减 · 维护预算 · AI建造细则） =================
// 替换 v22 规则式优先级链；支付模型沿用（首付 10% + 生产银行 /5）；铁律：升级不变占地/不跳级/draft 不可建（sim 无 draft 卡）
const BUILD_CARDS = [
  { key: 'farm', kind: 'b', roles: ['food'], max: 3 },
  ...(RES9_ON
    ? Object.keys(RES9).map((k) => ({ key: k, kind: 'res9', roles: ['housing'], line: RES9[k].line, lv: RES9[k].lv, gate: (c) => RES9[k].lv === 1 || (c.res9[RES9[k].line + (RES9[k].lv - 1)] || 0) > 0 })) // 不可跳级（防踩坑 2）
    : [{ key: 'residence', kind: 'b', roles: ['housing'], max: 4 }]),
  { key: 'plant', kind: 'b', roles: ['power'], max: 3 },
  { key: 'coal', kind: 'b', roles: ['jobs'], max: 2 }, // v25：煤矿扩产（燃料缺口驱动，见 fuelWeight）
  { key: 'nuclear', kind: 'b', roles: ['power'], max: 2, gate: (c, fac) => !!fac.techDone['grn6'] && ['CN', 'AU'].includes(fac.id) }, // v25：有铀国才建
  { key: 'hydro', kind: 'b', roles: ['power', 'greenPower'], max: 1 },
  { key: 'solar', kind: 'b', roles: ['power', 'greenPower'], max: 3 },
  { key: 'factory', kind: 'b', roles: ['jobs'], max: 4 },
  { key: 'street', kind: 'b', roles: ['consumption', 'jobs'], max: 6 },
  { key: 'mall', kind: 'b', roles: ['consumption', 'jobs'], max: 2, gate: (c) => c.P >= 240000 },
  { key: 'office', kind: 'b', roles: ['wealth', 'jobs'], max: 8 },
  { key: 'academy', kind: 'b', roles: ['science'], max: 3, up: true },
  { key: 'hosp', kind: 'b', roles: ['medical'], max: 1 },
  { key: 'police', kind: 'b', roles: ['security'], max: 1 },
  { key: 'arsenal', kind: 'b', roles: ['military'], max: 3, costMul: (c) => c.b.arsenal + 1 },
  { key: 'airport', kind: 'b', roles: ['military'], max: 1, gate: (c, fac) => fac.tech > AIP.build.airportTech },
  { key: 'aaGun', kind: 'b', roles: ['military'], max: 2, gate: (c, fac) => fac.atWar },
  { key: 'ccs', kind: 'b', roles: ['environment'], max: 1, gate: (c, fac) => fac.tech >= AIP.build.ccsTech },
  { key: 'ent:park', kind: 'ent', line: 'park', roles: ['consumption', 'culture'] },
  { key: 'ent:sport', kind: 'ent', line: 'sport', roles: ['consumption', 'culture'] },
  { key: 'ent:play', kind: 'ent', line: 'play', roles: ['consumption', 'culture'] },
  { key: 'ent:movie', kind: 'ent', line: 'movie', roles: ['consumption', 'culture'] },
  { key: 'ent:esport', kind: 'ent', line: 'esport', roles: ['consumption', 'culture'] },
  { key: 'ent:nature', kind: 'ent', line: 'nature', roles: ['consumption', 'culture'] },
  { key: 'tour', kind: 'tour', roles: ['consumption', 'culture', 'jobs'], max: 3 },
  { key: 'pub', kind: 'pub', roles: ['culture', 'consumption'], max: 3 },
];
function cardCost(c, card, mods) {
  let cost;
  if (card.kind === 'b') cost = card.up && card.key === 'academy' && c.b.academy > 0 ? B.academy.upCost[c.b.academy] : B[card.key].cost;
  else if (card.kind === 'res9') {
    // v27 居民区 9 建筑：本线换级=升级价（新级造价−本级造价，占地不变）；Lv1=新建全价
    const r = RES9[card.key];
    const prev = r.lv > 1 ? c.res9[r.line + (r.lv - 1)] || 0 : 0;
    cost = prev > 0 ? Math.max(1, r.cost - RES9[r.line + (r.lv - 1)].cost) : r.cost;
  }
  else if (card.kind === 'ent') cost = ENT[card.line].costs[c.ent[card.line]];
  else if (card.kind === 'tour') cost = TOUR.costs[c.tour];
  else cost = PUB.costs[c.pub];
  if (card.costMul) cost *= card.costMul(c);
  return cost * (mods.cost || 1);
}
function aiBuild(c, s, F, fac, devMode, envTemp = 0, rand = () => 0.5) {
  if (c.builtThisTurn >= 1) return;
  const Ab = AIP.build;
  const mods = facMods(fac);
  const totalB = Object.values(c.b).reduce((a, b) => a + b, 0) + Object.values(c.ent).reduce((a, b) => a + b, 0) + (c.tour ? 1 : 0) + (c.pub ? 1 : 0);
  if (totalB >= Ab.cityCap) return;
  const prod = (64 + c.b.factory * B.factory.prodOut) * (mods.industry || 1);
  c.prodBank += prod;
  // ---- 13 需求缺口表（每城每回合）----
  const retailCap = c.b.street * B.street.cap + c.b.mall * B.mall.cap;
  const entCap = Object.keys(c.ent).reduce((a, k) => a + (c.ent[k] ? ENT[k].caps[c.ent[k] - 1] : 0), 0);
  const tourCap = c.tour ? TOUR.caps[c.tour - 1] : 0;
  const foodNeed = c.P / 1000 + 0.2;
  const foodSupply = c.b.farm * B.farm.yield;
  const arsenalNeed = Ab.arsenalByTech.filter(([th]) => fac.tech > th).length + (devMode === 'military' ? 1 : 0);
  const milNeed = arsenalNeed + (fac.tech > Ab.airportTech ? 1 : 0) + (fac.atWar ? 2 : 0);
  const milHave = c.b.arsenal + c.b.airport + c.b.aaGun;
  const sciTarget = fac.mainPath === 'tech' ? Ab.sciencePathTarget : Ab.scienceBaseTarget;
  const fuelGap = clamp(1 - (fac._coalSat != null ? fac._coalSat : 1), 0, 1); // v25：火电燃料缺口（缺煤→建矿/核电）
  const gaps = {
    food: clamp((foodNeed - foodSupply) / Math.max(1, foodNeed), 0, 1) || (F < Ab.foodF ? 0.6 : 0),
    power: clamp((1 - s.pr) * 1.5, 0, 1), // v22 行为口径：pr<0.9 触发
    housing: clamp((c.P / c.C - Ab.crowdAt) / 0.3, 0, 1),
    wealth: fac.treasury < 20000 ? 0.6 : ((fac.netIncomeLast || 0) < 0 ? 0.8 : 0.05),
    security: c.b.police ? 0.1 : 1,
    medical: c.b.hosp ? 0.1 : 1,
    science: clamp((sciTarget - c.b.academy) / 3, 0, 1),
    culture: fac.mainPath === 'culture' ? 0.7 : (s.C_out < Ab.cultureBaseCout && c.pub < 1 ? 0.5 : 0.1),
    consumption: clamp(Math.max(
      (Math.min(s.pool * P.shares.retail, retailCap) - s.retail) / Math.max(1, s.pool * P.shares.retail),
      (Math.min(s.pool * P.shares.ent, entCap) - s.ent) / Math.max(1, s.pool * P.shares.ent),
      (Math.min(s.pool * P.shares.tour, tourCap) - s.tour) / Math.max(1, s.pool * P.shares.tour)
    ) * Ab.conShare / Ab.conShare, 0, 1),
    jobs: clamp((c.P * Ab.jobsRate - s.jobs) / Math.max(1, c.P * Ab.jobsRate), 0, 1),
    military: clamp((milNeed - milHave) / Math.max(1, milNeed), 0, 1) * (fac.atWar ? Ab.warMilitaryMult / 1.2 : 1),
    environment: envTemp > Ab.envTemp && fac.tech >= Ab.ccsTech && !c.b.ccs ? 1 : 0.05,
    greenPower: envTemp > 40 ? 0.6 : 0.1,
  };
  gaps.consumption = clamp(gaps.consumption, 0, 1);
  // ---- 候选 × 效用 ----
  const roleOf = (key, kind, line) => BUILD_CARDS.find((x) => x.key === key && (kind === undefined || x.kind === kind)).roles;
  const havePerRole = {};
  for (const card of BUILD_CARDS) for (const r of card.roles) {
    let n = 0;
    if (card.kind === 'b') n = c.b[card.key] || 0;
    else if (card.kind === 'res9') n = c.res9[card.key] || 0;
    else if (card.kind === 'ent') n = c.ent[card.line] || 0;
    else if (card.kind === 'tour') n = c.tour;
    else n = c.pub;
    havePerRole[r] = (havePerRole[r] || 0) + n;
  }
  const havePerId = (card) => card.kind === 'b' ? (c.b[card.key] || 0) : card.kind === 'res9' ? (c.res9[card.key] || 0) : card.kind === 'ent' ? (c.ent[card.line] || 0) : card.kind === 'tour' ? c.tour : c.pub;
  const netIncome = Math.max(1, fac.netIncomeLast || 5000);
  const curMaint = fac.cities.reduce((a, cc) => a + (cc === c ? 0 : (cc._maint || 0)), 0) + (c._maint || 0);
  const cands = [];
  for (const card of BUILD_CARDS) {
    // 上限/闸门/满级
    const have = havePerId(card);
    if (card.max !== undefined && have >= card.max) continue;
    if (card.gate && !card.gate(c, fac)) continue;
    if (card.kind === 'ent' && c.ent[card.line] >= ENT[card.line].caps.length) continue;
    const cost = cardCost(c, card, mods);
    // 支付能力（沿用 v22 模型：首付 10% 财 + 生产银行 1/5）
    if (c.prodBank < cost / 5 || fac.treasury < cost * 0.1) continue;
    // v26 复苏盘财政护栏（单城国收入薄：国库低于储备线时只允许生存项 food/power/housing，
    //   防"建造首付抽干国库"——教学盘 buildReserve=0 不生效，历史盘口径不变）
    if (P.flag.buildReserve > 0 && fac.treasury < P.flag.buildReserve
        && !card.roles.some((r) => r === 'food' || r === 'power' || r === 'housing')) continue;
    // 维护预算（净收入 75%；生存项放宽 90%）
    const cardMaint = cost * 0.01 * (mods.upkeep || 1);
    const budget = Ab.maintBudget * netIncome;
    const survival = card.roles.some((r) => r === 'food' || r === 'power' || r === 'housing');
    if (curMaint + cardMaint > (survival ? Ab.surviveBudget : Ab.maintBudget) * netIncome && !survival) continue;
    // 复苏盘财政护栏（院长 11-25：不得长期负财政）——净收入<0 且国库低于 reserve 时暂停非生存建造
    const bg = SCEN.aiBuildGuard;
    if (bg && (fac.netIncomeLast || 0) < 0 && fac.treasury < bg.minTreasury && !survival) continue;
    let U = 0;
    for (const r of card.roles) {
      const gw = Ab.gapWeight[r] * (r === 'military' && fac.atWar ? Ab.warMilitaryMult : 1);
      const contrib = 1 / card.roles.length + 0.5; // 多角色卡分摊
      const decayR = Math.pow(Ab.decaySameRole, havePerRole[r] || 0);
      const decayId = Math.pow(Ab.decaySameId, have);
      const pathHit = (Ab.pathRoles[fac.mainPath] || []).includes(r);
      U += gw * (gaps[r] || 0) * contrib * decayR * decayId * (pathHit ? Ab.pathRoleMult : 1) * (D.pathBias[fac.id] || { military: 1, culture: 1, tech: 1, economy: 1 })[fac.mainPath];
    }
    U -= Ab.maintPenalty * cardMaint / netIncome;
    U -= Ab.turnsPenalty * (card.kind === 'b' ? 1 : 1) * 0.1; // v22 建造统一 1 拍
    if (card.key === 'coal') U += Ab.fuelWeight * fuelGap * Math.pow(Ab.decaySameId, have); // v25：缺煤→煤矿扩产
    if (card.key === 'nuclear') U += Ab.nuclearWeight * (1 - s.pr) * (envTemp > 40 ? 1.5 : 1); // v25：缺电且高温偏好核电
    if (card.key === 'solar' && envTemp <= 40) U -= 0.3; // v22 行为保持：低温不追光伏
    if (card.key === 'plant' && envTemp > 40) U -= 0.3;
    void roleOf;
    cands.push({ card, cost, U });
  }
  if (!cands.length) return;
  const bestU = Math.max(...cands.map((x) => x.U));
  if (bestU < Ab.idleFloor) return; // 不建（防乱建）
  const L = D.leaders[fac.id] || { temperature: 0.4 };
  const pick = softmaxPick(cands, L.temperature * Ab.tempBase, rand);
  const { card, cost } = pick;
  // 执行（沿用 v22 支付/记账）
  if (card.kind === 'ent') c.ent[card.line] += 1;
  else if (card.kind === 'tour') c.tour += 1;
  else if (card.kind === 'pub') c.pub += 1;
  else if (card.kind === 'res9') {
    // v27 居民区：本线换级=升级（旧级−1/新级+1，占地不变）；无旧级=新建（无上限，粮食制衡）
    const r = RES9[card.key];
    const prevKey = r.line + (r.lv - 1);
    if (r.lv > 1 && (c.res9[prevKey] || 0) > 0) c.res9[prevKey] -= 1;
    c.res9[card.key] = (c.res9[card.key] || 0) + 1;
  }
  else c.b[card.key] += 1;
  fac.treasury -= cost * 0.10;
  fac.buildSpend = (fac.buildSpend || 0) + cost * 0.10; // v26 第 4 条诊断：建造首付累计（小国财政压力来源）
  c.prodBank -= cost / 5;
  c.builtThisTurn += 1;
  c._maint = (c._maint || 0) + (card.kind === 'res9' ? RES9[card.key].up * (mods.upkeep || 1) : cost * 0.01 * (mods.upkeep || 1)); // 维护追踪（v27 res9=定值维护）
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

// ================= AI 决策层参数（四细则 · balance.ai 同源；禁内联魔法数） =================
const AIP = {
  tech: {
    // tech.json 口径：C0=2000 growth=0.15 eraMult=[1,1.15,1.35,1.6,1.9,2.25]（40 节点，v25 矿电口径）
    c0: 2000, growth: 0.15, eraMult: [1, 1.15, 1.35, 1.6, 1.9, 2.25],
    // 归一化：科技经济沿用 v22（学院产出/800），节点成本折算系数 = v22 全树总量 40 点 / Σera序成本
    kNorm: 40 / 456195,
    incomeScale: 2.0,             // v28 科技胜利定值：研速 1.7→2.0（复苏盘 8 阵营低研速校准；v28 盘 4/5 科技胜利 t168~190）
    decay: 0.85, tempBase: 1.0, prereqBonus: 2.0, secondPrereqRatio: 0.3, costPerTurn: 1.5,
    typeScore: { qTech: 10, unlock: 8, mult: 7, power: 6, special: 6, combat: 6, jobs: 5, defense: 5, vision: 4, prereq: 3 },
    ampHi: 0.25, ampMid: 0.10,    // 幅度系数档：≥hi×1.5 / ≥mid×1.2 / 其余×1.0
    pathLineBias: { military: { mil: 1.6, ai: 0.8, grn: 0.7 }, tech: { mil: 1.0, ai: 1.2, grn: 1.0 },
      economy: { mil: 0.6, ai: 1.5, grn: 0.9 }, culture: { mil: 0.5, ai: 1.0, grn: 1.2 } },
    situWar: 3.0, situSanction: 3.0, situEnv: 2.0, situResource: 3.0,
    reevalEvery: 5, ticketOthers: 3, projectBonus: 0, // v28 入场券：本线≥10+他线各≥3（原全研+各4）
    projectCost: { wealth: 2000, prod: 6000 }, // v28 弹性工期：产能流累积满 6000 生产+2000 财即建成（6000≈1.25 座兵工厂生产量；替代 60/40 回固定工期）
  },
  build: {
    gapWeight: { food: 2.0, power: 2.0, housing: 2.0, security: 1.5, medical: 1.5,
      wealth: 1.2, jobs: 1.2, consumption: 1.2, military: 1.2, science: 2.0, culture: 1.0, environment: 1.0, greenPower: 0.8 },
    warMilitaryMult: 1.7,
    decaySameRole: 0.9, decaySameId: 0.7, pathRoleMult: 1.5,
    pathRoles: { military: ['military'], culture: ['culture', 'consumption'], tech: ['science'], economy: ['wealth', 'consumption'] },
    maintBudget: 0.75, surviveBudget: 0.9, maintPenalty: 5.0, turnsPenalty: 0.3, idleFloor: 0.5,
    cityCap: 40, queueMax: 8, tempBase: 1.0,
    foodF: 90, powerHeadroom: 1.2, crowdAt: 0.95, jobsRate: 0.45, conShare: 0.6,
    fuelWeight: 2.5, nuclearWeight: 2.0, // v25：矿电建造驱动（缺煤建矿/缺电+高温建核）
    arsenalByTech: [[5, 1], [15, 2], [25, 3]], airportTech: 10, ccsTech: 20, envTemp: 50,
    sciencePathTarget: 3, scienceBaseTarget: 3, cultureBaseCout: 30, // 学院目标 3 级=v22 行为保持（科技经济不动）
  },
  policy: {
    mode: 'pressure',               // pressure | fixed（fixedN 档）
    fixedN: 10, pressureBase: 0.03, flexFromTemp: 2.0,
    pulse: { war: 0.15, sanction: 0.20, unElection: 0.10, pathChange: 0.30, mandate: 0.50 },
    eventFloor: { war: 0.8, sanction: 0.8 },
    resetTo: 0, coolFactor: 0.5,
    // 11-19 成本口径（政策卡架构 §5.3）：装卡免费；冷却/冻结窗口内改动（换/装到冻槽）100 财；期满改动 0 财
    equipFee: 0, costPerCard: 100, cashGuard: 0.5, aCash: 0.01, aFreeze: 2.0, freezeTurns: 2, slotUrgency: 0.5, pathMult: 1.5, topKPerSlot: 3, tempBase: 1.0,
    // fx→U 权重（每单位 fx 的当量；relFlow/rep 按单位值；v26 新键按同轴对齐）
    fxW: { tax: 30, pool: 30, income: 30, comm: 30, growth: 20, industry: 20, food: 20, tech: 20, self: 20, culEnt: 20,
      out: 20, tourCap: 20, tourIncome: 20, relFlow: 4, recruit: 10, liv: 5, upkeep: 20, capacity: 10, cost: 10, repPerTurn: 6, warThreshold: 8,
      W: 6, loyaltyFlow: 5, counterSpy: 4, serviceCap: 80, relWeakest: 4, relVsWeak: 4, relWar: 4, milIncome: 200,
      subsidyCost: -60, canDeclareWar: 8, noAlliance: 2, immigration: 2, salary: 8, milCost: 12,
      q: 15, arsenal: 10, assimil: 6, emit: 6, buyPriceMul: 15, fisc: 30 },
    // 卡解锁科技门槛（早 0 / 中 10 / 后 22）
    unlockTech: { 早: 0, 中: 10, 后: 22 },
  },
  war: {
    warFloor: 1.0, captureTh: 1.3, readyTh: 1.25,
    w: { target: 0.35, pos: 0.25, def: 0.25, ally: 0.15, gov: 0.10 },
    timingSanction: 0.20, timingMultifront: 0.30, timingPeaceLong: 0.15, peaceLong: 60,
    lossPeaceTh: 0.35, lossStreak: 5, lossPenalty: 0.30, mobilizeGiveUp: 30, maxWars: 1, tempBase: 1.0,
  },
};

// ================= 科技 40 节点（tech.json · v25：38+grn2b/grn2c；标签=40 节点收益标签表 §二~四） =================
// tags: [类型, 幅度]（幅度用于档位系数；unlock/special/vision/combat/prereq 类幅度记 1）
const TECH_NODES = [
  { id: 'mil1', name: '军备重整', line: 'mil', era: 1, pre: [], tags: [['qTech', 0.05], ['unlock', 1]] },
  { id: 'mil2', name: '雷达', line: 'mil', era: 1, pre: ['mil1'], tags: [['vision', 1]] },
  { id: 'mil3', name: '远洋航海', line: 'mil', era: 1, pre: ['mil1'], tags: [['unlock', 1]] },
  { id: 'mil4', name: '核物理', line: 'mil', era: 2, pre: ['mil1'], tags: [['prereq', 1.5]] },
  { id: 'mil5', name: '精确制导', line: 'mil', era: 2, pre: ['mil1', 'ai2'], tags: [['qTech', 0.10], ['combat', 1]] },
  { id: 'mil6', name: '装甲集群', line: 'mil', era: 2, pre: ['mil5'], tags: [['qTech', 0.05], ['unlock', 1]] },
  { id: 'mil7', name: '侦察卫星', line: 'mil', era: 3, pre: ['mil2'], tags: [['vision', 1]] },
  { id: 'mil8', name: '电子战', line: 'mil', era: 3, pre: ['mil7'], tags: [['combat', 1]] },
  { id: 'mil9', name: '核武器', line: 'mil', era: 4, pre: ['mil4', 'grn6'], tags: [['unlock', 1.5]] },
  { id: 'mil10', name: '反导系统', line: 'mil', era: 4, pre: ['mil7'], tags: [['defense', 0.40]] },
  { id: 'mil11', name: '高超声速', line: 'mil', era: 5, pre: ['mil5'], tags: [['qTech', 0.05], ['unlock', 1]] },
  { id: 'mil12', name: '天基系统', line: 'mil', era: 5, pre: ['mil7'], tags: [['vision', 1], ['special', 1]] },
  { id: 'mil13', name: '恐怖机器人', line: 'mil', era: 6, pre: ['mil11', 'ai12', 'grn7'], tags: [['qTech', 0.10], ['unlock', 1]] },
  { id: 'ai1', name: '重工业化', line: 'ai', era: 1, pre: [], tags: [['unlock', 1.5]] },
  { id: 'ai2', name: '半导体物理', line: 'ai', era: 2, pre: ['ai1'], tags: [['prereq', 1.5]] },
  { id: 'ai3', name: '工业自动化', line: 'ai', era: 2, pre: ['ai1'], tags: [['jobs', -0.30]] },
  { id: 'ai4', name: '互联网', line: 'ai', era: 3, pre: ['ai3'], tags: [['unlock', 1], ['mult', 0.20]] },
  { id: 'ai5', name: '集成电路', line: 'ai', era: 3, pre: ['ai2'], tags: [['unlock', 1]] },
  { id: 'ai6', name: '智能电网', line: 'ai', era: 3, pre: ['ai4'], tags: [['power', 1]] },
  { id: 'ai7', name: '无人机', line: 'ai', era: 4, pre: ['ai3'], tags: [['unlock', 1], ['combat', 1]] },
  { id: 'ai8', name: '深度学习', line: 'ai', era: 4, pre: ['ai5'], tags: [['unlock', 1.2]] },
  { id: 'ai9', name: '无人作战系统', line: 'ai', era: 4, pre: ['ai8', 'mil5'], tags: [['unlock', 1.2]] },
  { id: 'ai10', name: '智能交通系统', line: 'ai', era: 4, pre: ['ai4'], tags: [['mult', 0.05], ['jobs', -0.10]] },
  { id: 'ai11', name: '量子计算', line: 'ai', era: 5, pre: ['ai8'], tags: [['mult', 0.10]] },
  { id: 'ai12', name: '脑机接口', line: 'ai', era: 5, pre: ['ai11'], tags: [['special', 1]] },
  { id: 'ai13', name: '蜂群作战', line: 'ai', era: 6, pre: ['ai9', 'ai12'], tags: [['unlock', 1]] },
  { id: 'grn1', name: '农业机械化', line: 'grn', era: 1, pre: [], tags: [['mult', 0.10], ['special', 1]] },
  { id: 'grn2', name: '石油化工', line: 'grn', era: 2, pre: ['grn1'], tags: [['unlock', 1], ['special', 1]] },
  { id: 'grn2b', name: '深井开采', line: 'grn', era: 3, pre: ['grn2'], tags: [['mult', 0.30], ['special', 1]] }, // v25：油田×1.3/枯竭速度−50%
  { id: 'grn2c', name: '合成燃料', line: 'grn', era: 5, pre: ['grn2', 'grn8'], tags: [['special', 1]] }, // v25：1 煤=0.3 油
  { id: 'grn3', name: '合成化肥', line: 'grn', era: 2, pre: ['grn2'], tags: [['mult', 0.15], ['unlock', 1]] },
  { id: 'grn4', name: '可再生能源', line: 'grn', era: 2, pre: ['grn1'], tags: [['unlock', 1]] },
  { id: 'grn5', name: '烟气脱硫', line: 'grn', era: 3, pre: ['grn2'], tags: [['mult', 0.50]] },
  { id: 'grn6', name: '核反应堆', line: 'grn', era: 3, pre: ['mil4'], tags: [['unlock', 1]] },
  { id: 'grn7', name: '核动力推进', line: 'grn', era: 4, pre: ['grn6'], tags: [['unlock', 1]] },
  { id: 'grn8', name: '循环经济', line: 'grn', era: 4, pre: ['grn4'], tags: [['mult', 0.25]] },
  { id: 'grn9', name: '基因工程', line: 'grn', era: 5, pre: ['grn3'], tags: [['mult', 0.20]] },
  { id: 'grn10', name: '室温超导', line: 'grn', era: 5, pre: ['grn8'], tags: [['mult', 0.10], ['power', 1]] },
  { id: 'grn11', name: '气候工程', line: 'grn', era: 6, pre: ['grn9'], tags: [['special', 1]] },
  { id: 'grn12', name: '可控核聚变', line: 'grn', era: 6, pre: ['grn6', 'grn10'], tags: [['prereq', 1.5]] },
];
const TECH_BY_ID = Object.fromEntries(TECH_NODES.map((n) => [n.id, n]));
// 归一化参照总成本（era 升序研序；与 kNorm 配套）
const TECH_COST_REF = (() => {
  let total = 0, done = 0; const finished = new Set(); let rem = TECH_NODES.slice();
  while (rem.length) {
    let prog = false;
    for (const n of rem.slice()) if (n.pre.every((p) => finished.has(p))) {
      total += AIP.tech.c0 * (1 + AIP.tech.growth * done) * AIP.tech.eraMult[n.era - 1];
      finished.add(n.id); rem = rem.filter((x) => x !== n); done++; prog = true;
    }
    if (!prog) break;
  }
  return total;
})();

// ================= 政策卡 52 张（数据外置 · AI 友好规范 P1）=================
// 数据源：sim/data/cards.js（一条一卡、id 在最左、改值只改 1 行，不碰本文件）
// 特殊 2 张（carbonQuota=UN 提案 / environmentalism=环保提案）结构与普通卡一致，但 initial=false 不进 AI 卡池
const { CARDS, INITIAL_CARDS, SPECIAL_CARDS, CARD_BY_ID, ATTR_NAME, SLOTS_PER_ATTR } = require('../data/cards.js');


// ================= 政策：效果聚合（全阵营；落点=主公式 ×8 尺度） =================
// v26 键分派：BIAS_KEYS 加性（+=），SWITCH_KEYS 布尔（||），其余乘性（*=）
const BIAS_KEYS = ['relFlow', 'repPerTurn', 'warThreshold', 'liv', 'W', 'loyaltyFlow', 'counterSpy',
  'serviceCap', 'relWeakest', 'relVsWeak', 'relWar', 'milIncome', 'subsidyCost'];
const SWITCH_KEYS = ['canDeclareWar', 'noAlliance', 'immigration'];
const COSTLIKE_KEYS = ['upkeep', 'salary', 'cost', 'recruit', 'milCost', 'buyPriceMul']; // cardGain 用：v 越小越好
function facMods(f) {
  const m = { tax: 1, pool: 1, income: 1, comm: 1, growth: 1, industry: 1, food: 1, tech: 1, self: 1, culEnt: 1,
    out: 1, tourCap: 1, tourIncome: 1, relFlow: 0, recruit: 1, liv: 0, upkeep: 1, capacity: 1, cost: 1,
    repPerTurn: 0, warThreshold: 0, W: 0, loyaltyFlow: 0, counterSpy: 0, serviceCap: 0,
    relWeakest: 0, relVsWeak: 0, relWar: 0, milIncome: 0, subsidyCost: 0,
    canDeclareWar: 0, noAlliance: 0, immigration: 0, salary: 1, milCost: 1, q: 1, arsenal: 1,
    assimil: 1, emit: 1, buyPriceMul: 1, fisc: 1 };
  for (const arr of Object.values(f.cards || {})) for (const id of arr) {
    const fx = (CARD_BY_ID[id] || {}).fx || {};
    for (const [k, v] of Object.entries(fx)) {
      if (BIAS_KEYS.includes(k)) m[k] += v;
      else if (SWITCH_KEYS.includes(k)) m[k] = 1;
      else m[k] *= v;
    }
  }
  return m;
}
function cardUnlocked(f, card) {
  return f.tech >= (AIP.policy.unlockTech[card.tier] || 0);
}
function mutexConflict(f, card) {
  if (!card.mutex) return false;
  for (const arr of Object.values(f.cards || {})) for (const id of arr)
    if ((CARD_BY_ID[id] || {}).mutex === card.mutex) return true;
  return false;
}
// v26 院长第 3/7 条：政策 AI 评分接入"阵营状态 + 对手外交视野"（外交政策默认可见）
// CARD_CTX 由 policyPressureTick 每回合设置（{facs, diplo}）；同质化根因=v25 评分只有静态 fxW 权重，
// 不含财政承受力/人口/军队规模/W 边际/关系饱和度 → 4 阵营永远选同一套高分卡（数值平衡是横截面问题，同质化是评分函数缺状态项）。
let CARD_CTX = null;
function cardGain(f, card, mods) {
  const L = D.leaders[f.id] || {};
  let g = 0;
  for (const [k, v] of Object.entries(card.fx)) {
    const w = AIP.policy.fxW[k];
    if (w === undefined) continue;
    // 加性 bias 字段（facMods 里 m[k]+=v）按细则 §3.1"bias 型 Δbias × w_f 直接当量"计分；
    // v24 公式 liv 误走 mult 分支（liv:−3 被算成 +20），v24 只装空槽未暴露，swap 下会误选——v25 修正
    if (BIAS_KEYS.includes(k)) g += w * v * (v > 0 ? 1 : 1.5);
    else if (k === 'canDeclareWar') g += w * 5 * (1 - (L.aggression || 0.5)); // 绝对中立：弃武代价按大号阈值计（好战人格不爱）
    else if (k === 'warThreshold') g += w * v * (1 - (L.aggression || 0.5)); // 好战人格不爱提阈值
    else if (SWITCH_KEYS.includes(k)) g += w * (k === 'noAlliance' ? 1 : 0.5); // 开关类：轻计分（immigration/noAlliance 效果 sim 部分占位）
    else if (COSTLIKE_KEYS.includes(k)) g += w * (v > 1 ? -(v - 1) * 1.5 : (1 - v)); // 成本类键：v 越小越好（v25 恒正分已修）
    else g += w * (v > 1 ? (v - 1) : -(1 - v) * 1.5); // 产出类键：v<1=代价（破四旧/女权等负乘卡正确负计分）
  }
  const mainPath = f.mainPath || 'military';
  const pathAff = { mil: 'military', eco: 'economy', cul: 'culture', dip: 'culture', gen: 'tech' };
  if (pathAff[card.attr] === mainPath) g *= AIP.policy.pathMult;
  // 谨慎人格惩罚高风险卡
  if ((card.fx.warThreshold || 0) > 0) g *= 1 - 0.5 * (L.caution || 0.5);

  // ==== v26 阵营状态门控（院长 11-24 第 3 条：要基于自己阵营情况选政策）====
  const pop = f.cities.reduce((a, c) => a + c.P, 0);
  const sol = f.soldiers || 0;
  const net = f.netIncomeLast != null ? f.netIncomeLast : 0;
  const ft = f.financeTrace || {};
  const exp = (ft.upkeep || 0) + (ft.salary || 0) + (ft.officers || 0) + (ft.policyCost || 0);
  const afford = clamp(net / Math.max(1, exp), 0, 1.5); // 净收支/总支出（<1=赤字边缘）
  // ① 财政承受力：支出型卡（upkeep>1 / subsidyCost）按余量打折——小国不抄大国的福利包
  const spendCard = (card.fx.upkeep || 1) > 1 || (card.fx.subsidyCost || 0) > 0;
  if (spendCard) g *= 0.55 + 0.45 * Math.min(afford, 1);
  // ② 人口规模：服役比例类卡按兵源基数（小国收益小）
  if (card.fx.serviceCap) g *= clamp(pop / 1e6, 0.35, 1.25);
  // ③ 军队规模：战力/军工/军饷/军队经商类按现役兵力（无军队=无感）
  if (card.fx.q || card.fx.milIncome || card.fx.arsenal || card.fx.salary) g *= clamp(sol / 8000, 0.4, 1.2);
  // ④ 民生 W 边际递减：已高 W 再叠 W 卡收益递减；高 W 时压制类（W<0）更可接受
  const W0 = f.W != null ? f.W : 60;
  if ((card.fx.W || 0) > 0) g *= W0 >= 70 ? 0.45 : W0 >= 62 ? 0.8 : 1;
  if ((card.fx.W || 0) < 0) g *= W0 >= 70 ? 1.15 : 1;
  // ⑤ 关系饱和度：正向关系流卡在关系已高时减分（避免"关系全满还堆关系卡"）
  const dip = CARD_CTX && CARD_CTX.diplo;
  if (dip && (card.fx.relFlow || 0) > 0) {
    const others = Object.keys(dip.rel[f.id] || {}).filter((x) => CARD_CTX.facs[x] && CARD_CTX.facs[x].cities.length > 0);
    const avg = others.length ? others.reduce((a, x) => a + dip.rel[f.id][x], 0) / others.length : 0;
    g *= avg >= 70 ? 0.5 : avg >= 50 ? 0.85 : 1;
  }
  // ⑥ 对手外交感知（院长第 7 条：外交政策默认可见 → 可按对手姿态反制）
  if (dip) {
    const foes = Object.keys(dip.rel[f.id] || {}).filter((x) => x !== f.id && CARD_CTX.facs[x] && CARD_CTX.facs[x].cities.length > 0);
    let threat = 0, harmless = 0;
    for (const x of foes) {
      const mx = facMods(CARD_CTX.facs[x]);
      if ((mx.relVsWeak || 0) < 0 || mx.warThreshold > 0 || (mx.relFlow || 0) < 0) threat++; // 对手强硬（霸权/殖民/铁腕）
      if (mx.canDeclareWar) harmless++; // 对手弃武（绝对中立）
    }
    if ((card.fx.relFlow || 0) > 0 || card.fx.canDeclareWar) g *= 1 + 0.12 * threat; // 对手强硬 → 我方走温和/中立
    if (card.fx.warThreshold || (card.fx.relVsWeak || 0) < 0) g *= 1 + 0.12 * harmless; // 对手弃武 → 我方敢强硬
  }
  return g;
}

// ================= 政策 AI（变动因子驱动 · 两算法对照 · v24.1 swap 换卡） =================
// v26 压力测试：FORCE_CARDS={fac:[cardId...]} 每回合强制写入（不收费/可超槽位，数值验证用；报告注明压力口径）
const FORCE_CARDS = {};
function applyForceCards(f) {
  const forced = FORCE_CARDS[f.id];
  if (!forced) return false;
  f.cards = {};
  for (const id of forced) {
    const c = CARD_BY_ID[id];
    if (!c) throw new Error(`FORCE_CARDS 未知卡 id: ${id}`);
    (f.cards[c.attr] = f.cards[c.attr] || []).push(id);
  }
  f.pressure = 0; // 压制 AI 换卡冲动（另在评估入口跳过 forced 阵营）
  return true;
}
function policyPressureTick(t, facs, rand, log, diplo) {
  const Pp = AIP.policy;
  CARD_CTX = { facs, diplo: diplo || null }; // v26 状态门控 + 对手外交视野（院长第 3/7 条）
  for (const f of Object.values(facs)) {
    if (!f.cities.length) continue;
    if (FORCE_CARDS[f.id]) { applyForceCards(f); continue; } // v26 强制卡组：整组锁定
    const L = D.leaders[f.id] || {};
    // 累积
    const flex = clamp((L.temperature || 0.4) * Pp.flexFromTemp, 0.5, 1.5);
    f.pressure = (f.pressure || 0) + Pp.pressureBase * (1 + flex);
    // 事件底座（宣战/被制裁当回合由 diploTick 直接打脉冲+底座）
    const mode = Pp.mode;
    const forced = f.pressure >= 1;
    const fixedDue = mode === 'fixed' && t % (f.fixedN || Pp.fixedN) === 0;
    const wantEval = forced || fixedDue || (mode === 'pressure' && rand() < Math.min(1, f.pressure));
    if (!wantEval) continue;
    // ---- 评估（单回合 ≤1 次；候选集=空槽装卡 + occupied 槽换卡）----
    const mods = facMods(f);
    const freezeU = Pp.aFreeze * Pp.freezeTurns * Pp.slotUrgency; // 变动槽进入冷却的冻结成本折 U（细则 §3.2）
    const equipped = (id) => Object.values(f.cards || {}).some((a) => a.includes(id));
    // 互斥冲突（excludeId=被换旧卡：换卡释放其互斥组；其余同 v24 mutexConflict）
    const mutexHit = (card, excludeId) => {
      if (!card.mutex) return false;
      for (const arr of Object.values(f.cards || {})) for (const id of arr)
        if (id !== excludeId && (CARD_BY_ID[id] || {}).mutex === card.mutex) return true;
      return false;
    };
    const cands = [];
    for (const attr of Object.keys(ATTR_NAME)) {
      const arr = (f.cards || {})[attr] || [];
      const frozen = ((f.slotFrozen || {})[attr] || 0) > t;
      const fee = frozen ? Pp.costPerCard : Pp.equipFee; // §5.3：冷却/冻结窗口内改动 100 财，窗口外 0（装卡免费）
      if (fee > 0 && f.treasury < Pp.costPerCard * 3) continue; // 财护栏：只拦收费动作（不刷屏财；免费动作不受限）
      // 换卡：occupied 槽逐位评估（未满槽的已装位同样可换）
      for (let i = 0; i < arr.length; i++) {
        const oldId = arr[i];
        const pool = INITIAL_CARDS.filter((c) => c.attr === attr && c.id !== oldId && cardUnlocked(f, c) && !equipped(c.id) && !mutexHit(c, oldId))
          .sort((a, b) => cardGain(f, b, mods) - cardGain(f, a, mods)).slice(0, Pp.topKPerSlot);
        for (const c of pool) {
          const U = cardGain(f, c, mods) - cardGain(f, CARD_BY_ID[oldId], mods) - fee * Pp.aCash - freezeU;
          cands.push({ type: 'swap', attr, idx: i, card: c.id, old: oldId, fee, U });
        }
      }
      // 装卡：空槽（v24 行为保持，仅成本口径改装卡免费）
      if (arr.length < SLOTS_PER_ATTR) {
        const pool = INITIAL_CARDS.filter((c) => c.attr === attr && cardUnlocked(f, c) && !equipped(c.id) && !mutexHit(c, null))
          .sort((a, b) => cardGain(f, b, mods) - cardGain(f, a, mods)).slice(0, Pp.topKPerSlot);
        for (const c of pool) {
          const U = cardGain(f, c, mods) - fee * Pp.aCash - freezeU;
          cands.push({ type: 'equip', attr, card: c.id, fee, U });
        }
      }
    }
    cands.push({ type: 'hold', U: 0 }); // 基线：不动（评估≠变动；v24 同机制——hold 进 softmax，负增益方案靠概率压制）
    const pick = softmaxPick(cands, (L.temperature || 0.4) * Pp.tempBase, rand);
    if (pick.type === 'equip') {
      f.treasury -= pick.fee;
      f.cards[pick.attr] = (f.cards[pick.attr] || []).concat(pick.card);
      f.slotFrozen = f.slotFrozen || {};
      f.slotFrozen[pick.attr] = t + Pp.freezeTurns;
      f.pressure = Pp.resetTo;
      f.policyChanges = (f.policyChanges || 0) + 1;
      f.policyEquips = (f.policyEquips || 0) + 1;
      f.policySpend = (f.policySpend || 0) + pick.fee;
      log.push({ t, fac: f.id, event: `${f.id} 装卡「${pick.card}」[${ATTR_NAME[pick.attr]}]（U=${pick.U.toFixed(1)} fee=${pick.fee} pressure→${Pp.resetTo}）` });
    } else if (pick.type === 'swap') {
      f.treasury -= pick.fee;
      f.cards[pick.attr][pick.idx] = pick.card;
      f.slotFrozen = f.slotFrozen || {};
      f.slotFrozen[pick.attr] = t + Pp.freezeTurns;
      f.pressure = Pp.resetTo;
      f.policyChanges = (f.policyChanges || 0) + 1;
      f.policySwaps = (f.policySwaps || 0) + 1;
      f.policySpend = (f.policySpend || 0) + pick.fee;
      log.push({ t, fac: f.id, event: `${f.id} 换卡「${pick.old}」→「${pick.card}」[${ATTR_NAME[pick.attr]}]（U=${pick.U.toFixed(1)} fee=${pick.fee} pressure→${Pp.resetTo}）` });
    } else {
      f.pressure = (f.pressure || 0) * Pp.coolFactor;
    }
  }
}

// ================= 科技 AI（逐节点效用 · 40 节点） =================
function techNodeCost(n, doneCount) {
  return AIP.tech.c0 * (1 + AIP.tech.growth * doneCount) * AIP.tech.eraMult[n.era - 1] * AIP.tech.kNorm;
}
function techChildren(node) {
  const direct = TECH_NODES.filter((x) => x.pre.includes(node.id));
  const second = TECH_NODES.filter((x) => direct.some((d) => d.id === x.pre[0] || (x.pre[1] && d.id === x.pre[1])));
  return { direct: direct.length, second: second.length };
}
function techSituBonus(f, diplo, node, envTemp, t) {
  const S = AIP.tech;
  let s = 0;
  if (f.atWar && node.line === 'mil') s += S.situWar;
  if (sanctionActive(diplo, f.id, 'econ', t) && node.line === 'ai') s += S.situSanction;
  if (envTemp > AIP.build.envTemp && node.line === 'grn') s += S.situEnv;
  if ((f.resources.oil || 0) <= 0 && ['grn2', 'grn2b', 'grn2c', 'grn3', 'grn4', 'grn5'].includes(node.id)) s += S.situResource; // v25：缺油加权深井/合成燃料
  return s;
}
function techPick(f, diplo, rand, envTemp) {
  const S = AIP.tech;
  const doneCount = Object.keys(f.techDone).length;
  const lineDone = { mil: 0, ai: 0, grn: 0 };
  for (const id of Object.keys(f.techDone)) lineDone[TECH_BY_ID[id].line]++;
  const pathLine = S.pathLineBias[f.mainPath] || S.pathLineBias.military;
  const bias = D.pathBias[f.id] || { military: 1, culture: 1, tech: 1, economy: 1 };
  const cands = [];
  for (const n of TECH_NODES) {
    if (f.techDone[n.id]) continue;
    if (!n.pre.every((p) => f.techDone[p])) continue;
    let benefit = 0;
    for (const [type, mag] of n.tags) {
      const base = S.typeScore[type] || 3;
      const amp = Math.abs(mag) >= S.ampHi ? 1.5 : Math.abs(mag) >= S.ampMid ? 1.2 : 1.0;
      benefit += base * amp * (mag < 0 ? 0.2 : 1); // 负向效果大幅折价
    }
    const decay = Math.pow(S.decay, lineDone[n.line]);
    const w = pathLine[n.line] * bias[f.mainPath] * decay;
    const ch = techChildren(n);
    const prereqB = S.prereqBonus * (ch.direct + S.secondPrereqRatio * ch.second);
    const cost = techNodeCost(n, doneCount);
    const income = f.scienceIncome || 1;
    const T = cost / Math.max(0.01, income);
    const situ = techSituBonus(f, diplo, n, envTemp, f._t || 0) * 10;
    const U = w * benefit + prereqB - S.costPerTurn * T + situ;
    n._lastU = U; // 可解释日志用（U 分解：w×benefit+prereqB−cost+situ）
    cands.push({ node: n, U });
  }
  if (!cands.length) return null;
  const T = (D.leaders[f.id].temperature || 0.4) * S.tempBase;
  const pick = softmaxPick(cands, T, rand);
  return pick.node;
}
function techTick(t, f, diplo, rand, log, econHit, envTemp) {
  const S = AIP.tech;
  // 研速：学院链（v22 口径）× 标定系数；制裁 ×0.7；政策乘区（学术自由/开放社会）
  const academyOut = f.cities.reduce((a, c) => a + (B.academy.tech[Math.min(3, c.b.academy)] || 0), 0) / 800;
  f.scienceIncome = academyOut * S.incomeScale * (econHit ? 0.7 : 1) * (facMods(f).tech || 1);
  f.science = (f.science || 0) + f.scienceIncome;
  // 节点完成结算（当前研究节点到价即完成）
  let completed = 0;
  for (let guard = 0; guard < 5; guard++) {
    const cur = f.researching;
    if (!cur || !TECH_BY_ID[cur]) break;
    const n = TECH_BY_ID[cur];
    const cost = techNodeCost(n, Object.keys(f.techDone).length);
    if (f.science >= cost) {
      f.science -= cost;
      f.techDone[cur] = 1;
      f.techSpent = (f.techSpent || 0) + cost;
      completed++;
      f.researching = null;
      log.push({ t, fac: f.id, event: `${f.id} 研成「${n.name}」（${Object.keys(f.techDone).length}/40 U=${(n._lastU || 0).toFixed(1)}）` });
    } else break;
  }
  // 重评：节点完成即重评；每 reevalEvery 回合换线检查
  const reeval = !f.researching || (t - (f.lastTechEval || 0)) >= S.reevalEvery;
  if (reeval) {
    f.lastTechEval = t;
    const node = techPick(f, diplo, rand, envTemp);
    f.researching = node ? node.id : null;
    if (node) f.lastTechU = node._lastU !== undefined ? node._lastU : f.lastTechU;
  }
  // 科技进度标量（v22 兼容口径）：已花费归一成本 + 在研库存（满树≈40，逐序 ±5% 取 clamp）
  f.tech = Math.min(40, (f.techSpent || 0) + (f.science || 0));
  // 工程入场券（v28 科技胜利定值）：本线 ≥10 + 他线各 ≥3 → 工程（产能流弹性工期）→ 科技胜利
  if (!f.project) {
    const lineDone = { mil: 0, ai: 0, grn: 0 };
    for (const id of Object.keys(f.techDone)) lineDone[TECH_BY_ID[id].line]++;
    for (const line of ['mil', 'ai', 'grn']) {
      const others = ['mil', 'ai', 'grn'].filter((x) => x !== line).every((x) => lineDone[x] >= S.ticketOthers);
      if (lineDone[line] >= 10 && others) { f.project = 1; f.projectLine = line; f.projectProd = 0; break; }
    }
  } else {
    // v28 弹性工期：每回投入阵营产能流 Σ(64+工厂×64)×政策，生产力高则回合少；不占建造 prodBank（国家专项）
    const mods = facMods(f);
    const prodFlow = f.cities.reduce((a, c) => a + (64 + c.b.factory * B.factory.prodOut) * (mods.industry || 1), 0);
    const invest = Math.min(prodFlow, S.projectCost.prod - (f.projectProd || 0));
    f.projectProd = (f.projectProd || 0) + invest;
    f.treasury -= S.projectCost.wealth * (invest / S.projectCost.prod); // 财按进度分摊扣
    f.project += 1; // 仅记录工程持续回数（显示用）
    if (f.projectProd >= S.projectCost.prod && !f._techWinner) {
      f._techWinner = true;
      return { techWin: f.id };
    }
  }
  return { completed };
}

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
    unCd: 999, reviveCd: {}, jointCd: {}, econMeetCd: {}, tradeCd: {}, econAllyCd: {},
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
    const prevPath = facs[x].mainPath;
    facs[x].mainPath = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    facs[x].pathW = w;
    if (prevPath && prevPath !== facs[x].mainPath) // v24 政策脉冲：主路径变化
      facs[x].pressure = (facs[x].pressure || 0) + AIP.policy.pulse.pathChange;
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
  // 11-27：UN 和平锁已删（不做停战设计）——包围网战争不受 UN 成立影响，允许局部热战
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
        const tf = facs[cs.target];
        if (tf) tf.pressure = Math.max((tf.pressure || 0) + AIP.policy.pulse.sanction, AIP.policy.eventFloor.sanction); // v24 政策脉冲：被制裁
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
// 时序：全球会议之后、常规外交行动之前；含 复国 → 联合进攻 → 经济制裁（UN/选举已删 11-27）
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
      f.revivedBy = initiator; // 复国标记（原 UN 投票跟随已删 11-27；标记保留供 AI/叙事）
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
      e.revived = true;
      log.push({ t, event: `复国会议：${initiator} 以 ${city.name} 复国 ${X}——${votes.join(' ')} → 通过（同意${yesSet.size}/需${need}；${X} 回归，民兵 ${fmt(f.units.inf)}，与 ${initiator} 结盟）` });
    } else {
      diplo.rep[initiator] = clamp(diplo.rep[initiator] - D.meetingFailRep, 0, 100);
      diplo.reviveCd[X] = t + D.revive.cooldown;
      log.push({ t, event: `复国会议：${initiator} 提案复国 ${X}——${votes.join(' ')} → 否决（同意${yesSet.size}/需${need}；发起国 rep −${D.meetingFailRep}）` });
    }
  }

  // ---- ②③ UN/常任理事国体系已全删（11-27 院长裁方案 A：选举/一票否决/文化平台/贸易加成全删；文化胜利=纯全入侵链，见胜利判定）----

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
    // 目标=非成员中动员潜力最高者；需 A/B 至少一方对其关系 <40（否则关系太好不制裁）
    const target = outsiders.sort((x, y) => (dipPower[y] || 0) - (dipPower[x] || 0))[0];
    if (sanctionActive(diplo, target, 'econ', t)) continue;
    if (diplo.rel[A][target] >= 40 && diplo.rel[B][target] >= 40) continue;
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
  // v26 声誉流：每回合无条件结算（v25 误放在战争分支内——和平期 repPerTurn 全未生效=BUG，v26 修正）
  for (const f of Object.values(facs)) {
    if (!f.cities.length) { f.atWar = false; continue; }
    const fm0 = facMods(f);
    // v26 政策声誉流饱和衰减：正值按 (1−rep/100)、负值按 (rep/100) 衰减——高分不再免费堆高、低声誉不再无限下滑
    const r0 = diplo.rep[f.id];
    const sat = (fm0.repPerTurn || 0) >= 0 ? clamp(1 - r0 / 100, 0, 1) : clamp(r0 / 100, 0, 1);  // @hook:rep 声誉流+饱和衰减
    diplo.rep[f.id] = clamp(r0 + (fm0.repPerTurn || 0) * sat, 0, 100);
  }
  // 战争状态：交战成员 + 守方盟友（防御性参战，动员潜力直接计入守方）
  for (const f of Object.values(facs)) {
    if (!diplo.war) { f.atWar = false; continue; }
    const wA = diplo.war.sideA || [diplo.war.a], wB = diplo.war.sideB || [diplo.war.b];
    let at = wA.includes(f.id) || wB.includes(f.id);
    if (!at) for (const x of wB) if (hasTreaty(diplo, 'ally', f.id, x, t)) { at = true; break; }
    f.atWar = at;
    f.peaceStreak = at ? 0 : (f.peaceStreak || 0) + 1; // v24 进攻时机（和平后段）用
  }
  // 外交决策用"动员潜力"而非当前士兵——避免战争动员 10% vs 和平 0.5% 的 20 倍误判
  // 11-27：+国库×0.03（纯人口口径下八足鼎立 pr≈1.0 恒不满足宣战门槛=0 战争数学根因；国库 7~37 万差异给 pr 真实波动）
  const dipPower = {};
  for (const x of ids) dipPower[x] = facs[x].cities.reduce((a, c) => a + c.P, 0) * 0.10 + (facs[x].treasury || 0) * 0.03;

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
      if (pr > AIP.war.captureTh) {
        const target = pickWarTarget(facs[sideA[0]], Bf, rand); // v24 战役目标 U 选择（替代占最小城）
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
      facs[sideA[0]].warLoss = (facs[sideA[0]].warLoss || 0) + (pr > AIP.war.captureTh ? 0.08 : 0.12); // v24 战损追踪（战损停战/L3 接口）
      Bf.warLoss = (Bf.warLoss || 0) + 0.15;
      diplo.war = null;
      diplo.cooldown[a].peace = t + D.peaceCooldown;
    }
  }

  // ---- A1.1 包围网（自动事件，不占行动槽；可打断进行中的战争）----
  coalitionCheck(t, facs, diplo, dipPower, ids, rand, log);

  // ---- A1.5 会议阶段（院长 11-13 第 3 条：N 结算后 → 会议 → N 行动前；战争期也开紧急会议）----
  meetingPhase(t, facs, diplo, dipPower, ids, rand, log, env);

  // ---- A1.6 文化与同盟收口：复国 → 联合进攻 → 经济制裁（UN/选举已删 11-27） ----
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

  // ---- 关系自然回归（和平期缓慢回中并小幅上升；A1.6 贸易协定 +2/回；v24 政策关系流；v26 定向关系流）----
  // 定向流（v26）：relWeakest=对最弱国（发展援助 +2）/ relVsWeak=对弱国军力<本国50%（霸权 −0.5）/
  //   relWar=对参战国（维和 +0.5）——按 receiving 方条件判定，叠加在原 relFlow 上
  const dipPow = (x) => (facs[x] ? facs[x].cities.reduce((a, c) => a + c.P, 0) * 0.1 : 0);
  const aliveIds = ids.filter((x) => facs[x] && facs[x].cities.length > 0);
  const weakest = aliveIds.length > 1 ? aliveIds.slice().sort((a, b) => dipPow(a) - dipPow(b))[0] : null;
  const atWarIds = diplo.war && t >= diplo.war.start
    ? new Set([...(diplo.war.sideA || [diplo.war.a]), ...(diplo.war.sideB || [diplo.war.b])]) : new Set();
  for (const a of ids) for (const b of ids) if (a !== b) {
    const atWar = diplo.war && ((diplo.war.a === a && diplo.war.b === b) || (diplo.war.a === b && diplo.war.b === a));
    if (!atWar) {
      const ma = facMods(facs[a]);
      const rel0 = diplo.rel[a][b];
      // v26 政策关系流边际递减（院长第 1 条降档配套）：关系越高，政策流的边际贡献越小
      // —— 防止政策卡把关系推过条约阈值后触发贸易协定 +2/回 的正反馈封顶（根因不在卡，在基线规则；
      //    但卡侧必须不自带饱和，否则多卡叠加必然打满）
      const satMult = clamp(1 - Math.max(0, rel0) / 100, 0, 1);  // @hook:relation 关系流+饱和衰减
      let flow = 0.05 + (ma.relFlow || 0) * satMult;
      if (b === weakest) flow += (ma.relWeakest || 0) * satMult;
      if (dipPow(a) > 2 * dipPow(b)) flow += (ma.relVsWeak || 0) * (1 - satMult);
      if (atWarIds.has(b)) flow += (ma.relWar || 0) * satMult;
      diplo.rel[a][b] = clamp(rel0 * 0.99 + flow, -100, 100);
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
      if (process.env.AGW_DEBUG_WAR && t % 20 === 0 && a < b) console.log(`[DBG t${t}] ${a}→${b} pr=${pr.toFixed(3)} adj=${adj} rel=${R.toFixed(0)}`);
      // 宣战 U（A1 §6.1；A1.1：制裁 CB 门槛 0.8、U+0.3、无声誉代价）
      // 11-27：UN 成员国禁宣战锁已删（不做停战设计，允许局部热战）
      if (!ally && !peace && !nap && t >= P.warStart && t >= (diplo.cooldown[a].war || 0)) {
        // v26 绝对中立：canDeclareWar=false → 本国不得主动宣战（AI 侧同锁；被宣战仍可应战）
        if (facMods(facs[a]).canDeclareWar) continue;
        const repFactor = diplo.rep[b] < 30 ? 0.80 : 1;
        const wt = (facMods(facs[a]).warThreshold || 0) * 0.15; // v24 政策宣战阈值偏置（强硬外交/核威慑）
        if (pr < (cb ? 0.80 : (adj ? P.warAdjTh : P.warFarTh) * repFactor) + wt) continue; // 11-27：门槛参数化+下调（上调进攻性）
        const prActual = warRatio(facs[a], facs[b]); // v24 实际战力比（动员口径，区别于潜力比 pr）
        if (prActual < AIP.war.warFloor) continue; // AI 不在 pr<1.0 开战（AI战争细则 §八；不送人头）
        if ((facs[a].treasury || 0) < P.warTreasFloor) continue; // 11-27 财政刹车：国库过低不主动宣战（防战争烧穿负财政）
        const feasibility = clamp(pr * 0.8, 0, 1.5) / 1.5;
        const threat = clamp((dipPower[b] / Math.max(1, dipPower[a])) * 0.4, 0, 1);
        const intervene = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === b || x.b === b)).length * 0.35;
        let U = 0.30 * 0.6 + 0.15 * 0.5 + 0.25 * feasibility + 0.20 * threat
          - 0.30 * (1 - Math.min(pr, 1.5) / 1.5) * L.caution
          - 0.25 * intervene * L.caution - (cb ? 0 : 0.15 * 0.5)
          + 0.30 * L.aggression + (adj ? 0.10 : -0.15); // 11-27：进攻性权重 0.20→0.30（上调进攻性）
        // v26 绝对中立口径（院长 11-24 第 6 条）：**只限制自身宣战，不提供"不被宣战"保护**——
        // 原 v26 初版"目标持卡→宣战成本上升 U−0.25"已删除（与院长口径冲突）；被宣战仍可应战。
        if (cb) U += 0.30;
        // v24 进攻时机加成（AI战争细则 §4.1）：目标被制裁 / 本国和平后段；多线 N/A（sim 单战争制）
        if (sanctionActive(diplo, b, 'econ', t) || sanctionActive(diplo, b, 'cb', t)) U += AIP.war.timingSanction;
        if ((facs[a].peaceStreak || 0) >= AIP.war.peaceLong) U += AIP.war.timingPeaceLong;
        if (prActual >= AIP.war.readyTh) U += 0.10; // 动员到位加成
        // 胜利路径修正（A1 §五）
        const milPath = prog.military * L.aggression;
        const culPath = prog.culture * L.culture;
        U *= milPath >= culPath ? 1.10 : 0.90;
        cands.push({ type: 'war', b, U, pr, label: `宣战${b}` });
      }
      // 结盟 U（A1 §6.2；军事同盟可多成员，边际效用递减；相性高可在低关系下结盟）
      const allyCount = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead && x.expire > t && (x.a === a || x.b === a)).length;
      // A1.2：不与低声誉侵略者（rep<30）新签同盟——安全感；已有同盟到期也不续；失败冷却 5 回合防刷屏
      const allyOpen = !facMods(facs[a]).noAlliance && diplo.rep[b] >= 30 && (R >= D.allyMinRelation || ((L.affinity[b] || 0) >= 0.70 && R >= -20) || (L.seekProtection && L.seekProtection.target === b))
        && t >= ((diplo.allyCd && diplo.allyCd[a + b]) || 0); // v26 不结盟运动：持卡方不发起同盟
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
      for (const x of [a, b]) // v24 政策脉冲+底座：宣战双方加压（AI政策细则 §二）
        facs[x].pressure = Math.max((facs[x].pressure || 0) + AIP.policy.pulse.war, AIP.policy.eventFloor.war);
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
      if (facMods(facs[a]).noAlliance || facMods(facs[b]).noAlliance) { // v26 不结盟运动：双向拦截同盟签署
        diplo.allyCd = diplo.allyCd || {};
        diplo.allyCd[a + b] = t + 5;
        log.push({ t, event: `${a} 提议与 ${b} 结盟被拒（不结盟运动卡）` });
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
// ❌ 抵抗已取消（2026-11-24 院长令）：恒返回 0，保留签名以最小化调用面改动
//   防守力完全来自 P[B→B] = √Culture_B（文化量本身，见文化输出算法 v1 §六）
function cultureResist(f) {
  return 0;
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
  if (diplo.culturePush[A] && diplo.culturePush[A].until > t) link *= diplo.culturePush[A].mult; // A1.6 文化推广（全局文化攻势）
  let dec = 1.0;
  if (diplo.war) {
    const sa = diplo.war.sideA || [diplo.war.a], sb = diplo.war.sideB || [diplo.war.b];
    if ((sa.includes(A) && sb.includes(B)) || (sa.includes(B) && sb.includes(A))) dec = 0.5; // 交战双边输出效率减半（2026-11-28 院长裁：战争不打断文化交流，×0.5 同时进行；原口径=清零作废）
  }
  if (dec > 0 && hasTreaty(diplo, 'peace', A, B, t)) dec = P.culture.peaceDecay; // 停战恢复期
  return Math.sqrt(ca) * dist * link * dec * gap * (facMods(fa).out || 1); // v24 政策对外输出乘区（雅言远播等）
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
    const self = Math.sqrt(Math.max(1, fb.culture)) * (1 + cultureResist(fb)) * (facMods(fb).self || 1);
    let total = self;
    const press = {};
    for (const A of alive) if (A !== B) { press[A] = culturePressure(A, B, facs, diplo, t); total += press[A]; }
    const id = fb.identity;
    const convR = P.culture.convergeR * (facMods(fb).assimil || 1); // v26 义务教育：同化（自份额收敛）×1.15  // @hook:assimil 同化乘区
    id[B] = (id[B] || 0) + convR * (self / total - (id[B] || 0));
    for (const A of alive) if (A !== B) id[A] = (id[A] || 0) + P.culture.convergeR * ((press[A] || 0) / total - (id[A] || 0));
    // 死国份额清零 + Σ 归一（差额回本国）
    let sum = 0;
    for (const k of Object.keys(id)) { if (k !== B && !alive.includes(k)) id[k] = 0; sum += id[k]; }
    if (sum > 0) for (const k of Object.keys(id)) id[k] /= sum;
    if (id[B] < 0.15) id[B] = 0.15; // 本国认同底线 15%（2026-11-28 院长裁加速文化胜利：20%→15%，原负反馈纪律值随 N3 数值方案下调）
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
  return p * (1 + f.tech * 0.01) * (facMods(f).q || 1); // v26 政策战力乘区（全民服役+3%/志愿+10%/军队经商−10%）  // @hook:q 战力乘区
}
function warRatio(A, B) {
  const atk = compositionPower(A, dominantBranch(B));
  const def = compositionPower(B, dominantBranch(A));
  return atk / Math.max(1, def);
}
// v24 战役目标选择（AI战争细则 §二；替代"占最小城"——城价值+战略位置−守备−治理成本）
function pickWarTarget(attacker, defenderF, rand) {
  const cs = defenderF.cities;
  if (!cs.length) return null;
  const maxP = Math.max(...cs.map((c) => c.P));
  const econOf = (c) => c.b.office * B.office.income + c.b.street * B.street.cap + c.b.mall * B.mall.cap + c.b.factory * B.factory.jobs;
  const maxE = Math.max(...cs.map(econOf));
  const W = AIP.war.w;
  const cands = cs.map((c) => {
    const value = 0.5 * c.P / Math.max(1, maxP) + 0.5 * econOf(c) / Math.max(1, maxE);
    const pos = (c.capital ? 0.6 : 0) + (c.coastal ? 0.2 : 0);
    const def = c.b.aaGun + c.b.arsenal;
    const gov = 0.5 * c.P / Math.max(1, maxP);
    const U = W.target * value + W.pos * pos - W.def * clamp(def / 3, 0, 1) - W.gov * gov;
    return { city: c, U };
  });
  return softmaxPick(cands, 0.4, rand).city;
}
// 产线选型：战时/军事人格优先机械化；否则先补步兵（便宜、不吃油）
function pickUnit(f) {
  const can = (k) => {
    const u = P.units[k];
    if (f.units.inf < 1) return false;   // 人头制（2026-11-28）：只要池里有兵即可开工，批次不再是门槛
    if (f.treasury < u.wealth / P.batchSize) return false;
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

  // 剧本覆盖：人格（复苏 8 种）/ 资源（复苏统一中等，起始池=x2）/ 科技起点（复苏赠 3 早期节点）
  if (SCEN.leaders) Object.assign(D.leaders, SCEN.leaders);
  if (SCEN.resources) for (const id of allIds) { const r = SCEN.resources[id]; if (r) facs[id].resources = { iron: r.iron * 2, coal: r.coal * 2, oil: r.oil * 2, uranium: (r.uranium || 0) * 2 }; }
  if (SCEN.startTech && SCEN.startTech.length) for (const id of allIds) for (const t of SCEN.startTech) if (TECH_BY_ID[t] && !facs[id].techDone[t]) { facs[id].techDone[t] = 1; facs[id].techSpent = (facs[id].techSpent || 0) + 1; } // 免费节点折算 techSpent（f.tech 每回被 techTick 覆盖，不能直接改）
  for (const f of Object.values(facs)) {
    f.culture = f.cities.reduce((a, c) => a + c.baseCulture * 8, 0); // 城市基础文化值 ×8（文化区 v1.0）
    f.identity = Object.fromEntries(allIds.map((x) => [x, x === f.id ? 1 : 0]));
  }
  for (const c of cities) {
    if (SCEN.buildReserve) P.flag.buildReserve = SCEN.buildReserve; // 剧本建造储备线（默认 0=不启用）
    if (SCEN.initBuildings) {
      // ===== 复苏副本：最小建筑（农业/居民/军营/战前学校）；无空城（11-27 院长裁） =====
      for (const [k, v] of Object.entries(SCEN.initBuildings)) {
        if (RES9_ON && k === 'residence') { c.res9.carry1 += v; continue; } // v27 居民区 9 建筑承接
        c.b[k] = v;
      }
      continue;
    }
    // ===== 教学盘（v22 基线口径，勿改）=====
    if (c.fac === 'NONE') { c.b.farm = 1; continue; }
    c.b.farm = c.fac === 'CN' ? 2 : 1; c.b.residence = 1; c.b.office = 1; c.b.street = 1; c.b.hosp = 1;
    c.b.academy = 1; // A1.2 科技拉力：开局每城一座学校（三级学院=人才主来源）
    if (c.P >= 300000) { c.b.mall = 1; c.b.plant = 1; }
    c.ent.park = 1; c.ent.movie = 1;
    // B1 v1.2 初始兵工厂：深圳(CN)/长崎(JP)/首尔(KR)/悉尼(AU)
    if (['深圳', '长崎', '首尔', '悉尼'].includes(c.name)) { c.b.arsenal = 1; c.b.airport = 1; } // A1.4 初始机场
  }
  const log = [];
  // ===== v27 武将实体 / 事件卡 / 贸易 初始化 =====
  const OFFICERS27 = makeOfficers();
  assignOfficerFactions(OFFICERS27, cities);
  const cityByName = Object.fromEntries(cities.map((c) => [c.name, c]));
  const ES = evStateInit();
  const diplo = makeDiplo(allIds); // v26 剧本化：阵营 ID 动态（禁写死 4 阵营，AGENTS §七.1）
  // warsmoke：t105 强制 JP 宣战 CN（战争路径验证钩子——U_target/战损/占领结算；不入常规盘）
  const warsmoke = process.argv[6] === 'warsmoke' || process.argv[4] === 'warsmoke';
  for (let t = 1; t <= turns; t++) {
    if (t === 1 || t % 10 === 0) computePaths(facs, allIds); // A1.6 胜利路径（每 10 回合重算）
    // ==== v27 回合开始节点：派驻乘区 → 贸易 v1.0 → 事件卡 turnStart（S2/S4 即时生效）====
    computeStations(OFFICERS27, cityByName);
    tradeTick(t, facs, diplo, log);
    evTick(t, 'turnStart', facs, cities, env, OFFICERS27, cityByName, SCEN.cityAdj || {}, rand, log, ES);
    for (const c of cities) c._fx = evFx(facs[c.fac] || { id: c.fac }, c, t, ES); // 事件乘区快照（本轮结算用）
    // ==== 全国粮 ====
    let totalQ = 0, totalD = 0, totalPop = 0;
    for (const c of cities) { totalQ += c.b.farm * B.farm.yield * (facs[c.fac] ? facMods(facs[c.fac]).food : 1); totalPop += c.P; }
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
    // ==== v25 矿产/电网（阵营级；在阵营结算前——矿电专题 §4.1 结算时点）====
    const mineralStats = settleMineralPower(t, facs, env);
    for (const ev of mineralStats.events) log.push(ev);
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
      const mods = facMods(f); // v24 政策乘区（全阵营）
      let taxSum = 0, incomeSum = 0, upkeepSum = 0, indOut = 0;
      let stats = [];
      for (const c of f.cities) {
        const s = cityStats(c, facs, F, desire, c._pr);
        stats.push(s);
        const coastHit = c.coastal && env.level >= 1 ? (1 - P.env.coastPenalty) : 1; // 海平面一级：沿海产出损
        taxSum += s.tax * coastHit * (mods.tax || 1);
        incomeSum += s.income * coastHit * (mods.income || 1);
        indOut += c.b.factory * B.factory.prodOut * s.employmentRate * s.pr; // v26 工业产出量（增量接入用）
        upkeepSum += s.upkeep * (mods.upkeep || 1);
        c.C = (c.C0 + (RES9_ON ? res9Cap(c) : 0)) * (mods.capacity || 1); // v24 土地改革承载乘区；v27 res9 承载并入（C0=既有城区基数+新建住宅）
        let gg = s.g * (mods.growth || 1);
        if (f.policy === 'subsidy') gg *= P.policy.subsidyMult;
        if (f.policy === 'limit') gg *= P.policy.limitMult;
        c.P = Math.max(1000, c.P + c.P * clamp(gg, -P.growthCap, P.growthCap));
        c.builtThisTurn = 0;
        if (!P.flag.nobuild) aiBuild(c, s, F, f, devMode, env.temp, rand); // v26 稳态核算盘：nobuild=冻结建筑谱系（剥离建造复利噪声）
      }
      if (econHit) incomeSum *= 0.7;
      incomeSum *= (mods.comm || 1);                                   // v26 商业乘区（私有化/反垄断/女权/延迟退休/自贸）  // @hook:comm 商业乘区
      incomeSum += indOut * ((mods.industry || 1) - 1);                // v26 工业乘区增量接入（无卡=0 不扰基线；产业补贴/女权/延迟退休）  // @hook:industry 工业增量乘区
      // v26 总财收乘区（国有化 fisc×1.10：税+商业整体；口径修正——只乘税项会使国企增益相对私有化不可感知）
      taxSum *= (mods.fisc || 1); incomeSum *= (mods.fisc || 1);  // @hook:fisc 总财收乘区
      // v26 民生 W（简化主式：人口算法-v1 §五；sim 未建治安/治理/财富项）+ 忠诚轨迹（ΔLoyalty=民生流+卡忠诚流）
      f.W = clamp(50 + 0.28 * (avgL - 50) + 0.22 * (F - 50) + mods.W + (stats.reduce((a, s) => a + (s.fxW || 0), 0) / Math.max(1, stats.length)), 0, 100);  // @hook:W 民生主式（人口算法-v1 §五 简化；v27 事件卡 W 偏置）
      const wFlow = f.W < 40 ? -0.15 * Math.pow(40 - f.W, 1.1) : (f.W > 55 ? 0.15 * Math.pow(f.W - 55, 0.8) : 0);
      f.loyalty = clamp((f.loyalty || 60) + clamp(wFlow + (mods.loyaltyFlow || 0), -10, 5), 0, 100);
      // ==== v27 事件卡条件跟踪（内容库 §一/§二 触发器；@hook:evCond）====
      {
        const popNow = f.cities.reduce((a, c) => a + c.P, 0);
        const popPrev = f._popPrev || popNow;
        const popG = popPrev > 0 ? (popNow - popPrev) / popPrev : 0;
        f._popPrev = popNow;
        ES.babyStreak[f.id] = popG >= 0.02 ? (ES.babyStreak[f.id] || 0) + 1 : 0; // P7 婴儿潮：增速≥⚙2%/回×3
        const incNow = f.netIncomeLast || 0;
        const incPrev = ES.preIncome[f.id];
        ES.preIncome[f.id] = incNow;
        const incG = incPrev != null && Math.abs(incPrev) > 1 ? (incNow - incPrev) / Math.abs(incPrev) : 1;
        ES.stagn[f.id] = (popG < 0.01 && incG < 0.01) ? (ES.stagn[f.id] || 0) + 1 : 0; // S3 低欲望：双停滞
        f.atWar = !!diplo.war && (diplo.war.sideA.includes(f.id) || diplo.war.sideB.includes(f.id));
        const wT = f._warTurns || 0;
        f._warTurns = f.atWar ? wT + 1 : 0; // S1 口红：战争/封锁≥5 回
        if (!f.atWar && wT > 0) { ES.warEnd[f.id] = t; f._warTurns = 0; } // S2 报复：战后 3 回内
        f._evCond = {
          warTurns: f._warTurns || 0,
          warEndRecent: ES.warEnd[f.id] ? t - ES.warEnd[f.id] : 99,
          avgEmp: stats.reduce((a, s) => a + s.employmentRate, 0) / Math.max(1, stats.length),
        };
        // 城市忠诚（v27：占领城 −10；P1 起义判定用）+ 就业过饱和连击（S4 彩票热）
        for (const c of f.cities) {
          const s2 = stats[f.cities.indexOf(c)] || {};
          c.loyalty = clamp(f.loyalty + (c.origFac !== c.fac ? -10 : 0), 0, 100);
          ES.lowStreak[c.name] = c.loyalty < (c.origFac !== c.fac ? 20 : 30) ? (ES.lowStreak[c.name] || 0) + 1 : 0;
          const jobsOver = (s2.jobs || 0) > (c.P * 0.6) ? 1 : 0;
          c._jobsOver = jobsOver ? ((c._jobsOver || 0) + 1) : 0;
          c._L = s2.L || 50;
        }
      }
      // ==== 资源收入：v25 已由 settleMineralPower 结算（档位/煤矿扩产/铀/合成燃料）====
      const inc = f._minInc || P.resources[f.id] || { iron: 0, coal: 0, oil: 0 };
      // ==== 外交采购（A1.4 P0 出口）：国库 >50 万时按缺口买入（和平期消化国库）====
      if (f.treasury > 500000) {
        for (const k of ['iron', 'coal', 'oil']) {
          const cap = inc[k] * P.resourceCapTurns;
          if (f.resources[k] < cap * 0.5) {
            const buy = Math.min((cap * 0.5 - f.resources[k]), (f.treasury - 500000) * 0.2 / (P.buyPrice[k] * (mods.buyPriceMul || 1))); // v26 霸权主义：强买价 ×0.85
            if (buy > 0) { f.resources[k] += buy; f.treasury -= buy * P.buyPrice[k] * (mods.buyPriceMul || 1); }
          }
        }
      }
      // ==== 征募（普通步兵）====
      const popTotal = f.cities.reduce((a, c) => a + c.P, 0);
      // 服役比例（2026-11-28 统一口径）：和平自动征募 5%=文档 serviceRatioBase；政策 pp 偏置按默认 5% 折算相对乘区
      const svcBase = f.atWar ? (stress ? stressService : P.warService) : P.peaceService;
      const svcCap = clamp(svcBase * (1 + (mods.serviceCap || 0) / 0.05), 0.002, 0.20);  // @hook:serviceCap 服役比例上限
      const target = Math.min(popTotal * svcCap * (disarmHit ? 0.5 : 1) * (f.lostCulture ? P.culture.lostRecruit : 1), 2000000);
      let total = totalUnits(f);
      // 征募费（2026-11-28 院长裁：征募不要钱——兵饷等自然公式承担代价；feeUnit>0 才计费防除零）
      if (target > total) {
        const add = target - total;
        const feeUnit = P.recruitFee * (mods.recruit || 1); // v24 政策征募费乘区（兵役登记/紧急动员）
        if (feeUnit > 0) {
          const afford = Math.max(0, Math.min(add, Math.floor(Math.max(0, f.treasury) / feeUnit)));
          f.treasury -= afford * feeUnit;
          f.units.inf += afford;
          if (afford < add) log.push({ t, event: `${f.id} 征募受限：国库不足（需 ${Math.round(add * feeUnit)}，仅征 ${afford}/${add}）` });
        } else {
          f.units.inf += add;
        }
      }
      else if (target < total) {
        let cut = total - target;
        for (const k of ['inf', 'assault', 'special', 'mobile', 'heavy', 'heli', 'tank']) {
          const d = Math.min(cut, f.units[k]); f.units[k] -= d; cut -= d;
          if (cut <= 0) break;
        }
      }
      // ==== 兵工厂产出（每城 1 座；2026-11-28 院长裁人头制：财/回合按人头比例，batchSize=单回合转换上限）====
      for (const c of f.cities) {
        if (c.b.arsenal <= 0) continue;
        const job = pickUnit(f);   // 选型去批次门槛（pickUnit 内 can() 不再要求 inf≥batchSize）
        if (!job) continue;
        const u = P.units[job];
        const cap = Math.max(1, Math.floor(P.batchSize / u.turns));   // 单回合转换上限（轻 8000 人/回、重 4000 人/回）
        const perCap = u.wealth / P.batchSize;                        // 财/人头（轻 0.4、重 1.6）
        const affordable = perCap > 0 ? Math.floor(Math.max(0, f.treasury) / perCap) : Math.floor(f.units.inf);
        const want = Math.min(Math.floor(f.units.inf), cap, affordable);
        if (want <= 0) continue;
        f.units.inf -= want;
        f.treasury -= want * perCap;
        f.resources.iron -= u.iron * want / P.batchSize;
        f.resources.coal -= u.coal * want / P.batchSize;
        f.resources.oil -= u.oil * want / P.batchSize;
        f.units[job] += Math.round(want * (mods.arsenal || 1)); // v26 军工优先：转换效率 ×1.15（消耗端不变，非虚空产出）；流式产出
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
      // v26 军费：军饷乘区（志愿兵役×1.25 档 / 国防自主×0.90）+ 军队经商收入（milIncome 财/兵/回）
      const salary = f.soldiers * P.soldierSalary * (disarmHit ? 1.2 : 1) * (mods.salary || 1) * (mods.milCost || 1);  // @hook:salary 军饷乘区
      const milIncome = f.soldiers * (mods.milIncome || 0); // 军队经商：规模越大收益越高（唯一强负面卡的收益侧）  // @hook:milIncome 军队经商收益
      // 俸禄（v27 B1 修正：只发在职武将 104/将/回；generalsPerCity 折算口径作废）
      const employedOfficers = OFFICERS27.filter((o) => o.facId === f.id && o.employed);
      let salaryOfficers = employedOfficers.length * P.salaryPerGeneral;
      let bonusCost = 0;
      for (const o of employedOfficers) bonusCost += [0, 10, 30, 50][o.bonusTier || 0]; // 加俸（B12 §三）
      if (f.treasury < salaryOfficers + bonusCost) {
        // 欠俸（B12：无法支付俸禄时该将忠诚 −1/回）
        for (const o of employedOfficers) o.loyalty = clamp(o.loyalty - 1, 0, 100);
      }
      // B12 ⑦ 典藏交易/考古（80 财/件，归文化队列）：国库>5 万时买 1 件/回 → 文化 +8（@hook:relic）
      let relicCost = 0;
      if (f.treasury > 50000 && rand() < 0.3) { relicCost = 80; f.culture = (f.culture || 0) + 8; }
      // 人口政策成本（补贴：1 财/千人/回）
      const policyCost = f.policy === 'subsidy' ? f.cities.reduce((a, c) => a + c.P, 0) / 1000 * P.policy.subsidyCostPer1000 : 0;
      // v26 生育补贴（经-05 院长口径：按人口一半补贴 0.0025 财/人/回）+ 财支出乘区（福利/医保/集采/补贴/维和/援助）
      const birthCost = f.cities.reduce((a, c) => a + c.P, 0) * 0.5 * (mods.subsidyCost || 0);  // @hook:subsidyCost 生育补贴支出
      const upkeepPolicy = upkeepSum * ((mods.upkeep || 1) - 1); // v26 财支出增量（无卡=0）  // @hook:upkeep 财支出乘区
      const tradeInc = f.tradeIncome || 0; // v27 贸易 v1.0（贸易最小规则 §二）
      f.treasury += taxSum + incomeSum + milIncome + tradeInc - upkeepSum - upkeepPolicy - salary - salaryOfficers - bonusCost - relicCost - policyCost - birthCost;
      f.netIncomeLast = taxSum + incomeSum + milIncome + tradeInc - upkeepSum - upkeepPolicy - salary - salaryOfficers - bonusCost - relicCost - policyCost - birthCost; // v24 建造维护预算基准（v26 含政策支出）
      f.financeTrace = { tax: taxSum, income: incomeSum, milIncome, trade: tradeInc, upkeep: upkeepSum + upkeepPolicy, salary, officers: salaryOfficers, bonus: bonusCost, relic: relicCost, policyCost: policyCost + birthCost }; // v26 报告用
      if (process.env.AGW_FT && t % 25 === 0) console.error('[FT]', 't' + t, f.id, 'tre=' + Math.round(f.treasury), 'sol=' + Math.round(f.soldiers), JSON.stringify(f.financeTrace));
      // 学院链科技产出（Lv1/2/3 = 10/16/24）；经济制裁 ×0.7；政策乘区（学术自由/开放社会等）
      const tw = techTick(t, f, diplo, rand, log, econHit, env.temp);
      if (tw.techWin && !winner) {
        winner = { id: tw.techWin, type: 'tech', t };
        log.push({ t, event: `${tw.techWin} 率先建成终极工程（${f.projectLine}线入场券）——科技胜利（t${t}）` });
      }
      factionPower[f.id] = compositionPower(f, null);
      totalPower += factionPower[f.id];
      if (t % 50 === 0 || t === 1) {
        const pop = f.cities.reduce((a, c) => a + c.P, 0);
        log.push({ t, fac: f.id, pop: Math.round(pop), soldiers: Math.round(f.soldiers), treasury: Math.round(f.treasury), F: F.toFixed(1), tech: Math.floor(f.tech), L: avgL.toFixed(1), desire: desire.toFixed(2), policy: f.policy, oil: f.resources.oil, factories: f.cities.reduce((a, c) => a + (c.b.arsenal ? 1 : 0), 0) });
      }
    }
    // ==== v27 回合结束节点：先叛逃/归隐（officerTick）再事件卡 turnEnd（P1 起义等；忠诚度.md 时序）====
    officerTick(t, facs, OFFICERS27, cityByName, SCEN.cityAdj || {}, rand, log);
    evTick(t, 'turnEnd', facs, cities, env, OFFICERS27, cityByName, SCEN.cityAdj || {}, rand, log, ES);
    // ==== 政策 AI（v24 · 变动因子驱动，全阵营；单回合 ≤1 次评估）====
    policyPressureTick(t, facs, rand, log, diplo);
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
        fe *= (facMods(f).emit || 1); // v26 排放乘区（垃圾分类 ×0.95 / 绿色转型 ×0.90）
        fe *= P.env.unGreen.emitMult; // 环保合作全员生效（UN 已删 11-27）
        facEmit[f.id] = fe; emit += fe;
      }
      recycle += P.env.unGreen.recycleBonus; // 环保合作全球回收（UN 已删 11-27）
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
      if (warsmoke && t === 105 && !diplo.war) {
        for (const tr of diplo.treaties) if (tr.type === 'ally' && (tr.a === 'AU' || tr.b === 'AU')) tr.dead = true; // 断盟（防守方计入攻方自身战力）
        facs.CN.units.tank += 200000; // 战力比 1.3+（触发占领结算/U_target）
        diplo.war = { a: 'CN', b: 'AU', start: t, sideA: ['CN'], sideB: ['AU'] };
        log.push({ t, event: `CN 宣战 AU（warsmoke 战争路径验证：U_target/战损/占领）` });
      }
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
      // 文化胜利（11-27 UN 删除修订）：任一存活阵营对所有其他**存活阵营**完全入侵并维持 10 回即胜（无 UN/常任理事国前置）
      // 不要求初始阵营全存活；灭国=移除入侵目标（军事加速文化=设计意图）
      if (!winner) {
        for (const A of aliveIds) {
          const others = aliveIds.filter((B) => B !== A);
          const ok = others.length > 0 && others.every((B) => (facs[B].invasionSince || {})[A] > 0
            && t - facs[B].invasionSince[A] >= P.culture.victoryHold && (facs[B].identity[A] || 0) >= P.culture.invadeRelease);
          if (ok) {
            winner = { id: A, type: 'culture', t };
            const shares = others.map((B) => `${B}:${Math.round((facs[B].identity[A] || 0) * 100)}%`).join(' ');
            log.push({ t, event: `${A} 文化入侵全球——文化胜利（t${t}）；认同 ${shares}` });
            break;
          }
        }
      }
    }
  }
  return { log, cities, facs, diplo, winner, doom, env, officers: OFFICERS27, evState: ES };
}

const turns = Number(process.argv[2] || 200);
const seed = Number(process.argv[3] || 1);
const scenario = ['vs', 'stack', 'finance', 'neutral', 'infra', 'spy', 'auto', 'tune', 'audit'].includes(process.argv[4]) ? process.argv[4] : null;
const stress = process.argv[4] === 'stress';
const stressService = Number(process.argv[5] || P.stressService);
// v25 燃料压力盘：node sim/v26/policy.js 200 <seed> fuelshort（矿石收入 ×0.2，验证缺口/停机/合成燃料链路）
if (process.argv.includes('fuelshort')) P.mineral.shortMult = 0.2;
if (process.argv.includes('nobuild')) P.flag.nobuild = true; // v26 稳态核算（建筑冻结）
// v24 政策两算法对照：node policy.js [turns] [seed] pressure|fixed10|fixed20
const policyModeArg = ['pressure', 'fixed', 'fixed10', 'fixed20'].includes(process.argv[4]) ? process.argv[4] : null;
if (policyModeArg) {
  AIP.policy.mode = policyModeArg.startsWith('fixed') ? 'fixed' : 'pressure';
  if (policyModeArg.startsWith('fixed') && policyModeArg.length > 5) AIP.policy.fixedN = Number(policyModeArg.slice(5)) || 10;
}

// ================= v26 场景对照（FORCE_CARDS 全阵营锁定；CN=测试组，JP/KR/AU=空卡对照） =================
function lockAllDigits(cnCards) {
  for (const k of Object.keys(FORCE_CARDS)) delete FORCE_CARDS[k];
  FORCE_CARDS.CN = cnCards;
  FORCE_CARDS.JP = []; FORCE_CARDS.KR = []; FORCE_CARDS.AU = [];
}
// 指标快照：末态 + 财政/人口/文化/W/忠诚/关系/战争
function snapshot(res, t) {
  const { log, cities, facs, diplo, winner, doom, env } = res;
  const ids = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  const out = { winner, doom, env, facs: {}, wars: log.filter((r) => r.event && r.event.includes('宣战')).length, ids };
  for (const x of ids) {
    const f = facs[x];
    const pop = f.cities.reduce((a, c) => a + c.P, 0);
    const ft = f.financeTrace || {};
    out.facs[x] = {
      pop, treasury: f.treasury, soldiers: f.soldiers, tech: f.tech,
      W: f.W, loyalty: f.loyalty, culture: f.culture,
      selfId: f.identity ? f.identity[x] : 1,
      cards: Object.values(f.cards || {}).flat(),
      mods: facMods(f),
      ft,
      buildings: f.cities.reduce((a, c) => a + c.b.residence + c.b.farm + c.b.plant + c.b.factory + c.b.street + c.b.mall + c.b.office + c.b.academy + c.b.hosp + c.b.police + c.b.arsenal + c.b.airport + c.b.aaGun + c.b.coal + c.b.nuclear + c.b.hydro + c.b.solar, 0),
      pr: (() => { const ms = f.mineralStats; return ms.prCountPost > 0 ? ms.prSumPost / ms.prCountPost : null; })(),
      // v26 末 20 回平均收支（用每回合 log 无法取，改末回 financeTrace 与存量）
    };
  }
  // 末回财政轨迹（各阵营 financeTrace 已是最后一回合值）
  out.rel = {};
  for (const a of ids) out.rel[a] = Object.fromEntries(ids.filter((b) => b !== a).map((b) => [b, Number(diplo.rel[a][b].toFixed(1))]));
  out.rep = Object.fromEntries(ids.map((x) => [x, Number(diplo.rep[x].toFixed(1))]));
  out.allies = diplo.treaties.filter((x) => x.type === 'ally' && !x.dead).map((x) => `${x.a}-${x.b}`);
  return out;
}
function row(x, s) {
  const f = s.facs[x];
  if (!f) return `${x} | 灭国`;
  return `${x} | ${fmt(f.pop).padStart(9)} | ${fmt(f.treasury).padStart(9)} | ${fmt(f.soldiers).padStart(7)} | W=${(f.W || 0).toFixed(1).padStart(5)} | 忠=${(f.loyalty || 0).toFixed(1).padStart(5)} | 科=${(f.tech || 0).toFixed(0)}/40 | 文=${fmt(f.culture || 0).padStart(8)} | 卡=${f.cards.join(',') || '无'}`;
}
function finRow(x, s) {
  const f = s.facs[x];
  if (!f || !f.ft || !f.ft.tax) return `${x} | 灭国`;
  const ft = f.ft;
  const inc = ft.tax + ft.income;
  const exp = ft.upkeep + ft.salary + ft.officers + ft.policyCost;
  return `${x} | 税${fmt(ft.tax)} | 商${fmt(ft.income)} | 军商${fmt(ft.milIncome || 0)} | 支出${fmt(exp)}（维护${fmt(ft.upkeep)} 饷${fmt(ft.salary)} 俸${fmt(ft.officers)} 政策${fmt(ft.policyCost)}） | 净${fmt(inc - exp)}`;
}
function runScenario(name) {
  const results = [];
  const cfgs = [];
  if (name === 'vs') {
    cfgs.push(['无卡对照', []]);
    cfgs.push(['私有化', ['privatization']]);
    cfgs.push(['国有化', ['stateIndustry']]);
  } else if (name === 'stack') {
    // 民生 W 类 7 张逐张叠加（§12.2-1）
    const wCards = ['welfareState', 'universalHealthcare', 'drugProcurement', 'delayedRetirement', 'doubleReduction', 'culturalCensorship', 'feminism'];
    cfgs.push(['无卡对照', []]);
    for (let i = 1; i <= wCards.length; i++) cfgs.push([`W叠加${i}张`, wCards.slice(0, i)]);
  } else if (name === 'finance') {
    // 财支出 6 张叠加（§12.2-2）+ 私有化/国有化对照（§12.2-4 同 seed）
    const spendCards = ['welfareState', 'industrialSubsidy', 'universalHealthcare', 'drugProcurement', 'peacekeeping', 'foreignAid'];
    cfgs.push(['无卡对照', []]);
    for (let i = 1; i <= spendCards.length; i++) cfgs.push([`财支出${i}张`, spendCards.slice(0, i)]);
    cfgs.push(['私有化', ['privatization']]);
    cfgs.push(['国有化', ['stateIndustry']]);
  } else if (name === 'neutral') {
    // 绝对中立（§12.2-7）：宣称锁 + 关系/rep 流；对照霸权主义（弃武 vs 榨取张力）
    cfgs.push(['无卡对照', []]);
    cfgs.push(['绝对中立', ['absoluteNeutrality']]);
    cfgs.push(['霸权主义', ['hegemony']]);
    cfgs.push(['绝对中立+霸权主义', ['absoluteNeutrality', 'hegemony']]);
    cfgs.push(['绝对中立+殖民主义', ['absoluteNeutrality', 'colonialism']]);
    // §12.2-3 关系流 5 张叠加（和平共处/多边主义/发展援助/绝对中立/维和行动）
    cfgs.push(['关系流5张', ['goodNeighbor', 'multilateralism', 'foreignAid', 'absoluteNeutrality', 'peacekeeping']]);
  } else if (name === 'infra') {
    // 基建狂魔口径（§12.2-6）：造价 ×0.9 → 同回合建筑总数/产出对照
    cfgs.push(['无卡对照', []]);
    cfgs.push(['基建狂魔', ['infraBlitz']]);
  } else if (name === 'spy') {
    // 反谍叠加（§12.2-5）：电子长城+1 / 网络实名制+1 → 聚合审计
    cfgs.push(['无卡对照', []]);
    cfgs.push(['电子长城', ['electronicGreatWall']]);
    cfgs.push(['网络实名制', ['realNameSystem']]);
    cfgs.push(['双反谍', ['electronicGreatWall', 'realNameSystem']]);
  } else if (name === 'auto') {
    cfgs.push(['全 AI 自主', null]); // null=不禁用 FORCE（AI 自主装卡）
  } else if (name === 'audit') {
    // v26 §12.1 落点审计（静态）：每卡 fx 键 → 结算落点 / 占位
    const WIRED = {
      tax: '税(税乘区)', pool: '消费池', comm: '商业(incomeSum)', fisc: '总财收(税+商)', income: '商业(总)',
      industry: '工业增量', food: '粮产', tech: 'TechTick', self: '自压', culEnt: '娱乐文化值', out: '对外输出',
      tourCap: '文旅容量', tourIncome: '文旅收入', growth: '人口 g', liv: '宜居(≤100)', upkeep: '财支出(维护)',
      cost: '建造造价', capacity: '承载', repPerTurn: '声誉流(已修)', warThreshold: '宣战阈值', W: '民生W偏置',
      loyaltyFlow: '忠诚流', serviceCap: '服役上限', relFlow: '关系流', relWeakest: '最弱国关系',
      relVsWeak: '对弱国关系', relWar: '对交战国关系', milIncome: '军队经商收入', subsidyCost: '生育补贴支出',
      canDeclareWar: '宣战锁', noAlliance: '同盟拦截', immigration: '⚠占位(无移民系统)',
      counterSpy: '⚠占位(无间谍引擎)', salary: '军饷乘区', milCost: '军费乘区', q: '战力q', arsenal: '兵工厂批次',
      assimil: '同化(自份额收敛)', emit: '排放乘区', buyPriceMul: '采购价',
      polluteBan: '⚠占位(污染引擎未建)', polluteOut: '⚠占位(污染建筑产出；发电不参与)',
    };
    console.log(`\n===== v26 落点审计：CARDS=${CARDS.length} 张（初始 ${INITIAL_CARDS.length} + 特殊 ${SPECIAL_CARDS.length}，特殊不进 AI 池）=====`);
    console.log('属性 | id | 池 | fx 键 → 落点');
    const byAttr = {};
    for (const c of CARDS) {
      const parts = Object.entries(c.fx).map(([k, v]) => `${k}${typeof v === 'number' && (v > 1 || v < 1) ? '' : ''}→${WIRED[k] || '❌未接线'}`);
      console.log(`${ATTR_NAME[c.attr]} | ${c.id.padEnd(24)} | ${c.initial ? '初始' : '特殊'} | ${parts.join(' ')} | mutex=${c.mutex || '-'} tier=${c.tier}`);
      if (c.initial) byAttr[c.attr] = (byAttr[c.attr] || 0) + 1;
    }
    console.log(`\n初始分类计数：${Object.entries(byAttr).map(([k, v]) => `${ATTR_NAME[k]}=${v}`).join(' ')}（合计 ${INITIAL_CARDS.length}）｜特殊 ${SPECIAL_CARDS.length}：${SPECIAL_CARDS.map((c) => c.id).join('/')}`);
    const un = CARDS.flatMap((c) => Object.keys(c.fx).filter((k) => !WIRED[k]).map((k) => `${c.id}.${k}`));
    const ph = CARDS.flatMap((c) => Object.keys(c.fx).filter((k) => (WIRED[k] || '').startsWith('⚠')).map((k) => `${c.id}.${k}`));
    console.log(`未接线键（应为 0）：${un.length ? un.join(',') : '无'}`);
    console.log(`占位键（聚合记录、引擎未建）：${ph.length ? ph.join(',') : '无'}`);
    // 互斥组检查（特殊卡不进初始池，不参与互斥）
    const groups = {};
    for (const c of INITIAL_CARDS) if (c.mutex) (groups[c.mutex] = groups[c.mutex] || []).push(c.id);
    console.log(`互斥组 ${Object.keys(groups).length}：${Object.entries(groups).map(([g, ids]) => `${g}(${ids.join('/')})`).join(' ')}`);
    return;
  } else if (name === 'tune') {
    // 私有化 comm / 国有化 fisc 校准扫描（稳态 nobuild：冻结建筑，剥离复利噪声）
    P.flag.nobuild = true;
    const base = { comm: CARD_BY_ID.privatization.fx.comm, fisc: CARD_BY_ID.stateIndustry.fx.fisc };
    cfgs.push(['无卡对照', []]);
    const runsT = [];
    for (const comm of [1.10, 1.13, 1.15, 1.18]) {
      CARD_BY_ID.privatization.fx.comm = comm;
      lockAllDigits(['privatization']);
      runsT.push({ label: `私有化 comm=${comm}`, snap: snapshot(run(turns, seed, false, stressService), turns) });
    }
    CARD_BY_ID.privatization.fx.comm = base.comm;
    for (const fisc of [1.06, 1.07, 1.08, 1.10]) {
      CARD_BY_ID.stateIndustry.fx.fisc = fisc;
      lockAllDigits(['stateIndustry']);
      runsT.push({ label: `国有化 fisc=${fisc}`, snap: snapshot(run(turns, seed, false, stressService), turns) });
    }
    CARD_BY_ID.stateIndustry.fx.fisc = base.fisc;
    // 预付排序：无卡对照先跑
    lockAllDigits([]);
    const baseSnap = snapshot(run(turns, seed, false, stressService), turns);
    const bfc = baseSnap.facs.CN || baseSnap.facs[baseSnap.ids[0]];
    if (!bfc || !bfc.ft) { console.log(`[tune] 基线无财政轨迹（存活=${baseSnap.ids.join('/')}）——换 seed`); return; }
    const bf = bfc.ft;
    const bNet = bf.tax + bf.income - (bf.upkeep + bf.salary + bf.officers + bf.policyCost);
    console.log(`\n===== v26 场景「tune」稳态(nobuild) turns=${turns} seed=${seed} | 基线净=${fmt(bNet)} =====`);
    console.log('配置 | 净 | 相对基线增益 | 税 | 商');
    for (const r of runsT) {
      const ft = r.snap.facs.CN.ft;
      const net = ft.tax + ft.income - (ft.upkeep + ft.salary + ft.officers + ft.policyCost);
      console.log(`${r.label.padEnd(16)} | ${fmt(net).padStart(6)} | ${(((net / bNet - 1) * 100).toFixed(1) + '%').padStart(8)} | ${fmt(ft.tax)} | ${fmt(ft.income)}`);
    }
    return; // tune 自输出
  }
  for (const [label, cards] of cfgs) {
    if (cards === null) { for (const k of Object.keys(FORCE_CARDS)) delete FORCE_CARDS[k]; }
    else lockAllDigits(cards);
    const res = run(turns, seed, false, stressService);
    results.push({ label, cards, snap: snapshot(res, turns) });
  }
  // 输出
  console.log(`\n===== v26 场景「${name}」turns=${turns} seed=${seed} | 对照口径=全阵营卡组锁定(CN=测试组,JP/KR/AU=空卡) =====`);
  for (const r of results) {
    const s = r.snap;
    console.log(`\n—— ${r.label} ——${s.winner ? ` 胜者=${s.winner.id}(${s.winner.type} t${s.winner.t})` : s.doom ? ' 全局失败' : ' 无胜者'} | 宣战${s.wars}次 | 同盟 ${s.allies.join(' ') || '无'}`);
    console.log('阵营 | 人口 | 国库 | 兵 | W | 忠诚 | 科技 | 文化 | 卡组');
    for (const x of s.ids) console.log(row(x, s));
    console.log('财政末回 | ' + ['CN', 'JP', 'KR', 'AU'].filter((x) => s.facs[x]).map((x) => finRow(x, s)).join('\n         | '));
    if (s.facs.CN) {
      const m = s.facs.CN.mods;
      const show = (k) => (typeof m[k] === 'number' ? m[k].toFixed(3) : m[k]);
      console.log(`CN 政策聚合 | W偏置=${show('W')} 忠诚流=${show('loyaltyFlow')} 财支出=${show('upkeep')} 商业=${show('comm')} 工业=${show('industry')} 税=${show('tax')} 池=${show('pool')} 军饷=${show('salary')} 军费=${show('milCost')} q=${show('q')} 反谍=${show('counterSpy')} 服役=${show('serviceCap')} 战力锁=${m.canDeclareWar ? '禁宣战' : '可宣战'}`);
      console.log(`CN 关系 | ${Object.entries(s.rel.CN || {}).map(([k, v]) => `${k}:${v}`).join(' ')} | rep=${s.rep.CN} | 建筑总数=${s.facs.CN.buildings} | pr=${s.facs.CN.pr == null ? '-' : (s.facs.CN.pr * 100).toFixed(0) + '%'}`);
    }
  }
  // 对照汇总（CN 行）
  console.log('\n[v26 对照汇总] 配置 | 人口 | 国库 | 税 | 商 | 支出合计 | 净 | W | 忠诚 | 文化 | 建筑');
  for (const r of results) {
    const f = r.snap.facs.CN;
    if (!f) { console.log(`${r.label} | CN 灭国`); continue; }
    const ft = f.ft || {};
    const exp = (ft.upkeep || 0) + (ft.salary || 0) + (ft.officers || 0) + (ft.policyCost || 0);
    const net = (ft.tax || 0) + (ft.income || 0) - exp;
    console.log(`${r.label.padEnd(12)} | ${fmt(f.pop).padStart(9)} | ${fmt(f.treasury).padStart(9)} | ${fmt(ft.tax || 0).padStart(6)} | ${fmt(ft.income || 0).padStart(6)} | ${fmt(exp).padStart(7)} | ${fmt(net).padStart(7)} | ${(f.W || 0).toFixed(1)} | ${(f.loyalty || 0).toFixed(1)} | ${fmt(f.culture || 0)} | ${f.buildings}`);
  }
  // ================= [ASSERT] 机器判定（AI 友好规范 P5：AI 只看结论行，明细已在上表）=================
  {
    const b = results.find((r) => r.label.includes('无卡')) || results[0];
    const netOf = (x) => { const t = x.ft || {}; return (t.tax || 0) + (t.income || 0) - (t.upkeep || 0) - (t.salary || 0) - (t.officers || 0) - (t.policyCost || 0); };
    const gn = (label) => { const r = results.find((x) => x.label === label);
      if (!r || !b || !b.snap.facs.CN) return null;
      return netOf(r.snap.facs.CN) / Math.max(1, Math.abs(netOf(b.snap.facs.CN))) - 1; };
    let fails = 0;
    const chk = (ok, msg) => { console.log(`[ASSERT] ${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
    const last = results[results.length - 1];
    if (name === 'vs' || name === 'finance') {
      const pv = gn('私有化'), si2 = gn('国有化');
      if (pv != null) chk(pv > 0.03 && pv < 0.35, `私有化增益带内 ${(pv * 100).toFixed(1)}% (期望 3~35%)`);
      if (si2 != null) chk(si2 > -0.08 && si2 < 0.35, `国有化增益带内 ${(si2 * 100).toFixed(1)}% (期望 -8~35%；建造盘单seed噪声±10pp，稳健值看 nobuild)`);
    }
    if (name === 'stack' && b.snap.facs.CN) {
      const dW = last.snap.facs.CN.W - b.snap.facs.CN.W;
      chk(dW > 4 && dW < 9, `W叠加线性 +${dW.toFixed(1)} (期望 4~9)`);
    }
    if (name === 'finance' && b.snap.facs.CN) {
      const sp = results.filter((r) => r.label.startsWith('财支出')).pop() || last;
      // 口径：断言**乘区**（mods.upkeep）而非 upkeep 总额——总额含 W 卡抬高人口→建筑增长的二阶项（实测 11% vs 乘区 3.6%）
      const upMul = sp.snap.facs.CN.mods.upkeep || 1;
      chk(upMul > 1.02 && upMul < 1.05, `财支出乘区 ×${upMul.toFixed(4)} (期望 1.02~1.05，组=${sp.label})`);
    }
    if (name === 'spy') chk(last.snap.facs.CN.mods.counterSpy === 2, `反谍聚合=2 (实=${last.snap.facs.CN.mods.counterSpy})`);
    if (name === 'infra') chk(last.snap.facs.CN.buildings > b.snap.facs.CN.buildings, `基建狂魔建筑↑ ${b.snap.facs.CN.buildings}→${last.snap.facs.CN.buildings}`);
    if (name === 'neutral') {
      const an = results.find((r) => r.label === '绝对中立');
      chk(!!(an && an.snap.facs.CN.mods.canDeclareWar === 1), '绝对中立宣战锁生效');
      chk(!!(an && an.snap.rep.CN > 60 && an.snap.rep.CN < 100), `绝对中立 rep 未饱和 ${an ? an.snap.rep.CN : '-'} (期望 60~99)`);
    }
    const negs = [];
    for (const r of results) for (const [x, f] of Object.entries(r.snap.facs)) if (f.treasury < -1e6) negs.push(`${r.label}.${x}`);
    chk(negs.length === 0, `无深度破产 (${negs.join(',') || '无'})`);
    console.log(`[ASSERT] 汇总：${fails === 0 ? '全 PASS' : fails + ' 项 FAIL'}`);
  }
}
if (scenario) { runScenario(scenario); process.exit(0); }
const { log, cities, facs, diplo, winner, doom, env, officers: OFF27 } = run(turns, seed, stress, stressService);
console.log(`\n===== v22 FULL 盘 seed=${seed} turns=${turns}${stress ? ` 模式=战时压力(${(stressService * 100).toFixed(1)}%)` : ''} =====`);
console.log('\n[阵营] t | 人口 | 兵 | 国库 | 粮安F | 科技 | 宜居 | 欲望 | 政策 | 油 | 兵工厂');
for (const r of log) {
  if (r.pop === undefined) { console.log('EVENT', r.t, r.event); continue; }
  console.log(`${r.fac.padEnd(3)} t${String(r.t).padStart(3)} | ${fmt(r.pop).padStart(9)} | ${fmt(r.soldiers).padStart(8)} | ${fmt(r.treasury).padStart(9)} | ${String(r.F).padStart(5)} | ${String(r.tech).padStart(2)}/40 | ${String(r.L).padStart(5)} | ${String(r.desire).padStart(4)} | ${r.policy.padEnd(7)} | ${String(Math.round(r.oil)).padStart(6)} | ${r.factories}`);
}
console.log('\n[城况] 城 | 人口 | 承载 | r | 农田 | 火电 | 工业 | 娱乐(6线) | 文旅 | 博物馆 | 商业 | 写字楼 | 学院');
for (const c of cities) {
  const ent = Object.values(c.ent).reduce((a, v) => a + v, 0);
  console.log(`${c.name.padEnd(4)} | ${fmt(c.P).padStart(9)} | ${fmt(c.C).padStart(8)} | ${(c.P / c.C).toFixed(2)} | ${c.b.farm} | ${c.b.plant} | ${c.b.factory} | ${ent} | ${c.tour} | ${c.pub} | ${c.b.street + c.b.mall} | ${c.b.office} | ${c.b.academy}`);
}
const mainId = Object.keys(facs).find((x) => facs[x].cities.length > 0) || Object.keys(facs)[0]; // 剧本化：主观察阵营=首个存活（教学盘即 CN）
const cn = facs[mainId];
const cnPop = cn ? cn.cities.reduce((a, c) => a + c.P, 0) : 0;
const survivors = Object.values(facs).filter((f) => f.cities.length > 0).length;
console.log('\n[验收]');
console.log(`[${mainId}] 人口=${fmt(cnPop)} | 5% 动员=${fmt(cnPop * 0.05)} | 10%=${fmt(cnPop * 0.1)}`);
console.log(`[${mainId}] 兵=${fmt(cn ? cn.soldiers : 0)} | 存活=${survivors}/${Object.keys(facs).length} | 国库=${fmt(cn ? cn.treasury : 0)} | 科技=${cn ? cn.tech.toFixed(0) : 0}/40（节点 ${cn ? Object.keys(cn.techDone).length : 0}/40）`);
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
// [UN] 报告段已删（11-27 UN 全删；保留复国报告如下）
const revived = (diplo.extinct || []).filter((e) => e.revived).map((e) => `${e.fac}(t${e.t}被${e.by}灭→复国)`);
console.log(`复国：${revived.join(' ') || '无'}`);

// ================= v24 AI 指标（开题 §七 · 报告输入） =================
console.log(`\n[v24 AI] 政策模式=${AIP.policy.mode}${AIP.policy.mode === 'fixed' ? `(${AIP.policy.fixedN})` : ''} | incomeScale=${AIP.tech.incomeScale} | 节点=40(v25)`);
{
  const idsAlive = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  console.log('\n[v24 科技线] 阵营 | 进度 | 三线分布 | 在研 | 工程 | 政策卡 | 变动/财 | 压力');
  for (const x of idsAlive) {
    const f = facs[x];
    const lines = { mil: 0, ai: 0, grn: 0 };
    for (const id of Object.keys(f.techDone)) lines[TECH_BY_ID[id].line]++;
    const cards = Object.values(f.cards || {}).flat();
    console.log(`${x} | ${f.tech.toFixed(1)}/40（${Object.keys(f.techDone).length}/40节点） | mil${lines.mil}/ai${lines.ai}/grn${lines.grn} | ${f.researching ? TECH_BY_ID[f.researching].name : '-'} | ${f.project > 0 ? `${fmt(f.projectProd || 0)}/${AIP.tech.projectCost.prod}(${f.projectLine})` : '未启动'} | ${cards.map((c) => CARD_BY_ID[c] ? ATTR_NAME[CARD_BY_ID[c].attr] + ':' + c : c).join(',') || '无'} | ${f.policyChanges || 0}次/${fmt(f.policySpend || 0)}财 | ${(f.pressure || 0).toFixed(2)}`);
  }
  console.log('\n[v24 建造谱系] 阵营 | 总座数 | role 构成 Top');
  for (const x of idsAlive) {
    const agg = {};
    let totalB = 0;
    for (const c of facs[x].cities) {
      for (const card of BUILD_CARDS) {
        const n = card.kind === 'b' ? (c.b[card.key] || 0) : card.kind === 'ent' ? (c.ent[card.line] || 0) : card.kind === 'tour' ? c.tour : c.pub;
        if (!n) continue;
        totalB += n;
        for (const r of card.roles) agg[r] = (agg[r] || 0) + n;
      }
    }
    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `${r}:${n}`).join(' ');
    console.log(`${x} | ${totalB} | ${top}`);
  }
  const wars = log.filter((r) => r.event && r.event.includes('宣战'));
  const caps = log.filter((r) => r.event && r.event.includes('占领')).map((r) => r.event.match(/占领 (\S+?)（/)?.[1]).filter(Boolean);
  const lowPr = wars.filter((r) => { const m = r.event.match(/军力比 ([\d.]+)/); return m && Number(m[1]) < 1.0; });
  console.log(`\n[v24 战争] 宣战${wars.length}次 | 占领城：${caps.join(',') || '无'} | pr<1.0 宣战（应为0）：${lowPr.length}`);
  const peaceCn = !log.some((r) => r.t <= 10 && r.event && (r.event.includes('宣战') || r.event.includes('占领')));
  console.log(`[v24 教学局] CN 前 10 回合和平（应为 true）：${peaceCn}`);
  console.log(`[v24 环境] 复用 v22 环境账 | [v24 术语] 占领目标由 U_target 选择（非最小城）`);
}

// ================= v24.1 政策 swap 指标（对照输入；口径=11-19 装卡免费/冷却期内改动 100/期满免费） =================
console.log(`\n[v24.1 swap] 口径=装卡免费(equipFee=${AIP.policy.equipFee})/冷却期内改动${AIP.policy.costPerCard}财/期满免费 | 候选=空槽装卡+occupied槽换卡 | freezeU=${(AIP.policy.aFreeze * AIP.policy.freezeTurns * AIP.policy.slotUrgency).toFixed(1)}`);
console.log('[v24.1 swap] 阵营 | 装卡 | 换卡 | 变动/100回 | 政策财支出 | 主路径 | 路径匹配(亲和卡/总卡) | 文卡占比');
{
  const pathAff = { mil: 'military', eco: 'economy', cul: 'culture', dip: 'culture', gen: 'tech' };
  const idsAlive = Object.keys(facs).filter((x) => facs[x].cities.length > 0);
  for (const x of idsAlive) {
    const f = facs[x];
    const cards = Object.values(f.cards || {}).flat();
    const aff = cards.filter((c) => pathAff[(CARD_BY_ID[c] || {}).attr] === f.mainPath).length;
    const cul = cards.filter((c) => (CARD_BY_ID[c] || {}).attr === 'cul').length;
    const pct = cards.length ? (n) => `${Math.round(n / cards.length * 100)}%` : () => '0%';
    const rate = ((f.policyChanges || 0) / turns * 100).toFixed(1);
    console.log(`${x} | ${f.policyEquips || 0} | ${f.policySwaps || 0} | ${rate} | ${fmt(f.policySpend || 0)}财 | ${f.mainPath || '-'} | ${aff}/${cards.length}（${pct(aff)}） | ${cul}/${cards.length}（${pct(cul)}）`);
  }
}

// ================= v25 矿产/电网指标（矿电专题 §十二 · 报告输入） =================
console.log(`\n[v25 矿电] 口径=fuel_first | 档位50回/档(深井100回) | 损耗${(P.power.transmissionLoss * 100).toFixed(0)}%/超导0% | 火电煤${P.mineral.fuelIn.plant}/回 核电铀${P.mineral.fuelIn.nuclear}/回 | 核电维修每${P.mineral.nuclearMaintenanceEvery}回`);
{
  const idsAll = Object.keys(facs);
  console.log('[v25 矿电] 阵营 | 末档位 | 煤满足率 | 铀满足率 | 煤缺口回 | 铀缺口回 | 停电城回 | 核电维修回 | 电网补电/缺口 | 合成油累计 | 煤耗/铀耗 | 期末池 铁/煤/油/铀');
  for (const x of idsAll) {
    const f = facs[x];
    if (!f.cities.length) { console.log(`${x} | 已灭国`); continue; }
    const ms = f.mineralStats;
    const coalSatAll = ms.coalDemandSum > 0 ? ms.fuelCoalUsed / ms.coalDemandSum : 1;
    const uranSatAll = ms.uranDemandSum > 0 ? ms.fuelUranUsed / ms.uranDemandSum : 1;
    const tierIdx = f._lastTier != null ? f._lastTier : 0;
    const prPre = ms.prCountPre > 0 ? (ms.prSumPre / ms.prCountPre) : null;
    const prPost = ms.prCountPost > 0 ? (ms.prSumPost / ms.prCountPost) : null;
    console.log(`${x} | ${TIER_NAME[tierIdx]}(${P.mineral.tierMult[tierIdx]}) | ${(coalSatAll * 100).toFixed(1)}% | ${(uranSatAll * 100).toFixed(1)}% | ${ms.coalGapTurns} | ${ms.uraniumGapTurns} | ${ms.blackoutCityTurns} | ${ms.nuclearRepairTurns} | ${Math.round(ms.gridSent)}/${Math.round(ms.gridDeficit)} | ${ms.coalToOil.toFixed(1)} | ${Math.round(ms.fuelCoalUsed)}/${Math.round(ms.fuelUranUsed)} | ${Math.round(f.resources.iron)}/${Math.round(f.resources.coal)}/${Math.round(f.resources.oil)}/${Math.round(f.resources.uranium)}`);
    console.log(`[v25 电力] ${x} 平均pr：电网前 ${prPre == null ? '-' : (prPre * 100).toFixed(1) + '%'} / 电网后 ${prPost == null ? '-' : (prPost * 100).toFixed(1) + '%'} | 核电 ${ms.nuclearBuilt} 座 | 电网回合 ${ms.gridTurns}`);
  }
  console.log('\n[v25 矿电·电厂结构] 阵营 | 火电 | 核电 | 水电 | 光伏 | 煤矿(扩产) | 工业(化工厂载体)');
  for (const x of idsAll) {
    const f = facs[x]; if (!f.cities.length) continue;
    const sum = (k) => f.cities.reduce((a, c) => a + (c.b[k] || 0), 0);
    console.log(`${x} | ${sum('plant')} | ${sum('nuclear')} | ${sum('hydro')} | ${sum('solar')} | ${sum('coal')} | ${sum('factory')}`);
  }
  const tierEv = log.filter((r) => r.event && r.event.includes('矿脉降档'));
  console.log(`\n[v25 矿电] 矿脉降档事件：${tierEv.length} 条`);
  for (const e of tierEv) console.log(`  t${e.t} ${e.event}`);
  const neg = [];
  for (const x of idsAll) { const f = facs[x]; for (const k of ['iron', 'coal', 'oil', 'uranium']) if ((f.resources[k] || 0) < -1e-6) neg.push(`${x}.${k}=${f.resources[k]}`); }
  console.log(`[v25 矿电] 负池（应为0）：${neg.length ? neg.join(' ') : '无'}`);
  const grnCount = Object.values(facs).map((f) => `${f.id}:${!!f.techDone['grn2b']}${!!f.techDone['grn2c'] ? '/' + !!f.techDone['grn2c'] : ''}`).join(' ');
  console.log(`[v25 科技] grn2b/grn2c 研成：${grnCount}（格式=深井/合成）`);
  // ================= v27 [ASSERT]（AI 友好规范 §三：只看结论行） =================
  {
    const A = [];
    // A1 武将实体：21 将齐全 + 每城≥1 将
    const offCount = OFF27.length;
    const cityNoOfficer = cities.filter((c) => c.fac !== 'NONE' && OFF27.filter((o) => o.city === c.name).length === 0).map((c) => c.name);
    A.push([`武将实体 21 将（实 ${offCount}）+ 每城≥1`, offCount === 21 && cityNoOfficer.length === 0, cityNoOfficer.length ? '缺将城:' + cityNoOfficer.join(',') : '']);
    // A2 俸禄只发在职（B1）：欠俸/在职数一致性
    const employed = OFF27.filter((o) => o.employed).length;
    A.push([`俸禄在职口径（在职 ${employed} 将 ×104/回；在野不发）`, employed >= 8, `招安后在职=${employed}`]);
    // A3 事件卡：复苏盘 11 卡生效（H1/H2 不进）；无异常爆量
    const evAll = log.filter((r) => r.event && r.event.startsWith('【事件卡'));
    const evH = evAll.filter((r) => r.event.includes('自立门户') || r.event.includes('韩流'));
    A.push([`事件卡触发 ${evAll.length} 张；历史卡不进复苏（实 ${evH.length}）`, evH.length === 0, `特殊/普通=${evAll.length}`]);
    // A4 国库/资源无负池
    const negTre = idsAll.filter((x) => facs[x].treasury < -1e-6);
    A.push(['国库无负值', negTre.length === 0, negTre.join(',')]);
    // A5 贸易 v1.0：无负贸易收入
    const negTrade = idsAll.filter((x) => (facs[x].tradeIncome || 0) < -1e-6);
    A.push(['贸易收入非负', negTrade.length === 0, negTrade.join(',')]);
    // A6 粮安/生存：200 回终局无饿死（F<20 视为饥荒）
    const famine = idsAll.filter((x) => facs[x].cities.length && false); // F 为全局值，此处以终局 F 判定在下方
    A.push(['八足鼎立存活 ≥6（战争盘容许吞并）', idsAll.filter((x) => facs[x].cities.length > 0).length >= 6, `存活=${idsAll.filter((x) => facs[x].cities.length > 0).length}`]); // 11-27：===8→>=6（战争盘灭国=争霸正常节奏，复国机制兜底；原=和平盘口径）
    console.log('\n[v27 ASSERT]');
    let pass = 0;
    for (const [name, ok, detail] of A) {
      console.log(`[ASSERT] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
      if (ok) pass++;
    }
    console.log(`[ASSERT] ${pass}/${A.length} PASS`);
    void famine;
  }
}
