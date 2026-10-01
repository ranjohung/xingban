/**
 * 语义索引构建器 —— 把知识库章节分块嵌入成向量，供后端做语义召回。
 *
 * 为什么要它：BM25 只认词面。家长问「孩子一写作业就磨蹭」，语料里没有「磨蹭」
 * 这个词就永远排不上「任务难度／专注力」那些章节。语义层补的正是这一类。
 *
 * 产物（写入 CBT知识库/04_检索索引/语义索引/）：
 *   vectors.f32   每行一个块的 L2 归一化向量（float32 小端，行序 = chunks.json 行序）
 *   chunks.json   每行对应的章节 id、起始字符位置、以及该块**文本的 sha1**
 *   索引信息.json 模型名、分块参数、维度、行数、构建时间、来源索引指纹、复用/编码统计
 *
 * 用法：
 *   node tools/embed_kb.mjs              # 增量构建（默认）：内容没变的块直接复用已有向量
 *   node tools/embed_kb.mjs --full       # 全量重建：所有块重新编码（换模型/怀疑向量损坏时用）
 *   node tools/embed_kb.mjs --check      # 只核对产物与当前索引是否一致（不编码）
 *   node tools/embed_kb.mjs --index <主索引.json> --out <语义索引目录> [--manifest <索引版本.json>]
 *                                        # 覆盖路径，用于副本演练（不碰真索引）
 *
 * 增量为什么能对齐全量（这是本文件最容易写错的地方，改前先读完这段）：
 *   块的**身份是内容**，不是行号。每块文本算一个 sha1 存进 chunks.json，构建时按
 *   sha1 去上一版里找回它的向量行照抄，只有找不到的（新增章节、改写过的章节、
 *   换模型后第一次跑）才真的编码。因此：
 *     - 章节被改写 → 它的分块文本变了 → 该章所有块重新编码（块起点会整体前移，
 *       复用旧行才是错的——这正是 hash 而不是 (id,start) 作键的原因）；
 *     - 其他章节一字不动 → 逐行照抄，产物与全量重建**逐字节一致**（行序由主索引顺序决定，
 *       与复用无关）；
 *     - 合并一本新书（`_work/merge_source.js` 之后）只需编码新书那几百块，不再重编码全部 14155 块。
 *   复用只在「模型 / dtype / 维度 / 分块参数全部一致」时开启——换了模型，旧向量与新向量
 *   不在同一空间，必须全量重建。
 *   写盘走临时文件 + rename，中途失败不会留下半截 vectors.f32（那会被运行时判为加载失败）。
 *
 * 两个实测事实（别拿「逐字节一致」当验收标准，会误判）：
 *   ① **全量重建本身可复现**：同一份索引连跑两次全量，vectors.f32 逐字节相同（已验证 0 字节差）。
 *   ② 但 q8 推理的结果受**批次形状**影响：同一段文本在不同批次布局下，余弦最多差 ~8e-3
 *      （batch=1 自己连跑两次只差 7e-7，说明不是随机数，是矩阵核在不同形状下的末位差异）。
 *      所以「增量产物」与「同一索引全量重跑」的比对必须**按容差**（`kb:embed:drill` 用 < 2e-2），
 *      而**复用是否错位**要用「沿用行的向量与上一版逐字节相同」来验——错位会差到 1 量级（见 drill 负例）。
 *   不改成逐段编码（batch=1，可消掉这 ~8e-3）的理由：那等于换掉现有全部向量，
 *   而本轮的边界是「只让重建变快，不改产物」。要改需单独立项并重跑全部评测基线。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const KB_ROOT = path.resolve(BACKEND, '..', 'CBT知识库');
const IDX_DIR = path.join(KB_ROOT, '04_检索索引');
const FULL_INDEX = path.join(IDX_DIR, '检索索引.json');
const OUT_DIR = path.join(IDX_DIR, '语义索引');

// 与 backend/services/semantic.js 必须一致（那边读取本文件写入的元数据，不另设默认值）
const MODEL = 'Xenova/bge-small-zh-v1.5';
const DTYPE = 'q8';
const DIM = 512;
const CHUNK = 200;   // 每块字符数
const STRIDE = 160;  // 步长（重叠 40 字，避免句子被切在关节上）
const MIN_DOC = 30;  // 章节短于此不参与（课件标题页，正文为空或只有几字）
const MIN_CHUNK = 40; // 末块短于此丢掉

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const forceFull = args.includes('--full');
const optOf = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? path.resolve(args[i + 1]) : null;
};

const INDEX_FILE = optOf('index') || FULL_INDEX;
const OUT = optOf('out') || OUT_DIR;
const MANIFEST_FILE = optOf('manifest') || path.join(path.dirname(INDEX_FILE), '索引版本.json');

const TEXT_FILE = path.join(OUT, 'vectors.f32');
const CHUNK_FILE = path.join(OUT, 'chunks.json');
const META_FILE = path.join(OUT, '索引信息.json');

/** 块的唯一身份：文本的 sha1（截 16 位，14155 块的碰撞概率可忽略） */
function hashText(t) {
  return crypto.createHash('sha1').update(t, 'utf8').digest('hex').slice(0, 16);
}
function fingerprint(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

/**
 * 按当前主索引重新分块。文本归一化（去行内换行）与切分口径必须与运行时一致，
 * 否则 hash 对不上、复用失效（会静默退化成每次都全量编码——不是报错，而是白跑）。
 */
function chunkAll() {
  const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const ids = [];
  const starts = [];
  const texts = [];
  for (const d of idx) {
    const t = String(d.text || '').replace(/\s*\n\s*/g, '');
    if (t.length < MIN_DOC) continue;
    for (let i = 0; i < t.length; i += STRIDE) {
      const s = t.slice(i, i + CHUNK);
      if (s.length < MIN_CHUNK) break;
      ids.push(d.id);
      starts.push(i);
      texts.push(s);
      if (i + CHUNK >= t.length) break;
    }
  }
  return { docCount: idx.length, ids, starts, texts, hashes: texts.map(hashText) };
}

/**
 * 读主索引的全局指纹（`索引版本.json` 的 `全局指纹`，由 _work/manifest.js 写入）。
 * 键名以 manifest.js 为准；同时兼容早期误用的英文键 `fingerprint`。
 * 读不到返回 null——**null 表示「不知道」，不等于「一致」**，调用方必须区别对待。
 */
function readIndexFingerprint() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    return m['全局指纹'] || m.fingerprint || null;
  } catch (e) {
    return null;
  }
}

