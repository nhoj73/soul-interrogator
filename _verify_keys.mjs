// Key 降级回归：主 Key 报 401(auth)/402(quota) 时应切到备用 Key 重跑；
// 模型过载(1305)/限流(1302) 这类「换 Key 无意义」的错误不应切 Key。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

// 单一事实源：从源码解析 key 列表。
// 主 Key 从 PROVIDERS.zhipu.keys 数组解析（多 provider 后 key 在 keys:[] 里）。
// 限定「32位hex.secret」格式，避开维度表里的 { key:'EI' }。
const MAIN_KEY = jsCode.match(/keys\s*:\s*\[\s*'([0-9a-f]{32}\.[^']+)'/)[1];
const FB_KEYS = jsCode.match(/fallbackKeys\s*:\s*\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }

const patch = src => src.replace('async function streamAssess(messages, onDelta, onProgress){',
  'window.__SI = window.__SI || {}; window.__SI.streamAssess = streamAssess; async function streamAssess(messages, onDelta, onProgress){');

function sseOK(text){
  const sse = 'data: ' + JSON.stringify({ choices:[{ delta:{ content:text } }] }) + '\n\ndata: [DONE]\n\n';
  return { ok:true, status:200, headers:{ get:()=> 'text/event-stream' },
    body:{ getReader:()=>{ let s=false; return { read:()=>{ if(!s){ s=true; return Promise.resolve({done:false, value:new TextEncoder().encode(sse)}); } return Promise.resolve({done:true}); } }; } } };
}
function errBody(code, msg){
  return { ok:false, status:(code==='401'||code==='402' ? (code==='402'?402:401) : 429),
    headers:{ get:()=> 'application/json' },
    text:()=>Promise.resolve(JSON.stringify({ error:{ code:code, message:msg } })) };
}
function authOf(o){
  if(!o || !o.headers) return '';
  return o.headers.Authorization || (o.headers.get ? o.headers.get('Authorization') : '') || '';
}
function boot(fetchImpl){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = fetchImpl;
  const s = w.document.createElement('script'); s.textContent = patch(jsCode); w.document.body.appendChild(s);
  return w;
}

(async () => {
  console.log('\n【A】主 Key 401（失效）→ 切备用 Key 成功');
  {
    const keys = [];
    const w = boot((u, o) => {
      const auth = authOf(o); keys.push(auth);
      if(auth.indexOf(MAIN_KEY) >= 0) return Promise.resolve(errBody('401', '令牌已过期或验证不正确'));
      return Promise.resolve(sseOK('{"portrait":"备用Key救场"}'));
    });
    await sleep(80);
    const r = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r.ok === true, 'A 主 Key 401 后由备用 Key 成功返回（reason=' + (r.reason||'-') + '）');
    ok(keys.length === 2, 'A 恰好两次调用：主 Key 失败 + 备用 Key 重跑（实际 ' + keys.length + ' 次）');
    ok(keys[0].indexOf(MAIN_KEY) >= 0, 'A 第一次用的是主 Key');
    ok(keys[1].indexOf(FB_KEYS[0]) >= 0, 'A 第二次用的是备用 Key');
  }

  console.log('\n【B】主 Key 402（额度耗尽）→ 切备用 Key 成功');
  {
    const keys = [];
    const w = boot((u, o) => {
      const auth = authOf(o); keys.push(auth);
      if(auth.indexOf(MAIN_KEY) >= 0) return Promise.resolve(errBody('402', '余额不足，请充值'));
      return Promise.resolve(sseOK('{"portrait":"备用Key救场"}'));
    });
    await sleep(80);
    const r = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r.ok === true, 'B 主 Key 402 后由备用 Key 成功返回（reason=' + (r.reason||'-') + '）');
    ok(keys[1] && keys[1].indexOf(FB_KEYS[0]) >= 0, 'B 第二次用的是备用 Key');
  }

  console.log('\n【C】模型过载(1305) → 不切 Key，走模型降级');
  {
    const keys = [];
    const w = boot((u, o) => {
      const auth = authOf(o); keys.push(auth);
      return Promise.resolve(errBody('1305', '该模型当前访问量过大'));
    });
    await sleep(80);
    const r = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r.ok === false && r.reason === 'busy', 'C 全 1305 → busy（不假装成功），reason=' + (r.reason||'-') );
    ok(keys.every(a => a.indexOf(MAIN_KEY) >= 0), 'C 只用了主 Key、未切 Key（换 Key 对模型过载无意义）');
  }

  console.log('\n【D】两个 Key 都 401 → 最终 auth，不再无限重试');
  {
    const keys = [];
    const w = boot((u, o) => { const auth = authOf(o); keys.push(auth); return Promise.resolve(errBody('401', '令牌已过期')); });
    await sleep(80);
    const r = await w.__SI.streamAssess([{role:'user',content:'x'}], ()=>{});
    ok(r.ok === false && r.reason === 'auth', 'D 两 Key 都失效 → auth（reason=' + (r.reason||'-') + '）');
    /* auth 现在也是 provider 级错误：本 provider 的 key 用尽后，会临时借用下一个
       provider（gemini）的 key 再试一次，仍失败才停。所以是 3 次而非 2 次。 */
    ok(keys.length === 3, 'D 主 Key + 备用 Key + 备用 provider 的 Key 各试一次后停（实际 ' + keys.length + ' 次）');
    ok(keys[2] && keys[2].indexOf(FB_KEYS[0]) < 0 && keys[2] !== keys[0] && keys[2] !== keys[1], 'D 第三次用的是另一家 provider 的 Key');
  }

  console.log('\nKey 降级回归：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
})();
