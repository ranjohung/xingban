/**
 * 检索层章节级自测 —— 「语义层到底有没有用」的判据
 * ------------------------------------------------------------------
 * 用法：node tests/kb.probe.js         （需要语义索引，先跑 tools/embed_kb.mjs）
 *
 * 为什么另开一个文件：kb.eval.js 判的是回答质量，标准是**场景级**
 * （「这个问题属于学业与考试压力吗」）。语义层要回答的是另一个问题：
 * **该被引用的那一章，有没有被排进前列**。这需要章节级标准。
 *
 * 标准怎么来的：不看检索结果，从**语料侧**定——先用关键词把全书扫一遍，
 * 逐条读上下文，只把「正文确实在处理这个问题」的章节写进 expect。
 * 所以覆盖的问法不多（语料里确实有答案的才配得上一条标准），
 * 但每一条都能回原文核对，不是拿模型自己的分数当标准。
 *
 * 报告里同时给「词面」与「含语义」两列，谁高谁低照实写，不做结论性宣传。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const kb = require('../services/knowledgeBase');

const TOP = 6;
const REPORT_MD = path.join(__dirname, 'reports', 'kb-probe-latest.md');

/* --------------------------- 用例集（章节级标准） --------------------------- */

const CASES = [
  {
    q: '孩子睡前哭闹，怎么安抚都没用',
    expect: ['1-2：认知行为治疗的基础与框架#018'],
    why: '全书唯一讲「孩子夜里睡觉发脾气」的章节（行为消失：家长不再理会）',
  },
  {
    q: '孩子一写作业就磨蹭，一拖再拖',
    expect: ['认知疗法基础与应用  第2版_13333606#055'],
    why: '讲回避任务/拖延本身，含「她一直回避为论文做研究工作」的例子',
  },
  {
    q: '孩子总说我不行、什么都做不好，不敢尝试新东西',
    expect: ['思维改变生活：积极而实用的认知行为#025',
      '认知疗法基础与应用  第2版_13333606#054'],
    why: '#025「维护自尊」直接处理「我不胜任／我很笨／我是失败者」；#054 识别核心信念「我不胜任」',
  },
  {
    q: '孩子发脾气就摔东西、打人，我说什么他都不听',
    expect: ['思维改变生活：积极而实用的认知行为#016',
      '思维改变生活：积极而实用的认知行为#013',
      '思维改变生活：积极而实用的认知行为#015'],
    why: '打断愤怒的技术 / 控制愤怒 / 鉴别并改变产生愤怒的认知',
  },
  {
    q: '孩子一考试就紧张，怕考不好',
    expect: ['13-14：评估焦虑情绪#007',
      '认知疗法基础与应用  第2版_13333606#011'],
    why: '#007 把「担心考不好」转成具体预测；#011 考试前焦虑与罪恶感的个案',
  },
];

/* ------------------------------ 判定 ------------------------------ */

