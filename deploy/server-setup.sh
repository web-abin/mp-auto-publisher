#!/usr/bin/env bash
# 通用 Ubuntu / Debian 一键部署脚本
# 适用于：GCP e2-micro / Oracle Cloud / 阿里云 / 腾讯云 / 任何 Ubuntu 20+/22.04
# 用法：在服务器上 cd 到项目根目录，然后执行：
#   ACCESS_KEY='你的强密码' bash deploy/server-setup.sh
#
# 脚本是幂等的，重复执行不会出错；新版代码 pull 下来后再跑一次即可。
# 1 GB 内存的机器（GCP e2-micro 等）会自动加 2GB swap。
set -euo pipefail

PORT="${PORT:-3030}"
ACCESS_KEY="${ACCESS_KEY:-AIZAOWUJINHUA}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf "\n\033[1;32m==> %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m!!  %s\033[0m\n" "$*"; }

# ---------- 0. 小内存机器自动加 swap（GCP e2-micro / 树莓派必备） ----------
log "0/6 检查 swap"
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$MEM_MB" -lt 2000 ] && [ "$SWAP_MB" -lt 1500 ]; then
  if [ ! -f /swapfile ]; then
    log "    内存 ${MEM_MB}MB 较小，创建 2GB swapfile"
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    fi
    echo "    swap 已启用"
  else
    sudo swapon /swapfile 2>/dev/null || true
    echo "    /swapfile 已存在"
  fi
else
  echo "    内存 ${MEM_MB}MB / swap ${SWAP_MB}MB，无需添加"
fi

# ---------- 1. 装 Node 20 + pm2 ----------
log "1/6 检查 Node.js ..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  log "    安装 Node 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "    Node $(node -v) 已就绪"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "    安装 pm2"
  sudo npm install -g pm2
else
  echo "    pm2 $(pm2 -v) 已就绪"
fi

# ---------- 2. 装项目依赖 ----------
log "2/6 安装项目依赖"
cd "$PROJECT_DIR"
npm install --omit=dev || npm install

# ---------- 3. 开端口 ----------
log "3/6 放行防火墙 TCP $PORT"
# Oracle Ubuntu 默认 iptables INPUT 链有 REJECT 规则，必须插到顶部
if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport "$PORT" -j ACCEPT
  if dpkg -l | grep -q iptables-persistent; then
    sudo netfilter-persistent save
  else
    sudo apt-get install -y iptables-persistent
  fi
  echo "    已放行端口 $PORT"
else
  echo "    端口 $PORT 已经放行"
fi

# ---------- 4. 启动 / 重启 pm2 ----------
log "4/6 启动 pm2"
export ACCESS_KEY PORT
pm2 startOrReload "$PROJECT_DIR/deploy/ecosystem.config.js" --update-env
pm2 save

# 开机自启（首次需要执行 sudo，已经设过的会无害重复）
SU_LINE=$(pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 || true)
if [[ "$SU_LINE" == sudo* ]]; then
  eval "$SU_LINE"
fi

# ---------- 5. 输出信息 ----------
PUB_IP=$(curl -s --max-time 4 https://api.ipify.org || echo "<找不到公网IP>")

log "5/6 完成"
cat <<EOF

============================================
  ✓ 部署成功
--------------------------------------------
  公网 IP   : $PUB_IP
  端口       : $PORT
  访问地址   : http://$PUB_IP:$PORT
  登录密钥   : $ACCESS_KEY
--------------------------------------------
  下一步：
  1. 登录 https://mp.weixin.qq.com
     → 设置与开发 → 开发 → 基本配置 → IP 白名单
     → 把 $PUB_IP 加进去（要管理员微信扫码）
  2. 浏览器打开访问地址，登录后到「配置」页填 AI Key / 公众号 Secret / Pexels Key
  3. 到「定时」页加 cron 表达式（如 0 9 * * * 每天 9 点）
  4. pm2 logs mp-auto-publisher 查看运行日志
============================================
EOF
