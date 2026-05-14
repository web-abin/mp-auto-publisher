# 部署到 Google Cloud Platform (e2-micro 永久免费)

Google Cloud 的「Always Free」给所有用户**永久免费** 1 台 e2-micro 实例（1 GB 内存 + 30 GB 硬盘 + 静态 IP），适合跑这个公众号自动发文项目。

**对比 Oracle Cloud 的优势**：
- 注册容易通过（Gmail 账号 + 信用卡 $1 预授权，反欺诈比 Oracle 宽松很多）
- 控制台 SSH 直接在浏览器里用，**不用配 SSH key**
- 注册不区分国家
- 永久免费 + 注册送 $300 美金 / 90 天试用额度

**对比 Oracle 的劣势**：
- e2-micro 只有 **1 GB 内存**（已通过 swap 解决，部署脚本自动加）
- 永久免费区域**仅限美国西/中/东部** → 国内访问延迟 ~150ms（浏览器后台用感受不强，但 SSH 操作会有点卡）
- $300 试用额度只能用于美国以外的资源，用完会到 Always Free 兜底

预估时间：**20–30 分钟**。

---

## 一、注册 GCP（5 分钟）

### 1.1 准备

| 必备 | 说明 |
|---|---|
| **Gmail 账号** | 强烈推荐用 Gmail，注册通过率最高（其它邮箱也行但容易卡） |
| **Visa / MasterCard 双币信用卡** | 不接受银联。预授权 $1，几天后退回 |
| **科学上网** | 注册页面 + 控制台在 google.com，国内裸连进不去 |

### 1.2 提交注册

1. 浏览器开 https://cloud.google.com → 右上角 **Get started for free**（中文：免费开始使用）
2. 用 Gmail 登录
3. 进入注册表单，**3 步搞定**：

#### 第 1 步：账户信息

| 字段 | 填什么 |
|---|---|
| Country | **United States** / **Singapore** / **Japan** 任选（这里不重要，只影响默认货币） |
| Tax Information | Individual |
| Account type | Individual |
| Name | 拼音 `Junbin Wang`（**和信用卡上一致**） |
| Address | 跟你信用卡账单地址一致即可，国内地址也能过：<br/>`Address line 1`: `Beijing Changping District`<br/>`City`: `Beijing`<br/>`Postal code`: 真实邮编<br/>`Phone`: +86 + 11 位手机号 |

#### 第 2 步：付款信息

| 字段 | 填什么 |
|---|---|
| Cardholder name | 卡上的拼音名 |
| Card number / Expiry / CVV | 真实信息 |
| Billing address | 默认 `Same as personal address` 即可 |

会预授权 **$1 美金**（约 ¥7），**几天后自动退回**，不会扣款。

### 1.3 点 **Start my free trial**

通常 **1 分钟内** 立刻激活（GCP 反欺诈比 Oracle 友好太多）。

