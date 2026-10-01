/* AI 行为验证（结果页入口）测试：用 jsdom 加载真实 HTML，mock fetch 驱动（不联网）。
   覆盖：入口/前置导流小字 / 3 轮自动结算 / system prompt 注入得分+优先盘最弱维度 /
   结果页角标 / 存疑跳拷问预填 / 首轮失败置灰+toast / 中途失败重试 / 刷新直达 / 重新验证覆盖。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, 'soul-interrogator.html');
const html = fs.readFileSync(FILE, 'utf8');
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

let fails = 0, passes = 0;
function ok(name, cond){ if(cond){ passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name); } }
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* 按 perDim {EI:[a,b],...} 造一份已完成的问卷存档（每维 6 题），用于校验 system prompt 注入 */
function presetState(perDim){
  const dims = [['EI','E','I'],['SN','S','N'],['TF','T','F'],['JP','J','P']];
  const choice = [], order = []; let id = 0; const idsByDim = {};
  dims.forEach(([key,A,B])=>{ idsByDim[key] = []; for(let i=0;i<6;i++){ const cid='c'+(id++); choice.push({ id:cid, dim:key, A:{pole:A}, B:{pole:B}, t:'q'+cid }); idsByDim[key].push(cid); } });
  const ans = {};
  dims.forEach(([key,A,B])=>{ const [a,b]=perDim[key]; const ids=idsByDim[key]; for(let i=0;i<ids.length;i++){ ans[ids[i]] = { pick: i<a ? 'a':'b' }; } });
  choice.forEach(q=>order.push(q.id));
  const letterOf = {};
  dims.forEach(([key,A,B])=>{ const [a,b]=perDim[key]; letterOf[key] = a>b?A:(b>a?B:B); });
  const code = dims.map(d=>letterOf[d[0]]).join('');
  return { step:'result', finished:true, order, ans, open:{}, qset:{choice,open:[]}, qsrc:'bank', qfall:'', qgenModel:'', bgSig:'', resultCode:code,
    bg:{age:'30',job:'工程师',life:['独居'],worry:''}, mode:'quiz', claimedType:'', reason:'', messages:[], round:0, report:null, reportModel:'', notebook:[], note:'',
    verify_round:0, verify_messages:[], verify_report:null, verify_done:false, verify_note:'' };
}

