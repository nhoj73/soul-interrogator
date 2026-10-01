/* 维度接近度测试：精确控制作答，制造差距≤1 的维度 */
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';
const html = fs.readFileSync('soul-interrogator.html', 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }

const dims = ['EI','SN','TF','JP'], poles = { EI:['E','I'], SN:['S','N'], TF:['T','F'], JP:['J','P'] };
/* 与当前混血结构一致：AI 只出 9 道（EI:3 / SN:2 / TF:2 / JP:2），
   这样每个维度实际题数 = 3 锚点 + 2~3 情境 ≥ 5，避免因题数过少误判「接近均衡」。 */
function makeAI(){
  const perDim = { EI:3, SN:2, TF:2, JP:2 }, choice = []; let k = 0;
  dims.forEach(dim => { for (let i=0;i<perDim[dim]; i++) choice.push({
    q:`[${dim}] 定制情境${i+1}`, A:{text:`定制A${k}`, dim:poles[dim][0]}, B:{text:`定制B${k}`, dim:poles[dim][1]} }); k++; });
  return JSON.stringify({ choice, open:[{q:'昨天你做了什么'},{q:'上周花了三小时干什么'},{q:'最近一次争执说了什么'}] });
}

function boot(){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = (u,o) => { const b = JSON.parse(o.body);
    if (b.stream) return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({}), body:{ getReader:()=>({read:()=>Promise.resolve({done:true})}) } });
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({choices:[{message:{content:makeAI()}}]}) }); };
  const s = w.document.createElement('script'); s.textContent = jsCode; w.document.body.appendChild(s);
  return { w, d:w.document };
}

async function fillBg(w,d){
  d.querySelector('#btn-primary-start').click(); await sleep(30);
  const age = d.querySelector('#f-age'); age.value = [...age.options][4].value;
  age.dispatchEvent(new w.Event('change',{bubbles:true}));
  const j = d.querySelector('#f-job'); j.value='产品经理';
  j.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelectorAll('#f-life .chip')[1].click();
  d.querySelector('#bg-next').click(); await sleep(150);
}

/* 对 targetDim 制造 3:3（gap=0）；其余维度全选 A（6:0） */
async function answerBalanced(w, d, targetDim){
  const st0 = AP(w);
  const byId = {}; st0.qset.choice.forEach(q => byId[q.id] = q);
  const DIM_A = { EI:'E', SN:'S', TF:'T', JP:'J' };
  const tally = { a:0, b:0 };
  let guard = 0;
  while (d.querySelector('#page-test').classList.contains('active') && guard++ < 40) {
    if (d.querySelector('#op-i')) {
      const ta = d.querySelector('#op-i'); ta.value='简答回答';
      ta.dispatchEvent(new w.Event('input',{bubbles:true}));
      d.querySelector('#op-ok').click(); await sleep(20); continue;
    }
    const st = AP(w);
    const q = byId[st.order[st.idx]];
    let pick = 0;
    if (q && q.dim === targetDim) {
      const A_is_a = (q.A.pole === DIM_A[targetDim]);
      if (A_is_a) { pick = tally.a < 3 ? 0 : 1; pick === 0 ? tally.a++ : tally.b++; }
      else        { pick = tally.b < 3 ? 0 : 1; pick === 0 ? tally.b++ : tally.a++; }
    }
    d.querySelectorAll('#t-card .opt')[pick].click();
    await sleep(260);
  }
  return tally;
}

(async () => {
  console.log('\n【C1】制造 EI 维度 3:3（平票）→ 应标注「平票 · 规则默认」并显示比分');
  {
    const { w, d } = boot();
    await sleep(60); await fillBg(w, d);
    const t = await answerBalanced(w, d, 'EI');
    await sleep(200);
    console.log('    实际比分 E:I = ' + t.a + ':' + t.b);
    ok(t.a === 3 && t.b === 3, '已构造出 3:3 的平票维度');
    ok(d.querySelector('#page-result').classList.contains('active'), '进入结果页');

    const bars = d.querySelector('#r-bars').textContent;
    ok(/平票 · 规则默认/.test(bars), '平票维度标注「平票 · 规则默认」');
    ok(/3:3/.test(bars), '标注含具体比分 3:3');
    ok(!/仅一题之差/.test(bars), '纯平票不误标「仅一题之差」');
    ok(!/参考价值有限/.test(bars), '已删除「参考价值有限」字样');
    ok(!/倾向保守判定/.test(bars), '已删除「倾向保守判定」字样');
    ok((bars.match(/平票 · 规则默认/g) || []).length === 1, '仅平票维度被标记');
    // 纯平票走「规则默认」标注，不再单独弹「仅一题之差」黄条（那是 gap=1 的专属提示）
    ok(d.querySelectorAll('.bar-warn').length === 0, '纯平票不出现「仅一题之差」黄条');
  }

  console.log('\n【C2】全部维度悬殊（6:0）→ 不出现任何提示');
  {
    const { w, d } = boot();
    await sleep(60); await fillBg(w, d);
    // 全选 A
    let guard = 0;
    while (d.querySelector('#page-test').classList.contains('active') && guard++ < 40) {
      if (d.querySelector('#op-i')) { const ta=d.querySelector('#op-i'); ta.value='x';
        ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await sleep(20); continue; }
      d.querySelectorAll('#t-card .opt')[0].click(); await sleep(260);
    }
    await sleep(200);
    const warns = d.querySelectorAll('.bar-warn').length;
    ok(warns === 0, '悬殊维度不显示接近均衡提示（实际 ' + warns + ' 条）');
  }

  console.log('\n' + '='.repeat(46));
  if (fails.length) { console.log(`失败 ${fails.length} / 通过 ${pass}`); fails.forEach(f=>console.log(' ✗ '+f)); process.exit(1); }
  else console.log(`全部通过（${pass} 项）`);
})();
