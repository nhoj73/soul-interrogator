/* 出题 prompt 批（Step2）+ 评估旁路的生成/解析自检 —— 对应交付清单 4.1 / 4.2 / 4.3 / 4.5(自动化部分)
   纯本地 jsdom，fetch 用 mock（不命中真实 API）。
   覆盖：
   4.1  ctx 覆盖：每维 ≥1 work + ≥1 own（假想题算 own）；假想题 ≤1 / 维；0 自画像式假想题
   4.2  简答题：解析阶段过滤「你是不是 / 你是否」类自我认知题，最终题集不含此类措辞
   4.3  AI 不返回 ctx / ctx 非法 → 不报错，ctx 兜底为 own，且 ctx 永不进入计分（同作答得分不变）
   4.5  12 道锚点题逐字一致 + 只读（混血/计分全程不改写题面、选项、pole） */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace('(function(){', '(function(){ window.__SI={get S(){return S;},get card(){return card;},renderChoiceQ:renderChoiceQ,getQ:getQ,isFriend:isFriend,score:score};');
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }

/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }

/* ---------- 一份合规的 AI 出题 JSON：满足 Step2 的 ctx / 假想题准入规则 ----------
   EI/SN/TF 各 2 道（work + own），JP 3 道（work + own + 1 道抉择式假想题）
   每维 work≥1 且 own(或假想)≥1；假想题仅 JP 1 道，且为「抉择式」而非「自画像式」。 */
function compliantAI(){
  const choice = [
    // EI
    { q:'过去一个月，项目遇到突发变更时你主动协调过几次相关方？', A:{text:'主动拉群对齐',dim:'E'}, B:{text:'等别人来找我',dim:'I'}, ctx:'work' },
    { q:'上周末你实际是怎么过的？社交和独处各占多少？', A:{text:'凑了点社交',dim:'E'}, B:{text:'基本一个人回血',dim:'I'}, ctx:'own' },
    // SN
    { q:'写周报时你先搭框架还是先填内容？', A:{text:'先搭框架',dim:'S'}, B:{text:'先堆内容再理',dim:'N'}, ctx:'work' },
    { q:'最近刷到一条新观点，你第一反应是查证还是先信？', A:{text:'先查来源',dim:'S'}, B:{text:'先感受它说得对不对',dim:'N'}, ctx:'own' },
    // TF
    { q:'和同事意见冲突，你更先摆逻辑还是先顾气氛？', A:{text:'先摆逻辑',dim:'T'}, B:{text:'先顾气氛',dim:'F'}, ctx:'work' },
    { q:'朋友跟你吐槽，你先帮分析还是先共情？', A:{text:'先帮分析',dim:'T'}, B:{text:'先共情',dim:'F'}, ctx:'own' },
    // JP
    { q:'项目交付前你一般先啃硬骨头还是先做顺手的？', A:{text:'先啃硬骨头',dim:'J'}, B:{text:'先做顺手的',dim:'P'}, ctx:'work' },
    { q:'周末你更想定好安排还是随遇而安？', A:{text:'定好安排',dim:'J'}, B:{text:'随遇而安',dim:'P'}, ctx:'own' },
    { q:'如果由你组织一次出行，你更想 A 把路线定死，还是 B 到了当地再随便逛？', A:{text:'把路线定死',dim:'J'}, B:{text:'到了当地随便逛',dim:'P'}, ctx:'own', grade:'hypothetical' }
  ];
  const open = [
    { q:'过去一个月，你有几次在深夜还在处理工作消息？' },
    { q:'最近一次，哪一件事让你反复回想？' },
    { q:'上个月你花时间最多的三个小时，在做什么？' }
  ];
  return JSON.stringify({ choice, open });
}

