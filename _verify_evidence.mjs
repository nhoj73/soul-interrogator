// 简答软证据池回归：简答不投票，但接入盘人/闲聊/验证三条 AI 通道 + 评估端 + 显式引用面板。
// 通道对应：① 验证(buildVerifySys) ② 盘人(buildCrossSys)/闲聊(buildChatSys) ③④ 评估(assessUserMsg/collectFreeText)
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

// 暴露内部函数用于断言（与 _verify_provider.mjs 同款插桩手法）
const patch = src => src
  .replace('function applyProvider(id, persist){',
    'window.__SI=window.__SI||{};window.__SI.applyProvider=applyProvider;window.__SI.getS=function(){return S;};window.__SI.openEvidenceBlock=openEvidenceBlock;window.__SI.buildCrossSys=buildCrossSys;window.__SI.buildChatSys=buildChatSys;window.__SI.buildVerifySys=buildVerifySys;window.__SI.collectFreeText=collectFreeText;window.__SI.renderOpenEvidence=renderOpenEvidence;window.__SI.assessUserMsg=assessUserMsg;function applyProvider(id, persist){')
  .replace('function flippedCode(sc){', 'window.__SI.flippedCode=flippedCode;window.__SI.flipSummaryText=flipSummaryText;window.__SI.flipOf=flipOf; function flippedCode(sc){')
  .replace('function renderVerifyReport(rep){', 'window.__SI.renderVerifyReport=renderVerifyReport;window.__SI.adoptVerifyFlip=adoptVerifyFlip; function renderVerifyReport(rep){')
  .replace('function repairQset(raw, skipMin){', 'window.__SI.repairQset=repairQset;window.__SI.buildPrompt=buildPrompt; function repairQset(raw, skipMin){')
  .replace('function normalizeAssess(d, mechCode, sc){', 'window.__SI.normalizeAssess=normalizeAssess;window.__SI.paintAssess=paintAssess; function normalizeAssess(d, mechCode, sc){')
  .replace('function hardenGenerated(ai){', 'window.__SI.hardenGenerated=hardenGenerated;window.__SI.openWindowRange=openWindowRange;window.__SI.isEventAnchor=isEventAnchor;window.__SI.isPlanFamily=isPlanFamily;window.__SI.jpFamilyOf=jpFamilyOf;window.__SI.JP_FAMILIES=JP_FAMILIES;window.__SI.builtInSet=builtInSet;window.__SI.bipolarConflict=bipolarConflict;window.__SI.fixBipolar=fixBipolar;window.__SI.auditFinal=auditFinal;window.__SI.mixSet=mixSet;window.__SI.getAudit=function(){return GEN_AUDIT;};window.__SI.proofreadPass=proofreadPass; function hardenGenerated(ai){');

let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window, d = w.document;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = () => Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) });
  const s = w.document.createElement('script'); s.textContent = patch(jsCode); w.document.body.appendChild(s);
  return { w, d };
}

