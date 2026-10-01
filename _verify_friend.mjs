/* 朋友观察模式（作答模式贯通全链路）交付前自检 —— 对应任务 §7 四项。
   覆盖：
   ① 朋友模式全流程：出题 prompt 第三人称 / 跳过按钮可用并计入 localStorage /
      结果页代词与顶部标注正确 / 简答题题面以「据你观察，TA：」起头
   ② 跳过过半的维度 → 结果页显示「了解不足 · 规则默认」（仅该维度）
   ③ 本人模式全流程与改动前一致（无串扰）：无 friend-note / 无 了解不足 误标 /
      无矛盾块 / 分享卡无「我给朋友测出了」/ 结果页为「你的三句真话」
   ④ mock 转述矛盾 → 「你观察到的 TA · 言行对照」块渲染；无矛盾不渲染
   ⑤ 分享卡：朋友模式含「我给朋友测出了 XXXX」，本人模式不含
   纯本地 jsdom，fetch 用 mock（不命中真实 API）。 */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';
const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
function LS(win){ return JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); }
function AP(win){ const st = LS(win); return (st && st.profiles) ? st.profiles[0] : st; }
function ACTIVE(win){ const st = LS(win); if(!(st && st.profiles)) return null; return st.profiles.find(p => p.id === st.activeId) || st.profiles[0]; }

function makeAIChoice(n){ const d=['EI','SN','TF','JP'],pl={EI:['E','I'],SN:['S','N'],TF:['T','F'],JP:['J','P']}; const c=[]; for(let i=0;i<n;i++){ const dim=d[i%4]; c.push({q:`[${dim}]情境${i}`,A:{text:'A'+i,dim:pl[dim][0]},B:{text:'B'+i,dim:pl[dim][1]}}); } return c; }
function makeAIOpen(n){ const o=[]; for(let i=0;i<n;i++) o.push({q:'简答'+i+'：最近一次让你纠结的事？'}); return o; }
function aiJSON(cc,oc){ return JSON.stringify({choice:makeAIChoice(cc),open:makeAIOpen(oc)}); }

/* 一份合法的综合评估 JSON（朋友模式才会带 evidence_contradiction） */
function assessJSON(contra){
  return JSON.stringify({
    type:'INFP',
    dims:{ E:40, I:60, S:35, N:65, T:30, F:70, J:20, P:80 },
    insight:{ portrait:'portrait text 画像', advice:'advice text 建议', roast:'roast text 吐槽' },
    evidence:['你写了「原话」，这说明……'],
    replies_review:[{ quote:'原话摘抄', read:'神回复解读' }],
    evidence_contradiction: contra || []
  });
}

/* boot：可注入 seedLS（finished 档案 → 启动即渲染结果页）、assess（流式评估返回文本） */
function boot(opts){
  const o = opts || {};
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window; w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  if(o.seedLS != null) w.localStorage.setItem('soul_interrogator_v1', o.seedLS);
  const calls = { n:0, list:[] };
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body);
    calls.n++;
    const content = (b.messages && b.messages[0] && b.messages[0].content) || '';
    const usr = (b.messages && b.messages[1] && b.messages[1].content) || '';
    calls.list.push({ stream: !!b.stream, content, usr });
    if(b.stream){
      // 评估（流式）：streamAssess 走非 SSE 的 json() 分支，返回 choices[0].message.content
      return Promise.resolve({ ok:true, status:200,
        json:()=>Promise.resolve({ choices:[{ message:{ content: o.assess || assessJSON() } }] }), body:null });
    }
    const seq = o.seq || [[9,3]];
    const idx = Math.min(calls.n-1, seq.length-1);
    const [cc,oc] = seq[idx];
    return Promise.resolve({ ok:true, status:200,
      json:()=>Promise.resolve({ choices:[{ message:{ content: aiJSON(cc,oc) } }] }) });
  };
  w.html2canvas = () => Promise.resolve({ toDataURL:()=>'data:image/png;base64,', toBlob:cb=>cb(new w.Blob(['x'],{type:'image/png'})) });
  Object.defineProperty(w.navigator, 'canShare', { value:()=>true, configurable:true });
  Object.defineProperty(w.navigator, 'share', { value:()=>Promise.resolve(), configurable:true });
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d:w.document, calls, dom };
}
async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await sleep(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await sleep(1300); }
async function newFriend(w,d,name){
  d.querySelector('#prof-new-friend').click(); await sleep(30);
  const inp = d.querySelector('#prof-name-input');
  inp.value = name; inp.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelector('#prof-create-ok').click(); await sleep(60);
}