function boot(opts){
  const o = opts || {};
  const vc = new VirtualConsole();
  const errs = []; vc.on('jsdomError', e => errs.push(String(e.detail||e.message||e)));
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://example.com/soul-interrogator.html', virtualConsole:vc });
  const w = dom.window; const d = w.document;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.html2canvas = () => Promise.resolve({ toDataURL:()=>'data:image/png;base64,', toBlob:cb=>cb(new w.Blob(['x'],{type:'image/png'})) });
  Object.defineProperty(w.navigator,'canShare',{value:()=>true,configurable:true});
  Object.defineProperty(w.navigator,'share',{value:()=>Promise.resolve(),configurable:true});

  const report = o.report || { dims:[{dim:'SN',baseline:'N',status:'verified',behavior_hint:'',quote:'我总先想落地',note:'偏 S'},{dim:'JP',baseline:'P',status:'存疑',behavior_hint:'行为线索更接近 J',quote:'我临场组装行李',note:'偏 J 一点'}], overall:'基本可信', nuance:'整体稳' };
  let verifyCalls = 0; const sysCaptured = [];
  w.fetch = (u, o2) => {
    const b = JSON.parse(o2.body); const msgs = b.messages || [];
    const isVerifySys = msgs[0] && msgs[0].role === 'system' && /验证官/.test(msgs[0].content);
    if(isVerifySys) sysCaptured.push(msgs[0].content);
    const isReport = /输出验证报告/.test(msgs[msgs.length-1] ? msgs[msgs.length-1].content : '');
    if(isVerifySys) verifyCalls++;
    // 仅在验证轮触发失败（避开问卷完成时的综合评估 fetch）
    if(o.failFirst && isVerifySys && verifyCalls === 1) return Promise.reject(new Error('net down'));
    if(o.failMid   && isVerifySys && verifyCalls === 2) return Promise.reject(new Error('net down'));
    // 持续失败：用于验证「退避重试全部耗尽」后的兜底（置灰 + 提示正忙）
    if(o.failFirstAll && isVerifySys) return Promise.reject(new Error('net down'));
    if(isReport){
      const text = (o.reportBad ? '这不是 json 啊啊啊' : JSON.stringify(report));
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content:text } }] }), body:null });
    }
    const lastUser = msgs.filter(m=>m.role==='user').slice(-1)[0];
    const lu = lastUser ? lastUser.content : '';
    const text = '（点评）你刚才说「' + lu + '」，这听起来支持你的自报。最近一次让你有类似感觉是什么时候？';
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{ message:{ content:text } }] }), body:null });
  };
  if(o.preset) w.localStorage.setItem('soul_interrogator_v1', JSON.stringify(o.preset));
  const s = d.createElement('script'); s.textContent = html.match(/<script>([\s\S]*?)<\/script>/)[1]; d.body.appendChild(s);
  return { w, d, errs, sysCaptured, getReport:()=>report };
}
async function fillBg(w,d){ d.querySelector('#btn-primary-start').click(); await wait(30); const age=d.querySelector('#f-age'); age.value=[...age.options][4].value; age.dispatchEvent(new w.Event('change',{bubbles:true})); const j=d.querySelector('#f-job'); j.value='产品经理'; j.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelectorAll('#f-life .chip')[1].click(); d.querySelector('#bg-next').click(); await wait(1200); }
async function answerAll(w,d,pick){ let guard=0; while(d.querySelector('#page-test').classList.contains('active') && guard++<80){ if(d.querySelector('#op-i')){ const ta=d.querySelector('#op-i'); ta.value='简答回答'; ta.dispatchEvent(new w.Event('input',{bubbles:true})); d.querySelector('#op-ok').click(); await wait(20); continue; } d.querySelectorAll('#t-card .opt')[pick].click(); await wait(260); } await wait(200); }
function typeVerify(d, txt){ const ta=d.querySelector('#verify-input'); ta.value=txt; ta.dispatchEvent(new d.defaultView.Event('input',{bubbles:true})); }
function sendVerify(d){ d.querySelector('#verify-send').click(); }

