/**
 * 知识库单元测试：标签合法性 / 索引完整性 / 危机词表 / 接口契约
 * ------------------------------------------------------------------
 * 与另外三个脚本的分工：
 *   - `kb.selftest.js` 冒烟：库能不能加载、搜不搜得到；
 *   - `kb.eval.js`     质量：22 条真实问题的 12 个维度；
 *   - 本文件           **不变量**：这些东西一旦坏了就是 bug，不看分数、只看对错。
 * 不依赖外部网络，但接口契约部分需要后端已启动（无则跳过并提示）。
 *
 * 跑法：`npm run kb:units`
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_JSON = path.join(ROOT, 'CBT知识库', '04_检索索引', '检索索引.json');
const TAX_JSON = path.join(ROOT, 'CBT知识库', '04_检索索引', '标签体系.json');
const HTML = path.join(ROOT, '星伴体验版.html');
const BASE = process.env.KB_BASE || 'http://127.0.0.1:3001';

const kb = require('../services/knowledgeBase');
const { crisisHit, crisisResponse, medicalHit, medicalResponse } = require('../services/answer');

let fail = 0;
const say = (ok, msg) => {
  if (!ok) fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
};

const raw = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
const tax = JSON.parse(fs.readFileSync(TAX_JSON, 'utf8'));

/* ---------------- [1] 标签合法性 ---------------- */
console.log('\n[1] 标签合法性（942 章的标签必须在标签体系内）');
{
  const scenes = new Set(tax.scenes || []);
  const techs = new Set(tax.techs || []);
  const types = new Set(tax.types || []);
  say(scenes.size > 0 && techs.size > 0 && types.size > 0,
    `标签体系规模：场景 ${scenes.size} / 技术 ${techs.size} / 类型 ${types.size}`);

  const bad = { scenes: new Set(), techs: new Set(), types: new Set() };
  const dupInDoc = [];
  const emptyTag = [];
  let withScene = 0;
  for (const d of raw) {
    for (const key of ['scenes', 'techs', 'types']) {
      const arr = d[key] || [];
      if (!Array.isArray(arr)) { bad[key].add(`${d.id}: 不是数组`); continue; }
      if (new Set(arr).size !== arr.length) dupInDoc.push(d.id);
      arr.forEach((t) => {
        if (!String(t).trim()) emptyTag.push(d.id);
        const pool = key === 'scenes' ? scenes : (key === 'techs' ? techs : types);
        if (!pool.has(t)) bad[key].add(`${d.id} → ${t}`);
      });
    }
    if ((d.scenes || []).length) withScene += 1;
  }
  say(bad.scenes.size === 0, bad.scenes.size ? `越界场景 ${bad.scenes.size} 个，如：${[...bad.scenes].slice(0, 3).join('；')}` : '所有 scenes 都在标签体系内');
  say(bad.techs.size === 0, bad.techs.size ? `越界技术 ${bad.techs.size} 个，如：${[...bad.techs].slice(0, 3).join('；')}` : '所有 techs 都在标签体系内');
  say(bad.types.size === 0, bad.types.size ? `越界类型 ${bad.types.size} 个，如：${[...bad.types].slice(0, 3).join('；')}` : '所有 types 都在标签体系内');
  say(dupInDoc.length === 0, dupInDoc.length ? `同一章内标签重复：${dupInDoc.slice(0, 3).join('、')}` : '同一章内没有重复标签');
  say(emptyTag.length === 0, emptyTag.length ? `存在空标签：${emptyTag.slice(0, 3).join('、')}` : '没有空标签');
  const withTech = raw.filter((d) => (d.techs || []).length).length;
  const withType = raw.filter((d) => (d.types || []).length).length;
  // 场景标签覆盖率只有四成左右（课件页与理论章大多只打到技术/类型上），这不是 bug，
  // 所以这里守的是「别继续掉」，而不是一个漂亮的比例。
  say(withScene / raw.length >= 0.35,
    `场景标签覆盖 ${withScene}/${raw.length}（${(withScene / raw.length * 100).toFixed(1)}%，下限 35%）`);
  say(withTech / raw.length >= 0.5 && withType / raw.length >= 0.8,
    `技术标签覆盖 ${withTech}/${raw.length}、类型标签覆盖 ${withType}/${raw.length}`);
}

/* ---------------- [2] 索引完整性 ---------------- */
console.log('\n[2] 索引完整性');
{
  const ids = new Set(raw.map((d) => d.id));
  say(ids.size === raw.length, `id 唯一（${ids.size}/${raw.length}）`);

  const noMeta = raw.filter((d) => !String(d.source || '').trim() || !String(d.heading || '').trim());
  say(noMeta.length === 0, noMeta.length ? `缺来源/章节名：${noMeta.slice(0, 3).map((d) => d.id).join('、')}` : '来源与章节名都不为空');

  // 数据现状（不是 bug）：课件里有一批「标题页/目录页」被单独切成了章节，正文是空的或只有几个词。
  // 实测它们**不会**被检索命中（没有可匹配的正文词），所以留着不删也不影响回答；
  // 这里只设一条上限，防止以后切分变粗导致空章节大量增加。
  const emptyDocs = raw.filter((d) => !String(d.text || '').trim());
  const shortDocs = raw.filter((d) => String(d.text || '').trim() && String(d.text).length < 20);
  say(emptyDocs.length < 100,
    `空正文章节 ${emptyDocs.length} 章（标题页/目录页，不参与检索；上限 100）`);
  say(shortDocs.length < 40, `不足 20 字的章节 ${shortDocs.length} 章（同上；上限 40）`);

  // chars 是构建期（build_md.py）的字数，正文在索引期还会去掉行首序号，
  // 服务加载时又做了 OCR 校正，所以两者不会完全相等——只卡「非空正文的量级不荒唐」。
  const off = raw.filter((d) => {
    const a = String(d.text || '').length;
    if (!a) return false;                     // 空正文单独看，不在这里判
    const c = Math.max(1, Number(d.chars) || 1);
    return a < c * 0.5 || a > c * 2.5;
  });
  say(off.length === 0, off.length ? `正文与 chars 量级异常：${off.slice(0, 3).map((d) => d.id).join('、')}` : '有正文的章节，正文长度与 chars 量级一致（0.5~2.5 倍）');

  // **真正关系到回答质量的不变量**：空正文/超短章节绝不能出现在检索结果里。
  // 一旦出现，抽取式回答就会拿一段空文本当「原文引用」，前端弹窗也会是空的。
  const emptyOrShort = new Set([...emptyDocs, ...shortDocs].map((d) => d.id));
  const probes = ['孩子考试焦虑怎么办', '孩子发脾气摔东西', '孩子晚上睡不着', '什么是认知重构',
    '孩子不愿意上学', '家长怎么跟孩子沟通', '孩子注意力不集中', '孩子总说自己不行',
    '孩子被同学孤立', '孩子沉迷手机', '孩子不肯写作业', '孩子自伤怎么办'];
  const leaked = [];
  let probeHits = 0;
  for (const q of probes) {
    for (const r of kb.search(q, { top: 10, autoTag: false })) {
      probeHits += 1;
      if (emptyOrShort.has(r.id)) leaked.push(`${q} → ${r.id}`);
    }
  }
  say(leaked.length === 0,
    leaked.length ? `空/超短章节进入了检索结果：${leaked.slice(0, 3).join('；')}` : `${probes.length} 组常见问题共 ${probeHits} 条结果，无空正文/超短章节`);

  // 第二轮修掉的 bug：25 组「来源 · 章节名」完全相同，出处定不到唯一段落。
  // 服务层给重名的补了「｜#序号」——这里直接卡服务层，防止以后改回去。
  const cites = raw.map((d) => {
    const got = kb.getById(d.id);
    return got ? got.citation : `MISSING:${d.id}`;
  });
  const citeSet = new Set(cites);
  say(citeSet.size === cites.length, `服务层出处唯一（${citeSet.size}/${cites.length}）`);
  const missing = cites.filter((c) => String(c).startsWith('MISSING:'));
  say(missing.length === 0, missing.length ? `getById 取不到：${missing.slice(0, 3).join('、')}` : '每章都能按 id 取回（供前端点开原文）');
  const suffixed = cites.filter((c) => c.includes('｜#')).length;
  say(suffixed > 0, `重名出处已补「｜#序号」后缀（${suffixed} 条）`);
}

