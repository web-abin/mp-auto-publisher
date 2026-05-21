#!/usr/bin/env bash
# 通用一键部署脚本
# 适用于：GCP / Oracle Cloud / 阿里云 / 腾讯云轻量
# 自适应：Ubuntu/Debian (apt) 与 OpenCloudOS/CentOS/RHEL/Tencent Linux (dnf/yum)
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

# 探测包管理器：apt(Debian/Ubuntu) 或 dnf/yum(RHEL/CentOS/OpenCloudOS/Tencent Linux)
if command -v apt-get >/dev/null 2>&1; then
  PKG="apt"
elif command -v dnf >/dev/null 2>&1; then
  PKG="dnf"
elif command -v yum >/dev/null 2>&1; then
  PKG="yum"
else
  echo "不支持的发行版：找不到 apt / dnf / yum" >&2
  exit 1
fi
echo "检测到包管理器：$PKG"

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
  if [ "$PKG" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    # RHEL 家族（OpenCloudOS / CentOS / Tencent Linux）：用 NodeSource RPM 源
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
    sudo "$PKG" install -y nodejs
  fi
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
if systemctl is-active --quiet firewalld 2>/dev/null; then
  # RHEL/OpenCloudOS：用 firewalld
  if ! sudo firewall-cmd --list-ports | grep -qw "${PORT}/tcp"; then
    sudo firewall-cmd --permanent --add-port="${PORT}/tcp"
    sudo firewall-cmd --reload
    echo "    firewalld 已放行端口 $PORT"
  else
    echo "    firewalld 中端口 $PORT 已放行"
  fi
else
  # Debian/Ubuntu：iptables（Oracle Ubuntu 的 INPUT 链默认有 REJECT，要插到顶部）
  if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp --dport "$PORT" -j ACCEPT
    if [ "$PKG" = "apt" ]; then
      if dpkg -l | grep -q iptables-persistent; then
        sudo netfilter-persistent save
      else
        sudo apt-get install -y iptables-persistent
      fi
    fi
    echo "    iptables 已放行端口 $PORT"
  else
    echo "    iptables 中端口 $PORT 已放行"
  fi
fi
warn "腾讯云/阿里云/Oracle 还需要在【云控制台】的【防火墙/安全组】里放行 TCP $PORT，否则外网仍然连不上"

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
  1. 【云控制台】防火墙/安全组放行 TCP $PORT（腾讯云轻量：实例详情→防火墙→添加规则）
  2. 登录 https://mp.weixin.qq.com
     → 设置与开发 → 开发 → 基本配置 → IP 白名单
     → 把 $PUB_IP 加进去（要管理员微信扫码）
  3. 浏览器打开访问地址，登录后到「配置」页填 AI Key / 公众号 Secret / Pexels Key
  4. 到「定时」页加 cron 表达式（如 0 9 * * * 每天 9 点）
     → 服务器 24h 在线，定时任务由 node-cron 自动触发，无需开你自己电脑
  5. pm2 logs mp-auto-publisher 查看运行日志
============================================
EOF