/* 造一份已完成的档案存档（每维 6 题 + 3 简答），用于结果页/评分的确定性断言。
   insufficientDim 指定哪个维度被跳过过半（>half）。 */
function buildPreset(kind, name, opts){
  opts = opts || {};
  const dims = [['EI','E','I'],['SN','S','N'],['TF','T','F'],['JP','J','P']];
  const choice = [], order = []; const idsByDim = {}; let id = 0;
  dims.forEach(([key,A,B])=>{ idsByDim[key] = []; for(let i=0;i<6;i++){ const cid='c'+(id++); choice.push({ id:cid, dim:key, A:{pole:A}, B:{pole:B}, t:'q'+cid }); idsByDim[key].push(cid); } });
  const ans = {};
  dims.forEach(([key,A,B])=>{
    const ids = idsByDim[key];
    if(opts.insufficientDim === key){
      for(let i=0;i<6;i++) ans[ids[i]] = (i < 2) ? { pick:'a' } : { pick:null, skipped:true };
    } else {
      for(let i=0;i<6;i++) ans[ids[i]] = { pick:'a' };
    }
  });
  const open = [], openAns = {};
  for(let k=0;k<3;k++){ const oid='o'+k; open.push({ id:oid, t:'题'+(k+1) }); openAns[oid] = '观察：TA 平时' + k; }
  choice.forEach(q=>order.push(q.id));
  open.forEach(o=>order.push(o.id));
  const profile = {
    id:'p_'+kind+'_'+Date.now(), name:name||'', kind:kind,
    step:'result', finished:true, order:order, ans:ans, open:openAns,
    qset:{ choice:choice, open:open, anchorCount:12, aiCount:9, bankCount:0 },
    qsrc:'ai', qfall:'', qgenModel:'glm-4.7-flash', bgSig:'', resultCode: opts.code || 'INFP',
    bg:{age:'25-30 岁',job:'设计师',life:['职场'],worry:''}, mode:'quiz',
    claimedType:'', reason:'', messages:[], round:0, report:null, reportModel:'', notebook:[], note:'',
    verify_round:0, verify_messages:[], verify_report:null, verify_done:false, verify_note:''
  };
  return JSON.stringify({ v:1, profiles:[profile], activeId:profile.id });
}

