// 接口地址输入框布局 · 真浏览器宽度断言（jsdom 不渲染布局，必须真 Chromium）
// 依赖 agent-browser CLI（真浏览器）；目标为本地 dist/index.html。
// 断言：输入框宽度占比、不与按钮重叠、不溢出容器、展开下拉不回挤、窄屏仍可见、可输入。
import { execFileSync } from 'child_process';
import fs from 'fs';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/dist/index.html';
if(!fs.existsSync(FILE)){ console.error('dist 不存在，先跑 publish.sh'); process.exit(1); }

let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }

function ab(args){
  try { return execFileSync('agent-browser', args, { encoding:'utf8', timeout:120000 }); }
  catch(e){ return 'ERR:' + String(e.stdout || e.message || e).slice(0, 300); }
}
/* eval 返回 JSON 字符串；CLI 输出带引号包裹，去掉首尾引号并反转义 */
function ev(js){
  const out = ab(['eval', js]).trim();
  if(out.startsWith('ERR:')) return { __err: out };
  try { return JSON.parse(out.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"')); }
  catch(e){ return { __raw: out }; }
}

const MEASURE = `JSON.stringify((function(){
  var box = document.querySelector('#ai-ep').parentElement.getBoundingClientRect();
  var ep  = document.querySelector('#ai-ep').getBoundingClientRect();
  var btn = document.querySelector('#ai-preset-btn').getBoundingClientRect();
  return { contW: Math.round(box.width), contRight: Math.round(box.right),
           epW: Math.round(ep.width), epRight: Math.round(ep.right), epX: Math.round(ep.x),
           btnW: Math.round(btn.width), btnX: Math.round(btn.x), btnRight: Math.round(btn.right),
           listDisplay: getComputedStyle(document.querySelector('#ai-preset-list')).display,
           items: document.querySelectorAll('.ai-preset-item').length };
})())`;

(async () => {
  console.log('\n真浏览器宽度断言（目标：' + FILE + '）');
  ab(['close', '--all']);
  let r = ab(['open', 'file://' + FILE]);
  if(/ERR:/.test(r)){ console.error('浏览器打开失败：' + r); process.exit(1); }

  for(const vp of [[390, 844], [320, 700]]){
    ab(['set', 'viewport', String(vp[0]), String(vp[1])]);
    ab(['click', '#ai-close']);                       // 每轮先归位（上一轮可能停在打开态）
    ab(['click', '#btn-ai']);
    ab(['click', '#ai-seg button[data-p="custom"]']);
    const m = ev(MEASURE);
    const tag = vp[0] + 'px: ';
    if(m.__err){ ok(false, tag + '测量失败 ' + m.__err); continue; }
    ok(m.epW >= Math.round(m.contW * 0.6), tag + '输入框宽度 ≥ 容器 60%（' + m.epW + '/' + m.contW + '）');
    ok(m.epW >= 100, tag + '输入框绝对宽度 ≥100px（实际 ' + m.epW + 'px，修复前 30px）');
    ok(m.epRight <= m.btnX + 1, tag + '输入框与按钮不重叠（ep.right=' + m.epRight + ' ≤ btn.x=' + m.btnX + '）');
    ok(m.btnRight <= m.contRight + 1, tag + '按钮不溢出容器（btn.right=' + m.btnRight + ' ≤ cont.right=' + m.contRight + '）');
    // 展开下拉后输入框不被回挤
    const before = m.epW;
    ab(['click', '#ai-preset-btn']);
    const m2 = ev(MEASURE);
    ok(before - m2.epW <= 20 && m2.epW >= 100,
       tag + '展开预设下拉后输入框不被压窄（' + before + ' → ' + m2.epW + '，允许 ≤20px 滚动条抖动）');
    ok(m2.items === 12, tag + '下拉项 12 条全部渲染（实际 ' + m2.items + '）');
    ab(['click', '#ai-preset-btn']);   // 收起
    // 可输入且值保留
    ab(['fill', '#ai-ep', 'https://api.deepseek.com/chat/completions']);
    const v = ev(`JSON.stringify({ v: document.querySelector('#ai-ep').value, w: Math.round(document.querySelector('#ai-ep').getBoundingClientRect().width) })`);
    ok(v.v === 'https://api.deepseek.com/chat/completions', tag + '输入框可输入并保持完整值');
    ok(v.w === before, tag + '输入后宽度不变（' + v.w + '）');
  }

  ab(['screenshot', '/tmp/ai_ep_layout_390.png']);
  ab(['close', '--all']);
  console.log('\n真浏览器布局回归：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
})();
