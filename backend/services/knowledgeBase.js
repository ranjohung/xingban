/**
 * 知识库检索服务
 * ------------------------------------------------------------------
 * 数据来源：CBT知识库/04_检索索引/检索索引.json（942 个章节单元，含全文）
 *           CBT知识库/04_检索索引/标签体系.json
 *
 * 特点：
 *  - 零外部依赖（中文用「单字 + 二元组」倒排索引，不依赖 jieba）
 *  - 支持关键词 + 问题场景 + 技术方法 + 内容类型 四维组合检索
 *  - 返回结果自带出处（书籍/课件名 + 章节路径 + 章节 id），便于前端标注引用
 */
'use strict';

const fs = require('fs');
const path = require('path');
// 语境改写规则与 answer.js 共用一份（详见 services/adultContext.js 顶部说明）
const { adultLevel, softenAdultContext } = require('./adultContext');
const semantic = require('./semantic');

const KB_ROOT = path.resolve(__dirname, '..', '..', 'CBT知识库');
const IDX_DIR = path.join(KB_ROOT, '04_检索索引');
const FULL_INDEX = path.join(IDX_DIR, '检索索引.json');
const TAXONOMY = path.join(IDX_DIR, '标签体系.json');
// OCR 人工校正表：只作用于正文，章节名（heading）按约定原样保留
const OCR_FIX_FILE = path.join(KB_ROOT, '_work', 'ocr_校正表.json');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

let DOCS = null;
let TAX = null;
let POSTING = null;      // token -> Map(docIdx -> weight)
let DOC_LEN = null;
let AVG_LEN = 0;
let LOADED_AT = null;
let LOAD_ERROR = null;
let DUP = null;          // 出处重名的「来源 · 章节」集合
let DOC_BY_ID = new Map(); // id -> 文档对象（语义补位时按 id 取回章节）
let LAST_ESC = null;     // 最近一次「语义开口」的判定详情（诊断用，见 _lastEscape）
let OCR_FIX = null;      // { rules:Map, regex:[] } OCR 校正规则
let OCR_FIXED = 0;       // 本次加载共修正的错字次数（供 stats 汇报）
let WEAK_SOURCES = null; // 扫描质量欠佳的来源（校正表里声明），给前端提示用
let INDEX_VERSION = null; // 索引版本号与指纹（由 _work/manifest.js 生成，构建时更新）

/* --------------------------- OCR 校正 --------------------------- */

/**
 * OCR 人工校正表在 _work/ocr_校正表.json，由人工核样定稿（见表内「排除」节）。
 * 只修正正文：检索命中、引用摘句、前端弹窗读到的都是修正后的文本；
 * 章节名是引用元数据，保持原书扫描件原样，前端加「原书章节名」标识。
 * 校正表缺失或损坏时降级为内置最小规则集（核心混淆对），服务不中断。
 */
const OCR_FALLBACK = {
  // 只在 _work/ocr_校正表.json 缺失/损坏时兜底，只保留最高频、最不会有歧义的几条。
  // 顺序仍是长词在前（患惠者 必须先于 惠者）。
  rules: { 患惠者: '患者', 惠者: '患者', 懿知: '认知', 舆: '与', 间题: '问题',
    周题: '问题', 影馨: '影响', 馨师: '医师', 于预: '干预', 千预: '干预',
    于扰: '干扰', 千扰: '干扰', 概急化: '概念化', 予盾: '矛盾', 白信: '自信',
    恐俱: '恐惧', 日标: '目标', 强追: '强迫', 冶疗: '治疗', 焦虚: '焦虑',
    评枯: '评估', 可柏: '可怕' },
  regex: [{ pattern: 'PDG[^\\s，。；、！？」】\\n]{0,14}', replacement: '' }],
};

function loadOcrFix() {
  if (OCR_FIX) return OCR_FIX;
  try {
    const t = JSON.parse(fs.readFileSync(OCR_FIX_FILE, 'utf8'));
    OCR_FIX = {
      rules: new Map(Object.entries(t.规则 || t.rules || {})),
      regex: (t.正则 || t.regex || []).map((r) => ({ re: new RegExp(r.模式 || r.pattern, 'g'), to: r.替换 || r.replacement || '' })),
    };
    WEAK_SOURCES = new Set(t.扫描质量欠佳 || []);
  } catch (e) {
    OCR_FIX = {
      rules: new Map(Object.entries(OCR_FALLBACK.rules)),
      regex: OCR_FALLBACK.regex.map((r) => ({ re: new RegExp(r.pattern, 'g'), to: r.replacement })),
    };
    WEAK_SOURCES = new Set();
  }
  return OCR_FIX;
}

/**
 * 该来源的扫描质量是否欠佳（引用时前端要提示，避免拿错字当星伴的错）。
 * 权威来源是索引里的 quality 字段（finalize.py 依 _work/source_quality.json
 * 与 source_quality.py 的误认字密度判定生成，见 04_检索索引/来源质量.md）；
 * 校正表里的「扫描质量欠佳」名单是它的同步副本，只是兜底，防止索引没重建。
 */
function scanQualityOf(source, docQuality) {
  if (docQuality === 'low') return 'weak';
  loadOcrFix();
  return WEAK_SOURCES && WEAK_SOURCES.has(source) ? 'weak' : 'normal';
}

/** 对一段正文应用 OCR 校正，返回修正后的文本 */
function fixOcr(text) {
  const fx = loadOcrFix();
  let out = String(text);
  for (const [from, to] of fx.rules) {
    if (out.includes(from)) {
      OCR_FIXED += out.split(from).length - 1;
      out = out.split(from).join(to);
    }
  }
  for (const { re, to } of fx.regex) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => { OCR_FIXED += 1; return to; });
  }
  return out;
}

/* ------------------------------ 分词 ------------------------------ */

function tokenize(text) {
  const out = [];
  const src = String(text || '');
  const buf = [];
  for (const ch of src) {
    if (CJK.test(ch)) {
      buf.push(ch);
    } else {
      if (buf.length) { pushCjk(buf, out); buf.length = 0; }
      if (/[A-Za-z0-9]/.test(ch)) out.push(ch.toLowerCase());
    }
  }
  if (buf.length) pushCjk(buf, out);
  return out;
}

function pushCjk(buf, out) {
  const n = buf.length;
  for (let i = 0; i < n; i++) {
    out.push(buf[i]);                                  // 单字
    if (i + 1 < n) out.push(buf[i] + buf[i + 1]);      // 二元组
  }
}

/** 查询侧分词：只取二元组 + 连续英文词，召回更聚焦 */
function tokenizeQuery(text) {
  const src = String(text || '');
  const out = [];
  const buf = [];
  let ascii = '';
  const flushAscii = () => {
    if (ascii.length >= 2) out.push(ascii.toLowerCase());
    ascii = '';
  };
  for (const ch of src) {
    if (CJK.test(ch)) {
      flushAscii();
      buf.push(ch);
    } else {
      if (buf.length) { pushCjk(buf, out); buf.length = 0; }
      if (/[A-Za-z0-9]/.test(ch)) ascii += ch;
      else flushAscii();
    }
  }
  if (buf.length) pushCjk(buf, out);
  flushAscii();
  // 单字权重低，保留少量以提升短查询召回
  return out;
}

/* ------------------------------ 加载 ------------------------------ */

