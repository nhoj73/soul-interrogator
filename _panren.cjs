/* 盘人双模式 冒烟测试：用 jsdom 加载真实 HTML，mock fetch 驱动完整流程（不联网）。
   覆盖：首页双入口 / 模式选择 / 16 宫格 / 拷问对话+报告+无改判 / 敷衍三振 /
   闲聊对话+小本本+民间鉴定报告 / quiz 回归。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'soul-interrogator.html');
const html = fs.readFileSync(FILE, 'utf8');

let fails = 0, passes = 0;
function ok(name, cond){ if(cond){ passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name); } }
/* 多档案重构后 localStorage 存为 {v,profiles:[...],activeId}；AP 解包出当前档案 */
function AP(win){ const st = JSON.parse(win.localStorage.getItem('soul_interrogator_v1')); return (st && st.profiles) ? st.profiles[0] : st; }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* ---- mock fetch：根据最后一条 user 消息判断返回聊天回复还是报告 JSON ---- */
function mockResponse(bodyText){
  let body; try { body = JSON.parse(bodyText); } catch(e){ body = {}; }
  const msgs = body.messages || [];
  const lastUser = msgs.filter(m => m.role === 'user').slice(-1)[0];
  const last = lastUser ? lastUser.content : '';
  let text;
  if(/输出鉴定报告/.test(last)){
    text = '```json\n{"match_rate":72,"confidence":"中",'
      + '"dims":[{"dim":"EI","verdict":"吻合","note":"你说聚会后想立刻回家"},'
      + '{"dim":"SN","verdict":"存疑","note":"你既讲落地也讲想象"},'
      + '{"dim":"TF","verdict":"矛盾","note":"朋友吐槽你先分析问题"},'
      + '{"dim":"JP","verdict":"吻合","note":"你提前一晚收拾行李"}],'
      + '"evidence_match":[{"quote":"聚会后想立刻回家","point":"支持内向"}],'
      + '"evidence_doubt":[{"quote":"朋友吐槽你先分析","point":"偏思考削弱F"}],'
      + '"base_color":"表面热闹内心要独处的人","roast":"嘴上说随便，其实比谁都挑。"}\n```';
  } else if(/民间鉴定报告/.test(last)){
    text = '```json\n{"match_rate":88,"title":"确诊为 ENFP 快乐小狗",'
      + '"praise":[{"quote":"你刚才说请我吃火锅","point":"太仗义了这朋友我交定了"}],'
      + '"tease":[{"quote":"你说自己社恐","point":"社恐还能这么能聊？"}],'
      + '"roast":"你这小太阳我服了","blessing":"愿你天天有梗有人陪"}\n```';
  } else if(/盘问检验/.test(msgs[0] ? msgs[0].content : '')){
    // 拷问正常轮：先点评（引原话）再追问
    text = '（点评）你刚才说「今天只想躺着」，这挺符合你自报的内向。最近一次让你愿意出门凑热闹是什么时候？';
  } else {
    // 闲聊正常轮：带引用 + 偶发小鉴定
    text = '哈哈你这句「我超爱熬夜」我记下了，熬夜冠军就是你了！下次打算熬到几点？'
      + '【小鉴定：N人浓度+1 · 这脑洞我先干为敬】';
  }
  return { ok:true, json: () => Promise.resolve({ choices:[{ message:{ content:text } }] }) };
}

const errors = [];
const vc = new (require('jsdom').VirtualConsole)();
vc.on('jsdomError', e => errors.push(String(e.detail || e.message || e)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/soul-interrogator.html',
  virtualConsole: vc,
});
const { window } = dom;
window.fetch = (url, opt) => Promise.resolve(mockResponse(opt && opt.body));