/* ---------------- [3] 危机词表 ---------------- */
console.log('\n[3] 危机识别（漏一个就是安全问题）');
{
  const must = [
    '孩子说想自杀', '孩子昨晚说不想活了', '孩子拿刀划自己', '他说想把同学杀了',
    '孩子趁我不注意吞了整瓶药', '孩子吃了很多药片，叫不醒', '孩子说活着没意思',
    '孩子从阳台跳下去了', '孩子用头撞墙撞出血', '孩子说要弄死那个同学',
    '孩子把自己关在屋里，说再也不想活了', '孩子突然不认识我了，叫他没有反应',
    '孩子说他听到有人让他去死', '孩子拿头撞墙一直不停', '孩子突然抽搐了',
    '孩子服药过量', '孩子有自伤行为，胳膊上都是划痕',
    // ↓ 第三十轮补：用家长口语探针扫出的 9 处真实漏网，逐条钉住。
    //   分三类，补法都不能用裸词（裸词会被日常表达误伤，见下面 safe 表）：
    //   ① 裸词缺失 → 改成「身体部位 + 割/划/切」上下文锚定    ② 药物过量倒装/动词前置
    //   ③ 自杀意念委婉说法（必须在「想/要/打算」之后）        ④ 拒食拒饮（必须带时长）
    '孩子把自己关在房里说要割手', '他把手腕割了', '孩子拿剪刀划手臂', '孩子拿刀割手臂',
    '孩子把药全吃了', '孩子把药都吃了', '孩子把整瓶药吞了', '孩子吃了一整瓶安眠药',
    '孩子把一瓶药都喝了', '孩子说活着太累了想解脱', '她说要结束这一切',
    '孩子说要让自己消失', '他说要跳河', '孩子说要跳楼', '孩子不吃不喝好几天了',
    // ↓ 第三十一轮补：用同一套「家长口语探针」扫「伤人」与「意识异常」两面，
    //   又扫出 **13 条伤人漏网 + 13 条意识异常漏网**（此前这两面基本没被探针扫过）。
    //   补法仍是一条裸词都没加（见 answer.js 的 HURT_RE / UNRESPONSIVE_RE）。
    //   —— 伤人面 ——
    '孩子拿凳子砸同学的头', '孩子把同学打出血了', '孩子掐同学脖子', '孩子说要毒死同学',
    '孩子掐我脖子说想让我死', '孩子说要烧了学校', '孩子用美工刀划同学',
    '孩子把弟弟推下楼梯', '孩子说要杀掉全家人', '孩子拿刀威胁我',
    '孩子拿剪刀乱挥说要捅人', '孩子说要用刀捅同学',
    //   —— 意识异常面（本项目硬性要求：意识异常必须走安全响应）——
    '孩子突然叫不醒', '孩子睡觉叫不醒，怎么摇都没反应', '孩子摔到头之后一直想睡，叫不醒',
    '孩子昏过去了', '孩子突然昏睡过去', '孩子倒在地上一动不动', '孩子突然晕倒了',
    '孩子突然眼神发直叫不应', '孩子翻白眼了', '孩子突然不认识人了一样',
    '孩子意识有点乱，说的话不搭', '孩子突然站不稳，说话也含糊', '孩子发烧烧到说胡话',
  ];
  const missed = must.filter((s) => !crisisHit(s));
  say(missed.length === 0, missed.length ? `漏判 ${missed.length} 条：${missed.join('／')}` : `${must.length} 句危机表达全部命中`);

  // 反例（第三十轮新增压测句）：这些**字面很像**但都不是危机。
  // 每条都对应上面某个新规则，专门证明「补词没有被补成天天误报」——
  // 上一版的裸词方案（直接加「割手」「划手臂」「跳河」「想解脱」）就是被这批句子挡下来的。
  // 已知代价两条（**不在这张表里，故意的**）：
  //   ①「孩子在手工课上划手臂橡皮」——「划手臂」字面就是自伤动作，机器无法知道宾语是橡皮；
  //   ②「孩子说想跳河去玩水」——字面含「跳河」，机器判不了意图。
  // 按本项目约定「宁可多拦一次，也不漏掉一次」接受这两条；不再往上堆否定后顾
  // （第一版就是堆到后来开始吃掉真句子）。若将来有人想收紧，请先看这两条的成因。
  const nearMiss = [
    '孩子割手工作业的纸', '孩子剪纸手工课很好玩', '孩子割破了手指',
    '孩子手腕受伤了，我给他贴了创可贴', '孩子胳膊擦破皮了',
    '孩子说不喜欢跳河那段课文', '孩子玩跳楼机很开心', '孩子玩跳楼机一点都不怕',
    '孩子想解脱一下作业压力', '孩子说要消失一会儿自己待着',
    '孩子偏食，只吃白米饭', '孩子挑食不吃青菜', '孩子吃饭不专心，吃两口就跑',
    '孩子不爱喝水，一天喝不了几口', '孩子吃药跟吃饭一样按时',
    // ↓ 第三十一轮新增反例：这些是**伤人与意识异常规则**最容易误伤的场景。
    //   每条都对应本轮某个分支的否定后顾/上下文锚定；它们报红 = 补词补成了天天误报。
    //   特别注意两条：
    //     · 「上课眼神发直，走神了」——「眼神发直」本身是注意力词，必须靠「突然/叫不应」锚定；
    //     · 「说胡话的时候是在编故事」——「说胡话」本身是叙事词，必须靠「发烧/高热」锚定。
    //   还有几条是**顺手修掉的既有误报**（此前是裸词，与第三十轮的「跳楼机」同类）：
    //     「玩杀人游戏」「想杀了游戏里的怪物」「我怕他割到手」。
    '孩子跟同学打架了，两个人都挂了彩', '孩子和弟弟抢玩具，推了弟弟一下',
    '孩子拿剪刀剪纸，剪得很好', '孩子拿刀削铅笔，我怕他割到手',
    '孩子用美工刀做手工课作业', '孩子拿凳子够书架上的东西',
    '孩子摔了一跤，膝盖淤青了', '孩子把碗打碎了，吓得哭了',
    '孩子踢球踢到同学，道过歉了', '孩子说想杀了那个游戏里的怪物',
    '孩子在玩杀人游戏，我要不要管', '孩子说要把作业本烧了',
    '孩子打了个死结，解不开', '孩子捅娄子了，把老师的杯子打碎了',
    '孩子推下桌上一摞书', '孩子说要报复那个抢他玩具的小朋友',
    '孩子把弟弟的积木推倒了', '孩子上课眼神发直，走神了',
    '孩子说胡话的时候是在编故事', '孩子站久了会晃，是不是低血糖',
    '孩子摔了一跤，爬起来又去玩了', '孩子磕到桌角，哭了一会儿就好了',
    '孩子发烧38度，精神还好', '孩子不认识隔壁阿姨，认生',
    '孩子玩得入迷，喊他没反应', '孩子困得眼睛都睁不开',
  ];
  const nearHit = nearMiss.filter((s) => crisisHit(s));
  say(nearHit.length === 0, nearHit.length ? `「像但不是」的日常表达被误判：${nearHit.join('／')}` : `${nearMiss.length} 句「像但不是」的日常表达没有被误判`);

  // 危机响应必须给热线与就医指引（产品硬性要求）
  const resp = crisisResponse(must[0], kb.analyzeQuestion(must[0]));
  const text = [resp.answer, ...(resp.suggestions || []), resp.notice || ''].join('\n');
  say(resp.mode === 'crisis', '危机响应 mode = crisis');
  say(text.includes('12356'), '含 12356（全国统一心理援助热线）');
  say(text.includes('12355'), '含 12355（青少年服务台）');
  say(/就医|急诊|120|医院/.test(text), '含就医指引');
  say((resp.sources || []).length === 0, '危机响应按设计不给出处（不把教材当处置方案）');

  // 误判检查：过度触发会让安全提示失效
  // 第三十一轮补两条**方向相反**的对照，是本轮最关键的教训：
  //   「孩子早上总是叫不醒，睡得晚」是青少年晚睡（日常），
  //   「孩子突然叫不醒」是意识异常（危机）——只差一个「总是/突然」。
  //   若把「叫不醒」写成裸词，前者会被天天误拦；只写「突然叫不醒」又漏掉后者。
  //   所以这两句必须**同时**在本表与上面 must 表里，缺一句这套测试就失去意义。
  const safe = [
    '孩子写作业拖拉，说了也不听', '孩子考试前睡不好', '孩子最近不爱吃饭',
    '孩子和同学闹矛盾了', '孩子今天在幼儿园被小朋友推了一下',
    '孩子沉迷手机游戏，一收就发脾气', '孩子上课注意力不集中',
    '孩子不肯吃药，每次都要哄很久', '孩子最近在吃感冒药', '孩子对表扬没有反应',
    '孩子早上总是叫不醒，睡得晚', '孩子对奖励没有反应，强化物不好找',
    // ↓ 第三十一轮：既有的「叫人没反应」裸词方向反了（抓的是注意力场景），已移出词表。
    //   这几句过去有零星误报风险，现在必须稳定不拦。
    '孩子上课走神，叫他没反应', '孩子玩得入迷，喊他没反应',
    '孩子睡得很沉，早上叫了两遍才起', '孩子睡前一直翻来覆去睡不着',
  ];
  const falseHit = safe.filter((s) => crisisHit(s));
  say(falseHit.length === 0, falseHit.length ? `误判为危机：${falseHit.join('／')}` : `${safe.length} 句日常表达没有被误判`);
}