const plan = chunkAll();
console.log(`章节 ${plan.docCount}，分块 ${plan.ids.length}（块长 ${CHUNK} / 步长 ${STRIDE}）`);

/* ------------------------------ --check ------------------------------ */
if (checkOnly) {
  let ok = true;
  if (!fs.existsSync(META_FILE)) { console.log('✗ 语义索引不存在，需要先构建'); process.exit(1); }
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(CHUNK_FILE, 'utf8'));
  const sz = fs.statSync(TEXT_FILE).size;
  const rows = sz / (DIM * 4);
  const says = [];
  if (meta.count !== plan.ids.length) { says.push(`行数：元数据 ${meta.count} ≠ 重新分块 ${plan.ids.length}`); ok = false; }
  if (rows !== meta.count) { says.push(`向量文件行数 ${rows} ≠ 元数据 ${meta.count}`); ok = false; }
  if (chunks.ids.length !== plan.ids.length) { says.push(`chunks.json 行数 ${chunks.ids.length} ≠ 重新分块 ${plan.ids.length}`); ok = false; }
  if (meta.dim !== DIM) { says.push(`维度 ${meta.dim} ≠ ${DIM}`); ok = false; }
  // 分块指纹覆盖**块文本内容**（不只是 id 序列）：仅正文改写、id 不变时也必须能发现
  const nowFp = fingerprint(plan.hashes.join(''));
  if (!chunks.hashes) {
    says.push('chunks.json 缺 hashes（旧版产物，无法按内容复用）——跑一次构建补上');
    ok = false;
  } else if (chunks.hashes.length !== plan.hashes.length
    || chunks.hashes.some((h, i) => h !== plan.hashes[i])) {
    says.push(`分块内容指纹变化（索引正文改过了？）${meta.chunkFingerprint} → ${nowFp}`);
    ok = false;
  } else if (meta.chunkFingerprint !== nowFp) {
    says.push(`分块指纹与元数据不一致 ${meta.chunkFingerprint} → ${nowFp}`);
    ok = false;
  }
  // 主索引指纹：语义向量必须与它绑定的那一版主索引一致，否则新章节没有向量
  const liveFp = readIndexFingerprint();
  if (!meta.indexFingerprint) {
    says.push(`元数据没记主索引指纹（当前主索引 ${liveFp || '未知'}）——无法确认是否同源，请重建`);
    ok = false;
  } else if (liveFp && meta.indexFingerprint !== liveFp) {
    says.push(`主索引已变：${meta.indexFingerprint} → ${liveFp}（语义向量是旧索引的）`);
    ok = false;
  }
  if (says.length) { says.forEach((s) => console.log('  ✗ ' + s)); }
  console.log(ok ? `✓ 语义索引与当前索引一致（${meta.count} 行 / ${meta.dim} 维 / 模型 ${meta.model}）`
                 : '✗ 语义索引已过期，请重新运行 node tools/embed_kb.mjs');
  process.exit(ok ? 0 : 1);
}

