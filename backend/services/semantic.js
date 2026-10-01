/**
 * 语义层 —— 把「家长的口语问法」与「教材章节」放进同一个向量空间。
 *
 * 为什么需要它：BM25 只认字面。家长说「孩子一写作业就磨蹭、东摸西摸」，
 * 语料里没有「磨蹭」二字，「任务难度／专注力／拖延的成因」这些真正对口的章节
 * 就永远排不上来（查询扩展只能救「组内近义」，救不了「同一件事的另一种描述」）。
 *
 * 三条边界（与检索层一致，不能破）：
 *  ① 语义层**不做过滤**，只做打分与排序。场景/类型/儿童这些硬过滤仍在 knowledgeBase 里，
 *     语义候选同样要过一遍——「宁缺毋滥」这条线不因为加了模型就松。
 *  ② 模型不可用时**静默降级**为纯 BM25，不报错、不返回空（线上宁可少一层，不能不可用）。
 *  ③ 语义只补位、不抢位：字面命中足够的场合不允许语义把结果稀释掉（见 knowledgeBase 的门槛）。
 *
 * 向量与元数据来自 `backend/tools/embed_kb.mjs`（产物在 CBT知识库/04_检索索引/语义索引/）。
 * 换模型或改分块参数必须重跑那个脚本，本文件只读取它写的元数据，不另设默认值。
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const KB_ROOT = path.resolve(BACKEND, '..', 'CBT知识库');
const SEM_DIR = path.join(KB_ROOT, '04_检索索引', '语义索引');
const META_FILE = path.join(SEM_DIR, '索引信息.json');
const TEXT_FILE = path.join(SEM_DIR, 'vectors.f32');
const CHUNK_FILE = path.join(SEM_DIR, 'chunks.json');
const MODEL_CACHE = path.join(BACKEND, 'models');
const INDEX_VERSION_FILE = path.join(KB_ROOT, '04_检索索引', '索引版本.json');

// 关闭语义层：KB_SEMANTIC=0（离线部署、低内存机器、或需要复现历史结果时用）
const ENABLED = process.env.KB_SEMANTIC !== '0';
// 查询向量缓存：同一句问法重复编码没有意义（编码是查询文本的纯函数）
const Q_CACHE_MAX = 200;

const state = {
  status: ENABLED ? 'idle' : 'off',   // off | idle | loading | ready | failed
  reason: ENABLED ? '' : '环境变量 KB_SEMANTIC=0',
  meta: null,
  ids: null,          // 每行的章节 id
  starts: null,       // 每行的起始字符位置
  vec: null,          // Float32Array，行 × dim，已 L2 归一化
  ex: null,           // transformers.js pipeline
  loadingPromise: null,
  loadMs: 0,
  encodeCount: 0,
  lastError: null,
  qCache: new Map(),
};

/* ------------------------------ 向量侧（同步） ------------------------------ */

function loadVectors() {
  if (state.vec) return true;
  if (!fs.existsSync(META_FILE) || !fs.existsSync(TEXT_FILE) || !fs.existsSync(CHUNK_FILE)) {
    state.status = 'failed';
    state.reason = `语义索引不存在（缺 ${path.relative(BACKEND, SEM_DIR)}），先跑 node tools/embed_kb.mjs`;
    return false;
  }
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(CHUNK_FILE, 'utf8'));
  if (chunks.dim !== meta.dim) {
    state.status = 'failed';
    state.reason = `chunks.json 维度 ${chunks.dim} 与元数据 ${meta.dim} 不一致`;
    return false;
  }
  const buf = fs.readFileSync(TEXT_FILE);
  // 用 Buffer 的底层 ArrayBuffer 视图，不再复制一份（23MB 级别，省内存）
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  if (f32.length !== meta.count * meta.dim) {
    state.status = 'failed';
    state.reason = `向量文件 ${f32.length} 个数 ≠ ${meta.count}×${meta.dim}`;
    return false;
  }
  state.meta = meta;
  state.ids = chunks.ids;
  state.starts = chunks.starts;
  state.vec = f32;
  state.stale = checkStale(meta);
  if (state.stale.stale) {
    console.warn(`[semantic] ⚠ 语义向量与主索引不一致：${state.stale.reason}（重建：npm run kb:embed）`);
  }
  return true;
}