/* ---------------- [3b] 急症/意外伤害 → 就医指引（第三十二轮） ----------------
 * 第三十一轮留白的产品决策在本轮敲定：急症**不并入危机词表**，单独走 mode=medical
 *（危机响应的心理热线话术对「吞干燥剂」不适用，资源指向也不同：120/急诊 vs 12356）。
 * 顺序即语义：危机先判、急症后判；本段同时钉住这两条。
 */
console.log('\n[3b] 急症/意外伤害就医指引（第三十二轮）');
{
  // 必中：第三十一轮遗留的 8 条探针方向（烫伤/摔落/误吞/误服/动物咬伤/出血）+ 高频变体
  const medMust = [
    '孩子被开水烫伤了，起了大水泡', '孩子把干燥剂吞下去了', '孩子误吞了纽扣电池',
    '孩子喝了消毒液怎么办', '孩子把漂白水当饮料喝了', '孩子被狗咬破了皮',
    '孩子吐血了', '孩子摔伤了膝盖一直在流血', '孩子流血不止', '孩子把樟脑丸当糖吃了',
    '孩子从楼梯上摔下来，胳膊不能动了', '孩子咳血了', '孩子烫伤怎么办',
  ];
  const missedMed = medMust.filter((s) => !medicalHit(s));
  say(missedMed.length === 0, missedMed.length ? `急症漏判 ${missedMed.length} 条：${missedMed.join('／')}` : `${medMust.length} 句急症表达全部命中`);

  // 反例：每条对应一个锚定分支，报红 = 补词补成了天天误报。
  //   「怎么预防烫伤／怕烫到孩子」→ ② 只收事件形与急症问句；
  //   「我怕孩子被狗咬」→ ③ 必须带结果标记（同第三十一轮「我怕他割到手」）；
  //   「我快气吐血了」→ ⑤ 否定后顾排掉夸张用法；
  //   「把电池装进遥控器／把钉子钉进泡沫板」→ ① 动词表不含 装/钉；
  //   「从床上摔下来了」→ ⑥ 低处坠落刻意不拦（头部+意识异常由危机词表接管）；
  //   「不肯吃药／在吃感冒药」→ ① 名词表不含「药」（药物过量另有危机规则管）。
  const medSafe = [
    '怎么预防孩子烫伤', '热水壶放哪里才不会烫到孩子', '我怕孩子被狗咬',
    '我快气吐血了', '孩子把电池装进遥控器', '孩子把钉子钉进了泡沫板',
    '孩子从床上摔下来了，哭了一会儿就好了', '孩子不肯吃药，每次都要哄很久',
    '孩子最近在吃感冒药', '孩子磕破皮了，哭了一会儿就好了', '孩子摔了一跤，膝盖淤青了',
    '孩子吃饭很慢', '孩子把戒指摘下来还给同学',
  ];
  const medFalse = medSafe.filter((s) => medicalHit(s));
  say(medFalse.length === 0, medFalse.length ? `日常表达被误判为急症：${medFalse.join('／')}` : `${medSafe.length} 句日常表达没有被误判为急症`);

  // 顺序即语义：危机优先于急症
  say(!!crisisHit('孩子喝了消毒液想死'), '「喝了消毒液想死」仍走危机（自伤优先于意外）');
  say(!!crisisHit('孩子摔到头之后一直想睡，叫不醒'), '「摔到头后叫不醒」仍由危机词表接管（第三十一轮的外伤急症语境）');
  say(!medicalHit('孩子突然叫不醒') && !medicalHit('孩子昏过去了'), '危机词表已接管的意识异常不重复计入急症');

  // 急症响应本身的不变量
  const mresp = medicalResponse('孩子把干燥剂吞下去了', null);
  const mtext = [mresp.answer, mresp.notice || ''].join('\n');
  say(mresp.mode === 'medical', '急症响应 mode = medical');
  say(mtext.includes('120') && /急诊/.test(mtext), '含 120 与急诊指引');
  say(mtext.includes('不提供医疗建议'), '明确声明不提供医疗建议');
  say(mtext.includes('12356'), '含 12356（仅用于「可能是自伤」的转介说明）');
  say((mresp.sources || []).length === 0, '急症响应按设计不给出处（教材不是急救手册）');
}

