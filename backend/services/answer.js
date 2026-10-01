/**
 * 知识库优先回答管线
 * ------------------------------------------------------------------
 * 原则：先查知识库，再谈生成。
 *   1) 危机词命中 → 直接返回安全响应（不走向任何生成模型）
 *   2) 从问题文本推断场景/技术/类型 → 检索知识库
 *   3) 有 LLM Key：把知识库片段作为唯一事实来源交给模型组织语言
 *      无 LLM Key：走抽取式回答，直接引用知识库原句 + 出处
 *   4) 无论哪条路径，都返回 sources（出处列表），前端可展示引用
 */
'use strict';

const kb = require('./knowledgeBase');
const kbFeedback = require('./kbFeedback');

/* --------------------------- 薄场景迁移卡 --------------------------- */

/**
 * 「屏幕与网络依赖 / 注意力与多动 / 对立违抗 / 成长与适应」这几个场景，
 * 在本批成人 CBT 教材里几乎没有专门章节（0~5 段），纯检索给不出可用内容。
 * 知识库侧为它们生成了「迁移卡」：卡里的引文仍取自原书（带出处、可溯源），
 * 「在家可以先做的」由星伴整理并明确标注。这里在启动时读一次，之后常驻内存。
 */
const BRIDGE = (() => {
  try {
    const t = kb.taxonomy();
    return (t && t.bridge) || {};
  } catch (e) {
    return {};
  }
})();

/**
 * 只有「问题的主场景」正好是迁移卡覆盖的场景时才用卡。
 * 卡片是给语料缺口的兜底，不是额外加料：像「发脾气摔东西打人」虽然标签投票
 * 会带上「对立违抗」，但主场景是「愤怒与情绪失控」（51 段、有真内容），
 * 这时再塞一张卡只会把回答稀释掉。
 */
function bridgeSceneOf(intent) {
  const scenes = (intent && intent.scenes) || [];
  return scenes.length && BRIDGE[scenes[0]] ? scenes[0] : null;
}

/* --------------------------- 危机识别 --------------------------- */

// 自杀/自伤 + 伤人两类词。宁可多拦一次，也不能漏掉一次。
const CRISIS_WORDS = [
  // 自杀 / 自伤
  '自杀', '自伤', '自残', '自虐', '轻生', '想死', '不想活', '不想活了', '活不下去',
  '活着没意思', '活着没意义', '活着没劲', '不如死', '死了算了', '一了百了',
  '结束生命', '结束自己', '了结生命', '了结自己', '离开这个世界', '去死',
  '割腕', '割自己', '划自己', '划手腕', '上吊', '吞药', '吞安眠药',
  '伤害自己', '伤害他人', '伤害别人', '自伤行为', '自杀意念', '自杀念头',
  // 自伤的具体动作——家长描述孩子时最常这么写（「拿头撞墙」），不补会漏掉真实的自伤求助
  '撞墙', '撞头', '拿头撞', '打自己', '抓自己', '咬自己', '掐自己', '自残行为',
  // 跳下/坠落
  // 注意：「跳楼」**不在这里**——它是裸词，会把「孩子玩跳楼机很开心」拦成危机。
  // 现在由下面的 JUMP_RE 带否定后顾统一处理（跳楼/跳桥/跳河/跳江/跳湖/跳海/跳井/跳轨）。
  '跳下去', '从楼上跳', '从阳台跳', '高空坠落',
  // 意识异常与急症（本项目硬性要求：意识异常必须走安全响应）
  '意识不清', '意识模糊', '意识丧失', '昏迷', '抽搐', '惊厥', '呼之不应', '昏睡不醒',
  '不认识我',
  // 注意：「叫他没反应／喊他没反应／叫他没有反应」**不在这里**（第三十一轮移出）。
  // 这几个词**方向反了**——它们抓的是「注意力/听觉」场景，而家长说这类话时十有八九是
  // 「上课走神叫他没反应」「玩得入迷喊他没反应」；真正要抓的「叫不醒／叫不应」反而漏了。
  // 现在由下面的 UNRESPONSIVE_RE 带上下文锚定统一处理（叫不醒/叫不应/摇不醒/没有意识…）。
  // 伤人
  // 注意：「杀人」「杀了」「想杀」**不在这里**（第三十一轮移出）——它们是裸词，
  // 会把「在玩杀人游戏」「想杀了那个游戏里的怪物」拦成危机；而这两句恰恰是家长常问的。
  // 现在由下面的 KILL_RE（HURT_RE 里的杀了/杀人/杀掉分支 + 意图+动词+人 分支）带语境统一处理。
  '杀死', '砍死', '捅死', '弄死', '打死', '同归于尽', '报复社会',
];

// 组合式表达（「不想再活了」「死了算了」这类拆不开的）
const CRISIS_RE = /(不想|不愿|别再|再也不想)(再)?活|(死|si)\s*了算了|不如死|去死/;

/* ---- 第三十轮补：家长口语里的自伤/自杀写法（组合式，不用裸词）----
 * 第三十轮用家长口语探针扫出 9 处真实漏网（见开发计划.md 心跳记录）。
 * 它们分三类，补法各不相同——**都不能用裸词**：
 *   ① 裸词缺失（割手／划手臂／跳河／想解脱／结束这一切／让自己消失）：
 *      直接加进 CRISIS_WORDS 会误伤「割手工纸／划手臂橡皮／跳河课文／解脱一下作业压力」，
 *      而误报多了安全提示就没人当回事（与第十三轮「只写药会天天误报」同一道理）。
 *      → 一律做成**上下文锚定**的组合式正则（下面三条）。
 *   ② 药物过量倒装（「把药全吃了」「把整瓶药吞了」）：原正则只认「量词 + 药」，
 *      而家长常把宾語提前。「全/都/精光」本身就是吃光的标志，单独成一条分支。
 *   ③ 拒食拒饮（「不吃不喝好几天」）：严重自伤信号，但**必须带时长**，
 *      否则「孩子最近不爱吃饭」「孩子挑食不吃青菜」天天误报。
 */

// 自伤：身体部位 + 割/划/切（两个方向都认，容纳「把手腕割了」的倒装）。
// 否定后顾 `SELF_HARM_TAIL` 是这里的关键：动作词或部位词后面直接跟具体物
// （工/课/纸/橡皮/布/铅笔…）就说明宾语是那个物，不是在伤害身体。
// 已知代价：极端构造句「孩子在手工课上划手臂橡皮」仍会被拦（「划手臂」字面就是自伤动作，
// 机器无法知道真正的宾语是橡皮）。这**不是真实家长表达**，按「宁可多拦一次」接受。
// 不再往上堆否定后顾——第一版就是这么跑偏的（堆到后来开始吃掉真句子）。
const SELF_HARM_TAIL = '(?!工|课|纸|橡|布|铅|笔|机|游|那|文|水|边|公园)';
// 间隔：不许含「到」——「割到手」是意外划伤（家长担忧句），「割手」才是自伤动作。
// 其余标点照旧排除（不跨句拼接）。
const SELF_HARM_GAP = '[^，。；！？到\\n]{0,4}';
// 部位粒度：**只收典型自伤部位**（手腕/手臂/胳膊/腕），不收「手指/脚趾」。
// 理由：「孩子割破了手指」是削铅笔、剪纸、玩刀时的日常意外（家长常问），
// 而「手指」在自伤里几乎不出现；但单写「手」会被「手指」误命中，所以「手」后面要排除「指」。
// 第三十一轮再加一层：「手」还会被「割到手」误命中，而「我怕他割到手」是**家长的担忧句**
//（怕孩子受伤），不是「孩子自伤」。所以「手」后面也要排除「到」。
const SELF_HARM_BODY = '(手腕|手臂|胳膊|腕|手(?!指|到)|臂)';
const SELF_HARM_RE = new RegExp(
  SELF_HARM_BODY + SELF_HARM_GAP + '(割|划|切)' + SELF_HARM_TAIL
  + '|' + '(割|划|切)[了过]?' + SELF_HARM_TAIL + SELF_HARM_GAP + SELF_HARM_BODY + SELF_HARM_TAIL
);

// 跳河/跳江/跳湖/跳海：与既有「跳楼／跳桥／跳下去」并列的常见写法。
// 同样带否定后顾——「跳河那段课文」「跳河去玩水」不是危机。
// 第三十轮顺带修掉一处**既有的**误报：「跳楼」是裸词，所以「孩子玩跳楼机很开心」一直被拦。
// 「跳楼机／蹦极／跳楼游戏」是有对应否定后顾的，这里把「机／那」这类宾语一并排除。
const JUMP_RE = new RegExp('跳(河|江|湖|海|井|轨|楼|桥)' + SELF_HARM_TAIL);