激活成功跳转到 GCP Console (https://console.cloud.google.com)，左上角自动建好一个 `My First Project` 项目。

> ⚠️ **关键提醒**：GCP 默认开启了"试用结束后自动升级到付费账户"开关，**进入控制台后第一件事去 Billing 把它关掉**（Billing → Account management → 找到 "Upgrade" 或者直接不绑生产卡）。否则试用结束后可能开始按量扣费。

---

## 二、创建 e2-micro 永久免费实例（10 分钟）

### 2.1 启用 Compute Engine API

左上角汉堡菜单 → **Compute Engine** → **VM instances**。

首次进入会提示 "Enable Compute Engine API"，点 **Enable** 等 30 秒。

### 2.2 创建实例

点蓝色按钮 **CREATE INSTANCE**，按下表填：

| 字段 | 选择 | 说明 |
|---|---|---|
| **Name** | `mp-publisher` | 随意 |
| **Region** | `us-west1 (Oregon)` | **必须** 是 us-west1 / us-central1 / us-east1 之一，否则不算 Always Free |
| **Zone** | `us-west1-a` 或任意 | 随意 |
| **Machine configuration** | E2 | |
| **Machine type** | `e2-micro` | 关键，**必须** e2-micro 才永久免费 |
| **Boot disk** | 点 **CHANGE** → | 见下方 |
| **Firewall** | ☑ Allow HTTP traffic<br/>☑ Allow HTTPS traffic | 都勾上 |

**Boot disk 详细设置**：
- Operating system: **Ubuntu**
- Version: **Ubuntu 22.04 LTS**（**不要选 24.04**，部分包暂时不全）
- Boot disk type: **Standard persistent disk**（不要选 SSD，SSD 不在免费额度）
- Size: **30 GB**（免费上限，默认是 10 GB 必须改）

完成后页面底部会显示 **Monthly estimate**，应该显示 **$0.00 / month**（如果不是 $0，说明上面某个选项错了，比如选成了 SSD 或者非美国 region，回头检查）。

点 **CREATE**。30 秒后实例显示绿色 ✓，External IP 列里会有一个 IP，**先记一下**。

### 2.3 升级为静态 IP（让 IP 永久不变）

默认分配的是 **Ephemeral IP**，实例每次停机 IP 会变。升级为 Static 后**永久不变（免费，前提是绑定在运行中的实例上）**。

1. 顶部搜索栏搜 **IP addresses** → **VPC network → IP addresses**
2. 找到刚才那台机器的 External IP（**Type 列写着 Ephemeral**），点最右边的 **三点菜单 → Promote to static IP address**
3. 输入名字 `mp-publisher-ip`，点 RESERVE

完成后 Type 变成 **Static**，IP 不会再变。**这个 IP 就是要加进微信白名单的 IP**。

### 2.4 开放 3030 端口

GCP 的防火墙在 VPC 层（不是 VM 上的 iptables），需要单独加一条规则。

1. 顶部搜 **Firewall** → **VPC network → Firewall**
2. 点 **CREATE FIREWALL RULE**
3. 按下表填：

| 字段 | 填什么 |
|---|---|
| Name | `allow-3030` |
| Network | `default` |
| Direction of traffic | Ingress |
| Action on match | Allow |
| Targets | All instances in the network |
| Source filter | IPv4 ranges |
| Source IPv4 ranges | `0.0.0.0/0` |
| Protocols and ports | ☑ TCP → 输入 `3030` |

点 **CREATE**。

> 后面如果要用 Caddy 配域名 HTTPS，再加一条 80 + 443 的规则。

---

## 三、SSH 连接服务器（无需配 key，浏览器直接连）

回 **Compute Engine → VM instances**，找到 `mp-publisher` 那一行，点最右边的 **SSH** 按钮 → 弹出浏览器窗口，几秒后进入终端。

这是 GCP 最香的地方：**自动管理 SSH 密钥，零配置**。

> 如果想用本地 SSH 客户端：在 GCP Console → Compute Engine → Metadata → SSH Keys 添加你的本地公钥即可。

---

## 四、部署项目（5 分钟）

### 4.1 把代码弄上去

**方案 A（推荐）**：项目推到 GitHub 然后 git clone

在你本地把项目推到 GitHub（私有仓库即可）：

```bash
cd ~/mp-auto-publisher
git init && git add -A && git commit -m "init"
gh repo create mp-auto-publisher --private --source=. --push
# 或者去 github.com 手动建仓库再 git push
```

在服务器（GCP 浏览器 SSH）里：

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/<你的用户名>/mp-auto-publisher.git
cd mp-auto-publisher
```

私有仓库需要先生成 [Personal Access Token](https://github.com/settings/tokens) → clone 时 URL 写 `https://<token>@github.com/...`

**方案 B**：直接从本地上传（不用 GitHub）

GCP 浏览器 SSH 右上角齿轮图标 → **Upload file**，选择本地打好的 tar 包：

本地：
```bash
tar czf mp.tgz --exclude=node_modules --exclude=data/sessions.json mp-auto-publisher
```

上传后在服务器：
```bash
tar xzf mp.tgz && cd mp-auto-publisher
```

### 4.2 一键部署

```bash
ACCESS_KEY='你的强密码123' bash deploy/server-setup.sh
```

脚本会自动：

1. **加 2 GB swap**（e2-micro 1 GB 内存必须，否则跑 AI 接口时 OOM）
2. 装 Node 20 + pm2
3. `npm install`
4. iptables 放 3030（GCP 没用 iptables 但放着无害）
5. pm2 启动 + 开机自启

输出类似：

```
============================================
  ✓ 部署成功
--------------------------------------------
  公网 IP   : 34.123.45.67
  端口       : 3030
  访问地址   : http://34.123.45.67:3030
  登录密钥   : 你的强密码123
--------------------------------------------
```

---

## 五、把 IP 加进微信白名单

1. https://mp.weixin.qq.com 用**公众号管理员**身份登录
2. 左侧菜单底部 **设置与开发 → 开发 → 基本配置**
3. 下方「公众号开发信息」找到 **IP白名单 → 查看**
4. **管理员微信扫码确认**
5. 把上一步的 GCP 静态 IP 填进去（**只填 IPv4，一行一个**），保存

**以后这个 IP 永远不变，加这一次就行**。

---

## 六、浏览器登录使用

浏览器打开 `http://你的GCP静态IP:3030`：

1. 输入 **登录密钥**（部署脚本里的 ACCESS_KEY）
2. 进「配置」页填 APPID/AppSecret/AI Key/Pexels Key
3. 进「生成」页输关键词试一篇
4. 进「定时」页加 cron，比如 `0 9 * * *` 每天上午 9 点
5. 服务器 24×7 自动运行，按 cron 自动发到草稿箱

---

## 七、（可选）配域名 + HTTPS

用 IP 访问每次都要输端口很烦，也容易被浏览器警告。买个域名（阿里云万网 ¥9/年）配 Caddy 上 HTTPS：

### 7.1 域名解析

域名控制台加一条 **A 记录**：`mp` → 你的 GCP 静态 IP。

### 7.2 在 GCP 防火墙加 80/443

VPC network → Firewall → 编辑 `default-allow-http` 和 `default-allow-https` 已经创建好（创建实例时勾的）。**确认 Action 是 Allow，Source 是 0.0.0.0/0**。

### 7.3 装 Caddy（在服务器上）

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp ~/mp-auto-publisher/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
# 把 yourdomain.com 改成你的域名（如 mp.example.com），保存
sudo systemctl reload caddy
```

完成后访问 `https://mp.example.com` 即可，Caddy 自动申请 + 续期 Let's Encrypt 证书。

---

## 八、常用运维命令

```bash
# 看日志
pm2 logs mp-auto-publisher

# 重启
pm2 restart mp-auto-publisher

# 资源监控
pm2 monit

# 看 swap 使用率
free -h

# 拉新代码 + 重启
cd ~/mp-auto-publisher && git pull && npm install && pm2 restart mp-auto-publisher

# 改代码后一键重新部署（脚本是幂等的）
ACCESS_KEY='你的密码' bash deploy/server-setup.sh
```

---

## 九、监控免费额度（**重要！**）

GCP 免费额度有限，超出会从你 $300 试用额度扣（**扣完后才开始扣信用卡**）。要做的：

### 9.1 设预算告警

1. 顶部搜 **Billing → Budgets & alerts**
2. 点 **CREATE BUDGET**
3. Name: `Cost Alert`
4. Amount: `$1`（任何超出 $1 立刻邮件提醒）
5. Alerts: 勾 50% / 90% / 100% 三档都发邮件

这样**只要超出免费额度产生 $1 以上费用就会立刻告警**，不会突然欠一大笔。

### 9.2 注意这些会产生费用的行为

| 行为 | 是否免费 |
|---|---|
| e2-micro VM（us-west1 / us-central1 / us-east1）持续运行 | ✅ 永久免费 |
| 30 GB Standard persistent disk | ✅ 免费上限 30 GB |
| Static external IP 绑定在运行中的实例上 | ✅ 免费 |
| Static IP **没绑定到任何实例**（实例停机时） | ❌ 收费 $0.01/小时 |
| **出站流量到中国**（egress to China） | ❌ 收费 $0.23/GB（**这是大坑**） |
| 出站流量到其它地区 | ✅ 1 GB/月免费 |

> **「出站到中国收费」是 GCP 唯一的大坑**。你浏览器从中国访问后台 = 后台往中国发出站流量。
> - 单纯浏览器登录看后台日志：消耗几 MB 流量，扣几分钱
> - 但如果你大量下载 / 长期视频流：会爆量
>
> 这个项目主要是后台拉取微信 API + Pexels CDN + AI API（都是出站到美国/CDN），返回给浏览器的是几 KB 的 JSON，**月流量很小，正常使用不会超 1 GB**。

---

## 十、常见问题

### Q：访问 `http://IP:3030` 一直转圈

按顺序排查：

```bash
# 1. 服务在跑吗？
pm2 list
# 2. 端口在监听吗？
sudo ss -tlnp | grep 3030
# 3. GCP 防火墙规则加了吗？
# → 回 GCP Console → VPC network → Firewall 检查 allow-3030 这条规则
```

90% 是 **GCP Firewall 规则没加** 或者 **加错 network**。

### Q：1 GB 内存够吗？

够，但**勉强**。部署脚本自动加了 2 GB swap，AI 接口请求时如果短时间内存暴增会用 swap 兜底。
- 平时单用户使用：单进程 ~200 MB，远远够
- 同时跑多个定时任务：可能撞到 swap，速度变慢但不会崩
- **建议错峰**：cron 别同一时刻全跑（比如别全 `0 9 * * *`，改成 `0 9 * * *` + `30 9 * * *` 错开 30 分钟）

### Q：怎么确认我在跑「永久免费」资源

回 Billing → **Reports** 看费用图表，如果一直是 $0 就对了。

或者去 Console → 实例详情页，下方有个 "Hourly cost" 显示 $0.00 就证明免费。

### Q：90 天试用结束后会怎样

如果你没主动 "Upgrade to paid account"：
- 所有付费资源（非 e2-micro 的 VM、超出免费额度的硬盘等）会停止
- **Always Free 资源继续保留**（e2-micro + 30GB disk + 1 个 static IP）
- 项目继续跑，不影响

如果你升级了：
- 会按量扣费（Always Free 额度内仍然 $0，超出部分扣费）

**强烈建议：90 天到了别升级，让它自动降回 Always Free**。

### Q：实例被停了 / IP 变了

可能原因：
- 实例长时间 CPU 0% → 不会被停，这是 Oracle 的策略，GCP 没有
- 信用卡过期 / 余额不足 → 升级账户后才会因这个停
- 突然超额产生费用没付 → 升级账户后才会因这个停

**只要没主动升级到付费账户，免费实例不会被停**。

---

## 十一、数据备份建议

GCP e2-micro 的 30 GB Standard Disk 可靠性已经很高，但项目里的关键数据建议定期备份：

```bash
# 本地执行（每月一次）
gcloud compute scp --zone=us-west1-a mp-publisher:~/mp-auto-publisher/data ./backup-$(date +%Y%m%d) --recurse
```

或者更简单：在服务器上 `tar czf data.tgz data/` 然后从浏览器 SSH 的 **Download file** 下载。

需要备份的文件：

| 文件 | 内容 |
|---|---|
| `config.json` | APPID/Secret/AI Key 等 |
| `jobs.json` | 定时任务 |
| `history.json` | 发布历史 |
| `sessions.json` | 登录态 |
| `session-secret` | session 加密密钥（**别删**） |
