// Cloudflare Pages Function：Gemini 反向代理
// 作用：客户端不持 Key，请求打到同源 /api/gemini-proxy，本函数用 Cloudflare 环境变量
// GEMINI_KEY 注入 Authorization 后转发给 Google。Key 只存在于 Cloudflare 环境变量，
// 不进仓库、不进浏览器源码，避免公开泄露。
//
// 部署前必须在 Cloudflare Pages → Settings → Environment variables 添加：
//   GEMINI_KEY = 你的 Google AI Studio Key（aistudio.google.com/apikey）
// （Production 环境也要加）

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function json(body, status){
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  });
}

export async function onRequestPost({ request, env }) {
  const key = env.GEMINI_KEY;
  if (!key) {
    return json({ error: 'GEMINI_KEY 未配置：请在 Cloudflare Pages → Settings → Environment variables 添加 GEMINI_KEY（Production）' }, 500);
  }
  // 透传请求体（流式 SSE 直接转发 body 流），仅替换 Authorization 为服务端 Key
  const upstream = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + key
    },
    body: request.body
  });
  // 直接把上游响应体作为流返回，保证 SSE / 逐字流式对前端透明
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' }
  });
}