function load() {
  if (DOCS) return true;
  try {
    const raw = JSON.parse(fs.readFileSync(FULL_INDEX, 'utf8'));
    OCR_FIXED = 0;
    DOCS = raw.map((d, i) => ({ ...d, _i: i, text: fixOcr(d.text) }));
    TAX = JSON.parse(fs.readFileSync(TAXONOMY, 'utf8'));

    // 出处唯一化：942 个章节里有 25 组「来源 · 章节名」完全相同（课件同名幻灯片、
    // 书里重复的小标题）。这种出处无法定位到唯一段落，所以给重名的那些补一个
    // 「｜#序号」后缀（序号取自章节 id，稳定不变），单命的出处保持原样。
    const groups = new Map();
    DOCS.forEach((d) => {
      const k = `${d.source} · ${d.heading}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    });
    DUP = new Set();
    for (const [k, arr] of groups) if (arr.length > 1) DUP.add(k);
    for (const d of DOCS) {
      const k = `${d.source} · ${d.heading}`;
      const seq = String(d.id).split('#')[1];
      d.citation = DUP.has(k) && seq ? `${k}｜#${seq}` : k;
    }
    DOC_BY_ID = new Map(DOCS.map((d) => [d.id, d]));

    POSTING = new Map();
    DOC_LEN = new Float64Array(DOCS.length);
    let total = 0;
    DOCS.forEach((d) => {
      const toks = tokenize(`${d.heading}\n${d.text}`);
      DOC_LEN[d._i] = toks.length;
      total += toks.length;
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [t, c] of tf) {
        if (!POSTING.has(t)) POSTING.set(t, new Map());
        POSTING.get(t).set(d._i, c);
      }
    });
    AVG_LEN = total / Math.max(1, DOCS.length);

    // 索引版本清单（_work/manifest.js 生成）。读不到就算了——版本号只是运维参考，
    // 不该因为它缺失就拒绝服务。
    try {
      const m = JSON.parse(fs.readFileSync(path.join(IDX_DIR, '索引版本.json'), 'utf8'));
      INDEX_VERSION = { version: m.版本, fingerprint: m.全局指纹, builtAt: m.生成时间 };
    } catch (e) {
      INDEX_VERSION = { version: 'unknown', fingerprint: null, builtAt: null };
    }
    LOADED_AT = new Date().toISOString();
    LOAD_ERROR = null;
    clearSearchCache(); // 索引换了，旧缓存全部作废（首次加载时本来就为空）
    return true;
  } catch (e) {
    LOAD_ERROR = e.message;
    DOCS = null;
    DOC_BY_ID = new Map();
    return false;
  }
}

/* --------------------------- 问题理解 --------------------------- */

/**
 * 从一段自然语言里推断可能命中的场景 / 技术 / 类型标签。
 * 两路证据：① 提问侧关键词直配　② 初步检索结果的标签投票
 * @returns {{scenes:string[], techs:string[], types:string[], child:boolean}}
 */
function analyzeQuestion(text) {
  load();
  const q = String(text || '');
  const hit = (arr, list) => list.filter((k) => q.includes(k));

  const score = {};
  if (TAX && TAX.query_keywords) {
    for (const [cat, kws] of Object.entries(TAX.query_keywords)) {
      // 先按长度降序，再丢掉「已被更长命中词包含」的短词，
      // 避免「考试」+「考试焦虑」被算两次，也让更具体的说法拿到更高权重。
      const matched = kws.filter((k) => q.includes(k)).sort((a, b) => b.length - a.length);
      const kept = [];
      for (const k of matched) {
        if (kept.some((x) => x.includes(k))) continue;
        kept.push(k);
      }
      let s = 0;
      for (const k of kept) s += Math.min(4, k.length);
      if (s > 0) score[cat] = s;
    }
  }
  // 关键词命中优先级最高
  let scenes = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  // 标签投票：拿纯 BM25 前 12 篇的既有标签补票（权重低，不覆盖关键词）
  if (scenes.length < 2) {
    const vote = {};
    for (const d of rawSearch(q, {}, 12)) {
      for (const s of d.scenes) vote[s] = (vote[s] || 0) + 1;
    }
    const extra = Object.entries(vote).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    scenes = uniq([...scenes, ...extra]);
  }

  const childWords = ['孩子', '儿子', '女儿', '儿童', '青少年', '青春期', '学生',
    '小朋友', '宝宝', '家长', '父母', '老师', '学校', '幼儿园', '上学', '娃'];
  return {
    scenes: scenes.slice(0, 4),
    techs: TAX ? hit(q, TAX.techs) : [],
    types: TAX ? hit(q, TAX.types) : [],
    child: childWords.some((w) => q.includes(w)),
  };
}

/** 提问意图：想知道「怎么做」还是「为什么」 */
function intentOf(text) {
  const q = String(text || '');
  const action = /(怎么办|怎么办|如何|怎么|怎样|有什么办法|教我|步骤|方法|怎么跟|该说什么|如何应对|怎么处理|帮我)/.test(q);
  const why = /(为什么|原因|怎么回事|是什么|怎么回事|怎么会|原理|机制|是不是)/.test(q);
  if (action && !why) return 'action';
  if (why && !action) return 'why';
  return action ? 'action' : 'why';
}

const ACTION_TYPES = ['练习与作业', '工具表单与工作表', '对话示例与逐字稿'];
const WHY_TYPES = ['理论与模型', '评估与个案概念化'];

/* --------------------------- 检索结果缓存 --------------------------- */

/**
 * 同一个问题短时间内重复问（一条回答管线里对同一句问题要跑多次检索、
 * 前端重发、家长反复问同一件事）时，不必每次重跑 BM25 + 标签推断。
 *
 * 实话说：单次检索现在 0.2ms 级，这一层的意义**不在省这几毫秒**，而在
 *  ① 并发真上来之前先把闸门和淘汰策略立好；
 *  ② 命中/未命中计数进 stats（/api/knowledge/health 可读），检索压力可观测。
 *
 * 边界（每一条都是正确性红线）：
 *  - 条目上限 200、TTL 10 分钟、插入序淘汰，绝不无限增长；
 *  - key 覆盖**所有**影响结果的因素（top/maxChars/autoTag/childOnly/intent/
 *    strictTypes/strictScenes + 三个标签数组排序后）——漏编一个就是串答；
 *  - 存的是序列化文本，命中时 JSON.parse 出**深拷贝**、未命中时直接返回新建数组：
 *    调用方改了拿到的结果，绝不能污染缓存；
 *  - 索引重新加载时整表清空（load() 成功路径里调用 clearSearchCache）。
 *
 * ── 第三十三轮：**带语义的检索绝不进这张表**（修一处缓存泄漏）──────────
 * 本表的 value 曾是 `JSON.stringify(result)`（文本），这没问题；泄漏出在 **key**：
 * `searchCacheKey()` 把整个 `opt` 编进去，而 answer() 走 `searchAsync(q, {...opt, _sem: sem})`
 * 时，`opt._sem` 是语义层的整个打分对象——ids 935 项、starts 935 项、scores/best 各一个
 * 935 项的 Map，且里面**抓住着 14155×512 维的 Float32Array 视图**（scoresFor 的
 * `best` 每行都带 `start`，Map value 是堆上对象，Float32Array 本体由它间接可达）。
 * 这张表 TTL 10 分钟、上限 200 条——期间这些对象全部不可回收。
 * 后果（第三十三轮实测，`--max-old-space-size=256` 的探针见 kb.units [5d]）：
 *   · 带 `_sem` 跑 200 次检索 → 堆增长 ~90 MB，逐字等价于 queryCache 的 200 条；
 *   · **堆超限后 Node 不抛 OOM，而是 V8 压缩回收→救不回→进程直接消失**（无堆栈），
 *     与语义向量加载（~200 MB）叠加后，Node 默认 ~4 GB 堆在长会话/多进程机器上也可能触底。
 * 修法（见 searchAsync / POOL_CACHE 注释）：语义打分的可复用部分改由 POOL_CACHE 承担
 * （键只编池成员 id，不挂任何 `_sem` 引用），本表只写**无语义**的结果，`_sem` 永远进不了 key。
 */