// 自杀意念的委婉说法：必须在「想／要／打算／不如」之后，且不带「一下」这类弱化词
// （「想解脱一下作业压力」是日常，不是危机）。
const SUICIDE_EUPHEMISM_RE = /(想|要|打算|不如)(解脱|结束这一切|结束一切|让自己消失|消失掉)(?!一下)/;

// 拒食拒饮：必须带时长（好几天／一周／三天以上…），否则与「不爱吃饭／挑食」无法区分。
const REFUSE_FOOD_RE = /不(吃|喝|进食|吃饭|喝水)[^，。；！？\n]{0,4}不(吃|喝)|不(吃|喝)[^，。；！？\n]{0,6}(几|好几天|多天|一周|两周|三天|几天|很长时间)/;

// 药物过量：**必须带量词/程度词**。
// 只写「药」会把「孩子不肯吃药」「孩子最近在吃药」误判成危机——那是最常见的日常说法。
// 三种语序都要认（第三十轮补后两种，此前只认第一种）：
//   ① 量词 + … + 药（+ 动作）   「一整瓶安眠药」「很多药片」
//   ② 药 + … + 量词             「把整瓶药吞了」（宾语提前）
//   ③ 药 + 全/都/精光 + 动作     「把药全吃了」「药都吃了」（全/都本身就是吃光的标志）
//   ④ 动作 + … + 量词 + 药       「吃了很多药片」（动作在最前面，最口语的写法）
const MED_QTY = '(一整瓶|一瓶|整瓶|一整盒|一盒|整盒|半瓶|半盒|一把|一大把|大量|很多|好多|过量)';
const MED_NAME = '(药|药片|药丸|药水|安眠药|退烧药|感冒药|止痛药|镇静剂)';
const MED_ACT = '(吃|吞|喝|服|咽|灌)';
const MED_GAP = '[^，。；！？\\n]{0,4}';
const OVERDOSE_RE = new RegExp(
  MED_QTY + MED_GAP + MED_NAME + '(' + MED_GAP + MED_ACT + '|$)'
  + '|' + MED_NAME + MED_GAP + MED_QTY
  + '|' + MED_NAME + MED_GAP + '(全|都|精光|光)' + MED_GAP + MED_ACT
  + '|' + MED_ACT + '[了过]?' + MED_GAP + MED_QTY + MED_GAP + MED_NAME
);
const OVERDOSE_WORDS = ['服药过量', '药物过量', '过量服药', '吃药过量', '误服药物'];

/* ---- 第三十一轮补：用同一套「家长口语探针」手法扫「伤人」与「意识异常」两面 ----
 * 第三十轮只扫了自伤/自杀/过量/拒食，本轮把剩下两个高风险面补齐。
 * 探针扫出 **13 条伤人漏网 + 13 条意识异常漏网**，另有 **1 处既有误报**。
 * 补法仍是**一条裸词都不加**（裸词会把「拿刀做手工」拦成伤人、「叫他没反应」拦成昏迷）：
 *   ⑤ 伤人 = 「致伤动作 + 伤亡结果/身体要害」或「明确意图 + 致伤手段」，二者都是硬证据。
 *   ⑥ 意识异常 = 必须落在「真的叫不醒/叫不应」上，而不是「没反应」（后者多为注意力场景）。
 *
 * 已显式接受、**故意不拦**的几条（都是「字面像、实际是日常」，误报的代价更高）：
 *   · 「孩子说要报复同学」「孩子说要毁了那个同学」——只有笼统意图、没有致伤手段，多是气话；
 *   · 「孩子打我，打得很凶」——亲子冲突，产品上属于「愤怒与情绪失控」而非危机；
 *   · 「孩子咬了同学一口，都出血了」——幼儿园咬人属行为问题，走常规内容而非安全响应；
 *   · 「孩子拿刀去学校了」——风险很高，但字面判不了意图（也可能是带了手工刀），
 *     按「不凭猜测拦截」留白；家长若补上意图（「要捅同学」）就会被下面的规则接住。
 */

// —— 伤人：两类硬证据 ——
// ① 致伤动作 + 结果/要害：「砸同学的头」「打出血」「掐同学脖子」「推下楼梯」
// ② 意图词 + 致伤手段：「说要毒死」「拿刀威胁」「要捅」「要杀掉」「烧了」
// 否定后顾把「砍价／打死结／杀人游戏／捅娄子／掐架」这类日常词形排除掉。
const HURT_TAIL = '(?!价|折|结|包|听|算|柴|捞|游戏|游戏机|娄子|马蜂窝|架)';
const HURT_GAP = '[^，。；！？\\n]{0,4}';
// 致伤动作（不含「打」「咬」单独成词——那两个日常用法太多，必须带结果）
const HURT_ACT = '(砸|砍|捅|掐|勒|推|踢|踹|扇|摔|扔|泼|扎|割|划|刺|撞|烧|掐住|勒住)';
// 要害部位（头部/颈部/眼睛等，落在这里的动作基本没有日常解释）
const HURT_TARGET = '(脖子|喉咙|头|脑袋|眼睛|眼|太阳穴|后脑|心口|胸口|下体|脸)';
// 伤亡结果（有实际伤害发生）
const HURT_RESULT = '(出血|流血|流血了|打出血|打死|打死结(?!)|昏过去|昏迷|骨折|住院|缝针|留疤|淤青|大片)';
const HURT_INTENT = '(要|想|扬言|打算|准备|威胁|说要|说要)';
const HURT_HOW = '(毒死|烧死|捅死|割喉|砍死|弄死|掐死|勒死|推下|扔下|泼硫酸|下药|安眠药|老鼠药)';

const HURT_RE = new RegExp(
  // ① 致伤动作 + … + 要害          「掐同学脖子」「砸同学的头」
  HURT_ACT + HURT_TAIL + HURT_GAP + HURT_TARGET
  // ①' 致伤动作 + … + 伤亡结果      「把同学打出血了」「踢到骨折」
  + '|' + HURT_ACT + HURT_TAIL + HURT_GAP + HURT_RESULT
  // ①'' 打/咬 + … + 伤亡结果        「打出血」「咬到出血」（把「打/咬」单独放，但必须带结果）
  + '|' + '(打|咬)' + HURT_GAP + HURT_RESULT
  // ② 意图 + … + 致伤手段           「说要毒死同学」「打算推下楼梯」
  + '|' + HURT_INTENT + HURT_GAP + HURT_HOW
  // ②' 拿刀/拿剪刀 + … + 威胁/意图   「拿刀威胁我」「拿剪刀乱挥说要捅人」
  + '|' + '(拿|举|抽出|带)' + '(刀|菜刀|水果刀|美工刀|剪刀|凳子|椅子|棍子|砖头)' + HURT_GAP + '(威胁|要|想|挥|捅|砍|砸)'
  // ②'' 致伤工具 + 致伤动作 + 对象    「用美工刀划同学」「用刀捅同学」
  //     —— 「划/捅」后面接的是**人**（同学/老师/弟弟…），不是纸/橡皮/娄子这类物；
  //     这里用「人」的白名单，避免「用刀划纸」被误拦。
  + '|(用|拿着|举起)?' + '(美工刀|水果刀|菜刀|刀|剪刀|凳子|椅子|棍子|砖头)' + HURT_GAP + HURT_ACT + HURT_TAIL + HURT_GAP
  + '(同学|老师|弟弟|妹妹|哥哥|姐姐|妈妈|爸爸|奶奶|爷爷|别人|人家|他|她)(?!们)'
  // ②''' 把人推/扔/踢下楼梯、推倒（高处坠落，属致命性伤人）
  + '|(把|将|朝)?[^，。；！？\\n]{0,4}(推|扔|踢|踹)下(楼梯|楼|台阶|月子|床|桌子|坡|桥)(?!载)'
  // ②''''' 杀了/杀人：**必须排除游戏与虚构语境**（第三十一轮从裸词改过来）。
  //   家长真实场景：「孩子在玩杀人游戏」「说想杀了游戏里的怪物」「被电影里的杀人镜头吓到」——
  //   这些都不是危机。真正的危机写法是「想杀了那个同学」「说要把我杀了」。
  //   实现：把「杀了/杀人/杀掉」**整句**（到句末标点为止）当窗口，窗口内出现游戏/虚构词就否决。
  //   不能用紧邻后顾——「杀了那个游戏里的怪物」里 `那个` 会把紧邻后顾顶开。
  + '|(杀了|杀人|杀掉)(?![^。；！？\\n]*(游戏|怪物|怪兽|僵尸|boss|电影|电视|书里|小说|情节|片子|角色|妖怪|虫子|蚊子|蟑螂))'
  // ②'''''' 意图 + 致伤动词 + **人**（白名单）：「想杀了那个同学」「说要弄死弟弟」
  + '|(想|要|打算|扬言)' + HURT_GAP + '(杀|弄死|砍死|捅死)(了|掉)?' + HURT_GAP
  + '(同学|老师|弟弟|妹妹|哥哥|姐姐|妈妈|爸爸|奶奶|爷爷|别人|人家|全家|我|他|她)(?!们)'
  // ②''''' 烧了学校/房子（含「了」字，且排除烧饭烧水烧菜）
  + '|烧(了)?(学校|房子|家|屋子|教室|车)(?!饭|水|菜|煤|柴)'
);