/**
 * 向量集是不是还对应着当前那一版主索引。
 * ------------------------------------------------------------------
 * 为什么必须有这道闸门：语义索引是**离线构建**的产物（`tools/embed_kb.mjs`），
 * 而主索引会被重建（finalize.py）或被增量合并（`_work/merge_source.js`）改动。
 * 两者一旦脱钩，症状是**静默的**——新章节没有向量，语义补位永远召不回它们，
 * 而 health 依旧报 `status: ready`，没人会发现少了一层能力。
 *
 * 判据是主索引的全局指纹（`索引版本.json` 的 `全局指纹`，manifest.js 写入）。
 * **null 表示「不知道」，不等于「一致」**：老版本元数据没记指纹（键名写错过），
 * 这种也必须报 stale——否则闸门形同虚设。
 *
 * 注意：stale **不关闭**语义层。现有章节的向量大多仍然有效，
 * 整层停用会让绝大多数问题都失去语义补位；如实报告 + 在 kb:units 里卡住，
 * 比默默降级或默默带病运行都更符合「不编造、可观测」的要求。
 */
function checkStale(meta) {
  let live = null;
  try {
    const m = JSON.parse(fs.readFileSync(INDEX_VERSION_FILE, 'utf8'));
    live = m['全局指纹'] || m.fingerprint || null;
  } catch (e) { live = null; }
  const mine = meta.indexFingerprint || null;
  if (!mine) {
    return { stale: true, metaFp: null, liveFp: live,
      reason: '语义索引元数据没记主索引指纹（构建脚本曾写错键名），无法确认与当前索引同源' };
  }
  if (!live) {
    return { stale: true, metaFp: mine, liveFp: null,
      reason: '读不到主索引版本清单（缺 04_检索索引/索引版本.json），无法确认同源' };
  }
  if (mine !== live) {
    return { stale: true, metaFp: mine, liveFp: live,
      reason: `主索引已变（${mine} → ${live}），语义向量未重建：改动/新增的章节没有向量` };
  }
  return { stale: false, metaFp: mine, liveFp: live, reason: '' };
}

/* ------------------------------ 模型侧（异步） ------------------------------ */

async function ensure() {
  if (!ENABLED) return false;
  if (state.status === 'ready') return true;
  if (state.status === 'failed') return false;
  if (state.loadingPromise) return state.loadingPromise;
  state.loadingPromise = (async () => {
    const t0 = Date.now();
    try {
      if (!loadVectors()) return false;
      state.status = 'loading';
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = MODEL_CACHE;
      tf.env.allowLocalModels = false;
      // 模型已在构建时下到 backend/models，这里不该再联网；远端下载只是兜底。
      state.ex = await tf.pipeline('feature-extraction', state.meta.model, { dtype: state.meta.dtype });
      state.status = 'ready';
      state.loadMs = Date.now() - t0;
      console.log(`[semantic] 就绪：${state.meta.model}（${state.meta.count} 块 / ${state.meta.dim} 维），加载 ${state.loadMs}ms`);
      return true;
    } catch (e) {
      state.status = 'failed';
      state.lastError = e.message;
      state.reason = `模型加载失败：${e.message}`;
      console.warn('[semantic] 加载失败，已降级为纯关键词检索：' + e.message);
      return false;
    } finally {
      state.loadingPromise = null;
    }
  })();
  return state.loadingPromise;
}