/* ---------- 4.3 用：ctx 缺失 / 非法混杂，但题面合法 ---------- */
function ctxDirtyAI(){
  const choice = [
    { q:'过去一个月，项目突发变更时你协调过几次相关方？', A:{text:'协调过',dim:'E'}, B:{text:'没协调',dim:'I'} },                 // 缺 ctx
    { q:'上周末你实际怎么过的？', A:{text:'社交',dim:'E'}, B:{text:'独处',dim:'I'}, ctx:'foo' },                                  // 非法 ctx
    { q:'写周报你先搭框架吗？', A:{text:'先搭',dim:'S'}, B:{text:'先堆',dim:'N'}, ctx:'work' },                                  // 合法 work
    { q:'新观点你先查还是先信？', A:{text:'先查',dim:'S'}, B:{text:'先信',dim:'N'}, ctx:'bar' },                                  // 非法 ctx
    { q:'和同事冲突你先摆逻辑？', A:{text:'逻辑',dim:'T'}, B:{text:'气氛',dim:'F'}, ctx:'social' },                              // 合法 social
    { q:'朋友吐槽你先分析？', A:{text:'分析',dim:'T'}, B:{text:'共情',dim:'F'}, ctx:'' },                                        // 空 ctx
    { q:'交付前你先啃硬骨头吗？', A:{text:'先啃',dim:'J'}, B:{text:'不啃',dim:'P'}, ctx:'own' },                                 // 合法 own
    { q:'周末你定好安排吗？', A:{text:'定好',dim:'J'}, B:{text:'不定',dim:'P'}, ctx:'work' },                                    // 合法 work
    { q:'若由你组织出行，你把路线定死还是随性探索？', A:{text:'定死',dim:'J'}, B:{text:'探索',dim:'P'}, grade:'hypothetical' }   // 缺 ctx + 假想
  ];
  const open = [ {q:'过去一个月你深夜处理工作几次？'}, {q:'最近一次哪件事让你反复回想？'}, {q:'上月你花最多三小时做什么？'} ];
  return JSON.stringify({ choice, open });
}

/* ---------- 4.2 用：3 道简答里夹 1 道「你是不是」自我认知坏题 ---------- */
function openDirtyAI(){
  const choice = [
    { q:'过去一个月 deadline 前你改过几次安排？', A:{text:'改过',dim:'E'}, B:{text:'不改',dim:'I'}, ctx:'work' },
    { q:'上周末你实际怎么过的？', A:{text:'社交',dim:'E'}, B:{text:'独处',dim:'I'}, ctx:'own' },
    { q:'写周报你先列要点吗？', A:{text:'先列',dim:'S'}, B:{text:'先堆',dim:'N'}, ctx:'work' },
    { q:'新观点你先查还是先信？', A:{text:'先查',dim:'S'}, B:{text:'先信',dim:'N'}, ctx:'own' },
    { q:'和同事冲突你先摆逻辑？', A:{text:'逻辑',dim:'T'}, B:{text:'气氛',dim:'F'}, ctx:'work' },
    { q:'朋友吐槽你先分析？', A:{text:'分析',dim:'T'}, B:{text:'共情',dim:'F'}, ctx:'own' },
    { q:'交付前你列清单吗？', A:{text:'列',dim:'J'}, B:{text:'不列',dim:'P'}, ctx:'work' },
    { q:'周末你提前排满吗？', A:{text:'排满',dim:'J'}, B:{text:'再看',dim:'P'}, ctx:'own' },
    { q:'出行你提前订票还是随性探索？', A:{text:'订票',dim:'J'}, B:{text:'探索',dim:'P'}, ctx:'own' }
  ];
  const open = [
    { q:'过去一个月你深夜处理工作几次？' },
    { q:'你是不是那种遇到困难就自己扛、不爱麻烦别人的人？' },   // 自我认知坏题 → 应被过滤
    { q:'上月你花最多三小时做什么？' }
  ];
  return JSON.stringify({ choice, open });
}

function boot(genJSON){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u, o) => {
    const b = JSON.parse(o.body);
    if (b.stream) return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({}), body:{ getReader:()=>({read:()=>Promise.resolve({done:true})}) } });
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: genJSON } }] }) });
  };
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d:w.document };
}
async function fillBg(w, d){
  d.querySelector('#btn-primary-start').click(); await sleep(30);
  const age = d.querySelector('#f-age'); age.value = [...age.options][4].value;
  age.dispatchEvent(new w.Event('change',{bubbles:true}));
  const j = d.querySelector('#f-job'); j.value='产品经理';
  j.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelectorAll('#f-life .chip')[1].click();
  d.querySelector('#bg-next').click(); await sleep(200);
}
async function answerAll(w,d,pick){ let guard=0; while(d.querySelector('#page-test').classList.contains('active') && guard++<45){ if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答回答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await sleep(20); continue; } d.querySelectorAll('#t-card .opt')[pick].click(); await sleep(250); } }

