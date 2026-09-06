# 灵魂拷问器 / 盘人模式（Cloudflare Pages 部署版）

单文件人格测试 Web App（MBTI 风格 + AI 盘人）。本仓库用于通过 **Cloudflare Pages + GitHub 自动部署**，
让海外（如美国洛杉矶）用户也能低延迟访问。

## 目录结构

- `soul-interrogator.html` —— 单一事实源（可编辑的整页源码）
- `dist/index.html` —— 构建产物（Cloudflare 实际托管的服务文件）

## Cloudflare Pages 部署步骤（连接 GitHub 后）

在 Cloudflare Dashboard → **Workers & Pages → Create → Pages → 连接 Git** 中：

1. 授权并选中本仓库
2. 设置：
   - **Framework preset**：`None`（或留空）
   - **Build command**：`mkdir -p dist && cp soul-interrogator.html dist/index.html`
   - **Output directory / Build output directory**：`dist`
   - **Branch**：`main`（或你推送的分支）
3. 点 **Save and Deploy**

以后只要 `git push` 更新 `soul-interrogator.html`，Cloudflare 会自动重建 `dist/` 并发布。

> 若不想走构建命令，也可把 Build command 留空、直接把 `dist/index.html` 提交进仓库，
> Output directory 仍填 `dist`。

## 注意

- 单文件 HTML 内已硬编码智谱 AutoGLM Key，任何人「查看源代码」即可取到——静态托管本就公开，
  与现有 workbuddy.link 部署暴露程度一致，非新风险。
- 海外用户建议选 **Gemini** 模型（美国直连，丝滑）；选智谱从中国节点出，延迟高且可能被地域拦截。
- 本部署与现有 workbuddy.link 互为镜像，可并存。
