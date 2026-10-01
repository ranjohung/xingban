/**
 * 知识库接口
 * ------------------------------------------------------------------
 * GET  /api/knowledge/health            知识库加载状态与规模
 * GET  /api/knowledge/taxonomy          标签体系（场景/技术/类型）
 * GET  /api/knowledge/search?q=&scene=&tech=&type=&top=   检索
 * GET  /api/knowledge/doc/:id           取某一段全文
 * GET  /api/knowledge/tag/:tag          按标签列章节
 * GET  /api/knowledge/worksheets        「工具表单与工作表」筛出的可打印清单
 * GET  /api/knowledge/dialogues         「对话示例与逐字稿」按场景/技术整理（家长语境改写版）
 * GET  /api/knowledge/dialogue/:id      取一条示范对话（改写版 + 原文对照）
 * POST /api/knowledge/ask               知识库优先回答（登录后可用）
 * POST /api/knowledge/ask-public        知识库优先回答（体验版免登录，限流）
 */
'use strict';

const express = require('express');
const router = express.Router();
const kb = require('../services/knowledgeBase');
const kbFeedback = require('../services/kbFeedback');
const { answer, llmConfig } = require('../services/answer');
const auth = require('../middleware/auth');
const cache = require('../services/cache');

const asList = (v) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);

router.get('/health', (req, res) => {
  const s = kb.stats();
  res.json({ success: true, ...s, llm: llmConfig() ? 'configured' : 'extractive' });
});

router.get('/taxonomy', (req, res) => {
  res.json({ success: true, taxonomy: kb.taxonomy() });
});

router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) return res.status(400).json({ error: '请输入至少两个字的关键词' });
  const results = kb.search(q, {
    scenes: asList(req.query.scene),
    techs: asList(req.query.tech),
    types: asList(req.query.type),
    childOnly: req.query.child === '1' || req.query.child === 'true',
    top: Math.min(30, parseInt(req.query.top, 10) || 8),
    maxChars: Math.min(4000, parseInt(req.query.maxChars, 10) || 900),
    autoTag: req.query.autoTag !== '0',
    // strictScene=1：场景当硬条件（干预策略页的延伸阅读用，宁可少给也不给偏的）
    strictScenes: req.query.strictScene === '1',
  });
  res.json({ success: true, query: q, intent: kb.analyzeQuestion(q), count: results.length, results });
});

router.get('/doc/:id', (req, res) => {
  const doc = kb.getById(decodeURIComponent(req.params.id));
  if (!doc) return res.status(404).json({ error: '知识库中找不到该章节' });
  res.json({ success: true, doc });
});

// 「工具表单与工作表」整理成的可打印清单（只做筛选与原样呈现，不重画表格结构）
router.get('/worksheets', (req, res) => {
  const data = kb.worksheets();
  res.json({ success: true, ...data });
});

// 「对话示例与逐字稿」按场景/技术整理（正文给家长语境改写版，原文可对照）
router.get('/dialogues', (req, res) => {
  const data = kb.dialogues();
  res.json({ success: true, ...data });
});

router.get('/dialogue/:id', (req, res) => {
  const doc = kb.dialogueById(decodeURIComponent(req.params.id));
  if (!doc) return res.status(404).json({ error: '知识库中找不到该对话示例' });
  res.json({ success: true, doc });
});

router.get('/tag/:tag', (req, res) => {
  const list = kb.listByTag(decodeURIComponent(req.params.tag), Math.min(200, parseInt(req.query.top, 10) || 30));
  res.json({ success: true, tag: req.params.tag, count: list.length, sections: list });
});

// ---- 体验版：免登录问答（Redis/Memurai 限流，故障时自动回退内存）----
const MAX_PER_WINDOW = 20;

async function publicRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  try {
    const result = await cache.consumeRateLimit(`knowledge:${ip}`, MAX_PER_WINDOW, 60);
    if (!result.allowed) return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    next();
  } catch (error) {
    next(error);
  }
}

async function handleAsk(req, res) {
  const { question, ctx } = req.body || {};
  if (!question || String(question).trim().length < 2) return res.status(400).json({ error: '请描述一下你遇到的问题' });
  if (String(question).length > 1000) return res.status(413).json({ error: '问题描述过长，请精简到 1000 字以内' });
  const safeCtx = {
    age: ctx?.age ? String(ctx.age).slice(0, 20) : undefined,
    gender: ctx?.gender ? String(ctx.gender).slice(0, 10) : undefined,
    diagnosis: ctx?.diagnosis ? String(ctx.diagnosis).slice(0, 100) : undefined,
    scenes: Array.isArray(ctx?.scenes) ? ctx.scenes.slice(0, 5) : undefined,
    childOnly: ctx?.childOnly !== false,
    top: ctx?.top,
    // 埋点来路：自测（ui.smoke.js）打的是真实 HTTP，进程判断看不出来，只能靠这个头。
    // kbFeedback 只认白名单 test，未知值一律当 user——不能让调用方自由编造。
    analyticsEnv: req.get('x-kb-analytics-env'),
  };
  const out = await answer(question, safeCtx);
  res.json({ success: true, ...out });
}

router.post('/ask', auth, (req, res, next) => Promise.resolve(handleAsk(req, res)).catch(next));
router.post('/ask-public', publicRateLimit, (req, res, next) => Promise.resolve(handleAsk(req, res)).catch(next));

// 回答反馈：家长点「有帮助 / 没帮助」。免登录（体验版没有稳定身份），走同一套限流。
router.post('/feedback', publicRateLimit, (req, res) => {
  const { question, verdict, note, usedSources } = req.body || {};
  if (!question || String(question).trim().length < 2) return res.status(400).json({ error: '缺少对应的问题' });
  if (verdict !== 'helpful' && verdict !== 'unhelpful') return res.status(400).json({ error: '反馈类型不合法' });
  const out = kbFeedback.recordFeedback({ question, verdict, note, usedSources, env: req.get('x-kb-analytics-env') });
  res.json({ success: true, ...out });
});

// 检索埋点汇总：哪些问题问得多却总捞不到东西（要补语料/调权重的地方）。
// 只返回聚合结果（问题截断到 120 字），不含回答正文；若服务不止跑在本机，这里必须加 auth。
router.get('/lowhits', auth, (req, res) => {
  const data = kbFeedback.report(Math.min(100, parseInt(req.query.top, 10) || 30));
  res.json({ success: true, ...data });
});

module.exports = router;