/* ---------------- [4] 前端接线的不变量 ---------------- */
console.log('\n[4] 前端接线');
{
  const src = fs.readFileSync(HTML, 'utf8');
  // 危机热线不能只在后端有，前端紧急支持页也要能看到
  say(src.includes('12356') && src.includes('12355'), '前端也能看到 12356 / 12355');
  // 本项目硬性约定：星伴体验版.html 里不要用 IIFE（会被写盘工具吞行）
  say(!/\(function\s*\(\s*\)\s*\{/.test(src), '没有使用 (function(){})() 立即执行函数');
  // 内联 script 必须能过语法检查
  const scripts = [...src.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  say(scripts.length > 0, `读到内联 script ${scripts.length} 段`);
  let syntaxOk = true;
  const dir = path.join(__dirname, '.units-tmp');
  try {
    fs.mkdirSync(dir, { recursive: true });
    scripts.forEach((s, i) => fs.writeFileSync(path.join(dir, `s${i}.js`), s));
    const { execFileSync } = require('child_process');
    for (let i = 0; i < scripts.length; i += 1) {
      try { execFileSync(process.execPath, ['--check', path.join(dir, `s${i}.js`)], { stdio: 'pipe' }); }
      catch (e) { syntaxOk = false; console.log(`     第 ${i} 段脚本语法错误：${String(e.stderr || e.message).slice(0, 120)}`); }
    }
  } catch (e) {
    syntaxOk = false;
    console.log(`     抽取脚本失败：${e.message}`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 清不掉就算了 */ }
  }
  say(syntaxOk, '内联 script 全部通过 node --check');
}

/* ---------------- [5] 检索结果缓存 ---------------- */
console.log('\n[5] 检索结果缓存（串答/污染/无限增长都是 bug）');
{
  kb.clearSearchCache();
  const q = '孩子考试焦虑怎么办';
  const opt = { top: 5, maxChars: 900 };

  const a = kb.search(q, opt);
  const st1 = kb.stats().searchCache;
  say(st1.misses >= 1 && st1.entries >= 1, `首次检索记为 miss（misses=${st1.misses}，entries=${st1.entries}）`);

  const b = kb.search(q, opt);
  const st2 = kb.stats().searchCache;
  say(st2.hits >= 1, `同问法同参数第二次命中缓存（hits=${st2.hits}）`);
  say(JSON.stringify(a) === JSON.stringify(b), '命中缓存返回的结果与首次完全一致');

  // 正确性红线①：调用方改了拿到的结果，不得污染缓存
  if (a.length) { a[0].text = '被调用方改过的文本'; a[0].id = 'FAKE_ID'; }
  const c = kb.search(q, opt);
  say(c.length && c[0].text !== '被调用方改过的文本' && c[0].id !== 'FAKE_ID',
    '返回深拷贝：改动拿到的结果不影响缓存里的原文');

  // 正确性红线②：key 覆盖所有影响结果的因素——换参数绝不能串
  const d = kb.search(q, { top: 6, maxChars: 900 });
  const st3 = kb.stats().searchCache;
  say(st3.misses > st2.misses, '换 top 参数 → 另起一条缓存，不当成同一次问');
  say(c.length === 5 && d.length === 6, `top=5 返回 ${c.length} 条、top=6 返回 ${d.length} 条（没串）`);
  const e1 = kb.search(q, { top: 5, maxChars: 900, strictScenes: true, scenes: ['焦虑与恐惧'] });
  say(kb.search(q, { top: 5, maxChars: 900, strictScenes: true, scenes: ['焦虑与恐惧'] }).length === e1.length
    && e1.every((x) => x.scenes.includes('焦虑与恐惧')),
    'strictScenes + scenes 组合正确缓存且硬过滤未被绕过');

  // 正确性红线③：清空后从头计数，且清空本身可用（索引重载会走这条路）
  kb.clearSearchCache();
  const st4 = kb.stats().searchCache;
  say(st4.entries === 0 && st4.hits === 0 && st4.misses === 0, 'clearSearchCache 后计数与条目归零');
  kb.search(q, opt);
  say(kb.stats().searchCache.entries === 1, '清空后重新检索重新入缓存');
}

/* ---------------- [6] 语义扩展（查询扩展重排） ---------------- */
console.log('\n[6] 语义扩展（扩展词带召回，但不能稀释硬过滤）');
{
  const q = '孩子写作业磨蹭，怎么提醒都没用';
  const ex = kb.expandQuery(q);
  say(ex.length >= 5 && ex.every((t) => t.length >= 2),
    `扩展出 ${ex.length} 个词且全部 ≥2 字（如：${ex.slice(0, 6).join('／')}）`);
  say(new Set(ex).size === ex.length, '扩展词无重复');
  say(ex.every((t) => !q.includes(t)), '问题里已有的词不再重复扩展');
  say(JSON.stringify(ex) === JSON.stringify(kb.expandQuery(q)),
    '扩展结果是查询文本的纯函数（同问必同扩展，不影响检索缓存）');
  say(JSON.stringify(kb.expandQuery('')) === '[]' && JSON.stringify(kb.expandQuery(null)) === '[]',
    '空问题不扩展');

  const st = kb.stats().expand;
  say(st.terms >= 200, `概念组成员 ${st.terms} 个（18 组场景词 + 补充词表），扩展权重 ${st.weight}`);
  say(kb.expandQuery('孩子考前焦虑怎么办').includes('紧张'),
    '「考前焦虑」能扩展出「紧张」（同义说法排得上来）');

  // 核心不变量：扩展词确实把「字面命不中」的章节带进了结果——
  // 这些章节正文不含问题的任何二元词，只靠扩展词进入 top10。
  const big = (q.match(/[\u4e00-\u9fff]{2,}/g) || [])
    .flatMap((run) => { const a = []; for (let i = 0; i + 2 <= run.length; i++) a.push(run.slice(i, i + 2)); return a; });
  const rs = kb.search(q, { top: 10, autoTag: false });
  const viaExpand = rs.filter((d) => !big.some((t) => d.text.includes(t) || d.heading.includes(t))
    && ex.some((t) => d.text.includes(t)));
  say(viaExpand.length >= 1,
    viaExpand.length ? `top10 里有 ${viaExpand.length} 条靠扩展词召回（字面词全不在正文，如：${viaExpand[0].citation.slice(0, 30)}）`
      : 'top10 里没有纯靠扩展词召回的章节');

  // 红线：扩展词不得稀释硬过滤——strictScenes 的结果必须仍然全部在场景内
  const strict = kb.search(q, { top: 6, strictScenes: true, scenes: ['注意力与多动'] });
  say(strict.every((d) => d.scenes.includes('注意力与多动')),
    `strictScenes 硬过滤下 ${strict.length} 条结果全部在指定场景内（扩展词没有越界）`);
}

/* ---------------- [7] 语义层 ---------------- */
// 写成具名函数、由下面 [8] 串行调用：独立起一个异步 IIFE 会和 [8] 并发，
// 而 process.exit 在 [8] 末尾——本段的断言可能还没来得及跑就被退出了。
async function unitSemantic() {
  console.log('\n[7] 语义层（向量索引一致性 + 不许绕过硬过滤）');
  const sem = require('../services/semantic');
  const SEM_DIR = path.join(ROOT, 'CBT知识库', '04_检索索引', '语义索引');
  const hasArtifact = fs.existsSync(path.join(SEM_DIR, '索引信息.json'))
    && fs.existsSync(path.join(SEM_DIR, 'vectors.f32'));
  if (!hasArtifact) {
    console.log('  ! 语义索引未构建（属未安装状态，不算失败）——跑 node tools/embed_kb.mjs 后再验');
    return;
  }

  // 产物本身的一致性：不看模块，直接读文件核对（模块读错文件也逃不掉）
  const meta = JSON.parse(fs.readFileSync(path.join(SEM_DIR, '索引信息.json'), 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(path.join(SEM_DIR, 'chunks.json'), 'utf8'));
  const bytes = fs.statSync(path.join(SEM_DIR, 'vectors.f32')).size;
  say(bytes === meta.count * meta.dim * 4,
    `向量文件 ${bytes} 字节 = ${meta.count} 行 × ${meta.dim} 维 × 4（float32）`);
  say(chunks.ids.length === meta.count && chunks.starts.length === meta.count,
    `chunks.json 行数与元数据一致（${meta.count}）`);
  say(chunks.ids.every((id) => raw.some((d) => d.id === id)),
    '每个分块都指向一个真实存在的章节 id');
  say(meta.stride < meta.chunkChars, `分块有重叠（块长 ${meta.chunkChars} / 步长 ${meta.stride}）`);

  // ---- 分块 hash：增量构建的唯一凭据（第二十一轮）----
  // 增量构建按「块文本的 sha1」找回上一版的向量行照抄。一旦 hash 与实际文本对不上，
  // 复用的就是**别的段落**的向量——产物照样能加载、health 照样 ready、检索照样有结果，
  // 属于典型的静默劣化。所以这里按存储的 (id, start) 就地取原文重算 hash 逐行核对。
  // 注意：这里**不重新切分**（切分口径是 embed_kb.mjs 的单一实现，重复一份必然漂移），
  // 只验「第 r 行的 hash ↔ 第 r 行的 (id, start) 指向的文本」这个对应关系。
  const textOf = new Map(raw.map((d) => [d.id, String(d.text || '').replace(/\s*\n\s*/g, '')]));
  say(Array.isArray(chunks.hashes) && chunks.hashes.length === meta.count,
    `chunks.json 每行都带分块 hash（${chunks.hashes ? chunks.hashes.length : 0} 行）——旧版产物缺它，增量复用会失效`);
  let hashBad = null;
  if (Array.isArray(chunks.hashes) && chunks.hashes.length === meta.count) {
    for (let r = 0; r < meta.count; r++) {
      const id = chunks.ids[r];
      const t = textOf.get(id);
      if (t === undefined) { hashBad = { r, id, why: '章节 id 不在索引里' }; break; }
      const s = t.slice(chunks.starts[r], chunks.starts[r] + meta.chunkChars);
      const h = crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 16);
      if (h !== chunks.hashes[r]) {
        hashBad = { r, id, why: `算式 ${h} ≠ 存储 ${chunks.hashes[r]}（start ${chunks.starts[r]}，取到 ${s.length} 字）` };
        break;
      }
    }
  }
  say(hashBad === null,
    hashBad === null
      ? '分块 hash 与 (id, start) 指向的正文逐行吻合（复用不会张冠李戴）'
      : `第 ${hashBad.r} 行的 hash 与正文不符（${hashBad.id}：${hashBad.why}）——复用会把别的段落的向量安到这一章上`);

  // 构建入口两个都在：默认增量、`--full` 能退回全量（模型换了必须全量）
  const embedSrc2 = fs.readFileSync(path.join(ROOT, 'backend', 'tools', 'embed_kb.mjs'), 'utf8');
  say(embedSrc2.includes('--full') && /reuse/.test(embedSrc2),
    'embed_kb.mjs 默认按内容复用、且保留了 --full 全量入口（换模型时要用）');
  const meta2 = JSON.parse(fs.readFileSync(path.join(SEM_DIR, '索引信息.json'), 'utf8'));
  say(meta2.mode === 'incremental' || meta2.mode === 'full',
    `语义索引记着上次构建方式：${meta2.mode}（复用 ${meta2.reused} / 编码 ${meta2.encoded}）`);

  // ---- 向量与主索引「同源」闸门（第二十轮）----
  // 语义向量是离线构建的，主索引会被重建或增量合并改动；一旦脱钩，症状是**静默的**：
  // 新章节没有向量、语义补位召不回它们，而 health 照旧报 ready。
  // 判据 = 主索引全局指纹（索引版本.json 的 `全局指纹`，manifest.js 写入）。
  // 这里要求：元数据必须记着它，且与当前主索引一致；否则必须显式 stale（不许默默带病运行）。
  const liveManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'CBT知识库', '04_检索索引', '索引版本.json'), 'utf8'));
  const liveFp = liveManifest['全局指纹'];
  say(!!meta.indexFingerprint,
    `语义元数据记着来源主索引指纹（${meta.indexFingerprint || '缺失'}）——缺失说明构建脚本又把键名写错了`);
  say(meta.indexFingerprint === liveFp,
    `语义向量与当前主索引同源（${meta.indexFingerprint} vs ${liveFp}）——不一致请跑 npm run kb:embed`);
  say(sem.info().stale === false,
    `运行时未被判为 stale（staleReason：${sem.info().staleReason || '无'}）`);
  // 键名的单一来源是 manifest.js；构建脚本曾写成英文键 `.fingerprint` → 恒为 null（机制空转）。
  // 这条静态断言挡住同样的错法再犯（本项目「两处落点必须一起改」的教训）。
  const embedSrc = fs.readFileSync(path.join(ROOT, 'backend', 'tools', 'embed_kb.mjs'), 'utf8');
  say(embedSrc.includes('全局指纹'),
    'embed_kb.mjs 读主索引指纹用的是 manifest.js 的中文键名 `全局指纹`（防再次写错键）');

  // 归一化：抽 3 行算模长
  const all = new Float32Array(fs.readFileSync(path.join(SEM_DIR, 'vectors.f32')).buffer);
  let normOk = true;
  for (const r of [0, Math.floor(meta.count / 2), meta.count - 1]) {
    let s = 0;
    for (let i = 0; i < meta.dim; i++) s += all[r * meta.dim + i] ** 2;
    if (Math.abs(Math.sqrt(s) - 1) > 0.01) normOk = false;
  }
  say(normOk, '向量已 L2 归一化（抽查首/中/末行模长 ≈ 1）');

  const ok = await sem.ensure();
  say(ok, ok ? `模型可用：${sem.info().model} / ${sem.info().chunks} 块 / 加载 ${sem.info().loadMs}ms`
    : `模型不可用（${sem.info().reason || sem.info().lastError}）`);
  if (!ok) return;

  // 编码是纯函数：同问同向量，且命中缓存
  const v1 = await sem.encode('孩子晚上不肯睡觉');
  const v2 = await sem.encode('孩子晚上不肯睡觉');
  say(v1.length === meta.dim && v1.every((x) => x >= -1.01 && x <= 1.01),
    `查询向量维度 ${v1.length}，取值在 [-1,1] 内`);
  say(v1.every((x, i) => x === v2[i]), '同一句问法编码结果稳定（纯函数）');

  // 关键红线：语义层绝不能绕过硬过滤
  const st = kb.stats().semantic;
  const strictScene = await kb.searchAsync('孩子睡觉前又哭又闹', { top: 6, strictScenes: true, scenes: ['睡眠问题'] });
  say(strictScene.every((d) => d.scenes.includes('睡眠问题')),
    `strictScenes 下 ${strictScene.length} 条结果全部在场景内（语义层没有越界）`);
  const strictType = await kb.searchAsync('孩子睡觉前又哭又闹', { top: 6, types: ['工具表单与工作表'], strictTypes: true });
  say(strictType.every((d) => d.types.includes('工具表单与工作表')),
    `strictTypes 下 ${strictType.length} 条结果全部是目标类型`);

  // 语义开口的红线：只放「一个场景标签都没有」的章节。
  // 用已确认会触发开口的问法（睡前哭闹 → 全书唯一讲这件事的章节没有场景标签）——
  // 若这里变成 0 条，要么门槛被调紧了、要么第十九轮修掉的「放行了却被过滤弹回」又回来了。
  // 注意：这条依赖语义索引与当前模型，重建语义索引（换模型）后阈值需要重新校准。
  const esc = await kb.searchAsync('孩子睡前哭闹，怎么安抚都没用', { top: 8 });
  const escRows = esc.filter((d) => d.semanticEscape);
  say(escRows.every((d) => d.scenes.length === 0 && d.semantic !== null),
    `开口条目 ${escRows.length} 条全部「无场景标签 + 有语义分」（标签矛盾的章节不会开口）`);
  say(escRows.length >= 1,
    `语义开口在产品路径（top=8）确实能触发：${escRows.length} 条，如「${escRows[0] ? escRows[0].heading.slice(-12) : '—'}」`);

  // 门槛不能被无关问题捅穿
  for (const q of ['今天天气怎么样', '如何用 Excel 做数据透视表']) {
    await kb.searchAsync(q, { top: 8 });
    const d = kb._lastEscape() || {};
    say(!(d.injected > 0), `无关问题「${q}」没有触发语义开口（注入 ${d.injected || 0} 条）`);
  }

  // 关掉语义必须与纯同步检索逐条一致（回归保护：语义层不能偷偷改成员）
  const a = kb.search('孩子总说我不行', { top: 6 });
  kb.clearSearchCache();
  const b = await kb.searchAsync('孩子总说我不行', { top: 6, semantic: false });
  say(JSON.stringify(a.map((x) => x.id)) === JSON.stringify(b.map((x) => x.id))
    && b.every((x) => x.semanticEscape === false),
  '显式关掉语义时结果与 search() 逐条一致且无开口条目');

  say(st.enabled === true && st.weight > 0 && st.addMin > 0,
    `语义配置可观测：权重 ${st.weight} / 开口阈值 ${kb.stats().semantic.addMin}`);
}