/** 编码一句查询，返回 L2 归一化向量（结果按查询文本缓存） */
async function encode(text) {
  const key = String(text);
  const hit = state.qCache.get(key);
  if (hit) return hit;
  if (!(await ensure())) return null;
  const out = await state.ex([key], { pooling: state.meta.pooling || 'cls', normalize: true });
  const v = out.tolist()[0];
  state.encodeCount += 1;
  if (state.qCache.size >= Q_CACHE_MAX) state.qCache.delete(state.qCache.keys().next().value);
  state.qCache.set(key, v);
  return v;
}

/* ------------------------------ 打分 ------------------------------ */

/** 余弦（向量已归一化，点积即余弦） */
function dot(v, off, q) {
  let s = 0;
  for (let i = 0; i < q.length; i++) s += v[off + i] * q[i];
  return s;
}

/**
 * 算出每一章与查询的语义相似度（取该章所有分块的最大值——只要有一段在讲这件事，
 * 这一章就相关，其余内容是别的段落）。
 * 返回 { scores: Map<id, cos>, best: Map<id, {cos, start}>, encodeMs, scanMs }；不可用时返回 null。
 */
async function scoresFor(query) {
  if (!ENABLED) return null;
  let qv;
  const t0 = Date.now();
  try {
    qv = await encode(query);
  } catch (e) {
    state.lastError = e.message;
    return null;
  }
  if (!qv) return null;
  const encodeMs = Date.now() - t0;
  const t1 = Date.now();
  const { ids, starts, vec, meta } = state;
  const dim = meta.dim;
  const scores = new Map();
  const best = new Map();
  for (let r = 0; r < ids.length; r++) {
    const c = dot(vec, r * dim, qv);
    const id = ids[r];
    const prev = scores.get(id);
    if (prev === undefined || c > prev) {
      scores.set(id, c);
      best.set(id, { cos: c, start: starts[r] });
    }
  }
  return { scores, best, encodeMs, scanMs: Date.now() - t1, chunks: ids.length,
    version: meta.chunkFingerprint || meta.builtAt || 'sem' };
}

/* ------------------------------ 观测 ------------------------------ */

function info() {
  if (!state.meta) loadVectors();
  return {
    enabled: ENABLED,
    status: state.status,
    reason: state.reason || undefined,
    model: state.meta ? state.meta.model : null,
    dtype: state.meta ? state.meta.dtype : null,
    dim: state.meta ? state.meta.dim : null,
    chunks: state.meta ? state.meta.count : null,
    docs: state.meta ? state.meta.docCount : null,
    builtAt: state.meta ? state.meta.builtAt : null,
    chunkChars: state.meta ? state.meta.chunkChars : null,
    stride: state.meta ? state.meta.stride : null,
    // 上次构建是增量还是全量、复用了多少块（`tools/embed_kb.mjs` 写入）：
    // 复用数恒为 0 说明每次都在白跑全量，这一项就是给这种情况照镜子的
    buildMode: state.meta ? state.meta.mode : undefined,
    reused: state.meta ? state.meta.reused : undefined,
    encoded: state.meta ? state.meta.encoded : undefined,
    loadMs: state.loadMs || undefined,
    encodeCount: state.encodeCount,
    qCache: state.qCache.size,
    lastError: state.lastError || undefined,
    // 与主索引的一致性：stale=true 表示向量集与当前索引脱钩（详见 checkStale）
    stale: state.stale ? state.stale.stale : undefined,
    staleReason: state.stale && state.stale.stale ? state.stale.reason : undefined,
    indexFingerprint: state.stale ? state.stale.metaFp : undefined,
    liveIndexFingerprint: state.stale ? state.stale.liveFp : undefined,
  };
}

/** 仅测试用：把状态复位（不卸载模型，避免反复加载） */
function _resetForTest() {
  state.qCache.clear();
}

module.exports = { ensure, encode, scoresFor, info, _resetForTest, SEM_DIR, ENABLED };
