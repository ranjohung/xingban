/* 知识库自测：直接调用 service，不启服务 */
const kb = require('../services/knowledgeBase');
const { answer, isCrisis } = require('../services/answer');

(async () => {
  const t0 = Date.now();
  const st = kb.stats();
  console.log('=== 加载 ===', Date.now() - t0, 'ms');
  console.log(JSON.stringify({ ready: st.ready, docs: st.docs, chars: st.chars, children: st.children, tokens: st.tokens, sources: st.sources, llm: require('../services/answer').llmConfig() ? 'yes' : 'no' }, null, 1));

  const qs = [
    '孩子一考试就紧张，晚上睡不着，怎么办',
    '孩子发脾气摔东西，我说什么都不听',
    '孩子总说自己不行，什么都不愿意试',
    '孩子沉迷手机游戏，不给他就闹',
    '孩子被同学孤立，不愿意去学校',
    '孩子有自伤行为怎么办',
  ];

  for (const q of qs) {
    console.log('\n' + '='.repeat(72));
    console.log('问题：' + q, isCrisis(q) ? ' [危机]' : '');
    const r = await answer(q, { childOnly: true, top: 5 });
    console.log('mode=%s grounded=%s 命中=%d', r.mode, r.grounded, r.sources.length);
    console.log('--- 回答 ---');
    console.log(r.answer.slice(0, 1400));
  }

  // 性能
  const t1 = Date.now();
  for (let i = 0; i < 50; i++) kb.search('考试焦虑 睡不着', { top: 6 });
  console.log('\n检索 50 次耗时 %d ms（均 %.1f ms/次）', Date.now() - t1, (Date.now() - t1) / 50);
})();
