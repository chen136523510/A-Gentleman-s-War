// sim/data/cards.js — 政策卡数据（AI 友好版 P1：一条一卡、id 在最左、改值只改 1 行）
// 权威源=docs/06-设计/00-总纲/政策卡内容专题.md v3.0（52 张：初始 50 + 特殊 2，统一结构）
// 使用：const { CARDS, INITIAL_CARDS, SPECIAL_CARDS, CARD_BY_ID } = require('../data/cards.js');
// 字段（全部卡统一）：id / name / attr(mil|eco|cul|dip|gen) / tier(早|中|后=科技解锁门槛) /
//   mutex(互斥组) / initial(是否进初始卡池) / acquire(initial|proposal) / via(特殊卡提案渠道 un|event) / fx(效果键)
// 特殊 2 张不进初始卡池：carbonQuota（UN 提案发卡）· environmentalism（环保提案/event 发卡）
// fx 键定义与落点见 policy.js 的 BIAS_KEYS/SWITCH_KEYS/COSTLIKE_KEYS
'use strict';

const CARDS = [
  // ---- 军事 10（红 · 初始）----
  { id: 'conscription', name: '全民服役', attr: 'mil', tier: '早', mutex: 'militaryDoctrine', initial: true, acquire: 'initial', fx: { serviceCap: 0.02, q: 1.03 } },            // 全民服役：上限+2pp、q+3%
  { id: 'volunteerService', name: '志愿兵役制', attr: 'mil', tier: '中', mutex: 'militaryDoctrine', initial: true, acquire: 'initial', fx: { serviceCap: -0.02, q: 1.10, salary: 1.25 } }, // 志愿兵役：上限−2pp、q+10%、军饷档↑
  { id: 'warIndustryFirst', name: '军工优先', attr: 'mil', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { arsenal: 1.15 } },                                  // 军工优先：兵工厂批次产出 ×1.15
  { id: 'armsSelfSufficiency', name: '国防自主', attr: 'mil', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { milCost: 0.90 } },                               // 国防自主：军饷+装备采购 ×0.9（进口开关占位）
  { id: 'martialSpirit', name: '国防教育', attr: 'mil', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { loyaltyFlow: 0.3 } },                                  // 国防教育：忠诚 +0.3/回（军管底线占位）
  { id: 'nuclearDeterrence', name: '核威慑战略', attr: 'mil', tier: '后', mutex: null, initial: true, acquire: 'initial', fx: { warThreshold: 2, repPerTurn: -0.2 } },             // 核威慑：被宣战阈值+2、rep−0.2/回（v1.1 降档）
  { id: 'disarmament', name: '裁军政策', attr: 'mil', tier: '后', mutex: null, initial: true, acquire: 'initial', fx: { serviceCap: -0.02, repPerTurn: 0.2, relFlow: 0.2 } },    // 裁军：上限−2pp、rep/关系↑（降档）
  { id: 'militaryBusiness', name: '军队经商', attr: 'mil', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { milIncome: 0.01, q: 0.90, loyaltyFlow: -0.3, repPerTurn: -0.2 } }, // 军队经商：0.01财/兵/回、q×0.9（唯一强负面）
  { id: 'electronicGreatWall', name: '电子长城', attr: 'mil', tier: '后', mutex: 'digital', initial: true, acquire: 'initial', fx: { tech: 0.97, counterSpy: 1 } },              // 电子长城：科技−3%、反谍+1（互联网乘数失效占位）
  { id: 'peacekeeping', name: '维和行动', attr: 'mil', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { repPerTurn: 0.3, relWar: 0.2, upkeep: 1.005 } },        // 维和行动：rep+0.3、对交战国关系+0.2、财支出+0.5%（降档）
  // ---- 经济 10（黄 · 初始）----
  { id: 'taxCut', name: '减税', attr: 'eco', tier: '早', mutex: 'tax', initial: true, acquire: 'initial', fx: { tax: 0.85, pool: 1.08, W: 1 } },                            // 减税：税−15%、池+8%、W+1
  { id: 'taxHike', name: '增税', attr: 'eco', tier: '中', mutex: 'tax', initial: true, acquire: 'initial', fx: { tax: 1.20, pool: 0.95, W: -1 } },                           // 增税：税+20%、池−5%、W−1
  { id: 'birthSubsidy', name: '生育补贴', attr: 'eco', tier: '早', mutex: 'population', initial: true, acquire: 'initial', fx: { growth: 1.12, subsidyCost: 0.0025 } },          // 生育补贴：g×1.12、人口半数补贴 0.0025财/人/回
  { id: 'birthControl', name: '优生优育', attr: 'eco', tier: '中', mutex: 'population', initial: true, acquire: 'initial', fx: { liv: 5, growth: 0.85 } },                       // 优生优育：宜居+5、g×0.85
  { id: 'privatization', name: '私有化', attr: 'eco', tier: '中', mutex: 'industry', initial: true, acquire: 'initial', fx: { comm: 1.15, pool: 1.025 } },                     // 私有化：商业×1.15、池×1.025（v1.2：池±5% 在建造盘有复利放大，幅度减半保留方向）
  { id: 'stateIndustry', name: '国有化', attr: 'eco', tier: '中', mutex: 'industry', initial: true, acquire: 'initial', fx: { fisc: 1.07, pool: 0.975 } },                      // 国有化：总财收×1.07、池×0.975（v1.2 同上）
  { id: 'infraBlitz', name: '基建狂魔', attr: 'eco', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { cost: 0.90 } },                                           // 基建狂魔：建筑造价 ×0.9（v2.4 院长口径）
  { id: 'welfareState', name: '福利国家', attr: 'eco', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { W: 3, upkeep: 1.005 } },                                // 福利国家：W+3、财支出+0.5%
  { id: 'industrialSubsidy', name: '产业补贴', attr: 'eco', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { industry: 1.10, upkeep: 1.005 } },                 // 产业补贴：工业×1.10（增量接入）、财支出+0.5%
  { id: 'antitrust', name: '反垄断', attr: 'eco', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { pool: 1.08, comm: 0.95 } },                                // 反垄断：池×1.08、商业×0.95
  // ---- 文化 10（紫 · 初始）----
  { id: 'heritageProtection', name: '文化遗产保护', attr: 'cul', tier: '早', mutex: 'heritage', initial: true, acquire: 'initial', fx: { out: 1.05, culEnt: 1.05 } },                // 文化遗产保护：文化值+5%、娱乐文化值+5%（抵抗删除后改纯产出双线，11-24）
  { id: 'fourOlds', name: '破四旧', attr: 'cul', tier: '早', mutex: 'heritage', initial: true, acquire: 'initial', fx: { out: 0.85, tech: 1.10 } },                            // 破四旧：文化×0.85、科技×1.10（第二张可感知负面）
  { id: 'tourismPowerhouse', name: '全域旅游', attr: 'cul', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { tourCap: 1.3, tourIncome: 1.2 } },                 // 全域旅游：文旅容量×1.3、收入×1.2
  { id: 'screenSoftPower', name: '文化产业', attr: 'cul', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { culEnt: 1.15 } },                                    // 文化产业：娱乐线文化值 ×1.15
  { id: 'academicFreedom', name: '百家争鸣', attr: 'cul', tier: '中', mutex: 'speech', initial: true, acquire: 'initial', fx: { tech: 1.05, out: 1.05 } },                       // 百家争鸣：科技+5%、输出+5%
  { id: 'civicEducation', name: '义务教育', attr: 'cul', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { out: 1.05, assimil: 1.15 } },                         // 义务教育：文化值+5%、同化×1.15
  { id: 'culturalCensorship', name: '言论管制', attr: 'cul', tier: '中', mutex: 'speech', initial: true, acquire: 'initial', fx: { self: 1.2, out: 0.90, W: -3 } },              // 言论管制：自压×1.2（self=单卡专属特殊乘区，非通用抵抗，11-24 院长定性）、输出−10%、W−3
  { id: 'doubleReduction', name: '教育双减', attr: 'cul', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { W: 3, tech: 0.97 } },                                // 教育双减：W+3、科技−3%
  { id: 'nationalism', name: '民族主义', attr: 'cul', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { relFlow: -0.3, loyaltyFlow: 1, serviceCap: 0.01 } },     // 民族主义：关系−0.3/回（降档）、本国城忠诚+1/回、上限+1pp
  { id: 'feminism', name: '女权主义', attr: 'cul', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { repPerTurn: 0.2, comm: 0.97, industry: 0.97, loyaltyFlow: -0.5 } }, // 女权主义：rep+0.2（降档）、工业商业×0.97、忠诚−0.5
  // ---- 外交 10（绿 · 初始 · §5.12 三线；v1.1 关系/声誉流全类降档——院长 11-24 第 1 条）----
  { id: 'goodNeighbor', name: '和平共处', attr: 'dip', tier: '早', mutex: 'diploPosture', initial: true, acquire: 'initial', fx: { relFlow: 0.2 } },                             // 和平共处（温和）：建交国关系 +0.2/回
  { id: 'toughDiplomacy', name: '铁腕外交', attr: 'dip', tier: '中', mutex: 'diploPosture', initial: true, acquire: 'initial', fx: { warThreshold: 1, relFlow: -0.2 } },         // 铁腕外交（强硬）：宣战阈值+1、关系−0.2/回
  { id: 'tradeProtection', name: '贸易保护', attr: 'dip', tier: '中', mutex: 'tradeRegime', initial: true, acquire: 'initial', fx: { relFlow: -0.3 } },                          // 贸易保护（中性）：渗透↓（双向，sim 无渗透系统=占位）
  { id: 'nonAligned', name: '不结盟运动', attr: 'dip', tier: '中', mutex: 'alliance', initial: true, acquire: 'initial', fx: { warThreshold: 1, noAlliance: 1 } },                 // 不结盟运动（中性）：不进同盟、阈值+1
  { id: 'foreignAid', name: '发展援助', attr: 'dip', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { relWeakest: 1.0, repPerTurn: 0.3, upkeep: 1.01 } },         // 发展援助（温和）：最弱国关系+1/回（降档）、rep+0.3、财支出+1%
  { id: 'multilateralism', name: '多边主义', attr: 'dip', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { repPerTurn: 0.2, relFlow: 0.15 } },                   // 多边主义（温和）：rep+0.2、关系+0.15/回（降档）
  { id: 'hegemony', name: '霸权主义', attr: 'dip', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { relVsWeak: -0.3, buyPriceMul: 0.85, repPerTurn: -0.2 } },   // 霸权主义（强硬）：对弱国关系−0.3/回（降档）、采购价×0.85、rep−0.2
  { id: 'colonialism', name: '殖民主义', attr: 'dip', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { out: 1.10, repPerTurn: -0.3 } },                         // 殖民主义（强硬）：对弱国输出×1.1（近似 out）、rep−0.3（降档）
  { id: 'absoluteNeutrality', name: '绝对中立', attr: 'dip', tier: '中', mutex: 'diploPosture', initial: true, acquire: 'initial', fx: { canDeclareWar: 1, relFlow: 0.3, repPerTurn: 0.3 } }, // 绝对中立：无法宣战（仅自身）、关系+0.3/回、rep+0.3（降档）
  { id: 'customsUnion', name: '自贸协定', attr: 'dip', tier: '后', mutex: 'tradeRegime', initial: true, acquire: 'initial', fx: { comm: 1.05, relFlow: -0.3 } },                 // 自贸协定：渗透/容量 sim 近似 comm×1.05、非同盟关系−0.3/回（降档）
  // ---- 通用 10（白 · 初始）----
  { id: 'civilServiceReform', name: '公务员改革', attr: 'gen', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { upkeep: 0.85 } },                                 // 公务员改革：市政维护 ×0.85
  { id: 'antiCorruption', name: '反腐倡廉', attr: 'gen', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { loyaltyFlow: 1 } },                                   // 反腐倡廉：忠诚 +1/回（最强档；腐败事件免疫占位）
  { id: 'realNameSystem', name: '网络实名制', attr: 'gen', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { counterSpy: 1, W: -1 } },                             // 网络实名制：反谍+1、W−1
  { id: 'immigrationLimit', name: '移民管制', attr: 'gen', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { immigration: 1 } },                                 // 移民管制：入境开关（sim 无移民=占位）
  { id: 'greenTransition', name: '绿色转型', attr: 'gen', tier: '后', mutex: null, initial: true, acquire: 'initial', fx: { emit: 0.90, industry: 0.97 } },                      // 绿色转型：排放×0.90、工业×0.97
  { id: 'universalHealthcare', name: '全民医保', attr: 'gen', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { W: 3, upkeep: 1.005 } },                         // 全民医保：W+3、财支出+0.5%
  { id: 'delayedRetirement', name: '延迟退休', attr: 'gen', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { W: -2, loyaltyFlow: -0.3, comm: 1.05, industry: 1.05 } }, // 延迟退休：W−2、忠诚−0.3、产出×1.05
  { id: 'drugProcurement', name: '药品集采', attr: 'gen', tier: '中', mutex: null, initial: true, acquire: 'initial', fx: { W: 2, liv: 1, growth: 1.05, upkeep: 1.005 } },       // 药品集采：W+2、宜居+1、g×1.05、财支出+0.5%
  { id: 'foodSecurity', name: '耕地红线', attr: 'gen', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { food: 1.10 } },                                         // 耕地红线（四裁移入通用）：粮产 ×1.10
  { id: 'wasteSorting', name: '垃圾分类', attr: 'gen', tier: '早', mutex: null, initial: true, acquire: 'initial', fx: { liv: 2, emit: 0.95 } },                                 // 垃圾分类（四裁移入通用）：宜居+2、排放×0.95
  // ---- 特殊 2（不进初始卡池 · 提案获取 · 字段结构与普通卡完全一致）----
  { id: 'carbonQuota', name: '碳排放配额', attr: 'gen', tier: '中', mutex: null, initial: false, acquire: 'proposal', via: 'un', fx: { industry: 0.97 } },                       // 配额制：工业×0.97；UN 提案发卡
  { id: 'environmentalism', name: '环境保护政策', attr: 'gen', tier: '中', mutex: null, initial: false, acquire: 'proposal', via: 'event', fx: { liv: 5, polluteBan: 1, polluteOut: 0.7 } }, // 宜居+5；污染建筑禁建/禁升级；有污染建筑产出×0.7（发电不参与）；环保提案/event 发卡
];

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const INITIAL_CARDS = CARDS.filter((c) => c.initial);
const SPECIAL_CARDS = CARDS.filter((c) => !c.initial);
const ATTR_NAME = { mil: '军', eco: '经', cul: '文', dip: '外', gen: '通' };
const SLOTS_PER_ATTR = 2;

module.exports = { CARDS, INITIAL_CARDS, SPECIAL_CARDS, CARD_BY_ID, ATTR_NAME, SLOTS_PER_ATTR };
