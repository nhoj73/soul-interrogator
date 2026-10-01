/* 多档案系统 + 朋友观察者模式（仅扩 quiz 线）交付前自检。
   覆盖自检验项：
   ① 旧扁平存档 → 无感迁移为 kind:'self' 档案且业务字段完整
   ② 朋友档案全链路带朋友视角标注（出题 prompt / 评估 prompt / 简答措辞 / 结果角标 / 验证入口隐藏）
   ③ self 档案行为完全回归（无朋友措辞、验证入口可见）
   ④ 切换不丢进度 + 导出导入 roundtrip 一致
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

/* boot：可注入 seedLS（脚本执行前写入 localStorage）、自定义 seq、prompt 桩 */
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
    calls.list.push({ stream: !!b.stream, content: (b.messages && b.messages[0] && b.messages[0].content) || '', usr: (b.messages && b.messages[1] && b.messages[1].content) || '' });
    if(b.stream){
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({}), body:{ getReader:()=> ({ read:()=>Promise.resolve({done:true}) }) } });
    }
    const seq = o.seq || [[9,3]];
    const idx = Math.min(calls.n-1, seq.length-1);
    const [cc,oc] = seq[idx];
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: aiJSON(cc,oc) } }] }) });
  };
  w.html2canvas = () => Promise.resolve({ toDataURL:()=>'data:image/png;base64,', toBlob:cb=>cb(new w.Blob(['x'],{type:'image/png'})) });
  Object.defineProperty(w.navigator, 'canShare', { value:()=>true, configurable:true });
  Object.defineProperty(w.navigator, 'share', { value:()=>Promise.resolve(), configurable:true });
  if(o.prompt) w.prompt = o.prompt;
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d:w.document, calls };
}
async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await sleep(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await sleep(1200); }
async function answerAll(w,d,pick){ let g=0; while(d.querySelector('#page-test').classList.contains('active') && g++<60){ if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答回答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await sleep(15); continue; } d.querySelectorAll('#t-card .opt')[pick].click(); await sleep(270); } }
/* 新建朋友档案：走页面内联表单（不再依赖原生 prompt，避免 iframe 沙箱里被静默拦截） */
async function newFriend(w,d,name){
  d.querySelector('#prof-new-friend').click(); await sleep(30);
  const inp = d.querySelector('#prof-name-input');
  inp.value = name;
  inp.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelector('#prof-create-ok').click(); await sleep(60);
}