// —— 意识异常：必须落在「真的叫不醒 / 叫不应 / 丧失意识」上 ——
// 「叫他没反应／喊他没反应」是**注意力场景**（上课走神、玩得入迷），不能当危机；
// 真正要抓的是「叫不醒 / 摇不醒 / 叫不应」+「昏过去/晕倒/倒地」+「谵妄」。
//
// ★ 关键陷阱①（第三十一轮第一版就在这里翻车，务必记住）：
//   「叫不醒」**不能单独成词**——「孩子早上总是叫不醒，睡得晚」是青少年晚睡的日常表达，
//   直接写成裸词会把**最常见的睡眠问句**整天拦成危机。
//   所以「叫不醒」必须带**时间副词或持续性**（突然/一直/怎么/都/也/摇/拍），
//   或紧跟**外伤/急症语境**（摔到头/发烧/咳/吐）。这与第三十轮「跳楼机」是同一类坑：
//   **高频日常词形必须靠上下文锚定，不能靠词本身**。
// ★ 关键陷阱②：**句内逗号必须允许跨过**（`[^。；！？\n]` 而不是 `[^，。；！？\n]`）。
//   家长常写成「睡觉叫不醒，怎么摇都没反应」「站不稳，说话也含糊」两个短句——
//   排掉逗号就跨不过去，两条真危机当场漏网。但**句末标点必须排除**，
//   否则「叫不醒」会跟下一句的「摇」跨句拼出一个假信号。
//   （与第二轮「出处正则必须贪婪匹配」同一教训：标点不是天然的安全边界。）
const UNRESP_SLEEPY = '(突然|忽然|一下|一直|怎么|怎样|咋|都|也|还|半天|摇|拍|呼唤|叫了)';
const UNRESP_ONSET = '(摔|撞|磕|伤|发烧|发热|高热|惊|抽|吐|中毒|吃药|喝了|吐了)';

const UNRESPONSIVE_RE = new RegExp(
  // ① 时间副词/动作 + 「叫不醒/喊不醒/摇不醒」：「突然叫不醒」「怎么摇都叫不醒」
  UNRESP_SLEEPY + '[^。；！？\\n]{0,6}(叫|喊|摇|拍|呼唤)?不(醒|应|应声)'
  // ①'' 「叫不醒 + 补语」：「睡觉叫不醒，怎么摇都没反应」「叫不醒，摇也没用」
  //      —— 与前一条互补：前一条管「副词在前」，这条管「叫不醒在后带佐证」。
  //      佐证必须是「摇/拍/喊/叫/没用/没反应/不应」这类**施救动作**，
  //      不能是「睡得晚」这种**解释作息**的话（否则又会把晚睡问句拦进来）。
  + '|(叫不醒|喊不醒|摇不醒)[^。；！？\\n]{0,12}(摇|拍|喊|叫|推|掐|折腾|没用|不管用|没反应|没应|也不醒|也叫不动|都叫不动)'
  // ①' 外伤/急症语境 + 「叫不醒/想睡」：「摔到头之后一直想睡，叫不醒」
  //    （「摔到头之后叫不醒」是颅内出血的典型家长描述，最不能漏的一类）
  + '|' + UNRESP_ONSET + '[^。；！？\\n]{0,10}不(醒|应)'
  + '|' + UNRESP_ONSET + '[^。；！？\\n]{0,10}(一直想睡|老想睡|昏睡|睡不醒|嗜睡)'
  // ② 昏过去/晕倒/倒地/昏睡（意识丧失本身就没有日常解释）
  + '|(昏过去|昏了过去|晕过去|晕倒|昏倒|昏睡过去|躺在地上一动不动|倒在地上不动|倒在地上一动不动|倒地不起|失去意识|意识丧失)'
  // ③ 翻白眼（抽搐与晕厥征象，本身无日常解释）
  + '|(翻白眼|眼睛上翻|眼珠上翻)'
  // ③' 眼神发直/涣散：**必须带急性语境**——「上课眼神发直，走神了」是注意力问题，
  //    而「突然眼神发直叫不应」才是意识异常。只跟「发直/涣散」会误伤走神场景。
  + '|(突然|忽然|一下|叫他|喊他|叫不应|叫没反应)[^。；！？\\n]{0,6}(眼神发直|眼神涣散|目光呆滞|两眼发直)'
  + '|(眼神发直|眼神涣散|目光呆滞|两眼发直)[^。；！？\\n]{0,6}(叫不应|叫不醒|没反应|倒地|抽搐|口吐)'
  // ④ 谵妄（意识模糊导致说胡话）：**必须带发热/急症语境**，
  //    「孩子说胡话的时候是在编故事」不是危机。
  + '|(发烧|发热|高热|烧到|烧得|中毒|吃了药|住院|昏迷|抽搐)[^。；！？\\n]{0,8}(说胡话|胡言乱语|胡话)'
  + '|(说胡话|胡言乱语)[^。；！？\\n]{0,6}(叫不应|叫不醒|没反应|不认识|意识)'
  + '|(神志不清|意识模糊|意识不清|意识混乱|意识有点乱|说话不搭)'
  // ⑤ 不认识人 / 认不出（谵妄或神经系统事件）
  + '|(不认识人|认不出人|不认识我了|突然不认识|不认识妈妈|不认识爸爸)'
  // ⑥ 站不稳 + 说话含糊（神经系统征象，须两项同现；中间可隔一个逗号）
  + '|站不稳[^。；！？\\n]{0,8}(说话|讲话|口齿|含糊|不清)'
);

/* ---------------- 急症 / 意外伤害识别（第三十二轮） ----------------
 * 第三十一轮留了 8 条「急症/误吞/外伤」探针（烫伤/摔落/吞干燥剂/喝消毒液/被狗咬/吐血…）
 * 未处理。实测这 8 条在旧版里 **7 条直接走进抽取路径、还挂着 CBT 出处**
 *（「孩子把干燥剂吞下去了」→ 引用「焦虑与恐惧」）——检索器只会把问题往 18 个
 * 心理场景上靠，急症问题必然挂错内容。这是诚实性与安全性双输。
 *
 * ★ 产品决策（第三十一轮留白、本轮敲定）：**不并入危机词表，单独走「就医指引」**。
 *   理由：危机响应的正文（和孩子谈自伤念头、安全计划、12356/12355 心理热线）
 *   对「吞了干燥剂」完全不适用——家长此刻需要的是 120/急诊，不是心理热线；
 *   混进危机词表还会让它的语义失真（该词表及其测试就是按心理危机组织的）。
 *   共享的纪律照旧：不提供生成式建议、不出知识库引用（教材不是急救手册）。
 *
 * ★ 与危机词表的关系：**危机先判、急症后判**（answerInner 里的顺序就是语义）。
 *   「喝了消毒液想死」字面既是误服又是自杀意念 → 危机优先（自伤重于意外）；
 *   「摔到头之后叫不醒」在第三十一轮已由 UNRESPONSIVE_RE 的外伤急症语境接管，维持危机。
 *   因此急症规则只接危机词表**没有**接住的那部分意外伤害。
 *
 * ★ 补法沿用第三十/三十一轮的铁律：**一条裸词都不加**，全部上下文锚定：
 *   ① 误吞/误服：动词（吞/咽/喝/吃/含，含误吞/误服）+ 封闭的危险品名词表，
 *      两个语序都收（动宾序「吞了干燥剂」/ 把字序「把干燥剂吞下去」）。
 *      名词表**不含「药」**——「不肯喝药」「在吃感冒药」是日常，药物过量另有危机规则管；
 *      动词表**不含装/钉/递/按/摘**——「把电池装进遥控器」「把钉子钉进泡沫板」不是急症。
 *   ② 烫伤/烧伤：只要**事件形**（烫伤了/烫到着了/被开水烫/热油溅）或**急症问句**
 *      （烫伤怎么办）。预防问句「怎么预防烫伤」「怕烫到孩子」没有事件形、也没有急症
 *      问句，天然不中；「烫伤膏」用「了|怎么办」结构排除（膏 不是事件标记）。
 *   ③ 动物咬伤：被 + 动物 + 咬 + **结果标记**（了/破/伤/出血）。结果标记必须有——
 *      「我怕孩子被狗咬」是担忧句（与第三十一轮「我怕他割到手」同类）。
 *   ④ 严重出血：流血不止/一直在流血 这类**持续或不可止**表达；「磕破皮流了点血」
 *      是轻症不拦——全拦会把产品变成儿科急诊分诊台，且轻症确实不需要。
 *   ⑤ 咯血/呕血/便血/尿血：「吐血」用否定后顾排掉「(气)得吐血 / 快气吐血」
 *      这类家长自述的夸张用法。
 *   ⑥ 严重坠落：从（楼上/高处/窗台/阳台/楼梯/车…）摔/跌/掉/坠 下来。
 *      **「从床上摔下来」刻意不拦**：婴幼儿家长最常见的日常问题，绝大多数无恙，
 *      且头部撞击后意识异常已由危机词表接管（UNRESP_ONSET 的摔/撞分支）。
 *      ——诚实边界：这是召回面收窄的取舍，见 kb.units [3b] 的 safe 表。
 */
