// sim/data/scenarios.js — 剧本数据（结构化 · 院长 2026-11-24 第 2 条：模拟用自由盘/复苏副本，不用教学盘）
// 依据：docs/06-设计/00-总纲/游戏模式与副本规划.md（复苏=主副本/通用规则基准）
// 2026-11-27 院长裁（v27）：**复苏简化=8 阵营各 2 城（八足鼎立），无空城/不做空城占领**；
//   8 大统领在职 + 13 将在野，**每城至少 1 个武将**（21 将实体化，见 officers.js）；俸禄只发在职（8×104=832/回）。
// sim 侧映射（报告注明）：市政府无对应建筑→省略（维护并入市政维护）；军营→arsenal(兵工厂)；农业区→farm；居民区→residence
//   「固定城位随机分配」→ sim 简化为固定分配（阵营↔城位一一对应）；随机化随 ScenarioDefinition 接线
//   「科技起点=主科技树早期」→ 初始赠 3 个早期节点（mil1/ai1/grn1）
// 用法：node sim/v27/revival.js 200 1 --scenario=revival（默认 tutorial 兼容历史盘）
'use strict';

// ================= 教学盘（v22 基线实例：14 城/4 阵营；历史盘口径，勿改） =================
const TUTORIAL = {
  id: 'tutorial',
  desc: '教学关卡（v22 基线）：东亚 14 城 / CN·JP·KR·AU + 达尔文无主村落',
  cities: [
    ['北京', 'CN', 256000, 55, 5], ['上海', 'CN', 360000, 55, 6], ['深圳', 'CN', 320000, 50, 3],
    ['香港', 'CN', 224000, 35, 4], ['台北', 'CN', 200000, 50, 3], ['西安', 'CN', 160000, 55, 5],
    ['东京', 'JP', 400000, 60, 7], ['名古屋', 'JP', 208000, 55, 3], ['长崎', 'JP', 144000, 50, 3],
    ['首尔', 'KR', 304000, 55, 4], ['仁川', 'KR', 176000, 50, 2],
    ['悉尼', 'AU', 208000, 65, 5], ['墨尔本', 'AU', 176000, 70, 5],
    ['达尔文', 'NONE', 48000, 40, 1],
  ],
  adj: { CN: ['KR', 'JP'], KR: ['CN', 'JP'], JP: ['CN', 'KR'], AU: [] },
  coastal: ['上海', '深圳', '香港', '台北', '东京', '名古屋', '长崎', '首尔', '仁川', '悉尼', '墨尔本', '达尔文'],
  resources: {
    CN: { iron: 576, coal: 576, oil: 86.4, uranium: 48 },
    JP: { iron: 288, coal: 288, oil: 48, uranium: 0 },
    KR: { iron: 192, coal: 192, oil: 24, uranium: 0 },
    AU: { iron: 576, coal: 192, oil: 115.2, uranium: 48 },
  },
  // 初始建筑（run 内按城名/人口判定，此字段仅复苏盘显式使用）
  initBuildings: null,
  startTech: [],
};

