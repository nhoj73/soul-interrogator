/* 分享图专项测试（html2canvas 在 jsdom 里无法真实渲染，用 mock 验证调用链与降级） */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const fails = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fails.push(msg); console.log('  ✗ ' + msg); } }

const dims = ['EI', 'SN', 'TF', 'JP'];
const poles = { EI: ['E', 'I'], SN: ['S', 'N'], TF: ['T', 'F'], JP: ['J', 'P'] };
function makeAI() {
  const choice = [];
  dims.forEach(dim => {
    for (let i = 0; i < 6; i++) {
      choice.push({ q: `题干${dim}${i}`, A: { text: `A${dim}${i}`, dim: poles[dim][0] }, B: { text: `B${dim}${i}`, dim: poles[dim][1] } });
    }
  });
  return JSON.stringify({ choice, open: [{ q: '昨天你做了什么' }, { q: '上周花了三小时干什么' }, { q: '最近一次争执说了什么' }] });
}

function boot({ h2c, shareFiles = true } = {}) {
  const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (url, opt) => {
    const body = JSON.parse(opt.body);
    if (body.stream) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) } });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: makeAI() } }] }) });
  };
  // 记录被复制的文本
  w.__copied = '';
  Object.defineProperty(w.navigator, 'clipboard', {
    value: { writeText: t => { w.__copied = t; return Promise.resolve(); } }, configurable: true
  });
  if (shareFiles) {
    Object.defineProperty(w.navigator, 'canShare', { value: d => !!(d && d.files), configurable: true });
    Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
  } else {
    Object.defineProperty(w.navigator, 'canShare', { value: undefined, configurable: true });
  }
  if (h2c) w.html2canvas = h2c(w);
  const s = w.document.createElement('script');
  s.textContent = jsCode;
  w.document.body.appendChild(s);
  return { w, d: w.document };
}

async function fillBg(w, d, { job = '产品经理' } = {}) {
  d.querySelector('#btn-primary-start').click(); await sleep(30);
  const age = d.querySelector('#f-age');
  age.value = [...age.options][4].value;
  age.dispatchEvent(new w.Event('change', { bubbles: true }));
  const j = d.querySelector('#f-job'); j.value = job;
  j.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelectorAll('#f-life .chip')[1].click();
  d.querySelector('#bg-next').click();
  await sleep(150);
}

async function answerAll(w, d) {
  let guard = 0;
  while (d.querySelector('#page-test').classList.contains('active') && guard++ < 40) {
    if (d.querySelector('#op-i')) {
      const ta = d.querySelector('#op-i'); ta.value = '简答回答';
      ta.dispatchEvent(new w.Event('input', { bubbles: true }));
      d.querySelector('#op-ok').click(); await sleep(20);
    } else {
      d.querySelectorAll('#t-card .opt')[0].click();
      await sleep(260);
    }
  }
}

/* 模拟真实 html2canvas：在「克隆文档」上执行 options.onclone，并记录裁剪框与
   克隆后 stage 的状态，用来断言分享图修复（onclone 把卡片挪回视口、隐藏非目标卡）。 */
const fakeCanvas = (w) => (card, opts) => {
  w.__h2cOpts = opts || null;
  w.__oncloneStage = null;
  if (opts && typeof opts.onclone === 'function') {
    let clone;
    try { clone = w.document.cloneNode(true); } catch (e) { clone = w.document; }
    try { opts.onclone(clone); } catch (e) { /* onclone 异常不应影响截图 */ }
    const stage = clone.getElementById ? clone.getElementById('share-stage') : null;
    if (stage) {
      const kids = Array.from(stage.children);
      w.__oncloneStage = {
        position: stage.style.position,
        left: stage.style.left,
        top: stage.style.top,
        hiddenOthers: kids.length ? kids.filter(c => c.id !== card.id).every(c => c.style.display === 'none') : true
      };
    }
  }
  return Promise.resolve({
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    toBlob: cb => cb(new w.Blob(['fake-png'], { type: 'image/png' }))
  });
};