const rankOf = (list, id) => {
  const i = list.findIndex((x) => x.id === id);
  return i < 0 ? 0 : i + 1;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (v) => Math.round(v * 100) + '%';

function run(rows, tag, list) {
  const ids = list.slice(0, TOP).map((x) => x.id);
  const hit = rows.expect.filter((e) => ids.includes(e));
  return {
    tag,
    recall: hit.length / rows.expect.length,
    ranks: rows.expect.map((e) => rankOf(list, e)),
    top: list.slice(0, TOP),
  };
}

(async () => {
  kb._load();
  const st = kb.stats();
  if (!st.ready) {
    console.error('索引未就绪：' + st.error);
    process.exit(1);
  }

  // 先核对标准里的章节 id 真的存在（防手误写成不存在的出处）
  const missing = [];
  for (const c of CASES) {
    for (const e of c.expect) if (!kb.getById(e)) missing.push(`${c.q} → ${e}`);
  }
  if (missing.length) {
    console.error('✗ 用例里的期望章节不存在，先修用例：\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  const semReady = await require('../services/semantic').ensure();
  console.log(`语义层：${semReady ? '就绪' : '不可用（本轮只测词面，两列会相同）'}`);
  console.log(`用例 ${CASES.length} 条 / 期望章节 ${CASES.reduce((a, c) => a + c.expect.length, 0)} 个 / top-${TOP}\n`);

  const L = [];
  L.push('# 检索层章节级自测（词面 vs 含语义）', '');
  L.push(`- 生成时间：${new Date().toISOString()}`);
  L.push(`- 语义层：${semReady ? `就绪（${kb.stats().semantic.model} / ${kb.stats().semantic.chunks} 块）` : '不可用'}`);
  L.push(`- 判定：期望章节是否出现在 top-${TOP}，以及首个期望章节的名次`);
  L.push(`- 标准来源：从语料侧人工判定（见本文件 CASES 的 why 字段），不看检索结果`);

  const rowsOut = [];
  let sumLex = 0; let sumHyb = 0; let improved = 0; let worse = 0; let same = 0;

  for (const c of CASES) {
    const lexList = kb.search(c.q, { top: TOP });
    const t0 = Date.now();
    const hybList = await kb.searchAsync(c.q, { top: TOP });
    const ms = Date.now() - t0;
    const lex = run(c, 'lex', lexList);
    const hyb = run(c, 'hyb', hybList);
    sumLex += lex.recall;
    sumHyb += hyb.recall;
    if (hyb.recall > lex.recall) improved += 1;
    else if (hyb.recall < lex.recall) worse += 1;
    else same += 1;

    const flag = hyb.recall > lex.recall ? '↑' : (hyb.recall < lex.recall ? '↓' : '=');
    console.log(`${flag} ${c.q}`);
    console.log(`    期望 ${c.expect.length} 个 | 词面 ${pct(lex.recall)} 名次[${lex.ranks.join(',')}]`
      + ` | 含语义 ${pct(hyb.recall)} 名次[${hyb.ranks.join(',')}] | ${ms}ms`);
    const only = hyb.top.map((x) => x.id).filter((id) => !lex.top.map((y) => y.id).includes(id));
    if (only.length) console.log(`    语义新进：${only.map((x) => x.slice(-14)).join(', ')}`);

    rowsOut.push({ ...c, lex, hyb, ms, only });
    L.push(`| ${c.q} | ${c.expect.length} | ${pct(lex.recall)} \`[${lex.ranks.join(',')}]\` `
      + `| ${pct(hyb.recall)} \`[${hyb.ranks.join(',')}]\` | ${ms}ms | ${flag} |`);
  }

  const mLex = sumLex / CASES.length;
  const mHyb = sumHyb / CASES.length;
  console.log(`\n平均召回  词面 ${pct(mLex)} → 含语义 ${pct(mHyb)}`
    + `  （提升 ${improved} / 持平 ${same} / 下降 ${worse}）`);
  console.log(`词面未命中期望章节的用例：${CASES.filter((c, i) => rowsOut[i].lex.recall < 1).length} / ${CASES.length}`);

  L.splice(6, 0, '',
    '| 问题 | 期望章节数 | 词面 top-6 召回 | 含语义 top-6 召回 | 语义耗时 | 变化 |',
    '| --- | --- | --- | --- | --- | --- |');
  // 表尾要按「从表头往下第一条连续的 | 行」定位，**不能按 `表头下标 + 用例数 + 常数` 算**——
  // 之前就是这么算的，差一行，把最后两条用例挤到了「用例依据」标题下面，报告看着像坏了。
  // 另注：表头与数据行之间**不能有空行**，否则 markdown 渲染器不认这张表。
  const head = L.findIndex((x) => x.startsWith('| 问题 |'));
  let tail = head;
  while (tail + 1 < L.length && L[tail + 1].startsWith('|')) tail += 1;
  L.splice(tail + 1, 0,
    '', `**平均召回：词面 ${pct(mLex)} → 含语义 ${pct(mHyb)}**`
    + `（提升 ${improved} / 持平 ${same} / 下降 ${worse}）`, '',
    '## 用例依据', '');
  for (const c of CASES) {
    L.push(`- **${c.q}**`);
    L.push(`  - 期望：${c.expect.map((e) => `\`${e}\``).join('、')}`);
    L.push(`  - 依据：${c.why}`);
  }
  L.push('', '## 口径说明', '',
    `- 只统计 top-${TOP}，名次 0 表示未进前列。`,
    '- 「含语义」= 先算查询向量、由语义层重排并补位后的结果（`searchAsync`）。',
    '- 标准是**人工从语料侧**判定的，只覆盖语料里确实有对口章节的问法；',
    '  语料缺口的问法（屏幕依赖、多动等）不放进来——那种情况下两边都是 0，测不出差别。',
    '- 语义层不可用时两列相同，脚本会明说，不会假装跑过。');

  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(REPORT_MD, L.join('\n') + '\n');
  console.log(`\n报告已写入 ${path.relative(path.resolve(__dirname, '..'), REPORT_MD)}`);
})();