const MEDICAL_INGEST = '(干燥剂|干燥珠|纽扣电池|电池|磁力珠|磁铁|水宝宝|水精灵|樟脑丸|消毒液|漂白水|漂白剂|洗涤剂|清洁剂|洗衣液|洗洁精|柔顺剂|杀虫剂|杀虫喷雾|驱蚊液|花露水|老鼠药|蟑螂药|农药|敌敌畏|温度计|水银|玻璃珠|图钉|缝衣针|别针|回形针|曲别针|硬币|戒指|螺丝|钉子|打火机|烟头|香烟|指甲油|卸甲水|香水|化妆品|化妆水|口红|酒精|煤油|汽油|机油|风油精|清凉油)';
const MEDICAL_ANIMAL = '(狗|猫|蛇|老鼠|野狗|野猫|流浪狗|流浪猫|马蜂|蜜蜂|蝎子|蜈蚣)';

const MEDICAL_RE = new RegExp(
  // ① 误吞/误服（动宾序 + 把字序）
  '(吞|咽|喝|吃|含|误吞|误服)[^。；！？\\n]{0,4}' + MEDICAL_INGEST
  + '|把[^。；！？\\n]{0,6}' + MEDICAL_INGEST + '[^。；！？\\n]{0,6}(吞|咽|喝|吃|含|塞|放)(进|到|入|下|嘴)?'
  // ② 烫伤/烧伤（事件形或急症问句；预防问句/烫伤膏不中）
  + '|烫(伤|到|着)(了|[^。；！？\\n]{0,6}(怎么办|怎么处理|咋办|要紧|严重|急救))'
  + '|烧伤了|被[^。；！？\\n]{0,8}(开水|热水|热汤|热油|蒸汽|油锅|火)[^。；！？\\n]{0,4}(烫|烧|溅)'
  // ③ 动物咬伤（必须带结果标记）
  + '|被[^。；！？\\n]{0,6}' + MEDICAL_ANIMAL + '[^。；！？\\n]{0,4}咬(了|破|伤|到|穿|出血|流血)'
  // ④ 严重出血（持续/不可止）
  + '|(流血不止|血流不止|出血不止|止不住血|血止不住|大量出血|一直在流血|流了好多血|流了很多血)'
  // ⑤ 内出血征象（排掉「气得吐血」的夸张用法）
  + '|(?<!气)(?<!得)(吐|呕|咳|咯)[^。；！？\\n]{0,4}血'
  + '|(便血|血便|黑便|尿血)'
  // ⑥ 严重坠落（低处坠落刻意不拦，见头部注释）
  + '|从[^。；！？\\n]{0,4}(楼上|高处|窗台|阳台|二楼|三楼|四楼|五楼|楼梯|自行车|电动车|摩托|汽车|车窗|护栏|桥上)[^。；！？\\n]{0,6}(摔|跌|掉|翻|坠)(了)?(下|下来|下去)'
);

function medicalHit(text) {
  const m = String(text || '').match(MEDICAL_RE);
  return m ? m[0] : null;
}

function medicalResponse(question, intent) {
  const hit = medicalHit(question);
  return {
    grounded: true,
    mode: 'medical',
    intent: intent || null,
    medicalWord: hit,
    answer: [
      '你描述的情况属于**意外伤害/急症**，需要的是急救处置——知识库里的 CBT 方法帮不上这个忙，星伴也不提供医疗建议。请立刻做两件事：',
      '',
      '**第一，马上就医。** 拨打 **120** 急救电话，或直接带孩子去最近医院的**急诊科/儿外科**；说清事情经过、发生时间和孩子的年龄体重。如果是误吞、误服，把**包装、说明书或残留物**一起带上给医生看。',
      '',
      '**第二，听专业人员的指示。** 在 120 调度员或医生明确指示之前，不要自行催吐，不要自行用药或处理伤口。',
      '',
      '**事后：** 孩子受了惊吓、家长后怕，都是常见反应。等医生处理完、孩子平稳下来，欢迎回到星伴，我们陪你聊怎么安抚孩子、怎么跟孩子谈这次经历。如果发现这次受伤可能是孩子自己弄伤自己，请立即按自伤处理：拨打 **12356**，并尽快到精神科就诊。',
      '',
      '> 说明：以上只是就医指引，不是医疗处置意见，一切以急救人员和医生的现场判断为准。',
    ].join('\n'),
    suggestions: [
      '孩子受惊吓后，家长怎么安抚？',
      '怎么跟孩子聊这次意外？',
    ],
    sources: [],
    notice: `检测到「${hit}」这类意外伤害/急症表述，已切换为就医指引：星伴不提供医疗建议，也不引用知识库。`,
  };
}


function crisisHit(text) {
  const q = String(text || '');
  // 带「否定后顾」的组合式规则必须先跑：它们要能**否决**裸词表里的宽词。
  // 例：「跳楼」在 CRISIS_WORDS 里是裸词，但「玩跳楼机」不是危机——
  // 若先跑裸词循环就直接命中了，后面的 JUMP_RE 再准也没机会说话。
  // 第三十一轮把 HURT_RE / UNRESPONSIVE_RE 也放在前面：它们同样带否定后顾
  //（「砍价／打死结／杀人游戏」；「叫不醒」与「没反应」的区分也靠上下文锚定）。
  const jp = q.match(JUMP_RE);
  if (jp) return jp[0];
  const hu = q.match(HURT_RE);
  if (hu) return hu[0];
  const ur = q.match(UNRESPONSIVE_RE);
  if (ur) return ur[0];
  for (const w of CRISIS_WORDS) if (q.includes(w)) return w;
  const m = q.match(CRISIS_RE);
  if (m) return m[0];
  const sh = q.match(SELF_HARM_RE);
  if (sh) return sh[0];
  const eu = q.match(SUICIDE_EUPHEMISM_RE);
  if (eu) return eu[0];
  const rf = q.match(REFUSE_FOOD_RE);
  if (rf) return rf[0];
  const d = q.match(OVERDOSE_RE);
  if (d) return d[0];
  for (const w of OVERDOSE_WORDS) if (q.includes(w)) return w;
  return null;
}

function isCrisis(text) {
  return !!crisisHit(text);
}

function crisisResponse(question, intent) {
  const hit = crisisHit(question);
  return {
    grounded: true,
    mode: 'crisis',
    intent: intent || null,
    crisisWord: hit,
    answer: [
      '你提到的内容需要立刻得到真人支持，这不是可以慢慢商量的事。请先做下面三件事：',
      '',
      '**第一，确保安全。** 如果孩子或你本人正处于危险中，请立刻拨打 120（急救）或 110（警察）；把刀具、绳索、药品等可能造成伤害的物品移开，并且不要让孩子独处。',
      '',
      '**第二，打热线。** 24 小时免费，接听的是受过危机干预训练的人：',
      '- **12356**　全国统一心理援助热线（国家卫健委设立，任何地区直拨，不加区号）',
      '- **12355**　青少年心理咨询与法律援助热线（共青团中央设立，专门面向青少年，微信小程序「青听益站」也可 24 小时留言）',
      '- **12338**　妇女儿童维权服务热线（涉及家庭暴力、监护侵害时用）',
      '',
      '**第三，尽快线下就诊。** 到当地精神卫生中心或三甲医院精神科/心理科挂号，做一次正式的风险评估。有自伤自杀风险时，必须由专业人员介入，任何自助练习都不能替代这一步。',
      '',
      '**在等待专业帮助的这段时间里，你可以做的：**',
      '- 用平静、不评判的语气直接问：「你最近是不是很难受，难受到想要结束这一切？」直接问不会把孩子推向危险，反而常常让他松一口气。',
      '- 听完之后先不急着讲道理、不急着找原因，只回应感受：「我在，我陪着你。」',
      '- 和孩子一起写一份安全计划：出现念头时可以打给谁、可以去哪里、可以先做什么。写下来放在他够得到的地方。',
      '- 接下来 72 小时尽量陪伴，减少独处时间，暂时收起可能造成伤害的物品。',
      '',
      '> 说明：以上是安全应对提示，不是诊断。请以专业人员的面谈评估为准。',
    ].join('\n'),
    suggestions: [
      '和孩子谈自伤念头时，具体要怎么开口？',
      '安全计划应该包含哪些内容？',
      '孩子情绪稳定后，家长还需要注意什么？',
    ],
    sources: [],
    notice: `检测到「${hit}」这类危机相关表述，已切换为安全响应，不提供生成式建议。`,
  };
}

