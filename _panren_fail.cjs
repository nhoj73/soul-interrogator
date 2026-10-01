/* 盘人降级路径测试：mock fetch 失败，验证三类降级行为。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, 'soul-interrogator.html');
const html = fs.readFileSync(FILE, 'utf8');
let fails = 0, passes = 0;
const ok = (n,c) => { if(c){ passes++; console.log('  ✓ '+n); } else { fails++; console.log('  ✗ '+n); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeDom(failFirst){
  let calls = 0;
  const fn = (url, opt) => {
    calls++;
    if(calls <= failFirst){
      return Promise.resolve({ ok:false, status:500, text:()=>Promise.resolve('boom') });
    }
    let body; try{ body = JSON.parse(opt.body); }catch(e){ body={}; }
    const msgs = body.messages||[]; const last = (msgs.filter(m=>m.role==='user').slice(-1)[0]||{}).content||'';
    let text = /输出鉴定报告/.test(last)
      ? '{"match_rate":60,"confidence":"低","dims":[{"dim":"EI","verdict":"存疑","note":"x"}],"evidence_match":[],"evidence_doubt":[],"base_color":"","roast":"r"}'
      : '（点评）收到。最近一次呢？';
    return Promise.resolve({ ok:true, json:()=>Promise.resolve({ choices:[{ message:{ content:text } }] }) });
  };
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const s=String(e.detail||e.message||e); if(!/scrollTo/.test(s)) errs.push(s); });
  const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://example.com/x.html', virtualConsole:vc });
  dom.window.fetch = fn;
  return { dom, errs };
}

async function startCrossChat(window, failFirst){
  const doc = window.document; const $ = id => doc.getElementById(id);
  const active = () => { const p = doc.querySelector('.page.active'); return p?p.id:'(none)'; };
  const click = el => el && el.dispatchEvent(new window.Event('click',{bubbles:true}));
  click($('enter-cross')); await wait(20);
  click($('mode-cross')); await wait(20);
  $('type-grid').querySelectorAll('.type-cell').forEach(c=>{ if(c.textContent==='ISTJ') click(c); });
  click($('type-ok')); await wait(20);
  return { doc, $, active, click };
}

(async function(){
  console.log('\n[A] 拷问首轮失败 → 8 道静态自测题 + 不切页');
  {
    const { dom, errs } = makeDom(1); // 第一次调用失败
    await wait(60);
    const { doc, $, active, click } = await startCrossChat(dom.window, 1);
    await wait(150); // 等首轮失败
    ok('仍在拷问对话页(未切页)', active() === 'page-cross-chat');
    const txt = $('cross-scroll').textContent;
    ok('明示替代自测提示', txt.indexOf('AI 鉴定需要 AI 在线') > -1);
    const has8 = [1,2,3,4,5,6,7,8].every(n => txt.indexOf('【'+(n===1?'E':n===2?'E':n===3?'S':n===4?'S':n===5?'T':n===6?'T':n===7?'J':'J')+'/I】') > -1);
    ok('含 8 道静态题(覆盖 E/I/S/N/T/F/J/P)', /【E\/I】/.test(txt) && /【S\/N】/.test(txt) && /【T\/F】/.test(txt) && /【J\/P】/.test(txt) && txt.split('【').length >= 9);
    ok('提供"再试一次"按钮', !!$('cross-static-retry'));
    ok('无 JS 错误', errs.length === 0);
  }

  console.log('\n[B] 拷问对话中途失败 → 只重试不切页');
  {
    const { dom, errs } = makeDom(2); // 首轮成功，第二轮(用户首次发送)失败
    await wait(60);
    const { doc, $, active, click } = await startCrossChat(dom.window, 2);
    await wait(150); // 首轮成功
    ok('首轮成功→AI 已开场', $('cross-scroll').querySelectorAll('.bubble.ai').length >= 1);
    $('cross-input').value = '上周我推了饭局在家看书。';
    click($('cross-send')); await wait(180); // 第二轮失败
    ok('中途失败后仍在对话页(不切页)', active() === 'page-cross-chat');
    ok('出现"再试一次"重试入口', !!$('cross-retry'));
    // 点重试（此时 failFirst=2 已耗尽→成功）
    click($('cross-retry')); await wait(180);
    ok('重试后 AI 恢复回复', $('cross-scroll').querySelectorAll('.bubble.ai').length >= 2);
    ok('无 JS 错误', errs.length === 0);
  }

  console.log('\n[C] 闲聊首轮失败 → 回模式选择 + toast "AI 正忙"');
  {
    const { dom, errs } = makeDom(1);
    await wait(60);
    const window = dom.window, doc = window.document, $ = id=>doc.getElementById(id);
    const active = () => { const p=doc.querySelector('.page.active'); return p?p.id:'(none)'; };
    const click = el => el && el.dispatchEvent(new window.Event('click',{bubbles:true}));
    click($('enter-cross')); await wait(20);
    click($('mode-chat')); await wait(20);
    $('type-grid').querySelectorAll('.type-cell').forEach(c=>{ if(c.textContent==='ENFP') click(c); });
    click($('type-ok')); await wait(20);
    await wait(150); // 首轮失败
    ok('闲聊首轮失败→回模式选择页', active() === 'page-mode');
    ok('toast 提示 AI 正忙', ($('toast').textContent || '').indexOf('AI 正忙') > -1);
    ok('无 JS 错误', errs.length === 0);
  }

  console.log('\n==== 降级测试：'+passes+' 通过 / '+fails+' 失败 ====');
  process.exit(fails?1:0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
