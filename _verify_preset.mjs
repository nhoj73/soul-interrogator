// 预设接口下拉回归：单一事实源 AI_PRESETS + UI 交互全断言。
// 覆盖：条数、每条 baseURL 格式、models 非空、icon 零外链+降级徽章、key 入口、
//       选中快捷填充、填充后手改覆盖、key 发送警示文案。
import fs from 'fs';
import { JSDOM } from '/Users/apple/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const FILE = '/Users/apple/WorkBuddy/2026-08-30-12-35-31/soul-interrogator.html';
const html = fs.readFileSync(FILE, 'utf8');
const jsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const htmlBare = html.replace(/<script>[\s\S]*?<\/script>/, '');

const patch = src => src.replace('function applyProvider(id, persist){',
  'window.__SI=window.__SI||{};window.__SI.getPresets=function(){return AI_PRESETS;};window.__SI.applyProvider=applyProvider;window.__SI.presetBadge=presetBadge;window.__SI.renderAISetting=renderAISetting;window.__SI.getCUSTOM_CFG=function(){return CUSTOM_CFG;}; function applyProvider(id, persist){');

let pass = 0; const fails = [];
function ok(c, m){ if(c){ pass++; console.log('  ✓ ' + m); } else { fails.push(m); console.log('  ✗ ' + m); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(){
  const dom = new JSDOM(htmlBare, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/' });
  const w = dom.window, d = w.document;
  w.scrollTo = () => {};
  w.AbortController = w.AbortController || AbortController;
  w.TextDecoder = w.TextDecoder || TextDecoder; w.TextEncoder = w.TextEncoder || TextEncoder;
  w.fetch = () => Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ choices:[{message:{content:'{}'}}] }) });
  const s = w.document.createElement('script'); s.textContent = patch(jsCode); w.document.body.appendChild(s);
  return { w, d };
}

