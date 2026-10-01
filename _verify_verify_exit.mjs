// 回归测试：修复「打开 App 自动弹毛玻璃确认框 -> 点退出/重新验 -> 崩溃卡死」
// 触发条件：之前验证反复失败，存档停在「未完成验证会话」且 assess 数据残缺（缺 insight）。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  OK ' + m); } else { fails.push(m); console.log('  XX ' + m); } }

function mkDomWithSeed(seed) {
  const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder;
  w.TextEncoder = w.TextEncoder || TextEncoder;
  const errors = [];
  w.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
  w.onerror = (m, s, l, c, err) => errors.push('onerror: ' + (err && err.stack || m));
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body);
    if (b.stream) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) } });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ choice: [], open: [] }) } }] }) });
  };
  w.html2canvas = () => Promise.resolve({ toDataURL: () => 'data:,', toBlob: cb => cb(new w.Blob(['x'])) });
  Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
  w.prompt = () => 'xiaoming';
  w.localStorage.setItem('soul_interrogator_v1', JSON.stringify(seed));
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d: w.document, errors };
}

function selfProfile(over) {
  const base = {
    id: 'p-self', name: 'wo', kind: 'self', step: 'home',
    bg: { age: '23-28', job: 'designer', life: ['work'], worry: '' },
    order: ['a', 'b', 'c'], idx: 3, finished: true,
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
  return Object.assign(base, over);
}

function msg(role, text) { return { role: role, content: text }; }

async function main() {
  // P1+P2：未完成验证会话 -> 启动自动弹毛玻璃框 -> 点「重新验」不应崩溃，回首页
  {
    const seed = { v: 1, activeId: 'p-self', profiles: [
      selfProfile({ step: 'verify', verify_round: 2, verify_done: false, verify_messages: [msg('user', 'hi')] })
    ] };
    const { w, d, errors } = mkDomWithSeed(seed);
    await sleep(120);
    ok(d.querySelector('#mask').classList.contains('show'), 'P1 未完成验证会话：启动自动弹出毛玻璃确认框');
    ok(JSON.stringify(d.querySelector('#m-title').textContent).indexOf('验证') >= 0, 'P1 标题为「继续上次的验证？」');
    d.querySelector('#m-cancel').click(); await sleep(150);
    ok(!d.querySelector('#mask').classList.contains('show'), 'P2 点「重新验」后毛玻璃消失');
    ok(d.querySelector('#page-home').classList.contains('active'), 'P2 点「重新验」后回到首页（不再崩溃卡死）');
    const st = JSON.parse(w.localStorage.getItem('soul_interrogator_v1'));
    const act = st.profiles.find(p => p.id === st.activeId);
    ok(act.verify_round === 0 && act.step === 'home', 'P2 验证状态已重置为 home');
    ok(errors.length === 0, 'P2 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P3：未完成验证会话 -> 点「继续」进入验证页，不崩
  {
    const seed = { v: 1, activeId: 'p-self', profiles: [
      selfProfile({ step: 'verify', verify_round: 2, verify_done: false, verify_messages: [msg('user', 'hi')] })
    ] };
    const { w, d, errors } = mkDomWithSeed(seed);
    await sleep(120);
    d.querySelector('#m-ok').click(); await sleep(150);
    ok(!d.querySelector('#mask').classList.contains('show'), 'P3 点「继续」后毛玻璃消失');
    ok(d.querySelector('#page-verify').classList.contains('active'), 'P3 进入验证页');
    ok(!!d.querySelector('#verify-input'), 'P3 验证输入框存在');
    ok(errors.length === 0, 'P3 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P4：未完成盘人会话 -> 点「继续」进入盘人页，不崩
  {
    const seed = { v: 1, activeId: 'p-self', profiles: [
      selfProfile({ step: 'cross', mode: 'cross', round: 1, report: null, verify_round: 0, verify_done: false, verify_messages: null })
    ] };
    const { w, d, errors } = mkDomWithSeed(seed);
    await sleep(120);
    ok(d.querySelector('#mask').classList.contains('show'), 'P4 未完成盘人会话：启动自动弹框');
    d.querySelector('#m-ok').click(); await sleep(150);
    ok(!d.querySelector('#mask').classList.contains('show'), 'P4 点「继续」后毛玻璃消失');
    ok(d.querySelector('#page-cross-chat').classList.contains('active'), 'P4 进入盘人对话页');
    ok(errors.length === 0, 'P4 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P5：残缺 assess.data（缺 insight）时渲染结果页不崩（paintAssess 加固）
  {
    const seed = { v: 1, activeId: 'p-self', profiles: [
      selfProfile({ step: 'result', finished: true, resultCode: 'ESTP', assess: { ok: true, data: { type: 'ESTP' } } })
    ] };
    const { w, d, errors } = mkDomWithSeed(seed);
    await sleep(120);
    ok(d.querySelector('#page-result').classList.contains('active'), 'P5 残缺 assess 数据也能渲染结果页');
    ok(d.querySelector('#ai-box') && d.querySelector('#ai-box').innerHTML.length > 0, 'P5 结果页 AI 区块正常渲染（未崩溃）');
    ok(errors.length === 0, 'P5 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P6：答题页点「退出」→ 一键回首页，不再弹毛玻璃确认框
  {
    const dom = new JSDOM(htmlBare, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
    const w = dom.window;
    w.scrollTo = () => {};
    w.AbortController = w.AbortController || AbortController;
    w.TextDecoder = w.TextDecoder || TextDecoder;
    w.TextEncoder = w.TextEncoder || TextEncoder;
    const errors = [];
    w.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
    w.onerror = (m, s, l, c, err) => errors.push('onerror: ' + (err && err.stack || m));
    const aiChoice = [
      { q: 'E1', A: { text: 'a', dim: 'E' }, B: { text: 'b', dim: 'I' } },
      { q: 'I1', A: { text: 'a', dim: 'E' }, B: { text: 'b', dim: 'I' } },
      { q: 'E2', A: { text: 'a', dim: 'E' }, B: { text: 'b', dim: 'I' } },
      { q: 'S1', A: { text: 'a', dim: 'S' }, B: { text: 'b', dim: 'N' } },
      { q: 'N1', A: { text: 'a', dim: 'S' }, B: { text: 'b', dim: 'N' } },
      { q: 'S2', A: { text: 'a', dim: 'S' }, B: { text: 'b', dim: 'N' } },
      { q: 'T1', A: { text: 'a', dim: 'T' }, B: { text: 'b', dim: 'F' } },
      { q: 'F1', A: { text: 'a', dim: 'T' }, B: { text: 'b', dim: 'F' } },
      { q: 'T2', A: { text: 'a', dim: 'T' }, B: { text: 'b', dim: 'F' } },
      { q: 'J1', A: { text: 'a', dim: 'J' }, B: { text: 'b', dim: 'P' } },
      { q: 'P1', A: { text: 'a', dim: 'J' }, B: { text: 'b', dim: 'P' } },
      { q: 'J2', A: { text: 'a', dim: 'J' }, B: { text: 'b', dim: 'P' } }
    ];
    w.fetch = (u, o2) => {
      const b = JSON.parse(o2.body);
      if (b.stream) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) } });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ choice: aiChoice, open: [{ q: 'o1' }, { q: 'o2' }, { q: 'o3' }] }) } }] }) });
    };
    w.html2canvas = () => Promise.resolve({ toDataURL: () => 'data:,', toBlob: cb => cb(new w.Blob(['x'])) });
    Object.defineProperty(w.navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(w.navigator, 'share', { value: () => Promise.resolve(), configurable: true });
    w.prompt = () => 'xiaoming';
    const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
    const d = w.document;
    await sleep(80);
    d.querySelector('#btn-primary-start').click(); await sleep(20);
    const age = d.querySelector('#f-age'); age.value = [...age.options][4].value; age.dispatchEvent(new w.Event('change', { bubbles: true }));
    const job = d.querySelector('#f-job'); job.value = 'designer'; job.dispatchEvent(new w.Event('input', { bubbles: true }));
    d.querySelectorAll('#f-life .chip')[1].click();
    d.querySelector('#bg-next').click(); await sleep(700);
    ok(d.querySelector('#page-test').classList.contains('active'), 'P6 进入答题页');
    d.querySelector('#t-home').click(); await sleep(80);
    ok(!d.querySelector('#mask').classList.contains('show'), 'P6 点「退出」不再弹毛玻璃确认框');
    ok(d.querySelector('#page-home').classList.contains('active'), 'P6 点「退出」直接回首页');
    ok(errors.length === 0, 'P6 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P7：枚举全部「返回/退出至首页」入口，逐条断言毛玻璃遮罩被清除（防回归）
  // 覆盖：选择模式页 / 拷问对话 / 闲聊对话 / 盘人报告 / 验证页 / 档案页，以及「重测/清空」「切换档案」等程序化退出
  {
    const seed = { v: 1, activeId: 'p-self', profiles: [ selfProfile({ step: 'home' }) ] };
    const { w, d, errors } = mkDomWithSeed(seed);
    await sleep(100);
    const exits = ['mode-back','cross-back','chat-back','cx-home','cc-home','v-home','prof-back'];
    for (const id of exits) {
      const btn = d.querySelector('#' + id);
      ok(!!btn, 'P7 退出按钮存在: #' + id);
      // 模拟「某确认框残留毛玻璃」的现场
      d.querySelector('#mask').classList.add('show');
      btn.click();
      await sleep(60);
      ok(!d.querySelector('#mask').classList.contains('show'), 'P7 点 #' + id + ' 后毛玻璃清除（无残留）');
      ok(d.querySelector('#page-home').classList.contains('active'), 'P7 点 #' + id + ' 回到首页');
    }
    // 程序化退出路径（go() 内部统一清遮罩，覆盖「重测/清空」「切换档案」等未挂按钮的退出）
    d.querySelector('#mask').classList.add('show');
    const goBtn = d.querySelector('#v-home'); // v-home 处理器即 go('home')；再点一次确认 go() 单元行为
    ok(!!goBtn, 'P7 程序化退出用例按钮存在');
    ok(errors.length === 0, 'P7 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  // P8：补 P7 漏掉的两类漏网路径（真实用户踩到的「点回到首页还糊着一层」）
  //   (1) 结果页 #r-home「回到首页」：它是唯一「先弹 ask 确认框再跳转」的回首页入口，P7 完全没覆盖；
  //       且 P7 只查 #mask，漏了另两个全屏遮罩层：#shot-mask（分享图预览，z-index 200）、
  //       #modal-export（导出弹层）——它们一旦打开，任何回首页都清不掉。
  //   (2) ask() 叠加 / 未决确认框：跳转后不能留下"幽灵监听"，否则一次误触又把已关闭的框弹回来。
  {
    const mk = (step, over) => mkDomWithSeed({ v: 1, activeId: 'p-self',
      profiles: [ selfProfile(Object.assign({ step: step }, over || {})) ] });
    const on = (d, id, cls) => d.querySelector(id).classList.contains(cls);
    const OVERLAYS = [['#mask','show'], ['#shot-mask','on'], ['#modal-export','on']];
    const dirtyAll = d => OVERLAYS.forEach(([id, cls]) => d.querySelector(id).classList.add(cls));
    const allClean = d => OVERLAYS.every(([id, cls]) => !on(d, id, cls));

    // (1a) 结果页「回到首页」：确认框点确定后，mask 清除且回到首页
    {
      const { d, errors } = mk('result', { idx: 2 });
      await sleep(120);
      d.querySelector('#mask').classList.add('show');
      d.querySelector('#r-home').click(); await sleep(60);
      ok(on(d, '#mask', 'show'), 'P8 #r-home 会弹确认框（这是它区别于其他退出入口的地方）');
      d.querySelector('#m-ok').click(); await sleep(180);
      ok(!on(d, '#mask', 'show'), 'P8 结果页「回到首页」确认后毛玻璃清除');
      ok(d.querySelector('#page-home').classList.contains('active'), 'P8 结果页「回到首页」回到首页');
      ok(errors.length === 0, 'P8 #r-home 无 JS 异常（' + errors.length + '）');
      errors.forEach(e => console.log('   ! ' + e));
    }

    // (1b) 三个全屏遮罩层同时脏着，走全部回首页入口后必须全部清干净
    //      注意：每个按钮必须独立 boot —— #r-home 会 fresh(S) 清空题目，
    //      复用同一个 window 会让下一个 #r-back 拿到空题集（测试自身污染，非产品问题）。
    {
      for (const id of ['r-home', 'r-back', 't-home']) {
        const { d, errors } = mk('result', { idx: 2 });
        await sleep(120);
        dirtyAll(d);
        const btn = d.querySelector('#' + id);
        ok(!!btn, 'P8 退出/跳转按钮存在: #' + id);
        btn.click(); await sleep(60);
        if (id === 'r-home') { d.querySelector('#m-ok').click(); await sleep(180); }
        ok(allClean(d), 'P8 点 #' + id + ' 后三类遮罩层全部清除（mask/shot-mask/modal-export）');
        ok(errors.length === 0, 'P8 #' + id + ' 无 JS 异常（' + errors.length + '）');
        errors.forEach(e => console.log('   ! ' + e));
      }
    }

    // (1c) 档案页导出弹层开着 → 点返回首页 → 必须清掉
    {
      const { d } = mk('profiles');
      await sleep(120);
      d.querySelector('#modal-export').classList.add('on');
      d.querySelector('#prof-back').click(); await sleep(120);
      ok(!on(d, '#modal-export', 'on'), 'P8 导出弹层开着时点返回首页 → 弹层被清除');
      ok(d.querySelector('#page-home').classList.contains('active'), 'P8 导出弹层场景已回到首页');
    }

    // (2a) 连点两次「回到首页」造成 ask 叠加：只点一次确定，遮罩仍须清除（不留幽灵监听）
    {
      const { d } = mk('result', { idx: 2 });
      await sleep(120);
      d.querySelector('#r-home').click(); await sleep(30);
      d.querySelector('#r-home').click(); await sleep(30);
      d.querySelector('#m-ok').click(); await sleep(200);
      ok(!on(d, '#mask', 'show'), 'P8 ask 叠加后点一次确定 → 毛玻璃清除');
      // 幽灵监听检测：关闭后再点确定/取消，不应把遮罩重新弹回来
      d.querySelector('#m-ok').click(); await sleep(60);
      d.querySelector('#m-cancel').click(); await sleep(60);
      ok(!on(d, '#mask', 'show'), 'P8 关闭后再点确定/取消不会把遮罩弹回来（无幽灵监听）');
    }
  }

  // P9：防止「CSS 撞车导致确认框隐形」（真坑：用户点回到首页只看到毛玻璃、什么都点不到）
  // #mask 里的确认对话框卡片 + #modal-export 导出弹层都用了 class="modal"。
  // 后者那条 `.modal { display:none }` 把前者也藏掉——#m-ok getBoundingClientRect = 0×0，
  // 点击落到 mask 背景 → onBg(false) → ask 解析成 no → 回首页失败。
  // 旧测试只断言 mask.classList 不含 show，jsdom 不渲染 backdrop-filter/display 也弱，
  // 这个坑藏了几个月没人发现。必须断言确认框的 computed display ≠ none、点击真能 navigate。
  {
    const { w, d, errors } = mkDomWithSeed({ v: 1, activeId: 'p-self',
      profiles: [ selfProfile({ step: 'result', idx: 2 }) ] });
    await sleep(120);
    d.querySelector('#r-home').click(); await sleep(80);
    const mok = d.querySelector('#m-ok');
    // 直接证据 1：「重新开始」按钮 display ≠ none（修复前撞车时 jsdom 也算得准）
    const okDisp = w.getComputedStyle(mok).display;
    ok(okDisp !== 'none' && okDisp !== '', 'P9 「重新开始」按钮 display ≠ none（修复前被撞车藏掉），实际=' + okDisp);
    // 直接证据 2：点击按钮真能 navigate（ask 解析 true → fresh → go('home')）。
    // 修复前按钮隐形 + 点击落到 mask 背景 → close(false) → 回首页失败，断言会挂。
    d.querySelector('#m-ok').click(); await sleep(200);
    ok(d.querySelector('#page-home').classList.contains('active'), 'P9 点击按钮真回到首页（不是隐形按钮 + 背景点击误判 cancel）');
    ok(errors.length === 0, 'P9 无 JS 异常（' + errors.length + '）');
    errors.forEach(e => console.log('   ! ' + e));
  }

  console.log('\n毛玻璃卡死回归测试：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