const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;
let SEARCH_CACHE = new Map();   // key -> { at:ms, json:序列化结果 }
let CACHE_HITS = 0;
let CACHE_MISSES = 0;

function searchCacheKey(query, opt) {
  const o = {};
  for (const k of ['top', 'maxChars', 'autoTag', 'childOnly', 'intent', 'strictTypes', 'strictScenes']) {
    if (opt[k] !== undefined) o[k] = opt[k];
  }
  // 标签数组不关心顺序，排序后编进 key，避免「同一组标签换个顺序」打穿缓存
  for (const k of ['scenes', 'techs', 'types']) {
    if (opt[k] && opt[k].length) o[k] = uniq([...opt[k]]).sort();
  }
  // ★ 第三十三轮：key 里**不许出现** `_sem`（那是语义打分对象，见表头注释）。
  // 带语义的检索本来就不该进这张表——`search()` 结尾有 assertCacheable() 兜底，
  // 这里显式忽略 `_sem`，免得以后有人「顺手补上」又把对象挂进 key。
  // 走不走语义会得到不同结果，所以带语义调用的缓存改由 POOL_CACHE 承担。
  if (opt._sem) return null;
  return JSON.stringify([String(query == null ? '' : query), o]);
}

/** 这张结果缓存只接受「无语义」的检索（value 是纯文本，key 里不许有对象） */
function assertCacheable(key) {
  return typeof key === 'string' && key.length > 0;
}

function searchCacheGet(key) {
  if (!assertCacheable(key)) { CACHE_MISSES += 1; return null; }
  const e = SEARCH_CACHE.get(key);
  if (!e) { CACHE_MISSES += 1; return null; }
  if (Date.now() - e.at > CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    CACHE_MISSES += 1;
    return null;
  }
  CACHE_HITS += 1;
  return JSON.parse(e.json);
}

function searchCachePut(key, result) {
  if (!assertCacheable(key)) return;
  if (SEARCH_CACHE.size >= CACHE_MAX) {
    // 插入序淘汰：Map 迭代按插入顺序，删最早写入的那条。
    // 不做 LRU——检索负载里没有明显的局部性，LRU 的额外维护不值得。
    SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value);
  }
  SEARCH_CACHE.set(key, { at: Date.now(), json: JSON.stringify(result) });
}

function clearSearchCache() {
  SEARCH_CACHE = new Map();
  CACHE_HITS = 0;
  CACHE_MISSES = 0;
}

/* ── 第三十三轮：池级缓存（POOL_CACHE）——语义检索真正复用的是它 ─────────
 *
 * 这张缓存存的是 `search()` 在**截断/映射成对外格式之前**的最终候选池（池成员引用
 * 组成的数组），键只编「池成员 id（按序）+ top + 会改变池组成的开关」。
 * **键与值里都不允许出现 `_sem`**——这是修缓存泄漏的整个要点：
 *   · `searchCacheKey()` 会把整个 `opt` 编进 key，answer() 走 searchAsync 时 `opt._sem`
 *     是语义层打分对象（ids/starts/scores/best，抓着 14155×512 维 Float32Array 视图）；
 *     把它编进 key = 把几十 MB 的活对象链抓在一张 TTL 10 分钟、200 条的表里。
 *   · 池成员 id 是「这条池是怎么选出来的」的完整指纹：对同一个问题，
 *     候选召回、语义开口、语义补位都只取决于 (查询, 参数, 当时的语义分)，
 *     而语义分对同一文本在 T min 内是确定的（查询向量缓存 200 条 + 打分确定性），
 *     所以「池成员相同 ⇒ 后续截断/映射结果相同」成立；语义版本变化由
 *     clearSearchCache()（索引重载时同时清两张表）+ 池成员变化兜底。
 * 与 result 缓存的分工：
 *   · 无语义调用（管理页 /search、strategy 页、eval 对照）→ 走 SEARCH_CACHE，
 *     缓存到「对外 JSON 文本」这一步（省掉截断/映射/JSON.parse 的重复开销）；
 *   · 带语义调用（answer 主路径）→ 只走 POOL_CACHE，**绝不写 SEARCH_CACHE**
 *     （写入也要经 assertCacheable 拒绝）。语义分对象从头到尾不进任何缓存键。
 * 边界（与 result 缓存同一套纪律）：
 *   - 条目上限 POOL_CACHE_MAX、同一 TTL、插入序淘汰，绝不无限增长；
 *   - 池成员是 DOCS 里的**活对象**（带 `_sem`/`_semEscape`/`_score` 等重排标记），
 *     缓存的是「重排后的数组引用」——调用方（search 内核）会复用它生成对外结果，
 *     但对外结果是每次新建的映射对象，调用方拿到的仍是深拷贝语义，不受污染；
 *     唯一例外是重排标记（`d._sem` 等）会被下次 rerank 重算覆盖——rerankPool
 *     是纯函数式覆盖写，不累积，所以复用安全（kb.units [5d] 有往返一致性断言）。
 *   - 索引重载时与 result 缓存一起清空。
 */
const POOL_CACHE_MAX = 400;
let POOL_CACHE = new Map();       // poolKey -> { at: ms, pool: docRef[] }
let POOL_HITS = 0;
let POOL_MISSES = 0;

function poolCacheKey(query, opt, top) {
  // 参数白名单：只编「会改变池组成」的东西。_sem 永远不进来（整个修复的意义所在）。
  const o = { top };
  for (const k of ['childOnly', 'intent', 'strictTypes', 'strictScenes', 'autoTag']) {
    if (opt[k] !== undefined) o[k] = opt[k];
  }
  for (const k of ['scenes', 'techs', 'types']) {
    if (opt[k] && opt[k].length) o[k] = uniq([...opt[k]]).sort();
  }
  // 语义层的版本（换模型/重建索引时池会变）：只编**版本字符串**，不编对象。
  if (opt._sem) o.semV = String(opt._sem.version || 'on');
  return JSON.stringify([String(query == null ? '' : query), o]);
}

function poolCacheGet(key) {
  const e = POOL_CACHE.get(key);
  if (!e) { POOL_MISSES += 1; return null; }
  if (Date.now() - e.at > CACHE_TTL_MS) {
    POOL_CACHE.delete(key);
    POOL_MISSES += 1;
    return null;
  }
  POOL_HITS += 1;
  return e.pool;
}

function poolCachePut(key, pool) {
  if (POOL_CACHE.size >= POOL_CACHE_MAX) {
    POOL_CACHE.delete(POOL_CACHE.keys().next().value);
  }
  POOL_CACHE.set(key, { at: Date.now(), pool });
}

/* --------------------------- 语义扩展（重排） --------------------------- */