// ================= 复苏盘（主副本 · 通用规则基准；白机初值，全部可调） =================
// 2026-11-27 院长裁（v27）：**8 阵营各 2 城（八足鼎立）、无空城、不做空城占领**；
//   中国地图高真实度；城市名=现代名（高辨识度）；8 阵营=8 大统领（玩家占 1）；国名自由/简称≤2字/颜色自选；
//   叙事=诸侯争霸军阀混战。城位=战前大城市遗址（中国地图 16 城）；人口按战后重建低水平（×8 尺度）。
// 城对=地理相邻（城级邻接表推导）：北京+郑州/上海+福州/广州+长沙/成都+昆明/西安+太原/武汉+重庆/沈阳+哈尔滨/兰州+乌鲁木齐
const REVIVAL_CITY_SLOTS = [
  // [城名, 阵营, 人口, 宜居基线 q, 基础文化] —— 每阵营 2 城（主城 120000 + 副城 48000，八足鼎立）
  ['北京', 'F1', 120000, 50, 3], ['郑州', 'F1', 48000, 45, 1],
  ['上海', 'F2', 120000, 50, 3], ['福州', 'F2', 48000, 45, 1],
  ['广州', 'F3', 120000, 50, 3], ['长沙', 'F3', 48000, 45, 1],
  ['成都', 'F4', 120000, 50, 3], ['昆明', 'F4', 48000, 45, 1],
  ['西安', 'F5', 120000, 50, 3], ['太原', 'F5', 48000, 45, 1],
  ['武汉', 'F6', 120000, 50, 3], ['重庆', 'F6', 48000, 45, 1],
  ['沈阳', 'F7', 120000, 50, 3], ['哈尔滨', 'F7', 48000, 45, 1],
  ['兰州', 'F8', 120000, 50, 3], ['乌鲁木齐', 'F8', 48000, 40, 1],
];
const REVIVAL_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
// 城级邻接（16 城，20 条边；真实地理+铁路干线——Unity/L3 用此表）
const REVIVAL_CITY_ADJ = {
  北京: ['沈阳', '太原', '郑州'], 上海: ['郑州', '武汉', '福州'], 广州: ['长沙', '福州'],
  成都: ['西安', '重庆', '昆明'], 西安: ['太原', '郑州', '兰州', '成都'],
  武汉: ['郑州', '上海', '长沙', '重庆'], 沈阳: ['北京', '哈尔滨'], 兰州: ['西安', '乌鲁木齐'],
  哈尔滨: ['沈阳'], 太原: ['北京', '西安'], 郑州: ['北京', '上海', '西安', '武汉'],
  福州: ['上海', '广州'], 长沙: ['武汉', '广州', '重庆'], 重庆: ['成都', '武汉', '长沙'],
  昆明: ['成都'], 乌鲁木齐: ['兰州'],
};
// 阵营级邻接（2026-11-27 由城对+城级邻接推导：任一己方城与对方任一城相邻即接壤；对称）
const REVIVAL_ADJ = {
  F1: ['F7', 'F5', 'F2', 'F6'], // 北京+郑州：沈阳 西安/太原 上海 武汉
  F2: ['F1', 'F6', 'F3'],       // 上海+福州：郑州 武汉 广州
  F3: ['F2', 'F6'],             // 广州+长沙：福州 武汉/重庆
  F4: ['F5', 'F6'],             // 成都+昆明：西安 重庆
  F5: ['F1', 'F8', 'F4'],       // 西安+太原：郑州/北京 兰州 成都
  F6: ['F1', 'F2', 'F3', 'F4'], // 武汉+重庆：郑州 上海 长沙 成都
  F7: ['F1'],                   // 沈阳+哈尔滨：北京
  F8: ['F5'],                   // 兰州+乌鲁木齐：西安
};
// 21 将落位（2026-11-27 院长裁：每城至少 1 个武将；8 大统领在职 + 13 在野）：
//   [officerId, 城市, 角色] —— leader=大统领（在职，发俸禄 104/回）/ free=在野（不发俸禄，可被该城控制者招募）
//   sim 固定分配；「大统领随机抽取」随 ScenarioDefinition 接线。王乐添 loyaltyInit=45（近叛逃线，测试用）。
const REVIVAL_OFFICER_SLOTS = [
  ['chenrui', '北京', 'leader'], ['qiuxuming', '上海', 'leader'], ['mayijie', '广州', 'leader'],
  ['lumuyang', '成都', 'leader'], ['ninghaoran', '西安', 'leader'], ['xuhaosen', '武汉', 'leader'],
  ['zhangxun', '沈阳', 'leader'], ['wangyukun', '兰州', 'leader'],
  ['chenlipeng', '北京', 'free'], ['chenzijian', '郑州', 'free'], ['raozhirui', '福州', 'free'],
  ['yuanchongxuan', '长沙', 'free'], ['zhuyuhan', '昆明', 'free'], ['luchengkun', '太原', 'free'],
  ['weijiahao', '重庆', 'free'], ['chenjunjie', '哈尔滨', 'free'], ['wangletian', '乌鲁木齐', 'free'],
  ['chennan', '上海', 'free'], ['huangxueyuan', '广州', 'free'], ['zouzhihua', '武汉', 'free'],
  ['pangkailei', '成都', 'free'],
];
// 8 阵营人格（8 种，覆盖军事/文化/商业/科技 四倾向 × 激进/谨慎 两档）
const REVIVAL_LEADERS = {
  F1: { aggression: 0.70, caution: 0.35, loyalty: 0.60, greed: 0.70, culture: 0.40, tech: 0.55, economy: 0.60, temperature: 0.30, governance: 'military', affinity: {}, seekProtection: null },
  F2: { aggression: 0.25, caution: 0.70, loyalty: 0.75, greed: 0.45, culture: 0.90, tech: 0.60, economy: 0.55, temperature: 0.55, governance: 'culture', affinity: {}, seekProtection: null },
  F3: { aggression: 0.40, caution: 0.60, loyalty: 0.65, greed: 0.85, culture: 0.50, tech: 0.50, economy: 0.90, temperature: 0.50, governance: 'commerce', affinity: {}, seekProtection: null },
  F4: { aggression: 0.30, caution: 0.75, loyalty: 0.70, greed: 0.50, culture: 0.55, tech: 0.95, economy: 0.60, temperature: 0.45, governance: 'tech', affinity: {}, seekProtection: null },
  F5: { aggression: 0.85, caution: 0.20, loyalty: 0.40, greed: 0.75, culture: 0.35, tech: 0.45, economy: 0.50, temperature: 0.25, governance: 'military', affinity: {}, seekProtection: null },
  F6: { aggression: 0.20, caution: 0.85, loyalty: 0.90, greed: 0.30, culture: 0.70, tech: 0.70, economy: 0.65, temperature: 0.60, governance: 'culture', affinity: {}, seekProtection: null },
  F7: { aggression: 0.55, caution: 0.50, loyalty: 0.60, greed: 0.60, culture: 0.45, tech: 0.60, economy: 0.75, temperature: 0.40, governance: 'commerce', affinity: {}, seekProtection: null },
  F8: { aggression: 0.35, caution: 0.65, loyalty: 0.80, greed: 0.40, culture: 0.60, tech: 0.80, economy: 0.55, temperature: 0.65, governance: 'tech', affinity: {}, seekProtection: null },
};
// 资源：8 阵营统一中等（战后均贫；矿脉档位机制照常递减）
const REVIVAL_RESOURCES = Object.fromEntries(REVIVAL_IDS.map((id) => [id, { iron: 288, coal: 288, oil: 48, uranium: 24 }]));

