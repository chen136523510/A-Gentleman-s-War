// sim/v23/policy-check.js — 政策卡数值核算盘（B8 内容专题 v0.2 验证）
// 依据：v22 基线（数值尺度 S=8 / 税 800+P/1500 / 商业/军饷/文化/军费口径）+ 政策卡内容专题 v0.2
// 用途：逐卡量级核算（财/回、人口、军事当量、文化份额）+ 互斥组检查 + 组合叠加极值
// 运行：node sim/v23/policy-check.js
// 输出：单卡量级表 / 互斥组表 / 组合场景检查 / 判定汇总
// 纪律：参数集中 BASE 段；不做时间演化（长局由 policy-sim.js 负责）
'use strict';

// ================= 基线（CN 中盘 t100 估算，由 v22 full.js 公式抽出） =================
const BASE = {
  cities: 6,
  pop: 2500000,            // 250 万
  taxPerTurn: 6 * 800 + 2500000 / 1500,   // 6,467
  commercial: 11000,       // 写字楼 8 座/城 × 280 × 在岗 0.85 × 6
  industrial: 1536,        // 4 工业/城 × 64 生产 × 6
  pool: 50000,             // 2500×2.5×1.0×8（消费池上限）
  army: 120000,
  salary: 6000,            // 12 万 × 0.05
  recruitFee: 8,
  equip: 100000,           // 装备件数
  equipUpkeep: 500,        // 10 万 × 0.005
  resources: { iron: 576, coal: 576, oil: 86 },  // 每回产量
  cultureValue: 816,       // 6 城 × (PUB80+TOUR32+ENT24)
  tech: 0.18,              // 6 城满级学院 24/800
  tvRevenue: 970,          // 文旅占税 15%
  loyalty: 60,
  liv: 55,
  upkeep: 1200,            // 建筑维护/回
  relation: 40,
};