/**
 * P1「语义相关性」短板的检索侧落地：**查询扩展重排**。
 *
 * 问题：BM25 只认词面。家长问「考前焦虑」，一本讲「考前紧张、担心考砸」的章节
 * 因为通篇没有「焦虑」两个字而排不上去——语义相关、词面不沾边。
 *
 * 做法（不引依赖、不引模型）：把标签体系里人工维护的 18 组场景口语词
 * （query_keywords，每组的词本来就是「同一件事的不同说法」）当作**概念组**，
 * 问题里出现组内任一成员，就把其余成员作为**低权重扩展词**加进检索计分。
 * 另有少量补充组放在 `_work/语义关联词表.json`（星伴整理，可人工复核）。
 *
 * 红线：
 *  - 扩展词只影响 BM25 计分，**不动场景/类型硬过滤**（strictScenes / strictTypes
 *    的语义不能被扩展词稀释——「自伤响应」页配出「人际关系问题」那种事不能再犯）；
 *  - 扩展词**不计入查询覆盖率**：只靠扩展词命中的章节，覆盖率仍是 0、
 *    基础分被压到 0.55 系数，永远排在字面命中之下——宁缺毋滥；
 *  - 只用 ≥2 字的成员（单字如「怕」会到处误触发），组间去重，总量封顶；
 *  - 扩展是查询文本的纯函数：同一问题永远得到同一组扩展词，不影响检索缓存。
 * 诚实说明：这仍是词表级扩展，替代不了句向量 / 交叉编码器，也替代不了
 * LLM Key 到位后的「生成 + 引用约束」——它只是把「同义词排不上去」这一类
 * 可明确的错误先修掉。P1 条目保持部分开放，见开发计划。
 */

const EXPAND_W = 0.45;       // 扩展词权重（主词是 1）
const EXPAND_MAX = 40;       // 扩展词总量上限
const EXPAND_FILE = path.join(KB_ROOT, '_work', '语义关联词表.json');

let EXPAND_INDEX = null;     // 成员 -> Set(组内其余成员)

function loadExpandIndex() {
  if (EXPAND_INDEX) return EXPAND_INDEX;
  load();                    // 概念组来自标签体系，索引没加载就先加载
  const groups = [];
  if (TAX && TAX.query_keywords) {
    for (const kws of Object.values(TAX.query_keywords)) {
      const g = uniq((kws || []).filter((k) => k && k.length >= 2));
      if (g.length >= 2) groups.push(g);
    }
  }
  // 补充词表（可选）：口语里标签体系没覆盖的近义说法，缺失不碍事
  try {
    const sup = JSON.parse(fs.readFileSync(EXPAND_FILE, 'utf8'));
    for (const g of (sup.组 || [])) {
      const gg = uniq((g || []).map((k) => String(k).trim()).filter((k) => k.length >= 2));
      if (gg.length >= 2) groups.push(gg);
    }
  } catch (e) { /* 补充表缺失/损坏时只用标签体系 */ }
  EXPAND_INDEX = new Map();
  for (const g of groups) {
    for (const m of g) {
      if (!EXPAND_INDEX.has(m)) EXPAND_INDEX.set(m, new Set());
      for (const x of g) if (x !== m) EXPAND_INDEX.get(m).add(x);
    }
  }
  return EXPAND_INDEX;
}

/**
 * 查询扩展：返回应加入计分的扩展词（≥2 字、去重、不含问题里已有的词）。
 * 成员匹配用「问题原文包含该词」——比 token 精确匹配宽松一点，
 * 换来的是「考前焦虑」里能认出「焦虑」、「不想上学」里能认出「上学」。
 */
function expandQuery(query) {
  const idx = loadExpandIndex();
  const q = String(query || '');
  if (!q || !idx) return [];
  const out = [];
  const seen = new Set();
  for (const [m, others] of idx) {
    if (m.length < 2 || !q.includes(m)) continue;
    for (const x of others) {
      if (x.length < 2 || seen.has(x) || q.includes(x)) continue;
      seen.add(x);
      out.push(x);
      if (out.length >= EXPAND_MAX) return out;
    }
  }
  return out;
}

/* --------------------------- 语义层（句向量重排） --------------------------- */

/**
 * P1「语义相关性」的最后一层：**句向量打分与融合**（真正语义级的重排）。
 *
 * 和上面的查询扩展有什么不同：扩展仍是词表，只能救「组内近义」（考前焦虑 ↔ 紧张）。
 * 救不了「同一件事换一种描述」——家长说「一写作业就磨蹭、东摸西摸」，
 * 语料里没有「磨蹭」，讲「任务难度／专注力／拖延成因」的章节就永远排不上来。
 * 这一层用模型把问法与章节放进同一向量空间，直接比语义。
 *
 * 三条边界（沿用检索层已定的红线，不能破）：
 *  ① **语义不做过滤**：候选仍要过完整的场景/类型/儿童过滤。语义只改排序与补位，
 *     绝不让「自伤响应」配出「人际关系问题」那种事重演。
 *  ② **语义不抢位**：只有在关键词检索**召回不足**（走放宽分支）时才允许补位，
 *     字面命中足够的场合一律不动成员、只做组内重排——宁缺毋滥。
 *  ③ **不可用时静默降级**：模型没装好/索引没建，行为与加这一层之前完全一致。
 *
 * 实现放在 services/semantic.js；本文件只用它算出来的 `Map<id, 余弦>`。
 * 因为编码查询是异步的，异步入口是 `searchAsync()`，同步的 `search()` 保持原样，
 * 由调用方决定要不要走语义（答案是 async 的，直接用 searchAsync 即可）。
 */

const SEM_W = 0.4;        // 语义分在融合里的权重（0 = 纯 BM25，1 = 纯语义）
const SEM_ADD_MIN = 0.60; // 语义补位的最低余弦（低于此不认为「在讲同一件事」）
const SEM_ADD_MAX = 2;    // 一次最多补几条
const SEM_ESCAPE_MIN = 0.62; // 语义开口的最低余弦（只对「场景标签缺失」的章节）
const SEM_ESCAPE_MAX = 8;    // 一次最多开口放进几条

/** 硬/软过滤谓词：严格档（场景+技术+类型+儿童）与放宽档（只守硬条件） */
function passesStrict(d, f) {
  return (!f.hardChild || d.child)
    && (!f.scenes.length || f.scenes.some((s) => d.scenes.includes(s)))
    && (!f.techs.length || f.techs.some((s) => d.techs.includes(s)))
    && (!f.wantTypes.length || f.wantTypes.some((s) => d.types.includes(s)))
    && (!f.wantScenes.length || f.wantScenes.some((s) => d.scenes.includes(s)));
}

function passesRelaxed(d, f) {
  return (!f.hardChild || d.child)
    && (!f.wantTypes.length || f.wantTypes.some((s) => d.types.includes(s)))
    && (!f.wantScenes.length || f.wantScenes.some((s) => d.scenes.includes(s)));
}

/**
 * 语义开口：把「语义上正中主题、但**一个场景标签都没有**」的章节补进候选。
 *
 * 为什么需要它（实测出来的，不是推演）：问「孩子睡前哭闹，怎么安抚都没用」，
 * 全书唯一讲这件事的章节（*1-2：认知行为治疗的基础与框架#018*「行为消失：孩子夜里睡觉
 * 发脾气，家长不再理会」）语义排名**全库第 1**（余弦 0.623），却被过滤掉了——
 * 它的场景标签是空的，而 auto 推断出的场景（低自尊/亲子关系/焦虑/愤怒）要求
 * 「必须命中其中一个」。等于拿**猜出来的场景**枪毙了**只是没打标签**的章节。
 *
 * 所以口子开得很窄，四条同时满足才放行：
 *  ① 只对「场景标签为空」的章节开口——标签是**缺失**不是**矛盾**；
 *     标了冲突场景的仍旧排除（第七轮「自伤响应配出人际关系问题」那种事不能重演）；
 *  ② 场景必须是 analyzeQuestion **自动推断**出来的；调用方显式传了 scenes
 *     或 strictScenes 时一律不开口（那是有意为之的硬条件，不是猜测）；
 *  ③ 语义余弦 ≥ SEM_ESCAPE_MIN，且必须明显高于进榜的同类候选；
 *  ④ 数量封顶 SEM_ESCAPE_MAX。
 * 放行的条目标 `_semOnly`，回答层据此知道它不是字面命中的结果。
 */