/* --------------------------- 主入口 --------------------------- */

/**
 * @param {string} question 家长/用户的自然语言问题
 * @param {object} [ctx] 上下文：{ age, gender, diagnosis, tags:[], childOnly, top }
 * @returns {Promise<object>}
 */
async function answerInner(question, ctx = {}) {
  const q = String(question || '').trim();
  if (!q) {
    return { grounded: false, mode: 'empty', answer: '请先描述一下你遇到的情况。', sources: [], suggestions: [] };
  }

  // 意图识别对所有问题都做——包括危机问题，方便前端按场景展示相关信息
  const intent = kb.analyzeQuestion(q);
  // 顺序即语义：危机先判（自伤/自杀/伤人/意识异常/药物过量优先于意外——
  // 「喝了消毒液想死」必须走危机响应），急症后判（只接危机词表没接住的意外伤害）。
  if (isCrisis(q)) return crisisResponse(q, intent);
  if (medicalHit(q)) return medicalResponse(q, intent);

  // 走 searchAsync：先算查询向量，语义层负责重排；关键词召回不足时才会用语义补位。
  // 这里**不再显式传 intent.scenes**：search() 内部本来就会合并 analyzeQuestion 推断出的场景
  //（实测两种写法结果逐条一致），显式传反而会把「场景是自动推断的」这个信息抹掉，
  // 语义开口（injectSemanticEscapes）就不再生效——那条路正是用来救「场景标签缺失」的章节的。
  const hits = await kb.searchAsync(q, {
    ...(ctx.scenes ? { scenes: ctx.scenes } : {}),
    techs: ctx.techs || [],
    types: ctx.types || [],
    // 儿童内容默认「优先」而非「只要」：全库仅 66 篇带儿童标注，硬过滤会大量丢召回
    childOnly: ctx.childOnly === true,
    top: ctx.top || 8,
    maxChars: 1200,
  });

  // 薄场景迁移卡：屏幕与网络依赖、注意力与多动、对立违抗、成长与适应
  // 这几个场景在这批成人教材里几乎没有专门章节，光靠检索给不出内容。
  // 主场景命中这类场景时改走迁移卡（引文仍来自原书、照样标出处），
  // 而不是回一句「知识库里没有相关内容」。
  const bridgeScene = bridgeSceneOf(intent);
  const card = bridgeScene ? BRIDGE[bridgeScene] : null;
  const bridgeDocs = card
    ? (card.docIds || []).map((id) => kb.getById(id)).filter(Boolean)
    : [];

  const sources = hits.map((h) => ({
    id: h.id, title: h.heading, source: h.source, kind: h.kind,
    scenes: h.scenes, techs: h.techs, types: h.types, score: h.score,
    scanQuality: h.scanQuality || 'normal',
  }));
  for (const d of bridgeDocs) {
    if (!sources.some((s) => s.id === d.id)) {
      sources.push({ id: d.id, title: d.heading, source: d.source, kind: d.kind,
        scenes: d.scenes, techs: d.techs, types: d.types, score: null, viaBridge: true,
        scanQuality: d.scanQuality || 'normal' });
    }
  }

  if (!hits.length && !bridgeDocs.length) {
    return {
      grounded: false,
      mode: 'no_hit',
      answer: [
        '知识库里暂时没有和这个问题直接对应的内容。',
        '',
        '你可以换一种说法，或者补充这些信息，我再查一次：',
        '- 孩子的年龄，以及这件事大概从什么时候开始',
        '- 出现的时候具体是什么样子（说了什么、做了什么、持续多久）',
        '- 通常在什么情境下发生（写作业、出门、睡前、和同学相处）',
        '- 之前试过什么办法，效果怎么样',
      ].join('\n'),
      intent,
      sources: [],
      suggestions: suggestByTags(intent),
    };
  }

  const llm = llmConfig();
  if (llm) {
    try {
      const text = await callLLM(q, hits, ctx, llm, card);
      return { grounded: true, mode: 'llm', answer: text, intent, sources,
        suggestions: suggestByTags(intent), model: llm.model, bridge: bridgeScene || null };
    } catch (e) {
      // 模型不可用时降级为抽取式，绝不返回空
      const ext = composeExtractive(q, hits, intent, card);
      return { grounded: true, mode: 'extractive_fallback', answer: ext.text, intent, sources,
        suggestions: suggestByTags(intent), bridge: bridgeScene || null, dialogue: ext.dialogue,
        notice: `生成模型调用失败，已改用知识库原文回答（${e.message}）` };
    }
  }

  const ext = composeExtractive(q, hits, intent, card);
  return {
    grounded: true,
    mode: 'extractive',
    answer: ext.text,
    intent,
    sources,
    suggestions: suggestByTags(intent),
    bridge: bridgeScene || null,
    dialogue: ext.dialogue,
  };
}

/**
 * 对外入口：包一层埋点。
 * 埋点只记「问题 + 命中条数 + 走的哪条路」，一是不能让埋点失败影响回答，
 * 二是要能回答「哪些问题问得多、却总捞不到东西」——那是补语料和调权重的依据。
 */
async function answer(question, ctx = {}) {
  const t0 = Date.now();
  let out;
  try {
    out = await answerInner(question, ctx);
  } catch (e) {
    try { kbFeedback.recordAsk({ question, hits: 0, mode: 'error', ms: Date.now() - t0 }); } catch (_) { /* 忽略 */ }
    throw e;
  }
  try {
    kbFeedback.recordAsk({
      question,
      hits: (out.sources || []).length,
      mode: out.mode,
      bridge: !!out.bridge,
      scenes: (out.intent && out.intent.scenes) || [],
      ms: Date.now() - t0,
      // 请求级来路（路由从 x-kb-analytics-env 头带进来）：不传时由埋点层按进程判断
      env: ctx && ctx.analyticsEnv,
    });
  } catch (_) { /* 埋点失败不影响回答 */ }
  return out;
}

/* ------------------------- 抽取式回答 ------------------------- */

const TYPE_ORDER = [
  { key: '评估与个案概念化', title: '先搞清楚是怎么回事' },
  { key: '理论与模型', title: '背后通常是这样运作的' },
  { key: '练习与作业', title: '可以带着孩子一起做的练习' },
  { key: '工具表单与工作表', title: '可以直接用的表格/清单' },
  { key: '对话示例与逐字稿', title: '教材里的问与答（参考）' },
  { key: '案例与故事类比', title: '换个说法讲给孩子听' },
  { key: '常见问题与误区', title: '容易踩的坑' },
];

// 「怎么做」类问题优先给可操作内容；「为什么」类问题优先给机制解释
const ACTION_ORDER = ['练习与作业', '工具表单与工作表', '对话示例与逐字稿',
  '案例与故事类比', '评估与个案概念化', '常见问题与误区', '理论与模型'];
const WHY_ORDER = ['理论与模型', '评估与个案概念化', '案例与故事类比',
  '常见问题与误区', '练习与作业', '工具表单与工作表', '对话示例与逐字稿'];

function slotOrder(intent) {
  const keys = intent === 'action' ? ACTION_ORDER : WHY_ORDER;
  const map = Object.fromEntries(TYPE_ORDER.map((t) => [t.key, t.title]));
  return keys.map((k) => ({ key: k, title: map[k] }));
}

// 一条回答最多引这么多句，超出就砍掉最弱的小节
const MAX_BULLETS = 10;
const SENT_SPLIT = /(?<=[。！？；])/;
// 带「可操作性」的句子更容易是干货
const ACTION_HINT = /(可以|建议|试着|方法|步骤|练习|记录|表格|问自己|想一想|帮助|技巧|注意|需要|应该|例如|比如|当.{1,8}时|首先|然后)/;
// 明显的噪声句：页码、引用、目录残片
const NOISE = /(^\s*[·\-—\d\s]{1,12}$|\.{3,}|^\s*(图|表|注)\s*\d|^\s*第[一二三四五六七八九十百零〇\d]{1,4}[章节页])/;

/* ---- 语境判定：这句是成人个案原文，还是能直接讲给家长听？ ---- */

