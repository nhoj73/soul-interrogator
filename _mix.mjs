/* 混血出题结构专项测试：锚点题 / 题量 / 交错 / 平票规则 */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }

const POLES = { EI: ['E', 'I'], SN: ['S', 'N'], TF: ['T', 'F'], JP: ['J', 'P'] };
const DIM_A = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };

/* AI 返回 9 道：EI 3、SN 2、TF 2、JP 2（让 EI 总题数 3+3=6 为偶数，可构造平票） */
function makeAI9() {
  const perDim = { EI: 3, SN: 2, TF: 2, JP: 2 };
  const choice = []; let k = 0;
  Object.keys(perDim).forEach(dim => {
    for (let i = 0; i < perDim[dim]; i++) {
      choice.push({
        q: `[${dim}] 定制情境 ${i + 1}`,
        A: { text: `定制A${k}`, dim: POLES[dim][0] },
        B: { text: `定制B${k}`, dim: POLES[dim][1] }
      });
      k++;
    }
  });
  return JSON.stringify({
    choice,
    open: [
      { q: '过去一个月，你有几次在深夜还在处理工作消息？' },
      { q: '最近两周，哪一件事让你反复回想？' },
      { q: '上个月你花时间最多的三个小时，在做什么？' }
    ]
  });
}

function boot({ gen } = {}) {
  const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u, o) => {
    const b = JSON.parse(o.body);
    if (b.stream) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) } });
    return gen ? gen(b) : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: makeAI9() } }] }) });
  };
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d: w.document };
}

async function fillBg(w, d, { job = '产品经理' } = {}) {
  d.querySelector('#btn-primary-start').click(); await sleep(30);
  const age = d.querySelector('#f-age'); age.value = [...age.options][4].value;
  age.dispatchEvent(new w.Event('change', { bubbles: true }));
  const j = d.querySelector('#f-job'); j.value = job;
  j.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelectorAll('#f-life .chip')[1].click();
  d.querySelector('#bg-next').click(); await sleep(200);
}

/* 作答：对 EI 维度构造 3:3 平票，其余维度全选 A */
async function answerTieEI(w, d) {
  const st0 = AP(w);
  const byId = {}; st0.qset.choice.forEach(q => byId[q.id] = q);
  const tally = { a: 0, b: 0 };
  let guard = 0;
  while (d.querySelector('#page-test').classList.contains('active') && guard++ < 45) {
    if (d.querySelector('#op-i')) {
      const ta = d.querySelector('#op-i'); ta.value = '简答回答';
      ta.dispatchEvent(new w.Event('input', { bubbles: true }));
      d.querySelector('#op-ok').click(); await sleep(20); continue;
    }
    const st = AP(w);
    const q = byId[st.order[st.idx]];
    let pick = 0;
    if (q && q.dim === 'EI') {
      const A_is_E = (q.A.pole === 'E');
      if (A_is_E) { pick = tally.a < 3 ? 0 : 1; pick === 0 ? tally.a++ : tally.b++; }
      else { pick = tally.b < 3 ? 0 : 1; pick === 0 ? tally.b++ : tally.a++; }
    }
    d.querySelectorAll('#t-card .opt')[pick].click();
    await sleep(260);
  }
  return tally;
}