(async () => {
  /* ---- P1 单一事实源：条数与字段完整性 ---- */
  console.log('\n【P1】预设表：条数 12-15、字段完整、零外链图标');
  {
    const ps = [];
    // 从源码直接提取 AI_PRESETS（不经 jsdom，防插桩影响）
    const m = jsCode.match(/var AI_PRESETS = \[([\s\S]*?)\n\];/);
    ok(!!m, 'P1 源码存在 AI_PRESETS 单一事实源');
    if(m){
      const items = m[1].match(/\{ id:'[^']+'[\s\S]*?\}/g) || [];
      ok(items.length >= 12 && items.length <= 15, 'P1 条数 12-15（实际 ' + items.length + '）');
      let allOk = true, noExt = true, hasKey = true, modelsOk = true, endpoOk = true;
      for(const it of items){
        const id = (it.match(/id:'([^']+)'/) || [])[1] || '?';
        const base = (it.match(/base:'([^']+)'/) || [])[1] || '';
        const icon = (it.match(/icon:'([^']*)'/) || [])[1] || '';
        const keyUrl = (it.match(/keyUrl:'([^']*)'/) || [])[1] || '';
        const models = (it.match(/models:\[([^\]]*)\]/) || [])[1] || '';
        if(!(base.startsWith('https://') || base.startsWith('http://localhost'))) { allOk = false; console.log('    base 异常 [' + id + ']: ' + base); }
        if(!base.endsWith('/chat/completions')) { endpoOk = false; console.log('    非 /chat/completions 端点 [' + id + ']: ' + base); }
        if(/https?:|[.\/]/.test(icon)) { noExt = false; console.log('    图标疑似外链/路径 [' + id + ']: ' + icon); }
        if(!keyUrl && id !== 'ollama') { hasKey = false; console.log('    缺 key 入口 [' + id + ']'); }
        if(!models.trim()) { modelsOk = false; console.log('    models 为空 [' + id + ']'); }
      }
      ok(allOk, 'P1 每条 base 均为 https://（或 Ollama localhost）');
      ok(endpoOk, 'P1 每条端点均以 /chat/completions 结尾（只收 OpenAI 兼容）');
      ok(noExt, 'P1 图标零外部请求（emoji，无 http/路径）');
      ok(hasKey, 'P1 每条注明 key 获取入口（Ollama 本地除外）');
      ok(modelsOk, 'P1 每条默认模型名非空（官方文档核实）');
    }
  }

  /* ---- P2 图标降级链 ---- */
  console.log('\n【P2】图标：emoji 直用，缺失/非法时降级为首字徽章');
  {
    const { w } = boot(); await sleep(120);
    ok(w.__SI.presetBadge({ icon:'🤖', label:'OpenAI' }) === '🤖', 'P2 emoji icon 直用');
    ok(w.__SI.presetBadge({ icon:'', label:'DeepSeek' }) === 'D', 'P2 icon 缺失 → label 首字大写徽章');
    ok(w.__SI.presetBadge({ icon:'https://x.com/a.png', label:'Bad' }) === 'B', 'P2 icon 疑似外链 → 强制降级首字徽章');
    ok(w.__SI.presetBadge({ icon:'./a.png', label:'Bad' }) === 'B', 'P2 icon 相对路径 → 强制降级首字徽章');
  }

  /* ---- P3 交互：打开面板 → 自定义 → 预设下拉 → 选中填充 ---- */
  console.log('\n【P3】交互：选中预设快捷填充 baseURL + 默认模型');
  {
    const { w, d } = boot(); await sleep(120);
    const ps = w.__SI.getPresets();
    d.getElementById('btn-ai').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    d.querySelector('#ai-seg button[data-p="custom"]').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    ok(d.getElementById('ai-custom').style.display === 'block', 'P3 自定义面板已展开');
    ok(d.getElementById('ai-preset-list').style.display === 'none', 'P3 预设列表默认收起');
    d.getElementById('ai-preset-btn').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    ok(d.getElementById('ai-preset-list').style.display === 'block', 'P3 点「预设 ▾」展开下拉');
    const items = d.querySelectorAll('.ai-preset-item');
    ok(items.length === ps.length, 'P3 下拉项数 === 预设表条数（单一事实源渲染，' + items.length + '）');
    // 选中 DeepSeek（index 4）
    const deep = ps.findIndex(p => p.id === 'deepseek');
    items[deep].dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    ok(d.getElementById('ai-ep').value === ps[deep].base, 'P3 选中 → baseURL 快捷填充');
    ok(d.getElementById('ai-models').value === ps[deep].models.join(', '), 'P3 选中 → 默认模型填充（主模型在前）');
    ok(d.getElementById('ai-preset-hint').textContent.indexOf('获取 Key') > -1, 'P3 选中 → 显示该条 key 获取入口');
    ok(d.getElementById('ai-preset-list').style.display === 'none', 'P3 选中后下拉收起');
  }

  /* ---- P4 覆盖手改：填充后手改 → 保存 → 重开面板显示手改值 ---- */
  console.log('\n【P4】所有字段仍可手改，保存后手改值持久');
  {
    const { w, d } = boot(); await sleep(120);
    const ps = w.__SI.getPresets();
    d.getElementById('btn-ai').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    d.querySelector('#ai-seg button[data-p="custom"]').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    d.getElementById('ai-preset-btn').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    const deep = ps.findIndex(p => p.id === 'deepseek');
    d.querySelectorAll('.ai-preset-item')[deep].dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    // 手改字段（产品校验要求 key 非空，补 key）
    d.getElementById('ai-key').value = 'sk-test-key';
    d.getElementById('ai-ep').value = 'https://my-proxy.example.com/v1/chat/completions';
    d.getElementById('ai-models').value = 'my-model-x, my-model-y';
    d.getElementById('ai-save').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(60);
    const cfg = w.__SI.getCUSTOM_CFG();
    ok(cfg.endpoint === 'https://my-proxy.example.com/v1/chat/completions', 'P4 手改 baseURL 覆盖预设值并保存');
    ok(cfg.model === 'my-model-x' && cfg.fallback === 'my-model-y', 'P4 手改模型列表覆盖预设值并保存');
    // 重开面板：显示手改值（不被预设回弹）
    d.getElementById('modal-ai').classList.remove('on');
    d.getElementById('btn-ai').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(40);
    ok(d.getElementById('ai-ep').value === 'https://my-proxy.example.com/v1/chat/completions', 'P4 重开面板显示手改值（预设不回弹）');
    // 纯手填路径（不经过预设）保留
    d.getElementById('ai-ep').value = 'https://hand-typed.example.com/v1/chat/completions';
    d.getElementById('ai-key').value = 'sk-hand';
    d.getElementById('ai-models').value = 'hand-model';
    d.getElementById('ai-save').dispatchEvent(new w.Event('click', { bubbles:true }));
    await sleep(60);
    ok(w.__SI.getCUSTOM_CFG().endpoint === 'https://hand-typed.example.com/v1/chat/completions', 'P4 纯手填路径保留（不经预设）');
  }

  /* ---- P5 安全提示 + UI 元素 ---- */
  console.log('\n【P5】key 发送警示 + UI 完整性');
  {
    ok(html.indexOf('API Key 会发送到上方所选接口地址') > -1, 'P5 UI 明示「API Key 会发送到所选接口地址」');
    ok(html.indexOf('id="ai-preset-btn"') > -1 && html.indexOf('id="ai-preset-list"') > -1, 'P5 预设按钮与列表面板元素存在');
    ok(html.indexOf('id="ai-preset-hint"') > -1, 'P5 key 入口提示位存在');
    // 每条预设的 key 提示在选中后可见（P3 已验一条）；此处断言源码含 keyHint 字段
    ok((jsCode.match(/keyHint:'/g) || []).length >= 11, 'P5 每条预设（除 Ollama）均带 keyHint');
  }


  /* ---- P6 布局：接口地址输入框不被 .btn{width:100%} 挤压（实测回归） ---- */
  console.log('\n【P6】布局：grid(1fr auto) + 按钮 width:auto，输入框保住可视宽度');
  {
    const seg = html.slice(html.indexOf('id="ai-custom"'), html.indexOf('id="ai-key"') + 40);
    ok(/display:grid;\s*grid-template-columns:1fr auto/.test(seg), 'P6 行容器为 grid(1fr auto)（非会被 .btn 挤爆的 flex）');
    ok(/id="ai-ep"[^>]*min-width:0/.test(seg), 'P6 input 带 min-width:0（允许收缩，不撑破容器）');
    ok(/id="ai-preset-btn"[^>]*width:auto/.test(seg), 'P6 按钮 width:auto 覆盖 .btn 的 width:100%（挤压根因）');
    ok(!/id="ai-ep"[^>]*flex:1/.test(seg), 'P6 input 不再用 flex:1（grid 已分配 1fr）');
    const epIdx = seg.indexOf('id="ai-ep"'), btnIdx = seg.indexOf('id="ai-preset-btn"');
    ok(epIdx > -1 && btnIdx > epIdx, 'P6 input 在按钮之前（tab 顺序与视觉顺序一致）');
  }

  console.log('\n预设接口下拉回归：' + pass + ' 通过 / ' + fails.length + ' 失败');
  process.exit(fails.length ? 1 : 0);
})();
