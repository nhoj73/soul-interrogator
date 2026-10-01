// 穷举扫描：结果页每个按钮都点一遍 → 再回到首页 → 全 DOM 扫残留全屏层
// 不预设「只有三个遮罩」，而是扫描 document 里所有带 show/on 类的元素，
// 以及所有 CSS 里 position:fixed 的全屏层，看回首页后还有谁没被清掉。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 从源码里抓出所有 position:fixed 的选择器（潜在全屏层），不靠记忆
const fixedSel = [...jsCode.matchAll(/([^\n{}]+)\{[^}]*position\s*:\s*fixed/g)]
  .map(m => m[1].trim()).filter(s => s && !s.startsWith('@'));
console.log('源码里 position:fixed 的选择器：', fixedSel.join(' | '));

function mkDom(step, over) {
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
  Object.assign(prof, over || {});
  w.localStorage.setItem('soul_interrogator_v1', JSON.stringify({ v: 1, activeId: 'p-self', profiles: [prof] }));
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d: w.document };
}

// 扫全 DOM：任何带 show/on/open/active 类且不是 page 本身的元素，都当成可疑残留层
function sweep(d) {
  const out = [];
  d.querySelectorAll('*').forEach(el => {
    const cl = Array.from(el.classList || []);
    const suspicious = cl.filter(c => ['show', 'on', 'open'].indexOf(c) > -1);
    if (!suspicious.length) return;
    if (el.classList.contains('page')) return;      // page.active 是正常路由
    if (el.classList.contains('chip')) return;      // .chip.on 是选中态，不是遮罩
    if (el.classList.contains('mode-card')) return;
    if (el.classList.contains('type-cell')) return;
    if (el.classList.contains('load-step')) return;
    out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + cl.join('.')) + ' [' + suspicious.join(',') + ']');
  });
  return out;
}
const activePage = d => { const p = d.querySelector('.page.active'); return p ? p.id : '(none)'; };

// 结果页上所有按钮（含 AI 区内动态出现的重试按钮）
const RESULT_BTNS = ['r-back', 'r-copy-pyq', 'r-retest', 'r-share', 'r-copy', 'r-home', 'r-verify', 'r-shot'];
// 各页回首页的兜底按钮
const HOME_BTN_BY_PAGE = {
  'page-test': 't-home', 'page-verify': 'v-home', 'page-profiles': 'prof-back',
  'page-mode': 'mode-back', 'page-cross-chat': 'cross-back', 'page-chat-chat': 'chat-back',
  'page-cross-report': 'cx-home', 'page-chat-report': 'cc-home', 'page-bg': null
};

console.log('\n===== 穷举：结果页每个按钮 → 回首页 → 扫残留 =====');
let bad = 0, good = 0;
for (const id of RESULT_BTNS) {
  const { d, w } = mkDom('result', { idx: 2 });
  await sleep(140);
  const btn = d.querySelector('#' + id);
  if (!btn) { console.log('  (跳过) 结果页无 #' + id); continue; }
  let note = '';
  try { btn.click(); } catch (e) { note += ' 点击抛错:' + e.message; }
  await sleep(120);
  // 若弹出确认框，点确定
  if (d.querySelector('#mask').classList.contains('show')) {
    d.querySelector('#m-ok').click(); await sleep(180);
    note += ' (确认框→确定)';
  }
  // 若还不在首页，用该页的回首页按钮再走一次
  if (activePage(d) !== 'page-home') {
    const hb = HOME_BTN_BY_PAGE[activePage(d)];
    if (hb) {
      const h = d.querySelector('#' + hb);
      if (h) { h.click(); await sleep(120);
        if (d.querySelector('#mask').classList.contains('show')) { d.querySelector('#m-ok').click(); await sleep(180); } }
      else note += ' 无兜底按钮#' + hb;
    } else note += ' (停在' + activePage(d) + '，无回首页按钮)';
  }
  const resid = sweep(d);
  const okFlag = resid.length === 0;
  if (okFlag) { good++; console.log('  [干净] #' + id + ' → ' + activePage(d) + note); }
  else { bad++; console.log('  [残留] #' + id + ' → ' + activePage(d) + note + ' 残留=' + resid.join(', ')); }
}

console.log('\n===== 穷举：从各页直接回首页 → 扫残留 =====');
for (const [page, hb] of Object.entries(HOME_BTN_BY_PAGE)) {
  const step = page.replace('page-', '');
  if (!hb) continue;
  const { d } = mkDom(step, { idx: 2 });
  await sleep(140);
  const h = d.querySelector('#' + hb);
  if (!h) { console.log('  (跳过) ' + page + ' 无 #' + hb); continue; }
  h.click(); await sleep(160);
  if (d.querySelector('#mask').classList.contains('show')) { d.querySelector('#m-ok').click(); await sleep(180); }
  const resid = sweep(d);
  if (resid.length === 0) { good++; console.log('  [干净] ' + page + ' → #' + hb + ' → ' + activePage(d)); }
  else { bad++; console.log('  [残留] ' + page + ' → #' + hb + ' → ' + activePage(d) + ' 残留=' + resid.join(', ')); }
}

console.log('\n========== 汇总：' + good + ' 条干净 / ' + bad + ' 条残留 ==========');
process.exit(0);