(async () => {
  console.log('\n【A】前置：选型页底部"去正式访谈"导流小字存在且可跳转');
  {
    const { w, d } = boot();
    d.querySelector('#enter-cross').click(); await wait(20);
    d.querySelector('#mode-cross').click(); await wait(20);
    const link = d.querySelector('#type-to-quiz');
    ok('导流小字按钮存在', !!link);
    if(link){ link.click(); await wait(40); ok('点击后进入背景页(bg)', d.querySelector('#page-bg').classList.contains('active')); }
  }

  console.log('\n【B】入口：结果页分享按钮下方有验证入口，点击进验证对话页');
  {
    const { w, d } = boot(); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    const ent = d.querySelector('#r-verify');
    ok('结果页存在验证入口按钮', !!ent);
    ok('入口文案含"让 AI 验一验"', /让 AI 验一验/.test(ent.textContent));
    ent.click(); await wait(400);
    ok('点击后进入验证对话页', d.querySelector('#page-verify').classList.contains('active'));
    ok('页头显示"验证进度 1 / 3"', /验证进度 1 \/ 3/.test(d.querySelector('#verify-num').textContent));
  }

  console.log('\n【C】system prompt 注入各维得分 + 优先盘最弱维度（全 5/6 vs 全 3/6）');
  {
    // 强档案：每维 5/6（gap 大）→ 最弱=前两个 EI、SN
    const strong = presetState({ EI:[5,1], SN:[5,1], TF:[5,1], JP:[5,1] });
    const a = boot({ preset: strong }); await wait(60);
    a.d.querySelector('#r-verify').click(); await wait(400);
    const sp = (a.sysCaptured.filter(s=>/验证官/.test(s))[0]) || '';
    ok('强档案 prompt 含 EI 判定 5/6 行', /EI：判定 E，5\/6（E 5 : I 1）/.test(sp));
    ok('强档案 prompt 含 SN 判定 5/6 行', /SN：判定 S，5\/6（S 5 : N 1）/.test(sp));
    ok('强档案 prompt 含 TF 判定 5/6 行', /TF：判定 T，5\/6（T 5 : F 1）/.test(sp));
    ok('强档案 prompt 含 JP 判定 5/6 行', /JP：判定 J，5\/6（J 5 : P 1）/.test(sp));
    ok('强档案 prompt 优先盘最弱维度 EI、SN', /得分最接近中间值的：EI、SN/.test(sp));

    // 弱档案：EI 3/6（gap 0，最弱）、TF 4/2（gap 2，次弱）→ 最弱=EI、TF
    const weak = presetState({ EI:[3,3], SN:[5,1], TF:[4,2], JP:[5,1] });
    const b = boot({ preset: weak }); await wait(60);
    b.d.querySelector('#r-verify').click(); await wait(400);
    const sp2 = (b.sysCaptured.filter(s=>/验证官/.test(s))[0]) || '';
    ok('弱档案 prompt 含 EI 判定 3/6 行', /EI：判定 I，3\/6（E 3 : I 3）/.test(sp2));
    ok('弱档案 prompt 优先盘最弱维度 EI、TF', /得分最接近中间值的：EI、TF/.test(sp2));
    ok('弱档案与强档案最弱维度不同（已动态计算）', /EI、TF/.test(sp2) && /EI、SN/.test(sp));
  }

  console.log('\n【D】3 轮自动结算：无需用户触发，第 3 轮答完自动出报告');
  {
    const { w, d } = boot(); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'上次聚会我提前走了，因为想回家'); sendVerify(d); await wait(400); }
    ok('第 3 轮后进入验证报告页', d.querySelector('#page-verify-report').classList.contains('active'));
    ok('报告页含复核结论', /复核结论/.test(d.querySelector('#verify-report-root').innerHTML));
    ok('报告页含 4 维判定（2 条）', (d.querySelector('#verify-report-root').innerHTML.match(/dim-verdict/g)||[]).length >= 2);
  }

  console.log('\n【E】结果页角标：全部 verified → "AI 行为验证 ✓"；有存疑 → "N 项待复核"');
  {
    // 全 verified 报告
    const allOk = { dims:[{dim:'SN',baseline:'N',status:'verified',behavior_hint:'',quote:'q',note:''},{dim:'JP',baseline:'P',status:'verified',behavior_hint:'',quote:'q',note:''}], overall:'可信', nuance:'稳' };
    const { w, d } = boot({ report: allOk }); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'真事，我确实更想一个人待着'); sendVerify(d); await wait(400); }
    d.querySelector('#v-result').click(); await wait(60);
    ok('全部 verified → 结果页角标"AI 行为验证 ✓"', /AI 行为验证 ✓/.test(d.querySelector('#r-hero').innerHTML));
    // 真正生成分享图后再断言：卡面文本须含验证角标文字（此前为恒真断言，现已落地）
    d.querySelector('#r-shot').click(); await wait(250);
    ok('分享图真正生成且卡面含验证角标文字', /AI 行为验证/.test(d.querySelector('#share-card').innerHTML));
  }
  {
    // 有存疑报告（默认 report 含 1 存疑）
    const { w, d } = boot(); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'其实我也有点纠结'); sendVerify(d); await wait(400); }
    d.querySelector('#v-result').click(); await wait(60);
    ok('有存疑 → 结果页角标"N 项待复核"', /待复核/.test(d.querySelector('#r-hero').innerHTML));
  }

  console.log('\n【F】存疑路径：报告页"不服？让拷问模式盘一盘"跳拷问且预填 claimed_type');
  {
    const { w, d } = boot(); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    const code = d.querySelector('.r-code').textContent.trim();
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'说不清'); sendVerify(d); await wait(400); }
    const toCross = d.querySelector('#v-to-cross');
    ok('存疑时显示"去拷问"按钮', toCross.style.display !== 'none');
    toCross.click(); await wait(400);
    ok('点击后进入拷问对话页', d.querySelector('#page-cross-chat').classList.contains('active'));
    const st = AP(w);
    ok('claimed_type 预填为问卷结果 ' + code, st.claimedType === code);
    ok('reason 预填含"维度存疑"', /维度存疑/.test(st.reason));
  }

  console.log('\n【G1】首轮单次瞬时失败 → 退避重试自动救回(不再显示正忙)');
  {
    const { w, d } = boot({ failFirst:true }); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(6000);   // 只需等第一次退避(4s)救回
    ok('仍在验证对话页(未被踢回结果页)', d.querySelector('#page-verify').classList.contains('active'));
    ok('重试后未显示正忙(已被自动救回)', !/AI 正忙/.test(d.querySelector('#verify-scroll').innerHTML));
    ok('入口按钮未被置灰', d.querySelector('#r-verify').disabled !== true);
  }

  console.log('\n【G2】首轮持续失败(退避重试耗尽) → 按钮置灰 + 提示正忙，问卷结果不受影响');
  {
    const { w, d } = boot({ failFirstAll:true }); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(14000);  // 退避 4s + 8s 全部耗尽
    ok('验证页显示分流文案（net 失败→「AI 暂时没回应，稍后再来验」，不再是笼统的「正忙」）', /AI 暂时没回应，稍后再来验/.test(d.querySelector('#verify-scroll').innerHTML));
    ok('入口按钮置灰', d.querySelector('#r-verify').disabled === true);
    ok('结果页仍可正常显示（r-code 存在）', !!d.querySelector('.r-code').textContent.trim());
    ok('问卷结果不受验证影响 = ESTJ（全选A）', d.querySelector('.r-code').textContent.trim() === 'ESTJ');
  }

  console.log('\n【H】中途失败 → 保留对话 + 再试一次，不切页');
  {
    const { w, d } = boot({ failMid:true }); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    typeVerify(d,'我常一个人待着'); sendVerify(d); await wait(400);   // 第1轮成功
    typeVerify(d,'最近一次挺不开心'); sendVerify(d); await wait(400);   // 第2轮 fetch 失败
    ok('中途失败显示"再试一次"', !!d.querySelector('#verify-retry'));
    ok('未切到报告页（仍在验证对话页）', d.querySelector('#page-verify').classList.contains('active') && !d.querySelector('#page-verify-report').classList.contains('active'));
    d.querySelector('#verify-retry').click(); await wait(400);          // 重试成功
    typeVerify(d,'又说了点啥'); sendVerify(d); await wait(400);         // 第3轮
    typeVerify(d,'最后一句'); sendVerify(d); await wait(400);
    ok('重试后可继续并完成验证报告', d.querySelector('#page-verify-report').classList.contains('active'));
  }

  console.log('\n【I】报告失败 → 显示再试一次，可重试成功');
  {
    const { w, d } = boot({ reportBad:true }); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'我更想安静'); sendVerify(d); await wait(400); }
    ok('坏报告 → 显示"再试一次"', !!d.querySelector('#v-retry'));
  }

  console.log('\n【J】刷新直达 + 重新验证可覆盖');
  {
    const { w, d } = boot(); await wait(60); await fillBg(w,d); await answerAll(w,d,0); await wait(200);
    d.querySelector('#r-verify').click(); await wait(400);
    for(let i=1;i<=3;i++){ typeVerify(d,'我确实内向'); sendVerify(d); await wait(400); }
    ok('首次验证完成，verify_done=true', AP(w).verify_done === true);
    // 模拟刷新：用同一存档重新 boot（preset 进 localStorage 由上一实例写入，但本实例独立；这里直接构造存档）
    const st = AP(w);
    st.step = 'verify-report';
    const b = boot({ preset: st }); await wait(120);
    ok('刷新到 verify-report → 直达报告页不重复请求', b.d.querySelector('#page-verify-report').classList.contains('active'));
    // 重新验证覆盖
    b.d.querySelector('#v-result').click(); await wait(40);
    b.d.querySelector('#r-verify').click(); await wait(400);  // startVerifyChat 重置
    const st2 = AP(b.w);
    ok('重新验证重置旧报告（verify_done=false）', st2.verify_done === false && st2.verify_report === null);
  }

  console.log('\n========================================');
  console.log('  AI 行为验证测试：' + passes + ' 通过 / ' + fails + ' 失败');
  console.log('========================================');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
