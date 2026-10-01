/* 交付前自检脚本：覆盖
   item3: AI 出题数量校验 → 选择题≠9 或简答题≠3 自动重试一次（重试仍不足则降级）
   item4: 全选锚点题 A → ESTJ 方向；全选 B → INFP 方向
   纯本地 jsdom，fetch 用 mock（不命中真实 API）。 */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';
const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dims = ['EI','SN','TF','JP'], poles = { EI:['E','I'], SN:['S','N'], TF:['T','F'], JP:['J','P'] };
let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }

function makeAIChoice(n){ const choice=[]; for(let i=0;i<n;i++){ const dim=dims[i%4]; choice.push({ q:`[${dim}] 情境${i}`, A:{text:'A'+i,dim:poles[dim][0]}, B:{text:'B'+i,dim:poles[dim][1]} }); } return choice; }
function makeAIOpen(n){ const o=[]; for(let i=0;i<n;i++) o.push({ q:'简答' + i + '：最近一次让你纠结的事是什么？' }); return o; }
function aiJSON(cc, oc){ return JSON.stringify({ choice: makeAIChoice(cc), open: makeAIOpen(oc) }); }

/* 模型降级链取自应用源码（单一事实源）。
   V6/V7 断言的是「主模型过载 → 依次切备用模型」这个机制，不是某个模型的名字；
   以后按实测可用率调整 models 顺序时，这些用例不需要跟着改。
   （多 provider 后模型链在 PROVIDERS.zhipu.models 里，取第一个 models 数组。） */
const _MODELS = jsCode.match(/models\s*:\s*\[([^\]]+)\]/)[1]
                    .split(',').map(s => s.trim().replace(/^'|'$/g, ''));
const PRIMARY   = _MODELS[0];
const FALLBACKS = _MODELS.slice(1);
const FB1        = FALLBACKS[0];
const ALL_MODELS = _MODELS.slice();

function boot(seq, opts){
  const o = opts || {}, calls = { n: 0, models: [] };
  const code = o.patch ? o.patch(jsCode) : jsCode;
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window; w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u,o2) => { const b = JSON.parse(o2.body); calls.models.push(b.model);
    if(b.stream) return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({}), body:{ getReader:()=>({read:()=>Promise.resolve({done:true})}) } });
    const idx = calls.n++; const [cc, oc] = (seq[idx] || seq[seq.length-1]);
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: aiJSON(cc, oc) } }] }) });
  };
  if(o.fetch) w.fetch = o.fetch;
  // 分享图：html2canvas 在 jsdom 里无法真实渲染，用假 canvas 验证文案链路
  w.html2canvas = () => Promise.resolve({
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    toBlob: cb => cb(new w.Blob(['fake-png'], { type:'image/png' }))
  });
  Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(w.navigator, 'share',    { value: () => Promise.resolve(), configurable: true });
  const s = w.document.createElement('script'); s.textContent = code; w.document.body.appendChild(s);
  return { w, d:w.document, calls };
}
async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await sleep(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await sleep(1200); }
async function answerAll(w,d,pick){ let guard=0; while(d.querySelector('#page-test').classList.contains('active') && guard++<40){ if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答回答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await sleep(20); continue; } d.querySelectorAll('#t-card .opt')[pick].click(); await sleep(240); } }