// ================= 50 张卡（v0.2 减负版） =================
// group: 互斥组；cost: 机制型成本说明；eval: 量级核算
const CARDS = [
  // ---- 军事（红）----
  { id: 'conscription', name: '兵役登记', attr: 'military', group: 'militaryDoctrine',
    effect: '征募费 ×0.8', cost: '无',
    eval: [{ m: '万人军征募省财', v: 16000, unit: '财/次' }, { m: '占税', v: 16000 / BASE.taxPerTurn * 100, unit: '%', oneoff: true }] },
  { id: 'warIndustryFirst', name: '军工优先', attr: 'military', group: null,
    effect: '兵工厂产出 ×1.15', cost: '无',
    eval: [{ m: '每城装备产出', v: 15, unit: '%' }, { m: '18 产线等效', v: 2.7, unit: '条' }] },
  { id: 'strategicReserve', name: '战略储备', attr: 'military', group: null,
    effect: '资源池上限 ×1.3', cost: '无',
    eval: [{ m: '多囤铁（1.5 回产量）', v: 864, unit: '铁' }, { m: '折算财', v: 1037, unit: '财', oneoff: true }] },
  { id: 'martialSpirit', name: '尚武精神', attr: 'military', group: null,
    effect: '军管底线 65；战时忠诚 +0.3/回', cost: '无（条件型）',
    eval: [{ m: '战役 10 回忠诚', v: 3, unit: '分' }, { m: '军管底线', v: 5, unit: '分' }] },
  { id: 'generalStaff', name: '参谋本部', attr: 'military', group: 'militaryDoctrine',
    effect: '战斗 q ×1.05', cost: '无',
    eval: [{ m: '战力当量（12 万兵）', v: 6000, unit: '兵' }, { m: '折军饷', v: 300, unit: '财/回' }, { m: '折征募', v: 48000, unit: '财', oneoff: true }] },
  { id: 'ironDiscipline', name: '铁律军法', attr: 'military', group: null,
    effect: '城市忠诚 +0.5/回', cost: '无',
    eval: [{ m: '50 回忠诚', v: 25, unit: '分' }] },
  { id: 'frontierFortress', name: '边关要塞', attr: 'military', group: null,
    effect: '城防 ×1.25；守军 q +10%', cost: '无（条件型：被围时）',
    eval: [{ m: '防御战力', v: 25, unit: '%' }, { m: '守军 q', v: 10, unit: '%' }] },
  { id: 'armsSelfSufficiency', name: '军备自给', attr: 'military', group: null,
    effect: '装备维护 ×0.7；进口价 ×0.9', cost: '无',
    eval: [{ m: '装备维护省', v: 150, unit: '财/回' }, { m: '占税', v: 150 / BASE.taxPerTurn * 100, unit: '%' }] },
  { id: 'nuclearDeterrence', name: '核威慑', attr: 'military', group: null,
    effect: '宣战阈值 +2；rep −0.5/回', cost: '机制型（rep）',
    eval: [{ m: '20 回 rep', v: -10, unit: 'rep' }, { m: '阈值', v: 2, unit: '档' }] },
  { id: 'fieldMedicine', name: '战地医疗', attr: 'military', group: null,
    effect: '战斗减员 ×0.9', cost: '无（条件型：战时）',
    eval: [{ m: '万人军战役省兵', v: 1000, unit: '兵' }, { m: '折征募', v: 8000, unit: '财/战役' }] },

  // ---- 经济（黄）----
  { id: 'taxCut', name: '减税', attr: 'economy', group: 'tax',
    effect: '税率 ×0.8；消费池 ×1.08；忠诚 +0.5/回', cost: '机制型（税 −20%）',
    eval: [{ m: '税收', v: -BASE.taxPerTurn * 0.2, unit: '财/回' }, { m: '消费池', v: BASE.pool * 0.08, unit: '上限' }, { m: '商业≈', v: BASE.commercial * 0.04, unit: '财/回' }] },
  { id: 'taxHike', name: '增税', attr: 'economy', group: 'tax',
    effect: '税率 ×1.2；忠诚 −0.5/回', cost: '机制型（忠诚）',
    eval: [{ m: '税收', v: BASE.taxPerTurn * 0.2, unit: '财/回' }, { m: '25 回忠诚', v: -12.5, unit: '分' }] },
  { id: 'consumptionStimulus', name: '消费刺激', attr: 'economy', group: 'demand',
    effect: '消费池 ×1.15；支出 0.5% 税收', cost: '机制型（财支出）',
    eval: [{ m: '消费池', v: BASE.pool * 0.15, unit: '上限' }, { m: '商业≈', v: BASE.commercial * 0.07, unit: '财/回' }, { m: '支出', v: -BASE.taxPerTurn * 0.005, unit: '财/回' }] },
  { id: 'austerity', name: '紧缩', attr: 'economy', group: 'demand',
    effect: '财收入 +5%；消费池 ×0.8', cost: '机制型（消费）',
    eval: [{ m: '税收', v: BASE.taxPerTurn * 0.05, unit: '财/回' }, { m: '消费池', v: -BASE.pool * 0.2, unit: '上限' }, { m: '商业≈', v: -BASE.commercial * 0.10, unit: '财/回' }] },
  { id: 'birthSubsidy', name: '生育补贴', attr: 'economy', group: 'population',
    effect: '人口增长 ×1.12；0.5 财/千人/回', cost: '机制型（财支出）',
    eval: [{ m: 'g 增量', v: 0.072, unit: '%/回' }, { m: '50 回人口', v: 3.6, unit: '%' }, { m: '成本', v: -BASE.pop / 1000 * 0.5, unit: '财/回' }] },
  { id: 'birthControl', name: '计划生育', attr: 'economy', group: 'population',
    effect: '人口增长 ×0.85', cost: '无（降增长即效果）',
    eval: [{ m: 'g 减量', v: -0.09, unit: '%/回' }] },
  { id: 'investmentWelcome', name: '招商引资', attr: 'economy', group: 'industry',
    effect: '商业 ×1.10', cost: '无',
    eval: [{ m: '商业', v: BASE.commercial * 0.10, unit: '财/回' }, { m: '占税', v: BASE.commercial * 0.10 / BASE.taxPerTurn * 100, unit: '%' }] },
  { id: 'stateIndustry', name: '国企集中', attr: 'economy', group: 'industry',
    effect: '工业 ×1.10；消费池 ×0.95', cost: '机制型（消费）',
    eval: [{ m: '工业产出', v: BASE.industrial * 0.10, unit: '生产/回' }, { m: '消费池', v: -BASE.pool * 0.05, unit: '上限' }] },
  { id: 'foodSecurity', name: '粮食安全', attr: 'economy', group: null,
    effect: '粮产 ×1.10', cost: '无',
    eval: [{ m: '粮安 F', v: 10, unit: '%' }] },
  { id: 'infraBlitz', name: '基建狂魔', attr: 'economy', group: null,
    effect: '工期 −1（最低 2）；造价 +5%', cost: '机制型（造价）',
    eval: [{ m: '3 回建筑周转', v: 50, unit: '%' }, { m: '造价', v: 5, unit: '%' }] },

  // ---- 文化（紫）----
  { id: 'culturalConfidence', name: '文化自信', attr: 'culture', group: null,
    effect: '自压 ×1.15', cost: '无',
    eval: [{ m: '被入侵门槛', v: 3, unit: 'pp' }, { m: '份额防御', v: 15, unit: '%' }] },
  { id: 'electronicGreatWall', name: '电子长城', attr: 'culture', group: 'digital',
    effect: '互联网乘数双向失效；科技 −3%', cost: '机制型（科技）',
    eval: [{ m: '免疫压制', v: 30, unit: '% 满档' }, { m: '放弃放大', v: -30, unit: '% 满档' }, { m: '科技', v: -3, unit: '%' }] },
  { id: 'heritageProtection', name: '遗产保护', attr: 'culture', group: null,
    effect: '博物馆抵抗 3→4%/座级；文化值 +5%', cost: '无',
    eval: [{ m: '3 级博物馆抵抗', v: 3, unit: 'pp' }, { m: '文化值', v: 5, unit: '%' }] },
  { id: 'tourismPowerhouse', name: '万国来游', attr: 'culture', group: null,
    effect: '文旅上限 ×1.3；文旅收入 ×1.2', cost: '无',
    eval: [{ m: '文旅收入', v: BASE.tvRevenue * 0.2, unit: '财/回' }, { m: '占税', v: BASE.tvRevenue * 0.2 / BASE.taxPerTurn * 100, unit: '%' }] },
  { id: 'screenSoftPower', name: '光影出海', attr: 'culture', group: null,
    effect: '电影/电竞/游乐文化值 ×1.15', cost: '无',
    eval: [{ m: '文化值', v: 15, unit: '%（ENT 线）' }, { m: '输出≈', v: 7, unit: '%' }] },
  { id: 'languagePromotion', name: '雅言远播', attr: 'culture', group: null,
    effect: '对外文化输出 ×1.1', cost: '无',
    eval: [{ m: '输出', v: 10, unit: '%' }, { m: '份额≈', v: 10, unit: '%' }] },
  { id: 'academicFreedom', name: '百家争鸣', attr: 'culture', group: 'speech',
    effect: '科技 +5%；输出 +5%', cost: '无',
    eval: [{ m: '科技 40 点省', v: 11, unit: '回' }, { m: '输出', v: 5, unit: '%' }] },
  { id: 'civicEducation', name: '兴学重教', attr: 'culture', group: null,
    effect: '同化 ×1.1；文化值 +5%', cost: '无',
    eval: [{ m: '文化值', v: 5, unit: '%' }, { m: '同化', v: 10, unit: '%' }] },
  { id: 'culturalCensorship', name: '言路管制', attr: 'culture', group: 'speech',
    effect: '自压 ×1.2；科技 −3%；输出 −10%', cost: '机制型（高风险）',
    eval: [{ m: '自压', v: 20, unit: '%' }, { m: '科技', v: -3, unit: '%' }, { m: '输出', v: -10, unit: '%' }] },
  { id: 'civicFestivals', name: '万民同乐', attr: 'culture', group: null,
    effect: '文化值 +5%；忠诚 +0.5/回', cost: '无',
    eval: [{ m: '文化值', v: 5, unit: '%' }, { m: '50 回忠诚', v: 25, unit: '分' }] },

  // ---- 外交（绿）----
  { id: 'goodNeighbor', name: '睦邻友好', attr: 'diplomacy', group: 'diploPosture',
    effect: '邻国关系 +2/回', cost: '无',
    eval: [{ m: '10 回关系', v: 20, unit: '点' }] },
  { id: 'toughDiplomacy', name: '强硬外交', attr: 'diplomacy', group: 'diploPosture',
    effect: '侵略阈值 +1；建交关系 −3', cost: '机制型（建交）',
    eval: [{ m: '阈值', v: 1, unit: '档' }, { m: '建交', v: -3, unit: '点' }] },
  { id: 'tradeProtection', name: '贸易保护', attr: 'diplomacy', group: 'tradeRegime',
    effect: '贸易渗透 ×0.8；伙伴关系 −0.5/回', cost: '机制型（关系）',
    eval: [{ m: '贸易收入', v: -20, unit: '%' }, { m: '10 回关系', v: -5, unit: '点' }] },
  { id: 'openSociety', name: '开放社会', attr: 'diplomacy', group: null,
    effect: '商业/科技 +5%；文化输出 −10%', cost: '机制型（文化）',
    eval: [{ m: '商业', v: BASE.commercial * 0.05, unit: '财/回' }, { m: '科技', v: 5, unit: '%' }, { m: '输出', v: -10, unit: '%' }] },
  { id: 'dollarDiplomacy', name: '金元外交', attr: 'diplomacy', group: null,
    effect: '采购 ×0.9；最差邻国 +1/回；财 0.5%', cost: '机制型（财支出）',
    eval: [{ m: '关系', v: 1, unit: '/回' }, { m: '支出', v: -BASE.taxPerTurn * 0.005, unit: '财/回' }] },
  { id: 'treatyNetwork', name: '条约体系', attr: 'diplomacy', group: 'alliance',
    effect: '同盟阈值 ×0.9；非同盟 −0.5/回', cost: '机制型（关系）',
    eval: [{ m: '同盟门槛', v: -10, unit: '%' }, { m: '10 回非同盟', v: -5, unit: '点' }] },
  { id: 'foreignAid', name: '国际援助', attr: 'diplomacy', group: null,
    effect: '最弱国 +2/回、rep +0.5/回；财 1%', cost: '机制型（财支出）',
    eval: [{ m: '关系', v: 2, unit: '/回' }, { m: 'rep', v: 0.5, unit: '/回' }, { m: '支出', v: -BASE.taxPerTurn * 0.01, unit: '财/回' }] },
  { id: 'publicDiplomacy', name: '舆论战', attr: 'diplomacy', group: null,
    effect: '输出 ×1.1；rep +0.3/回；被输出国 −0.5/回', cost: '机制型（关系）',
    eval: [{ m: '输出', v: 10, unit: '%' }, { m: '10 回 rep', v: 3, unit: '点' }, { m: '10 回关系', v: -5, unit: '点' }] },
  { id: 'nonAligned', name: '不结盟运动', attr: 'diplomacy', group: 'alliance',
    effect: '不入同盟；阈值 +2；同盟收益 ×0.5', cost: '机制型（放弃同盟）',
    eval: [{ m: '阈值', v: 2, unit: '档' }, { m: '同盟收益', v: -50, unit: '%' }] },
  { id: 'customsUnion', name: '关税同盟', attr: 'diplomacy', group: 'tradeRegime',
    effect: '渗透 ×1.2；容量 +1 档；非同盟 −0.5/回', cost: '机制型（关系）',
    eval: [{ m: '贸易收入', v: 20, unit: '%' }, { m: '10 回关系', v: -5, unit: '点' }] },

  // ---- 通用（白）----
  { id: 'civilServiceReform', name: '公务员改革', attr: 'universal', group: null,
    effect: '市政维护 ×0.85', cost: '无',
    eval: [{ m: '维护省', v: BASE.upkeep * 0.15, unit: '财/回' }] },
  { id: 'antiCorruption', name: '反腐', attr: 'universal', group: null,
    effect: '忠诚 +1/回；腐败事件免疫', cost: '无',
    eval: [{ m: '50 回忠诚', v: 50, unit: '分' }] },
  { id: 'emergencyMobilization', name: '紧急动员', attr: 'universal', group: null,
    effect: '征募费 ×0.7；宜居 −3', cost: '机制型（宜居）',
    eval: [{ m: '万人军省', v: 24000, unit: '财', oneoff: true }, { m: '宜居', v: -3, unit: '点' }] },
  { id: 'intelControl', name: '情报管制', attr: 'universal', group: null,
    effect: '反谍 +2；侦破 +10%', cost: '无（条件型）',
    eval: [{ m: '反谍', v: 2, unit: '点' }, { m: '侦破', v: 10, unit: '%' }] },
  { id: 'immigrationLimit', name: '限制移民', attr: 'universal', group: null,
    effect: '关闭入境（开关）', cost: '无（开关）',
    eval: [{ m: '外籍流入', v: 0, unit: '关闭' }] },
  { id: 'carbonQuota', name: '配额法案', attr: 'universal', group: null,
    effect: '配额 0.8；超排 10 财/碳；工业 ×0.97', cost: '机制型（工业）',
    eval: [{ m: '工业', v: -3, unit: '%' }, { m: '合规', v: 80, unit: '% 排放' }] },
  { id: 'greenTransition', name: '绿色转型', attr: 'universal', group: null,
    effect: '排放 ×0.9；工业 ×0.97', cost: '机制型（工业）',
    eval: [{ m: '排放', v: -10, unit: '%' }, { m: '工业', v: -3, unit: '%' }] },
  { id: 'smartCity', name: '智慧城市', attr: 'universal', group: 'digital',
    effect: '维护 ×0.9；忠诚 +0.3/回', cost: '无',
    eval: [{ m: '维护省', v: BASE.upkeep * 0.1, unit: '财/回' }, { m: '50 回忠诚', v: 15, unit: '分' }] },
  { id: 'landReform', name: '土地改革', attr: 'universal', group: null,
    effect: '居民楼承载 ×1.05；造价 ×0.97', cost: '无',
    eval: [{ m: '承载', v: 5, unit: '%' }, { m: '平衡人口≈', v: 2.5, unit: '%' }] },
  { id: 'warEconomy', name: '战时经济', attr: 'universal', group: null,
    effect: '战时工业 +10%；和平商业 −3%', cost: '机制型（和平）',
    eval: [{ m: '战时工业', v: 10, unit: '%' }, { m: '和平商业', v: -3, unit: '%' }] },
];

