#!/bin/sh
# 把 soul-interrogator.html 打包成待发布目录 dist/
# 用法： ./publish.sh [站点根 URL]      例： ./publish.sh https://xxx.cloudstudio.club
# 说明： 源文件始终只有 soul-interrogator.html 一个，
#        这里把它复制成 dist/index.html 并把 OG 占位域名换成真实地址。
set -e
cd "$(dirname "$0")"

SRC="soul-interrogator.html"
OUT="dist"
SITE="${1:-}"

[ -f "$SRC" ] || { echo "找不到 $SRC"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$SRC" "$OUT/index.html"

# 安全门禁（已降级为警告）：若 API key 疑似泄漏进 dist，输出大字警告但放行发布。
# AutoGLM key 形如 32 位十六进制.16 位字母数字。钥匙外置后请恢复为 exit 1 硬拦。
if grep -qE '[0-9a-f]{32}\.[A-Za-z0-9]{16}' "$OUT/index.html"; then
  echo "================================================================"
  echo "  [key-gate] ⚠️  API key 硬编码在前端，钥匙公开暴露中——用户知情"
  echo "================================================================"
  echo "[key-gate] 命中 key 正则，按用户授权放行发布（grep 逻辑保留，钥匙外置后恢复硬拦）"
fi

# 分享封面图（朋友圈/微信抓取用，必须是能公网访问的绝对地址）
[ -f og-cover.png ] && cp og-cover.png "$OUT/"

if [ -n "$SITE" ]; then
  SITE="${SITE%/}"
  sed -i '' "s|https://YOUR-DOMAIN.example.com/soul-interrogator.html|$SITE/|g" "$OUT/index.html"
  sed -i '' "s|https://YOUR-DOMAIN.example.com/og-cover.png|$SITE/og-cover.png|g" "$OUT/index.html"
  echo "OG 地址已替换为 $SITE"
else
  echo "提示：未传站点 URL，og:url / og:image 仍是占位地址（不影响访问，只影响分享卡片缩略图）"
fi

echo "已生成 $OUT/index.html  ($(wc -c < "$OUT/index.html" | tr -d ' ') 字节)"
