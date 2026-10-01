/**
 * 提问日志诊断（把 P3 埋点变成可读报告）
 * ------------------------------------------------------------------
 * 用法：
 *   node tests/kb.log.js                 # 汇总 backend/logs/kb-feedback.jsonl，控制台摘要 + 写报告
 *   node tests/kb.log.js --all           # 连测试来路（env=test）一起看（审计用）
 *   node tests/kb.log.js --file=<路径>    # 指定日志（默认 backend/logs/kb-feedback.jsonl）
 *   node tests/kb.log.js --json          # 只输出 JSON（供脚本消费）
 *
 * 测试噪声（第二十六轮）：日志里混着大量**不是家长在问**的记录——`kb:eval` / `kb:units` /
 * `kb:selftest` 在进程内调 `answer()` 每次写全套固定用例，`ui.smoke.js` 打 `/ask-public` 写
 * 「烟雾测试：…」。不处理的话，「被反复问」的榜首永远是测试跑得最多的那条（第二十五轮实测
 * ×33「孩子沉迷手机游戏」实际是测试堆出来的），真家长信号被压在后面。
 * 处理方式：**默认只看 `env=user`**（要审计加 `--all`）；标注为 `env:undefined` 的历史行
 * 是过滤上线前写的、来路不明，按「不知道」单列，**不当成家长数据**，也不静默当成测试。
 *
 * ── 默认口径修正（第二十七轮修掉一个自相矛盾的实现）────────────────
 * 上面这段说明从第二十六轮就是这么写的，但**代码没那么做**：过滤条件是
 * `envBucket(r) !== 'test'`，把 `unknown`（字段缺失的历史行 + 任何没标注的调用方）
 * **当成了家长来路算进核心统计**——规模、命中条数分布、场景分布、出卡次数全都含它们。
 * 而实测这 673 行 unknown 里就有 `ui.smoke.js` 的「烟雾测试：…」与 `kb.units` 的探针句
 * （第十四轮起「顺序」就没变过：埋点上线在第十二轮，进程来路判定在第二十六轮，
 * 中间两周测试打进来的行全部是 unknown）。后果是报告里
 * 「出场景迁移卡 133 次 / 场景分布 焦虑与恐惧 557」这类数字**大部分是测试自己写的**，
 * 而这份报告是「该补哪块语料」的唯一依据——同一个坑第二十六轮修过一次、这是第二处。
 * 现在改成字面承诺：**默认口径 = `env=user`**，`unknown` 与 `test` 都不参与核心统计，
 * 只在「来路与口径」一节按「不知道」如实单列（既不冒充家长数据、也不静默当测试）。
 *
 * ── 固定探针隔离（第二十八轮修掉第三处同类问题）────────────────────
 * 第二十七轮把默认口径修成 `env=user` 之后，报告里的「家长来路」看着干净了，
 * 但**结论仍然是错的**——查实「家长来路」那一列里混着两类**自动化自己写的固定探针**：
 *   ① `kb:units` 的审计断言为了让「删日志—跳过量」能验，用 `KB_AUDIT_ANALYTICS=1`
 *      调 `envFromProcess()` 返回 `user`（`services/kbFeedback.js:56`）→ 探针句以 `env=user` 落盘；
 *   ② `ui.smoke.js` 打 `/ask-public` **不带** `x-kb-analytics-env` 头 → 路由走 `normalizeEnv(undefined)`
 *      → 落到白名单外的默认值 `user`。
 * 实测（第二十八轮）：`env=user` 的 51 条提问去重后只有 7 个问题，全部是测试脚本里写死的句子
 * （「孩子昨天在楼下捡到一块奇怪的石头…」这类），**没有一条是真家长问的**；
 * `--all` 口径的「被反复问」15 条也**无例外全是固定探针**。也就是说这份报告到目前为止
 * `该补哪块语料` 的结论**一条都不能用**——这不是「样本少」，是**样本根本不属于家长**。
 * 处理原则同第二十六轮（**标注而不是丢弃**），只是补第三个维度：
 *   `env` 说的是「这个进程/请求自称是谁」，而**固定探针是可识别的字符串**——
 *   判据只能用内容：`/^烟雾测试/` 前缀 + `AUTO_PROBES` 精确清单。
 *   ⚠ **不要用「有前缀就排除」这种宽判据**（第一版试过把夹具的 `【` 当探针标记，方向反了）：
 *   `kb:units` 的夹具行本身刻意带 `【夹具】` 前缀，而夹具正是用来验证「env 分桶有没有生效」的——
 *   把夹具行当探针摘掉，等于让 `env=user` 与 `env=test` 重新变得不可区分，
 *   一口气废掉第二十六、二十七两轮钉住的断言（实测 2 条不变量当场报红）。
 *   所以判据必须是一条条**具体句子**，宁可漏（漏了会由不变量打印候选提醒）也不要宽。
 *   被摘出的行**仍然如实保留在日志里、也仍然进「规模」的计数**，只是不再进
 *   「优先清单①②③」——清单是给「该补什么」用的，混进机器写死的句子就等于凭空造需求。
 *   报告与 `--json` 都单列 `probeAsks` / `probeQuestions` / `sample.level`，口径可核对。
 *   维护约定：`AUTO_PROBES` 是测试脚本里逐字写死的句表，**改测试时要同步维护**；
 *   `kb:units` 有一条不变量会在未命中时**打印候选**提醒你补（防止某天改了问句、探针悄悄漏回来）。
 *
 * 为什么要有它：第十二轮加了埋点、也给 `/lowhits` 做了接口，但那份数据**从来没有被离线消费过**——
 * 「该补哪块语料、该调哪条权重、哪些问法是家长反复问却没被回答的」都得靠人肉翻日志。
 * 这个脚本只做汇总与排序，不做任何推断：**命中多 ≠ 有用**（实测一条命中 13 条出处的问题
 * 照样被家长标「没帮助」），所以「被标没帮助」的问题永远排在「命中少」的前面。
 *
 * 隐私边界（与 kbFeedback.js 一致，必须一起看）：
 *   - 日志只落在本机 `backend/logs/`，无外发逻辑；
 *   - 但**问题原文可能含孩子的信息**（年龄、症状、学校），所以本脚本产出的报告
 *     （`tests/reports/kb-log-latest.md`）同样只在本机使用，不要贴进工单、聊天或任何外部系统。
 *   - 报告里不额外推断任何儿童信息，只做计数与排序；`note`（家长留言）截断后原样呈现。
 * ------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argOf = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const LOG = argOf('file', path.join(ROOT, 'logs', 'kb-feedback.jsonl'));
const REPORT_DIR = path.join(ROOT, 'tests', 'reports');
const REPORT = path.join(REPORT_DIR, 'kb-log-latest.md');
const asJson = args.includes('--json');
const showAll = args.includes('--all');

/** 按 env 字段分桶。注意 env 是第二十六轮才加的，之前写的行**没有这个字段**——
 *  那是「不知道」来路，不能当成家长数据，也不能静默当成测试（会漏掉真家长）。 */
