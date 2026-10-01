/* 降级链修复测试：智谱 glm-4.7-flash 过载时返回 HTTP 200 + 普通 JSON 错误体
   （{"error":{"code":"1305"}}），而非 429 / SSE。修复前 res.ok 为真、错误体被忽略，
   被误判空正文 → 显示「AI 正忙」且降级链不触发。本测试用 jsdom + mock fetch 驱动：
   A. 盘人首轮：主模型过载 → 应自动切到备用链第 1 位并正常回复（不显示正忙）
   B. 验证首轮：同上，应正常回复
   C. 成功路径：无过载 → 正常回复（回归）
   D. 全模型过载(1305all)：应给出可见的「正忙」状态，而非静默空正文 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, 'soul-interrogator.html');
const html = fs.readFileSync(FILE, 'utf8');
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

// 单一事实源：从 HTML 解析当前模型链（勿在此硬编码模型名，链序一改测试就会假绿/假红）
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const _MODELS = jsCode.match(/models\s*:\s*\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
const PRIMARY = _MODELS[0];
const FALLBACKS = _MODELS.slice(1);
const FB1 = FALLBACKS[0];

let fails = 0, passes = 0;
function ok(name, cond){ if(cond){ passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const ERR_1305 = { error:{ code:'1305', message:'该模型当前访问量过大，请您稍后再试' } };

function boot(opts){
  const o = opts || {};
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(String(e.detail || e.message || e)));
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true,
    url:'https://example.com/soul-interrogator.html', virtualConsole:vc });
  const w = dom.window, d = w.document;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.html2canvas = () => Promise.resolve({ toDataURL:()=>'data:image/png;base64,', toBlob:cb=>cb(new w.Blob(['x'],{type:'image/png'})) });
  Object.defineProperty(w.navigator,'canShare',{value:()=>true,configurable:true});
  Object.defineProperty(w.navigator,'share',{value:()=>Promise.resolve(),configurable:true});

  const calledModels = [];
  const report = o.report || { dims:[{dim:'SN',baseline:'N',status:'verified',behavior_hint:'',quote:'x',note:'偏 S'}], overall:'基本可信', nuance:'稳' };
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body); const model = b.model; calledModels.push(model);
    const lastUser = (b.messages || []).filter(m => m.role === 'user').slice(-1)[0];
    const lu = lastUser ? lastUser.content : '';
    const isReport = /输出验证报告/.test((b.messages || []).slice(-1)[0] ? (b.messages || []).slice(-1)[0].content : '');
    // 过载形态：仅主模型过载 / 或全部模型过载
    if(o.failMode === '1305' && model === PRIMARY){
      const eb = JSON.stringify(ERR_1305);
      return Promise.resolve({ ok:true, status:200,
        headers:{ get:(h)=> String(h).toLowerCase()==='content-type' ? 'application/json' : '' },
        json:()=>Promise.resolve(JSON.parse(eb)), text:()=>Promise.resolve(eb), body:null });
    }
    if(o.failMode === '1305all'){
      const eb = JSON.stringify(ERR_1305);
      return Promise.resolve({ ok:true, status:200,
        headers:{ get:(h)=> String(h).toLowerCase()==='content-type' ? 'application/json' : '' },
        json:()=>Promise.resolve(JSON.parse(eb)), text:()=>Promise.resolve(eb), body:null });
    }
    const text = isReport ? JSON.stringify(report)
      : '（点评）你说「' + lu + '」，这支持你的自报。能举个最近的例子吗？';
    return Promise.resolve({ ok:true, status:200,
      headers:{ get:(h)=> String(h).toLowerCase()==='content-type' ? 'text/event-stream' : '' },
      json:()=>Promise.resolve({ choices:[{ message:{ content:text } }] }),
      text:()=>Promise.resolve(''), body:null });
  };
  const s = d.createElement('script'); s.textContent = html.match(/<script>([\s\S]*?)<\/script>/)[1]; d.body.appendChild(s);
  return { w, d, errs, calledModels };
}

async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await wait(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await wait(1200); }
async function answerAll(w,d,pick){ let guard=0; while(d.querySelector('#page-test').classList.contains('active') && guard++<80){ if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await wait(20); continue; } d.querySelectorAll('#t-card .opt')[pick].click(); await wait(260); } await wait(200); }

(async () => {
  console.log('\n【A】盘人(拷问)首轮：主模型 ' + PRIMARY + ' 过载 → 自动降级到 ' + FB1 + ' 并正常回复');
  {
    const { w, d, calledModels } = boot({ failMode:'1305' });
    const $ = (id)=>d.getElementById(id);
    const active = () => { const p=d.querySelector('.page.active'); return p?p.id:'(none)'; };
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    await wait(400); // 等降级链：PRIMARY(200-error) → FB1(正文)
    const bubbles = $('cross-scroll') ? $('cross-scroll').querySelectorAll('.bubble') : [];
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('主模型 ' + PRIMARY + ' 被尝试', calledModels.indexOf(PRIMARY) > -1);
    ok('降级链切到 ' + FB1, calledModels.indexOf(FB1) > -1);
    ok('未误切到更多模型(' + FALLBACKS.slice(1).join('/') + ' 不应被调用)', FALLBACKS.slice(1).every(m => calledModels.indexOf(m) === -1));
    ok('AI 开场气泡已渲染(非正忙)', aiBubbles.length >= 1);
    ok('AI 回复含降级后的正文', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
    ok('仍在对话页(未被踹回选型)', active() === 'page-cross-chat');
  }

  console.log('\n【B】验证首轮：主模型过载 → 自动降级并正常回复');
  {
    const { w, d } = boot({ failMode:'1305' });
    const $ = (id)=>d.getElementById(id);
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    const ent = $('r-verify'); ok('结果页存在验证入口', !!ent);
    click(ent); await wait(600);
    const bubbles = $('verify-scroll') ? $('verify-scroll').querySelectorAll('.bubble') : [];
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('验证对话页激活', $('page-verify').classList.contains('active'));
    ok('验证 AI 首条回复已渲染(非正忙)', aiBubbles.length >= 1);
    ok('验证 AI 回复含降级后的正文', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
  }

  console.log('\n【C】成功路径回归：无过载 → 正常回复');
  {
    const { w, d, calledModels } = boot({});
    const $ = (id)=>d.getElementById(id);
    const active = () => { const p=d.querySelector('.page.active'); return p?p.id:'(none)'; };
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    await wait(300);
    const bubbles = $('cross-scroll').querySelectorAll('.bubble');
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('无过载时主模型 ' + PRIMARY + ' 成功回复', calledModels[0]===PRIMARY && aiBubbles.length>=1);
    ok('回复含正文', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
    ok('仍在对话页', active() === 'page-cross-chat');
  }

  console.log('\n【D】全模型过载(1305all)：应优雅降级(离线自测替代)，而非静默空正文');
  {
    const { w, d } = boot({ failMode:'1305all' });
    const $ = (id)=>d.getElementById(id);
    const active = () => { const p=d.querySelector('.page.active'); return p?p.id:'(none)'; };
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    // 全挂时先走退避重试(API.backoff = 4s + 8s)，重试耗尽才优雅降级，故需等满重试周期
    await wait(14000);
    const scroll = $('cross-scroll');
    ok('仍在对话页(未被踹飞)', active() === 'page-cross-chat');
    ok('渲染了离线自测替代题(替代自测)，非静默空正文', scroll && /替代自测/.test(scroll.textContent));
  }

  console.log('\n=== 结果：' + passes + ' 通过 / ' + fails + ' 失败 ===');
  process.exit(fails ? 1 : 0);
})();
