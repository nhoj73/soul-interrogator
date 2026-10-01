/* 针对性回归：选择题「自定义答案」引用 A/B 时，评估 AI 必须拿到选项原文。
   复现用户场景：正式访谈里用户点「选项不准？自己写」，写“在A的基础上…在B的基础上…”，
   若 collectFreeText 不带选项文本，AI 不知道 A/B 指什么 → 误判维度。
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
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }

const dims = ['EI','SN','TF','JP'], poles = { EI:['E','I'], SN:['S','N'], TF:['T','F'], JP:['J','P'] };
function makeAIChoice(n){ const choice=[]; for(let i=0;i<n;i++){ const dim=dims[i%4]; choice.push({ q:`[${dim}] 情境${i}`, A:{text:'情境'+i+'的A面',dim:poles[dim][0]}, B:{text:'情境'+i+'的B面',dim:poles[dim][1]} }); } return choice; }
function makeAIOpen(n){ const o=[]; for(let i=0;i<n;i++) o.push({ q:'简答'+i+'：最近一次让你纠结的事是什么？' }); return o; }
function aiJSON(cc, oc){ return JSON.stringify({ choice: makeAIChoice(cc), open: makeAIOpen(oc) }); }

const assessJSON = JSON.stringify({ type:'INFP', dims:{E:30,I:70,S:40,N:60,T:35,F:65,J:25,P:75},
  insight:{ portrait:'p', advice:'a', roast:'r' }, evidence:['你说原话'], replies_review:[{quote:'原话',read:'read'}] });
const sseFull = (txt) => { const sse='data: '+JSON.stringify({choices:[{delta:{content:txt}}]})+'\\n\\ndata: [DONE]\\n\\n';
  const enc=new TextEncoder(); const bytes=enc.encode(sse); let i=0;
  return { ok:true, status:200, body:{ getReader:()=>({ read(){ if(i>=bytes.length) return Promise.resolve({done:true});
    const c=bytes.slice(i,i+Math.min(40,bytes.length-i)); i+=c.length; return Promise.resolve({done:false,value:c}); } }) } }; };

function boot(seq){
  const calls = { n:0, models:[], assess:[] };
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window; w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u,o2) => {
    const b = JSON.parse(o2.body); calls.models.push(b.model);
    if(b.stream){
      if(b.messages && b.messages[1] && /【用户自由作答原文】/.test(b.messages[1].content)) calls.assess.push(b.messages[1].content);
      return Promise.resolve(sseFull(assessJSON));
    }
    const idx = calls.n++; const [cc, oc] = (seq[idx] || seq[seq.length-1]);
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: aiJSON(cc, oc) } }] }) });
  };
  w.html2canvas = () => Promise.resolve({ toDataURL:()=>'data:image/png;base64,', toBlob:cb=>cb(new w.Blob(['x'],{type:'image/png'})) });
  Object.defineProperty(w.navigator, 'canShare', { value:()=>true, configurable:true });
  Object.defineProperty(w.navigator, 'share',    { value:()=>Promise.resolve(), configurable:true });
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d:w.document, calls };
}
async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await sleep(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await sleep(1200); }
async function answerWithCustom(w,d,customText){
  let guard=0, did=false;
  while(d.querySelector('#page-test').classList.contains('active') && guard++<60){
    if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答回答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await sleep(20); continue; }
    if(d.querySelector('#alt-t') && !did){ d.querySelector('#alt-t').click(); await sleep(20); const ta=d.querySelector('#alt-i'); ta.value=customText; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#alt-ok').click(); did=true; await sleep(240); continue; }
    d.querySelectorAll('#t-card .opt')[0].click(); await sleep(240);
  }
}

(async()=>{
  console.log('\n【VO1】选择题自定义答案引用 A/B → 评估上下文必须带选项原文');
  const customText = '在A的基础上我更克制，在B的基础上更随性';
  const {w,d,calls} = boot([[9,3]]);
  await sleep(60); await fillBg(w,d);
  await answerWithCustom(w,d,customText); await sleep(1600);

  const captured = calls.assess[0] || '';
  ok(captured.length > 0, '评估请求已发出并抓到 user 消息');
  ok(captured.includes(customText), '评估上下文包含用户自定义原文「' + customText + '」');
  ok(/该题选项：A\./.test(captured), '评估上下文标注了「该题选项：A.」格式（选项原文已注入）');
  ok(/若用户作答里出现「A」「B」等指代，即指这里/.test(captured), '评估上下文提示 A/B 指代来源');

  const st = AP(w);
  let target=null;
  for(const cq of st.qset.choice){ if(st.ans[cq.id] && st.ans[cq.id].custom && st.ans[cq.id].custom.includes('在A的基础上')){ target=cq; break; } }
  ok(!!target, '存档里找到写了自定义答案（含「在A的基础上」）的选择题');
  if(target){
    ok(captured.includes(target.A.text), '评估上下文包含该选择题 A 选项原文：' + target.A.text);
    ok(captured.includes(target.B.text), '评估上下文包含该选择题 B 选项原文：' + target.B.text);
    ok(target.A.text && target.B.text, '该选择题确实存在 A/B 双选项文本（非空）');
  }

  console.log('\n' + '='.repeat(46));
  if(fails.length){ console.log(`失败 ${fails.length} / 通过 ${pass}`); fails.forEach(f=>console.log(' ✗ '+f)); process.exit(1); }
  else console.log(`全部通过（${pass} 项）`);
})();
