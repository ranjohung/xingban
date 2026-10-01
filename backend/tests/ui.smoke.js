/**
 * 前端渲染冒烟测试：不依赖浏览器，
 * 直接把 星伴体验版.html 里的知识问答渲染函数抽出来跑一遍，
 * 用真实后端返回的数据喂进去，确认不会抛错、且关键内容都渲染出来了。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = path.resolve(__dirname, '..', '..', '星伴体验版.html');
const src = fs.readFileSync(HTML, 'utf8');

function grab(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`找不到 ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${name} 括号不闭合`);
}

const names = ['escapeText', 'knowledgeResultHtml', 'kbRenderMarkdown', 'kbInline'];
const code = names.map(grab).join('\n\n');
const factory = new Function(`${code}\nreturn { knowledgeResultHtml, kbRenderMarkdown, kbInline };`);
const api = factory();

function assert(cond, msg) {
  if (!cond) { console.log('  ✗ ' + msg); process.exitCode = 1; return false; }
  console.log('  ✓ ' + msg); return true;
}

(async () => {
  console.log('抽取函数：' + names.join(', '));

  // 1) Markdown 渲染
  const md = api.kbRenderMarkdown([
    '开头一句话。', '',
    '### 可以带着孩子一起做的练习', '',
    '- 第一条**重点**内容',
    '- 第二条内容',
    '',
    '> 这是提醒',
    '---',
    '1. 有序一条',
  ].join('\n'));
  console.log('\n[1] Markdown 渲染');
  assert(md.includes('<h3 class="font-bold text-text-primary mt-4 mb-2">可以带着孩子一起做的练习</h3>'), '### 渲染成 h3');
  assert(md.includes('<strong>重点</strong>'), '** 加粗生效');
  assert(md.includes('<hr class="my-4 border-border">'), '--- 渲染成分隔线');
  assert(md.includes('list-disc'), '无序列表生效');
  assert(md.includes('list-decimal'), '有序列表生效');
  assert(!/[<>]script/i.test(md), '无脚本注入');

  // 2) XSS 转义
  console.log('\n[2] XSS 转义');
  const evil = api.kbRenderMarkdown('<img src=x onerror=alert(1)>');
  assert(!evil.includes('<img'), '原始标签被转义');

  // 3) 真实接口数据
  console.log('\n[3] 真实接口数据渲染');
  let res;
  try {
    const r = await fetch('http://127.0.0.1:3001/api/knowledge/ask-public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '孩子一考试就紧张，晚上睡不着，怎么办' }),
    });
    res = await r.json();
  } catch (e) {
    console.log('  ! 后端未启动，跳过真实数据测试（' + e.message + '）');
  }
  if (res && res.success) {
    const html = api.knowledgeResultHtml(res);
    assert(html.includes('出处'), '渲染出处区块');
    assert(html.includes('kb-answer'), '回答容器存在');
    assert(html.length > 1200, 'HTML 长度 ' + html.length);
    assert(!html.includes('undefined'), '没有 undefined 泄漏');
    assert(res.answer && res.answer.length > 200, '回答长度 ' + (res.answer || '').length);
  }

  // 4) 危机响应渲染
  console.log('\n[4] 危机响应渲染');
  try {
    const r = await fetch('http://127.0.0.1:3001/api/knowledge/ask-public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '孩子说自己不想活了' }),
    });
    const c = await r.json();
    if (c && c.success) {
      const html = api.knowledgeResultHtml(c);
      assert(c.mode === 'crisis', 'mode=crisis');
      assert(html.includes('安全响应'), '渲染安全响应徽标');
      assert(c.answer.includes('12356'), '包含 12356 热线');
      assert(!html.includes('undefined'), '没有 undefined 泄漏');
    }
  } catch (e) {
    console.log('  ! 跳过（' + e.message + '）');
  }

  // 5) 薄场景迁移卡渲染（屏幕依赖这类语料缺口场景）
  console.log('\n[5] 迁移卡渲染');
  try {
    const r = await fetch('http://127.0.0.1:3001/api/knowledge/ask-public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '孩子沉迷手机游戏，一收手机就又哭又闹' }),
    });
    const b = await r.json();
    if (b && b.success) {
      const html = api.knowledgeResultHtml(b);
      assert(!!b.bridge, '返回 bridge 字段：' + b.bridge);
      assert(html.includes('场景迁移卡'), '渲染迁移卡徽标');
      assert(html.includes('这类问题可以先用的一般方法'), '渲染迁移卡正文');
      assert(html.includes('在家可以先做的'), '渲染星伴整理的落地做法');
      assert(/（出处：.+）/.test(b.answer || ''), '迁移卡引文带出处');
      assert(!html.includes('undefined'), '没有 undefined 泄漏');
      const srcs = (b.sources || []).length;
      assert(srcs > 3, '出处条目 ' + srcs);
    }
  } catch (e) {
    console.log('  ! 跳过（' + e.message + '）');
  }

  // 6) 出处标记渲染：原书章节名 + 扫描质量欠佳（问题书来源要提示，别让家长把错字当成星伴写的）
  console.log('\n[6] 出处标记渲染');
  try {
    const base = {
      mode: 'extractive', grounded: true,
      answer: '- 测试引用（出处：某书 · 某章）',
      intent: { scenes: ['焦虑与恐惧'] },
      suggestions: ['接着问什么'],
    };
    const weak = api.knowledgeResultHtml({ ...base,
      sources: [{ id: 'x#1', title: '某章', source: '某书', scenes: [], scanQuality: 'weak' }] });
    assert(weak.includes('原书章节名'), '渲染「原书章节名」标记');
    assert(weak.includes('扫描质量欠佳'), '渲染「扫描质量欠佳」徽标');
    assert(!weak.includes('undefined'), '没有 undefined 泄漏');
    const normal = api.knowledgeResultHtml({ ...base,
      sources: [{ id: 'x#2', title: '某章二', source: '某书二', scenes: [], scanQuality: 'normal' }] });
    assert(!normal.includes('扫描质量欠佳'), '正常来源不显示该徽标');
  } catch (e) {
    console.log('  ! 失败（' + e.message + '）');
  }

  // 7) 可打印表格清单（工具表单与工作表）
  console.log('\n[7] 可打印表格清单');
  try {
    const r = await fetch('http://127.0.0.1:3001/api/knowledge/worksheets');
    const w = await r.json();
    if (w && w.success) {
      assert(w.count > 0 && w.count <= w.total, `筛选 ${w.count}/${w.total} 条`);
      assert(typeof w.criteria === 'string' && w.criteria.length > 0, '返回筛选口径');
      const bad = (w.items || []).filter((i) => !i.id || !i.title || !i.source || i.chars < 60 || i.chars > 4000);
      assert(bad.length === 0, '条目字段完整且体量在口径内');
      const flagged = (w.items || []).every((i) => i.scanQuality === 'weak' || i.scanQuality === 'normal');
      assert(flagged, '每条都带扫描质量标记');
      const doc = await (await fetch('http://127.0.0.1:3001/api/knowledge/doc/' + encodeURIComponent(w.items[0].id))).json();
      assert(doc.success && doc.doc && doc.doc.text.length > 0, '能取到该条全文（供打印）');
      // 第二十九轮：【可填写空白】这件事的结论是「这批语料做不了，且如实标明」。
      // 接口带 tableCount（可切分条数），前端在不含表格时给的是**逐字原文 + 一句「留白给家长自己填」**
      // 的定位说明；不许改成「星伴帮你排好表格」——那会把编造的结构当成原书内容。
      assert(Number.isInteger(w.tableCount), `接口带可切分条数 tableCount=${w.tableCount}`);
      assert(src.includes('空行与留白按原书排版保留'), '不含表格时如实写明是原书排版、不是星伴排的表格');
      assert(src.includes('星伴没有重排成表格'), '页面上写明星伴没有重排表格（不编造结构）');
    } else {
      console.log('  ! 接口未返回成功');
    }
  } catch (e) {
    console.log('  ! 跳过（' + e.message + '）');
  }

  console.log('\n[8] 示范对话清单');
  try {
    const r = await fetch('http://127.0.0.1:3001/api/knowledge/dialogues');
    const w = await r.json();
    if (w && w.success) {
      assert(w.count > 0 && w.count <= w.total, `筛选 ${w.count}/${w.total} 条`);
      assert(typeof w.criteria === 'string' && w.criteria.length > 0, '返回筛选口径');
      assert(w.needsRewrite > 0, `标注了需改写的条数（${w.needsRewrite} 条）`);
      const bad = (w.items || []).filter((i) => !i.id || !i.source || i.turns < 2);
      assert(bad.length === 0, '条目字段完整且都是对话体（轮次 ≥2）');
      assert(Array.isArray(w.groups) && w.groups.length > 0, `按场景/技术分组（${(w.groups || []).length} 组）`);
      // 关键诚实性检查：列表里的预览必须是改写后的文本，不能把「患者/咨询师」端给家长
      const adult = /咨询师|治疗师|患者|来访者|病人/;
      const leak = (w.items || []).filter((i) => adult.test(i.preview));
      assert(leak.length === 0, '列表预览无成人称谓泄漏（全部走改写版）');
      const one = w.items[0];
      const d2 = await (await fetch('http://127.0.0.1:3001/api/knowledge/dialogue/' + encodeURIComponent(one.id))).json();
      assert(d2.success && d2.doc && d2.doc.original.length > 0 && d2.doc.softened.length > 0, '能取到单条（改写版 + 原文对照）');
      // 改写只换称谓词：长度只会因「咨询师→心理老师」这类多一个字而微增，
      // 明显变短/变长就说明不只是换了称谓（那就有编造嫌疑）。
      const dlen = Math.abs(d2.doc.softened.length - d2.doc.original.length);
      assert(d2.doc.needsRewrite ? dlen <= Math.ceil(d2.doc.original.length * 0.05) : dlen === 0,
        `改写只是称谓替换（长度差 ${dlen} 字，占比 <5%）`);
    } else {
      console.log('  ! 接口未返回成功');
    }
  } catch (e) {
    console.log('  ! 跳过（' + e.message + '）');
  }

  console.log('\n[9] 示范对话前端接线');
  assert(src.includes('function renderDialogues('), '存在 renderDialogues');
  assert(src.includes('function switchDialogueTab('), '存在原文/改写版切换');
  assert(src.includes("case 'dialogues':"), '路由分发已挂接');
  assert(src.includes('data-page="dialogues"'), '侧栏有入口');
  assert(src.includes('不是家庭话术模板'), '页面写明「不是话术模板」的定位说明');

  console.log('\n[10] 快速记录 → 知识库延伸阅读');
  assert(src.includes('function loadRecordKbRef('), '记录保存后会去知识库找相关章节');
  assert(src.includes('loadRecordKbRef(record, category)'), '已接进保存后弹窗');
  assert(src.includes('const RECORD_KB_SCENE = {') && src.includes('const RECORD_KB_KEYWORDS = {'), '有分类→场景与分类→行为词两张映射表');
  assert(src.includes('12356') && src.includes('12355'), '安全类分类给的是热线与就医指引');
  assert(src.includes('不是这条记录的出处'), '明确写了不是记录的出处');
  assert(src.includes("how === 'record'"), '界面上区分「按原话找的」和「按关键词兜底找的」');
  // 不能再出现「无场景兜底」——那正是第七轮修掉的坑（自伤被配成人际关系）
  const hasUnscoped = /fetchKbForStrategy\([^)]*,\s*\[\]\s*,\s*3\s*\)/.test(src);
  assert(!hasUnscoped, '没有无场景兜底（宁可如实说没有，也不给不相关的章节）');

  console.log('\n[11] 成长周报 → 知识库延伸阅读');
  assert(src.includes('function loadReportKbRef('), '周报详情会附相关章节');
  assert(src.includes('loadReportKbRef(report, childRecords)'), '已接进周报详情');
  assert(src.includes('function kbRefsForCategory('), '两级检索抽成单一实现（记录弹窗与周报共用）');
  const reuse = (src.match(/kbRefsForCategory\(/g) || []).length;
  assert(reuse >= 3, `两级检索被复用 ${reuse} 处（定义 1 + 调用 2），没有各写一份`);
  assert(src.includes('function kbRefListHtml(') && src.includes('function kbSafetyNoticeHtml('), '章节列表与安全提示也各只有一份实现');
  assert(src.includes('不是周报结论的依据'), '周报里写明不是结论依据');
  assert(src.includes("本周记录里出现最多的分类"), '说明章节是按记录分类找的');

  console.log('\n[12] 回答反馈与检索埋点');
  // 本轮（第二十六轮）起：本段打的请求会带 `x-kb-analytics-env: test` 头，
  // 埋点层据此把这几条标成测试来路，不混进「家长提问」统计里（以前每跑一次冒烟就多一条
  // 「烟雾测试：…」，把 kb:log 的优先清单挤满噪声）。
  const TEST_H = { 'Content-Type': 'application/json', 'x-kb-analytics-env': 'test' };
  try {
    // 1) 提问会产生埋点
    const before = await (await fetch('http://127.0.0.1:3001/api/knowledge/lowhits')).json();
    const q = '烟雾测试：孩子最近总说睡不着';
    await fetch('http://127.0.0.1:3001/api/knowledge/ask-public', {
      method: 'POST', headers: TEST_H,
      body: JSON.stringify({ question: q, ctx: { childOnly: false, top: 5 } }),
    });
    const after = await (await fetch('http://127.0.0.1:3001/api/knowledge/lowhits')).json();
    assert(after.totalAsks === before.totalAsks + 1, `提问被记进埋点（${before.totalAsks} → ${after.totalAsks}）`);

    // 2) 反馈能记上，且「没帮助」的问题会被顶到低命中列表
    const fb = await (await fetch('http://127.0.0.1:3001/api/knowledge/feedback', {
      method: 'POST', headers: TEST_H,
      body: JSON.stringify({ question: q, verdict: 'unhelpful', note: '没讲怎么做' }),
    })).json();
    assert(fb.success && fb.verdict === 'unhelpful', '「没帮助」能记上');
    const rep = await (await fetch('http://127.0.0.1:3001/api/knowledge/lowhits')).json();
    const row = (rep.lowHits || []).find((x) => x.question === q);
    // 用 >= 1 而不是 === 1：埋点日志是**累加**的，反复跑这套测试时同一条问题的
    // unhelpful 会累到 2、3……（第二十一轮连跑时踩到：列表里明明是第一名，
    // 却因为计数不是 1 而报红）。要验的是「被标没帮助的问题会出现在低命中列表里」。
    assert(!!row && row.unhelpful >= 1, '被标没帮助的问题出现在低命中列表里');
    assert((rep.lowHits || []).indexOf(row) === 0, '被标没帮助的问题被顶到列表首位');

    // 3) 非法反馈要拒绝，不能静默成功
    const bad = await fetch('http://127.0.0.1:3001/api/knowledge/feedback', {
      method: 'POST', headers: TEST_H,
      body: JSON.stringify({ question: q, verdict: 'love-it' }),
    });
    assert(bad.status === 400, '非法反馈类型返回 400');
  } catch (e) {
    console.log('  ! 跳过（' + e.message + '）');
  }
  assert(src.includes('function sendKbFeedback('), '前端有反馈按钮的处理函数');
  assert(src.includes('不会上传任何内容'), '反馈区写明只记问题与命中条数');
  assert(src.includes("if (!r || !r.success) throw new Error"), '反馈失败时如实提示，不假装成功');

  console.log('\n[13] 成长周报可打印单页');
  // 周报弹窗是 fixed 覆盖层：打印时若不把它放回正常流，.print-sheet 的绝对定位会挂到覆盖层上，
  // 家长打出来的是一张白纸。这条断言就是守住这个坑——静态串测得住，别等打印才发现。
  assert(src.includes("className = 'print-report fixed inset-0"), '周报弹窗有 print-report 作用域');
  assert(src.includes('print-sheet bg-white w-full max-w-sm'), '周报卡片是打印单元（print-sheet）');
  assert(/\.print-report\s*\{\s*position:\s*static\s*!important/.test(src), '打印时把 fixed 覆盖层放回正常流');
  assert(/\.print-report \.print-only\s*\{\s*display:\s*block\s*!important/.test(src), '打印时页眉页脚显示');
  assert(src.includes('打印这一页'), '周报详情有「打印这一页」按钮');
  assert(src.includes('不构成诊断或用药建议</strong>；下方教材章节为延伸阅读'), '打印页眉写明免责与「章节只是延伸阅读」');
  assert(src.includes('不要等待周报'), '打印页脚保留危机指引');

  console.log('\n完成。');
})();