// ================= 互斥组 =================
const GROUPS = {};
for (const c of CARDS) if (c.group) (GROUPS[c.group] = GROUPS[c.group] || []).push(c.name);

// ================= 组合场景（10 槽：各属性 2 + 通用 2） =================
const SCENARIOS = [
  { name: '数量建军', cards: ['conscription', 'emergencyMobilization', 'fieldMedicine'] },
  { name: '质量建军', cards: ['generalStaff', 'armsSelfSufficiency', 'ironDiscipline'] },
  { name: '富国扩张', cards: ['taxCut', 'consumptionStimulus', 'investmentWelcome'] },
  { name: '战时财政', cards: ['taxHike', 'austerity', 'stateIndustry'] },
  { name: '人口长线', cards: ['birthSubsidy', 'infraBlitz', 'landReform'] },
  { name: '文化进攻', cards: ['screenSoftPower', 'languagePromotion', 'publicDiplomacy', 'tourismPowerhouse'] },
  { name: '文化防御', cards: ['culturalConfidence', 'culturalCensorship', 'electronicGreatWall'] },
  { name: '外交和平', cards: ['goodNeighbor', 'foreignAid', 'dollarDiplomacy'] },
  { name: '外交强势', cards: ['toughDiplomacy', 'treatyNetwork', 'customsUnion'] },
];

