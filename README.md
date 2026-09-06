# 灵魂拷问器 / 盘人模式（Cloudflare Pages 部署版）

单文件人格测试 Web App（MBTI 风格 + AI 盘人）。本仓库用于通过 **Cloudflare Pages + GitHub 自动部署**，
让海外（如美国洛杉矶）用户也能低延迟访问。Gemini 走同源反向代理，**Key 不进仓库、不进浏览器**。

## 目录结构

- `soul-interrogator.html` —— 单一事实源（可编辑的整页源码；已启用 Cloudflare 代理标志）
- `dist/index.html` —— 构建产物（Cloudflare 实际托管）
- `functions/api/gemini-proxy.js` —— Cloudflare Pages Function：Gemini 反向代理（服务端填 Key）
- `.gitignore`

## Cloudflare Pages 部署步骤（连接 GitHub 后）

在 Cloudflare Dashboard → **Workers & Pages → Create → Pages → 连接 Git** 中：

1. 授权并选中本仓库 `nhoj73/soul-interrogator`
2. 设置：
   - **Framework preset**：`None`
   - **Build command**：`mkdir -p dist && cp soul-interrogator.html dist/index.html`
   - **Output directory / Build output directory**：`dist`
   - **Branch**：`main`
3. 点 **Save and Deploy**

### ⚠️ 必做：配置 Gemini Key（否则 Gemini 仍不可用）

代理模式下 Key 存在 Cloudflare 环境变量，不写进任何文件。部署后：

- Cloudflare Pages → 你的项目 → **Settings → Environment variables**
- 添加变量：`GEMINI_KEY` = 你的 Google AI Studio Key（`aistudio.google.com/apikey`）
- **Production** 环境也要加（不是只加 Preview）
- 保存后**必须重新部署一次**才会生效：环境变量在部署时注入，
  改完变量不会自动应用到已有部署。重新部署方式：推一次提交（推荐，会自动触发），
  或 Deployments → 最新一次 → Retry deployment。
  验证是否生效：访问 `/api/gemini-proxy` 发一个 chat 请求，返回正常补齐结果即生效；
  若返回 `GEMINI_KEY 未配置`，说明当前部署是在加变量之前构建的，需再部署一次。

此后朋友选 Gemini 即可直接用，无需自己贴 Key；Key 全程不出现在公网。

## 工作原理（安全要点）

- 仓库公开，但 `soul-interrogator.html` / `dist/index.html` 里 **Gemini Key 已清空**（`keys:[]`），
  且 `USE_CF_GEMINI_PROXY=true` 让前端把 Gemini 请求发到同源 `/api/gemini-proxy`。
- `functions/api/gemini-proxy.js` 读取 `env.GEMINI_KEY`，服务端填 `Authorization` 后转发 Google。
- Key 只存在于 Cloudflare 环境变量 + 你的本地源文件（`soul-interrogator.html` 写死的那份用于 workbuddy.link 直连）。

## 注意

- 单文件 HTML 内仍硬编码**智谱 AutoGLM Key**（用于 Zhipu 直连），任何人「查看源代码」可取到——
  与现有 workbuddy.link 部署暴露程度一致，非新风险。
- 本部署与 workbuddy.link 互为镜像，可并存。