function envBucket(r) {
  if (r.env === 'test') return 'test';
  if (r.env === 'user') return 'user';
  return 'unknown';
}

/**
 * 自动化自己写死的固定探针句（第二十八轮）。
 * 为什么不能靠 `env` 判定：`env` 记的是「这个进程/请求自称是谁」，而这两处探针
 * **自称就是 user**，与真家长在字段上不可区分——
 *   ① `kb:units` 用 `KB_AUDIT_ANALYTICS=1` 时 `envFromProcess()` 直接返回 `user`（审计需要）；
 *   ② `ui.smoke.js` 打 `/ask-public` 不带 `x-kb-analytics-env` 头，路由的 `normalizeEnv`
 *      对未知值兜底成 `user`（这一点是对的，不能让调用方随便标自己不是家长）。
 * 所以判据必须是**内容**，而且宁可窄也不要宽（宽判据会连真家长一起摘掉）：
 *   - 烟雾前缀 `/^烟雾测试/`：ui.smoke.js 从第十四轮起就这么写，是它自己的标记；
 *   - 精确清单 `AUTO_PROBES`：测试脚本里**逐字写死**的句子（改测试时要同步维护，
 *     kb:units 有一条不变量会在未命中时**打印候选**提醒你补）。
 *   ⚠ **不要用「有前缀就排除」这种宽判据**（第一版把夹具的 `【` 也当成了探针标记，方向反了）：
 *   `kb:units` 的夹具行**本身刻意带 `【夹具】` 前缀**，而夹具正是用来验证
 *   「env 分桶到底有没有生效」的——把夹具行当探针摘掉，等于让 `env=user` 与 `env=test`
 *   重新变得不可区分，一口气废掉第二十六、二十七两轮钉住的断言（实测当场 2 条不变量报红）。
 *   换句话说：**夹具的「可辨识标记」与被摘对象的「写死痕迹」长得像，但用途相反**。
 * 只影响「优先清单」的取数，不影响日志留存与规模计数——**标注而不是丢弃**。
 */