// 语境判定与改写规则统一放在 services/adultContext.js（唯一实现），
// 因为「示范对话」页也要用同一套改写，两处各写一份必然漂移。
const { ADULT_WORDS, CHILD_WORDS, ADULT_SWAP, adultLevel, softenAdultContext } = require('./adultContext');

/**
 * 中文正文里「汉字 + 空格 + 汉字」的空格几乎都是 OCR 断行残留（「这 一大堆」「8小 时」），
 * 直接收紧。用零宽断言避免一次替换吃掉相邻匹配。
 */
function tightenCjk(s) {
  return String(s)
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/\s+([，。！？；：、）】》」”])/g, '$1')
    .replace(/([（【《「“])\s+/g, '$1')
    .trim();
}

/** 引号是否配对——不配对的说明这句是被切断的片段 */
function quotesBalanced(s) {
  const dq = (s.match(/[“”]/g) || []).length;
  const bk = (s.match(/[「」]/g) || []).length;
  return dq % 2 === 0 && bk % 2 === 0;
}

/**
 * 表格 / 清单被 OCR 压成一整行后的残片，读起来是断词堆叠而不是句子。
 * 例：「发展出高标准 寻找缺点并改正 工作非常劳力 避免寻求帮助 过度准备 情境1」
 */
function isFragment(s) {
  if (/(\S{1,10}[ \t]+){3,}\S{1,10}/.test(s)) return true;   // 三个以上短片段用空格串起来
  const seen = new Map();
  for (let i = 0; i + 4 <= s.length; i++) {
    const g = s.slice(i, i + 4);
    const c = (seen.get(g) || 0) + 1;
    if (c >= 3) return true;                                  // 同一词组重复 3 次以上
    seen.set(g, c);
  }
  return false;
}

/* ---- 沾边自查：答不上来就直说，别拿不相关的内容凑数 ---- */

// 提问里出现这些词不算话题词，否则任何句子都会被判为沾边
const TOPIC_STOP = new Set(['孩子', '怎么办', '怎么', '我们', '什么', '时候', '一个', '就是', '不是',
  '可以', '他们', '自己', '这个', '那个', '因为', '所以', '已经', '还是', '或者', '如果',
  '为什么', '最近', '有点', '总是', '一直', '起来', '不会', '没有', '很想', '真的',
  '老师', '家长', '父母', '爸爸', '妈妈', '同学', '大家', '觉得', '感觉', '开始', '一点',
  // 疑问/功能词补充（实测漏掉它们会让越界问法凑出假交集）：
  // 「如何用 Excel 做数据透视表」里的「如何/何用」、「今天天气怎么样」里的「今天」过去都算话题词，
  // 于是这两条越界问法靠二字交集漏出了引用句。这类词在家长提问里从不承担话题，去掉不影响真问题。
  // 注意：这张表**只按二字键查**（二字词过滤 + 三字词的首二字/末二字过滤），
  // 所以只能放二字词；「怎么样」这类三字疑问词靠其首二字「怎么」拦下，不必单列。
  '如何', '何如', '何用', '怎样', '怎办', '多少', '多久', '几点', '哪里', '哪儿', '哪个',
  '哪些', '是否', '今天', '明天', '昨天', '现在', '后来', '然后', '其实', '好像',
  '似乎', '还有', '另外', '顺便', '一般', '通常', '大概', '可能', '应该', '需要']);

/**
 * 提问的话题词。
 *
 * **必须同时产出二字词与三字及以上的「具体词」**：下游 pickSentences() 与
 * pickDialogue() 的相关度闸门都是「命中一个 ≥3 字的具体词，或命中两个以上词」——
 * 只给二字词的话，`mLong` 恒为 0，「具体词」这半条判据等于从未生效，
 * 闸门实际退化成「必须凑够两个二字交集」，既容易因切碎的字面凑巧命中而误放
 * （「如何/何用」这种），又容易在短句上一条都取不到（实测「孩子老跟我对着干，
 * 故意不写作业」8 章引用句 0 条）。三字词要长得多，凑巧命中的概率显著更低。
 *
 * 三字词只保留「首二字与末二字都不在停用词表里」的那些：
 * 「如何用」首二字是「如何」→ 丢掉；「对着干」「写作业」→ 留下。
 */
function topicTokens(q) {
  const out = new Set();
  for (const run of String(q || '').match(/[\u4e00-\u9fff]{2,8}/g) || []) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const g = run.slice(i, i + 2);
      if (!TOPIC_STOP.has(g)) out.add(g);
    }
    for (let i = 0; i + 3 <= run.length; i++) {
      const g = run.slice(i, i + 3);
      if (TOPIC_STOP.has(g.slice(0, 2)) || TOPIC_STOP.has(g.slice(1))) continue;
      out.add(g);
    }
  }
  return [...out];
}

function isOnTopic(sent, toks) {
  for (const t of toks) if (sent.includes(t)) return true;
  return false;
}

/**
 * 从章节正文里挑最能回答问题的句子。
 * @param {boolean} allowAdult  允许成人个案原句（会做家庭语境改写）
 * @param {boolean} requireMatch 是否要求句子至少落在问题的一个关键词上
 * @param {string}  qText       提问原文。用来区分「问题里真有的词」与「topicTokens 切碎的字面」，
 *                              兜底判据只认前者（见函数内注释）。缺省时退化为只认 qTokens。
 * @returns {{t:string, soft:boolean}[]} soft=true 表示做过家庭语境改写
 */