(async()=>{
  console.log('\n【F1】自检①：朋友模式全流程（第三人称出题 / 跳过可用 / 结果代词与标注 / 简答题面）');
  {
    const { w, d, calls, dom } = boot({});
    await sleep(80);
    d.querySelector('#btn-profiles').click(); await sleep(30);
    await newFriend(w, d, '阿杰');
    await fillBg(w,d);
    // 出题 prompt 含朋友观察者语境（第三人称 + 朋友观察模式）
    ok(calls.list.length >= 1 && /朋友观察模式/.test(calls.list[0].usr), '出题 prompt 注入「朋友观察模式」语境');
    ok(calls.list.length >= 1 && /第三人称/.test(calls.list[0].usr), '出题 prompt 要求第三人称「TA」视角');

    // 走完整个作答：前 3 道选择题点「不知道」跳过，其余正常选 A；简答正常作答
    let g=0, choiceN=0, sawOpenPrefix=false, skippedPersist=0;
    while(d.querySelector('#page-test').classList.contains('active') && g++<60){
      const openEl = d.querySelector('#op-i');
      if(openEl){
        const qt = d.querySelector('#t-card .q-text');
        if(qt && /据你观察，TA：/.test(qt.textContent)) sawOpenPrefix = true;
        openEl.value = '观察：TA 平时爱组局'; openEl.dispatchEvent(new w.Event('input',{bubbles:true}));
        d.querySelector('#op-ok').click(); await sleep(20); continue;
      }
      if(choiceN < 3){
        const skipBtn = d.querySelector('#q-skip');
        if(skipBtn){ skipBtn.click(); await sleep(280); choiceN++; continue; }
      }
      d.querySelectorAll('#t-card .opt')[0].click(); await sleep(270); choiceN++;
    }
    await sleep(200);
    const act = ACTIVE(w);
    Object.keys(act.ans).forEach(k => { if(act.ans[k] && act.ans[k].skipped) skippedPersist++; });
    ok(skippedPersist >= 3, '跳过按钮生效：至少 3 道选择题的作答被标 skipped 并落盘（' + skippedPersist + '）');
    ok(sawOpenPrefix, '朋友模式简答题题面以「据你观察，TA：」起头');

    ok(!!d.querySelector('.friend-note') && /在你眼中的样子/.test(d.querySelector('.friend-note').textContent), '结果页顶部标注「以下结果基于你的观察，是 TA 在你眼中的样子」');
    ok(/TA 的三句真话/.test(d.querySelector('#page-result').innerHTML), '结果页为「TA 的三句真话」');
    const badge = d.querySelector('.obs-badge');
    ok(badge && /阿杰/.test(badge.textContent) && /非 阿杰 本人自述/.test(badge.textContent), '观察者角标含朋友名「阿杰」并标注「非 本人自述」');
    if(global.gc) global.gc(); try{ dom.window.close(); }catch(e){}
  }

  console.log('\n【F2】自检②：跳过过半的维度 → 显示「了解不足 · 规则默认」（仅该维度）');
  {
    const seed = buildPreset('friend', '小敏', { insufficientDim:'EI' });
    const { w, d, dom } = boot({ seedLS: seed });
    await sleep(900);
    const bars = d.querySelector('#r-bars').innerHTML;
    ok(/了解不足 · 规则默认/.test(bars), '结果页出现「了解不足 · 规则默认」标注');
    const n = (bars.match(/了解不足 · 规则默认/g) || []).length;
    ok(n === 1, '该标注仅出现在被跳过过半的维度（EI），共 1 处（实得 ' + n + '）');
    ok(!!d.querySelector('.friend-note'), '朋友结果页顶部标注存在（确认处于朋友模式）');
    if(global.gc) global.gc(); try{ dom.window.close(); }catch(e){}
  }

  console.log('\n【F3】自检③：本人模式全流程与改动前一致（无串扰）');
  {
    const seed = buildPreset('self', '', {});
    const { w, d, dom } = boot({ seedLS: seed });
    await sleep(900);
    ok(!d.querySelector('.friend-note'), '本人结果页无 friend-note 顶部标注');
    ok(!d.querySelector('.obs-badge'), '本人结果页无观察者角标');
    ok(!/了解不足 · 规则默认/.test(d.querySelector('#r-bars').innerHTML), '本人结果页不因改动误标「了解不足 · 规则默认」');
    ok(/你的三句真话/.test(d.querySelector('#page-result').innerHTML) && !/TA 的三句真话/.test(d.querySelector('#page-result').innerHTML), '本人结果页为「你的三句真话」（未被第三人称串改）');
    ok(!d.querySelector('.ev.contra'), '本人评估无「言行对照」块');
    ok(!/我给朋友测出了/.test(d.querySelector('#page-result').innerHTML), '本人模式全文不含「我给朋友测出了」');
    if(global.gc) global.gc(); try{ dom.window.close(); }catch(e){}
  }

  console.log('\n【F4】自检④：言行对照块（self=言行对照 / friend=你观察到的 TA）');
  {
    // —— 朋友模式：mock 转述矛盾 → 块渲染且双边引用齐全 ——
    const seedC = buildPreset('friend', '小林', {});
    const { w, d, calls, dom } = boot({ seedLS: seedC, assess: assessJSON([
      { label_quote:'TA 亲口说过自己社恐、怕生人', behavior_quote:'但你观察到每次聚会 TA 都最嗨、主动张罗', read:'嘴上说怕人，行动最 social' }
    ]) });
    await sleep(1500);
    const streamCall = calls.list.find(c => c.stream);
    ok(streamCall && /朋友观察模式|观察者/.test(streamCall.content), '评估 prompt 含朋友观察者语境（friendAssessCtx 生效）');
    const contraF = d.querySelector('.ev.contra');
    ok(!!contraF, '朋友模式「你观察到的 TA · 言行对照」块渲染');
    ok(contraF && /转述 TA 说/.test(contraF.textContent) && /你观察到的/.test(contraF.textContent), '矛盾块含「转述 TA 说 / 你观察到」双栏');
    ok(contraF && /嘴上说怕人/.test(contraF.textContent), '矛盾块点破说明文字渲染');
    if(global.gc) global.gc(); try{ dom.window.close(); }catch(e){}

    // —— 朋友模式：无矛盾 → 块不渲染 ——
    const { w:w2, d:d2, dom:dom2 } = boot({ seedLS: buildPreset('friend', '小何', {}), assess: assessJSON([]) });
    await sleep(1500);
    ok(!d2.querySelector('.ev.contra'), '无矛盾时「你观察到的 TA · 言行对照」块不渲染');
    ok(!/你观察到的 TA · 言行对照/.test(d2.querySelector('#ai-box').innerHTML), '无矛盾时评估区不含矛盾块标题');
    if(global.gc) global.gc(); try{ dom2.window.close(); }catch(e){}

    // —— 本人模式：mock 言行对照 → 块渲染（标题为「言行对照」）且双边引用齐全 ——
    const { w:w3, d:d3, dom:dom3 } = boot({ seedLS: buildPreset('self', '', {}), assess: assessJSON([
      { label_quote:'我其实很外向', behavior_quote:'但上个月我推掉了三次聚会', read:'理想自我 vs 情境差异' }
    ]) });
    await sleep(1500);
    const contraS = d3.querySelector('.ev.contra');
    ok(!!contraS, '本人模式「言行对照」块渲染');
    ok(contraS && /你写的标签/.test(contraS.textContent) && /你写的行为/.test(contraS.textContent), '块含「你写的标签 / 你写的行为」双栏');
    if(global.gc) global.gc(); try{ dom3.window.close(); }catch(e){}

    // —— 本人模式：无矛盾 → 块不渲染 ——
    const { w:w4, d:d4, dom:dom4 } = boot({ seedLS: buildPreset('self', '', {}), assess: assessJSON([]) });
    await sleep(1500);
    ok(!d4.querySelector('.ev.contra'), '本人模式无矛盾时「言行对照」块不渲染');
    if(global.gc) global.gc(); try{ dom4.window.close(); }catch(e){}

    // —— 单边引用（只有标签句，无行为句）→ 不渲染 ——
    const { w:w5, d:d5, dom:dom5 } = boot({ seedLS: buildPreset('self', '', {}), assess: assessJSON([
      { label_quote:'我其实很外向', behavior_quote:'', read:'缺行为句' }
    ]) });
    await sleep(1500);
    ok(!d5.querySelector('.ev.contra'), '单边引用（缺行为句）时不渲染言行对照块');
    if(global.gc) global.gc(); try{ dom5.window.close(); }catch(e){}
  }

  console.log('\n【F5】自检⑤（§5 分享卡）：朋友模式含「我给朋友测出了」，本人模式不含');
  {
    const friendSeed = buildPreset('friend', '阿强', {});
    const { w, d, dom } = boot({ seedLS: friendSeed });
    await sleep(900);
    d.querySelector('#r-shot').click(); await sleep(400);
    const card = d.querySelector('#share-card').innerHTML;
    ok(/sc-friend/.test(card) && /我给朋友测出了/.test(card), '朋友模式分享卡含「我给朋友测出了 XXXX」');
    if(global.gc) global.gc(); try{ dom.window.close(); }catch(e){}

    const selfSeed = buildPreset('self', '', {});
    const { w:w2, d:d2, dom:dom2 } = boot({ seedLS: selfSeed });
    await sleep(900);
    d2.querySelector('#r-shot').click(); await sleep(400);
    ok(!/我给朋友测出了/.test(d2.querySelector('#share-card').innerHTML), '本人模式分享卡不含「我给朋友测出了」');
    if(global.gc) global.gc(); try{ dom2.window.close(); }catch(e){}
  }

  console.log('\n========================================');
  console.log('  朋友观察模式（全链路）自检：' + pass + ' 通过 / ' + fails.length + ' 失败');
  console.log('========================================');
  if(fails.length){ console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})();
