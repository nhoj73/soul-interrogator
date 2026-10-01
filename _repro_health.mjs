// 复现「模型健康缓存」前后对比（Task 3 证据）
// 设定：链首模型返回 1305（病态），其余模型正常。
// 第一次调用：链首命中 1305 → 标记病态 3 分钟 → 切到备用链第 1 位成功。
// 第二次调用（3 分钟内）：buildChain 跳过病态的链首，直接从下一健康模型起跑。
// 注：链首模型名从 HTML 单一事实源解析，改链序后本脚本自动跟随。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
// 单一事实源：从 HTML 解析当前模型链
const PRIMARY = jsCode.match(/\bmodel\s*:\s*'(glm-[^']+)'/)[1];
const FALLBACKS = jsCode.match(/fallbackModels\s*:\s*\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
const FB1 = FALLBACKS[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const logs = [];
const realLog = console.log.bind(console);
const realWarn = console.warn.bind(console);
const cap = (label, real) => (...a) => { const line = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); const full = '[' + label + '] ' + line; logs.push(full); real(full); };
console.log = cap('log', realLog); console.warn = cap('warn', realWarn);

const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
const w = dom.window;
w.scrollTo = () => {};
w.AbortController = w.AbortController || AbortController;
w.TextDecoder = w.TextDecoder || TextDecoder;
w.TextEncoder = w.TextEncoder || TextEncoder;

function sseOk(text) {
  const chunks = ['data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n', 'data: [DONE]\n'];
  return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: () => chunks.length ? Promise.resolve({ value: new TextEncoder().encode(chunks.shift()) }) : Promise.resolve({ done: true }) }) } };
}
function sse1305() {
  return { ok: false, status: 429, text: () => Promise.resolve(JSON.stringify({ error: { code: '1305', message: '访问量过大' } })) };
}
// 链首 → 病态；其余 → 正常
w.fetch = (u, o) => { const m = (JSON.parse(o.body).model); return Promise.resolve(m === PRIMARY ? sse1305() : sseOk('我是健康的备用模型回复')); };

w.html2canvas = () => Promise.resolve({ toDataURL: () => 'data,', toBlob: cb => cb(new w.Blob(['x'])) });
Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
w.prompt = () => 'xiaoming';

// 本人档案，停在闲聊页
const seed = { v: 1, activeId: 'p-self', profiles: [
  { id: 'p-self', name: 'wo', kind: 'self', step: 'chat', mode: 'chat',
    bg: { age: '23-28', job: 'designer', life: ['work'], worry: '' },
    order: ['a','b','c'], idx: 3, finished: true,
    qset: { choice: [ {id:'a',dim:'E',A:{pole:'E'},B:{pole:'I'}}, {id:'b',dim:'S',A:{pole:'S'},B:{pole:'N'}}, {id:'c',dim:'T',A:{pole:'T'},B:{pole:'F'}} ], open: [] },
    ans: { a:{pick:'a'}, b:{pick:'a'}, c:{pick:'a'} }, open: {},
    resultCode: 'ESTP', assess: { ok: true, data: { type: 'ESTP' } }, messages: [], report: null,
    verify_round: 0, verify_done: false, verify_messages: null, verify_report: null }
] };
w.localStorage.setItem('soul_interrogator_v1', JSON.stringify(seed));
const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
const d = w.document;

await sleep(150);
const input = d.querySelector('#chat-input');
const send = d.querySelector('#chat-send');
console.log('INFO 第一次调用（链首 ' + PRIMARY + ' 病态，应切到 ' + FB1 + ' 成功）');
input.value = '你好';
input.dispatchEvent(new w.Event('input', { bubbles: true }));
send.click();
await sleep(2500);
console.log('INFO 第二次调用（3 分钟内，应跳过病态 ' + PRIMARY + '，直接 ' + FB1 + ' 起跑）');
input.value = '再聊一句';
input.dispatchEvent(new w.Event('input', { bubbles: true }));
send.click();
await sleep(2500);

console.log('\n========== 健康缓存前后对比日志 ==========');
logs.forEach(l => console.log(l));
process.exit(0);
