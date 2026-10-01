/**
 * 干预策略 × 知识库 关联检查
 * ------------------------------------------------------------------
 * 干预策略页（星伴体验版.html）里，每个策略会去知识库找「教材里的相关章节」。
 * 这条链路有两处容易悄悄坏掉：
 *   ① 策略与知识库场景的映射表 STRATEGY_KB_SCENE 漏了某个策略 / 写错场景名（后端标签体系里没有）；
 *   ② 「有没有真的讲到这个具体行为」的判断失效，导致拿泛泛的章节冒充精准内容。
 * 这个脚本把前端映射表与检索逻辑抽出来，用真实接口数据跑一遍，把分级结果打出来。
 *
 * 用法：先启动后端（node server.js），再跑 npm run kb:strategy
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = path.resolve(__dirname, '..', '..', '星伴体验版.html');
const BASE = process.env.KB_BASE || 'http://127.0.0.1:3001';

function grabBlock(src, name) {
  const i = src.indexOf(`const ${name} = {`);
  if (i === -1) throw new Error(`找不到 ${name}`);
  const end = src.indexOf('\n    };', i);
  return src.slice(i, end + 6);
}

(async () => {
  const src = fs.readFileSync(HTML, 'utf8');
  const { STRATEGY_CONTEXT, STRATEGY_KB_SCENE, RECORD_KB_SCENE, RECORD_KB_KEYWORDS } = new Function(
    `${grabBlock(src, 'STRATEGY_CONTEXT')}\n${grabBlock(src, 'STRATEGY_KB_SCENE')}\n${grabBlock(src, 'RECORD_KB_SCENE')}\n${grabBlock(src, 'RECORD_KB_KEYWORDS')}\nreturn { STRATEGY_CONTEXT, STRATEGY_KB_SCENE, RECORD_KB_SCENE, RECORD_KB_KEYWORDS };`,
  )();
  const names = ((src.match(/strategies: \[([\s\S]*?)\n      \],/) || [''])[0]
    .split('name: \'').slice(1).map((x) => x.split('\'')[0]));

  const tax = await (await fetch(`${BASE}/api/knowledge/taxonomy`)).json();
  const scenes = (tax.taxonomy && tax.taxonomy.scenes) || [];
  const bridge = Object.keys((tax.taxonomy && tax.taxonomy.bridge) || {});

  let fail = 0;
  const say = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) fail++; };

  console.log('\n[1] 映射表完整性');
  const ids = Object.keys(STRATEGY_CONTEXT);
  for (const id of ids) {
    const mapped = STRATEGY_KB_SCENE[id];
    say(Array.isArray(mapped) && mapped.length > 0, `策略 ${id}（${names[id - 1] || '?'}）有场景映射`);
    (mapped || []).forEach((s) => {
      if (!scenes.includes(s)) { console.log(`  ✗ 策略 ${id} 的场景「${s}」在后端标签体系里不存在`); fail++; }
    });
  }
  say(Object.keys(STRATEGY_KB_SCENE).length === ids.length, `映射表条数 ${Object.keys(STRATEGY_KB_SCENE).length} = 策略数 ${ids.length}`);

  console.log('\n[2] 每条策略的检索分级（direct=真讲到，general=同场景通用，none=没有）');
  const tally = { direct: 0, general: 0, none: 0, bridge: 0 };
  for (const id of ids) {
    const ctx = STRATEGY_CONTEXT[id];
    const behaviors = (ctx.behaviors || []).slice(0, 3);
    const mapped = STRATEGY_KB_SCENE[id] || [];
    const q = behaviors.join(' ');
    const url = (sc) => `${BASE}/api/knowledge/search?q=${encodeURIComponent(q)}&top=8`
      + (sc.length ? `&scene=${encodeURIComponent(sc.join(','))}&strictScene=1` : '');
    let pool = mapped.length ? ((await (await fetch(url(mapped))).json()).results || []) : [];
    if (pool.length < 2) pool = ((await (await fetch(url([]))).json()).results || []);
    const direct = pool.filter((r) => behaviors.some((b) => String(r.text || '').includes(b)));
    const grade = direct.length ? 'direct' : (pool.length ? 'general' : 'none');
    tally[grade]++;
    const isBridge = mapped.some((s) => bridge.includes(s));
    if (isBridge) tally.bridge++;
    console.log(`  ${String(id).padStart(2)} ${(names[id - 1] || '').padEnd(14)} ${grade.padEnd(7)} 候选 ${String(pool.length).padStart(2)} 条｜命中行为词 ${direct.length}｜${isBridge ? '薄场景→出迁移卡提示' : ''}`);
  }
  console.log(`\n  分级统计：direct ${tally.direct} / general ${tally.general} / none ${tally.none}（其中薄场景 ${tally.bridge} 条会提示迁移卡）`);

  console.log('\n[3] 场景硬过滤是否真的生效（不该出现场景外的章节）');
  const probe = await (await fetch(`${BASE}/api/knowledge/search?q=${encodeURIComponent('哭闹 尖叫 倒地')}&top=10&scene=${encodeURIComponent('愤怒与情绪失控')}&strictScene=1`)).json();
  const outOfScene = (probe.results || []).filter((r) => !(r.scenes || []).includes('愤怒与情绪失控'));
  say(outOfScene.length === 0, `返回 ${(probe.results || []).length} 条，场景外 ${outOfScene.length} 条`);

  console.log('\n[4] 快速记录分类 → 知识库场景映射');
  {
    // 分类下拉是「记录表单」的真实选项，映射表必须全覆盖——漏一个分类，
    // 那条记录保存后就会静默拿不到延伸阅读（本项目最怕的静默失效）。
    const sel = (src.match(/id="record-category"[\s\S]*?<\/select>/) || [''])[0];
    const cats = [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    say(cats.length > 0, `读到记录分类 ${cats.length} 个`);
    const missing = cats.filter((c) => !(c in RECORD_KB_SCENE));
    say(missing.length === 0, missing.length ? `缺映射：${missing.join('、')}` : '每个记录分类都有场景映射');
    const badScene = [];
    Object.values(RECORD_KB_SCENE).forEach((arr) => (arr || []).forEach((s) => { if (!scenes.includes(s)) badScene.push(s); }));
    say(badScene.length === 0, badScene.length ? `映射里场景不存在：${[...new Set(badScene)].join('、')}` : '映射里的场景都在后端标签体系内');
    const highRisk = ['自伤行为', '跑开/走失', '绝望/谈论死亡', '幻觉/妄想/意识异常'];
    say(highRisk.every((c) => (RECORD_KB_SCENE[c] || []).length > 0), '安全类分类也有场景映射（会附安全与就医提示）');
    const kwMiss = Object.keys(RECORD_KB_SCENE).filter((c) => !(c in RECORD_KB_KEYWORDS));
    say(kwMiss.length === 0, kwMiss.length ? `关键词表缺：${kwMiss.join('、')}` : '分类关键词表与场景表键完全对齐');
  }

  console.log('\n[5] 记录后两级检索的实际分布（①家长原话 / ②分类关键词兜底 / ③如实说没有）');
  {
    // 这一步同时是「映射表有没有跟语料脱节」的体检：某类忽然全不中，多半是标签或语料变了。
    let lv1 = 0; let lv2 = 0; let none = 0;
    for (const cat of Object.keys(RECORD_KB_SCENE)) {
      const sc = RECORD_KB_SCENE[cat] || [];
      const words = String(RECORD_KB_KEYWORDS[cat] || '').split(' ').filter(Boolean);
      if (!sc.length || !words.length) { console.log(`  ${cat.padEnd(20)}（未配关键词或场景，前端直接显示「教材里暂时没有」）`); continue; }
      const hit = async (q) => {
        const u = `${BASE}/api/knowledge/search?q=${encodeURIComponent(q)}&top=3&scene=${encodeURIComponent(sc.join(','))}&strictScene=1`;
        return ((await (await fetch(u)).json()).results || []);
      };
      const spoken = `${words.slice(0, 2).join(' ')}，我该怎么办`;   // 模拟家长原话
      const a = await hit(spoken);
      const b = a.length ? [] : await hit(words.join(' '));
      const level = a.length ? '①原话' : (b.length ? '②关键词' : '③没有');
      if (a.length) lv1++; else if (b.length) lv2++; else none++;
      console.log(`  ${cat.padEnd(20)} ${level}  场景内原话 ${a.length} 条｜关键词组 ${b.length} 条`);
    }
    console.log(`\n  分布：① 原话命中 ${lv1} 类 / ② 关键词兜底 ${lv2} 类 / ③ 如实说没有 ${none} 类`);
  }

  console.log(fail ? `\n有 ${fail} 项未通过。` : '\n全部通过。');
  process.exit(fail ? 1 : 0);
})();