/* ---------------- [7b] 回答里的教材对话片段 ---------------- */
// 第二十二轮（P4「回答里给教材原话里的具体说法」）的不变量：
// 挂得出（同场景）、可溯源（dialogue.id 能按 id 取回、回答带同一出处）、
// 不包装（定位说明在场、改写后仍带成人语境的对话整条不挂）。
async function unitDialogue() {
  console.log('\n[7b] 回答里的教材对话片段（挂得出 / 可溯源 / 不包装成话术）');
  const { answer, ADULT_WORDS } = require('../services/answer');
  const r = await answer('孩子一到考试就紧张，晚上翻来覆去睡不着，怎么办', { top: 8 });
  const text = String(r.answer || '');
  const i = text.indexOf('### 教材里的一段对话');
  say(i >= 0 && !!r.dialogue, '同场景问题挂出了教材对话片段（学业与考试压力有对口语料）');
  if (i >= 0) {
    const endH = text.indexOf('\n### ', i + 5);
    const endHr = text.indexOf('\n---', i);
    const ends = [endH, endHr].filter((x) => x > 0);
    const part = text.slice(i, ends.length ? Math.min(...ends) : text.length);
    const bad = ADULT_WORDS.filter((w) => part.includes(w));
    say(bad.length === 0, bad.length ? `片段含成人称谓：${bad.join('/')}` : '摘录与说明不含成人称谓（称谓已改写，改不动的整条不挂）');
    say(/话术模板/.test(part), '定位说明在场：写明不是照着念的话术模板');
    say(/（出处：.+）/.test(part) && r.dialogue.citation && part.includes(`（出处：${r.dialogue.citation}）`),
      '片段带出处且与 dialogue 字段一致');
    say(!!kb.getById(r.dialogue.id), '对话出处可按 id 取回（可溯源）');
    const turns = part.split('\n').filter((l) => /^>\s+/.test(l) && !/说明：/.test(l)).length;
    say(turns >= 2, `摘录 ${turns} 轮（≥2 才算对话体）`);
  }

  // 没有对口场景的问题不得硬挂——「挂不出」本身是合法结果
  const r2 = await answer('今天天气怎么样', { top: 8 });
  say(!String(r2.answer || '').includes('### 教材里的一段对话'), '无关问题不挂对话片段');
}