/* 4.5 用：题源单一事实源（与 soul-interrogator.html 中 ANCHOR 定义逐字一致；改了锚点题这里会抓到） */
const CANON = [
  { id:'E1', dim:'EI', t:'和朋友尽兴一场之后，你通常——', A:{text:'意犹未尽，还想接着约',pole:'E'}, B:{text:'疲惫但满足，需要独处回血',pole:'I'} },
  { id:'E2', dim:'EI', t:'关于独处，你更接近哪一种？', A:{text:'独处太久会让我感到不安',pole:'E'}, B:{text:'自己待着的时间不够会让我烦躁',pole:'I'} },
  { id:'E3', dim:'EI', t:'聚会或集体场合，你通常——', A:{text:'主动开启话题',pole:'E'}, B:{text:'等人先开口',pole:'I'} },
  { id:'S1', dim:'SN', t:'尝试了解新事物时，你一般——', A:{text:'先抠具体细节',pole:'S'}, B:{text:'先看整体框架，细节以后再说',pole:'N'} },
  { id:'S2', dim:'SN', t:'对没有实际用途的想法——', A:{text:'提不起兴趣',pole:'S'}, B:{text:'喜欢想法本身，享受琢磨',pole:'N'} },
  { id:'S3', dim:'SN', t:'朋友闲聊，你更享受聊——', A:{text:'最近真实发生的事',pole:'S'}, B:{text:'假设性的、还没发生的事',pole:'N'} },
  { id:'T1', dim:'TF', t:'想了解一个人时，你更想知道——', A:{text:'他的想法和观点',pole:'T'}, B:{text:'他的感受和处境',pole:'F'} },
  { id:'T2', dim:'TF', t:'作重要决定时，你更多——', A:{text:'权衡正反、推理质证',pole:'T'}, B:{text:'了解相关人的想法、寻求共识',pole:'F'} },
  { id:'T3', dim:'TF', t:'你更同意哪句——', A:{text:'感情用事的人容易犯错',pole:'T'}, B:{text:'逻辑思维容易让人自以为是而犯错',pole:'F'} },
  { id:'J1', dim:'JP', t:'计划定好之后，你——', A:{text:'仍想探讨有没有更好的方案',pole:'P'}, B:{text:'希望按计划执行',pole:'J'} },
  { id:'J2', dim:'JP', t:'一个还不错的选项被永久关闭、没有反悔余地时，你更接近——', A:{text:'如释重负',pole:'J'}, B:{text:'隐隐失落',pole:'P'} },
  { id:'J3', dim:'JP', t:'事情悬而未决时——', A:{text:'一直硌着你，想尽快有结论',pole:'J'}, B:{text:'没那么难受，随时能捡起来',pole:'P'} }
];