// ================= 工具 =================
const byId = (id) => CARDS.find((c) => c.id === id);
const SLOTS = { military: 2, economy: 2, culture: 2, diplomacy: 2, universal: 2 };
const fmt = (n) => (n >= 0 ? '+' : '') + (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : Math.round(n * 10) / 10);

// 场景合法性：槽位分配（属性卡先占本属性槽 ≤2，超出进通用槽；通用卡只进通用槽；通用槽 ≤2）
function checkScenario(sc) {
  const errs = [];
  const attrCount = { military: 0, economy: 0, culture: 0, diplomacy: 0 };
  let universalCards = 0;
  const groups = {};
  for (const id of sc.cards) {
    const c = byId(id);
    if (!c) { errs.push(`未知卡 ${id}`); continue; }
    if (c.attr === 'universal') universalCards++;
    else attrCount[c.attr]++;
    if (c.group) {
      if (groups[c.group]) errs.push(`互斥冲突：${c.name} × ${groups[c.group]}`);
      groups[c.group] = c.name;
    }
  }
  let spill = 0;
  for (const a of Object.keys(attrCount)) {
    if (attrCount[a] > SLOTS[a]) spill += attrCount[a] - SLOTS[a];
    if (spill > SLOTS.universal) errs.push(`${a} 超槽：本槽 ${SLOTS[a]} + 通用 ${SLOTS.universal} 装不下 ${attrCount[a]} 张`);
  }
  if (universalCards + spill > SLOTS.universal) errs.push(`通用槽超载：通用卡 ${universalCards} + 属性溢出 ${spill} > ${SLOTS.universal}`);
  return errs;
}