const AUTO_PROBES = [
  // kb.units.js [8] 段的接口契约断言
  '孩子昨晚说不想活了，我该怎么办',
  '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意',
  // ui.smoke.js 的固定问句（第十四轮起未变）
  '孩子一考试就紧张，晚上睡不着，怎么办',
  '孩子说自己不想活了',
  '孩子沉迷手机游戏，一收手机就又哭又闹',
  // 注：日志里还留着「限流窗口已过探针 / 窗口探针二」两条（第二十五轮的限流复测手写句），
  // 但产生它们的脚本现在已不含这两句——`kb:units` 的维护闸门（AUTO_PROBES 必须逐条
  // 在测试源码里找得到）当场把它们判为过时项，已删。历史行本身仍留在日志里，照实不改。
];
const AUTO_PROBE_SET = new Set(AUTO_PROBES);

/** 这一条记录是不是自动化写死的固定探针（只看问题原文，不看 env） */
function isFixedProbe(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  return /^烟雾测试/.test(s) || AUTO_PROBE_SET.has(s);
}

function readLog(file) {
  if (!fs.existsSync(file)) return { rows: [], missing: true };
  const rows = [];
  let bad = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch (e) { bad += 1; }
  }
  return { rows, missing: false, bad };
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function buildReport(rows) {
  // 先按来路分桶，再决定这一份报告看谁（默认只看家长来路）
  const all = rows;
  const buckets0 = { user: 0, test: 0, unknown: 0 };
  for (const r of all) buckets0[envBucket(r)] += 1;
  // 默认口径 = 只认**明确标注为家长**的行（第二十七轮修正：以前是 `!== 'test'`，
  // 于是 unknown 被当成家长算进核心统计——见文件头）。未知来路一律不进核心统计，
  // 只在前面的「来路与口径」一节单列（既不当家长数据、也不静默当测试）。
  const kept = (r) => (showAll ? true : envBucket(r) === 'user');
  const rows2 = all.filter(kept);
  const asks = rows2.filter((r) => r.kind === 'ask');
  const fbs = rows2.filter((r) => r.kind === 'feedback');

  // 第三处隔离（第二十八轮）：**固定探针句**。它们的环境标着 user（见 isFixedProbe 注释），
  // 但内容是测试脚本里写死的，不能进「该补什么」的优先清单。
  // `--skip-probes` 可关掉这一步（审计用：要看含探针的原始排序时）。
  const skipProbes = !args.includes('--skip-probes');
  const isProbe = (r) => skipProbes && isFixedProbe(r.q);
  // 规模（总条数）仍然照实含探针——日志里确实发生过；被摘掉的只有优先清单。
  const probeAsks = asks.filter(isProbe);
  const realAsks = asks.filter((r) => !isProbe(r));
  const realFbs = fbs.filter((r) => !isProbe(r));

  const byQ = new Map();           // 问题原文 → 最近一次记录
  for (const a of realAsks) {
    const p = byQ.get(a.q);
    if (!p || String(a.t) > String(p.t)) byQ.set(a.q, a);
  }
  const uniq = [...byQ.values()];
  const asked = new Map();          // 问题 → 被问次数
  for (const a of realAsks) asked.set(a.q, (asked.get(a.q) || 0) + 1);

  const mode = {};
  for (const a of realAsks) mode[a.mode || '?'] = (mode[a.mode || '?'] || 0) + 1;

  const buckets = { '0': 0, '1-2': 0, '3-5': 0, '6+': 0 };
  for (const a of realAsks) {
    const h = Number(a.hits) || 0;
    buckets[h === 0 ? '0' : h <= 2 ? '1-2' : h <= 5 ? '3-5' : '6+'] += 1;
  }

  const scenes = {};
  for (const a of realAsks) for (const s of a.scenes || []) scenes[s] = (scenes[s] || 0) + 1;

  // 优先清单①：被标「没帮助」的问题——命中多也要排前面（命中多 ≠ 有用）
  const unhelpful = new Map();
  for (const f of realFbs) {
    if (f.verdict !== 'unhelpful') continue;
    const rec = unhelpful.get(f.q) || { q: f.q, n: 0, notes: [], hits: byQ.get(f.q) ? byQ.get(f.q).hits : null };
    rec.n += 1;
    if (f.note && !rec.notes.includes(f.note)) rec.notes.push(f.note.slice(0, 80));
    unhelpful.set(f.q, rec);
  }

  // 优先清单②：低命中且非危机（危机按设计就不给出处）
  const low = uniq.filter((a) => a.mode !== 'crisis' && (Number(a.hits) || 0) <= 2)
    .sort((a, b) => (Number(a.hits) || 0) - (Number(b.hits) || 0));

  // 优先清单③：被反复问的（家长反复问 = 这个问题没被解决）
  const repeated = [...asked.entries()].filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 15);

  return {
    total: asks.length,
    unique: uniq.length,
    feedback: fbs.length,
    helpful: fbs.filter((f) => f.verdict === 'helpful').length,
    // 第三处隔离：优先清单的**取数**只用 realAsks（已摘掉固定探针），
    // 但规模（total）照实含它们——日志里确实发生过，不粉饰。
    // 注意 `--skip-probes`（审计口径）下这两个数是**未统计**而不是「没有探针」：
    // 报告必须能区分「统计到 0 条」与「这次没查」，否则审计口径会给出一个假的 0。
    probeAsks: skipProbes ? probeAsks.length : null,
    probeQuestions: skipProbes ? [...new Set(probeAsks.map((r) => r.q))].length : null,
    probeSkipped: skipProbes,
    // 样本量状态：避免在个位数样本上过度解读（第二十七轮的教训是「结论建立在被污染数据上」，
    // 这里把「样本够不够下结论」本身也做成可断言的数据，而不是留给读报告的人自觉）
    sample: (() => {
      const real = realAsks.length;
      const uq = uniq.length;
      const level = real === 0 ? 'empty' : (real < 30 || uq < 5) ? 'thin' : 'ok';
      return { asks: real, questions: uq, feedback: realFbs.length, level };
    })(),
    // 来路分桶按**行**统计（不只是提问），让「日志里有多少是测试自己写的」一眼可见
    envRows: buckets0,
    scope: showAll ? 'all' : 'user',
    // 「排除了多少」按两桶分别给：测试来路与未标注来路，口径可核对，不是暗箱。
    // 但**字段只说调用方自称是谁**：ui.smoke.js 不发标注头，自称就是 user，
    // 所以标 user 的行里也可能混着测试（第二十八轮查实：47 行 `env=user` 的
    // 「未标注来路」里就有 ui.smoke 的请求）。数量对得上，但标签要写准，别让读的人以为
    // 「标了 test 就等于抓干净了」。
    excluded: showAll ? 0 : all.filter((r) => envBucket(r) === 'test').length,
    excludedUnknown: showAll ? 0 : all.filter((r) => envBucket(r) === 'unknown').length,
    envLabel: {
      test: '标注为测试来路（仍可能有自称 user 的测试混在家长列）',
      unknown: '字段缺失的历史行，来路不明',
    },
    mode, buckets,
    scenes: Object.entries(scenes).sort((a, b) => b[1] - a[1]),
    bridge: realAsks.filter((a) => a.bridge).length,
    ms: { p50: pct(realAsks.map((a) => a.ms || 0), 0.5), p90: pct(realAsks.map((a) => a.ms || 0), 0.9), max: Math.max(0, ...realAsks.map((a) => a.ms || 0)) },
    unhelpful: [...unhelpful.values()].sort((a, b) => b.n - a.n),
    low, repeated,
  };
}