function pickSentences(text, qTokens, limit = 3, maxLen = 260, allowAdult = false, requireMatch = true) {
  const sents = String(text).split(SENT_SPLIT)
    .map((s) => tightenCjk(s.replace(/\s+/g, ' ')))
    .filter((s) => s.length >= 10 && s.length <= 200 && !NOISE.test(s) && !isFragment(s)
      && quotesBalanced(s));
  if (!sents.length) return [];

  const scored = sents.map((s, idx) => {
    let sc = 0;
    let m = 0;                                       // 命中问题关键词的次数
    let mLong = 0;                                   // 其中长度 ≥3 的（更长 = 更具体）
    for (const t of qTokens) {
      if (t.length > 1 && s.includes(t)) {
        sc += t.length * 1.5;
        m++;
        if (t.length >= 3) mLong++;
      }
    }
    if (ACTION_HINT.test(s)) sc += 3;                // 可操作句加分
    if (/[：:]/.test(s) && s.length <= 60) sc -= 1;  // 短标题式残片减分
    if (/[？?]\s*$/.test(s)) sc -= 2.5;              // 反问句不是做法，压一压
    // 面向家长：带儿童/家庭语境的句子加分，纯成人个案语境的重罚
    const { ad, ch } = adultLevel(s);
    if (ch) sc += 2.5;
    if (ad && !ch) sc -= 14;
    else if (ad) sc -= 2.5;
    sc -= idx * 0.05;                                // 同分时更靠前的优先
    return { s, sc, ad, ch, m, mLong };
  });
  scored.sort((a, b) => b.sc - a.sc);

  const out = [];
  let len = 0;
  for (const it of scored) {
    // 只命中一个二字词的句子很容易是巧合（问考试紧张，引到「心脏病人紧张」），
    // 所以要么命中一个三字以上的具体词，要么命中两个以上词。
    const primary = it.mLong >= 1 || it.m >= 2;
    if (requireMatch && !primary) continue;
    const adultOnly = it.ad > 0 && it.ch === 0;
    if (adultOnly && !allowAdult) continue;          // 第一遍：丢掉纯成人语境句
    // 只要句子里有成人词就改写（哪怕是混合语境），否则「治疗师」会直接露给家长
    const soft = it.ad > 0;
    const t = soft ? tightenCjk(softenAdultContext(it.s)) : it.s;
    if (out.some((o) => o.t === t)) continue;
    if (len + t.length > maxLen && out.length) break;
    out.push({ t, soft });
    len += t.length;
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 渲染一张迁移卡。引文逐条带出处，落地做法单独标注为星伴整理。
 * @returns {boolean} 是否真的输出了内容
 */
function renderBridge(card, lines, used, usedHits) {
  const quotes = card.quotes || [];
  if (!quotes.length) return false;
  lines.push('### 这类问题可以先用的一般方法');
  lines.push('');
  if (card.导语) {
    lines.push(`> ${card.导语}`);
    lines.push('');
  }
  const themes = new Map();
  for (const q of quotes) {
    const k = q.主题 || '一般方法';
    if (!themes.has(k)) themes.set(k, []);
    themes.get(k).push(q);
  }
  for (const [theme, arr] of themes) {
    lines.push(`**${theme}**`);
    for (const q of arr) {
      const doc = kb.getById(q.id);
      const cite = (doc && doc.citation) || '';
      lines.push(cite ? `- ${q.text}（出处：${cite}）` : `- ${q.text}`);
      if (doc && !used.has(doc.id)) {
        used.add(doc.id);
        usedHits.push(doc);
      }
    }
    lines.push('');
  }
  const acts = card.落地 || [];
  if (acts.length) {
    lines.push('**在家可以先做的**（下面是星伴按上面的通用方法整理的，不是原书原文）');
    lines.push('');
    acts.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }
  if (card.边界) {
    lines.push(`> **什么情况要找专业人员：**${card.边界}`);
    lines.push('');
  }
  return true;
}

/* ---------------- 回答里挂一段教材对话（P4：家长要的是「我该怎么说」） ---------------- */

/**
 * 第二十轮的埋点报告：7 次「没帮助」的留言全是「没讲怎么做」，另一条命中 13 条
 * 出处的留言是「没讲具体怎么说」——家长要的不是「哪些章节讲了这件事」，
 * 而是「我该怎么说」。做法：在引用章节之外，再挂一段**同场景**的教材对话原文。
 *
 * 红线（与第九轮「示范对话」页一致）：
 *   - 只呈现教材原文（称谓按 adultContext 的唯一实现做家庭语境改写），不生成话术；
 *   - 定位写明是治疗室示范、供参考，**不是照着念的话术模板**——
 *     这批对话 70/72 是成人治疗室逐字稿，包装成家庭话术等于教家长去审问孩子。
 * 复用第九轮筛好的 65 条 dialogues，不另起一套筛选口径。
 */

// 摘录按「说话人：」切轮次。称谓是改写后的（咨询师→心理老师、来访者/患者→孩子），
// 这里只列改写后可能出现的标签；认不出的说话人会并进上一轮，不影响诚实性。
// 注意：不能用「零宽前瞻 + split」切——「老师：」也会在「心理老师：」的内部命中，
// 把「心理」单独切出去（否定后顾也救不了：内部那个位置的前一个字是「理」不是「心」）。
// 改用 matchAll 拿轮次起点：匹配会被整体消费，内部位置根本不会被再测一次。
const TURN_RE = /(?:心理老师|老师|孩子|家长|妈妈|爸爸|医生|儿童|学生|另一半|家人)[：:]/g;
const TURN_RE_TEST = /^(?:心理老师|老师|孩子|家长|妈妈|爸爸|医生|儿童|学生|另一半|家人)[：:]/;

/** 挑一条同场景、还没被引用过的对话。逐个场景找，第一个有可用对话的场景即止。 */
function pickDialogue(q, intent, used) {
  let items;
  try { items = kb.dialogues().items; } catch (e) { return null; }
  const scenes = (intent && intent.scenes) || [];
  if (!scenes.length) return null;
  // 相关度闸门：光「场景标签投票沾边」不够——「今天天气怎么样」也会被投出
  // 「抑郁/焦虑」场景（第二十轮已实测场景投票就是这么宽）。要求对话正文与问题
  // 有**≥2 个不同**话题词交集，或**1 个 ≥3 字**的具体词交集（第二十轮的教训：
  // 单列分数分不开 in/out-of-scope，这里用的是词面交集的「数量 + 具体度」，
  // 并与场景硬条件取 AND；残余的误挂边界与「无关问题也给章节」一样，等 LLM Key）。
  const toks = [...new Set([...topicTokens(q), ...kb.expandQuery(q)])];
  for (const sc of scenes) {
    const cands = items
      .filter((it) => it.scenes.includes(sc) && !used.has(it.id))
      .sort((a, b) => (b.childHits - a.childHits) || (a.adultHits - b.adultHits) || (a.chars - b.chars));
    let best = null;
    let bestHits = -1;
    for (const it of cands) {
      const d = kb.dialogueById(it.id);
      if (!d) continue;
      const soft = d.softened || d.original || '';
      // 称谓改写管不到的成人词（男朋友/精神科医生…）一旦出现，整条不挂
      if (adultLevel(soft).ad > 0) continue;
      const hits = toks.filter((t) => soft.includes(t));
      const ok = hits.length >= 2 || hits.some((t) => t.length >= 3);
      if (!ok) continue;
      if (hits.length > bestHits) { best = d; bestHits = hits.length; }
    }
    if (best) return best;
  }
  return null;
}

/** 摘对话开头几轮：OCR 硬换行先合上，再按「说话人：」切开，取前几轮。 */
function excerptTurns(soft, maxChars = 560) {
  const flat = tightenCjk(String(soft).replace(/\s*\n\s*/g, ' '));
  const marks = [...flat.matchAll(TURN_RE)].map((m) => m.index);
  if (!marks.length) return flat.length && flat.length <= 900 ? [flat] : [];
  const parts = [];
  if (marks[0] > 0) parts.push(flat.slice(0, marks[0]).trim());   // 开头的说明段
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1] : flat.length;
    parts.push(flat.slice(marks[i], end).trim());
  }
  let start = parts.findIndex((p) => TURN_RE_TEST.test(p));
  if (start < 0) start = 0;                        // 找不到说话人标记就整段照给
  const out = [];
  let len = 0;
  for (let i = start; i < parts.length; i++) {
    const p = parts[i];
    if (out.length >= 2 && len + p.length > maxChars) break;
    if (len + p.length > 900) break;               // 单轮超长也别整段吞给家长
    out.push(p);
    len += p.length;
    if (out.length >= 8) break;
  }
  return out;
}

/** 渲染对话片段。返回是否真的输出了内容；输出了就把该章记进出处清单。 */
function renderDialogueExcerpt(dlg, lines, usedHits) {
  if (!dlg) return false;
  const doc = kb.getById(dlg.id);
  if (!doc) return false;
  const turns = excerptTurns(dlg.softened || dlg.original || '');
  if (turns.length < 2) return false;
  lines.push('### 教材里的一段对话');
  lines.push('');
  lines.push('教材里的一段问答，看看这类话题通常是怎么被问起、怎么被接住的。'
    + '这些对话大多发生在成人的治疗会谈里，供参考，**不是让你照着念的话术模板**。');
  lines.push('');
  for (const t of turns) lines.push(`> ${t}`);
  lines.push('');
  lines.push(`（出处：${dlg.citation}）`);
  lines.push('');
  lines.push(dlg.needsRewrite
    ? '> 说明：称谓已按家庭语境改写（如「心理老师」「孩子」），原话未改；正文逐字摘自原书，个别标点问题来自扫描识别。'
    : '> 说明：正文逐字摘自原书，个别标点问题来自扫描识别。');
  lines.push('');
  if (!usedHits.some((h) => h.id === dlg.id)) usedHits.push(doc);
  return true;
}

