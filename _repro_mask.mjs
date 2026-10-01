// 复现「点回到首页还残留毛玻璃/全屏遮罩」
// 覆盖两类遮罩层：
//   A. #mask        —— .show   （ask() 确认框，backdrop-filter 毛玻璃，z-index 99）
//   B. #shot-mask   —— .on     （分享图全屏预览，94% 不透明，z-index 200）
//   C. #modal-export—— .on     （导出弹层）
// go() 目前只清 A。本脚本验证 B/C 在「回首页」后是否残留。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let leaks = 0, clean = 0;
function report(scenario, okFlag, detail) {
  if (okFlag) { clean++; console.log('  [干净] ' + scenario + (detail ? ' —— ' + detail : '')); }
  else { leaks++; console.log('  [残留] ' + scenario + (detail ? ' —— ' + detail : '')); }
}

function mkDom(step) {
  const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body);
    if (b.stream) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) } });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ choice: [], open: [] }) } }] }) });
  };
  w.html2canvas = () => Promise.resolve({ toDataURL: () => 'data:,', toBlob: cb => cb(new w.Blob(['x'])) });
  Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
  w.prompt = () => 'xiaoming';

  const prof = {
    id: 'p-self', name: 'wo', kind: 'self', step: step,
    bg: { age: '23-28', job: 'designer', life: ['work'], worry: '' },
    order: ['a', 'b', 'c'], idx: 2, finished: true,
    qset: { choice: [
      { id: 'a', dim: 'E', A: { pole: 'E' }, B: { pole: 'I' } },
      { id: 'b', dim: 'S', A: { pole: 'S' }, B: { pole: 'N' } },
      { id: 'c', dim: 'T', A: { pole: 'T' }, B: { pole: 'F' } }
    ], open: [] },
    ans: { a: { pick: 'a' }, b: { pick: 'a' }, c: { pick: 'a' } }, open: {},
    resultCode: 'ESTP', assess: { ok: true, data: { type: 'ESTP' } },
    mode: null, round: 0, report: null,
    verify_round: 0, verify_done: false, verify_messages: null, verify_report: null
  };
  w.localStorage.setItem('soul_interrogator_v1', JSON.stringify({ v: 1, activeId: 'p-self', profiles: [prof] }));
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d: w.document };
}

const maskOn  = d => d.querySelector('#mask').classList.contains('show');
const shotOn  = d => d.querySelector('#shot-mask').classList.contains('on');
const expOn   = d => d.querySelector('#modal-export').classList.contains('on');
const homeAct = d => d.querySelector('#page-home').classList.contains('active');

console.log('\n===== 场景 A：结果页 → 点「回到首页」→ 确认框点「重新开始」=====');
{
  const { w, d } = mkDom('result'); await sleep(150);
  d.querySelector('#r-home').click(); await sleep(80);
  const shown = maskOn(d);
  d.querySelector('#m-ok').click(); await sleep(200);
  report('A. #mask', !maskOn(d), '确认后 mask.show=' + maskOn(d) + '，确认框曾弹出=' + shown);
  report('A. 已回首页', homeAct(d), 'page-home.active=' + homeAct(d));
}

console.log('\n===== 场景 B：结果页 → 打开分享图全屏预览 → 点「回到首页」=====');
{
  const { w, d } = mkDom('result'); await sleep(150);
  d.querySelector('#shot-mask').classList.add('on');   // 等价于生成分享图后 showShot() 打开的状态
  d.querySelector('#r-home').click(); await sleep(80);
  d.querySelector('#m-ok').click(); await sleep(200);
  report('B. #shot-mask 回首页后是否清除', !shotOn(d), 'shot-mask.on=' + shotOn(d) + '（z-index 200 全屏）');
}

console.log('\n===== 场景 C：档案页 → 打开导出弹层 → 点「返回首页」=====');
{
  const { w, d } = mkDom('profiles'); await sleep(150);
  d.querySelector('#modal-export').classList.add('on');
  d.querySelector('#prof-back').click(); await sleep(200);
  report('C. #modal-export 回首页后是否清除', !expOn(d), 'modal-export.on=' + expOn(d));
}

console.log('\n===== 场景 D：结果页 → 点「回到首页」→ 取消 =====');
{
  const { w, d } = mkDom('result'); await sleep(150);
  d.querySelector('#r-home').click(); await sleep(80);
  d.querySelector('#m-cancel').click(); await sleep(200);
  report('D. #mask 取消后是否清除', !maskOn(d), 'mask.show=' + maskOn(d));
}

console.log('\n===== 场景 E：结果页 → 分享图预览开着 → 直接点其他回首页入口 =====');
{
  const { w, d } = mkDom('result'); await sleep(150);
  d.querySelector('#shot-mask').classList.add('on');
  d.querySelector('#r-back').click(); await sleep(120);      // 回看题目（test 页）
  report('E. #r-back 后 shot-mask', !shotOn(d), 'shot-mask.on=' + shotOn(d));
  d.querySelector('#t-home').click(); await sleep(200);      // 再点回首页
  report('E. #t-home 后 shot-mask', !shotOn(d), 'shot-mask.on=' + shotOn(d));
}

console.log('\n========== 汇总：' + clean + ' 条干净 / ' + leaks + ' 条残留 ==========');
process.exit(0);