function semEscapeAllowed(d, f, autoOnly) {
  if (!autoOnly) return false;
  if (f.hardChild && !d.child) return false;
  if (f.wantTypes.length && !f.wantTypes.some((s) => d.types.includes(s))) return false;
  if (!d.scenes.length) return true;
  return false;
}

/**
 * 开口门槛。**判据要稳定**：不能用「比池内最高的高 0.02」这种相对量——
 * 候选池随 top 变大，池内最高余弦也会抬高，门槛跟着水涨船高，
 * 结果同一个问题在 top=6 时开口、top=8 时哑火（实测踩到过）。
 * 所以只看两个绝对量：① 余弦 ≥ SEM_ESCAPE_MIN；
 * ② 它是**语义最强的那一条**（在候选里没有别的候选比它更强，含已被字面召回的）。
 * ②保证开口不会把「手头已经有更对口的了」的情况也放进来。
 */
function escapeBar(cands, sem, f, autoOnly) {
  if (!sem || !sem.scores.size || !autoOnly || !f.scenes.length) return { ok: false, why: '不适用' };
  let bestCos = 0;
  for (const d of cands) {
    if (!passesStrict(d, f)) continue;
    const c = sem.scores.get(d.id);
    if (c !== undefined && c > bestCos) bestCos = c;
  }
  return { ok: true, bestCos };
}

function injectSemanticEscapes(cands, sem, f, autoOnly) {
  const g = escapeBar(cands, sem, f, autoOnly);
  if (!g.ok) {
    LAST_ESC = { ...g, cands: cands.length, extra: 0, allow: 0 };
    return { list: cands, ids: null, debug: LAST_ESC };
  }
  const bar = Math.max(SEM_ESCAPE_MIN, g.bestCos);
  const have = new Set(cands.map((d) => d.id));
  // 放行名单要包含**两类**章节，这是踩过的坑：
  //  ① 词面完全没召回的（要注入，否则它根本不在候选里）；
  //  ② 词面召回到了、但因为「场景标签为空」被严格过滤弹掉的。
  // 初版只处理了 ①，于是 top=8 时 #018 恰好被词面召回进候选，开口判定认为
  // 「它已经在候选里、无需注入」而不记录放行，紧接着又被过滤扔掉——静默消失。
  const allow = new Set();
  const extra = [];
  for (const [id, c] of sem.scores) {
    if (c < bar) continue;
    const d = DOC_BY_ID.get(id);
    if (!d || !semEscapeAllowed(d, f, autoOnly)) continue;
    allow.add(id);
    if (!have.has(id)) extra.push([c, d]);
  }
  if (!allow.size) {
    LAST_ESC = { ...g, cands: cands.length, extra: 0, allow: 0 };
    return { list: cands, ids: null, debug: LAST_ESC };
  }
  extra.sort((a, b) => b[0] - a[0]);
  const picked = extra.slice(0, SEM_ESCAPE_MAX);
  const list = picked.length
    ? cands.concat(picked.map(([c, d]) => ({
      ...d, _score: 0, _cover: 0, _sem: Number(c.toFixed(4)), _semEscape: true,
    })))
    : cands;
  LAST_ESC = { ...g, cands: cands.length, extra: extra.length, allow: allow.size,
    injected: picked.length, listLen: list.length, bar: Number(bar.toFixed(4)) };
  return { list, ids: allow, debug: LAST_ESC };
}

/** min-max 归一化；全体相等时返回 1（不给任何一条额外优势） */
function norm(v, lo, hi) {
  if (!(hi > lo)) return 1;
  return (v - lo) / (hi - lo);
}

/**
 * 组内重排：把 BM25 分与语义分归一化后线性融合。
 * 两个必须小心的地方：
 *  - **归一化要夹在 [0,1]**。语义开口进来的条目 `_score` 是 0，而池内成员都 >0，
 *    不夹的话它归一化后是**负数**——比池里最差的一条还差，永远垫底，开口等于白开。
 *  - **开口条目的字面分按「不差于池内最好的一条」计**。理由：开口的门槛已经要求
 *    「语义上明确强过池内每一条」（见 injectSemanticEscapes 的 gap 判定），也就是说
 *    它比不上任何一条的可能性已被排除；此时再拿「词面没召回」当负面证据，就是拿
 *    检索器的盲区去惩罚被盲区漏掉的那一条——实测（top=8 的产品路径）那样它连前八
 *    都进不去，开口等于没开。
 *    注意区分：召回不足时补位的条目（pickSemanticExtras）走的是另一条路，
 *    它们在 rerank 之后才追加、永远排在字面命中之后，语义不抢位那条线在那里守。
 */
function rerankPool(pool, sem) {
  if (!pool.length || !sem || !sem.scores.size) return pool;
  let blo = Infinity, bhi = -Infinity, clo = Infinity, chi = -Infinity;
  for (const d of pool) {
    if (!d._semEscape) {
      if (d._score < blo) blo = d._score;
      if (d._score > bhi) bhi = d._score;
    }
    const c = sem.scores.get(d.id);
    if (c !== undefined) {
      if (c < clo) clo = c;
      if (c > chi) chi = c;
    }
  }
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const out = pool.map((d) => {
    const c = sem.scores.get(d.id);
    const b = d._semEscape ? 1 : clamp01(norm(d._score, blo, bhi));
    const s = c === undefined ? b : clamp01(norm(c, clo, chi));
    return { d, blend: (1 - SEM_W) * b + SEM_W * s, c };
  });
  out.sort((x, y) => y.blend - x.blend);
  return out.map((x) => {
    x.d._sem = x.c === undefined ? null : Number(x.c.toFixed(4));
    return x.d;
  });
}

/**
 * 语义补位：关键词检索召不够时，用语义相似度补齐（仍守放宽档过滤与最低余弦）。
 * 返回的条目排在字面命中之后，不抢位。
 */
function pickSemanticExtras(pool, sem, f, limit) {
  if (!sem || !sem.scores.size || limit <= 0) return [];
  const have = new Set(pool.map((d) => d.id));
  const cands = [];
  for (const [id, c] of sem.scores) {
    if (c < SEM_ADD_MIN || have.has(id)) continue;
    const d = DOC_BY_ID.get(id);
    if (!d || !passesRelaxed(d, f)) continue;
    cands.push([c, d]);
  }
  cands.sort((a, b) => b[0] - a[0]);
  return cands.slice(0, limit).map(([c, d]) => {
    const x = { ...d, _score: 0, _cover: 0, _sem: Number(c.toFixed(4)), _semOnly: true };
    return x;
  });
}

/* ------------------------------ 检索 ------------------------------ */

const K1 = 1.5;
const B = 0.72;

