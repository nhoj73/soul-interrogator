// 复现「AI 正忙」现场并贴出全链路日志（Task 2 证据）
// 用 mock fetch 让 4 个模型全部返回 1305（访问量过大），跑通 streamAssess + streamAssessRetry 全链路，
// 捕获 console 输出，证明：(a) 每次尝试都记录了 model/HTTP/错误码/耗时；(b) 文案分流为「平台高峰」而非「正忙」。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 捕获所有 console 输出（同时真实打印，结尾再汇总一次）
const logs = [];
const realLog = console.log.bind(console);
const realWarn = console.warn.bind(console);
const realErr = console.error.bind(console);
const cap = (label, real) => (...a) => { const line = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); const full = '[' + label + '] ' + line; logs.push(full); real(full); };
console.log = cap('log', realLog); console.warn = cap('warn', realWarn); console.error = cap('error', realErr);

const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
const w = dom.window;
w.scrollTo = () => {};
w.AbortController = w.AbortController || AbortController;
w.TextDecoder = w.TextDecoder || TextDecoder;
w.TextEncoder = w.TextEncoder || TextEncoder;

// 全模型 1305 mock（HTTP 429 + body code 1305）
function sse1305() {
  return { ok: false, status: 429, text: () => Promise.resolve(JSON.stringify({ error: { code: '1305', message: '访问量过大' } })) };
}
w.fetch = () => Promise.resolve(sse1305());

w.html2canvas = () => Promise.resolve({ toDataURL: () => 'data,', toBlob: cb => cb(new w.Blob(['x'])) });
Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
w.prompt = () => 'xiaoming';

// 本人档案：已答完、停在结果页、无 assess 缓存 → 触发 runAssessment（直接调 streamAssess）
const seed = { v: 1, activeId: 'p-self', profiles: [
  { id: 'p-self', name: 'wo', kind: 'self', step: 'result',
    bg: { age: '23-28', job: 'designer', life: ['work'], worry: '' },
    order: ['a','b','c'], idx: 3, finished: true,
    qset: { choice: [ {id:'a',dim:'E',A:{pole:'E'},B:{pole:'I'}}, {id:'b',dim:'S',A:{pole:'S'},B:{pole:'N'}}, {id:'c',dim:'T',A:{pole:'T'},B:{pole:'F'}} ], open: [] },
    ans: { a:{pick:'a'}, b:{pick:'a'}, c:{pick:'a'} }, open: {},
    resultCode: 'ESTP', assess: null, mode: null, round: 0, report: null,
    verify_round: 0, verify_done: false, verify_messages: null, verify_report: null }
] };
w.localStorage.setItem('soul_interrogator_v1', JSON.stringify(seed));
const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
const d = w.document;

console.log('INFO 已加载页面，等待 runAssessment 全链路（约 16s）…');
await sleep(18000);

const st = d.querySelector('#ai-st');
const box = d.querySelector('#ai-box');
console.log('INFO 最终 #ai-st 文案 = ' + (st ? JSON.stringify(st.textContent) : 'null'));
console.log('INFO 最终 #ai-box 内容 = ' + (box ? box.innerHTML.replace(/\s+/g, ' ').slice(0, 240) : 'null'));

console.log('\n========== 全链路日志原文（复现「正忙」）==========');
logs.forEach(l => console.log(l));
process.exit(0);