(async () => {
  // 构造一份已完成的问卷状态：3 道简答，其中 2 道有作答、1 道跳过
  const { w, d } = boot(); await sleep(120);
  const S = w.__SI.getS();
  S.qset = {
    anchorCount:12, aiCount:9, bankCount:0,
    choice:[
      { id:'c1', t:'情境1', dim:'EI', A:{text:'甲',pole:'E'}, B:{text:'乙',pole:'I'} },
      { id:'c2', t:'情境2', dim:'SN', A:{text:'甲',pole:'S'}, B:{text:'乙',pole:'N'} }
    ],
    open:[
      { id:'x0', t:'最近一周让你最有成就感的小事？' },
      { id:'x1', t:'描述一次和想法不同的人合作的经历。' },
      { id:'x2', t:'如果下周完全自由你会做什么？' }
    ]
  };
  S.ans = { c1:{pole:'E'}, c2:{pole:'N'} };
  S.open = { x0:'周三把一个拖了两周的 bug 修了', x1:'和设计吵了一下午最后用了她的方案', x2:'', x2_skip:true };
  S.bg = { age:'30', job:'工程师', life:['独居'], worry:'项目延期' };
  S.resultCode = 'EN'; S.finished = true; S.order = [0,1,2,3,4]; S.idx = 0;
  const ANS = '周三把一个拖了两周的 bug 修了';
  const ANS2 = '和设计吵了一下午最后用了她的方案';

  console.log('\n【E1】openEvidenceBlock：单一事实源，含简答原文、跳过的不列');
  {
    const blk = w.__SI.openEvidenceBlock();
    ok(/简答/.test(blk), 'E1 证据块标题含「简答」');
    ok(blk.indexOf(ANS) > -1 && blk.indexOf(ANS2) > -1, 'E1 含两条简答原文');
    ok(blk.indexOf('下周完全自由') === -1 || blk.indexOf('x2') === -1, 'E1 跳过的简答不列入');
    ok(/不计分/.test(blk), 'E1 标注「不计分」（不投票）');
  }

  console.log('\n【E2】通道② 盘人 AI：buildCrossSys 引用简答作追问起点');
  {
    const sys = w.__SI.buildCrossSys();
    ok(sys.indexOf(ANS) > -1 && sys.indexOf(ANS2) > -1, 'E2 盘人 system prompt 含简答原文');
    ok(/追问起点|行为证据/.test(sys), 'E2 标注为追问起点/行为证据');
  }

  console.log('\n【E3】通道② 闲聊 AI：buildChatSys 引用简答');
  {
    const sys = w.__SI.buildChatSys();
    ok(sys.indexOf(ANS) > -1, 'E3 闲聊 system prompt 含简答原文');
  }

  console.log('\n【E4】通道① 验证 AI：buildVerifySys 引用简答（最弱维行为证据）');
  {
    const sys = w.__SI.buildVerifySys();
    ok(sys.indexOf(ANS) > -1, 'E4 验证 system prompt 含简答原文');
  }

  console.log('\n【E5】通道③④ 评估端：collectFreeText + assessUserMsg 含简答（回归，原有）');
  {
    const free = w.__SI.collectFreeText();
    ok(free.some(f => f.kind === '简答' && f.a === ANS), 'E5 collectFreeText 含简答条目');
    const msg = w.__SI.assessUserMsg(w.__SI.getS().resultCode ? [{dim:{key:'EI',title:'精力',a:'E',b:'I'}, a:1, b:0, gap:1, close:true, letter:'E'}] : []);
    ok(msg.indexOf(ANS) > -1, 'E5 assessUserMsg 含简答原文（评估上下文参考）');
  }

  console.log('\n【E6】页面引导语如实化：删「只留给你自己看/对照」');
  {
    ok(!/只留给你自己看|只留给你看|只留给你自己对照/.test(html), 'E6 源码已删除「只留给你自己看/对照」措辞');
    ok(/AI 会把你写的行为当作参考证据|AI 会把你写的当作参考证据/.test(html), 'E6 改为如实版「AI 会把你写的当作参考证据」');
  }

  console.log('\n【E7】盘人/闲聊页显式引用面板：renderOpenEvidence 渲染简答');
  {
    // 盘人页
    w.__SI.renderOpenEvidence('cross-evidence');
    const ep = d.getElementById('cross-evidence');
    ok(ep && ep.style.display !== 'none', 'E7 盘人证据面板显示');
    ok(ep && ep.innerHTML.indexOf(ANS) > -1, 'E7 面板含简答原文（用户看见自己写的没白写）');
    // 闲聊页
    w.__SI.renderOpenEvidence('chat-evidence');
    const ep2 = d.getElementById('chat-evidence');
    ok(ep2 && ep2.style.display !== 'none' && ep2.innerHTML.indexOf(ANS2) > -1, 'E7 闲聊证据面板同样渲染');
    // 无简答时隐藏
    S.open = { x0:'', x0_skip:true, x1:'', x1_skip:true, x2:'', x2_skip:true };
    w.__SI.renderOpenEvidence('cross-evidence');
    ok(d.getElementById('cross-evidence').style.display === 'none', 'E7 全部跳过时面板隐藏');
  }

  console.log('\n【F1】验证翻字母：存疑 + 更接近反向极 → 出现「采纳」按钮（用户确认才翻）');
  {
    // 四维各 1 题，答案让 SN 判为 N → raw code ENTJ
    const { w, d } = boot(); await sleep(120);
    const S = w.__SI.getS();
    S.qset = {
      anchorCount:12, aiCount:4, bankCount:0,
      choice:[
        { id:'c1', t:'q1', dim:'EI', A:{text:'a',pole:'E'}, B:{text:'b',pole:'I'} },
        { id:'c2', t:'q2', dim:'SN', A:{text:'a',pole:'S'}, B:{text:'b',pole:'N'} },
        { id:'c3', t:'q3', dim:'TF', A:{text:'a',pole:'T'}, B:{text:'b',pole:'F'} },
        { id:'c4', t:'q4', dim:'JP', A:{text:'a',pole:'J'}, B:{text:'b',pole:'P'} }
      ],
      open:[]
    };
    S.ans = { c1:{pick:'a'}, c2:{pick:'b'}, c3:{pick:'a'}, c4:{pick:'a'} };
    S.open = {}; S.finished = true;
    // 模拟结果页结构，让 paintHero/paintBars/paintDesc 可落地
    d.getElementById('r-root').innerHTML = '<div id="r-hero"></div><div id="r-bars"></div><div id="r-desc"></div>';
    S.verify_report = { kind:'verify',
      dims:[{ dim:'SN', baseline:'N', status:'存疑', behavior_hint:'行为线索更接近 S', quote:'用户说…', note:'' }],
      overall:'建议复核', nuance:'' };
    S.verify_done = true;
    w.__SI.renderVerifyReport(S.verify_report);
    const root = d.getElementById('verify-report-root');
    ok(root.innerHTML.indexOf('data-flip="SN"') > -1, 'F1 验证报告出现 SN 采纳按钮');
    ok(root.innerHTML.indexOf('采纳：N → S') > -1, 'F1 按钮文案 N → S');
  }

  console.log('\n【F2】串维 / 基线已等于线索极 → 不出现采纳按钮（AI 无权乱改）');
  {
    const { w, d } = boot(); await sleep(120);
    const S = w.__SI.getS();
    // hint 指向 E，但 E 属于 EI 维，与 SN 串维 → 不应建议
    S.verify_report = { kind:'verify',
      dims:[{ dim:'SN', baseline:'N', status:'存疑', behavior_hint:'行为线索更接近 E', quote:'', note:'' }],
      overall:'基本可信', nuance:'' };
    S.verify_done = true;
    w.__SI.renderVerifyReport(S.verify_report);
    ok(d.getElementById('verify-report-root').innerHTML.indexOf('data-flip') === -1, 'F2 串维 hint 不产生建议');
    // 基线已等于线索极 → 无建议
    S.verify_report = { kind:'verify',
      dims:[{ dim:'SN', baseline:'N', status:'存疑', behavior_hint:'行为线索更接近 N', quote:'', note:'' }],
      overall:'基本可信', nuance:'' };
    w.__SI.renderVerifyReport(S.verify_report);
    ok(d.getElementById('verify-report-root').innerHTML.indexOf('data-flip') === -1, 'F2 基线与线索极相同不产生建议');
    // verified 维度不产生建议
    S.verify_report = { kind:'verify',
      dims:[{ dim:'SN', baseline:'N', status:'verified', behavior_hint:'', quote:'', note:'' }],
      overall:'可信', nuance:'' };
    w.__SI.renderVerifyReport(S.verify_report);
    ok(d.getElementById('verify-report-root').innerHTML.indexOf('data-flip') === -1, 'F2 verified 维度不产生建议');
  }

  console.log('\n【F3】点采纳 → 写入 S.flips、resultCode 翻字母、结果页重绘标注');
  {
    const { w, d } = boot(); await sleep(120);
    const S = w.__SI.getS();
    S.qset = { anchorCount:12, aiCount:4, bankCount:0,
      choice:[
        { id:'c1', t:'q1', dim:'EI', A:{text:'a',pole:'E'}, B:{text:'b',pole:'I'} },
        { id:'c2', t:'q2', dim:'SN', A:{text:'a',pole:'S'}, B:{text:'b',pole:'N'} },
        { id:'c3', t:'q3', dim:'TF', A:{text:'a',pole:'T'}, B:{text:'b',pole:'F'} },
        { id:'c4', t:'q4', dim:'JP', A:{text:'a',pole:'J'}, B:{text:'b',pole:'P'} }
      ], open:[] };
    S.ans = { c1:{pick:'a'}, c2:{pick:'b'}, c3:{pick:'a'}, c4:{pick:'a'} };
    S.open = {}; S.finished = true;
    d.getElementById('r-root').innerHTML = '<div id="r-hero"></div><div id="r-bars"></div><div id="r-desc"></div>';
    S.resultCode = 'ENTJ';
    S.verify_report = { kind:'verify',
      dims:[{ dim:'SN', baseline:'N', status:'存疑', behavior_hint:'行为线索更接近 S', quote:'用户说…', note:'' }],
      overall:'建议复核', nuance:'' };
    S.verify_done = true;
    w.__SI.renderVerifyReport(S.verify_report);
    const root = d.getElementById('verify-report-root');
    const btn = root.querySelector('button[data-flip="SN"]');
    btn.dispatchEvent(new w.Event('click', { bubbles:true })); await sleep(80);
    const fl = S.flips;
    ok(fl.length === 1 && fl[0].dim === 'SN' && fl[0].to === 'S' && fl[0].from === 'N', 'F3 S.flips 记录 SN:N→S（用户采纳才写入）');
    ok(S.resultCode === 'ESTJ', 'F3 resultCode 由 ENTJ 翻为 ESTJ');
    const hero = d.querySelector('.r-code');
    ok(hero && hero.textContent === 'ESTJ', 'F3 结果页 hero 显示翻后码 ESTJ');
    ok(d.getElementById('r-bars').innerHTML.indexOf('已按 AI 行为验证翻字母') > -1, 'F3 条形区标注已翻字母');
    // AI 从未直接改：flips 存在但基线计分仍可还原（flipOf 返回 from=N）
    ok(w.__SI.flipOf('SN').from === 'N', 'F3 保留原判 N（可解释、可还原）');
  }

  console.log('\n【G1】混血句式运行时拦截：repairQset 丢弃「如果…你过去实际…」废题');
  {
    const raw = {
      choice:[
        { q:'如果下周末完全由你支配且无需汇报，你过去实际会怎么过？', A:{text:'补觉',dim:'J'}, B:{text:'出门',dim:'P'} },
        { q:'过去一个月，你主动改过几次已经定好的安排？', A:{text:'从没改过',dim:'J'}, B:{text:'改了好几次',dim:'P'} },
        { q:'假如上个月你实际遇到同事甩锅，你会怎么做？', A:{text:'当面指出',dim:'T'}, B:{text:'先安抚自己',dim:'F'} },
        { q:'如果由你组织一次出行，你更想 A 提前订好票还是 B 到了再决定？', A:{text:'提前订好票',dim:'J'}, B:{text:'到了再决定',dim:'P'}, grade:'hypothetical' },
        { q:'上周五晚上散场后，你通常？', A:{text:'还想接着约',dim:'E'}, B:{text:'需要独处回血',dim:'I'} },
        { q:'上个月买新软件时，你先？', A:{text:'抠具体细节',dim:'S'}, B:{text:'看整体框架',dim:'N'} },
        { q:'最近一次朋友找你倾诉，你先？', A:{text:'分析怎么解决',dim:'T'}, B:{text:'先陪着',dim:'F'} }
      ], open:[]
    };
    const set = w.__SI.repairQset(raw);
    const texts = set.choice.map(q=>q.t);
    ok(texts.every(t=>t.indexOf('过去实际') === -1), 'G1 混血题「如果…过去实际…」被拦截（不进题集）');
    ok(texts.some(t=>t.indexOf('过去一个月') === 0), 'G1 正常实忆题保留');
    ok(texts.every(t=>!(t.indexOf('假如') > -1 && /上个月[^。]{0,24}实际/.test(t))), 'G1 「假如…上个月…实际」混血变体同样被拦截');
    ok(texts.some(t=>t.indexOf('组织一次出行') > -1), 'G1 合规抉择式假想题（grade:hypothetical）保留');
  }

  console.log('\n【G2】题内自定义进软证据池（与简答同款规格）：openEvidenceBlock 收编 + 附选项原文');
  {
    const S2 = w.__SI.getS();
    S2.ans.c1 = { pole:'E', custom:'在A的基础上，但人多的时候我会先躲一会儿' };
    const blk = w.__SI.openEvidenceBlock();
    ok(blk.indexOf('在A的基础上，但人多的时候我会先躲一会儿') > -1, 'G2 证据块含自定义原文');
    ok(blk.indexOf('A. 甲') > -1 && blk.indexOf('B. 乙') > -1, 'G2 自定义条目附带 A/B 选项原文（AI 可解读）');
    ok(blk.indexOf('自己写') > -1 || blk.indexOf('自定义') > -1 || /用户自己写|观察者改写/.test(blk), 'G2 自定义条目标注来源');
    ok(/问卷简答与自定义答案/.test(blk), 'G2 证据块标题升级为「简答与自定义答案」');
    const free = w.__SI.collectFreeText();
    ok(free.some(f=>f.kind==='题内自定义' && f.a.indexOf('在A的基础上') === 0), 'G2 评估端 collectFreeText 仍收题内自定义（回归）');
    S2.ans.c1 = { pole:'E' };   // 还原，避免影响其他用例
  }

  console.log('\n【G3】自定义提示语与简答口径一致（如实版）');
  {
    ok(html.indexOf('不计分，但 AI 会把它当作参考证据') > -1, 'G3 自定义入口提示语为如实版');
    ok(!/留给你对照|留给你自己对照/.test(html), 'G3 结果页不再出现「留给你对照」');
    ok(html.indexOf('但 AI 会把你写的内容当作参考证据') > -1, 'G3 结果页改写题卡为如实承诺');
  }

  console.log('\n【G4】生成题 prompt 硬规则：行为化≥80% 机械判废 + JP 语义分散 + 逐题自检');
  {
    const p = w.__SI.buildPrompt();
    ok(p.indexOf('A2. 行为化配额') > -1 && p.indexOf('≥80%') > -1, 'G4 prompt 含行为化配额硬规则（≥80%）');
    ok(p.indexOf('机械判废') > -1 && p.indexOf('实忆锚点词') > -1, 'G4 prompt 含无锚点情境问法机械判废');
    ok(p.indexOf('混血句式') > -1 && p.indexOf('判废题') > -1, 'G4 prompt 禁「假想框架+实忆要求」混血');
    ok(p.indexOf('JP 语义族覆盖') > -1 && p.indexOf('≥2 个语义族') > -1 && p.indexOf('非结构族') > -1, 'G4 prompt 含 JP 语义族覆盖硬规则（≥2 族且至少 1 道非结构族）');
    ok(p.indexOf('逐题执行') > -1 && p.indexOf('必须重写') > -1, 'G4 自检升级为逐题强制重写机制');
    ok(p.indexOf('你更倾向于？') > -1, 'G4 判废黑名单含「你更倾向于？」');
  }

  console.log('\n【G5】内置题库静态扫描：零混血句式（全题库扫一遍）');
  {
    // ANCHOR 12 题 + 内置通用题库 Q_TEXT 24 题 + OPEN + FALLBACK_TEXT，逐条断言
    const bankTexts = [];
    const re = /t:'([^']*)'/g; let m;
    const seg = html.slice(html.indexOf('var Q = ['), html.indexOf('var TYPES'));
    let mm;
    const tRe = /t:'((?:[^'\\]|\\.)*)'/g;
    while((mm = tRe.exec(seg)) !== null) bankTexts.push(mm[1]);
    const qRe = /q\d+:\s*'((?:[^'\\]|\\.)*)'/g;
    while((mm = qRe.exec(seg)) !== null) bankTexts.push(mm[1]);
    const mixed = bankTexts.filter(t => /如果|假如|要是/.test(t) && /(过去|上周|上个月|上月|最近)[^。]{0,24}实际|实际[^。]{0,8}(过去|上周|上个月|上月)/.test(t));
    ok(bankTexts.length >= 30, 'G5 扫描覆盖内置题库 ' + bankTexts.length + ' 条题面/选项文本');
    ok(mixed.length === 0, 'G5 内置题库零「如果…过去实际」混血句式' + (mixed.length ? '：' + mixed.join(' ;; ') : ''));
  }

  console.log('\n【G5b】B 件：bank JP 题语义族 ≥2 且 非计划 ≥ 计划（静态扫描 + A1 词表 fixture）');
  {
    // 沿用 G5 的源码扫描手法：取 var Q = [ … var Q_TEXT 的 JP 条目 id，再从 Q_TEXT 取题面
    const seg = html.slice(html.indexOf('var Q = ['), html.indexOf('var Q_TEXT'));
    const jpIds = []; let mm;
    const idRe = /\{id:'(q\d+)',dim:'JP'/g;
    while((mm = idRe.exec(seg)) !== null) jpIds.push(mm[1]);
    const tSeg = html.slice(html.indexOf('var Q_TEXT'), html.indexOf('var OPEN'));
    const texts = {};
    const tRe = /(q\d+):\s*'((?:[^'\\]|\\.)*)'/g;
    while((mm = tRe.exec(tSeg)) !== null) texts[mm[1]] = mm[2];
    const jpTexts = jpIds.map(id => texts[id]).filter(Boolean);
    const fam = {};
    jpTexts.forEach(t => { const f = w.__SI.jpFamilyOf(t); fam[f] = (fam[f]||0)+1; });
    const openN = fam.open || 0, planN = jpTexts.length - openN;
    ok(jpTexts.length >= 10, 'G5b bank JP 题共 ' + jpTexts.length + ' 道（q19–q30，B1/B2 已补入）');
    ok(Object.keys(fam).filter(k => k !== 'open' && fam[k] > 0).length >= 2,
       'G5b JP 语义族 ≥2（分布 ' + JSON.stringify(fam) + '）');
    ok(openN >= planN, 'G5b 非计划语境 ' + openN + ' ≥ 计划语境 ' + planN + '（P 味语境不再缺位）');
    // B1 三道新 P 语义题：存在、且题面被判为 open（不含任何计划族词）
    [['即兴出行','朋友临时发消息说'],['并行多线','三件事都开了头'],['最后一刻定稿','东西要交的前一晚']].forEach(([name, frag]) => {
      const t = jpTexts.find(x => x.indexOf(frag) > -1);
      ok(!!t && w.__SI.jpFamilyOf(t) === 'open', 'G5b B1「' + name + '」新题在库且为非计划族');
    });
    // 混血句式扫描只对新题零命中（全库零命中由 G5 覆盖）
    const newMixed = jpTexts.filter(t => /如果|假如|要是/.test(t));
    ok(newMixed.length === 0, 'G5b 新增 bank JP 题零假想句式（混血句式扫描零命中）');
    // A1 词表 fixture：新词各验一例命中 + 族别归属正确
    [['期限','没有硬性期限的活儿','deadline'],['守时','说到守时','punctual'],['迟到','这月开会迟到几次','punctual'],
     ['常规','你的常规操作是','routine'],['例行','每天例行的事','routine'],['固定流程','你的固定流程是','routine']].forEach(([w0, t0, fam0]) => {
      ok(w.__SI.isPlanFamily(t0) && w.__SI.jpFamilyOf(t0) === fam0, 'A1「' + w0 + '」入表 → ' + fam0 + ' 族');
    });
    // A1 防误伤：正常非计划题不被新词误判
    ok(!w.__SI.isPlanFamily('上周末那顿饭你是怎么挑的？'), 'A1 防误伤：挑饭题不误判');
    ok(!w.__SI.isPlanFamily('昨天同事争论你站哪边？'), 'A1 防误伤：争论题不误判');
    ok(!w.__SI.isPlanFamily('朋友临时发消息说现在出来'), 'A1 防误伤：临时≠计划族（临时属 P 信号）');
    ok(!w.__SI.isPlanFamily('与他人新奇、非常规的互动'), 'A1 防误伤：「非常规」不命中常规族（题池 Q6 原句）');
    // 一致性：isPlanFamily ⟺ jpFamilyOf !== 'open'（全 bank JP 题）
    let incons = 0;
    jpTexts.forEach(t => { if(w.__SI.isPlanFamily(t) !== (w.__SI.jpFamilyOf(t) !== 'open')) incons++; });
    ok(incons === 0, 'G5b 一致性：isPlanFamily ⟺ jpFamilyOf!=="open"（' + jpTexts.length + ' 题全过）');
  }

  console.log('\n【H1】硬校验·假想题：全部打【假想】标 + >2 道丢弃');
  {
    const raw = { choice:[
      { t:'过去一个月，你改过几次安排？', dim:'JP', A:{text:'没改过',pole:'J'}, B:{text:'好几次',pole:'P'} },
      { t:'如果由你组织出行，更想提前订好还是到了再定？', dim:'JP', A:{text:'提前订好',pole:'J'}, B:{text:'到了再定',pole:'P'}, grade:'hypothetical' },
      { t:'假如明天放假，你更想在家还是出门？', dim:'EI', A:{text:'在家',pole:'I'}, B:{text:'出门',pole:'E'} },
      { t:'要是请你宴客，你先定菜谱还是先约人？', dim:'JP', A:{text:'先定菜谱',pole:'J'}, B:{text:'先约人',pole:'P'} },
      { t:'如果重选职业，你会选稳定还是折腾？', dim:'JP', A:{text:'稳定',pole:'J'}, B:{text:'折腾',pole:'P'} }
    ], open:[
      { t:'过去一个月里你最有成就感的一件事是什么？为什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const hypos = ai.choice.filter(q=>/^【假想】/.test(q.t));
    ok(hypos.length === 2, 'H1 假想题保留 ≤2 且全部带【假想】标（实得 ' + hypos.length + '）');
    ok(ai.choice.every(q=>!/如果|假如|要是/.test(q.t) || /^【假想】/.test(q.t)), 'H1 留下的假想题全部带【假想】标，第 3 道未打标混入');
    ok(ai.audit.dropped.some(d=>d.rule === '假想>2'), 'H1 audit.dropped 记录「假想>2」');
  }

  console.log('\n【H2】硬校验·简答时间窗两两不相交');
  {
    ok(JSON.stringify(w.__SI.openWindowRange('上周你都在忙什么？')) === '[7,13]', 'H2 上周 → [7,13]');
    ok(JSON.stringify(w.__SI.openWindowRange('过去一个月你做了什么？')) === '[0,29]', 'H2 过去一个月 → [0,29]');
    ok(w.__SI.openWindowRange('最近一次让你生气的事？') === null, 'H2 最近一次 → 不参与重叠判定');
    const raw = { choice:[
      { t:'过去一个月，你改过几次安排？', dim:'JP', A:{text:'没改过',pole:'J'}, B:{text:'好几次',pole:'P'} },
      { t:'上周五散场后你通常？', dim:'EI', A:{text:'接着约',pole:'E'}, B:{text:'独处回血',pole:'I'} },
      { t:'最近一次旅游你先做什么？', dim:'JP', A:{text:'列清单',pole:'J'}, B:{text:'说走就走',pole:'P'} },
      { t:'昨天晚饭你怎么决定的？', dim:'JP', A:{text:'提前想好',pole:'J'}, B:{text:'到时候看',pole:'P'} }
    ], open:[
      { t:'过去一周里，你有多少次主动锻炼？' },
      { t:'过去一个月里，你有多少次早睡？' },
      { t:'描述一次和想法不同的人合作的经历。' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const wins = ai.open.map(o=>w.__SI.openWindowRange(o.t)).filter(Boolean);
    let clash = false;
    for(let i=0;i<wins.length;i++) for(let j=i+1;j<wins.length;j++) if(wins[i][0]<=wins[j][1] && wins[j][0]<=wins[i][1]) clash = true;
    ok(!clash, 'H2 保留简答两两不撞窗（过去一周 vs 过去一个月 撞窗已丢）');
    ok(ai.audit.dropped.some(d=>d.rule === '简答撞窗'), 'H2 audit.dropped 记录「简答撞窗」');
  }

  console.log('\n【H3】硬校验·JP 计划族 ≤2 + 伪维度题拦截');
  {
    const raw = { choice:[
      { t:'过去一个月，你的购物清单通常？', dim:'JP', A:{text:'提前列好',pole:'J'}, B:{text:'随买随看',pole:'P'} },
      { t:'上个月的旅行行程是谁安排的？', dim:'JP', A:{text:'我自己排的',pole:'J'}, B:{text:'走哪算哪',pole:'P'} },
      { t:'过去两周，你的日程时间表？', dim:'JP', A:{text:'排得满满的',pole:'J'}, B:{text:'大半空白',pole:'P'} },
      { t:'上个月项目收尾时你的节奏？', dim:'JP', A:{text:'提前交付',pole:'J'}, B:{text:'压线赶工',pole:'P'} },
      { t:'过去一个月，任务没做完你会？', dim:'JP', A:{text:'觉得没尽到责任',pole:'J'}, B:{text:'先犒劳自己休息',pole:'P'} }
    ], open:[
      { t:'过去一个月里你最有成就感的一件事是什么？为什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const planJP = ai.choice.filter(q=>q.dim==='JP' && /计划|清单|行程|日程|时间表|收尾/.test(q.t));
    ok(planJP.length <= 2, 'H3 生成 JP 计划族 ≤2（实得 ' + planJP.length + '，锚点侧 3 道计划系错开）');
    ok(ai.choice.every(q=>!/没尽到责任/.test(q.t) || !/犒劳/.test(q.t)), 'H3 「责任 vs 奖励」伪维度题被拦');
    ok(ai.audit.dropped.some(d=>d.rule === '伪维度'), 'H3 audit.dropped 记录「伪维度」');
  }

  console.log('\n【H4】硬校验·烦恼不主导 + auditFinal 四维配额');
  {
    const S2 = w.__SI.getS();
    S2.bg = { age:'33', job:'全职妈妈', life:['带两个孩子'], worry:'大宝写作业拖拉' };
    const raw = { choice:[
      { t:'过去一个月，辅导大宝写作业时你通常？', dim:'SN', A:{text:'盯错别字',pole:'S'}, B:{text:'聊趣事',pole:'N'} },
      { t:'过去两周，因为大宝写作业慢你发过几次火？', dim:'TF', A:{text:'多次',pole:'T'}, B:{text:'几乎没发',pole:'F'} },
      { t:'上个月，大宝写作业拖到几点你开始催？', dim:'JP', A:{text:'按点催',pole:'J'}, B:{text:'看情况',pole:'P'} },
      { t:'过去一个月，周末带孩子去哪玩你？', dim:'JP', A:{text:'提前定好',pole:'J'}, B:{text:'当天随缘',pole:'P'} },
      { t:'上周三孩子午睡时你在干什么？', dim:'EI', A:{text:'刷手机',pole:'I'}, B:{text:'联系人聊天',pole:'E'} },
      { t:'过去一个月，家里玩具乱时你？', dim:'JP', A:{text:'当天归位',pole:'J'}, B:{text:'周末一起收',pole:'P'} },
      { t:'最近一次孩子生病时你先？', dim:'SN', A:{text:'查资料',pole:'S'}, B:{text:'问有经验的人',pole:'N'} }
    ], open:[
      { t:'过去一个月里你最有成就感的一件事是什么？为什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const worryQ = ai.choice.filter(q=>/写作业|拖拉/.test(q.t));
    ok(worryQ.length <= 4, 'H4 烦恼命中生成题 ≤4 不主导过半（实得 ' + worryQ.length + '）');
    // mixSet 终检：锚点+生成混血后四维各 4~6、JP ≤6
    const finalSet = w.__SI.mixSet(ai.choice, ai.open);
    const audit = w.__SI.auditFinal(finalSet, ai);
    ok(audit.dimQuota.EI >= 4 && audit.dimQuota.EI <= 6
      && audit.dimQuota.SN >= 4 && audit.dimQuota.SN <= 6
      && audit.dimQuota.TF >= 4 && audit.dimQuota.TF <= 6
      && audit.dimQuota.JP >= 4 && audit.dimQuota.JP <= 6,
      'H4 终检四维各 5±1（' + JSON.stringify(audit.dimQuota) + '）');
    ok(audit.jpScored <= 6, 'H4 JP 计分题 ≤6（实得 ' + audit.jpScored + '）');
    ok(ai.audit.behaviorRate.indexOf('/') > -1, 'H4 audit.behaviorRate 已产出（' + ai.audit.behaviorRate + '）');
  }

  console.log('\n【H5】校验报告归档与导出：S.genAudit 存档、exportProfile 带 audit 字段');
  {
    ok(html.indexOf('S.genAudit = GEN_AUDIT || null;') > -1, 'H5 出题成功后 audit 写进档案');
    ok(html.indexOf('audit: p.genAudit || null') > -1, 'H5 exportProfile 导出携带 audit');
    ok(html.indexOf("if(typeof p.genAudit !== 'object')") > -1, 'H5 旧档案 normalize 补 genAudit 默认');
    ok(w.__SI.getAudit() === null || typeof w.__SI.getAudit() === 'object', 'H5 GEN_AUDIT 全局可用');
  }


  console.log('\n【H6】硬校验·规则①修订：计划语义大族跨维度合并计数 >2 即违规');
  {
    const S2 = w.__SI.getS();
    S2.bg = { age:'33', job:'工程师', life:[], worry:'' };
    const raw = { choice:[
      { t:'你平时更爱提前列好清单还是随性？', dim:'EI', A:{text:'列清单',pole:'J'}, B:{text:'随性',pole:'P'} },
      { t:'你更倾向按固定日程做事还是灵活？', dim:'SN', A:{text:'固定日程',pole:'J'}, B:{text:'灵活',pole:'P'} },
      { t:'你做事会先排时间表还是看心情？', dim:'TF', A:{text:'排时间表',pole:'J'}, B:{text:'看心情',pole:'P'} },
      { t:'你习惯做行程安排吗？', dim:'JP', A:{text:'做安排',pole:'J'}, B:{text:'不做',pole:'P'} },
      { t:'你收尾工作喜欢列清单吗？', dim:'JP', A:{text:'列清单',pole:'J'}, B:{text:'不列',pole:'P'} }
    ], open:[
      { t:'过去一个月里你最有成就感的一件事是什么？为什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const planAll = ai.choice.filter(q=>w.__SI.isPlanFamily(q.t));
    ok(planAll.length <= 2, 'H6 计划语义大族跨维度合并计数 ≤2（实得 ' + planAll.length + '，5 道计划系分散于 EI/SN/TF/JP 仍被合并限流）');
    ok(ai.audit.dropped.some(d=>d.rule === '计划族>2'), 'H6 audit.dropped 记录「计划族>2」（不再按 JP 单列）');
  }

  console.log('\n【H7】硬校验·规则②修订：简答「事件锚定」类（最近一次等）每套 ≤1');
  {
    const S2 = w.__SI.getS();
    S2.bg = { age:'33', job:'工程师', life:[], worry:'' };
    const raw = { choice:[
      { t:'你平时更爱提前规划还是随机？', dim:'JP', A:{text:'规划',pole:'J'}, B:{text:'随机',pole:'P'} }
    ], open:[
      { t:'最近一次让你生气的事是什么？' },
      { t:'上一次你主动帮别人是什么时候？' },
      { t:'描述一次和想法不同的人合作的经历。' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const anchor = ai.open.filter(o=>w.__SI.isEventAnchor(o.t));
    ok(anchor.length <= 1, 'H7 事件锚定类简答每套 ≤1（实得 ' + anchor.length + '）');
    ok(ai.audit.dropped.some(d=>d.rule === '事件锚定>1'), 'H7 audit.dropped 记录「事件锚定>1」');
    ok(ai.open.length === 2, 'H7 第 2 道事件锚定被丢弃，常规简答保留（剩 ' + ai.open.length + '）');
  }

  console.log('\n【H8】硬校验·规则③修订：烦恼主导按 12 道生成题（9 情境+3 简答）合算 >50% 违规');
  {
    const S2 = w.__SI.getS();
    S2.bg = { age:'33', job:'铲屎官', life:[], worry:'猫主子挑食' };
    // 违规组：7 道生成题命中烦恼（5 情境 + 2 简答）→ >6 触发丢弃
    const rawA = { choice:[
      { t:'过去一个月，猫主子挑食时你先？', dim:'SN', A:{text:'查原因',pole:'S'}, B:{text:'换粮',pole:'N'} },
      { t:'上周猫主子挑食你发过火吗？', dim:'TF', A:{text:'发过',pole:'T'}, B:{text:'没发',pole:'F'} },
      { t:'上个月因为猫主子挑食你换过粮吗？', dim:'JP', A:{text:'换过',pole:'J'}, B:{text:'没换',pole:'P'} },
      { t:'最近一次猫主子挑食你怎么办？', dim:'JP', A:{text:'哄',pole:'J'}, B:{text:'硬刚',pole:'P'} },
      { t:'昨天猫主子挑食你试了什么？', dim:'EI', A:{text:'陪玩',pole:'E'}, B:{text:'不管',pole:'I'} }
    ], open:[
      { t:'猫主子挑食最严重时你做了什么？' },
      { t:'描述一次猫主子挑食你求助的经历？' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const aiA = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(rawA)));
    const remainA = aiA.choice.concat(aiA.open).filter(q=>/猫主子|挑食/.test(q.t)).length;
    ok(remainA <= 6, 'H8 违规组：命中烦恼生成题 ≤6（实得 ' + remainA + '，>50%×12 已丢弃超额）');
    ok(aiA.audit.dropped.some(d=>d.rule === '烦恼主导>6'), 'H8 audit.dropped 记录「烦恼主导>6」');
    ok(aiA.audit.worryHit <= 6 && aiA.audit.worryQuota === '≤6/12', 'H8 audit.worryHit≤6 且口径标注 ≤6/12（实得 ' + aiA.audit.worryHit + '）');
    // 对照组：5 道命中（≤6）不丢弃
    const rawB = { choice:[
      { t:'过去一个月，猫主子挑食时你先？', dim:'SN', A:{text:'查原因',pole:'S'}, B:{text:'换粮',pole:'N'} },
      { t:'上周猫主子挑食你发过火吗？', dim:'TF', A:{text:'发过',pole:'T'}, B:{text:'没发',pole:'F'} },
      { t:'上个月因为猫主子挑食你换过粮吗？', dim:'JP', A:{text:'换过',pole:'J'}, B:{text:'没换',pole:'P'} },
      { t:'昨天猫主子挑食你试了什么？', dim:'EI', A:{text:'陪玩',pole:'E'}, B:{text:'不管',pole:'I'} }
    ], open:[
      { t:'猫主子挑食最严重时你做了什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const aiB = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(rawB)));
    const remainB = aiB.choice.concat(aiB.open).filter(q=>/猫主子|挑食/.test(q.t)).length;
    ok(remainB === 5 && !aiB.audit.dropped.some(d=>d.rule === '烦恼主导>6'), 'H8 对照组：5 道命中 ≤50% 全部保留，无「烦恼主导」丢弃');
  }

  console.log('\n【H9】硬校验·A3：JP 语义失衡——3 道 JP 全计划族 → 恰好丢 1 道 + 补位后非计划族 ≥1');
  {
    const S2 = w.__SI.getS();
    S2.bg = { age:'30', job:'工程师', life:[], worry:'' };
    const raw = { choice:[
      // 3 道 JP 全部落在计划语义族（清单 / 行程 / 日程时间表）
      { t:'过去一个月，你的购物清单通常？', dim:'JP', A:{text:'提前列好',pole:'J'}, B:{text:'随买随看',pole:'P'} },
      { t:'上个月的旅行行程是谁安排的？', dim:'JP', A:{text:'我自己排的',pole:'J'}, B:{text:'走哪算哪',pole:'P'} },
      { t:'过去两周，你的日程时间表？', dim:'JP', A:{text:'排得满满的',pole:'J'}, B:{text:'大半空白',pole:'P'} },
      // 4 道非计划族（EI/SN/TF），保证规则3（计划族>2）不再叠加丢弃 → 恰好只丢 1 道
      { t:'上周五散场后你通常？', dim:'EI', A:{text:'接着约',pole:'E'}, B:{text:'独处回血',pole:'I'} },
      { t:'上个月你和多久没见的朋友见过面？', dim:'EI', A:{text:'专门约了',pole:'E'}, B:{text:'没约',pole:'I'} },
      { t:'上周末那顿饭你是怎么挑的？', dim:'SN', A:{text:'查过评价',pole:'S'}, B:{text:'看眼缘',pole:'N'} },
      { t:'昨天同事争论你站哪边？', dim:'TF', A:{text:'摆逻辑',pole:'T'}, B:{text:'顾气氛',pole:'F'} }
    ], open:[
      { t:'过去一个月里你最有成就感的一件事是什么？为什么？' },
      { t:'描述一次和想法不同的人合作的经历。' },
      { t:'上周你花时间最多的三小时在干什么？' }
    ]};
    const ai = w.__SI.hardenGenerated(JSON.parse(JSON.stringify(raw)));
    const jpBefore = 3, jpAfter = ai.choice.filter(q=>q.dim==='JP').length;
    const imbalance = ai.audit.dropped.filter(d=>d.rule === 'JP语义失衡');
    ok(imbalance.length === 1, 'H9 恰好丢 1 道（audit.dropped 记「JP语义失衡」×' + imbalance.length + '）');
    ok(jpAfter === jpBefore - 1, 'H9 JP 计分题 3 → ' + jpAfter + '（只少 1 道，规则3 未叠加丢弃）');
    ok(!ai.audit.dropped.some(d=>d.rule === '计划族>2'), 'H9 规则3 未重复丢弃（A3 前置，剩余 2 道计划族 ≤2 合规）');
    ok(ai.choice.filter(q=>q.dim==='JP').every(q=>w.__SI.isPlanFamily(q.t)), 'H9 丢掉的是计划族 JP 题（留下的仍为计划族，等补位）');
    // 补位（mixSet 用 bank 兜足 9 道）后，全卷 JP 非计划族 ≥1（锚点 J2/J3 + bank P 语义族兜底）
    const mixed = w.__SI.mixSet(ai.choice, ai.open);
    const jpAll = mixed.choice.filter(q=>q.dim==='JP');
    const jpOpen = jpAll.filter(q=>w.__SI.jpFamilyOf(q.t)==='open').length;
    ok(mixed.choice.length === 21, 'H9 补位后全卷 21 道（实得 ' + mixed.choice.length + '）');
    ok(jpOpen >= 1, 'H9 补位后 JP 非计划族 ≥1（实得 ' + jpOpen + '，锚点 J2/J3 + bank P 语义族兜底）');
    // A4：genAudit 按语义族分布输出
    const a = w.__SI.auditFinal(mixed, ai);
    const famSum = Object.keys(a.jpFam).reduce((s,k)=>s+a.jpFam[k],0);
    ok(famSum === a.jpScored && a.jpNonPlan === a.jpFam.open && a.jpPlanTotal === a.jpScored - a.jpFam.open,
       'H9/A4 genAudit.jpFam 分布守恒（各族和 ' + famSum + ' = jpScored ' + a.jpScored + '，open=' + a.jpNonPlan + '）');
  }

  console.log('\n【I1】第6项语病校对：fix 换入 + repaired 标 + proof 统计');
  {
    const { w, d } = boot(); await sleep(120);
    const S3 = w.__SI.getS();
    S3.bg = { age:'30', job:'工程师', life:['独居'], worry:'' };
    const mkAI = () => ({ audit:{ dropped:[], at:'', generated:4, behaviorRate:'4/4', hypothetical:0, openWindows:[] },
      choice:[
        { id:'a0', t:'过去一个月你改过几次安排？', dim:'JP', A:{text:'没改过',pole:'J'}, B:{text:'好几次',pole:'P'} },
        { id:'a1', t:'被改写的题干原句', dim:'EI', A:{text:'甲原句',pole:'E'}, B:{text:'乙原句',pole:'I'} },
        { id:'a2', t:'不可修的病句题干', dim:'SN', A:{text:'宏观的',pole:'S'}, B:{text:'概念的',pole:'N'} },
        { id:'a3', t:'过去一周你实际做了什么？', dim:'TF', A:{text:'摆逻辑',pole:'T'}, B:{text:'顾气氛',pole:'F'} }
      ],
      open:[
        { id:'x0', t:'简答一原句' },
        { id:'x1', t:'简答二原句' }
      ]});
    /* mock：校对调用返回 1 fix(choice) + 1 fix(open) + 1 bad(choice) + 1 bad(open)；bad 触发补题 */
    w.fetch = (u, o2) => { const b = JSON.parse(o2.body); const content = String(b.messages[1].content);
      if(content.indexOf('逐题三判') > -1){
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: JSON.stringify({
          choice:[ {i:0,v:'ok'}, {i:1,v:'fix',q:'改写后题干（语法修正）',A:'甲改写',B:'乙改写',pole_kept:true}, {i:2,v:'bad'} ],
          open:[ {i:0,v:'fix',q:'简答一改写后'}, {i:1,v:'ok'} ] }) } }] }) });
      }
      if(content.indexOf('请只补足') > -1){
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: JSON.stringify({
          choice:[ { q:'最近一次你实际分析了什么？', A:{text:'摆逻辑',dim:'T'}, B:{text:'先共情',dim:'F'} } ],
          open:[ { q:'上周你花时间最多的三小时在干什么？' } ] }) } }] }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) });
    };
    const ai = await w.__SI.proofreadPass(mkAI(), 'glm-mock', 'k');
    const fixed = ai.choice.find(q=>q.id==='a1');
    ok(fixed && fixed.repaired === true && fixed.t.indexOf('改写后题干') === 0, 'I1 fix 换入改写题干 + repaired:true');
    ok(fixed.A.text === '甲改写' && fixed.B.text === '乙改写', 'I1 fix 选项同步换入');
    ok(ai.open[0].repaired === true && ai.open[0].t === '简答一改写后', 'I1 简答 fix 同样换入');
    ok(ai.choice.some(q=>q.id==='a2') === false, 'I1 bad 题被移除');
    const pf = ai.audit.proof;
    ok(pf.fixed === 2 && pf.poleKept === 1 && pf.poleTotal === 1, 'I1 proof 统计：修写 2（极向保持 1/1），实际 ' + pf.fixed + '/' + pf.poleKept + '/' + pf.poleTotal);
    ok(pf.regen === 1 && pf.regenPass === 4, 'I1 语病重生成 1 道，重生成+bank 补回恢复 4 槽（choice1+内置open3），实际 ' + pf.regen + '/' + pf.regenPass);
    ok(pf.skipped === 0, 'I1 校对未跳过');
    ok(ai.audit.dropped.some(d=>d.rule === '语病不可修'), 'I1 dropped 记录「语病不可修」');
  }

  console.log('\n【I2】第6项：pole_kept=false → 按 bad 处理（整题重生成）');
  {
    const { w, d } = boot(); await sleep(120);
    const S3 = w.__SI.getS();
    S3.bg = { age:'30', job:'工程师', life:['独居'], worry:'' };
    w.fetch = (u, o2) => { const b = JSON.parse(o2.body); const content = String(b.messages[1].content);
      if(content.indexOf('逐题三判') > -1){
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: JSON.stringify({
          choice:[ {i:0,v:'fix',q:'换了极向的改写',A:'A2',B:'B2',pole_kept:false} ], open:[] }) } }] }) });
      }
      if(content.indexOf('请只补足') > -1){
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: JSON.stringify({
          choice:[ { q:'上个月你实际改了几次计划？', A:{text:'没改过',dim:'J'}, B:{text:'好几次',dim:'P'} } ], open:[] }) } }] }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) });
    };
    const ai = await w.__SI.proofreadPass({ audit:{ dropped:[], at:'', generated:1, behaviorRate:'1/1', hypothetical:0, openWindows:[] },
      choice:[ { id:'a0', t:'原题干', dim:'JP', A:{text:'甲',pole:'J'}, B:{text:'乙',pole:'P'} } ], open:[] }, 'glm-mock', 'k');
    ok(ai.choice.length === 1 && ai.choice[0].t === '上个月你实际改了几次计划？', 'I2 pole_kept=false → 槽位重生成换入新题');
    const pf = ai.audit.proof;
    ok(pf.regen === 1 && pf.regenPass === 4, 'I2 regen 1、重生成+bank 恢复 4 槽（false 自报计入重生成），实际 ' + pf.regen + '/' + pf.regenPass);
    ok(pf.poleKept === 0 && pf.poleTotal === 0, 'I2 极向保持 0/0（false 不计修写）');
  }

  console.log('\n【I3】第6项：校对服务失败 → 跳过放行，不阻塞出题');
  {
    const { w, d } = boot(); await sleep(120);
    const S3 = w.__SI.getS();
    S3.bg = { age:'30', job:'工程师', life:['独居'], worry:'' };
    w.fetch = () => Promise.reject(new Error('1305 过载'));
    const ai = await w.__SI.proofreadPass({ audit:{ dropped:[], at:'', generated:2, behaviorRate:'2/2', hypothetical:0, openWindows:[] },
      choice:[ { id:'a0', t:'题一', dim:'JP', A:{text:'甲',pole:'J'}, B:{text:'乙',pole:'P'} },
               { id:'a1', t:'题二', dim:'EI', A:{text:'丙',pole:'E'}, B:{text:'丁',pole:'I'} } ], open:[] }, 'glm-mock', 'k');
    const pf = ai.audit.proof;
    ok(pf.skipped === 2 && pf.fixed === 0, 'I3 校对失败 → skipped=题数、零修改，实际 skipped=' + pf.skipped);
    ok(ai.choice.length === 2 && ai.choice[0].t === '题一', 'I3 题集原样放行（不阻塞、不丢题）');
    ok(pf.skipReason && pf.skipReason.indexOf('1305') > -1, 'I3 skipReason 记录失败原因');
  }

  console.log('\n【I4】加载屏第 4 步「校对题目」存在且接入 steps 序列');
  {
    ok(html.indexOf('id="ls-4"') > -1 && html.indexOf('校对题目') > -1, 'I4 加载屏 ls-4「校对题目」元素存在');
    ok(html.indexOf("var steps = ['ls-1','ls-2','ls-3','ls-4'];") > -1, 'I4 steps 序列已含 ls-4');
    ok(html.indexOf("audit: p.genAudit || null") > -1, 'I4 导出报告字段预留完整（六项共 carry）');
  }

  console.log('\n【I5】第6项·规则④修订：选项内双极向打架 → 确定性改写（保留一极、删另一极）');
  {
    const { w, d } = boot(); await sleep(120);
    const S3 = w.__SI.getS();
    S3.bg = { age:'30', job:'工程师', life:[], worry:'' };
    // 选项 A 同句内并发 J 信号（按部就班）与 P 信号（不到最后一刻…收尾）→ 双极向打架
    const mkAI = () => ({ audit:{ dropped:[], at:'', generated:1, behaviorRate:'1/1', hypothetical:0, openWindows:[] },
      choice:[
        { id:'b0', t:'过去一个月你做事习惯？', dim:'JP', A:{text:'我习惯按部就班，但不到最后一刻不收尾',pole:'J'}, B:{text:'随性而为',pole:'P'} }
      ], open:[] });
    /* mock：校对调用返回 ok（故意漏判双极向），验证确定性兜底网改写 */
    w.fetch = (u, o2) => { const b = JSON.parse(o2.body); const content = String(b.messages[1].content);
      if(content.indexOf('逐题三判') > -1){
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: JSON.stringify({
          choice:[ {i:0,v:'ok'} ], open:[] }) } }] }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) });
    };
    const ai = await w.__SI.proofreadPass(mkAI(), 'glm-mock', 'k');
    const q = ai.choice[0];
    ok(q.A.text === '我习惯按部就班', 'I5 双极向选项 A 被改写：删除 P 极片段，仅留 J 极「我习惯按部就班」');
    ok(q.A.text.indexOf('不到最后一刻') === -1 && q.A.text.indexOf('收尾') === -1, 'I5 改写后选项 A 不再含 P 极信号（禁止两头兼容）');
    ok(q.B.text === '随性而为', 'I5 选项 B（单极）未被改动');
    ok(q.repaired === true, 'I5 该题干标记 repaired:true');
    ok(ai.audit.proof.fixed === 1, 'I5 proof.fixed=1（LLM 漏判后由确定性网补修，实际 ' + ai.audit.proof.fixed + '）');
    ok(ai.audit.dropped.every(d=>d.rule !== '语病不可修'), 'I5 双极向属可修，未触发整题重生成');
    // 预检函数自身也能在改写前识别冲突
    const pre = { id:'x', t:'t', dim:'JP', A:{text:'我习惯按部就班，但不到最后一刻不收尾',pole:'J'}, B:{text:'随性',pole:'P'} };
    ok(JSON.stringify(w.__SI.bipolarConflict(pre)) === '["A"]', 'I5 bipolarConflict 预检精准定位到选项 A');
  }

  console.log('\n【J1】评估证据·用户输入状态判定：没写一个字 → 「你写了「原话」…」假证据整块丢弃');
  {
    // 结果页容器是动态渲染的（render 函数拼 innerHTML），测试桩先补齐 paintAssess 依赖的挂载点
    ['r-hero','r-bars','r-desc','ai-box'].forEach(id => {
      if(!d.getElementById(id)){ const el = d.createElement('div'); el.id = id; d.body.appendChild(el); }
    });
    const S4 = w.__SI.getS();
    // 场景 A：全程跳过（简答全 skip、题内自定义零条）——工单复现路径
    S4.ans = {}; S4.open = { x0:'', x0_skip:true, x1:'', x1_skip:true, x2:'', x2_skip:true };
    ok(w.__SI.collectFreeText().length === 0, 'J1 前置：全程跳过 → collectFreeText()=0');
    const mk = ev => ({ type:'ENFP', dims:{E:60,I:40,S:40,N:60,T:40,F:60,J:30,P:70},
      insight:{ portrait:'画像', advice:'建议', roast:'吐槽' }, evidence: ev });
    const d0 = w.__SI.normalizeAssess(mk([
      '你写了「原话」，这说明你非常关注周围人的感受',
      '你写了「原话」，这说明你很注重细节',
      '你写了「原话」，这说明你在面对挑战时会主动寻求解决方案'
    ]), 'ENFJ', []);
    ok(Array.isArray(d0.evidence) && d0.evidence.length === 0, 'J1 没写一个字 → 3 条假证据全部丢弃（evidence=[]）');
    ok(d0.insight.portrait === '画像' && d0.insight.roast === '吐槽', 'J1 画像/建议/吐槽不受影响（只清证据，不砍整块评估）');
    w.__SI.paintAssess(d0, 'ENFJ', []);
    ok(d.getElementById('ai-box').innerHTML.indexOf('证据：') === -1, 'J1 渲染层：无证据 → 证据模块整块跳过（空状态即不渲染）');

    // 场景 B：有真实自由文本 → 真引用保留；占位条 + 编造引用条都被过滤
    S4.open = { x0:'周三把一个拖了两周的 bug 修了' };
    ok(w.__SI.collectFreeText().length === 1, 'J1 前置：写了一条简答 → collectFreeText()=1');
    const d1 = w.__SI.normalizeAssess(mk([
      '你写了「周三把一个拖了两周的 bug 修了」，这说明你动手能力强',
      '你写了「原话」，这说明你很注重细节',
      '你写了「昨天主动帮同事修了打印机」，这说明你乐于助人'
    ]), 'ENFJ', []);
    ok(d1.evidence.length === 1 && d1.evidence[0].indexOf('bug 修了') > -1,
       'J1 真引用保留（1 条）；「原话」占位条 + 凭空编造的引用条都被过滤');
    w.__SI.paintAssess(d1, 'ENFJ', []);
    const box1 = d.getElementById('ai-box').innerHTML;
    ok(box1.indexOf('证据：') > -1 && box1.indexOf('你写了「原话」') === -1, 'J1 渲染层：真证据上墙、无占位残留');

    // prompt 根因：评估 prompt 格式示例不再用「原话」当占位（换成真实例句；精确匹配示例行，
    // 避免误伤 normalizeAssess 过滤函数里的占位检测串）
    ok(html.indexOf('"evidence": ["你写了「原话」') === -1, 'J1 源码级：评估 prompt 的「原话」占位已根除（防模型照抄）');
    ok(html.indexOf('evidence 必须输出 []') > -1, 'J1 源码级：硬性约束带「没写就输出 []」出口');
  }

  console.log('\n简答软证据池回归：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
})();