/* --------------------------- 复用上一版向量 --------------------------- */

const t0 = Date.now();
let oldF32 = null;
let reuse = new Map();        // 块 hash → 上一版里拥有该 hash 的行号队列（升序）
let reuseReason = '';
let reuseOn = false;

if (forceFull) {
  reuseReason = '--full 指定全量重建';
} else if (!fs.existsSync(CHUNK_FILE) || !fs.existsSync(TEXT_FILE) || !fs.existsSync(META_FILE)) {
  reuseReason = '上一版语义索引不存在';
} else {
  try {
    const oldMeta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    const oldChunks = JSON.parse(fs.readFileSync(CHUNK_FILE, 'utf8'));
    const sameSpace = oldMeta.model === MODEL && oldMeta.dtype === DTYPE && oldMeta.dim === DIM
      && oldMeta.chunkChars === CHUNK && oldMeta.stride === STRIDE;
    if (!sameSpace) {
      reuseReason = `模型/分块参数变了（${oldMeta.model} ${oldMeta.dtype} ${oldMeta.chunkChars}/${oldMeta.stride}）`;
    } else if (!Array.isArray(oldChunks.hashes) || oldChunks.hashes.length !== oldChunks.ids.length) {
      reuseReason = '上一版 chunks.json 没有分块 hash（本次会全量编码一次，之后就能复用）';
    } else {
      const buf = fs.readFileSync(TEXT_FILE);
      const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      if (f32.length < oldChunks.ids.length * DIM) {
        reuseReason = `上一版向量文件长度不足（${f32.length} < ${oldChunks.ids.length * DIM}）`;
      } else {
        // 队列而不是「hash → 单个行号」：同一段文本可能在多处出现（重复章节/短块），
        // 只记第一行会让后来的同文本行被安上第一行的向量——批次形状不同，两者差 ~8e-3，
        // 于是「什么都没改的增量重建」产物会与上一版对不上（第二十一轮实测踩到：187 行被换）。
        for (let r = 0; r < oldChunks.hashes.length; r++) {
          const h = oldChunks.hashes[r];
          let q = reuse.get(h);
          if (!q) { q = []; reuse.set(h, q); }
          q.push(r);
        }
        oldF32 = f32;
        reuseOn = true;
      }
    }
  } catch (e) {
    reuseReason = `读上一版失败：${e.message}`;
  }
}
console.log(reuseOn
  ? `复用已开启：上一版 ${reuse.size} 个不同块可复用`
  : `复用未开启（${reuseReason}），本次全量编码`);

