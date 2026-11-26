// sim/data/officers.js — 21 将档案（sim 侧镜像；权威=docs/06-设计/02-武将/武将档案-v0.md §五）
// AI 友好规范 P1：一将一条，改值只改 1 行。attrs=五维（合计 400）；loyaltyInit=初始个人忠诚。
// payMult=加俸倾向乘区（B12 §三：F6 金钱至上×1.5 / D4 清廉×0.5 / B6 淡泊名利×0.5 / D5 奢靡×0.75；无标记=1.0）。
// governance=治国路线（武将属性；tradeTend=贸易倾向派生用 §六：国家性质基准×大统领相性）。
// 2026-11-27 白机建模（v27）：院长裁——武将实体化、复苏 8×2 无空城、俸禄只发在职。
'use strict';
module.exports = [
  { id: 'chenzijian', name: '陈梓键', attrs: { cmd: 80, might: 80, int: 80, pol: 80, charm: 80 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'raozhirui', name: '饶志锐', attrs: { cmd: 68, might: 48, int: 90, pol: 100, charm: 94 }, loyaltyInit: 80, payMult: 1.5 }, // F6 金钱至上
  { id: 'yuanchongxuan', name: '袁崇轩', attrs: { cmd: 96, might: 100, int: 68, pol: 52, charm: 84 }, loyaltyInit: 65, payMult: 1.0 },
  { id: 'zhuyuhan', name: '朱宇涵', attrs: { cmd: 78, might: 52, int: 93, pol: 92, charm: 85 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'qiuxuming', name: '丘序明', governance: 'culture', attrs: { cmd: 74, might: 50, int: 88, pol: 94, charm: 94 }, loyaltyInit: 80, payMult: 1.0 },
  { id: 'luchengkun', name: '陆城锟', attrs: { cmd: 92, might: 88, int: 58, pol: 92, charm: 70 }, loyaltyInit: 90, payMult: 0.5 }, // D4 清廉
  { id: 'weijiahao', name: '魏嘉豪', attrs: { cmd: 68, might: 52, int: 94, pol: 94, charm: 92 }, loyaltyInit: 70, payMult: 1.0 },
  { id: 'chenjunjie', name: '陈俊杰', attrs: { cmd: 65, might: 55, int: 91, pol: 93, charm: 96 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'wangyukun', name: '汪煜坤', attrs: { cmd: 68, might: 48, int: 98, pol: 90, charm: 96 }, loyaltyInit: 80, payMult: 1.0 },
  { id: 'ninghaoran', name: '宁浩然', attrs: { cmd: 90, might: 92, int: 62, pol: 64, charm: 92 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'wangletian', name: '王乐添', attrs: { cmd: 84, might: 82, int: 78, pol: 80, charm: 76 }, loyaltyInit: 45, payMult: 1.0 },
  { id: 'chenrui', name: '陈睿', governance: 'military', attrs: { cmd: 60, might: 95, int: 95, pol: 50, charm: 100 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'chenlipeng', name: '谌礼鹏', attrs: { cmd: 70, might: 55, int: 93, pol: 93, charm: 89 }, loyaltyInit: 70, payMult: 1.0 },
  { id: 'lumuyang', name: '卢沐阳', attrs: { cmd: 72, might: 38, int: 100, pol: 96, charm: 94 }, loyaltyInit: 60, payMult: 1.0 },
  { id: 'zhangxun', name: '张迅', attrs: { cmd: 66, might: 52, int: 92, pol: 100, charm: 90 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'xuhaosen', name: '徐浩森', governance: 'culture', attrs: { cmd: 88, might: 65, int: 60, pol: 87, charm: 100 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'chennan', name: '陈楠', attrs: { cmd: 69, might: 50, int: 94, pol: 93, charm: 94 }, loyaltyInit: 80, payMult: 1.0 },
  { id: 'huangxueyuan', name: '黄学远', attrs: { cmd: 95, might: 95, int: 60, pol: 60, charm: 90 }, loyaltyInit: 75, payMult: 1.0 },
  { id: 'mayijie', name: '马逸杰', governance: 'commerce', attrs: { cmd: 65, might: 55, int: 80, pol: 100, charm: 100 }, loyaltyInit: 85, payMult: 1.0 },
  { id: 'zouzhihua', name: '邹志华', attrs: { cmd: 70, might: 92, int: 55, pol: 90, charm: 93 }, loyaltyInit: 75, payMult: 1.0 },
  { id: 'pangkailei', name: '庞楷垒', attrs: { cmd: 85, might: 65, int: 90, pol: 80, charm: 80 }, loyaltyInit: 85, payMult: 1.0 },
];
