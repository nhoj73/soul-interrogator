# soul-interrogator / 灵魂拷问器

单文件 MBTI 风格人格测试 Web App（出题 / 评估 / 盘人 / 验证 四模块）。

## 使用

直接用浏览器打开 `soul-interrogator.html` 即可，零依赖、单文件、移动端优先。

- `dist/index.html` — 构建产物（与源文件一致，可直接部署）
- `publish.sh` — 重建 dist 并部署的脚本
- `_verify*.mjs / *.cjs` — 自动化测试套件（jsdom + mock fetch）

## 说明

所有 AI 调用走多 Provider 架构（智谱 → Gemini → 自定义），测试默认规避线上限速，
仅供个人在本机使用。