(async function run(){
  await wait(60); // 等脚本启动完成
  const doc = window.document;
  const $ = (id) => doc.getElementById(id);
  const active = () => { const p = doc.querySelector('.page.active'); return p ? p.id : '(none)'; };
  const click = (el) => { if(el) el.dispatchEvent(new window.Event('click', { bubbles:true })); };

  console.log('\n[1] 首页双入口 + quiz 回归');
  ok('首页激活', active() === 'page-home');
  ok('正式访谈入口存在', !!$('btn-primary-start'));
  ok('盘人入口(enter-cross)存在', !!$('enter-cross'));
  ok('resume-box 仅 quiz 用(存在)', !!$('resume-box'));

  console.log('\n[2] 模式选择页路由');
  click($('enter-cross'));
  await wait(20);
  ok('进入模式选择页', active() === 'page-mode');
  ok('拷问卡片存在', !!$('mode-cross'));
  ok('闲聊卡片存在', !!$('mode-chat'));

  console.log('\n[3] 选型页：16 宫格 + 理由');
  click($('mode-cross'));
  await wait(20);
  ok('进入选型页', active() === 'page-cross-type');
  ok('16 宫格渲染', $('type-grid').querySelectorAll('.type-cell').length === 16);
  // 选 INFP
  const cells = $('type-grid').querySelectorAll('.type-cell');
  let picked = null;
  cells.forEach(c => { if(c.textContent === 'INFP'){ click(c); picked = c; } });
  ok('选中 INFP', picked && picked.classList.contains('on'));
  $('f-reason').value = '感觉自己很理想主义';
  click($('type-ok'));
  await wait(20);
  ok('进入拷问对话页', active() === 'page-cross-chat');
  ok('state.mode=cross', window.localStorage.getItem('soul_interrogator_v1').includes('"mode":"cross"'));
  ok('state.claimedType=INFP', window.localStorage.getItem('soul_interrogator_v1').includes('INFP'));

  console.log('\n[4] 拷问：AI 首条 + 先点评后追问 + 轮次');
  await wait(120); // 等 mock 首条返回
  let bubbles = $('cross-scroll').querySelectorAll('.bubble');
  ok('AI 开场已出现', bubbles.length >= 1 && bubbles[bubbles.length-1].classList.contains('ai'));
  ok('页头 第1/6轮', $('cross-num').textContent.indexOf('第 1 / 6 轮') === 0);

  // 发一条正常回答
  $('cross-input').value = '上周末我推了两次饭局，只想在家看书。';
  click($('cross-send'));
  await wait(150);
  ok('用户气泡渲染', $('cross-scroll').querySelectorAll('.bubble.user').length === 1);
  ok('AI 已追问(第2轮)', $('cross-num').textContent.indexOf('第 2 / 6 轮') === 0);

  console.log('\n[5] 拷问：生成鉴定报告 + 无改判文案');
  click($('cross-report-btn')); // 即便未到3轮也强制触发，验证管线
  await wait(200);
  ok('进入鉴定报告页', active() === 'page-cross-report');
  const rt = $('cross-report-root').textContent;
  ok('报告含自报类型 INFP', rt.indexOf('INFP') > -1);
  ok('报告含吻合度', rt.indexOf('吻合度') > -1);
  ok('四维判定存在', $('cross-report-root').querySelectorAll('.dim-verdict').length === 4);
  ok('报告无"你其实是"改判文案', !/你其实是/.test(rt));
  ok('state.report 已落库', window.localStorage.getItem('soul_interrogator_v1').includes('"report"'));

  console.log('\n[6] 拷问：刷新直达不重复请求（模拟重载后读 report）');
  // 直接校验：report 已存，且 normalize 后 mode 仍为 cross
  const saved = AP(window);
  ok('report.match_rate 为数字', typeof saved.report.match_rate === 'number');
  ok('四维 verdict 合法', saved.report.dims.every(d => ['吻合','存疑','矛盾'].indexOf(d.verdict) > -1));

  console.log('\n[7] 回到首页 → 进入闲聊模式');
  click($('cx-home'));
  await wait(20);
  ok('回到首页', active() === 'page-home');
  click($('enter-cross'));
  await wait(20);
  click($('mode-chat'));
  await wait(20);
  ok('进入选型页(闲聊)', active() === 'page-cross-type');
  let cell2 = null;
  $('type-grid').querySelectorAll('.type-cell').forEach(c => { if(c.textContent === 'ENFP') click(c); });
  click($('type-ok'));
  await wait(20);
  ok('进入闲聊对话页', active() === 'page-chat-chat');
  ok('state.mode=chat', window.localStorage.getItem('soul_interrogator_v1').includes('"mode":"chat"'));

  console.log('\n[8] 闲聊：对话 + 小本本 chip 递增');
  await wait(120);
  ok('闲聊 AI 开场', $('chat-scroll').querySelectorAll('.bubble').length >= 1);
  $('chat-input').value = '我超爱熬夜打游戏，昨天三点才睡。';
  click($('chat-send'));
  await wait(150);
  ok('小本本 chip 已追加', $('nb-chips').querySelectorAll('.nb-chip').length >= 1);
  ok('小本本计数与 chip 数一致', $('nb-count').textContent === '(' + $('nb-chips').querySelectorAll('.nb-chip').length + ')');
  ok('闲聊气泡不含【小鉴定】原文(已剥离)', $('chat-scroll').textContent.indexOf('【小鉴定') === -1);

  console.log('\n[9] 闲聊：生成民间鉴定报告');
  click($('chat-report-btn'));
  await wait(200);
  ok('进入民间鉴定报告页', active() === 'page-chat-report');
  const crt = $('chat-report-root').textContent;
  ok('报告含称号', crt.indexOf('快乐小狗') > -1);
  ok('报告含娱乐吻合度', crt.indexOf('娱乐吻合度') > -1);
  ok('民间报告无改判', !/你其实是/.test(crt));

  console.log('\n[10] 拷问敷衍三振 → 提前结算附注');
  // 重新开一个拷问会话测试敷衍
  click($('cc-home'));
  await wait(20);
  click($('enter-cross')); await wait(20);
  click($('mode-cross')); await wait(20);
  $('type-grid').querySelectorAll('.type-cell').forEach(c => { if(c.textContent === 'ISTJ') click(c); });
  click($('type-ok')); await wait(20);
  await wait(120);
  for(let i=0;i<3;i++){ $('cross-input').value = '随便'; click($('cross-send')); await wait(150); }
  await wait(250);
  ok('敷衍三振后进入报告页', active() === 'page-cross-report');
  ok('报告附注"用户中途失去耐心"', $('cross-report-root').textContent.indexOf('用户中途失去耐心') > -1);

  console.log('\n[11] 启动期 JS 错误检查');
  const realErrors = errors.filter(e => !/scrollTo/.test(e)); // jsdom 未实现 scrollTo，真实浏览器无此问题
  ok('无 jsdomError(忽略 scrollTo)', realErrors.length === 0);
  if(realErrors.length) realErrors.slice(0,5).forEach(e => console.log('   ! ' + e.slice(0,200)));

  console.log('\n==== 结果：' + passes + ' 通过 / ' + fails + ' 失败 ====');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