function markdown(s) {
  const L = [];
  L.push('# 提问日志诊断（自动生成）');
  L.push('');
  L.push('> 由 `npm run kb:log` 生成。**只在本机使用**——问题原文可能含孩子的信息，不要外发。');
  L.push('> 说明：日志来自 `backend/logs/kb-feedback.jsonl`（第十二轮埋点）。');
  L.push('');
  L.push('## 来路与口径');
  L.push('');
  L.push(`- 口径：**${s.scope === 'all' ? '全部来路（含测试与未标注）' : '家长来路（仅 env=user）'}**`
    + `${s.excluded ? `，本轮排除了 ${s.excluded} 条标注为测试来路的记录` : ''}`
    + `${s.excludedUnknown ? `、${s.excludedUnknown} 条未标注来路记录` : ''}`);
  L.push(`- 日志行来路：家长 ${s.envRows.user}｜测试 ${s.envRows.test}｜未标注（来路不明）${s.envRows.unknown}`);
  L.push('- ⚠ 这三桶**只反映调用方的自称**，不等于「测试是否已滤干净」：'
    + '`ui.smoke.js` 打 `/ask-public` 时不发 `x-kb-analytics-env` 头，于是它自称 `user`，'
    + '落在「家长」那一桶里。真正把测试摘出去的是下面的**固定探针隔离**（按问题内容判定）。');
  if (s.probeSkipped) {
    L.push(`- **固定探针隔离**：本轮从「优先清单①②③」里摘除了 **${s.probeAsks} 条**
      自动化写死的探针句（涉及 ${s.probeQuestions} 个问题）。它们**仍计入上面的规模与来路计数**、
      日志里照实留着，只是不参与「该补什么」的排序——清单是给「补语料」用的，
      混进机器写死的句子就等于凭空造需求。
      依据：\`env\` 只说明调用方**自称**是谁，而 \`kb:units\` 的审计断言与 \`ui.smoke.js\` 的请求
      都自称 \`user\`，所以判据必须落在**问题内容**上（\`烟雾测试\` 前缀 + \`AUTO_PROBES\` 句表）。
      要按未摘除的原始排序看，加 \`--skip-probes\`。`);
  } else {
    L.push('- **固定探针隔离已按 `--skip-probes` 关闭**：本次**没有统计**探针条数'
      + '（不是「查了是 0 条」），下面清单里可能带自动化写死的句子，别直接当家长需求读。');
  }
  if (s.sample && s.sample.level !== 'ok') {
    const lv = s.sample.level === 'empty' ? '为空' : '偏薄';
    L.push(`- ⚠ **样本量${lv}**：真实提问 ${s.sample.asks} 条 / 去重 ${s.sample.questions} 个问题 / `
      + `反馈 ${s.sample.feedback} 条。**这不足以支撑「该补哪块语料」的结论**——`
      + '下面三份清单只是线索，不要直接当需求排期。'
      + '（第二十七轮把口径修对了，但那一列里仍混着自动化探针；第二十八轮摘掉探针后样本量才可信。）');
  }
  if (s.envRows.unknown && s.scope !== 'all') {
    L.push('- ⚠ 未标注的历史行**不当作家长数据、也不当作测试**（不知道 ≠ 一致），'
      + '**因此不进下面任何一项统计**。第二十七轮查实：这些行里就有 `ui.smoke.js` 的'
      + '「烟雾测试：…」与 `kb.units` 的探针句（埋点在第十二轮上线、进程来路判定在第二十六轮才加，'
      + '中间两周测试打进来的行全部没有 env 字段）。');
    L.push('- 要看含未标注来路的口径，加 `--all`（审计用）；`--all` 也不区分家长与测试，别拿它当家长数据。');
  } else {
    L.push('- 加 `--all` 可看含测试与未标注来路的口径（审计用）。');
  }
  L.push('');
  L.push('## 规模');
  L.push('');
  L.push(`- 提问记录 ${s.total} 条，去重后 ${s.unique} 个问题；反馈 ${s.feedback} 条（有帮助 ${s.helpful}）`);
  L.push(`- 回答模式：${Object.entries(s.mode).map(([k, v]) => `${k} ${v}`).join('｜') || '（无）'}`);
  L.push(`- 命中条数分布：${Object.entries(s.buckets).map(([k, v]) => `${k} 条命中 ${v}`).join('｜')}`);
  L.push(`- 出「场景迁移卡」${s.bridge} 次；耗时 p50 ${s.ms.p50}ms / p90 ${s.ms.p90}ms / 最慢 ${s.ms.max}ms`);
  L.push('');
  L.push('## 优先清单① 被标「没帮助」的问题（命中多也要排在前面）');
  L.push('');
  if (!s.unhelpful.length) L.push('（暂无）');
  else {
    L.push('| 被标次数 | 最近命中 | 家长留言 | 问题 |');
    L.push('| ---: | ---: | --- | --- |');
    for (const u of s.unhelpful) L.push(`| ${u.n} | ${u.hits == null ? '—' : u.hits} | ${u.notes.join(' ／ ') || '—'} | ${u.q.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## 优先清单② 低命中（≤2 条）且非危机的问题');
  L.push('');
  if (!s.low.length) L.push('（暂无）');
  else {
    L.push('| 命中 | 模式 | 主场景 | 问题 |');
    L.push('| ---: | --- | --- | --- |');
    for (const a of s.low) L.push(`| ${a.hits} | ${a.mode} | ${(a.scenes || [])[0] || '—'} | ${a.q.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## 优先清单③ 被反复问的问题（问得多 = 没被解决）');
  L.push('');
  if (!s.repeated.length) L.push('（暂无）');
  else {
    L.push('| 次数 | 问题 |');
    L.push('| ---: | --- |');
    for (const [q, n] of s.repeated) L.push(`| ${n} | ${q.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## 场景分布（按提问次数）');
  L.push('');
  L.push(s.scenes.map(([k, v]) => `${k} ${v}`).join('｜') || '（无）');
  L.push('');
  L.push('## 怎么用这份报告');
  L.push('');
  L.push('- 清单①/③ 决定「该补什么语料」：反复被问又被标没帮助的题材，优先补真语料或做迁移卡。');
  L.push('- 清单② 决定「该调哪条召回」：低命中但确实该有内容的，多半是口语词表或场景映射缺词。');
  L.push('- **不要**拿命中条数当质量指标——本项目实测过一条命中 13 条出处的回答照样被标「没帮助」。');
  L.push('');
  return L.join('\n');
}

function main() {
  const { rows, missing, bad } = readLog(LOG);
  if (missing) {
    console.log(`✗ 找不到日志：${path.relative(ROOT, LOG)}（还没有人问过问题？）`);
    process.exit(1);
  }
  const s = buildReport(rows);
  if (asJson) { console.log(JSON.stringify(s, null, 1)); return; }

  console.log(`日志：${path.relative(ROOT, LOG)}${bad ? `（${bad} 行解析失败已跳过）` : ''}`);
  console.log(`口径：${showAll ? '全部来路（--all，含测试与未标注）' : '仅家长来路（env=user）'}`
    + `；来路分布 家长 ${s.envRows.user} / 测试 ${s.envRows.test} / 未标注 ${s.envRows.unknown}`
    + (showAll || (!s.excluded && !s.excludedUnknown) ? '' : `；本轮排除 测试 ${s.excluded} + 未标注 ${s.excludedUnknown}`));
  console.log(`提问 ${s.total} 条 / 去重 ${s.unique} 个；反馈 ${s.feedback} 条（有帮助 ${s.helpful}）`
    + (s.probeSkipped === false ? '　※ 本次按 --skip-probes 关闭了探针隔离，未统计探针条数'
      : (s.probeAsks ? `　※ 其中 ${s.probeAsks} 条是自动化固定探针（已从下面三份清单摘除，仍计入本行规模）` : '')));
  if (s.sample && s.sample.level !== 'ok') {
    console.log(`⚠ 样本量 ${s.sample.level === 'empty' ? '为空' : '偏薄'}：真实提问 ${s.sample.asks} 条 / `
      + `去重 ${s.sample.questions} 个 / 反馈 ${s.sample.feedback} 条——`
      + '**不足以支撑「该补哪块语料」的结论**，下面三份清单只能当线索看，别当成需求。');
  }
  console.log(`模式：${Object.entries(s.mode).map(([k, v]) => `${k} ${v}`).join('  ') || '（无）'}`);
  console.log(`命中分布：${Object.entries(s.buckets).map(([k, v]) => `${k}→${v}`).join('  ')}；迁移卡 ${s.bridge} 次`);
  console.log('\n优先：被标「没帮助」的问题');
  if (!s.unhelpful.length) console.log('  （暂无）');
  for (const u of s.unhelpful.slice(0, 10)) console.log(`  ×${u.n}  命中 ${u.hits}  ${u.q.slice(0, 40)}${u.notes.length ? '  ← ' + u.notes[0] : ''}`);
  console.log('\n优先：低命中（≤2）且非危机');
  if (!s.low.length) console.log('  （暂无）');
  for (const a of s.low.slice(0, 10)) console.log(`  ${a.hits} 条  ${a.q.slice(0, 44)}`);
  console.log('\n优先：被反复问（≥3 次）');
  if (!s.repeated.length) console.log('  （暂无）');
  for (const [q, n] of s.repeated.slice(0, 10)) console.log(`  ×${n}  ${q.slice(0, 44)}`);

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT, markdown(s), 'utf8');
  console.log(`\n报告已写入：${path.relative(ROOT, REPORT)}（只在本机使用，勿外发）`);
}

main();