/** 纯关键词检索（不做标签推断），返回文档对象数组 */
function rawSearch(query, filters, topN) {
  const toks = uniq(tokenizeQuery(query));
  const expand = expandQuery(query).filter((t) => !toks.includes(t));
  const N = DOCS.length;
  const scores = new Float64Array(N);
  const cover = new Uint16Array(N);
  const uniqBig = toks.filter((t) => t.length >= 2);

  for (const t of toks) {
    const post = POSTING.get(t);
    if (!post) continue;
    const df = post.size;
    // 超高频单字（的/是/和…）在 942 篇里几乎无处不在，直接丢弃
    if (t.length === 1 && df > N * 0.25) continue;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const boost = t.length >= 2 ? 1 : 0.3;
    for (const [i, tf] of post) {
      const dl = DOC_LEN[i] || 1;
      scores[i] += boost * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / AVG_LEN)));
      if (t.length >= 2) cover[i] += 1;
    }
  }

  // 扩展词计分：低权重、不计覆盖率——只靠扩展词命中的章节，
  // 覆盖率是 0、基础分压在 0.55 系数上，永远排在字面命中之下。
  for (const t of expand) {
    const post = POSTING.get(t);
    if (!post) continue;
    const df = post.size;
    if (df > N * 0.25) continue;   // 太常见的词，扩展了等于没扩展
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [i, tf] of post) {
      const dl = DOC_LEN[i] || 1;
      scores[i] += EXPAND_W * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / AVG_LEN)));
    }
  }

  const covRate = uniqBig.length ? 1 / uniqBig.length : 0;
  const out = [];
  for (let i = 0; i < N; i++) {
    if (scores[i] <= 0) continue;
    const d = DOCS[i];
    const rate = cover[i] * covRate;                 // 查询词覆盖率
    let sc = scores[i] * (0.55 + 0.85 * rate);
    if (d.heading && query && d.heading.includes(String(query).slice(0, 8))) sc += 6;
    if (filters.scenes?.length) sc += 1.1 * filters.scenes.filter((s) => d.scenes.includes(s)).length;
    if (filters.techs?.length) sc += 0.8 * filters.techs.filter((s) => d.techs.includes(s)).length;
    if (filters.types?.length) sc += 0.6 * filters.types.filter((s) => d.types.includes(s)).length;
    if (filters.preferChild) sc += d.child ? 2.5 : 0;
    if (filters.preferTypes?.length) sc += 1.0 * filters.preferTypes.filter((s) => d.types.includes(s)).length;
    if (filters.preferTechs) sc += d.techs.length ? 0.6 : 0;
    out.push([d, sc, rate]);
  }
  out.sort((a, b) => b[1] - a[1]);

  // 同一本书最多留 2 条，保证结果来源多样
  const perSource = {};
  const picked = [];
  for (const item of out) {
    const k = item[0].source;
    perSource[k] = perSource[k] || 0;
    if (perSource[k] >= (topN > 6 ? 3 : 2)) continue;
    perSource[k] += 1;
    picked.push(item);
    if (picked.length >= topN) break;
  }
  return picked.map(([d, sc, rate]) => ({ ...d, _score: sc, _cover: rate }));
}

/** 对外检索：自动推断标签后过滤 + 加权（同一问法与参数命中缓存时不重算） */
function search(query, opt = {}) {
  if (!load()) return [];
  const key = searchCacheKey(query, opt);
  const cached = searchCacheGet(key);
  if (cached) return cached;
  const top = Math.max(1, Math.min(50, opt.top || 6));
  const maxChars = Math.max(200, Math.min(20000, opt.maxChars || 900));
  const auto = opt.autoTag !== false ? analyzeQuestion(query) : { scenes: [], techs: [], types: [], child: false };

  const scenes = uniq([...(opt.scenes || []), ...auto.scenes]);
  const techs = uniq([...(opt.techs || []), ...auto.techs]);
  const types = uniq([...(opt.types || []), ...auto.types]);
  // 注意：儿童内容「优先」而非「只保留」。只有调用方显式传 childOnly 才硬过滤，
  // 否则仅给儿童标注的章节加分（全库仅 66 篇带儿童标注，硬过滤会丢召回）。
  const hardChild = !!opt.childOnly;
  const preferChild = !!auto.child;
  const intent = opt.intent || intentOf(query);
  const preferTypes = intent === 'action' ? ACTION_TYPES : WHY_TYPES;
  const filters = { scenes, techs, types, preferChild, preferTypes, preferTechs: intent === 'action' };

  // strictTypes：把「内容类型」当硬过滤条件。
  // 回答里按小节取素材时必须开——否则各小节拿到的都是同一批高分结果，
  // 「工具表单」小节里塞进散文、「对话示例」小节里塞进理论。
  const wantTypes = opt.strictTypes ? (opt.types || []) : [];
  // strictScenes：把「问题场景」当硬过滤条件（同理，且只在调用方显式要求时开）。
  // 用于「这个场景必须对得上」的场合，例如干预策略页给家长看的延伸阅读——
  // 那边宁可少给几条，也不能把「自伤响应」页配上「人际关系问题」这种章节。
  const wantScenes = opt.strictScenes ? uniq(opt.scenes || []) : [];

  // 场景是「自动推断」还是「调用方指定」：只有前者才允许语义开口（见 injectSemanticEscapes）
  const autoOnly = !(opt.scenes && opt.scenes.length) && !opt.strictScenes;
  const f = { hardChild, scenes, techs, wantTypes, wantScenes };
  let cands = rawSearch(query, filters, top * 4);
  let escaped = null;
  if (opt._sem) {
    const inj = injectSemanticEscapes(cands, opt._sem, f, autoOnly);
    cands = inj.list;
    escaped = inj.ids;
  }
  // 语义开口放行的条目只差「场景标签缺失」这一条（其余硬条件开口时已查过），
  // 所以这里单独放行，并打上 `_semEscape`——重排时要认出它，否则「词面没有它的分」
  // 会被当成负面证据，被放行进来也照样沉底（top=8 时就是这么静默消失的）。
  let pool = cands.filter((d) => {
    if (passesStrict(d, f)) return true;
    if (escaped && escaped.has(d.id)) { d._semEscape = true; return true; }
    return false;
  });

  // 语义重排：只改顺序、不改成员——字面命中已经够的场合，不许语义把结果稀释掉
  if (opt._sem) pool = rerankPool(pool, opt._sem);

  if (pool.length < Math.min(3, top)) {
    const seen = new Set(pool.map((d) => d.id));
    for (const d of rawSearch(query, filters, top * 4)) {
      if (seen.has(d.id)) continue;
      // 即使放宽，也不能破坏类型/场景要求（宁缺毋滥）
      if (!passesRelaxed(d, f)) continue;
      seen.add(d.id);
      pool.push(d);
    }
    // 关键词确实召不够时，才允许语义补位（补位条目排在字面命中之后，不抢位）
    if (opt._sem && pool.length < Math.min(3, top)) {
      for (const d of pickSemanticExtras(pool, opt._sem, f, SEM_ADD_MAX)) {
        if (pool.length >= top) break;
        pool.push(d);
      }
    }
  }

  const results = pool.slice(0, top).map((d) => ({
    id: d.id,
    source: d.source,
    kind: d.kind,
    chapter: d.chapter,
    heading: d.heading,
    scenes: d.scenes,
    techs: d.techs,
    types: d.types,
    child: d.child,
    score: Number(d._score.toFixed(3)),
    coverage: Number((d._cover || 0).toFixed(2)),
    // 语义相似度（余弦，0~1）。null = 该章未进语义索引（正文过短）。
    // 单独给出而不是混进 score：score 始终是**字面**分，混在一起就没法解释排序了。
    semantic: d._sem === undefined ? null : d._sem,
    // 语义开口放行的条目（只差「场景标签缺失」那一票，靠语义得分进榜）
    semanticEscape: !!d._semEscape,
    semanticOnly: !!d._semOnly,
    text: d.text.length > maxChars ? d.text.slice(0, maxChars) + '…' : d.text,
    truncated: d.text.length > maxChars,
    citation: d.citation || `${d.source} · ${d.heading}`,
    scanQuality: scanQualityOf(d.source, d.quality),
  }));
  searchCachePut(key, results);
  if (LAST_ESC) LAST_ESC.pool = pool.slice(0, 10).map((d) => [String(d.id).slice(-14), d._semOnly ? 'esc' : d._score]);
  if (LAST_ESC) LAST_ESC.trace = `top=${top} sem=${opt._sem ? 'yes' : 'no'} cands=${cands.length} strict=${cands.filter((d) => passesStrict(d, f)).length} escaped=${escaped ? escaped.size : 0}`;
  return results;
}

