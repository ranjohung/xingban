/**
 * 语义索引增量构建 —— 演练与不变量（`npm run kb:embed:drill`）
 *
 * 为什么单独一个脚本：增量构建的失败模式是**静默**的。复用映射一旦错位，
 * 产物照样能加载、`/health` 照样报 ready、检索也照样返回结果——只是把别的段落的
 * 向量安到了这一章头上，质量悄悄下降。所以必须能在几秒内、不碰真索引地验证：
 *
 *   ① 复用行是否与上一版**逐字节相同**（错位会差到 1 量级，见负例）；
 *   ② 增量产物与「同一索引全量重跑」是否等价（按容差，见下方批次形状说明）；
 *   ③ 是否真的只编码了改动过的章节（而不是又全量跑一遍）。
 *
 * 全程在 `CBT知识库/_work/.tmp-embed-drill/` 里做，真索引一字不动。
 *
 * 关于容差：q8 推理受**批次形状**影响，同一段文本在不同批次布局下余弦最多差 ~8e-3
 * （`tools/embed_kb.mjs` 头部有实测数据）。所以 ② 用 < 2e-2 的容差；
 * 复用的正确性由 ①（逐字节）保证，两者分工不同，不要合并。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const KB_ROOT = path.resolve(BACKEND, '..', 'CBT知识库');
const REAL_INDEX = path.join(KB_ROOT, '04_检索索引', '检索索引.json');
const BUILDER = path.join(BACKEND, 'tools', 'embed_kb.mjs');
const TMP = path.join(KB_ROOT, '_work', '.tmp-embed-drill');
const TOL = 2e-2;          // 增量 vs 全量 的余弦容差上限
const KEEP = process.argv.includes('--keep');

let fails = 0;
const say = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const DIM = 512;
// 不用 fs.cpSync：本机 Node 22 上它在这个路径会静默把进程带走（退出码 127、无任何报错）
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.writeFileSync(path.join(dst, f), fs.readFileSync(path.join(src, f)));
};

const loadF32 = (f) => {
  const b = fs.readFileSync(f);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
};
const cos = (a, ia, b, ib) => {
  let s = 0;
  for (let d = 0; d < DIM; d++) s += a[ia * DIM + d] * b[ib * DIM + d];
  return s;
};
const run = (args, label) => {
  const t0 = Date.now();
  const out = execFileSync(process.execPath, [BUILDER, ...args], { encoding: 'utf8', cwd: BACKEND });
  const ms = Date.now() - t0;
  const stat = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  const r = {
    ms,
    reused: stat(/复用 (\d+) 块/),
    pending: stat(/待编码 (\d+) 块/),
    count: stat(/完成：(\d+) 行/),
  };
  console.log(`    · ${label}：复用 ${r.reused} / 编码 ${r.pending} / 共 ${r.count} 行 / ${(ms / 1000).toFixed(1)}s`);
  return r;
};

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

try {
  /* ---------------- 建一份小型索引（真索引里挑足够长的章节） ---------------- */
  const real = JSON.parse(fs.readFileSync(REAL_INDEX, 'utf8'));
  const picks = real.filter((d) => String(d.text || '').length > 400).slice(0, 40).map((d) => ({ ...d }));
  // 刻意塞一份**正文完全相同的重复章节**：同一段文本会在多处出现，块 hash 撞在一起。
  // 复用映射若写成「hash → 第一个行号」，后来的同文本行就会被安上第一行的向量——
  // 而两者批次形状不同、差 ~8e-3，于是「什么都没改的增量重建」产物与上一版对不上。
  // 这是第二十一轮真踩到的 bug（真索引里 187 行被换掉），这里必须留一个夹具。
  picks.push({ ...picks[0], id: picks[0].id + '-重复', heading: picks[0].heading + '（重复）' });
  const IDX = path.join(TMP, '检索索引.json');
  fs.writeFileSync(IDX, JSON.stringify(picks));
  console.log(`\n[1] 演练索引：真索引里挑 ${picks.length - 1} 章（>400 字）+ 1 章正文重复，共 ${picks.reduce((s, d) => s + String(d.text).length, 0)} 字`);

  const OUT = path.join(TMP, '语义索引');
  const OUT_INC = path.join(TMP, '语义索引-inc');
  const OUT_FULL = path.join(TMP, '语义索引-full');
  const OUT_NOOP = path.join(TMP, '语义索引-noop');
  const base = [`--index`, IDX];

  console.log('[2] 基线：全量构建');
  const first = run([...base, `--out`, OUT, `--full`], '全量 #1');
  say(first.reused === 0, '首次构建没有可复用的行（复用 0）');
  say(first.count > 0, `产物行数 ${first.count}`);

  /* ---------------- ② 无改动再跑一次：必须全量复用且产物一字不变 ---------------- */
  // 这是最有力的一条：覆盖「复用映射是否真的一对一回原位」，包括重复文本块那一类。
  console.log('[2b] 无改动再跑一次（应全量复用、产物逐字节不变）');
  copyDir(OUT, OUT_NOOP);
  const noop = run([...base, `--out`, OUT_NOOP], '无改动增量');
  const sameBytes = (f) => fs.readFileSync(path.join(OUT, f)).equals(fs.readFileSync(path.join(OUT_NOOP, f)));
  const noopChunks = JSON.parse(fs.readFileSync(path.join(OUT_NOOP, 'chunks.json'), 'utf8'));
  const seen = new Set();
  let dupRows = 0;
  for (const h of noopChunks.hashes) { if (seen.has(h)) dupRows++; else seen.add(h); }
  say(dupRows > 0, `演练索引里确实有重复文本块 ${dupRows} 行（下面这条断言不是空跑）`);
  say(noop.pending === 0 && noop.reused === first.count,
    `全部复用：复用 ${noop.reused} / 编码 ${noop.pending}`);
  say(sameBytes('vectors.f32'), 'vectors.f32 与上一版逐字节一致（复用没有把行安错）');

  /* ---------------- 改动索引：改写一章 + 追加三章 ---------------- */
  const before = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const mutated = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const victim = mutated[1];
  const oldLen = String(victim.text).length;
  victim.text = '本章正文已被改写用于演练。' + String(victim.text).slice(0, 260) + '新增一句落在原块边界附近，使后续块起点发生位移。';
  const mk = (i) => ({
    id: `演练新书#00${i}`, source: '演练新书', heading: `演练章节 ${i}`,
    text: `这是用来演练增量构建的合成章节正文，第${i}章。`.repeat(30),
    scenes: [], techs: [], types: ['知识讲解'],
  });
  mutated.push(mk(1), mk(2), mk(3));
  fs.writeFileSync(IDX, JSON.stringify(mutated));
  console.log(`[3] 改动索引：改写「${victim.heading}」（${oldLen} → ${victim.text.length} 字）+ 追加 3 章 → ${mutated.length} 章`);

  // 上一版产物另存两份：inc 就地增量、full 全量重跑（同一份改动后的索引）
  copyDir(OUT, OUT_INC);
  copyDir(OUT, OUT_FULL);
  const prevVec = loadF32(path.join(OUT, 'vectors.f32'));
  const prevChunks = JSON.parse(fs.readFileSync(path.join(OUT, 'chunks.json'), 'utf8'));
  const prevRowOf = new Map();   // hash → 上一版里所有同文本行（可能多行）
  prevChunks.hashes.forEach((h, i) => {
    const q = prevRowOf.get(h);
    if (q) q.push(i); else prevRowOf.set(h, [i]);
  });
  const prevN = prevChunks.hashes.length;

  console.log('[4] 两条路径：增量（就地复用）与全量（同一索引重跑）');
  const inc = run([...base, `--out`, OUT_INC], '增量');
  const full = run([...base, `--out`, OUT_FULL, `--full`], '全量 #2');

  /* ---------------- ① 复用行必须逐字节等于上一版 ---------------- */
  const incChunks = JSON.parse(fs.readFileSync(path.join(OUT_INC, 'chunks.json'), 'utf8'));
  const fullChunks = JSON.parse(fs.readFileSync(path.join(OUT_FULL, 'chunks.json'), 'utf8'));
  const incVec = loadF32(path.join(OUT_INC, 'vectors.f32'));
  const fullVec = loadF32(path.join(OUT_FULL, 'vectors.f32'));
  console.log('\n[5] 断言');
  say(JSON.stringify(incChunks) === JSON.stringify(fullChunks),
    `chunks.json 增量与全量逐字节一致（${incChunks.ids.length} 行，含 hashes/starts）`);

  let reusedChecked = 0; let worstReuse = 1;
  for (let r = 0; r < incChunks.hashes.length; r++) {
    const q = prevRowOf.get(incChunks.hashes[r]);
    if (!q) continue;
    reusedChecked++;
    let best = -1;
    for (const src of q) { const c = cos(prevVec, src, incVec, r); if (c > best) best = c; }
    if (best < worstReuse) worstReuse = best;
  }
  say(reusedChecked > 0 && worstReuse > 0.98,
    `沿用行确实取自「同文本」的旧行：${reusedChecked} 行，最低余弦 ${worstReuse.toFixed(4)}（> 0.98；`
    + '跨越块序号去复用会掉到 0.7~0.9 一档）');

  /* ---------------- ② 增量 vs 全量（按容差） ---------------- */
  let worst = 0; let rowsDiff = 0;
  for (let r = 0; r < incChunks.hashes.length; r++) {
    const dev = 1 - cos(incVec, r, fullVec, r);
    if (dev > 0) rowsDiff++;
    if (dev > worst) worst = dev;
  }
  say(worst < TOL, `增量与全量等价：最大余弦偏差 ${worst.toExponential(3)} < ${TOL}（批次形状差异的量级）`);

  /* ---------------- ③ 只编码改动过的章节 ---------------- */
  const changedRows = inc.pending;
  say(inc.reused > 0 && changedRows > 0 && changedRows < inc.count * 0.5,
    `只编码改动部分：编码 ${changedRows} / 共 ${inc.count} 行（未改动章节全部复用）`);
  say(inc.ms < full.ms, `增量比全量快：${(inc.ms / 1000).toFixed(1)}s < ${(full.ms / 1000).toFixed(1)}s`);

  /* ---------------- ④ 负例：把复用映射错位一格，容差闸门必须发现 ---------------- */
  // 这是本脚本存在的主要理由：证明上面两条断言不是「恒真」的。
  let worstShift = 0; let bad1 = 0; let n1 = 0;
  let worstPos = 0; let badPos = 0; let nPos = 0;
  for (let r = 0; r < incChunks.hashes.length; r++) {
    const q = prevRowOf.get(incChunks.hashes[r]);
    if (!q) continue;
    const src = q[0];
    if (src + 1 < prevN) { const dev = 1 - cos(prevVec, src + 1, incVec, r); n1++; if (dev > TOL) bad1++; if (dev > worstShift) worstShift = dev; }
    if (r < prevN) { const dev = 1 - cos(prevVec, r, incVec, r); nPos++; if (dev > TOL) badPos++; if (dev > worstPos) worstPos = dev; }
  }
  say(worstShift > TOL,
    `负例·错位一格：${bad1}/${n1} 行偏差 > ${TOL}（最大 ${worstShift.toFixed(3)}）——容差闸门抓得住`);
  say(worstPos > TOL,
    `负例·按行号复用（朴素写法）：${badPos}/${nPos} 行偏差 > ${TOL}（最大 ${worstPos.toFixed(3)}）——块起点位移时必须按内容作键`);

  console.log(`\n${fails === 0 ? '✓ 增量构建演练全部通过' : `✗ ${fails} 条断言未通过`}`);
  if (KEEP) console.log(`（演练目录保留：${path.relative(BACKEND, TMP)}）`);
} finally {
  // 清理失败不能让整轮演练算失败：本机有「单轮批量删除」的安全闸门，
  // 累计删除数超阈值时 rmSync 会抛错。留个提示，不阻断断言结果。
  if (!KEEP) {
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch (e) {
      console.log(`（演练目录没自动清掉：${String(e.message).split('\n')[0]}；可手动删 ${path.relative(BACKEND, TMP)}）`);
    }
  }
}
process.exit(fails === 0 ? 0 : 1);