(async () => {
  console.log('\n【S1】html2canvas 可用 → 生成卡片 + 全屏预览 + 直接分享');
  {
    const { w, d } = boot({ h2c: fakeCanvas });
    await sleep(60); await fillBg(w, d); await answerAll(w, d); await sleep(150);
    ok(d.querySelector('#page-result').classList.contains('active'), '已到达结果页');

    d.querySelector('#r-shot').click();
    await sleep(120);

    const card = d.querySelector('#share-card');
    const code = d.querySelector('.r-code') ? d.querySelector('.r-code').textContent.trim() : '';
    ok(!!code && card.textContent.includes(code), '卡片含人格代码: ' + code);
    ok(!!card.querySelector('.sc-code'), '代码为独立大字区块');
    ok((card.querySelectorAll('.sc-row').length) === 4, '卡片含四维度条形图');
    ok(/^\d+%$/.test(card.querySelector('.sc-fill').style.width) ||
       card.querySelector('.sc-fill').style.width.endsWith('%'), '条形宽度以百分比设置');
    ok(!!card.querySelector('.sc-roast') && card.querySelector('.sc-roast').textContent.length > 3,
       '卡片含 AI 吐槽金句: ' + card.querySelector('.sc-roast').textContent.slice(0, 24));
    ok(/约占人口的\s*[\d.]+%/.test(card.textContent), '卡片含人群占比');
    ok(/同类型名人：/.test(card.textContent), '卡片含代表名人');
    ok(card.textContent.includes('灵魂拷问器 · AI 定制人格访谈'), '卡片含底部署名');

    /* 分享图文案：题数动态取实际总题数、副标题与首页统一、不得残留旧文案 */
    ok(!!card.querySelector('.sc-title'), '卡片含独立标题行');
    ok(/24 道题/.test(card.textContent), '卡片含动态题数「24 道题」（分享图内禁止硬编码）: '
      + (card.querySelector('.sc-title') ? card.querySelector('.sc-title').textContent : '无标题'));
    ok(/不问你想成为谁/.test(card.textContent) && /如鱼得水/.test(card.textContent),
       '卡片副标题与首页统一（含「不问你想成为谁」与「如鱼得水」）');
    ok(!/27/.test(card.textContent), '卡片不含旧题数「27」');
    ok(!/不问你是怎样的人/.test(card.textContent), '卡片不含旧副标题「不问你是怎样的人」');
    ok(card.querySelector('.sc-sub').textContent === d.querySelector('#page-home .sub').textContent.split('。')[0].trim(),
       '卡片副标题与首页 .sub 逐字一致');

    /* 【Bug4 回归】纯色图根因：#share-stage 在视口外 left:-640px，
       html2canvas 按视口坐标裁剪得到空区间只剩背景色。修复后 shotCard 必须：
       (1) 显式把裁剪框定在 (0,0)；(2) onclone 里把 stage 挪回视口并隐藏非目标卡。 */
    ok(w.__h2cOpts && w.__h2cOpts.x === 0 && w.__h2cOpts.y === 0,
       'html2canvas 显式裁剪框定在 (0,0)（避免 -640 视口外偏移 → 纯色图）');
    ok(w.__oncloneStage, '截图时执行了 onclone（把目标卡片挪回视口）');
    ok(w.__oncloneStage && w.__oncloneStage.position === 'fixed', 'onclone 将 stage 设为 position:fixed');
    ok(w.__oncloneStage && w.__oncloneStage.left === '0px', 'onclone 将 stage.left 归零为 0px（不再 -640px）');
    ok(w.__oncloneStage && w.__oncloneStage.top === '0px', 'onclone 将 stage.top 归零为 0px');
    ok(w.__oncloneStage && w.__oncloneStage.hiddenOthers, 'onclone 隐藏了非目标卡片，确保只截目标卡片（非纯色）');

    const mask = d.querySelector('#shot-mask');
    ok(mask.classList.contains('on'), '生成后打开全屏遮罩');
    ok(/长按保存/.test(d.querySelector('.shot-tip').textContent), '提示「长按保存」');
    ok(d.querySelector('#shot-img img').src.startsWith('data:image/png'), '遮罩内展示 PNG 图片');
    ok(!!d.querySelector('#shot-share'), '支持 files 分享 → 显示「直接分享」按钮');
    ok(!!d.querySelector('#shot-dl'), '显示「保存图片」按钮');

    d.querySelector('#shot-close').click(); await sleep(30);
    ok(!d.querySelector('#shot-mask').classList.contains('on'), '点关闭可收起遮罩');
  }

  console.log('\n【S2】不支持 Web Share files → 不显示「直接分享」');
  {
    const { w, d } = boot({ h2c: fakeCanvas, shareFiles: false });
    await sleep(60); await fillBg(w, d); await answerAll(w, d); await sleep(150);
    d.querySelector('#r-shot').click(); await sleep(120);
    ok(d.querySelector('#shot-mask').classList.contains('on'), '仍然生成并预览图片');
    ok(!d.querySelector('#shot-share'), '不支持时不显示「直接分享」');
    ok(!!d.querySelector('#shot-dl'), '仍可用「保存图片」');
  }

  console.log('\n【S3】html2canvas 加载失败（CDN 挂）→ 降级复制文字');
  {
    const { w, d } = boot({ h2c: null });
    await sleep(60); await fillBg(w, d); await answerAll(w, d); await sleep(150);
    // 模拟 CDN onerror
    w.__h2cFail = true;
    d.querySelector('#r-shot').click(); await sleep(150);
    ok(!d.querySelector('#shot-mask').classList.contains('on'), 'CDN 挂了不打开空遮罩');
    ok(w.__copied.length > 10, '降级为复制文字文案');
    ok(/约占人口的/.test(w.__copied), '降级文案含占比: ' + w.__copied.split('\n')[1]);
    ok(/同类型名人：/.test(w.__copied), '降级文案含名人');
    ok(/图片生成失败/.test(d.querySelector('#r-shot').textContent), '按钮提示「图片生成失败，已复制文字版」');
  }

  console.log('\n【S4】渲染过程抛错 → 同样降级，不白屏');
  {
    const { w, d } = boot({ h2c: () => () => { throw new Error('render boom'); } });
    await sleep(60); await fillBg(w, d); await answerAll(w, d); await sleep(150);
    d.querySelector('#r-shot').click(); await sleep(150);
    ok(!d.querySelector('#shot-mask').classList.contains('on'), '渲染失败不打开遮罩');
    ok(w.__copied.length > 10, '渲染异常时降级为复制文字');
    ok(/图片生成失败/.test(d.querySelector('#r-shot').textContent), '按钮给出降级提示');
    ok(d.querySelector('#r-shot').disabled === false, '按钮已恢复可点（未卡在「正在生成…」）');
  }

  console.log('\n' + '='.repeat(46));
  if (fails.length) {
    console.log(`失败 ${fails.length} 项 / 通过 ${pass} 项`);
    fails.forEach(f => console.log(' ✗ ' + f));
    process.exit(1);
  } else {
    console.log(`全部通过（${pass} 项）`);
  }
})();
