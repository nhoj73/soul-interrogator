/* 429 形态降级链测试（覆盖 _verify_busy.cjs 的盲区）
   真实线上此刻的形态是 HTTP 429 + {"error":{"code":"1305","message":"该模型当前访问量过大…"}}，
   走的是 readErr → isModelBusy(429,text) → continue 分支，
   与 _verify_busy 测的「HTTP 200 + error 体」是完全不同的代码路径，此前从未被测过。
   A. 盘人首轮：主模型(PRIMARY) 429 过载 → 应自动切到首个备用(FB1) 并正常回复（不显示正忙）
   B. 主模型 429 → 首个备用(FB1) 也 429 → 应继续切到后续模型(FALLBACKS[1])
   C. 全部 429：应给出可见降级，而非静默空正文 */
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
const ALL_MODELS = _MODELS.slice();
let fails = 0, passes = 0;
function ok(name, cond){ if(cond){ passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const ERR_1305 = { error:{ code:'1305', message:'该模型当前访问量过大，请您稍后再试' } };
const ERR_1305_JSON = JSON.stringify(ERR_1305);
const ERR_1302 = { error:{ code:'1302', message:'您的账户已达到速率限制，请您控制请求频率' } };
const ERR_1302_JSON = JSON.stringify(ERR_1302);

// 构造一个 HTTP 429 响应（res.ok === false），带可读取的 text()
// code 默认 1305（模型过载），可传 '1302'（速率限制，实测也是按模型限流、换模型即好）
function resp429(code){
  const j = code === '1302' ? ERR_1302_JSON : ERR_1305_JSON;
  return { ok:false, status:429,
    headers:{ get:(h)=> String(h).toLowerCase()==='content-type' ? 'application/json' : '' },
    json:()=>Promise.resolve(JSON.parse(j)),
    text:()=>Promise.resolve(j), body:null };
}

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
  // downModels: 哪些模型返回 429 过载；downCode: '1305'(默认) 或 '1302'(速率限制)
  const down = o.down || [];
  const downCode = o.downCode || '1305';
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body); const model = b.model; calledModels.push(model);
    if(down.indexOf(model) > -1) return Promise.resolve(resp429(downCode));
    const lastUser = (b.messages || []).filter(m => m.role === 'user').slice(-1)[0];
    const lu = lastUser ? lastUser.content : '';
    const text = '（点评）你说「' + lu + '」，这支持你的自报。能举个最近的例子吗？';
    return Promise.resolve({ ok:true, status:200,
      headers:{ get:(h)=> String(h).toLowerCase()==='content-type' ? 'text/event-stream' : '' },
      json:()=>Promise.resolve({ choices:[{ message:{ content:text } }] }),
      text:()=>Promise.resolve(''), body:null });
  };
  const s = d.createElement('script'); s.textContent = html.match(/<script>([\s\S]*?)<\/script>/)[1]; d.body.appendChild(s);
  return { w, d, errs, calledModels };
}

(async () => {
  console.log('\n【A】盘人(拷问)首轮：主模型 ' + PRIMARY + ' HTTP 429 过载 → 自动降级 ' + FB1 + ' 并正常回复');
  {
    const { w, d, calledModels } = boot({ down:[PRIMARY] });
    const $ = (id)=>d.getElementById(id);
    const active = () => { const p=d.querySelector('.page.active'); return p?p.id:'(none)'; };
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    await wait(500); // 等降级链：PRIMARY(429) → FB1(正文)
    const bubbles = $('cross-scroll') ? $('cross-scroll').querySelectorAll('.bubble') : [];
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('主模型 ' + PRIMARY + ' 被尝试', calledModels.indexOf(PRIMARY) > -1);
    ok('429 触发降级链，切到 ' + FB1, calledModels.indexOf(FB1) > -1);
    ok('未继续往下切(' + FALLBACKS[1] + ' 不应被调用)', calledModels.indexOf(FALLBACKS[1]) === -1);
    ok('AI 开场气泡已渲染(非正忙)', aiBubbles.length >= 1);
    ok('AI 回复含降级后的正文', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
    ok('仍在对话页(未被踹回选型)', active() === 'page-cross-chat');
  }

  console.log('\n【B】主模型 ' + PRIMARY + ' + 首个备用 ' + FB1 + ' 均 429 → 应继续切到 ' + FALLBACKS[1]);
  {
    const { w, d, calledModels } = boot({ down:[PRIMARY, FB1] });
    const $ = (id)=>d.getElementById(id);
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    await wait(600);
    ok('已尝试 ' + PRIMARY, calledModels.indexOf(PRIMARY) > -1);
    ok('已尝试 ' + FB1, calledModels.indexOf(FB1) > -1);
    ok('继续切到 ' + FALLBACKS[1], calledModels.indexOf(FALLBACKS[1]) > -1);
    const bubbles = $('cross-scroll') ? $('cross-scroll').querySelectorAll('.bubble') : [];
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('最终拿到 AI 正文回复', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
  }

  console.log('\n【C】全部模型 429：应优雅降级(离线替代自测)，而非静默空正文');
  {
    const { w, d, calledModels } = boot({ down: ALL_MODELS.slice() });
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
    ok('全部模型均被尝试过', ALL_MODELS.every(m=>calledModels.indexOf(m)>-1));
    const scrollTxt = $('cross-scroll') ? $('cross-scroll').textContent : '';
    ok('全挂时给出可见内容(替代自测/提示)，非空白', /替代自测|自测|正忙|稍后/.test(scrollTxt));
  }

  console.log('\n【D】主模型 1302 速率限制 → 同样应切到备用模型并成功（不是死磕「正忙」）');
  { /* 真实教训：1302 是按模型限流，链首 glm-4.7-flash 被限时换 glm-4-flash 立即 200。
       旧实现把 1302 当「账户级、换模型无用」，导致永不降级、盘人一直「AI 正忙」。 */
    const { w, d, calledModels } = boot({ down:[PRIMARY], downCode:'1302' });
    const $ = (id)=>d.getElementById(id);
    const click = (el)=>{ if(el) el.dispatchEvent(new w.Event('click',{bubbles:true})); };
    await wait(60);
    click($('enter-cross')); await wait(20);
    click($('mode-cross')); await wait(20);
    const cells = $('type-grid').querySelectorAll('.type-cell');
    cells.forEach(c => { if(c.textContent === 'INFP') click(c); });
    $('f-reason').value = '理想主义'; click($('type-ok')); await wait(20);
    await wait(600);
    ok('已尝试主模型 ' + PRIMARY, calledModels.indexOf(PRIMARY) > -1);
    ok('1302 触发降级，切到 ' + FB1, calledModels.indexOf(FB1) > -1);
    const bubbles = $('cross-scroll') ? $('cross-scroll').querySelectorAll('.bubble') : [];
    const aiBubbles = Array.from(bubbles).filter(b=>b.classList.contains('ai'));
    ok('1302 后最终拿到 AI 正文（不是正忙）', aiBubbles.length>=1 && /支持你的自报/.test(aiBubbles[aiBubbles.length-1].textContent));
  }

  console.log('\n' + (fails === 0 ? '全部通过' : '有失败') + '：' + passes + '/' + (passes + fails));
  process.exit(fails === 0 ? 0 : 1);
})();
