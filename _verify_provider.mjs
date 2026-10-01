// 多 provider UI 回归：AI 模型按钮能点开 → 切换 provider → 自定义配置保存生效。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

// 暴露 applyProvider + API 只读引用 + streamAssess（P5/P6 用）。
// ⚠ 插桩串必须跟产品签名完全一致：applyProvider 已加 persist 参数（改签名时测试同步改，否则 replace 静默不生效）。
const patch = src => src
  .replace('function applyProvider(id, persist){',
    'window.__SI = window.__SI || {}; window.__SI.applyProvider = applyProvider; window.__SI.getAPI = function(){ return API; }; window.__SI.getProviderId = function(){ return ACTIVE_PROVIDER_ID; }; window.__SI.getS = function(){ return S; }; window.__SI.bgSig = bgSig; window.__SI.startTest = startTest; function applyProvider(id, persist){')
  .replace('async function streamAssess(messages, onDelta, onProgress){',
    'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; async function streamAssess(messages, onDelta, onProgress){');

let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(fetchFn, extraPatch){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = fetchFn || (() => Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) }));
  let src = patch(jsCode);
  if(extraPatch) src = extraPatch(src);
  const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
  return { w, d: w.document };
}
const click = (w, el) => { if(el) el.dispatchEvent(new w.Event('click', { bubbles:true })); };
const sseOK = (txt) => {
  const sse = 'data: ' + JSON.stringify({ choices:[{ delta:{ content:txt } }] }) + '\n\ndata: [DONE]\n\n';
  return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' },
    body:{ getReader:()=>{ let s=false; return { read:()=>{ if(!s){ s=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } };
};
/* Gemini 的错误体是 JSON 数组（[{error:{...}}]），不是智谱的对象格式 */
const geminiRegionErr = () => ({ ok:false, status:400, headers:{ get:()=> 'application/json' },
  text:()=>Promise.resolve(JSON.stringify([{ error:{ code:400, message:'User location is not supported for the API use.', status:'FAILED_PRECONDITION' } }])) });

(async () => {
  console.log('\n【P1】AI 模型按钮弹出居中设置模态框');
  {
    const { w, d } = boot(); await sleep(120);
    const btn = d.getElementById('btn-ai');
    ok(!!btn, 'P1 首页 topbar 有 #btn-ai 按钮');
    const modal = d.getElementById('modal-ai');
    ok(!!modal, 'P1 存在 #modal-ai 设置弹层');
    ok(!modal.classList.contains('on'), 'P1 初始弹层收起');
    click(w, btn); await sleep(60);
    ok(modal.classList.contains('on'), 'P1 点按钮后弹层打开（居中，点得动且立刻可见）');
    /* 注意：jsdom 不做布局，getBoundingClientRect 恒为 0×0，不能在这断言盒子尺寸；
       弹层的真实渲染尺寸由 agent-browser 真浏览器截图确认。 */
    // 点遮罩空白关闭
    click(w, modal); await sleep(40);
    ok(!modal.classList.contains('on'), 'P1 点遮罩空白关闭');
    click(w, btn); await sleep(40);
    click(w, d.getElementById('ai-close')); await sleep(40);
    ok(!modal.classList.contains('on'), 'P1 点 ✕ 关闭');
  }

  console.log('\n【P2】默认智谱 + 切到 Gemini 生效');
  {
    const { w, d } = boot(); await sleep(120);
    ok(w.__SI.getProviderId() === 'zhipu', 'P2 默认 provider = zhipu');
    ok(w.__SI.getAPI().model === 'glm-4.7-flash', 'P2 默认主模型 glm-4.7-flash');
    const segZ = d.querySelector('#ai-seg button[data-p="zhipu"]');
    const segG = d.querySelector('#ai-seg button[data-p="gemini"]');
    ok(/⚡/.test(segZ.textContent), 'P2 智谱 AutoGLM 选项带 ⚡ 图标');
    ok(/✦/.test(segG.textContent), 'P2 Gemini 选项带 ✦ 图标');
    click(w, d.getElementById('btn-ai')); await sleep(40);
    const gemBtn = d.querySelector('#ai-seg button[data-p="gemini"]');
    click(w, gemBtn); await sleep(80);
    ok(w.__SI.getProviderId() === 'gemini', 'P2 切到 gemini');
    const api = w.__SI.getAPI();
    ok(api.endpoint.indexOf('generativelanguage.googleapis.com') >= 0, 'P2 endpoint 换成 Gemini');
    ok(api.model === 'gemini-3.7-flash', 'P2 主模型换成 gemini-3.7-flash');
    ok(api.fallbackModels[0] === 'gemini-3.6-flash', 'P2 降级链第 1 位 gemini-3.6-flash');
    ok(api.sendThinking === false, 'P2 Gemini 不传 thinking 字段');
    const cur = d.getElementById('ai-cur').textContent;
    ok(/Gemini/.test(cur), 'P2 状态栏显示 Gemini：' + cur);
  }

  console.log('\n【P3】切回智谱 + 自定义配置保存');
  {
    const { w, d } = boot(); await sleep(120);
    click(w, d.getElementById('btn-ai')); await sleep(40);
    click(w, d.querySelector('#ai-seg button[data-p="custom"]')); await sleep(60);
    ok(d.getElementById('ai-custom').style.display !== 'none', 'P3 选自定义后字段区展开');
    d.getElementById('ai-ep').value = 'https://example.com/v1/chat/completions';
    d.getElementById('ai-key').value = 'sk-test123';
    d.getElementById('ai-models').value = 'my-model-a, my-model-b';
    click(w, d.getElementById('ai-save')); await sleep(80);
    const api = w.__SI.getAPI();
    ok(api.endpoint === 'https://example.com/v1/chat/completions', 'P3 endpoint 保存生效');
    ok(api.model === 'my-model-a', 'P3 主模型 = my-model-a');
    ok(api.fallbackModels[0] === 'my-model-b', 'P3 降级链 = my-model-b');
    ok(w.localStorage.getItem('soul_ai_custom').indexOf('my-model-a') >= 0, 'P3 自定义配置持久化到 localStorage');
  }

  console.log('\n【P4】provider 选择持久化 + 刷新恢复');
  {
    const { w, d } = boot(); await sleep(120);
    click(w, d.getElementById('btn-ai')); await sleep(40);
    click(w, d.querySelector('#ai-seg button[data-p="gemini"]')); await sleep(60);
    ok(w.localStorage.getItem('soul_ai_provider') === 'gemini', 'P4 provider 选择写入 localStorage');
    // 重新 boot（新 window 但共享不了 localStorage，直接验证 storage key 即可）
  }

  console.log('\n【P5】Gemini 地区限制（400 数组错误体）→ 自动降级到智谱');
  { /* 真实场景：海外/受限地区用户选 Gemini，Google 返回
       400 [{error:{message:"User location is not supported...",status:"FAILED_PRECONDITION"}}]。
       两个关键：① 错误体是数组，旧解析认不出 → 只会笼统报「出题服务返回异常」；
       ② 这是 provider 级故障，切模型没用，必须换 provider（智谱）兜底。 */
    const { w, d } = boot(); await sleep(120);
    click(w, d.getElementById('btn-ai')); await sleep(40);
    click(w, d.querySelector('#ai-seg button[data-p="gemini"]')); await sleep(80);
    ok(w.__SI.getProviderId() === 'gemini', 'P5 当前选择 gemini');
    const used = [];
    w.fetch = (u, o) => {
      used.push(String(u));
      if(String(u).indexOf('googleapis') >= 0) return Promise.resolve(geminiRegionErr());
      return Promise.resolve(sseOK('{"portrait":"智谱救场"}'));
    };
    const r = await w.__SI.streamAssess([{role:'system',content:'x'}], ()=>{});
    ok(r.ok === true, 'P5 Gemini 地区限制 → 自动用智谱成功返回（reason=' + (r.reason||'-') + '）');
    ok(used.some(u => u.indexOf('googleapis') >= 0), 'P5 先试了 Gemini');
    ok(used.some(u => u.indexOf('bigmodel') >= 0), 'P5 确实落到智谱 endpoint');
    ok(r.text && /智谱救场/.test(r.text), 'P5 正文来自智谱');
    ok(w.__SI.getProviderId() === 'gemini', 'P5 用户持久选择仍为 gemini（临时借用，不抢用户设置）');
    ok(w.localStorage.getItem('soul_ai_provider') === 'gemini', 'P5 localStorage 未被降级改写');
  }

  console.log('\n【P6】provider 病态缓存：已知地区限制后不再白撞 Gemini');
  {
    const { w, d } = boot(); await sleep(120);
    click(w, d.getElementById('btn-ai')); await sleep(40);
    click(w, d.querySelector('#ai-seg button[data-p="gemini"]')); await sleep(80);
    const used = [];
    w.fetch = (u, o) => {
      used.push(String(u));
      if(String(u).indexOf('googleapis') >= 0) return Promise.resolve(geminiRegionErr());
      return Promise.resolve(sseOK('{"portrait":"ok"}'));
    };
    await w.__SI.streamAssess([{role:'system',content:'x'}], ()=>{});   // 第一次：撞 Gemini → 降级智谱
    used.length = 0;
    await w.__SI.streamAssess([{role:'system',content:'x'}], ()=>{});   // 第二次：应直接走智谱
    ok(used.every(u => u.indexOf('googleapis') < 0), 'P6 第二次调用直接走智谱（provider 病态缓存生效，不再白撞）');
  }

  console.log('\n【P7】切换 provider 后不沿用陈旧「未配置 API」横幅（根因修复）');
  { /* 真实踩坑：用户上次空 Key / 失败缓存了降级 bank 题集（qfall='noconf'），
       切到 Gemini（已有有效 Key）但背景没变 → 旧 early-return 直接复用旧题集 →
       顶部一直显示「未配置 API」。修复后只要题集来源(ai/bank)与当前 AI 可用性不一致就重新生成。
       这里让 fetch 直接失败（强制 net），断言：重新生成后 qfall 不再是陈旧的 'noconf'。 */
    const failFetch = () => Promise.reject(new Error('net-sim'));
    const { w, d } = boot(failFetch); await sleep(120);
    const S = w.__SI.getS();
    const sig = w.__SI.bgSig();
    // 构造一个与当前背景匹配、缓存的「降级通用题库」（choice 非空，能触发旧 early-return）
    S.qset = { anchorCount:12, choice:[{id:'a1',t:'x',A:{text:'1'},B:{text:'2'}}], bankCount:12, aiCount:0, anchor:[], bank:[], open:[] };
    S.order = [0,1,2]; S.idx = 0; S.bgSig = sig; S.qsrc = 'bank'; S.qfall = 'noconf'; S.qgenModel = '';
    ok(S.bgSig === sig, 'P7 预置缓存题集与当前背景签名一致（可触发旧 early-return）');
    click(w, d.getElementById('btn-ai')); await sleep(40);
    click(w, d.querySelector('#ai-seg button[data-p="gemini"]')); await sleep(80);
    ok(w.__SI.getProviderId() === 'gemini' && w.__SI.getAPI().key.length > 10, 'P7 已切到 Gemini（有效 Key，useAI=true）');
    await w.__SI.startTest(); await sleep(80);
    ok(w.__SI.getS().qfall !== 'noconf', 'P7 重新生成后不再沿用陈旧 noconf（qfall=' + (w.__SI.getS().qfall || '-') + '）');
    const banner = d.getElementById('t-banner');
    ok(!/未配置 API/.test(banner.innerHTML), 'P7 顶部横幅不再显示「未配置 API」');
    ok(w.__SI.getS().qsrc === 'bank', 'P7 AI 失败才降级为通用题库（诚实标注，而非陈旧 noconf）');
  }

  console.log('\n【P8】出题路径：主模型挂住 → 时间片到点切下一个模型救回（不再整链判死「等待超时」）');
  { /* 真实踩坑：旧 callAPIChain 计时器一响就 finish('abort') 判死整条链，备用模型一个都轮不上。
       Gemini 3 flash 是思考型模型（裸连真实出题 ~10.5s），走 VPN 轻松破 30s → 必「等待超时」降级。
       修复：总预算 + 每模型时间片（与 streamAssess 同机制），超时切下一个模型；用户「跳过」仍立即判死。 */
    // 模型链单一事实源：从源码解析（勿硬编码模型名）
    const _MODELS = jsCode.match(/models\s*:\s*\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    const PRI = _MODELS[0], FB1 = _MODELS[1];
    // 时间片压到毫秒级，让「主模型挂住」场景秒级跑完
    const shrink = src => src
      .replace(/var GEN_TOTAL_MS = \d+;/, 'var GEN_TOTAL_MS = 2500;')
      .replace(/var GEN_SLICE_MS\s+= \d+;/, 'var GEN_SLICE_MS    = 600;')
      .replace(/var GEN_RESERVE_MS\s+= \d+;/, 'var GEN_RESERVE_MS  = 600;')
      .replace(/var GEN_MIN_PRIMARY = \d+;/, 'var GEN_MIN_PRIMARY = 400;');
    // 合法 AI 题集：4 维 × 3 道（带 dim/pole）+ 3 道简答（避开坏题句式过滤）
    const dims = ['EI','SN','TF','JP']; const choice = [];
    for(const dm of dims) for(let i=0;i<3;i++)
      choice.push({ q:'情境'+dm+i+'：项目临交前你发现方案有问题，第一反应是？',
                    A:{ text:'当场指出来', dim:dm, pole:dm[0] },
                    B:{ text:'私下再提醒', dim:dm, pole:dm[1] } });
    const aiSet = JSON.stringify({ choice, open:[
      '最近一周让你最有成就感的一件小事是什么？',
      '描述一次你和想法完全不同的人合作的经历。',
      '如果下周完全由你安排，你会做什么？'] });
    const okResp = content => Promise.resolve({ ok:true, status:200,
      headers:{ get:()=>'application/json' },
      json:()=>Promise.resolve({ choices:[{ message:{ content } }] }) });
    const tried = [];
    const { w, d } = boot((u, o2) => {
      const model = JSON.parse(o2.body).model; tried.push(model);
      if(model === PRI){
        // 主模型挂住：不 resolve；监听 signal，abort 时按真实 fetch 行为抛 AbortError
        return new Promise((_, rej) => {
          const sig = o2 && o2.signal;
          if(sig && sig.addEventListener) sig.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
        });
      }
      return okResp(aiSet);
    }, shrink);
    await sleep(120);
    await w.__SI.startTest(); await sleep(600);
    ok(tried.indexOf(PRI) > -1, 'P8 主模型 ' + PRI + ' 被尝试（挂住）');
    ok(tried.indexOf(FB1) > -1, 'P8 时间片到点后切到 ' + FB1 + '（旧版会直接判死 abort）');
    ok(w.__SI.getS().qsrc === 'ai' && w.__SI.getS().qfall === '', 'P8 出题最终成功（qsrc=ai，未降级 bank）');
    ok(!/等待超时/.test(d.getElementById('t-banner').innerHTML), 'P8 横幅不再出现「等待超时，已自动降级」');
  }

  console.log('\n多 provider UI 回归：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
})();