(async()=>{
  console.log('\n【P1】自检①：旧扁平存档 → 无感迁移为 self 档案');
  {
    const flat = JSON.stringify({ step:'home', bg:{age:'23-28 岁',job:'设计师',life:['职场'],worry:''}, order:['a1','a2'], idx:1, ans:{a1:{pick:'a'}}, open:{}, finished:false, qset:{choice:[],open:[]} });
    const { w } = boot({ seedLS: flat });
    await sleep(80);
    const st = LS(w);
    ok(Array.isArray(st.profiles) && st.profiles.length === 1, '迁移后容器含 1 个档案');
    ok(st.profiles[0].kind === 'self', '档案 kind=self');
    ok(st.profiles[0].bg.job === '设计师', 'bg 业务字段（job）完整保留');
    ok(Array.isArray(st.profiles[0].order) && st.profiles[0].order.length === 24, '题序被安全重建为 24 题（损坏存档不白屏）');
  }

  console.log('\n【P2】自检③：self 档案完全回归（无朋友措辞、验证入口可见）');
  {
    const { w, d } = boot({});
    await sleep(80);
    await fillBg(w,d);
    ok(/你的年龄/.test(d.querySelector('#lbl-age').innerHTML), 'bg 年龄标签为「你的年龄」');
    ok(/你的职业/.test(d.querySelector('#lbl-job').innerHTML), 'bg 职业标签为「你的职业」');
    ok(d.querySelector('#home-friend-hint').style.display === 'none', '首页朋友提示行隐藏');
    ok(AP(w).kind === 'self', '当前档案 kind=self');
    await answerAll(w,d,0);
    await sleep(200);
    ok(!d.querySelector('.obs-badge'), '结果页无观察者角标');
    ok(d.querySelector('#r-verify').style.display !== 'none', 'self 档案验证入口可见');
  }

  console.log('\n【P3】自检②：朋友档案全链路带朋友视角标注');
  {
    const { w, d, calls } = boot({});
    await sleep(80);
    d.querySelector('#btn-profiles').click(); await sleep(30);       // 打开档案页
    ok(d.querySelector('#page-profiles').classList.contains('active'), '档案页已打开');
    await newFriend(w, d, '小明');                                    // 内联表单新建朋友档案
    ok(ACTIVE(w).kind === 'friend', '当前档案切换为 friend');
    ok(d.querySelector('#home-friend-hint').style.display !== 'none', '首页朋友提示行显示');
    await fillBg(w,d);
    ok(/TA 的/.test(d.querySelector('#lbl-age').innerHTML), 'bg 年龄标签为「TA 的年龄」');
    ok(/TA 的/.test(d.querySelector('#lbl-job').innerHTML), 'bg 职业标签为「TA 的职业」');
    // 出题 prompt 含朋友语境（首条 fetch = 非流式的生成请求；buildPrompt 是 user 消息 messages[1]）
    ok(calls.list.length >= 1 && /友人代答|朋友观察/.test(calls.list[0].usr), '出题 prompt 含朋友观察者语境');
    await answerAll(w,d,0);
    await sleep(150);
    // 评估 prompt 含朋友语境（流式请求里有 ASSESS_SYS + friendAssessCtx）
    const assessCall = calls.list.find(c => c.stream);
    ok(assessCall && /在你朋友眼中|观察者/.test(assessCall.content), '评估 prompt 含观察者语气规则');
    const badge = d.querySelector('.obs-badge');
    ok(badge && /小明/.test(badge.textContent), '结果页观察者角标含朋友名「小明」');
    ok(badge && /非 小明 本人自述/.test(badge.textContent), '角标标注「非 本人自述」');
    ok(d.querySelector('#r-verify').style.display !== 'none', 'friend 档案验证入口可见（全链路已贯通，验证对观察者开放）');
    ok(/对 TA 的观察/.test(d.querySelector('#r-verify').textContent), '验证入口文案为朋友观察视角');
  }

  console.log('\n【P4】自检②（简答措辞）：朋友档案简答题文案含「你观察到 TA」');
  {
    const { w, d } = boot({});
    await sleep(80);
    d.querySelector('#btn-profiles').click(); await sleep(20);
    await newFriend(w, d, '小红');
    await fillBg(w,d);
    let g=0; while(g++<60 && !d.querySelector('#op-i') && d.querySelector('#page-test').classList.contains('active')){
      const opts = d.querySelectorAll('#t-card .opt'); if(opts.length){ opts[0].click(); await sleep(270); }
    }
    const hint = d.querySelector('#t-card .q-hint');
    ok(hint && /你观察到 TA/.test(hint.textContent), '朋友档案简答题提示含「你观察到 TA」');
  }

  console.log('\n【P5】自检④：切换不丢进度 + 导出导入 roundtrip 一致');
  {
    const { w, d } = boot({});
    await sleep(80);
    await fillBg(w,d);
    const beforeId = AP(w).id;
    const beforeOrder = AP(w).order.length;
    ok(beforeOrder > 0, 'self 档案已生成题序（进度 ' + beforeOrder + '）');
    d.querySelector('#btn-profiles').click(); await sleep(20);
    await newFriend(w, d, '阿强');
    ok(ACTIVE(w).kind === 'friend', '已切到朋友档案');
    d.querySelector('#btn-profiles').click(); await sleep(20);
    const sw = d.querySelector('#prof-list [data-act="switch"]');
    ok(!!sw, 'self 档案行存在「切换」按钮');
    sw.click(); await sleep(40);
    const st = ACTIVE(w);
    ok(st.kind === 'self' && st.id === beforeId, '切回原 self 档案（id 一致）');
    ok(st.order.length === beforeOrder, '切换后进度（题序）不丢');

    const beforeCount = LS(w).profiles.length;
    d.querySelector('#btn-profiles').click(); await sleep(20);
    d.querySelector('#prof-list [data-act="export"]').click(); await sleep(20);
    const ta = d.querySelector('#modal-export-text');
    const exported = ta.value;
    ok(exported && exported.length > 20, '导出得到档案 JSON');
    d.querySelector('#modal-import').click(); await sleep(40);
    const st2 = LS(w);
    ok(st2.profiles.length === beforeCount + 1, '导入后档案数 +1（' + beforeCount + ' → ' + st2.profiles.length + '）');
    const imported = st2.profiles[st2.profiles.length - 1];
    ok(imported.order.length === beforeOrder, '导入档案题序与原档案一致');
    ok(imported.kind === 'self', '导入档案 kind 保持 self');
    ok(imported.id !== beforeId, '导入档案获得新 id（不撞原档案）');
  }

  console.log('\n【P6】新建档案走页面内联表单（不依赖原生 prompt/alert，沙箱可用）');
  {
    const { w, d } = boot({});
    await sleep(80);
    d.querySelector('#btn-profiles').click(); await sleep(30);

    // 点「新建朋友档案」→ 内联表单出现，且没有毛玻璃遮罩、没有 prompt
    d.querySelector('#prof-new-friend').click(); await sleep(30);
    ok(d.querySelector('#prof-create').style.display !== 'none', '点「新建朋友档案」内联表单出现');
    ok(!d.querySelector('#mask').classList.contains('show'), '新建不弹毛玻璃遮罩');

    // 空名 → 内联报错，不创建档案
    const before = LS(w).profiles.length;
    d.querySelector('#prof-name-input').value = '';
    d.querySelector('#prof-create-ok').click(); await sleep(40);
    ok(/不能为空/.test(d.querySelector('#prof-create-err').textContent), '空名提交 → 内联提示「名字不能为空」');
    ok(LS(w).profiles.length === before, '空名不会创建档案');

    // 正常名字 → 创建成功并切换
    d.querySelector('#prof-name-input').value = '小美';
    d.querySelector('#prof-name-input').dispatchEvent(new w.Event('input',{bubbles:true}));
    d.querySelector('#prof-create-ok').click(); await sleep(60);
    ok(LS(w).profiles.length === before + 1, '填名后创建成功（档案数 +1）');
    ok(ACTIVE(w).kind === 'friend' && ACTIVE(w).name === '小美', '新建后自动切到该 friend 档案');

    // 取消按钮 → 表单收起，不创建
    d.querySelector('#btn-profiles').click(); await sleep(20);
    d.querySelector('#prof-new-friend').click(); await sleep(20);
    d.querySelector('#prof-create-cancel').click(); await sleep(20);
    ok(d.querySelector('#prof-create').style.display === 'none', '点「取消」收起内联表单');
    ok(LS(w).profiles.length === before + 1, '取消不会创建档案');
  }

  console.log('\n【P7】删除档案用页面内确认框（不用原生 confirm，沙箱可用）');
  {
    const { w, d } = boot({});
    await sleep(80);
    d.querySelector('#btn-profiles').click(); await sleep(30);
    await newFriend(w, d, '待删');                 // 建一个朋友档案，此时有 2 个档案
    d.querySelector('#btn-profiles').click(); await sleep(30);
    const before = LS(w).profiles.length;
    ok(before === 2, '当前有 2 个档案');

    const dels = d.querySelectorAll('#prof-list [data-act="del"]');
    ok(dels.length > 0, '档案行有「删除」按钮');
    dels[dels.length - 1].click(); await sleep(60);
    ok(d.querySelector('#mask').classList.contains('show'), '点删除弹出页面内确认框（非原生 confirm）');
    ok(/删除档案/.test(d.querySelector('#m-title').textContent), '确认框标题为「删除档案？」');

    // 先取消 → 不删
    d.querySelector('#m-cancel').click(); await sleep(60);
    ok(LS(w).profiles.length === before, '点取消不删除档案');
    ok(!d.querySelector('#mask').classList.contains('show'), '取消后确认框关闭');

    // 再确认 → 真删
    const dels2 = d.querySelectorAll('#prof-list [data-act="del"]');
    dels2[dels2.length - 1].click(); await sleep(60);
    d.querySelector('#m-ok').click(); await sleep(80);
    ok(LS(w).profiles.length === before - 1, '点确认后档案被删除（' + before + ' → ' + LS(w).profiles.length + '）');
    ok(!d.querySelector('#mask').classList.contains('show'), '删除后确认框关闭');
  }

  console.log('\n========================================');
  console.log('  多档案/朋友观察者自检：' + pass + ' 通过 / ' + fails.length + ' 失败');
  console.log('========================================');
  if(fails.length){ console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})();
