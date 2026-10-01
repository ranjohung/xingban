/**
 * 检索埋点与回答反馈（本地文件，不外发）
 * ------------------------------------------------------------------
 * 目的只有一个：让「检索权重该怎么调」变成可判断的事，而不是拍脑袋。
 * 记录两件事：
 *   ① 每次 /ask 的检索结果规模（命中几条、走的是哪种模式、是否出了迁移卡）；
 *   ② 家长对回答的「有帮助 / 没帮助」。
 * 由此能拿到「哪些问题问得多、却总也捞不到东西」——这才是要补语料/改权重的地方。
 *
 * 存储：`backend/logs/kb-feedback.jsonl`（逐行 JSON，追加写）。
 * 隐私边界：只存**问题本身与命中条数**，不存回答正文、不存儿童信息；
 * 本文件只落在本机，没有任何外发逻辑。问题会截断到 120 字。
 * 若将来这个服务不止跑在本机，`/api/knowledge/lowhits` 必须挪到鉴权之后。
 *
 * ── 测试噪声过滤（第二十六轮）─────────────────────────────────────
 * 为什么要有：这个日志里**混着大量「不是家长在问」的记录**，而且两边都会污染：
 *   ① `kb:eval` / `kb:units` / `kb:selftest` 直接 `require('../services/answer')` 在**进程内**
 *      调 `answer()`，每跑一次就把整套固定用例（kb:eval 22 条）写进日志。测试跑得越勤，
 *      日志里「家长」被问越多次——第二十五轮 `kb:log` 的「被反复问」榜首 ×33「孩子沉迷手机游戏」
 *      就是这么堆出来的（那不是家长问得最多的问题，是测试跑得最多的问题）。
 *   ② `ui.smoke.js` 打 `/ask-public` 时问题原文写着「烟雾测试：…」，正文里带测试标记。
 * 处理原则：**标注，而不是丢弃**。日志里的每一条都如实留着（它确实发生过），
 * 只额外记一个 `env` 字段标明来路；消费端默认只看 `env=user`，要审计时看全部。
 * 丢弃会导致「日志与真实发生过的调用对不上」，那是比噪声更难查的问题。
 *
 * 标注方式有两条互补的路，缺一不可：
 *   - 进程级（`envFromProcess()`）：进程内调用拿不到任何 HTTP 头，只能看进程来路——
 *     已设 `KB_ANALYTICS_ENV` / `NODE_ENV=test`，或入口在 `tests/`、`tools/`、`node_modules`
 *     下的测试运行器里（`node --test`）。`kb:units` 为了验「删日志—跳过量」会主动设 `KB_AUDIT_ANALYTICS=1`
 *     让极少量断言记录仍以 user 身份落盘。
 *   - 请求级（`recordAsk/recordFeedback` 的 `env`）：路由按 HTTP 头 `x-kb-analytics-env` 传进来，
 *     只认白名单 `test`（未知值一律当 `user`）——**没有鉴权，不能让调用方伪造 `user` 以外的含义**，
 *     反过来也不该让随便一个人把真家长的提问标成测试。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'kb-feedback.jsonl');
const MAX_TRACKED = 3000;      // 内存聚合最多跟踪多少个不同问题
const MAX_QUESTION = 120;      // 单条问题最长保留
const LOW_HIT = 2;             // 命中 ≤ 2 条视为「没捞到多少东西」
const MAX_LOG_BYTES = 5 * 1024 * 1024;

/** 允许的埋点来路（白名单）；未知值一律归为 `user`，不让调用方自由编造 */
const ENVS = ['user', 'test'];

/**
 * 判断「当前是不是测试/工具在跑」——用来给埋点标 env，不改任何行为。
 * 只做只读判断，任何异常都当 user（宁可多算一条真家长，也别把家长标成测试而漏看）。
 */