/**
 * 语义感知的检索入口（异步）。
 *
 * 为什么另开一个函数而不是把 search() 改成 async：search() 被多处同步调用，
 * 改签名会牵动一大片。这里只多一层「先算查询向量，再把分数交给同步内核」，
 * 内核行为完全不变——语义层不可用时它会**静默退化成 search()**。
 *
 * `opt.semantic === false` 可单次关闭（评测里做对照、或需要复现纯词面结果时用）。
 */
async function searchAsync(query, opt = {}) {
  if (opt.semantic === false || opt._sem) return search(query, opt);
  let sem = null;
  try {
    sem = await semantic.scoresFor(query);
  } catch (e) {
    sem = null;   // 语义层任何异常都不该让检索失败
  }
  return search(query, sem ? { ...opt, _sem: sem } : { ...opt, _sem: null });
}

/* --------------------------- 辅助接口 --------------------------- */

function taxonomy() {
  load();
  return TAX || null;
}

function stats() {
  load();
  if (!DOCS) return { ready: false, error: LOAD_ERROR };
  const scenes = {}, techs = {}, types = {};
  for (const d of DOCS) {
    d.scenes.forEach((k) => { scenes[k] = (scenes[k] || 0) + 1; });
    d.techs.forEach((k) => { techs[k] = (techs[k] || 0) + 1; });
    d.types.forEach((k) => { types[k] = (types[k] || 0) + 1; });
  }
  return {
    ready: true,
    loadedAt: LOADED_AT,
    docs: DOCS.length,
    chars: DOCS.reduce((a, d) => a + d.chars, 0),
    children: DOCS.filter((d) => d.child).length,
    tokens: POSTING.size,
    sources: [...new Set(DOCS.map((d) => d.source))].length,
    ocrFixed: OCR_FIXED,
    ocrRuleCount: loadOcrFix().rules.size + loadOcrFix().regex.length,
    weakSources: (loadOcrFix(), WEAK_SOURCES ? WEAK_SOURCES.size : 0),
    indexVersion: INDEX_VERSION,
    searchCache: {
      entries: SEARCH_CACHE.size,
      hits: CACHE_HITS,
      misses: CACHE_MISSES,
      ttlMs: CACHE_TTL_MS,
      max: CACHE_MAX,
    },
    expand: { terms: loadExpandIndex().size, weight: EXPAND_W, maxTerms: EXPAND_MAX },
    // 语义层：enabled/status 用来一眼看出线上到底走没走语义（failed 会带 reason）
    semantic: { ...semantic.info(), weight: SEM_W, addMin: SEM_ADD_MIN, addMax: SEM_ADD_MAX },
    scenes, techs, types,
  };
}

function getById(id) {
  load();
  if (!DOCS) return null;
  const d = DOCS.find((x) => x.id === id);
  if (!d) return null;
  return { ...d, citation: d.citation || `${d.source} · ${d.heading}`, scanQuality: scanQualityOf(d.source, d.quality) };
}

/** 按标签列目录（不检索，只做筛选） */
function listByTag(tag, top = 20) {
  load();
  if (!DOCS) return [];
  const hit = DOCS.filter((d) => d.scenes.includes(tag) || d.techs.includes(tag) || d.types.includes(tag));
  return hit.slice(0, top).map((d) => ({
    id: d.id, source: d.source, heading: d.heading, chars: d.chars,
    scenes: d.scenes, techs: d.techs, types: d.types, child: d.child,
  }));
}

/* --------------------------- 可打印表格 --------------------------- */

/**
 * 「工具表单与工作表」这一类（201 条）整理成可打印清单。
 *
 * 关键取舍：原书扫描件里的表格被 OCR 压平成了「一行一串短语」，列与列的关系已经丢失。
 * 星伴**不重画表格**——那样看起来整齐，实际是把结构当内容编造出来（「不编造」这条线）。
 * 所以这里只做「筛选 + 原样呈现」：挑出确实像表格/清单的（多行、短行、体量适中），
 * 正文逐字给出去，出处与扫描质量一并标出，家长可以直接打印。
 * 筛选口径随结果一起返回，前端如实展示。
 *
 * 【第二十九轮补充】「不重画」的落点被重新划清过一次——缺的其实不是「表格好不好看」，
 * 而是**没有可填写的地方**：家长打印出来的是一张只能读的清单，手上没有一个能写字的格子。
 * 正确做法不是替家长填内容，而是把**原书本来就有的空行留成空白**。所以新增 `table` 字段：
 *   - 只做「还原原书的列」——行的切分规则只有一条：行内出现 2 个以上**连续空格**，
 *     或出现制表符。切出来的每一格都是原文里逐字存在的一段，`table.cells` 按行序拍平后
 *     去空白必须与原文去空白**逐字相同**（kb.units 有双向断言钉住）；
 *   - 既不加表头、不猜列名、不补说明文字，也不推断行与行之间的对应关系；
 *   - **切不出来的（行内没有连续空格/制表符）一律给 `table: null`**，前端退回逐字呈现，
 *     不硬切——硬切出来的列是编造的结构。
 * 实测：87 条可用清单里 0 条含制表符、0 条含连续空格 → **全部 `table: null`**。
 * 所以「表格线」这条路在这批语料上是走不通的，本轮不动前端渲染，只把这个结论固化成数据。
 */
const WS_MIN_CHARS = 60;
const WS_MAX_CHARS = 4000;
const WS_MAX_AVG_LINE = 40;
// 行内分隔：制表符，或 2 个以上连续空格（半角/全角都算）。
const WS_SPLIT_RE = /\t| {2,}|[\u3000]{1,}/;
const WS_SPLIT_G = /\t| {2,}|[\u3000]{1,}/g;

/**
 * 把一段 OCR 压平文本还原成「行 × 列」。
 *
 * 红线：**只还原原书本来就有的列，不新增任何文字**。
 *   - 一行切不出 2 列 → 这行整行当 1 格（即不切），不做任何猜测性对齐；
 *   - 全篇切不出任何多列行 → 返回 null（前端退回逐字显示），不硬切。
 * 每个 cell 只做 trim，字符本身逐字保留。
 */