/* ------------------------------ 取数/编码 ------------------------------ */

const n = plan.ids.length;
const f32 = new Float32Array(n * DIM);
let reused = 0;
const pendingRows = [];       // 需要编码的行号

for (let r = 0; r < n; r++) {
  const q = reuseOn ? reuse.get(plan.hashes[r]) : undefined;
  const src = q && q.length ? q.shift() : undefined;   // 按行号升序取，布局未变时逐行对回原位
  if (src !== undefined) {
    f32.set(oldF32.subarray(src * DIM, (src + 1) * DIM), r * DIM);
    reused++;
  } else {
    pendingRows.push(r);
  }
}

// **不去重**：同文本合并成一段编码看似省事，却会改变批次构成，而 q8 推理的结果随
// 批次形状轻微变化（见文件头 ②），于是「全量重建路径与改造前逐字节一致」这条自查就没了。
// 实测重复块只占 1.3%（14155 → 13968），不值得拿掉那个性质。
const pendingTexts = pendingRows.map((r) => plan.texts[r]);

console.log(`复用 ${reused} 块 / 待编码 ${pendingRows.length} 块`);
if (reused) oldF32 = null; // 旧缓冲区可释放（Node 里仍被 Buffer 引用，仅提示语义）

if (pendingTexts.length) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(BACKEND, 'models');
  env.allowLocalModels = false;
  const ex = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
  console.log(`模型就绪 ${((Date.now() - t0) / 1000).toFixed(1)}s（缓存目录 ${env.cacheDir}）`);

  const BATCH = 32;
  for (let i = 0; i < pendingTexts.length; i += BATCH) {
    const out = await ex(pendingTexts.slice(i, i + BATCH), { pooling: 'cls', normalize: true });
    const rows = out.tolist();
    for (let r = 0; r < rows.length; r++) f32.set(rows[r], pendingRows[i + r] * DIM);
    if (i % (BATCH * 20) === 0 || i + BATCH >= pendingTexts.length) {
      console.log(`  编码 ${Math.min(i + BATCH, pendingTexts.length)}/${pendingTexts.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}

/* ------------------------------ 落盘（原子） ------------------------------ */

fs.mkdirSync(OUT, { recursive: true });
const writeTmp = (file, buf) => {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
};
writeTmp(TEXT_FILE, Buffer.from(f32.buffer));
writeTmp(CHUNK_FILE, JSON.stringify({ dim: DIM, ids: plan.ids, starts: plan.starts, hashes: plan.hashes }));
writeTmp(META_FILE, JSON.stringify({
  model: MODEL, dtype: DTYPE, dim: DIM,
  chunkChars: CHUNK, stride: STRIDE,
  count: plan.ids.length, docCount: plan.docCount,
  pooling: 'cls', normalized: true,
  chunkFingerprint: fingerprint(plan.hashes.join('')),
  // 主索引指纹的**键名以 manifest.js 为准**：那里写的是中文键 `全局指纹`。
  // 这里曾写成英文键 `.fingerprint` → 恒为 undefined → 落进元数据是 null，
  // 于是「向量与索引绑定」这条机制从来没生效过（运行时也无从比对）。
  // 仍保留 `.fingerprint` 作为兼容读取。
  indexFingerprint: readIndexFingerprint(),
  builtAt: new Date().toISOString(),
  // 本次构建的复用情况（可观测：复用 0 块就说明每次都在白跑全量）
  reused, encoded: pendingRows.length,
  mode: forceFull ? 'full' : 'incremental',
}, null, 1));

const mb = (x) => (x / 1048576).toFixed(1);
console.log(`\n完成：${plan.ids.length} 行 × ${DIM} 维（复用 ${reused} / 新编码 ${pendingRows.length}）`);
console.log(`  vectors.f32  ${mb(fs.statSync(TEXT_FILE).size)} MB`);
console.log(`  chunks.json  ${mb(fs.statSync(CHUNK_FILE).size)} MB`);
console.log(`  索引信息.json`);
console.log(`  耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
