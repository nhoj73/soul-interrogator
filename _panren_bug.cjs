/* 盘人双模式 · 针对性 Bug 验证（加载真实 HTML，mock fetch 不联网）
   场景 A：round=2 说"够了"应出报告，且不被误记为"失去耐心"
   场景 B：连续 3 次敷衍应提前结算并附注"失去耐心"
   场景 C：结算瞬时失败（空返回）重试 1 次后成功 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, 'soul-interrogator.html');
const html = fs.readFileSync(FILE, 'utf8');

let passes = 0, fails = 0;
function ok(name, cond){ if(cond){ passes++; console.log('  ✓ ' + name); } else { fails++; console.log('  ✗ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeDom(){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.detail || e.message || e)));
  const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true,
                                url:'https://example.com/soul-interrogator.html', virtualConsole:vc });
  const win = dom.window;
  win.scrollTo = function(){};
  win.HTMLCanvasElement.prototype.getContext = function(){ return {}; };
  // 可控 fetch：根据最后 user 消息分流；支持一次性空返回
  const st = { emptyOnce:false, emptyUsed:false };
  win.__st = st;
  win.fetch = async (url, opt) => {
    let body; try { body = JSON.parse(opt && opt.body); } catch(e){ body = {}; }
    const msgs = body.messages || [];
    const lastUser = msgs.filter(m => m.role === 'user').slice(-1)[0];
    const last = lastUser ? lastUser.content : '';
    const isReport = /输出鉴定报告|输出民间鉴定报告/.test(last);
    if (isReport && st.emptyOnce && !st.emptyUsed){
      st.emptyUsed = true;
      return { ok:true, status:200, body:null,
               json: async()=>({ choices:[{ message:{ content:'' } }] }),
               text: async()=>JSON.stringify({ choices:[{ message:{ content:'' } }] }) };
    }
    let text;
    if (isReport){
      if (/民间鉴定报告/.test(last)){
        text = JSON.stringify({ match_rate:88, title:'确诊为 ENFP 快乐小狗',
          praise:[{quote:'你请我吃火锅',point:'太仗义'}], tease:[{quote:'你说社恐',point:'社恐还这么能聊'}],
          roast:'你这小太阳我服了', blessing:'愿你天天有人陪' });
      } else {
        text = JSON.stringify({ match_rate:72, confidence:'中',
          dims:[{dim:'EI',verdict:'吻合',note:'你说聚会后想回家'},{dim:'SN',verdict:'存疑',note:''},
                {dim:'TF',verdict:'吻合',note:''},{dim:'JP',verdict:'矛盾',note:'你临场装行李'}],
          evidence_match:[{quote:'我想立刻回家',point:'典型 I'}], evidence_doubt:[{quote:'我临场装行李',point:'偏 P'}],
          base_color:'外冷内热的闷葫芦', roast:'嘴上说随便，比谁都挑' });
      }
    } else {
      text = '你刚才说「' + last + '」——这听起来更像 I。具体说说最近一次聚会后你在想什么？';
    }
    return { ok:true, status:200, body:null,
             json: async()=>({ choices:[{ message:{ content:text } }] }),
             text: async()=>JSON.stringify({ choices:[{ message:{ content:text } }] }) };
  };
  win.html2canvas = function(){ return Promise.resolve({ toDataURL:()=>'data:', toBlob:()=>({}) }); };
  return { win, doc: win.document, errors, st };
}

async function startCross(doc, win, click){
  click(doc.getElementById('enter-cross'));
  await wait(15);
  click(doc.getElementById('mode-cross'));
  await wait(15);
  const cells = doc.querySelectorAll('.type-cell');
  cells[0].dispatchEvent(new win.Event('click', { bubbles:true }));
  click(doc.getElementById('type-ok'));
  await wait(30); // 等首轮 AI
}

(async function(){
  const click = (el) => { if(el) el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles:true })); };
  const typeSend = async (doc, win, id, v) => { const el = doc.getElementById(id); el.value = v; click(doc.getElementById(id.replace('-input','-send'))); await wait(30); };

  console.log('\n[A] round=2 说"够了" → 出报告，且不记"失去耐心"');
  {
    const { win, doc } = makeDom();
    await wait(60);
    await startCross(doc, win, click);
    await typeSend(doc, win, 'cross-input', '最近一次聚会后我立刻想回家，安静最舒服');
    await typeSend(doc, win, 'cross-input', '听项目先想怎么落地，再想还能变成啥');
    await typeSend(doc, win, 'cross-input', '够了');
    await wait(40);
    ok('A: 报告页激活', doc.getElementById('page-cross-report').classList.contains('active'));
    const root = doc.getElementById('cross-report-root').innerHTML;
    ok('A: 报告含自报类型', /IN/.test(root));
    ok('A: 未错误附注"失去耐心"', !/失去耐心/.test(root));
    ok('A: 报告含四维判定', /吻合|存疑|矛盾/.test(root));
  }

  console.log('\n[B] 连续 3 次敷衍 → 提前结算 + "失去耐心"');
  {
    const { win, doc } = makeDom();
    await wait(60);
    await startCross(doc, win, click);
    await typeSend(doc, win, 'cross-input', '都行');
    await typeSend(doc, win, 'cross-input', '随便');
    await typeSend(doc, win, 'cross-input', '不知道');
    await wait(40);
    ok('B: 报告页激活(提前结算)', doc.getElementById('page-cross-report').classList.contains('active'));
    ok('B: 附注"失去耐心"', /失去耐心/.test(doc.getElementById('cross-report-root').innerHTML));
  }

  console.log('\n[C] 结算空返回 → 重试 1 次后成功');
  {
    const { win, doc, st } = makeDom();
    st.emptyOnce = true;
    await wait(60);
    await startCross(doc, win, click);
    await typeSend(doc, win, 'cross-input', '我确实更想一个人待着');
    click(doc.getElementById('cross-report-btn')); // 按钮在 round<3 隐藏，但程序化 click 仍触发
    await wait(3500); // 等瞬时失败后重试（backoff 3s）成功
    ok('C: 重试后成功生成报告', doc.getElementById('page-cross-report').classList.contains('active') && /吻合/.test(doc.getElementById('cross-report-root').innerHTML));
  }

  console.log('\n结果：通过 ' + passes + ' / ' + (passes+fails) + (fails ? '  ✗ 有失败' : '  ✓ 全部通过'));
  process.exit(fails ? 1 : 0);
})();
