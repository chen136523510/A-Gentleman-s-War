// sim/data/cards.js — 政策卡数据（AI 友好版 P1：一条一卡、id 在最左、改值只改 1 行）
// 权威源=docs/06-设计/00-总纲/政策卡内容专题.md v3.0（52 张：普通 50 + 特殊 2 另见文末）
// 使用：const { CARDS, CARD_BY_ID } = require('../data/cards.js');
// 字段：id / attr(mil|eco|cul|dip|gen) / tier(早|中|后=科技解锁门槛) / mutex(互斥组) / fx(效果键)
// fx 键定义与落点见 policy.js 的 BIAS_KEYS/SWITCH_KEYS/COSTLIKE_KEYS
'use strict';

const CARDS = [
  // ---- 军事 10（红）----
  { id: 'conscription', attr: 'mil', tier: '早', mutex: 'militaryDoctrine', fx: { serviceCap: 0.02, q: 1.03 } },            // 全民服役：上限+2pp、q+3%
  { id: 'volunteerService', attr: 'mil', tier: '中', mutex: 'militaryDoctrine', fx: { serviceCap: -0.02, q: 1.10, salary: 1.25 } }, // 志愿兵役：上限−2pp、q+10%、军饷档↑
  { id: 'warIndustryFirst', attr: 'mil', tier: '中', mutex: null, fx: { arsenal: 1.15 } },                                  // 军工优先：兵工厂批次产出 ×1.15
  { id: 'armsSelfSufficiency', attr: 'mil', tier: '中', mutex: null, fx: { milCost: 0.90 } },                               // 国防自主：军饷+装备采购 ×0.9（进口开关占位）
  { id: 'martialSpirit', attr: 'mil', tier: '中', mutex: null, fx: { loyaltyFlow: 0.3 } },                                  // 国防教育：忠诚 +0.3/回（军管底线占位）
  { id: 'nuclearDeterrence', attr: 'mil', tier: '后', mutex: null, fx: { warThreshold: 2, repPerTurn: -0.2 } },             // 核威慑：被宣战阈值+2、rep−0.2/回（v1.1 降档）
  { id: 'disarmament', attr: 'mil', tier: '后', mutex: null, fx: { serviceCap: -0.02, repPerTurn: 0.2, relFlow: 0.2 } },    // 裁军：上限−2pp、rep/关系↑（降档）
  { id: 'militaryBusiness', attr: 'mil', tier: '中', mutex: null, fx: { milIncome: 0.01, q: 0.90, loyaltyFlow: -0.3, repPerTurn: -0.2 } }, // 军队经商：0.01财/兵/回、q×0.9（唯一强负面）
  { id: 'electronicGreatWall', attr: 'mil', tier: '后', mutex: 'digital', fx: { tech: 0.97, counterSpy: 1 } },              // 电子长城：科技−3%、反谍+1（互联网乘数失效占位）
  { id: 'peacekeeping', attr: 'mil', tier: '中', mutex: null, fx: { repPerTurn: 0.3, relWar: 0.2, upkeep: 1.005 } },        // 维和行动：rep+0.3、对交战国关系+0.2、财支出+0.5%（降档）
  // ---- 经济 10（黄）----
  { id: 'taxCut', attr: 'eco', tier: '早', mutex: 'tax', fx: { tax: 0.85, pool: 1.08, W: 1 } },                            // 减税：税−15%、池+8%、W+1
  { id: 'taxHike', attr: 'eco', tier: '中', mutex: 'tax', fx: { tax: 1.20, pool: 0.95, W: -1 } },                           // 增税：税+20%、池−5%、W−1
  { id: 'birthSubsidy', attr: 'eco', tier: '早', mutex: 'population', fx: { growth: 1.12, subsidyCost: 0.0025 } },          // 生育补贴：g×1.12、人口半数补贴 0.0025财/人/回
  { id: 'birthControl', attr: 'eco', tier: '中', mutex: 'population', fx: { liv: 5, growth: 0.85 } },                       // 优生优育：宜居+5、g×0.85
  { id: 'privatization', attr: 'eco', tier: '中', mutex: 'industry', fx: { comm: 1.15, pool: 1.025 } },                     // 私有化：商业×1.15、池×1.025（v1.2：池±5% 在建造盘有复利放大，幅度减半保留方向）
  { id: 'stateIndustry', attr: 'eco', tier: '中', mutex: 'industry', fx: { fisc: 1.07, pool: 0.975 } },                      // 国有化：总财收×1.07、池×0.975（v1.2 同上）
  { id: 'infraBlitz', attr: 'eco', tier: '早', mutex: null, fx: { cost: 0.90 } },                                           // 基建狂魔：建筑造价 ×0.9（v2.4 院长口径）
  { id: 'welfareState', attr: 'eco', tier: '中', mutex: null, fx: { W: 3, upkeep: 1.005 } },                                // 福利国家：W+3、财支出+0.5%
  { id: 'industrialSubsidy', attr: 'eco', tier: '中', mutex: null, fx: { industry: 1.10, upkeep: 1.005 } },                 // 产业补贴：工业×1.10（增量接入）、财支出+0.5%
  { id: 'antitrust', attr: 'eco', tier: '中', mutex: null, fx: { pool: 1.08, comm: 0.95 } },                                // 反垄断：池×1.08、商业×0.95
  // ---- 文化 10（紫）----
  { id: 'heritageProtection', attr: 'cul', tier: '早', mutex: 'heritage', fx: { out: 1.05, resistPubBias: 0.01 } },         // 文化遗产保护：文化值+5%、resistPub 3%→4%/座级
  { id: 'fourOlds', attr: 'cul', tier: '早', mutex: 'heritage', fx: { out: 0.85, tech: 1.10 } },                            // 破四旧：文化×0.85、科技×1.10（第二张可感知负面）
  { id: 'tourismPowerhouse', attr: 'cul', tier: '中', mutex: null, fx: { tourCap: 1.3, tourIncome: 1.2 } },                 // 全域旅游：文旅容量×1.3、收入×1.2
  { id: 'screenSoftPower', attr: 'cul', tier: '中', mutex: null, fx: { culEnt: 1.15 } },                                    // 文化产业：娱乐线文化值 ×1.15
  { id: 'academicFreedom', attr: 'cul', tier: '中', mutex: 'speech', fx: { tech: 1.05, out: 1.05 } },                       // 百家争鸣：科技+5%、输出+5%
  { id: 'civicEducation', attr: 'cul', tier: '早', mutex: null, fx: { out: 1.05, assimil: 1.15 } },                         // 义务教育：文化值+5%、同化×1.15
  { id: 'culturalCensorship', attr: 'cul', tier: '中', mutex: 'speech', fx: { self: 1.2, out: 0.90, W: -3 } },              // 言论管制：自压×1.2、输出−10%、W−3
  { id: 'doubleReduction', attr: 'cul', tier: '中', mutex: null, fx: { W: 3, tech: 0.97 } },                                // 教育双减：W+3、科技−3%
  { id: 'nationalism', attr: 'cul', tier: '中', mutex: null, fx: { relFlow: -0.3, loyaltyFlow: 1, serviceCap: 0.01 } },     // 民族主义：关系−0.3/回（降档）、本国城忠诚+1/回、上限+1pp
  { id: 'feminism', attr: 'cul', tier: '中', mutex: null, fx: { repPerTurn: 0.2, comm: 0.97, industry: 0.97, loyaltyFlow: -0.5 } }, // 女权主义：rep+0.2（降档）、工业商业×0.97、忠诚−0.5
  // ---- 外交 10（绿 · §5.12 三线；v1.1 关系/声誉流全类降档——院长 11-24 第 1 条）----
  { id: 'goodNeighbor', attr: 'dip', tier: '早', mutex: 'diploPosture', fx: { relFlow: 0.2 } },                             // 和平共处（温和）：建交国关系 +0.2/回
  { id: 'toughDiplomacy', attr: 'dip', tier: '中', mutex: 'diploPosture', fx: { warThreshold: 1, relFlow: -0.2 } },         // 铁腕外交（强硬）：宣战阈值+1、关系−0.2/回
  { id: 'tradeProtection', attr: 'dip', tier: '中', mutex: 'tradeRegime', fx: { relFlow: -0.3 } },                          // 贸易保护（中性）：渗透↓（双向，sim 无渗透系统=占位）
  { id: 'nonAligned', attr: 'dip', tier: '中', mutex: 'alliance', fx: { warThreshold: 1, noAlliance: 1 } },                 // 不结盟运动（中性）：不进同盟、阈值+1
  { id: 'foreignAid', attr: 'dip', tier: '早', mutex: null, fx: { relWeakest: 1.0, repPerTurn: 0.3, upkeep: 1.01 } },         // 发展援助（温和）：最弱国关系+1/回（降档）、rep+0.3、财支出+1%
  { id: 'multilateralism', attr: 'dip', tier: '中', mutex: null, fx: { repPerTurn: 0.2, relFlow: 0.15 } },                   // 多边主义（温和）：rep+0.2、关系+0.15/回（降档）
  { id: 'hegemony', attr: 'dip', tier: '中', mutex: null, fx: { relVsWeak: -0.3, buyPriceMul: 0.85, repPerTurn: -0.2 } },   // 霸权主义（强硬）：对弱国关系−0.3/回（降档）、采购价×0.85、rep−0.2
  { id: 'colonialism', attr: 'dip', tier: '中', mutex: null, fx: { out: 1.10, repPerTurn: -0.3 } },                         // 殖民主义（强硬）：对弱国输出×1.1（近似 out）、rep−0.3（降档）
  { id: 'absoluteNeutrality', attr: 'dip', tier: '中', mutex: 'diploPosture', fx: { canDeclareWar: 1, relFlow: 0.3, repPerTurn: 0.3 } }, // 绝对中立：无法宣战（仅自身）、关系+0.3/回、rep+0.3（降档）
  { id: 'customsUnion', attr: 'dip', tier: '后', mutex: 'tradeRegime', fx: { comm: 1.05, relFlow: -0.3 } },                 // 自贸协定：渗透/容量 sim 近似 comm×1.05、非同盟关系−0.3/回（降档）
  // ---- 通用 10（白）----
  { id: 'civilServiceReform', attr: 'gen', tier: '早', mutex: null, fx: { upkeep: 0.85 } },                                 // 公务员改革：市政维护 ×0.85
  { id: 'antiCorruption', attr: 'gen', tier: '中', mutex: null, fx: { loyaltyFlow: 1 } },                                   // 反腐倡廉：忠诚 +1/回（最强档；腐败事件免疫占位）
  { id: 'realNameSystem', attr: 'gen', tier: '中', mutex: null, fx: { counterSpy: 1, W: -1 } },                             // 网络实名制：反谍+1、W−1
  { id: 'immigrationLimit', attr: 'gen', tier: '早', mutex: null, fx: { immigration: 1 } },                                 // 移民管制：入境开关（sim 无移民=占位）
  { id: 'greenTransition', attr: 'gen', tier: '后', mutex: null, fx: { emit: 0.90, industry: 0.97 } },                      // 绿色转型：排放×0.90、工业×0.97
  { id: 'universalHealthcare', attr: 'gen', tier: '中', mutex: null, fx: { W: 3, upkeep: 1.005 } },                         // 全民医保：W+3、财支出+0.5%
  { id: 'delayedRetirement', attr: 'gen', tier: '中', mutex: null, fx: { W: -2, loyaltyFlow: -0.3, comm: 1.05, industry: 1.05 } }, // 延迟退休：W−2、忠诚−0.3、产出×1.05
  { id: 'drugProcurement', attr: 'gen', tier: '中', mutex: null, fx: { W: 2, liv: 1, growth: 1.05, upkeep: 1.005 } },       // 药品集采：W+2、宜居+1、g×1.05、财支出+0.5%
  { id: 'foodSecurity', attr: 'gen', tier: '早', mutex: null, fx: { food: 1.10 } },                                         // 耕地红线（四裁移入通用）：粮产 ×1.10
  { id: 'wasteSorting', attr: 'gen', tier: '早', mutex: null, fx: { liv: 2, emit: 0.95 } },                                 // 垃圾分类（四裁移入通用）：宜居+2、排放×0.95
];

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const ATTR_NAME = { mil: '军', eco: '经', cul: '文', dip: '外', gen: '通' };
const SLOTS_PER_ATTR = 2;

module.exports = { CARDS, CARD_BY_ID, ATTR_NAME, SLOTS_PER_ATTR };
