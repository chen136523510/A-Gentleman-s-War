// sim/data/eventcards.js — 事件卡 13 张（sim 侧镜像；权威=docs/06-设计/06-事件/事件卡内容库.md v1.0）
// AI 友好规范 P1：一卡一条，改值只改 1 行。grade=normal|special|historical；appearAt=turnStart|preSettle|turnEnd。
// effects：multiplier=持续乘区（scope: city=触发城|faction=全国，duration 回合）；instant=一次性（W 民生偏置 ±5 封顶）。
// unique: 'faction'=每阵营每局一次 | true=全局一局一次 | false=冷却限流。
// ⚙ 标注值=内容库 §五 待校准初值（v27 盘校准，全部可调）。
// 2026-11-27 白机建模（v27）：院长裁——复苏盘 11 卡生效（H1/H2 教学专属不进复苏）。
'use strict';
module.exports = [
  // ===== 普通卡（灰白 · 0 改数值 · 机制呈现）=====
  { id: 'uprising', name: '起义', grade: 'normal', domain: 'politics', appearAt: 'turnEnd', cooldown: 0,
    desc: '城市忠诚度长期低迷，市民接管了城市。', effects: [], note: '机制卡：城市转中立（守军50%转民兵）；武将→最近己方城/飞城→归隐' },
  { id: 'defection', name: '叛逃', grade: 'normal', domain: 'politics', appearAt: 'turnEnd', cooldown: 0,
    desc: '一名将领离开了他的城市。', effects: [], note: '选择型→回合初弹：相邻敌城三选一（接纳/遣返/驱离）；无去处=归隐（原城在野）' },
  { id: 'bankruptcy', name: '破产', grade: 'normal', domain: 'economy', appearAt: 'turnEnd', cooldown: 0, unique: 'faction',
    desc: '政府已无力支付订单。', effects: [], note: '国库归零且净增为负；每阵营每局一次；AI 也走卡' },
  { id: 'sea_level_1', name: '海平面上升 I', grade: 'normal', domain: 'livelihood', appearAt: 'turnEnd', cooldown: 0, unique: true,
    desc: '海平面吞没了沿海的低地。', effects: [], note: '环境机制结算（沿海产出损）；全局一局一次' },
  { id: 'sea_level_2', name: '海平面上升 II', grade: 'normal', domain: 'livelihood', appearAt: 'turnEnd', cooldown: 0, unique: true,
    desc: '海水继续上涨，海岸线向内陆退去。', effects: [], note: '环境机制结算（淹没）；全局一局一次' },
  { id: 'sea_level_3', name: '海平面上升 III', grade: 'normal', domain: 'livelihood', appearAt: 'turnEnd', cooldown: 0, unique: true,
    desc: '海平面到达灭世线。', effects: [], note: '全局失败线（+1.5m）；全局一局一次' },
  { id: 'baby_boom', name: '婴儿潮', grade: 'normal', domain: 'livelihood', appearAt: 'turnEnd', cooldown: 30,
    desc: '新生儿的哭声响彻整个国度。', effects: [], note: '机制卡：人口增速连续 3 回 ≥⚙2%/回（growthCap 上限内自然加速）' },
  // ===== 特殊卡（蓝紫 · 改数值 · 条件→概率→独立限流）=====
  { id: 'lipstick_effect', name: '口红效应', grade: 'special', domain: 'economy', appearAt: 'turnEnd', cooldown: 40,
    desc: '商场的口红被一扫而空', probability: 0.20, duration: 5, scope: 'city',
    effects: [{ target: 'streetRecovery', mult: 1.20 }, { target: 'mallRecovery', mult: 0.90 }],
    trigger: 'W<35 或 战争/封锁≥5回', small: '商业街收入 +20% · 商场收入 −10% · 持续 5 回合' },
  { id: 'revenge_spending', name: '报复性消费', grade: 'special', domain: 'economy', appearAt: 'turnStart', cooldown: 50,
    desc: '压抑到极致的瞬间燃爆！', probability: 0.20, duration: 1, scope: 'faction',
    effects: [{ target: 'mallRecovery', mult: 1.25 }, { target: 'entRecovery', mult: 1.15 }, { target: 'streetRecovery', mult: 0.95 }],
    trigger: '战争结束/解封 3 回内 且 就业率未饱和', small: '全国商场收入 +25% · 全国娱乐建筑收入 +15% · 全国商业街收入 −5% · 持续 1 回合' },
  { id: 'low_desire', name: '低欲望社会', grade: 'special', domain: 'livelihood', appearAt: 'turnEnd', cooldown: 60,
    desc: '开摆！', probability: 0.08, duration: 20, scope: 'faction',
    effects: [{ target: 'consumptionPool', mult: 0.90 }, { target: 'entRecovery', mult: 1.10 }, { target: 'W', add: 1, instant: true }],
    trigger: 't>120 且 W>70 且 人口与财政收入增速连续 10 回 <1%', small: '全国消费池 −10% · 全国娱乐建筑收入 +10% · 民生 +1 · 持续 20 回合' },
  { id: 'lottery_frenzy', name: '彩票热', grade: 'special', domain: 'livelihood', appearAt: 'turnStart', cooldown: 40,
    desc: '如果想知道什么是希望，请买一张彩票。如果想知道什么是绝望，请买一堆彩票。', probability: 0.25, duration: 5, scope: 'city',
    effects: [{ target: 'W', add: -1, instant: true }, { target: 'consumptionPool', mult: 1.15 }],
    trigger: '某城就业率过饱和（岗位>可用劳动力）且商业财收低连续 3 回', small: '民生 −1 · 消费力 +15% · 持续 5 回合' },
  // ===== 历史卡（金黄 · 教学副本专属 · 复苏盘不生效）=====
  { id: 'wlt_independence', name: '自立门户', grade: 'historical', domain: 'politics', appearAt: 'preSettle', cooldown: 0, unique: true, tutorialOnly: true,
    desc: '"永别了，牢笼！"', effects: [], note: '教学剧情卡：台北→WLT；t2 固定；复苏盘不进' },
  { id: 'hallyu', name: '韩流', grade: 'historical', domain: 'culture', appearAt: 'preSettle', cooldown: 0, unique: true, tutorialOnly: true,
    desc: '老KR的唱片和剧集重新流行', effects: [{ target: 'culture', add: 15, instant: true }], note: '教学剧情卡：KR 文化值 +15（⚙ 初值）；复苏盘不进' },
];

// ===== 通用限流参数（内容库 §六 balance.eventCard）=====
module.exports.PARAMS = {
  globalMax: 1,        // 全局同时生效卡上限
  minInterval: 10,     // 相邻事件卡最小间隔（回合）
  effectCap: 0.50,     // 效果封顶 ±50%
  wBiasCap: 5,         // 民生偏置 ±5
  domainBoostW: 0.15,  // AI 领域加权 0.15×severity
};
