/**
 * 相关性分布标定（用于设计「低相关诚实兜底」的判据）
 * ------------------------------------------------------------------
 * 用法：
 *   node tests/kb.relevance.js                # 打印每题的相关性画像 + 分布
 *   node tests/kb.relevance.js --json         # 只输出 JSON（供脚本消费）
 *
 * 为什么要有这个文件：第十九轮上了本地语义层之后，「相关」这件事有了两个可观测的分——
 *   ① 词面：BM25 分（`score`，只对字面命中的章节有值，语义开口进来的条目是 0）；
 *   ② 语义：与查询的余弦（`semantic`，0.4~0.85 区间，bge-small-zh 的量纲）。
 * 想用它们当「知识库到底有没有覆盖这个问题」的闸门，**阈值不能拍**——
 * 本轮实测：问「如何用 Excel 做数据透视表」的语义最高分 0.624，
 * 与真正该回答的「孩子一到考试就紧张」0.644 几乎持平；而真实的薄场景问题
 * 「孩子沉迷手机游戏」只有 0.536。**单看语义分会把正常问题误杀、把越界问题放过。**
 * 所以先把这个文件跑出来看分布，再决定判据；判据写进 answer.js 时也要能在这里复核。
 *
 * 用例来源：in-scope 用 kb.eval.js 的 22 条（**不另抄一份**），
 * out-of-scope 是本文件维护的越界/无关/信息不足清单（这些本就该由人工维护，不是语料里的东西）。
 * ------------------------------------------------------------------
 */
'use strict';

const { CASES } = require('./kb.eval');
const kb = require('../services/knowledgeBase');

/** 越界与「问了等于没问」的提问——期望：不该被当成「知识库里有对应内容」 */
const OUT_OF_SCOPE = [
  { q: '今天天气怎么样', why: '与儿童心理完全无关' },
  { q: '如何用 Excel 做数据透视表', why: '办公软件操作' },
  { q: '推荐几部适合全家看的电影', why: '娱乐推荐' },
  { q: '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意', why: '玄学/与知识库无关' },
  { q: '北京到上海的高铁要坐多久', why: '出行信息' },
  // 信息量为零：知识库不可能覆盖「不太对劲」这种描述，正确答案是「请补充信息」
  { q: '我家孩子最近不太对劲', why: '信息不足，无法定位问题' },
  { q: '孩子心理有问题怎么办', why: '信息不足，且把范围放大到全部心理问题' },
];

/** 「薄场景 / 模糊但确实在问儿童」——不该被判成越界（否则误杀真实需求） */
const BORDERLINE = [
  { q: '孩子沉迷手机游戏，一收手机就又哭又闹', why: '薄场景（迁移卡兜底）' },
  { q: '孩子写作业坐不住，五分钟就走神', why: '薄场景（迁移卡兜底）' },
  { q: '孩子转学后一直不适应，成绩掉得厉害', why: '薄场景（迁移卡兜底）' },
];

async function profile(q, top = 8) {
  const hits = await kb.searchAsync(q, { top, maxChars: 1200 });
  const semMax = hits.reduce((a, h) => (h.semantic == null ? a : Math.max(a, h.semantic)), -1);
  const bmTop = hits.reduce((a, h) => Math.max(a, Number(h.score) || 0), 0);
  const escCount = hits.filter((h) => h.semanticEscape).length;
  const strictCount = hits.filter((h) => !h.semanticEscape && !h.semanticOnly).length;
  // 词面覆盖率：命中的最高覆盖率（BM25 侧对「问题里多少词被这篇覆盖」的估计）
  const coverMax = hits.reduce((a, h) => Math.max(a, Number(h.coverage) || 0), 0);
  return {
    q,
    hits: hits.length,
    semMax: semMax < 0 ? null : Number(semMax.toFixed(3)),
    bmTop: Number(bmTop.toFixed(1)),
    coverMax: Number(coverMax.toFixed(3)),
    esc: escCount,
    strict: strictCount,
    top: hits[0]
      ? { id: hits[0].id, heading: hits[0].heading, source: hits[0].source, esc: !!hits[0].semanticEscape }
      : null,
  };
}

function stat(list, key) {
  const v = list.map((r) => r[key]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  return { min: v[0], max: v[v.length - 1], med: v[Math.floor(v.length / 2)] };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const groups = [
    { name: 'in-scope（kb.eval 22 条）', list: CASES.map((c) => ({ q: c.q, kind: c.kind })) },
    { name: 'out-of-scope（越界/信息不足）', list: OUT_OF_SCOPE },
    { name: 'borderline（薄场景/模糊但在问儿童）', list: BORDERLINE },
  ];

  const out = [];
  for (const g of groups) {
    for (const c of g.list) {
      const r = await profile(c.q);
      out.push({ group: g.name, kind: c.kind || c.why || '', why: c.why || '', ...r });
    }
  }

  if (asJson) { console.log(JSON.stringify(out, null, 1)); return; }

  for (const g of groups) {
    const rows = out.filter((r) => r.group === g.name);
    console.log(`\n=== ${g.name} ===`);
    console.log('semMax  bmTop  cover   条  转义  严格  问题');
    for (const r of rows.sort((a, b) => (b.semMax || 0) - (a.semMax || 0))) {
      console.log(
        `${r.semMax == null ? '   -  ' : r.semMax.toFixed(3)}  ${String(r.bmTop).padStart(5)}  ${String(r.coverMax).padStart(5)}  ${String(r.hits).padStart(3)}  ${String(r.esc).padStart(4)}  ${String(r.strict).padStart(4)}  ${r.q.slice(0, 34)}`
      );
    }
  }

  const inS = out.filter((r) => r.group === groups[0].name);
  const oos = out.filter((r) => r.group === groups[1].name);
  const bor = out.filter((r) => r.group === groups[2].name);
  console.log('\n=== 分布（看能不能分开） ===');
  for (const [label, list] of [['in-scope', inS], ['out-of-scope', oos], ['borderline', bor]]) {
    for (const key of ['semMax', 'bmTop', 'coverMax']) {
      const s = stat(list, key);
      if (s) console.log(`${label.padEnd(13)} ${key.padEnd(9)} min ${String(s.min).padStart(6)}  中位 ${String(s.med).padStart(6)}  max ${String(s.max).padStart(6)}`);
    }
  }
  console.log('\n判据设计提醒：单看一列分不开（语义分在 0.5~0.8 拥挤，词面分受「孩子/怎么/什么」这类高频词污染），');
  console.log('要么用组合条件，要么承认「靠分数判断有没有覆盖」不可靠、改用别的诚实机制。');
}

main().catch((e) => { console.error(e); process.exit(1); });