// 国名池（诸侯争霸军阀混战风：20 组国名+简称；玩家自由填国名/简称≤2字，AI 随机 7 组不重复）
const REVIVAL_FACTION_NAMES = [
  ['大秦', '秦'], ['西楚', '楚'], ['南齐', '齐'], ['北燕', '燕'], ['前赵', '赵'],
  ['后魏', '魏'], ['东吴', '吴'], ['南越', '越'], ['大蜀', '蜀'], ['大汉', '汉'],
  ['大唐', '唐'], ['大宋', '宋'], ['南梁', '梁'], ['大陈', '陈'], ['大周', '周'],
  ['大郑', '郑'], ['大辽', '辽'], ['大夏', '夏'], ['西凉', '凉'], ['大商', '商'],
];
// 国旗颜色池（玩家自选，AI 随机不重复；hex 供 Unity 直接用）
const REVIVAL_COLORS = ['#C0392B', '#1F2D3D', '#2E86C1', '#F1C40F', '#7D3C98', '#1E8449', '#E67E22', '#ECF0F1'];

const REVIVAL = {
  id: 'revival',
  desc: '复苏副本（主副本/通用规则基准）：8 阵营各 2 城（八足鼎立，共 16 城，无空城）；最小建筑；科技起点赠 3 早期节点',
  cities: REVIVAL_CITY_SLOTS,
  adj: REVIVAL_ADJ,           // 阵营级（sim 现用）
  cityAdj: REVIVAL_CITY_ADJ,  // 城级（Unity/L3 用）
  officerSlots: REVIVAL_OFFICER_SLOTS, // 21 将落位（每城≥1；8 leader 在职 + 13 free 在野）
  namePool: REVIVAL_FACTION_NAMES,
  colorPool: REVIVAL_COLORS,
  coastal: ['上海', '广州', '福州'], // 复苏城位沿海者（海平面三级受影响）
  resources: REVIVAL_RESOURCES,
  leaders: REVIVAL_LEADERS,
  // 初始建筑：每城 farm 1 + residence 1 + arsenal 1（军营）+ academy 1（战前遗留学校，供科技链起步）
  // 复苏无「市政府」建筑（sim 无对应；维护并入市政维护）；无空城（11-27 院长裁）
  initBuildings: { farm: 1, residence: 1, arsenal: 1, academy: 1 },
  startTech: ['mil1', 'ai1', 'grn1'], // 科技起点=主科技树早期（3 节点免费）
  buildReserve: 0, // AI 建造储备线（实测无效：阻断商业建筑→消费池无法变现→国库更差；保留开关供极端场景）
  // 2026-11-27 院长裁：俸禄只发在职武将（8 大统领=8×104=832/回）；generalsPerCity 折算口径删除（v27 武将实体化按 officerSlots 计）
  //   13 将在野分布在 16 城（每城至少 1 个武将）；在野只能被该城控制者招募；欠俸=该将忠诚 −1/回
  // 2026-11-25 院长澄清：**不锁路线、游戏内不写路线/胜利路径文本**；几乎所有 AI 有追求胜利倾向，
  //   极少数"偏安一隅"型武将当大统领时不刻意追求胜利（倾向池 A9，胜利收益项≈0；A9 保留、21 将后续可调）
  //   军事胜利=消灭其余 7 阵营；玩家占 1 位大统领=随机抽到的群友（不自选）
  aiBuildGuard: { minTreasury: 60000 }, // 院长 11-25：不得长期负财政——净收入<0 且国库<6万时暂停非生存建造
  treasury: 50000, // 起步国库（11-25 院长令：不得长期负财政；v27 对照=6万/9万仍亏→根因是 AI 花费纪律，另立护栏）
};

module.exports = { tutorial: TUTORIAL, revival: REVIVAL, SCENARIOS: { tutorial: TUTORIAL, revival: REVIVAL } };