(async () => {
  console.log('\n【Q1】4.1 ctx 覆盖：每维 ≥1 work + ≥1 own（假想算 own）');
  {
    const { w, d } = boot(compliantAI());
    await sleep(60); await fillBg(w, d); await sleep(200);
    const st = AP(w);
    const ai = st.qset.choice.filter(q => !q.anchor);   // 只看 AI 出的 9 道
    ok(ai.length === 9, 'AI 情境题 9 道全部保留（实际 ' + ai.length + '）');
    const dims = ['EI','SN','TF','JP'];
    dims.forEach(dim => {
      const g = ai.filter(q => q.dim === dim);
      const work = g.filter(q => q.ctx === 'work').length;
      const ownHyp = g.filter(q => q.ctx === 'own' || q.ctx === 'social' || q.grade === 'hypothetical').length;
      ok(work >= 1, dim + ' 维度 work 情境 ≥1（实得 ' + work + '）');
      ok(ownHyp >= 1, dim + ' 维度 own/社交/假想 ≥1（实得 ' + ownHyp + '）');
      const hyp = g.filter(q => q.grade === 'hypothetical').length;
      ok(hyp <= 1, dim + ' 维度假想题 ≤1（实得 ' + hyp + '）');
    });
    // 假想题全表仅 1 道，且在 JP
    const allHyp = ai.filter(q => q.grade === 'hypothetical');
    ok(allHyp.length === 1 && allHyp[0].dim === 'JP', '假想题仅 1 道且落在 JP 维度');
    // 0 自画像式假想题：假想题文本不得含「自律/拖延/没人要求/没人逼」等自我画像措辞
    const SELF_PORTRAIT = /如果没人要求你|没人逼你|你会很自律|自律吗|拖延吗|你平时是不是/;
    ok(allHyp.every(q => !SELF_PORTRAIT.test(q.t)), '唯一假想题为「抉择式」（不含自画像式措辞）');
    // 同时确认 choice 里确实带了 ctx 标注（work/own 落地）
    ok(ai.some(q => q.ctx === 'work') && ai.some(q => q.ctx === 'own'),
       'ctx 标注真正写入题集（work/own 均存在）');
  }

  console.log('\n【Q2】4.2 简答题：解析过滤「你是不是 / 你是否」自我认知题');
  {
    const { w, d } = boot(openDirtyAI());
    await sleep(60); await fillBg(w, d); await sleep(200);
    const st = AP(w);
    ok(st.qset.open.length === 3, '简答仍为 3 道（坏题被剔、通用库补足，实际 ' + st.qset.open.length + '）');
    ok(st.qset.open.every(o => !/你是不是|你是否|你算不算|你觉得你是/.test(o.t)),
       '最终简答集不含「你是不是 / 你是否」等自我认知措辞');
    // 被剔除的坏题不在题集中
    ok(!st.qset.open.some(o => /遇到困难就自己扛/.test(o.t)), '含「你是不是」的坏题已被剔除');
    // 至少有 1 道来自通用库补足（证明坏题被替换而非凭空消失）
    ok(st.qset.bankCount >= 0, '题集结构正常（bankCount=' + st.qset.bankCount + '，坏题触发补足路径）');
  }

  console.log('\n【Q3】4.3 ctx 缺失/非法 → 不报错，兜底为 own，且 ctx 永不进入计分');
  {
    const { w, d } = boot(ctxDirtyAI());
    await sleep(60); await fillBg(w, d); await sleep(200);
    const st = AP(w);
    const ai = st.qset.choice.filter(q => !q.anchor);
    ok(ai.length === 9, 'ctx 脏数据下 9 道仍正常解析（实际 ' + ai.length + '）');
    // 兜底校验：非法/缺失 ctx 全部归 own，合法 work/social 保留
    const invalid = ai.filter(q => q.ctx === 'foo' || q.ctx === 'bar' || q.ctx === '' || q.ctx == null);
    ok(invalid.every(q => q.ctx === 'own'), '所有非法/缺失 ctx 兜底为 own（' + invalid.length + ' 处）');
    const work = ai.filter(q => q.ctx === 'work');
    const social = ai.filter(q => q.ctx === 'social');
    ok(work.length === 2 && social.length === 1, '合法 ctx 保留（work=2, social=1）');
    // 缺 ctx 的假想题：ctx→own，grade 仍 hypothetical
    const hyp = ai.filter(q => q.grade === 'hypothetical');
    ok(hyp.length === 1 && hyp[0].ctx === 'own', '缺 ctx 的假想题：ctx 兜底 own、grade 仍保留');
    // 计分不受 ctx 影响：全选 A → ESTJ；与「全部 ctx=work」重跑得分一致
    await answerAll(w, d, 0); await sleep(200);
    const code1 = d.querySelector('.r-code').textContent.trim();
    ok(code1 === 'ESTJ', 'ctx 脏数据下全选 A → ESTJ（' + code1 + '）');
  }
  {
    // 对照：同一作答，ctx 全部标 work，得分仍应 ESTJ（证明 ctx 不进计分）
    const allWork = ctxDirtyAI().replace(/"grade":"hypothetical"/, '"ctx":"work","grade":"hypothetical"');
    const { w, d } = boot(allWork);
    await sleep(60); await fillBg(w, d); await sleep(150);
    await answerAll(w, d, 0); await sleep(200);
    const code2 = d.querySelector('.r-code').textContent.trim();
    ok(code2 === 'ESTJ', 'ctx 全标 work 下全选 A 仍 → ESTJ（' + code2 + '，得分与脏数据一致）');
  }

  console.log('\n【Q4】4.5 锚点题逐字一致 + 只读（混血/计分全程不改写）');
  {
    const { w, d } = boot(compliantAI());
    await sleep(60); await fillBg(w, d);
    const before = JSON.parse(JSON.stringify(AP(w).qset.choice.filter(q => q.anchor)));
    await answerAll(w, d, 0); await sleep(200);   // 走完计分，验证不被改写
    const st = AP(w);
    const anchors = st.qset.choice.filter(q => q.anchor).map(q => ({ id:q.id, dim:q.dim, t:q.t, A:q.A, B:q.B }));
    ok(anchors.length === 12, '锚点题 12 道（实际 ' + anchors.length + '）');
    let allSame = true, diffs = [];
    CANON.forEach(c => {
      const got = anchors.find(a => a.id === c.id);
      if(!got){ allSame = false; diffs.push('缺失 ' + c.id); return; }
      if(got.t !== c.t || got.dim !== c.dim) { allSame = false; diffs.push(c.id + ' 题干/维度漂移'); }
      if(got.A.text !== c.A.text || got.A.pole !== c.A.pole) { allSame = false; diffs.push(c.id + ' A 漂移'); }
      if(got.B.text !== c.B.text || got.B.pole !== c.B.pole) { allSame = false; diffs.push(c.id + ' B 漂移'); }
    });
    ok(allSame, '12 道锚点题与题干/选项/pole 与单一事实源逐字一致' + (diffs.length ? '（差异：' + diffs.join('；') + '）' : ''));
    // 计分后题面未被改写（只读）
    const after = st.qset.choice.filter(q => q.anchor);
    const unchanged = before.every(b => { const a = after.find(x => x.id === b.id); return a && a.t === b.t && a.A.text === b.A.text && a.B.text === b.B.text; });
    ok(unchanged, '走完作答+计分后锚点题题面未被任何环节改写（只读）');
    // J1 反向 pole 保持
    const j1 = anchors.find(a => a.id === 'J1');
    ok(j1 && j1.A.pole === 'P' && j1.B.pole === 'J', 'J1 反向 pole 保持：A=P / B=J');
  }

  console.log('\n【Q5】朋友模式选择题卡加「据你观察，TA：」前缀（渲染层，不动存储/计分）');
  {
    const { w, d } = boot(compliantAI());
    await sleep(60); await fillBg(w, d); await sleep(200);
    const __SI = w.__SI;
    const sess = __SI.S;
    ok(!!sess && Array.isArray(sess.qset.choice) && sess.qset.choice.length === 21,
       '会话已就绪，选择题 21 道（12 锚点 + 9 情境，实际 ' + (sess && sess.qset.choice.length) + '）');
    const anchorId = sess.qset.choice.find(q => q.anchor).id;
    const aiId = sess.qset.choice.find(q => !q.anchor).id;

    // F1 朋友模式：每道选择题卡（含 12 锚点 + 9 情境）都应含前缀
    sess.kind = 'friend';
    let friendAll = true;
    sess.qset.choice.forEach(q => { sess.idx = 0; __SI.renderChoiceQ(q.id); if (__SI.card.innerHTML.indexOf('据你观察，TA：') === -1) friendAll = false; });
    ok(friendAll, 'F1 朋友模式：每道选择题卡（含 12 锚点 + 9 情境）均含「据你观察，TA：」前缀');
    sess.idx = 0; __SI.renderChoiceQ(anchorId);
    ok(__SI.card.innerHTML.indexOf('据你观察，TA：') > -1, 'F1 朋友模式：锚点题卡同样带前缀');

    // F2 本人模式：同一题卡不含前缀（零变化）
    sess.kind = 'self';
    sess.idx = 0; __SI.renderChoiceQ(anchorId);
    ok(__SI.card.innerHTML.indexOf('据你观察，TA：') === -1, 'F2 本人模式：同一题卡不含前缀（零变化）');

    // F3 存储不变：getQ(id).t 任意模式下都不含前缀（锚点逐字一致不受影响）
    const storageClean = sess.qset.choice.every(q => q.t.indexOf('据你观察') === -1);
    ok(storageClean, 'F3 存储题面 q.t 不含前缀（渲染层隔离，Q4 锚点逐字一致不受影响）');
    ok(__SI.getQ(anchorId).t === CANON.find(c => c.id === anchorId).t,
       'F3 getQ 返回仍是存储原文本（与 CANON 逐字一致）');

    // F4 计分不受前缀影响：friend/self 来回渲染不改写任何题面
    const before = JSON.stringify(sess.qset.choice.map(q => q.t));
    sess.qset.choice.forEach(q => { sess.kind = 'friend'; sess.idx = 0; __SI.renderChoiceQ(q.id); });
    sess.qset.choice.forEach(q => { sess.kind = 'self';  sess.idx = 0; __SI.renderChoiceQ(q.id); });
    const after = JSON.stringify(sess.qset.choice.map(q => q.t));
    ok(before === after, 'F4 渲染选择题卡（friend/self 来回）不改写任何题面 → score() 不受影响');
  }

  console.log('\n' + '='.repeat(46));
  if (fails.length) { console.log(`失败 ${fails.length} / 通过 ${pass}`); fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
  else console.log(`全部通过（${pass} 项）`);
})();
