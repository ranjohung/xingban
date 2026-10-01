/**
 * 成人语境判定与改写（唯一实现）
 * ------------------------------------------------------------------
 * 知识库里的原始素材大量来自「治疗师 ↔ 成人患者」的临床场景。星伴面对的是家长，
 * 直接把原句给家长看会有两个问题：称谓不匹配（「患者」不是「孩子」），
 * 以及家长会误以为这些话是自己该说的。
 *
 * 这里只放「判定 + 词面改写」这一层最小能力，被两处复用：
 *   - `services/answer.js`：抽取式回答挑句时，落到成人原句要先改写；
 *   - `services/knowledgeBase.js`：「示范对话」页给家长看的版本。
 *
 * 之所以单独成文件，是因为本项目有过「同一修正写了两处、改一处漏一处」的教训
 * （finalize.py 的 TITLE_FIX 与 build_md.py 的 HEADING_FIX）。语境改写规则只此一份。
 *
 * 注意：改写只换称谓词，**不生成新内容**。改写后的文本仍逐字来自原书，
 * 调用方有义务标注「已按家长语境改写」并给出原文可核对。
 */

'use strict';

const ADULT_WORDS = ['治疗师', '患者', '来访者', '咨询师', '配偶', '丈夫', '妻子',
  '病人', '夫妻', '婚姻', '成年人', '女朋友', '男朋友', '精神科医生'];

const CHILD_WORDS = ['孩子', '儿童', '青少年', '学生', '家长', '父母', '儿子', '女儿',
  '小朋友', '青春期', '小学生', '中学生', '幼儿园', '学校', '老师', '亲子', '作业', '宝宝'];

// 成人个案表述 → 家庭语境。
// 注意「治疗师 → 心理老师」而不是「你」：家长带孩子去见的正是心理老师，两种语境都读得通。
const ADULT_SWAP = [
  ['成年患者', '成年人'], ['成年病人', '成年人'], ['成人患者', '成年人'],
  ['治疗师', '心理老师'], ['咨询师', '心理老师'],
  ['患者', '孩子'], ['来访者', '孩子'], ['病人', '孩子'],
  ['配偶', '另一半'], ['丈夫', '另一半'], ['妻子', '另一半'],
  ['夫妻', '家人'], ['婚姻', '家庭'],
];

function adultLevel(s) {
  const t = String(s || '');
  let ad = 0;
  for (const w of ADULT_WORDS) if (t.includes(w)) ad++;
  let ch = 0;
  for (const w of CHILD_WORDS) if (t.includes(w)) ch++;
  return { ad, ch };
}

/** 只做称谓替换，不新增任何内容；未命中替换时返回原串（调用方据此判断是否标注） */
function softenAdultContext(s) {
  let out = String(s || '');
  for (const [a, b] of ADULT_SWAP) out = out.split(a).join(b);
  return out;
}

module.exports = { ADULT_WORDS, CHILD_WORDS, ADULT_SWAP, adultLevel, softenAdultContext };