function composeExtractive(q, hits, intent, card) {
  const qTokens = tokenizeForPick(q);
  const lines = [];
  const intentKind = kb.intentOf(q);

  const sceneTxt = intent.scenes.length ? intent.scenes.join('、') : '当前描述的情况';
  lines.push(`我从知识库里找到了和「${sceneTxt}」相关的内容，下面都是从原文里摘出来的。`);
  lines.push('');

  const used = new Set();
  const usedHits = [];
  // 上面渲染过迁移卡的章节不再进类型小节，避免同一段话出现两次
  const bridgeUsed = card ? renderBridge(card, lines, used, usedHits) : false;

  // 走迁移卡时，场景只报卡片对应的那一个——否则会把标签投票带出来的
  // 一堆边缘场景（社交与人际/物质滥用…）都摆到家长面前，反而让人迷糊。
  if (bridgeUsed) {
    lines[0] = `这类情况（${bridgeSceneOf(intent)}）在这批教材里没有专门章节，`
      + '下面这张卡是把它通用的 CBT 方法迁移过来的，引文仍然来自原书。';
  }

  const slots = slotOrder(intentKind);

  // 先跑一次「不限类型」的基准检索，用来定相关度门槛。
  // 没有门槛的话，各小节为了凑满就会把弱相关的段落也塞进来
  // （问「手机游戏」，答「幸福生活研究」就是这么来的）。
  const base = kb.search(q, {
    scenes: intent.scenes, top: 8, maxChars: 1200, autoTag: false, intent: intentKind,
  });
  const baseTop = base.length ? base[0].score : 0;
  const floor = baseTop * 0.55;

  // 每个小节单独做一次「按内容类型」的定向检索，类型在这里是硬条件，
  // 保证「工具表单」节里是表格、「对话示例」节里是对话。
  const perSlot = {};
  for (const slot of slots) {
    const r = kb.search(q, {
      scenes: intent.scenes, types: [slot.key], strictTypes: true, top: 5, maxChars: 1200,
      autoTag: false, intent: intentKind,
    }).filter((h) => h.score >= floor * 0.6);
    perSlot[slot.key] = r;
  }

  const tToks = topicTokens(q);
  let softened = 0;
  let quoted = 0;
  let onTopic = 0;
  for (const slot of slots) {
    if (quoted >= MAX_BULLETS) break;                // 面向家长，宁少勿滥
    const cands = perSlot[slot.key] || [];
    const picked = [];
    // 第一遍：只要天然带儿童/家庭语境、且和问题有交集的句子
    // 第二遍（第一遍挑不出东西时才走）：允许成人个案原句，但做家庭语境改写
    for (const allowAdult of [false, true]) {
      for (const h of cands) {
        if (picked.length >= 2) break;
        if (used.has(h.id)) continue;
        const sents = pickSentences(h.text, qTokens, 2, 260, allowAdult, true, q);
        if (!sents.length) continue;
        used.add(h.id);
        usedHits.push(h);
        picked.push({ h, sents });
      }
      if (picked.length) break;
    }
    if (!picked.length) continue;
    lines.push(`### ${slot.title}`);
    lines.push('');
    for (const { h, sents } of picked) {
      for (const s of sents) {
        if (quoted >= MAX_BULLETS) break;     // 精确封顶，避免小节内冲高
        if (s.soft) softened++;
        quoted++;
        if (isOnTopic(s.t, tToks)) onTopic++;
        lines.push(`- ${s.t}（出处：${h.citation}）`);
      }
      if (quoted >= MAX_BULLETS) break;
    }
    lines.push('');
  }

  if (!used.size) {
    for (const h of (base.length ? base : hits).slice(0, 3)) {
      const sents = pickSentences(h.text, qTokens, 2, 260, true, false, q);
      if (!sents.length) continue;
      lines.push(`### ${h.heading}`);
      lines.push('');
      for (const s of sents) {
        if (s.soft) softened++;
        quoted++;
        if (isOnTopic(s.t, tToks)) onTopic++;
        lines.push(`- ${s.t}（出处：${h.citation}）`);
      }
      lines.push('');
      usedHits.push(h);
    }
  }

  // 「我该怎么做/怎么说」：在引用章节之外，再挂一段同场景的教材对话原文。
  // 已走迁移卡的场景不再挂（卡里的落地做法已在回答「怎么做」，再挂只会稀释）。
  let dialogue = null;
  if (!bridgeUsed) {
    const dlg = pickDialogue(q, intent, used);
    if (renderDialogueExcerpt(dlg, lines, usedHits)) {
      dialogue = { id: dlg.id, citation: dlg.citation };
    }
  }

  // 自查：这块语料本来就薄 —— 如实说明，不装作答得上。
  // 已经给了迁移卡的情形不再重复提示（卡片的导语里已经说清楚了）。
  if (!bridgeUsed && quoted > 0 && quoted <= 2) {
    lines.splice(2, 0,
      '> 提示：知识库里和这个情况直接相关的内容不多，下面是最贴近的几条。'
      + '你可以换个说法再问一次（比如补上孩子的年龄、具体表现），我按关键词再查一遍；'
      + '也可以到「干预策略」页看通用方法。', '');
  } else if (!bridgeUsed && quoted > 0 && onTopic / quoted < 0.5) {
    lines.splice(2, 0,
      '> 说明：知识库里和这个情况直接相关的内容不多，下面这些是从通用方法里挑出来的，方向沾边但未必贴合你的具体情况。', '');
  }

  lines.push('---');
  lines.push('');
  lines.push('以上内容摘自下面的资料，你可以点开看原文：');
  const list = usedHits.length ? usedHits : hits;
  list.slice(0, 6).forEach((h, i) => lines.push(`${i + 1}. 《${h.source}》 · ${h.heading}`));
  if (softened) {
    lines.push('');
    lines.push('> 说明：个别句子原书以成人个案举例，已把称谓换成面向家庭的表述（如「心理老师」「孩子」），原意未改。');
  }
  lines.push('');
  lines.push('> 需要提醒的是：知识库内容是通用的 CBT 方法，不是针对你孩子的诊断。如果情况持续两周以上、或者明显影响上学和睡觉，请到医院精神科或心理科做一次正式评估。');

  return { text: lines.join('\n'), dialogue };
}

function tokenizeForPick(q) {
  const out = new Set();
  const toks = kb.tokenize(q);
  for (const t of toks) if (t.length === 2) out.add(t);
  // 再补一些 3-4 字关键词
  const runs = q.match(/[\u4e00-\u9fff]{3,8}/g) || [];
  for (const r of runs) for (let i = 0; i + 3 <= r.length; i++) out.add(r.slice(i, i + 3));
  return [...out];
}

function suggestByTags(intent) {
  const s = [];
  for (const sc of intent.scenes.slice(0, 2)) s.push(`关于「${sc}」，有哪些具体的做法？`);
  s.push('这些方法我在家怎么开始第一步？');
  s.push('孩子不配合的时候该怎么办？');
  return s.slice(0, 4);
}

/* --------------------------- LLM 接入 --------------------------- */

function llmConfig() {
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL
    || (process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
  const model = process.env.LLM_MODEL
    || (process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4o-mini');
  return { key, base, model };
}

const SYSTEM_PROMPT = `你是「星伴」的育儿支持助手，服务对象是 3-18 岁儿童的家长与照护者。

【硬性规则，必须全部遵守】
1. 你只能依据下面提供的【知识库片段】作答。片段之外的专业结论、数据、量表名称一律不得引入。
2. 每一条具体建议后面，都要用（出处：《来源》 · 章节）的形式标注它来自哪个片段。
3. 如果片段不足以回答用户的问题，直接说「知识库中暂无直接相关内容」，然后只给一般性的支持与安抚，绝不编造方法。
4. 不做诊断、不推荐药物、不下医学结论。涉及自伤、自杀、严重精神症状时，只做安全提示并建议立即寻求专业帮助。
5. 语言面向家长，口语化、具体、可执行。每条建议要落到「谁在什么情况下做什么」。
6. 不要出现「补充话术」「总结」这类标题式的空话，直接讲内容。
7. 如果给了【场景迁移说明】，其中「星伴整理的落地做法」不是原书原文，
   用到时必须写成「（星伴整理）」而不是标成书籍出处；引文部分才标书籍出处。

【输出结构】
先用两三句话回应用户最着急的那个点；然后分小节给出可以怎么做，每节 2-4 条，条条带出处；最后一句说明什么情况下需要找专业人员。`;

async function callLLM(question, hits, ctx, cfg, card) {
  const ctxTxt = [];
  if (ctx.age) ctxTxt.push(`孩子年龄：${ctx.age}`);
  if (ctx.gender) ctxTxt.push(`性别：${ctx.gender}`);
  if (ctx.diagnosis) ctxTxt.push(`已确诊/关注点：${ctx.diagnosis}`);

  const kbTxt = hits.map((h, i) => {
    const tags = [
      h.scenes.length ? `场景：${h.scenes.join('/')}` : '',
      h.techs.length ? `技术：${h.techs.join('/')}` : '',
      h.types.length ? `类型：${h.types.join('/')}` : '',
    ].filter(Boolean).join('；');
    return `【片段${i + 1}】《${h.source}》 · ${h.heading}\n${tags}\n${h.text}`;
  }).join('\n\n---\n\n');

  // 薄场景迁移卡：这批教材里没有该儿童题材的专门章节，卡片提供了
  // 「原书引文 + 星伴整理的落地做法」，必须让模型知道哪些是原书、哪些是整理。
  const bridgeTxt = card ? [
    '【场景迁移说明】这一批资料里没有该儿童题材的专门章节，以下是星伴把通用方法迁移过来的内容。',
    `导语：${card.导语 || ''}`,
    '引用片段（来自原书，必须按上面的片段出处标注）：',
    ...(card.quotes || []).map((q2) => `· ${q2.text}（出处：《${(kb.getById(q2.id) || {}).source}》 · ${(kb.getById(q2.id) || {}).heading}）`),
    '星伴整理的落地做法（**不是原书原文**，引用时要写明「星伴整理」）：',
    ...(card.落地 || []).map((a, i) => `${i + 1}. ${a}`),
    card.边界 ? `需要就医的提示：${card.边界}` : '',
  ].filter(Boolean).join('\n') : '';

  const user = [
    ctxTxt.length ? `【家庭情况】\n${ctxTxt.join('\n')}\n` : '',
    `【用户的问题】\n${question}\n`,
    bridgeTxt ? `${bridgeTxt}\n` : '',
    `【知识库片段】\n${kbTxt}`,
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        max_tokens: 1600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('模型返回为空');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { answer, isCrisis, crisisHit, crisisResponse, llmConfig, BRIDGE, bridgeSceneOf,
  medicalHit, medicalResponse,
  CRISIS_WORDS, ADULT_WORDS, ADULT_SWAP, topicTokens, isOnTopic, pickSentences };
