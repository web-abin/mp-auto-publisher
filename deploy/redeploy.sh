#!/usr/bin/env bash
# 服务器一键重新部署：拉最新代码 + 重启 pm2。
# 国内服务器走 gh-proxy 镜像，避开 GitHub 直连不稳定的问题。
# 用法：bash ~/mp-auto-publisher/deploy/redeploy.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR_URL="https://gh-proxy.com/https://github.com/web-abin/mp-auto-publisher.git"
BRANCH="main"
PM2_APP="mp-auto-publisher"

cd "$REPO_DIR"

echo "==> 当前目录: $REPO_DIR"
echo "==> 当前 commit: $(git rev-parse --short HEAD)"

echo "==> 拉取最新代码（镜像: $MIRROR_URL）"
git pull "$MIRROR_URL" "$BRANCH"

echo "==> 最新 commit: $(git rev-parse --short HEAD)"

echo "==> 重启 pm2 应用: $PM2_APP"
pm2 restart "$PM2_APP" --update-env

echo "==> 部署完成 ✓"
pm2 status "$PM2_APP" | tail -n 3