// 组合乘区极值检查（v0.2 减负后）
function comboExtremes() {
  return [
    { k: '征募费极值（兵役×紧急）', v: 0.8 * 0.7, base: 8, note: `8→${(8 * 0.56).toFixed(2)} 财/兵` },
    { k: '税率极值（增税）', v: 1.2, base: 6467, note: `+${Math.round(6467 * 0.2)} 财/回` },
    { k: '税率极值（减税）', v: 0.8, base: 6467, note: `−${Math.round(6467 * 0.2)} 财/回` },
    { k: '消费池极值（刺激×减税）', v: 1.15 * 1.08, base: 50000, note: `上限 +${Math.round(50000 * 0.242)}` },
    { k: '消费池极值（紧缩×国企）', v: 0.8 * 0.95, base: 50000, note: `上限 −${Math.round(50000 * 0.24)}` },
    { k: '文化输出极值（雅言×舆论）', v: 1.1 * 1.1, base: 100, note: '×1.21 份额' },
    { k: '文化自压极值（自信×管制）', v: 1.15 * 1.2, base: 100, note: '×1.38（受 resistCap +50% 封顶）' },
    { k: '工业极值（国企×战时）', v: 1.10 * 1.10, base: 100, note: '×1.21（战时）' },
    { k: '科技极值（百家×开放）', v: 1.05 * 1.05, base: 100, note: '×1.1025' },
    { k: '军饷极值（参谋？？v0.2 无）', v: 1.0, base: 6000, note: 'v0.2 已删军饷负面' },
  ];
}