function envFromProcess() {
  if (process.env.KB_AUDIT_ANALYTICS === '1') return 'user';   // kb:units 的审计断言要真落盘
  const explicit = String(process.env.KB_ANALYTICS_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (explicit === 'test') return 'test';
  try {
    const entry = (process.argv[1] || '').replace(/\\/g, '/');
    // tests/ 与 tools/ 下的脚本都是自测/构建工具；node_modules 下是测试运行器（node --test）
    if (/(^|\/)(tests|tools|node_modules)\//.test(entry)) return 'test';
  } catch (e) { /* 判断失败按 user 处理 */ }
  return 'user';
}

/** 请求级 env：只认白名单，未知值当 user（路由从 x-kb-analytics-env 头传进来） */
function normalizeEnv(v) {
  return ENVS.includes(v) ? v : 'user';
}

const agg = new Map();         // 规范化问题 → 聚合
let totalAsks = 0;
let totalFeedback = 0;

function normalize(q) {
  return String(q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
}

function bump(question) {
  const key = normalize(question);
  if (!key) return null;
  let rec = agg.get(key);
  if (!rec) {
    if (agg.size >= MAX_TRACKED) {
      // 满了就丢最早的那条，避免长时间运行把内存吃光
      let oldestKey = null; let oldest = Infinity;
      for (const [k, v] of agg) if (v.lastAt < oldest) { oldest = v.lastAt; oldestKey = k; }
      if (oldestKey) agg.delete(oldestKey);
    }
    rec = { question: key, asks: 0, minHits: null, lastHits: null, feedback: 0, unhelpful: 0,
      lastMode: '', lastAt: 0, firstAt: 0 };
    agg.set(key, rec);
  }
  return rec;
}

function appendLine(obj) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch (e) { /* 文件不存在或无权限都不影响主流程 */ }
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(obj)}\n`, 'utf8');
  } catch (e) { /* 埋点失败绝不能影响回答 */ }
}

/** 记录一次提问（由 answer 层调用，成败都不抛错） */
function recordAsk(info = {}) {
  const env = info.env ? normalizeEnv(info.env) : envFromProcess();
  const rec = bump(info.question);
  totalAsks += 1;
  const hits = Number.isFinite(info.hits) ? info.hits : 0;
  if (rec) {
    rec.asks += 1;
    rec.lastHits = hits;
    rec.minHits = rec.minHits === null ? hits : Math.min(rec.minHits, hits);
    rec.lastMode = String(info.mode || '');
    rec.lastAt = Date.now();
    if (!rec.firstAt) rec.firstAt = rec.lastAt;
  }
  appendLine({ t: new Date().toISOString(), kind: 'ask', env, q: normalize(info.question), hits,
    mode: info.mode || '', bridge: !!info.bridge, scenes: info.scenes || [], ms: info.ms || 0 });
}

/** 记录一次「有帮助 / 没帮助」反馈 */
function recordFeedback(info = {}) {
  const env = info.env ? normalizeEnv(info.env) : envFromProcess();
  const rec = bump(info.question);
  const verdict = info.verdict === 'helpful' ? 'helpful' : 'unhelpful';
  totalFeedback += 1;
  if (rec) {
    rec.feedback += 1;
    if (verdict === 'unhelpful') rec.unhelpful += 1;
    rec.lastAt = Date.now();
  }
  appendLine({ t: new Date().toISOString(), kind: 'feedback', env, q: normalize(info.question),
    verdict, note: String(info.note || '').slice(0, 200),
    usedSources: Array.isArray(info.usedSources) ? info.usedSources.slice(0, 8) : [] });
  return { verdict };
}

/**
 * 运维视角的汇总：优先看「问得多 + 捞得少」和「被标没帮助」的。
 * 只返回问题（截断）、次数、命中数、模式，不返回回答正文。
 */
function report(limit = 30) {
  const rows = [...agg.values()].map((r) => ({
    question: r.question,
    asks: r.asks,
    lastHits: r.lastHits,
    minHits: r.minHits,
    unhelpful: r.unhelpful,
    feedback: r.feedback,
    lastMode: r.lastMode,
    lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : '',
    // 优先级：被明确说没帮助 > 命中太少；再按提问次数排
    score: (r.unhelpful * 10) + (r.minHits !== null && r.minHits <= LOW_HIT ? 5 : 0) + Math.min(r.asks, 5),
  }));
  rows.sort((a, b) => b.score - a.score || b.asks - a.asks);
  const low = rows.filter((r) => r.unhelpful > 0 || (r.minHits !== null && r.minHits <= LOW_HIT));
  return {
    totalAsks,
    totalFeedback,
    tracked: agg.size,
    lowHitThreshold: LOW_HIT,
    lowHitCount: low.length,
    lowHits: low.slice(0, limit),
    top: rows.slice(0, limit),
  };
}

function logFile() { return LOG_FILE; }

module.exports = { recordAsk, recordFeedback, report, normalize, logFile, LOW_HIT, envFromProcess };