(async()=>{
  console.log('\n【V3】item4：全选 A → ESTJ 方向');
  { const {w,d}=boot([[9,3]]); await sleep(60); await fillBg(w,d); await answerAll(w,d,0); await sleep(200);
    const code = d.querySelector('.r-code').textContent.trim();
    ok(code === 'ESTJ', '全选 A 结果为 ESTJ（实际 ' + code + '）'); }

  console.log('\n【V4】item4：全选 B → INFP 方向');
  { const {w,d}=boot([[9,3]]); await sleep(60); await fillBg(w,d); await answerAll(w,d,1); await sleep(200);
    const code = d.querySelector('.r-code').textContent.trim();
    ok(code === 'INFP', '全选 B 结果为 INFP（实际 ' + code + '）'); }

  console.log('\n【V1】item3：情境题不足 9 → 自动重试一次，重试成功则用 AI 题');
  { const {w,d,calls}=boot([[7,2],[9,3]]); await sleep(60); await fillBg(w,d); await sleep(300);
    ok(calls.n === 3, '出题接口被调用 3 次（主调用不足 → 单题补生成 → 语病校对 pass），实际 ' + calls.n);
    const st = AP(w);
    ok(st.qsrc === 'ai', '重试成功后采用 AI 题（qsrc=ai），实际 ' + st.qsrc);
    ok(st.qset.aiCount === 9, '情境题补足到 9 道，实际 ' + st.qset.aiCount);
    ok(st.qset.open.length === 3, '简答题 3 道，实际 ' + st.qset.open.length);
    ok(st.qset.choice.length === 21, '选择题共 21 道，实际 ' + st.qset.choice.length); }

  console.log('\n【V2】item3：AI 题少到不可用（<AI_MIN）→ 降级通用题库，仍保证 24 题');
  { const {w,d,calls}=boot([[1,1],[1,1]]); await sleep(60); await fillBg(w,d); await sleep(800);
    ok(calls.n === 2, '出题接口调用 2 次后停止（最多重试 1 次），实际 ' + calls.n);
    const st = AP(w);
    ok(st.qsrc === 'bank', '两轮合法 AI 题都 <AI_MIN → 降级通用题库（qsrc=bank），实际 ' + st.qsrc);
    ok(st.qset.choice.length === 21 && st.qset.open.length === 3, '降级后仍保证 21 选择 + 3 简答 = 24 题');
    ok(/降级/.test(d.querySelector('#t-banner').textContent), '测试页横幅标注已降级'); }

  console.log('\n【V2b】item3：AI 给 8 道（常态缺口）→ 补题失败也不再判死，bank 补 1 道继续用 AI 题');
  { const {w,d,calls}=boot([[8,3]]);
    let patchN = 0;
    const base = w.fetch;
    w.fetch = (u,o2) => { const b = JSON.parse(o2.body);
      if(String(b.messages[1].content).indexOf('请只补足') > -1){ patchN++; return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content:'抱歉我不能输出JSON' } }] }) }); }
      return base(u,o2); };
    await sleep(60); await fillBg(w,d); await sleep(800);
    ok(patchN === 1, '8<9 触发一次单题补生成（失败），实际 ' + patchN);
    const st = AP(w);
    ok(st.qsrc === 'ai', '不判死 → 仍采用 AI 题（qsrc=ai），实际 ' + st.qsrc);
    ok(st.qset.aiCount === 8 && st.qset.bankCount === 1, 'AI 8 道 + bank 补 1 道 = 9（实际 ' + st.qset.aiCount + '+' + st.qset.bankCount + '）');
    ok(st.qset.choice.length === 21 && st.qset.open.length === 3, '题集结构完整 21+3'); }

  console.log('\n【V5】item2 根因治理：改 QC 一处（10/8/2=20），所有文案跟随');
  /* 脚本是 IIFE 封装，外部拿不到 QC，因此直接在源码层打补丁，
     模拟"开发者改了常量"——这才是真正的防漂移验证。 */
  const patch = src => src
    .replace(/anchor\s*:\s*12,/, 'anchor : 10,')
    .replace(/ai\s*:\s*9,/,      'ai     : 8,')
    .replace(/open\s*:\s*3\s/,   'open   : 2 ');
  ok(patch(jsCode) !== jsCode, '补丁已生效（QC 配比改为 10/8/2）');
  { const {w,d}=boot([[9,3]], { patch }); await sleep(60);
    const chips = d.querySelector('.chips').textContent.replace(/\s+/g,' ');
    const subT  = d.querySelector('#page-home .sub').textContent.replace(/\s+/g,' ');
    ok(/10 锚点 \+ 8 定制题/.test(chips), '首页 chips 跟随新配比: ' + chips.trim());
    ok(/2 道行为简答/.test(chips),        '首页简答数跟随');
    ok(/20 道题/.test(subT),              '首页副标题题数跟随: ' + subT.trim());
    ok(/共 20 题/.test(d.querySelector('#about-box').textContent.replace(/\s+/g,' ')), '说明区「共 20 题」跟随');
    ok(/10 道固定锚点题/.test(d.querySelector('#about-box').textContent), '说明区锚点数跟随');
    ok(/8 道情境题 \+ 2 道简答题/.test(d.querySelector('#ls-2').textContent.trim()),
       '加载页跟随: ' + d.querySelector('#ls-2').textContent.trim());
    ok(d.querySelector('#t-num').textContent === '1/20',
       '进度分母跟随为 1/20，实际 ' + d.querySelector('#t-num').textContent);
    ok(/20 道灵魂拷问/.test(d.querySelector('meta[name="description"]').getAttribute('content')), 'meta 描述跟随');
    // 实际题量也必须同步（anchorList 按 ANCHOR_N 截断，不能有隐藏硬编码）
    await fillBg(w, d);
    const st = AP(w);
    ok(st.order.length === 20, '实际总题数同步为 20，实际 ' + st.order.length);
    ok(st.qset.choice.filter(q=>q.anchor).length === 10, '实际锚点题同步为 10 道，实际 '
       + st.qset.choice.filter(q=>q.anchor).length);
    // 分享图题数取真实总题数，同样跟随
    await answerAll(w, d, 0); await sleep(150);
    d.querySelector('#r-shot').click(); await sleep(150);
    const card = d.querySelector('#share-card');
    ok(/20 道题/.test(card.textContent), '分享图题数跟随为「20 道题」（未硬编码）: '
       + (card.querySelector('.sc-title') ? card.querySelector('.sc-title').textContent : '无标题'));
    ok(/不问你想成为谁/.test(card.textContent), '分享图副标题仍取自首页'); }

  console.log('\n【V6】模型降级链：主模型「访问量过大」→ 依次切备用模型');
  const mkBusy = () => (u,o2) => { const b = JSON.parse(o2.body);
    return Promise.resolve({ ok:false, status:429, text:()=>Promise.resolve('{"message":"该模型当前访问量过大，请稍后再试"}') }); };
  const sseOk = (payload) => {
    const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:payload}}]}) + '\n\ndata: [DONE]\n\n';
    return { ok:true, status:200, body:{ getReader:()=>{ let sent=false;
      return { read:()=>{ if(!sent){ sent=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } };
  };
  const recFB = (rec, fn) => (u,o2) => { const b = JSON.parse(o2.body); rec.models.push(b.model); return fn(u,o2); };

  console.log('  [V6a] 出题：主模型 429 → 自动切第一个备用模型 ' + FB1 + ' 成功出题');
  { const rec = { models: [] };
    const fb = recFB(rec, (u,o2) => { const b = JSON.parse(o2.body);
      if(b.stream) return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({}), body:{getReader:()=>({read:()=>Promise.resolve({done:true})})} });
      if(b.model === PRIMARY) return Promise.resolve({ ok:false, status:429, text:()=>Promise.resolve('{"message":"该模型当前访问量过大"}') });
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content: aiJSON(9,3)}}] }) }); });
    const {w,d}=boot([[9,3]], { fetch: fb }); await sleep(60); await fillBg(w,d); await sleep(400);
    ok(rec.models[0] === PRIMARY && rec.models[1] === FB1,
       '先试主模型 ' + PRIMARY + '、再切备用 ' + FB1 + '（实际 ' + rec.models.join('→') + '）');
    const st = AP(w);
    ok(st.qsrc === 'ai', '主模型挂掉后仍用 AI 题（qsrc=ai），实际 ' + st.qsrc);
    ok(st.qset.aiCount === 9, 'AI 情境题补足到 9 道，实际 ' + st.qset.aiCount); }

  console.log('  [V6b] 出题：全部模型都 429 → 降级通用题库，仍保证 24 题');
  { const rec = { models: [] };
    const {w,d}=boot([[9,3]], { fetch: recFB(rec, mkBusy()) }); await sleep(60); await fillBg(w,d); await sleep(6400);
    ok(ALL_MODELS.every(m => rec.models.includes(m)),
       '每个模型都被尝试过（链=' + ALL_MODELS.join('→') + '，共 ' + rec.models.length + ' 次调用）');
    const st = AP(w);
    ok(st.qsrc === 'bank', '全部模型不可用 → 降级通用题库（qsrc=bank），实际 ' + st.qsrc);
    ok(st.qset.choice.length === 21 && st.qset.open.length === 3, '降级后仍保证 24 题'); }

  console.log('  [V6c] 评估流式：主模型 429 → 切备用模型流式成功');
  { const patchSI = src => src.replace('async function streamAssess(messages, onDelta, onProgress){',
        'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; async function streamAssess(messages, onDelta, onProgress){');
    const fb = recFB({models:[]}, (u,o2) => { const b = JSON.parse(o2.body);
      if(b.model === PRIMARY) return Promise.resolve({ ok:false, status:429, text:()=>Promise.resolve('{"message":"该模型当前访问量过大"}') });
      if(b.stream) return Promise.resolve(sseOk('{"portrait":"你是一个在纠结中找秩序的人"}'));
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content: aiJSON(9,3)}}] }) }); });
    const {w}=boot([[9,3]], { fetch: fb, patch: patchSI }); await sleep(60);
    const r = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r.ok === true, '主模型挂掉后，评估流式切到备用模型成功（ok=' + r.ok + '）');
    ok(r.model && r.model !== PRIMARY, '评估实际使用的模型是备用模型（' + (r.model||'?') + '）'); }

  console.log('\n【V7】模型名透传：主模型降级后，出题横幅与评估徽标都显示真实模型');
  { const assessJSON = JSON.stringify({ type:'INTJ', dims:{E:20,I:80,S:30,N:70,T:80,F:20,J:70,P:30},
        insight:{ portrait:'你是一个在纠结中找秩序的人', advice:'先做最小可行版本', roast:'你不是拖延，你是在等变量对齐' },
        evidence:['你说原话，说明你重逻辑'], replies_review:[{quote:'原话',read:'说明你在意确定性'}] });
    const sseFull = (txt) => {
      const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:txt}}]}) + '\n\ndata: [DONE]\n\n';
      const enc = new TextEncoder(); const bytes = enc.encode(sse); let i = 0;
      return { ok:true, status:200, body:{ getReader:()=>({ read(){ if(i>=bytes.length) return Promise.resolve({done:true});
        const c = bytes.slice(i, i+Math.min(40, bytes.length-i)); i += c.length; return Promise.resolve({done:false, value:c}); } }) } };
    };
    const fb = (u,o2) => { const b = JSON.parse(o2.body);
      if(b.model === PRIMARY) return Promise.resolve({ ok:false, status:429, text:()=>Promise.resolve('{"message":"该模型当前访问量过大"}') });
      if(b.stream) return Promise.resolve(sseFull(assessJSON));
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content: aiJSON(9,3) } }] }) });
    };
    /* 这里必须用 recFB 把实际命中的模型记进 rec7：
       boot 的 opts.fetch 会整体替换掉内部那个会写 calls.models 的 mock，
       直接断言 calls.models.every(...) 等于对空数组求值 —— 恒真，等于没测。 */
    const rec7 = { models: [] };
    const {w,d} = boot([[9,3]], { fetch: recFB(rec7, fb) });
    await sleep(60); await fillBg(w,d); await sleep(400);
    ok(d.querySelector('#t-banner').textContent.includes(FB1),
       '出题横幅显示实际出题模型 ' + FB1 + '（而非写死的主模型），实际：' + d.querySelector('#t-banner').textContent.trim().slice(0,48));
    await answerAll(w,d,0); await sleep(1400);
    const who = d.querySelector('#ai-box .who');
    ok(who && who.textContent.trim() === FB1, '评估徽标显示实际评估模型 ' + FB1 + '（' + (who ? who.textContent.trim() : '?') + '）');
    ok(rec7.models.length > 0 && rec7.models.every(m => m === PRIMARY || m === FB1),
       '全程只命中主模型与第一个备用模型（实际 ' + rec7.models.length + ' 次：' + rec7.models.join('→') + '）'); }

  console.log('\n【V8】盘人不歇菜：主模型过载(429)→切备用；慢但能返回的主模型不再被时间片掐成「正忙」');
  { /* 两类真实事故都覆盖：
       (a) 主模型过载（429/1305「访问量过大」）——立刻切到 FB1，不显示「正忙」；
       (b) 主模型「慢但能返回」（峰值时可能 15~25s 才吐完一段评估）——旧实现被
           12s 时间片掐断误判 timeout/正忙；改为给主模型 left-reserve 预算后，它能在预算内完整返回。
       为跑得快，把 ASSESS_MS / SLICE_MS 缩到毫秒级（主模型拿 left-reserve，且不超过 left）。 */
    const patch8 = src => src
      .replace('var ASSESS_MS = 38000;', 'var ASSESS_MS = 3000;')
      .replace('var SLICE_MS = 16000;', 'var SLICE_MS = 600;')
      .replace('async function streamAssess(messages, onDelta, onProgress){',
        'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; async function streamAssess(messages, onDelta, onProgress){');
    const rec8 = { models: [] };
    const sseOK = (txt) => { const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:txt}}]}) + '\n\ndata: [DONE]\n\n';
      return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' }, body:{ getReader:()=>{ let s=false;
        return { read:()=>{ if(!s){ s=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } }; };

    // V8a：主模型过载（429 + 1305）→ 应立刻切到 FB1 并成功，不显示「正忙」
    const fb8a = (u,o2) => { const b = JSON.parse(o2.body); rec8.models.push(b.model);
      if(b.model === PRIMARY) return Promise.resolve({ ok:false, status:429, headers:{get:()=> 'application/json'},
        text:()=>Promise.resolve('{"error":{"code":"1305","message":"该模型当前访问量过大"}}') });
      return Promise.resolve(sseOK('{"portrait":"备用模型救回来了"}')); };
    const {w} = boot([[9,3]], { fetch: fb8a, patch: patch8 }); await sleep(60);
    const r8a = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r8a.ok === true, 'V8a 主模型过载(429/1305)→ 由备用模型成功返回（不是正忙），实际 reason=' + (r8a.reason||'-'));
    ok(r8a.model === FB1, 'V8a 实际返回的是第一个备用模型 ' + FB1 + '（实际 ' + (r8a.model||'?') + '）');
    ok(rec8.models.length >= 2 && rec8.models[0] === PRIMARY, 'V8a 确实先试主模型再切备用（' + rec8.models.join('→') + '）');
    ok(/备用模型救回来了/.test(r8a.text || ''), 'V8a 正文来自备用模型、未与主模型残文拼接');

    // V8b：主模型「慢但能返回」（300ms 才出首字，落在 2.5s 预算内）——应完整返回，而非被掐成 timeout/正忙
    rec8.models.length = 0;
    const slowSSE = (txt, delay) => { const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:txt}}]}) + '\n\ndata: [DONE]\n\n';
      return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' }, body:{ getReader:()=>{ let s=false;
        return { read:()=>{ if(!s){ s=true; return new Promise(rs=> setTimeout(()=> rs(Promise.resolve({done:false, value:new TextEncoder().encode(sse)})), delay)); }
          return Promise.resolve({done:true}); } }; } } }; };
    const fb8b = (u,o2) => { const b = JSON.parse(o2.body); rec8.models.push(b.model);
      if(b.model === PRIMARY) return Promise.resolve(slowSSE('{"portrait":"慢吞吞的主模型也盘完了"}', 300));
      return Promise.resolve(sseOK('{"portrait":"备用"}')); };
    // 关键：V8b 用独立 boot（全新 window），否则 V8a 把主模型标病态后，健康缓存会在 buildChain 里跳过主模型，
    // 慢主模型场景就根本不会被尝试；这里要验证的是「Fix2 慢主模型不被时间片掐死」，与健康缓存无关，必须隔离。
    const {w: wB} = boot([[9,3]], { fetch: fb8b, patch: patch8 }); await sleep(60);
    const r8b = await wB.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r8b.ok === true, 'V8b 慢但能返回的主模型在预算内完整返回（不再被掐成 timeout/正忙），实际 reason=' + (r8b.reason||'-'));
    ok(r8b.model === PRIMARY, 'V8b 实际返回的就是主模型 ' + PRIMARY + '（实际 ' + (r8b.model||'?') + '），说明没误杀');
    ok(/慢吞吞的主模型也盘完了/.test(r8b.text || ''), 'V8b 正文来自主模型、未切到备用'); }

  console.log('\n【V9】链首挂死时备用链仍有预算可跑（链首改回 4.7-flash 后的新增风险）');
  { /* 老实现 slice = (mi===0 ? left : SLICE_MS)：主模型吃满整段预算。
       那在「主模型 = 实测最稳的 glm-4.6」时是合理的；但按需求把链首改回
       glm-4.7-flash（实测 1/5，会 1305 也会挂住不返回）后，主模型一挂就会把
       ASSESS_MS 全部烧光，后面的备用模型一个都拿不到时间 → 整次请求判 timeout
       → 用户又看到「正忙」。改为主模型拿 left - reserve（保留给后续模型）后，
       这里断言：链首永不返回时，备用链仍能拿到时间并成功返回。
       预算缩到 8000ms：链首切片 6000ms，被 abort 后余 2000ms 给备用链，够跑。 */
    const patch9 = src => src
      .replace('var ASSESS_MS = 38000;', 'var ASSESS_MS = 8000;')
      .replace('var SLICE_MS = 16000;', 'var SLICE_MS = 600;')
      .replace('async function streamAssess(messages, onDelta, onProgress){',
        'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; window.__SI.buildChain = buildChain; async function streamAssess(messages, onDelta, onProgress){');
    const rec9 = { models: [] };
    const sseOK9 = (txt) => { const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:txt}}]}) + '\n\ndata: [DONE]\n\n';
      return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' }, body:{ getReader:()=>{ let s=false;
        return { read:()=>{ if(!s){ s=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } }; };
    // 链首永不返回（只能等切片计时器 abort），其余模型秒回
    const fb9 = (u,o2) => { const b = JSON.parse(o2.body); rec9.models.push(b.model);
      if(b.model === PRIMARY) return new Promise(function(){ /* 永不 resolve，模拟挂死 */ });
      return Promise.resolve(sseOK9('{"portrait":"备用链救场"}')); };
    const { w: w9 } = boot([[9,3]], { fetch: fb9, patch: patch9 }); await sleep(60);
    const chain9 = w9.__SI.buildChain();
    ok(chain9[0] === PRIMARY, 'V9 buildChain 链首为主模型 ' + PRIMARY + '（实际 ' + chain9[0] + '）');
    ok(new Set(chain9).size === chain9.length, 'V9 buildChain 无重复模型（' + chain9.join('→') + '）');
    const r9 = await w9.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r9.ok === true, 'V9 链首挂死后仍由备用模型成功返回（不是 timeout/正忙），实际 reason=' + (r9.reason||'-'));
    ok(r9.model === FB1, 'V9 实际返回的是备用模型 ' + FB1 + '（实际 ' + (r9.model||'?') + '）');
    ok(rec9.models.indexOf(PRIMARY) > -1 && rec9.models.indexOf(FB1) > -1,
       'V9 链首与备用模型都被尝试过（' + rec9.models.join('→') + '）'); }

  console.log('\n【V10】首轮只有 system 消息 → ensureUser 补 user（防 1214「messages 参数非法」）');
  { /* 盘人/闲聊/验证首轮 msgs 只有一条 system（鉴定官指令）、S.messages 为空，
       智谱要求 messages 含 user 消息，否则 1214 → 一直「再试一次（重新连接 AI）」。 */
    const patch10 = src => src.replace('async function streamAssess(messages, onDelta, onProgress){',
      'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; async function streamAssess(messages, onDelta, onProgress){');
    let seenMsg = null;
    const sseOK10 = (txt) => { const sse = 'data: ' + JSON.stringify({choices:[{delta:{content:txt}}]}) + '\n\ndata: [DONE]\n\n';
      return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' }, body:{ getReader:()=>{ let s=false;
        return { read:()=>{ if(!s){ s=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } }; };
    const fb10 = (u,o2) => { const b = JSON.parse(o2.body); seenMsg = b.messages; return Promise.resolve(sseOK10('{"portrait":"补上了"}')); };
    const { w: w10 } = boot([[9,3]], { fetch: fb10, patch: patch10 }); await sleep(60);
    const r10 = await w10.__SI.streamAssess([{role:'system', content:'你是鉴定官'}], ()=>{});
    ok(r10.ok === true, 'V10 只有 system 也能成功返回（reason=' + (r10.reason||'-') + '）');
    ok(seenMsg && seenMsg.some(m => m.role === 'user'), 'V10 请求体 messages 被补了一条 user（防 1214 参数非法）'); }

  console.log('\n【V-copy】step1 文案批：页头免责 / 维度条脚注 / 结果页尾 / about 同步');
  { const {w,d}=boot([[9,3]]); await sleep(60); await fillBg(w,d); await answerAll(w,d,0); await sleep(220);
    const disc = d.querySelector('#page-home .disclaimer');
    ok(disc && /不是人格判决书/.test(disc.textContent), '页头含免责声明「本测试测的是当前行为倾向，不是人格判决书」');
    const foot = d.querySelector('#r-bars .bar-foot a');
    ok(foot && /信不过这个维度/.test(foot.textContent) && /go\('verify'\)/.test(foot.getAttribute('onclick')||''), '维度条脚注链到验证入口');
    const tail = d.querySelector('.tail-note');
    ok(tail && /应激状态而非底色/.test(tail.textContent), '结果页尾含压力/转折期提示');
    const about = d.querySelector('#about-box').textContent;
    ok(/平票 · 规则默认/.test(about) && /仅一题之差/.test(about), 'about 区同步新文案（平票·规则默认 / 仅一题之差）');
    ok(!/倾向保守判定/.test(about) && !/参考价值有限/.test(about), 'about 区已删除「倾向保守判定」「参考价值有限」'); }

  console.log('\n' + '='.repeat(46));
  if(fails.length){ console.log(`失败 ${fails.length} / 通过 ${pass}`); fails.forEach(f=>console.log(' ✗ '+f)); process.exit(1); }
  else console.log(`全部通过（${pass} 项）`);
})();