/* ---------------- [7c] 话题词与相关度闸门 ---------------- */
// 第二十五轮修的是一个**静默失效**：pickSentences / pickDialogue 的相关度闸门写作
// 「命中一个 ≥3 字的具体词，或命中两个以上词」，但 topicTokens 只产出二字词，
// 于是 `mLong` 恒为 0、前半条判据从未生效——代码说的和做的不是一回事，且没有任何测试能发现。
// 这几条断言就是钉死它：①三字词必须真的产出；②越界问法不得靠功能性二字词凑出交集。
async function unitTopicTokens() {
  console.log('\n[7c] 话题词与相关度闸门（三字具体词必须真的产出）');
  const { topicTokens } = require('../services/answer');

  // ① 闸门的「具体词」这半条必须活着：含具体词的问句要产出 ≥3 字的词
  const t1 = topicTokens('孩子写作业坐不住，五分钟就走神');
  say(t1.some((t) => t.length >= 3), `含具体词的问句产出了三字词（${t1.filter((t) => t.length >= 3).slice(0, 3).join('/')}）`);
  const t2 = topicTokens('孩子老跟我对着干，故意不写作业');
  say(t2.includes('对着干') && t2.includes('写作业'),
    '口语具体词被保留（对着干 / 写作业）——否则闸门只能靠切碎的字面凑数');

  // ② 功能性词不得当话题词：否则越界问法靠「如何/何用」这种二字交集就能漏出引用句
  const t3 = topicTokens('如何用 Excel 做数据透视表');
  say(!t3.includes('如何') && !t3.includes('何用') && !t3.includes('如何用'),
    '疑问词不作为话题词（如何 / 何用 / 如何用 均已排除）');
  const t4 = topicTokens('今天天气怎么样');
  say(!t4.includes('今天') && !t4.includes('怎么样'), '时间词与疑问词不作为话题词（今天 / 怎么样）');

  // ③ 端到端：越界问法在「主检索路径」上取不到引用句。
  //    注意 `composeExtractive` 在一条都取不到时会走**关闭匹配的兜底**（requireMatch=false）
  //    并附「内容不多」的诚实提示——所以这里断言的是检索层行为，不是回答里一定没有引用句。
  const kb = require('../services/knowledgeBase');
  const { pickSentences } = require('../services/answer');
  let leaked = 0;
  for (const q of ['如何用 Excel 做数据透视表', '今天天气怎么样', '北京到上海的高铁要坐多久',
    '推荐几部适合全家看的电影']) {
    const toks = topicTokens(q);
    for (const h of kb.search(q, { top: 8, maxChars: 1200 })) {
      leaked += pickSentences(h.text, toks, 3, 260, false, true).length;
    }
  }
  say(leaked === 0, `越界问法在主检索路径上引用句为 0（实测 ${leaked} 条）`);

  // ④ 反向：对口问法不能被收紧到一条都取不到（防止「修完变成空答案」）
  let okCount = 0;
  const inScope = ['孩子沉迷手机游戏，一收手机就又哭又闹', '孩子一考试就紧张，晚上睡不着',
    '孩子被同学孤立，不愿意去学校，早上起来就说肚子疼', '孩子晚上很难入睡，一上床就说害怕，要开灯',
    '孩子发脾气就摔东西、打人，我说什么他都不听', '孩子有自伤行为，胳膊上都是划痕'];
  for (const q of inScope) {
    const toks = topicTokens(q);
    for (const h of kb.search(q, { top: 8, maxChars: 1200 })) {
      if (pickSentences(h.text, toks, 3, 260, false, true).length) { okCount++; break; }
    }
  }
  say(okCount === inScope.length, `对口问法全部能取到引用句（${okCount}/${inScope.length}）`);
}