(async () => {
  console.log('\n【M1】锚点题库：12 道、每维度 3 道、pole 标注正确');
  {
    const { w, d } = boot();
    await sleep(60); await fillBg(w, d); await sleep(200);
    const st = AP(w);
    const anchors = st.qset.choice.filter(q => q.anchor);
    ok(anchors.length === 12, '锚点题 12 道，实际 ' + anchors.length);
    const cnt = {};
    anchors.forEach(q => cnt[q.dim] = (cnt[q.dim] || 0) + 1);
    ok(cnt.EI === 3 && cnt.SN === 3 && cnt.TF === 3 && cnt.JP === 3,
      '每维度 3 道: ' + JSON.stringify(cnt));
    // J1 是反的：A=P / B=J
    const j1 = anchors.find(q => q.id === 'J1');
    ok(j1 && j1.A.pole === 'P' && j1.B.pole === 'J',
      'J1 的 pole 反向标注正确（A=P, B=J）: ' + (j1 ? j1.A.pole + '/' + j1.B.pole : '未找到'));
    const j2 = anchors.find(q => q.id === 'J2');
    ok(j2 && j2.A.pole === 'J' && j2.B.pole === 'P', 'J2 正常标注（A=J, B=P）');
    ok(anchors.every(q => q.t && q.A.text && q.B.text), '锚点题文本完整');
  }

  console.log('\n【M2】题量与交错：21 选择 + 3 简答 = 24');
  {
    const { w, d } = boot();
    await sleep(60); await fillBg(w, d); await sleep(200);
    const st = AP(w);
    ok(st.qset.choice.length === 21, '选择题 21 道（12 锚点 + 9 情境），实际 ' + st.qset.choice.length);
    ok(st.qset.open.length === 3, '简答题 3 道');
    ok(st.qset.anchorCount === 12, 'anchorCount = 12');
    ok(st.qset.aiCount === 9, 'AI 出题 9 道，实际 ' + st.qset.aiCount);
    ok(st.qset.bankCount === 0, '无需通用题补足');
    ok(st.order.length === 24, '总题序 24 道，实际 ' + st.order.length);

    // 交错检查：同源题不应连续超过 3 道
    const anchorSet = new Set(st.qset.choice.filter(q => q.anchor).map(q => q.id));
    let run = 1, maxRun = 1;
    for (let i = 1; i < st.order.length; i++) {
      const prevIsA = anchorSet.has(st.order[i - 1]);
      const curIsA = anchorSet.has(st.order[i]);
      if (st.order[i].startsWith('o')) { run = 1; continue; }
      if (prevIsA === curIsA) { run++; maxRun = Math.max(maxRun, run); } else run = 1;
    }
    ok(maxRun <= 3, '锚点/情境题交错排列，同源最长连续 ' + maxRun + ' 道（≤3）');
    ok(d.querySelector('#t-num').textContent === '1/24', '进度显示 1/24，实际 ' + d.querySelector('#t-num').textContent);
  }

  console.log('\n【M3】平票规则：五五开倒向 I/N/F/P');
  {
    const { w, d } = boot();
    await sleep(60); await fillBg(w, d);
    const t = await answerTieEI(w, d);
    await sleep(300);
    console.log('    EI 实际比分 E:I = ' + t.a + ':' + t.b);
    ok(t.a === 3 && t.b === 3, '已构造 EI 维度 3:3 平票');

    const code = d.querySelector('.r-code').textContent.trim();
    ok(code.length === 4, '得到四字母代码: ' + code);
    ok(code[0] === 'I', 'EI 平票 → 判定为 I（保守极），实际第 1 位 = ' + code[0]);
    ok(code === 'ISTJ', '其余维度全选 A → 期望 ISTJ，实际 ' + code);

    const bars = d.querySelector('#r-bars').textContent;
    ok(/平票 · 规则默认/.test(bars), '结果页注明「平票 · 规则默认」');
    ok(/3:3/.test(bars), '标注含具体比分 3:3');
    // 关键：数值标签不能与判定的字母矛盾（条形内部两侧各显示 50% 是正常的）
    const valEl = d.querySelectorAll('#r-bars .bar-row')[0].querySelector('.val');
    ok(/内向/.test(valEl.textContent) && !/外向/.test(valEl.textContent),
      'EI 数值标签显示「内向」而非「外向」: ' + valEl.textContent);
    ok(/内向\s*50%/.test(bars), '结果页出现「内向 50%」');
  }

  console.log('\n【M4】降级：AI 失败 → 12 锚点 + 通用补足，标注来源');
  {
    const { w, d } = boot({ gen: () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('boom') }) });
    await sleep(60); await fillBg(w, d); await sleep(600);
    const st = AP(w);
    ok(st.qsrc === 'bank', '降级为通用题路径');
    ok(st.qset.choice.length === 21, '降级后仍是 21 道选择，实际 ' + st.qset.choice.length);
    const anchors = st.qset.choice.filter(q => q.anchor).length;
    ok(anchors === 12, '降级后仍含 12 道锚点题，实际 ' + anchors);
    ok(st.qset.aiCount === 0 && st.qset.bankCount === 9, '9 道由通用题库补足');
    const banner = d.querySelector('#t-banner').textContent;
    ok(/锚点题/.test(banner), '顶部标注使用锚点题: ' + banner.trim().slice(0, 60));
    ok(/降级/.test(banner), '标注已降级');
  }

  console.log('\n【M5】文案与题量表述');
  {
    const { w, d } = boot();
    await sleep(60);
    const sub = d.querySelector('.sub').textContent;
    ok(/不问你想成为谁/.test(sub), '副标题已更新');
    ok(/什么让你内耗/.test(sub) && /如鱼得水/.test(sub), '副标题含内耗/如鱼得水');
    ok(/24 道题/.test(sub), '题数表述为 24 道，实际: ' + sub.replace(/\s+/g, ' ').trim());
    /* 改查「渲染后文本」而非原始 HTML：题量改由 data-qc 占位注入，
       这样任何一处漏改都会被抓到（自检项 2 的防漏网）。 */
    ok(/12 锚点 \+ 9 定制题/.test(d.querySelector('.chips').textContent),
       '首页 chips 体现混血结构: ' + d.querySelector('.chips').textContent.replace(/\s+/g, ' ').trim());
    ok(/^1\/24$/.test(d.querySelector('#t-num').textContent.trim()),
       '测试页进度分母由常量同步为 1/24，实际 ' + d.querySelector('#t-num').textContent.trim());
    ok(/共 24 题/.test(d.querySelector('#about-box').textContent),
       '说明区题量由常量同步（共 24 题）');
    ok(/9 道情境题 \+ 3 道简答题/.test(d.querySelector('#ls-2').textContent),
       '加载页题量由常量同步: ' + d.querySelector('#ls-2').textContent.trim());
    ok(/24 道灵魂拷问/.test(d.querySelector('meta[name="description"]').getAttribute('content')),
       'meta 描述由常量同步');
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