function splitWorksheetTable(text) {
  const rawLines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (rawLines.length < 2) return null;
  let splitRows = 0;
  let maxCols = 0;
  const rows = rawLines.map((line) => {
    const cells = line.split(WS_SPLIT_G).map((x) => x.trim()).filter((x) => x !== '');
    const use = cells.length >= 2 ? cells : [line];
    if (use.length >= 2) splitRows += 1;
    if (use.length > maxCols) maxCols = use.length;
    return use;
  });
  // 一列都没切出来，说明这批扫描件里本来就没有可用的列分隔——如实返回 null。
  if (splitRows === 0 || maxCols < 2) return null;
  // 平铺后的字符必须与原文逐字一致（只允许丢空白）——这是「不编造」的机器判据。
  const flat = rows.map((r) => r.join('')).join('').replace(/\s+/g, '');
  const origin = String(text || '').replace(/\s+/g, '');
  if (flat !== origin) return null;
  return { rows, cols: maxCols, splitRows, blank: rows.filter((r) => r.length === 1).length };
}

function worksheets() {
  load();
  const criteria = `${WS_MIN_CHARS}~${WS_MAX_CHARS} 字、至少 2 行、平均行长不超过 ${WS_MAX_AVG_LINE} 字`;
  if (!DOCS) return { count: 0, items: [], criteria, total: 0 };
  const all = DOCS.filter((d) => d.types.includes('工具表单与工作表'));
  const items = [];
  for (const d of all) {
    const t = String(d.text || '').trim();
    if (t.length < WS_MIN_CHARS || t.length > WS_MAX_CHARS) continue;
    const lines = t.split('\n').map((x) => x.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const avg = lines.reduce((a, x) => a + x.length, 0) / lines.length;
    if (avg > WS_MAX_AVG_LINE) continue;
    const table = splitWorksheetTable(t);
    items.push({
      id: d.id,
      title: d.heading,
      source: d.source,
      chapter: d.chapter || '',
      chars: t.length,
      lines: lines.length,
      scenes: d.scenes || [],
      techs: d.techs || [],
      scanQuality: scanQualityOf(d.source, d.quality),
      preview: lines.slice(0, 2).join(' ／ ').slice(0, 60),
      // 能还原成「行 × 列」就给结构，供前端排成带空格的表；否则 null（前端逐字显示）。
      table,
    });
  }
  items.sort((a, b) => a.source.localeCompare(b.source, 'zh') || a.title.localeCompare(b.title, 'zh'));
  const tableCount = items.filter((x) => x.table).length;
  return { count: items.length, total: all.length, criteria, items, tableCount };
}

/* ------------------------------------------------------------------
 * 示范对话（对话示例与逐字稿）
 * ------------------------------------------------------------------
 * 素材形态：110 条「对话示例与逐字稿」，其中 70/72 条可用条目是
 * **成人治疗室逐字稿**（「咨询师：…／患者：…」）。直接端给家长有两个坑：
 *   ① 称谓错位——家长看的不是「患者」；
 *   ② 更危险的是**角色错位**——家长会以为「咨询师」这些话是自己该说的，
 *      而其中大量是专业提问技术（箭头下降、证据检验），照搬会变成审问孩子。
 * 所以这一页不叫「照着说」，而是「教材里的示范对话」：
 *   - 正文给出**按家长语境改写**的版本（只换称谓词，不新增内容），并标注「已改写」；
 *   - 原句随时可展开核对；
 *   - 每条都带一句「这些话是心理老师/咨询师在治疗室里的说法，句式可参考，
 *     不必照搬」的定位说明。
 * 宁可让家长觉得「这不是给我用的」，也不把专业逐字稿包装成家庭话术。
 * ------------------------------------------------------------------ */

const DLG_MIN_CHARS = 120;
const DLG_MAX_CHARS = 3000;
const DLG_TURN_RE = /^[^：:\n]{1,12}[：:]\s*\S/;   // 「说话人：内容」形式的一轮

/** 数对话轮次；不用 /g 正则配 .test()（lastIndex 会残留，本项目踩过这个坑） */
function countTurns(text) {
  return String(text || '').split('\n')
    .map((l) => l.trim())
    .filter((l) => DLG_TURN_RE.test(l)).length;
}

function dialogues(opt = {}) {
  load();
  const minChars = opt.minChars || DLG_MIN_CHARS;
  const criteria = `${minChars}~${DLG_MAX_CHARS} 字、至少 3 行、且是对话体（含「说话人：」式轮次）`;
  if (!DOCS) return { count: 0, total: 0, items: [], criteria, groups: [] };

  const all = DOCS.filter((d) => d.types.includes('对话示例与逐字稿'));
  const items = [];
  for (const d of all) {
    const raw = String(d.text || '').trim();
    if (raw.length < minChars || raw.length > DLG_MAX_CHARS) continue;
    const lines = raw.split('\n').map((x) => x.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const turns = countTurns(raw);
    if (turns < 2) continue;                       // 不是对话体，别混进来充数
    const softened = softenAdultContext(raw);
    const lv = adultLevel(raw);
    items.push({
      id: d.id,
      title: d.heading,
      source: d.source,
      chapter: d.chapter || '',
      chars: raw.length,
      turns,
      scenes: d.scenes || [],
      techs: d.techs || [],
      // 分组键：优先问题场景，其次技术方法；都没有就归「通用对话技巧」
      scene: (d.scenes || [])[0] || '',
      tech: (d.techs || [])[0] || '',
      // 原文含成人称谓的条数（需要改写才给家长看）
      needsRewrite: softened !== raw,
      adultHits: lv.ad,
      childHits: lv.ch,
      scanQuality: scanQualityOf(d.source, d.quality),
      preview: softened.split('\n').map((x) => x.trim()).filter(Boolean)[0].slice(0, 60),
    });
  }

  items.sort((a, b) => (a.scene || '￿').localeCompare(b.scene || '￿', 'zh')
    || (a.tech || '￿').localeCompare(b.tech || '￿', 'zh')
    || a.source.localeCompare(b.source, 'zh') || a.title.localeCompare(b.title, 'zh'));

  const gmap = new Map();
  for (const it of items) {
    const key = it.scene || it.tech || '通用对话技巧';
    const kind = it.scene ? 'scene' : (it.tech ? 'tech' : 'other');
    if (!gmap.has(key)) gmap.set(key, { key, kind, count: 0 });
    gmap.get(key).count += 1;
  }
  const groups = [...gmap.values()].sort((a, b) => b.count - a.count);

  return {
    count: items.length,
    total: all.length,
    criteria,
    needsRewrite: items.filter((x) => x.needsRewrite).length,
    groups,
    items,
  };
}

/** 取一条示范对话（含改写版与原文，供前端对照） */
function dialogueById(id) {
  load();
  if (!DOCS) return null;
  const d = DOCS.find((x) => x.id === id);
  if (!d || !d.types.includes('对话示例与逐字稿')) return null;
  const raw = String(d.text || '');
  const softened = softenAdultContext(raw);
  return {
    id: d.id,
    title: d.heading,
    source: d.source,
    chapter: d.chapter || '',
    scenes: d.scenes || [],
    techs: d.techs || [],
    scanQuality: scanQualityOf(d.source, d.quality),
    turns: countTurns(raw),
    needsRewrite: softened !== raw,
    softened,
    original: raw,
    citation: d.citation || `${d.source} · ${d.heading}`,
  };
}

function uniq(a) { return [...new Set(a.filter(Boolean))]; }

module.exports = { search, searchAsync, analyzeQuestion, intentOf, taxonomy, stats, getById, listByTag, worksheets,
  dialogues, dialogueById, tokenize, fixOcr, softenAdultContext, scanQualityOf, expandQuery, _load: load,
  clearSearchCache, semantic, _lastEscape: () => LAST_ESC };