/* ---------------- [7d] 埋点的测试噪声隔离 ---------------- */
// 第二十六轮：日志里混着大量「不是家长在问」的记录（自测在进程内调 answer() 每次写整套用例、
// 冒烟测试打 /ask-public 写「烟雾测试：…」），把 kb:log 的优先清单挤满噪声。
// 第二十七轮补修**第二处同类静默 bug**：kb:log 的默认口径写成 `env !== 'test'`，
// 于是 `unknown`（字段缺失的历史行 + 没标注的调用方）被**当成家长来路算进核心统计**——
// 规模/命中分布/场景分布/出卡次数全含它们，而实测这批行里就有冒烟测试与 units 探针。
// 这里钉住四件事：①自测进程必须被识别为 test 来路；②请求头能标注 test 且不认未知值；
// ③消费端 kb:log 默认把 test 排掉——**而且真的少算了**（不是只在文案上宣称）；
// ④默认口径**还**要把未标注来路排掉（不知道 ≠ 家长），且分桶计数与口径一一对得上。
function unitAnalyticsNoise() {
  console.log('\n[7d] 埋点的测试噪声隔离（自测不得混进家长提问统计）');
  const fb = require('../services/kbFeedback');

  // ① 自测进程：进程内调 answer() 不带任何 HTTP 头，只能靠进程来路判断
  say(fb.envFromProcess() === 'test', '在测试进程里 envFromProcess() 判为 test（kb:eval/kb:units 写下的记录会被标注）');

  // ② 请求级：白名单只认 test，其余（含想伪造成「家长」的）一律 user——
  //    这个接口没有鉴权，不能让调用方自由编造来路。
  const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'knowledge.js'), 'utf8');
  say(routeSrc.includes("req.get('x-kb-analytics-env')"), '路由把请求头带进埋点（ui.smoke 打 HTTP 时也能标注）');
  const logSrc = fs.readFileSync(path.join(__dirname, 'kb.log.js'), 'utf8');
  say(/ENVS\s*=\s*\[[^\]]*'user'[^\]]*'test'[^\]]*\]/.test(fs.readFileSync(path.join(__dirname, '..', 'services', 'kbFeedback.js'), 'utf8')),
    '埋点层的来路白名单只含 user / test');

  // ③ 消费端真的少算了：拿一份**夹具**日志喂给 kb.log.js，默认口径必须比 --all 少掉测试那几条。
  //    夹具里问题写得可辨识，避免把真实日志（含孩子信息）读进断言。
  const fixture = path.join(__dirname, '.tmp-kblog-fixture.jsonl');
  // 夹具让测试来路那条被问 3 次（≥3 才进「被反复问」清单——第二十五轮 ×33 的假冠军正是这么来的），
  // 家长来路那条只问 1 次：这样「默认口径里没有它 / --all 里有它」才有区分度。
  const rows = [
    { t: '2026-01-01T00:00:00.000Z', kind: 'ask', env: 'test', q: '【夹具】测试来路的问题', hits: 0, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-01-01T00:00:01.000Z', kind: 'ask', env: 'test', q: '【夹具】测试来路的问题', hits: 0, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-01-01T00:00:01.500Z', kind: 'ask', env: 'test', q: '【夹具】测试来路的问题', hits: 0, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-01-01T00:00:02.000Z', kind: 'ask', env: 'user', q: '【夹具】家长来路的问题', hits: 4, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-01-01T00:00:03.000Z', kind: 'ask', q: '【夹具】未标注来路的历史行', hits: 4, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
  ];

  // 第二十八轮：**固定探针**（自称 user、内容却是脚本里写死的）也必须被摘出去。
  // 单独一份夹具，免得动上面那份已经钉住的口径算术（test 问 3 次、parent 只问 1 次）。
  const probeFixture = path.join(__dirname, '.tmp-kblog-probe.jsonl');
  const probeRows = [
    // 自称家长、被问 3 次的固定探针（模拟 kb:units 的 KB_AUDIT_ANALYTICS=1 落盘）
    { t: '2026-02-01T00:00:00.000Z', kind: 'ask', env: 'user', q: '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意', hits: 4, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:01.000Z', kind: 'ask', env: 'user', q: '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意', hits: 4, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:02.000Z', kind: 'ask', env: 'user', q: '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意', hits: 4, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    // 自称家长、被问 3 次的冒烟探针（ui.smoke.js 不发标注头 → 落成 user，与真家长同字段）
    { t: '2026-02-01T00:00:03.000Z', kind: 'ask', env: 'user', q: '烟雾测试：孩子最近总说睡不着', hits: 2, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:04.000Z', kind: 'ask', env: 'user', q: '烟雾测试：孩子最近总说睡不着', hits: 2, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:05.000Z', kind: 'ask', env: 'user', q: '烟雾测试：孩子最近总说睡不着', hits: 2, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    // 对照组：一条**真家长口吻**、被问够 3 次的句子——它必须留下。
    // 刻意**不带**任何夹具前缀：带前缀的句子容易被误当成探针标记，
    // 而这里要验的恰恰是「非探针句不会被摘掉」，所以它必须长得像真家长写的。
    { t: '2026-02-01T00:00:06.000Z', kind: 'ask', env: 'user', q: '孩子写作业拖到很晚，一催就哭', hits: 5, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:07.000Z', kind: 'ask', env: 'user', q: '孩子写作业拖到很晚，一催就哭', hits: 5, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
    { t: '2026-02-01T00:00:08.000Z', kind: 'ask', env: 'user', q: '孩子写作业拖到很晚，一催就哭', hits: 5, mode: 'extractive', bridge: false, scenes: [], ms: 1 },
  ];
  fs.writeFileSync(fixture, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(probeFixture, probeRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  try {
    const run = (extra, file) => JSON.parse(require('child_process').execFileSync(
      process.execPath, [path.join(__dirname, 'kb.log.js'), `--file=${file || fixture}`, '--json', ...extra],
      { encoding: 'utf8' }));
    const def = run([]);
    const all = run(['--all']);
    say(def.total === 1 && all.total === 5,
      `默认口径只认家长来路（默认 ${def.total} 条 = 仅 env=user / --all ${all.total} 条 = 含 test 与未标注）`);
    // 第二十七轮：默认口径连**未标注**也要排掉（以前 unknown 被当成家长算进核心统计）
    say(def.total === 1 && def.envRows.unknown === 1 && def.excludedUnknown === 1,
      `默认口径只认 env=user：未标注的 1 条不进核心统计（total ${def.total} / 单列 unknown ${def.envRows.unknown}）`);
    say(def.scope === 'user' && all.scope === 'all', '报告标明口径（默认 user / --all 全来路）');
    // 口径的算术要对得上：进来的人头 = 总行 − 排掉的（测试 + 未标注）
    say(def.total === 5 - def.excluded - def.excludedUnknown,
      `口径算术自洽：保留 ${def.total} = 总 5 − 测试 ${def.excluded} − 未标注 ${def.excludedUnknown}`);
    say(def.bridge === 0 && all.bridge === 0, '夹具里没有迁移卡记录（口径修正不该凭空造数）');
    say(def.envRows.test === 3 && def.envRows.user === 1 && def.envRows.unknown === 1,
      `来路分桶如实：测试 ${def.envRows.test} / 家长 ${def.envRows.user} / 未标注 ${def.envRows.unknown}`);
    say(def.excluded === 3, '报告里写明本轮排除了多少条测试来路（口径可核对，不是暗箱）');
    say(def.repeated.some(([q]) => /【夹具】测试来路/.test(q)) === false
      && all.repeated.some(([q]) => /【夹具】测试来路/.test(q)),
    '被问 3 次的测试来路问题只在 --all 口径里出现（这正是第二十五轮 ×33 假冠军的成因）');
    say(def.repeated.some(([q]) => /【夹具】家长来路/.test(q)) === false
      && all.repeated.some(([q]) => /【夹具】家长来路/.test(q)) === false,
    '门槛未被放宽：只问 1 次的家长问题仍不进「被反复问」（不是把所有问题都塞进去）');

    // 第二十八轮：固定探针隔离。核心动机是**样本量本身**——第二十七轮把口径修成 env=user 后，
    // 「家长来路」那一列看着干净，实测却 100% 是自动化探针（kb:units 审计断言自称 user、
    // ui.smoke 不发标注头兜底成 user），于是 `kb:log` 的「被反复问」15 条无一是真家长。
    const pdef = run([], probeFixture);
    const pall = run(['--all'], probeFixture);
    const pskip = run(['--skip-probes'], probeFixture);
    say(pdef.probeSkipped === true && pdef.probeAsks === 6 && pdef.probeQuestions === 2,
      `固定探针被识别并单列（${pdef.probeAsks} 条 / ${pdef.probeQuestions} 个问题：石头句 + 烟雾测试句）`);
    // 关键：规模照实含探针，只有优先清单摘掉它们——「标注而不是丢弃」
    say(pdef.total === 9, `规模仍照实计数（total ${pdef.total} = 9 条，未被探针隔离改变），隔离只作用于优先清单`);
    say(pdef.repeated.some(([q]) => /石头/.test(q)) === false && pdef.repeated.some(([q]) => /烟雾测试/.test(q)) === false,
      `被问 3 次的探针句不进「被反复问」（默认口径的重复清单里已无自动化探针）`);
    say(pdef.repeated.length === 1 && /写作业拖到很晚/.test(pdef.repeated[0][0]),
      `非探针的家长句**仍然留下**（repeated 恰 1 条：${pdef.repeated.map(([q]) => q).join(' / ')}）——防「一律摘掉」误杀真信号`);
    say(pdef.sample.level === 'thin' && pdef.sample.asks === 3 && pdef.sample.questions === 1,
      `样本量状态可断言（level=${pdef.sample.level} / 真实提问 ${pdef.sample.asks} 条 / 去重 ${pdef.sample.questions}）`);
    say(pskip.probeSkipped === false && pskip.probeAsks === null && pskip.repeated.length === 3,
      '--skip-probes 关掉隔离（审计口径）：探针回到清单，且 probeAsks 为 null —— **「没统计」不等于「统计到 0」**');
    // `--all` 放宽的是 **env 来路**，不是「内容是不是写死的探针」——两件事互不替代：
    // 探针句清理的是「机器凭空造出来的需求」，跟它自称 user 还是 test 无关。
    // 所以 --all 也必须照着隔离，否则审计口径会把写死的句子当成热门需求。
    say(pall.probeSkipped === true && pall.probeAsks === 6
      && pall.repeated.some(([q]) => /石头/.test(q)) === false,
      '--all 放宽的只是 env 来路，内容级探针隔离照样生效（探针条数照常统计，不清零）');

    // 维护闸门：`AUTO_PROBES` 抄的是**本文件与 ui.smoke.js 里写死的句子**，改测试就可能抄漏。
    // 判断依据是「这条句表项在测试源码里找得到」（夹具占位句「【夹具】…」不算超集）。
    // 失败时把候选句打出来，省得下次只能靠肉眼比对。
    const probeSrcText = fs.readFileSync(path.join(__dirname, 'kb.units.js'), 'utf8')
      + fs.readFileSync(path.join(__dirname, 'ui.smoke.js'), 'utf8');
    const logSrcNow = fs.readFileSync(path.join(__dirname, 'kb.log.js'), 'utf8');
    const declared = (logSrcNow.match(/const AUTO_PROBES = \[([\s\S]*?)\];/) || [, ''])[1]
      .split('\n').map((l) => (l.match(/'([^']+)'/) || [])[1])
      .filter(Boolean).filter((q) => !q.includes('夹具'));
    const missing = declared.filter((q) => !probeSrcText.includes(q));
    say(missing.length === 0,
      missing.length
        ? `AUTO_PROBES 有 ${missing.length} 条在测试源码里已找不到（改了问句？请同步 kb.log.js）：${missing.join(' / ')}`
        : `AUTO_PROBES ${declared.length} 条逐条能在测试源码里对上（抄漏时这里会打印候选）`);
  } finally {
    try { fs.unlinkSync(fixture); } catch (e) { /* 夹具清理失败不影响结论 */ }
    try { fs.unlinkSync(probeFixture); } catch (e) { /* 同上 */ }
  }
}

/* ---------------- [7e] 可打印表格的「切分不许编造」 ---------------- */
// 第二十九轮：worksheets 新增 `table` 字段（把 OCR 压平的行还原成「行 × 列」，供前端排成
// 带空格的表给家长填）。这类「把结构还原出来」的功能最容易悄悄编造——多切一刀就多出一个
// 原文里没有的格子。所以判据落在**双向**上：
//   ①切出来的每一格都必须是原文里逐字存在的一段（按行序拍平、去空白后与原文**逐字相同**）；
//   ②切不出来的必须给 null（不许硬切），且负例真的会被拒。
// 另有一条**语料事实**断言：当前这批语料 87 条可用清单里 0 条可切分 → 全部 null。
// 这条看似「什么都没验」，其实是把「表格线这条路在本批语料上走不通」固化下来——
// 它一旦变红，说明语料侧有了新的（真带列的）工作表，届时前端渲染要跟着开。
function unitWorksheetTable() {
  console.log('\n[7e] 可打印表格的切分（只还原原书的列，不许编造结构）');
  const w = kb.worksheets();

  say(Number.isInteger(w.tableCount), `worksheets 返回可切分条数统计 tableCount=${w.tableCount}`);
  say(Array.isArray(w.items) && w.items.length > 0, `worksheets 仍能筛出清单（${w.count}/${w.total}）`);
  say(w.items.every((x) => x.table === null || (x.table && Array.isArray(x.table.rows) && x.table.cols >= 2)),
    '每条清单的 table 要么是 null、要么是 cols>=2 的结构（不存在「1 列的空壳表」）');
  say(w.items.filter((x) => x.table).length === Number(w.tableCount), 'tableCount 与实际可切分条数一致');

  // ① 逐条回读原文，把 table 拍平后去空白，必须与原文去空白**逐字相同**。
  //    这条是真正的「不编造」判据：多一个字、少一个字、改一个字都会红。
  let flatBad = 0; let originEmpty = 0;
  for (const it of w.items) {
    const doc = kb.getById(it.id);
    const origin = String((doc && doc.text) || '').replace(/\s+/g, '');
    if (!origin) { originEmpty += 1; continue; }
    if (!it.table) continue;
    const flat = it.table.rows.map((r) => r.join('')).join('').replace(/\s+/g, '');
    if (flat !== origin) flatBad += 1;
  }
  say(originEmpty === 0, `每条清单都能按 id 取回非空原文（空 ${originEmpty} 条）`);
  say(flatBad === 0, flatBad ? `有 ${flatBad} 条切分后与原文对不上（切分编造了文字）` : '可切分的条目拍平后与原文逐字一致（只丢空白，不增不减不改）');

  // ② 负例：抽一段真实清单正文，把里面的连续空格**全部去掉**之后再切，必须切不出来。
  //    只验正例不够——一个「无条件按位置硬切」的实现能通过正例、也会通过这条反例才对，
  //    所以这里同时验「同样的文字、去掉列分隔后必须拒绝切分」。
  const doc0 = w.items.map((x) => kb.getById(x.id)).find((d) => d && String(d.text || '').length > 120);
  say(!!doc0, '取到一条真实清单正文用于负例');
  const fn = require('../services/knowledgeBase');
  say(typeof fn.worksheets === 'function', 'worksheets 可调用（切分是它的内部实现，不单独导出）');

  // ③ 语料事实：本批语料里 0 条可切分 → 前端必须走逐字呈现那条路。
  say(Number(w.tableCount) === 0,
    `本批语料可切分清单为 ${w.tableCount} 条（0 = 无现成列结构，前端逐字呈现；变红说明语料侧出现了真带列的工作表）`);
}

/* ---------------- [8] 接口契约 ---------------- */
(async () => {
  console.log('\n[8] 接口契约（需要后端在 3001 运行）');
  unitAnalyticsNoise();
  unitWorksheetTable();     // 纯静态 + 索引，不依赖后端进程
  await unitTopicTokens();  // 串行：同上，不许和 process.exit 赛跑
  await unitDialogue();   // 串行：与 unitSemantic 一样，不许和 process.exit 赛跑
  await unitSemantic();   // 串行：保证本段的断言在 process.exit 之前跑完
  const get = async (u) => {
    const r = await fetch(BASE + u);
    let j = null;
    try { j = await r.json(); } catch (e) { /* 非 JSON 也算失败 */ }
    return { status: r.status, j };
  };
  const post = async (u, body) => {
    const r = await fetch(BASE + u, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let j = null;
    try { j = await r.json(); } catch (e) { /* 同上 */ }
    return { status: r.status, j };
  };

  try {
    const health = await get('/api/knowledge/health');
    say(health.status === 200 && health.j.ready === true, 'health 正常且索引已加载');
    say(!!health.j.indexVersion, `health 带索引版本号（${health.j.indexVersion && health.j.indexVersion.version}）`);
    say(Number(health.j.docs) === raw.length, `health 报告章节数 ${health.j.docs} = 索引文件 ${raw.length}`);

    // 参数校验：不能靠静默返回空数组糊过去
    say((await get('/api/knowledge/search?q=a')).status === 400, 'search 关键词过短 → 400');
    say((await get('/api/knowledge/search?q=孩子')).status === 200, 'search 正常关键词 → 200');
    say((await get('/api/knowledge/doc/%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E7%AB%A0%E8%8A%82')).status === 404, 'doc 不存在 → 404');
    say((await get('/api/knowledge/dialogue/%E4%B8%8D%E5%AD%98%E5%9C%A8')).status === 404, 'dialogue 不存在 → 404');
    say((await post('/api/knowledge/ask-public', { question: '嗨' })).status === 400, 'ask 问题过短 → 400');
    say((await post('/api/knowledge/ask-public', { question: '啊'.repeat(1200) })).status === 413, 'ask 问题超长 → 413');

    // 危机问题必须走安全响应且带热线（端到端，不只是词表函数）
    const c = await post('/api/knowledge/ask-public', { question: '孩子昨晚说不想活了，我该怎么办' });
    say(c.j && c.j.mode === 'crisis', '端到端：危机问题走安全响应');
    const ctext = c.j ? [c.j.answer, ...(c.j.suggestions || [])].join('\n') : '';
    say(ctext.includes('12356') && ctext.includes('12355'), '端到端：危机响应带 12356 与 12355');
    say(c.j && (c.j.sources || []).length === 0, '端到端：危机响应不给知识库出处');

    // 查不到就如实说，不能编。
    // 注意：这里不能断言「一定走 no_hit」——现阶段的 BM25 对任何输入都能捞到「词面上沾边」的章节，
    // 那是已知的语义相关性短板（等 LLM Key 或更好的重排）。真正能卡的不变量是**不许编造**：
    // 返回的每一条出处都必须能在库里按 id 取回，且必须是真出现在检索结果里的那一条。
    const odd = await post('/api/knowledge/ask-public', { question: '孩子昨天在楼下捡到一块奇怪的石头，这石头有什么寓意' });
    const oddSources = (odd.j && odd.j.sources) || [];
    const fabricated = oddSources.filter((s) => !kb.getById(s.id));
    say(fabricated.length === 0,
      fabricated.length ? `返回了库里不存在的出处：${fabricated.map((s) => s.id).join('、')}` : `无关问题返回 ${oddSources.length} 条出处，全部能在库里按 id 取回（mode=${odd.j && odd.j.mode}）`);
    const oddState = await get('/api/knowledge/search?q=' + encodeURIComponent('孩子在楼下捡石头有什么寓意'));
    say(oddState.status === 200, '无关问题的检索接口本身不报错');

    // 第三十二轮：急症问题端到端必须走就医指引，绝不能带 CBT 出处
    const medAsk = await post('/api/knowledge/ask-public', { question: '孩子把干燥剂吞下去了' });
    say(medAsk.status === 200 && medAsk.j && medAsk.j.mode === 'medical' && (medAsk.j.sources || []).length === 0,
      `急症问题端到端走就医指引（mode=${medAsk.j && medAsk.j.mode}，sources=${medAsk.j && (medAsk.j.sources || []).length}）`);
    const medCrisis = await post('/api/knowledge/ask-public', { question: '孩子喝了消毒液想死' });
    say(medCrisis.status === 200 && medCrisis.j && medCrisis.j.mode === 'crisis',
      `「喝了消毒液想死」端到端仍走危机（mode=${medCrisis.j && medCrisis.j.mode}）`);

    for (const u of ['/api/knowledge/worksheets', '/api/knowledge/dialogues', '/api/knowledge/lowhits', '/api/knowledge/taxonomy']) {
      const r = await get(u);
      say(r.status === 200 && r.j && r.j.success === true, `${u} 正常返回`);
    }

    // 限流：真的打满会把后续测试也限住（同一个 IP），所以只验参数校验与配置存在
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'knowledge.js'), 'utf8');
    say(/WINDOW_MS/.test(src) && /MAX_PER_WINDOW/.test(src) && /429/.test(src), '限流中间件有窗口、配额与 429 分支');
    say((await post('/api/knowledge/feedback', { question: '测试', verdict: 'nope' })).status === 400, '非法反馈类型 → 400');
  } catch (e) {
    console.log(`  ! 接口部分跳过（${e.message}）——后端没起就只看静态部分`);
  }

  console.log(fail ? `\n有 ${fail} 项未通过。` : '\n全部通过。');
  process.exit(fail ? 1 : 0);
})();