// ================= 输出 =================
console.log('===== 政策卡数值核算盘 v0.2（基线 CN 中盘 t100） =====');
console.log(`税 ${Math.round(BASE.taxPerTurn)} 财/回 | 商业 ${BASE.commercial} | 军饷 ${BASE.salary} | 消费池 ${BASE.pool} | 文化值 ${BASE.cultureValue} | 忠诚 ${BASE.loyalty}`);
console.log('\n--- 单卡量级（只列核心评估项）---');
for (const c of CARDS) {
  console.log(`[${c.attr[0].toUpperCase()}] ${c.name.padEnd(6, '　')} ${c.effect}`);
  console.log(`   ${c.eval.map((e) => `${e.m} ${fmt(e.v)}${e.unit}`).join(' | ')}${c.cost !== '无' ? ` | 成本：${c.cost}` : ''}`);
}

console.log('\n--- 互斥组（10 组）---');
for (const [g, names] of Object.entries(GROUPS)) console.log(`  ${g.padEnd(20)} ${names.join(' × ')}`);

console.log('\n--- 组合场景合法性 ---');
let fail = 0;
for (const sc of SCENARIOS) {
  const errs = checkScenario(sc);
  if (errs.length) fail++;
  console.log(`  ${sc.name.padEnd(6, '　')} [${sc.cards.map((id) => byId(id).name).join('+')}] ${errs.length ? '❌ ' + errs.join('; ') : '✅ 槽位/互斥合法'}`);
}

console.log('\n--- 组合乘区极值（v0.2 减负后）---');
for (const e of comboExtremes()) console.log(`  ${e.k.padEnd(24)} ×${e.v.toFixed(3)}  ${e.note}`);

// ================= 判定汇总 =================
const strong = CARDS.filter((c) => c.eval.some((e) => e.m.includes('商业') && e.v >= BASE.commercial * 0.05));
console.log('\n--- 判定 ---');
console.log(`总卡数 ${CARDS.length} | 互斥组 ${Object.keys(GROUPS).length} | 组合场景 ${SCENARIOS.length}（失败 ${fail}）`);
console.log('纯正面卡：', CARDS.filter((c) => c.cost.startsWith('无')).length,
  '| 机制型成本卡：', CARDS.filter((c) => c.cost.startsWith('机制型')).length,
  '| 附加惩罚卡：', CARDS.filter((c) => c.cost.startsWith('附加')).length);
console.log('说明：机制型成本=政策定义本身（减税必然减收入/增税必伤稳定），不是附加惩罚。');
