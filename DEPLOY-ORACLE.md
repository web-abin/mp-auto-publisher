# 部署到 Oracle Cloud Always Free 详细教程

把这个项目跑在甲骨文永久免费服务器上，**固定公网 IP + 永远在线 + node-cron 自动写文章**，全程不花一分钱。

预估时间：**30–40 分钟**（其中等审核/出货 ~10 分钟，实际操作 ~20 分钟）。

---

## 一、注册甲骨文云

### 1. 准备

- 一张 **Visa / MasterCard / 万事达** 信用卡（注册预授权约 ¥7，几天后退回，**不会扣款**）
- 一个邮箱（建议 Gmail / Outlook，QQ/163 偶尔过不了）
- **科学上网**（注册页面在国外，国内偶尔卡）

### 2. 注册（5 屏，按顺序）

打开 https://signup.cloud.oracle.com/

#### 🔵 第 1 屏：账户信息

页面只有 4 个字段 + 1 个验证码。

| 字段 | 填什么 |
|---|---|
| **开票国家/地区** | 推荐 **Singapore（新加坡）**，次选 **Japan**；**不要选 China**（限制多） |
| **名字（First name）** | 你名字拼音，如 `Junbin` |
| **姓氏（Last name）** | 姓拼音，如 `Wang` |
| **电子邮件** | 推荐 **Gmail / Outlook / iCloud**（QQ/163 偶尔被风控） |
| **我是真实访客** | 勾上 hCaptcha，做完点几张图的小游戏 |

点 **「验证我的电子邮件」** 按钮。

> ⚠️ **开票国家/地区一旦提交就改不了**，慎选。新加坡是综合最优解（资源多、限制少、登录稳）。

#### 🔵 第 2 屏：邮箱验证

去你刚填的邮箱收 Oracle 发来的「Verify your email address」邮件（一般几秒到 2 分钟，没收到看垃圾箱）。

点邮件里的 **Verify email** 蓝色按钮 → 自动跳回注册页继续。

> 没收到？回第 1 屏检查邮箱写对没有，或者换 Gmail。

#### 🔵 第 3 屏：账户设置（**两个一辈子改不了的字段**）

| 字段 | 填什么 |
|---|---|
| **云账户名（Cloud Account Name / Tenancy Name）** | 全英文/数字，**全球唯一**，如 `junbin-cloud`（**这就是以后你登录控制台用的 tenancy 名**） |
| **主区域（Home Region）** | 选 **Singapore (ap-singapore-1)**（如果你第 1 屏选了新加坡） |
| **新密码** | 至少 8 位，含大小写 + 数字 + 特殊字符，如 `Mp2026!Auto` |
| **确认密码** | 同上 |

> ⚠️ **Cloud Account Name 和 Home Region 都是终身不可改**。Tenancy 名建议简短全小写，Home Region 决定你的服务器在哪个机房。
>
> Region 对照（国内访问延迟）：
> - 🇸🇬 新加坡 ~80ms（**推荐**，ARM 容易抢）
> - 🇯🇵 东京 ~50ms
> - 🇯🇵 大阪 ~60ms（ARM 最容易抢）
> - 🇭🇰 香港 ~30ms（**ARM 几乎抢不到**）

点 **Continue**。

#### 🔵 第 4 屏：地址信息

按你**第 1 屏选的国家**对应填，**国家和地址必须匹配**否则会被拒。

##### 🇸🇬 新加坡（推荐组合）

| 字段 | 填什么 |
|---|---|
| 地址行 1 | `1 Marina Boulevard` |
| 地址行 2 | 留空 |
| 地址行 3 | 留空 |
| 城市 | `Singapore` |
| 省/州 | `Singapore` |
| 邮政编码 | `018989`（真实 CBD 邮编） |
| 电话国旗 | 🇸🇬 +65 |
| 电话号码 | **直接填你的中国手机号 11 位**（如 `13800138000`），不要加 0 / 空格 / 横杠。Oracle 短信通常能发到中国号 |

> 如果新加坡国旗 + 中国手机号收不到验证码（极少数），上 [5sim.net](https://5sim.net) 买个新加坡虚拟号（¥1-2），收完丢。

##### 🇯🇵 日本

| 字段 | 填什么 |
|---|---|
| 地址行 1 | `1-1-2 Marunouchi` |
| 城市 | `Chiyoda-ku` |
| 都道府县 | `Tokyo` |
| 邮编 | `100-0005` |
| 电话 | 🇯🇵 +81 + 中国手机号（同上） |

##### 🇨🇳 中国（**踩坑专区**）

| 字段 | 填什么 / 坑提示 |
|---|---|
| 地址行 1 | 真实区/街道，如 `昌平区` |
| 地址行 2 | 真实小区/楼号 |
| 城市 | **必须填英文 `Beijing`**，不能填"北京市"或"北京"（中文/带"市"都会被红框拒） |
| 省/直辖市 | 下拉选 `北京市 — Beijing Shi` |
| 邮政编码 | 真实邮编 |
| 电话国旗 | 🇨🇳 +86 |
| 电话号码 | **去掉所有前缀**，直接 11 位手机号 `13800138000` |

填完点 **Continue**，会发短信验证码。

#### 🔵 第 5 屏：付款验证（信用卡）

不是充值！只是验证身份，会预授权 ~¥7，几天后退回。

| 字段 | 填什么 |
|---|---|
| 卡类型 | Visa / MasterCard / JCB（**不接受银联**） |
| 持卡人姓名 | 拼音，跟卡上一致 |
| 卡号 / 有效期 / CVV | 真实信息 |
| 账单地址 | 默认勾「同地址信息」即可 |

**国内能用的卡**：中信、招行、华夏等任意一张带 **VISA** / **Master** 标的双币卡（不是普通银联卡）。
**卡上至少留 ¥50** 避免预授权失败被风控。

点 **Start my free trial**。

#### 🔵 第 6 屏：协议 + 提交

勾 **I agree to the terms** → **Complete Sign-Up**。

如果提示"信息正在处理中"就对了。

### 3. 等审核激活

#### 时间

- 顺利的话 **5 分钟到 2 小时** 收到「Your Oracle Cloud account is ready」邮件
- 慢的话 24 小时内
- **期间不要重复提交、不要重复注册**，会被风控直接拒掉

#### 收到激活邮件后

邮件里会包含：
- **Cloud Account Name (Tenancy)**：第 3 屏你填的 `junbin-cloud`
- **登录地址**：`https://cloud.oracle.com`
- **用户名**：你的邮箱
- **密码**：第 3 屏你设的

去 https://cloud.oracle.com 用这三个登录，进控制台就开始下一步（创建实例）。

#### 注册被拒怎么办

如果收到「Your Oracle account could not be activated」或者**提交时弹「抱歉，创建您的账户时出错」**，就是被风控拒了。这不是字段填错，是反欺诈系统拦截。

##### 按可能性排序的 4 大原因

###### ① IP 地理位置 ≠ 填写的国家（占 90%）

你国家选了 Singapore 但 IP 是中国 → 系统判你伪造 → 拒。

**解法**：
- 选了哪个国家就**挂梯子到哪个国家**的节点（推荐**个人自建小节点**，**不要**用 Astrill / NordVPN / 大型商业 VPN，这些 IP 段经常在 Oracle 黑名单）
- 实在没梯子 → 全用中国信息：Country=China + 真实中国地址 + +86 手机号 + 拼音名

###### ② 信用卡被发卡行风控

预授权 ~¥7 时**卡的发卡行直接拒了**（境外商户 + 跨境小额触发银行风控）。Oracle 表面只显示注册失败。

**解法**：
- 查信用卡 App 有没有「消费被拒」短信 / 推送，有的话**先打银行电话解锁**
- 换一张**不同银行**的 Visa / Master 双币卡再试
- **招行全币种 Visa**、**中信 i 白金** 是国内卡友实测过 Oracle 概率最高的
- 卡上保持 **¥200+** 余额

###### ③ 邮箱 / IP / 卡 之前注册过

只要试过一次失败，这组三元组会**临时拉黑 24-48 小时**。立刻重试还是失败。

**解法**：**等 24-48 小时**，且换**新邮箱** + **新卡**（IP 也尽量换梯子节点）。

###### ④ 浏览器指纹异常

广告拦截器、隐私插件、debug 工具会让 hCaptcha + Oracle fingerprint 把你判成 bot。

**解法**：
- 用**全新 Chrome 无痕窗口**（`Ctrl+Shift+N` / `Cmd+Shift+N`）
- 关掉所有翻译插件 / Adblock / Privacy Badger / 油猴
- hCaptcha 慢慢点，**不要太快**
- 填表慢慢填，每个字段停 1 秒，**不要复制粘贴整段**

##### 推荐的"重试成功配方"

被拒一次后**等 24 小时**再按这个组合来：

```
1. 挂梯子到新加坡 / 日本（个人节点最佳）；或者完全不挂梯子走中国
2. 注册新的 Gmail（gmail 比 outlook / qq 通过率高）
3. Chrome 无痕窗口，不装任何插件
4. 国家、地址、电话三个保持同一国：
   - 全新加坡组合：Country=SG / 地址=1 Marina Boulevard / 5sim 买 +65 号
   - 全中国组合：Country=CN / 真实地址 / 真实 +86 手机号
5. 信用卡换一张没在 Oracle 试过的（招行 / 中信双币）
6. 慢慢填、慢慢点验证码
7. 提交后不要刷新页面，等结果邮件
```

##### 实在过不了？

替代方案：
- **腾讯云 / 阿里云轻量学生机或新人首单**：¥99/年，国内访问飞快（不算永久免费，但很便宜）
- **Koyeb 免费层**：git push 部署，缺点是出口 IP 有 2-3 个要全加白名单

### 3. 等审核

注册完后会收到「Your account is being processed」邮件。通常 **5 分钟到 2 小时**激活，慢的话 24 小时内。期间不要重复注册。

---

## 二、创建 ARM 永久免费实例

### 1. 登录控制台

激活后登录 https://cloud.oracle.com → 用 **Tenancy Name + 用户名 + 密码** 登录（不是直接邮箱）。

### 2. 创建实例

左上角汉堡菜单 → **Compute** → **Instances** → 蓝色按钮 **Create instance**。

填写：

| 字段 | 选择 |
|---|---|
| **Name** | `mp-publisher`（随意） |
| **Image** | 点 Change → 选 **Canonical Ubuntu 22.04** |
| **Shape** | 点 Change → 切到 **Ampere** 标签 → 选 **VM.Standard.A1.Flex** |
| **OCPU** | 拉到 **4**（最大免费额度） |
| **Memory** | 拉到 **24 GB** |
| **Networking** | 默认即可，确认 **Assign a public IPv4** 是勾选的 |
| **SSH keys** | 选 **Generate a key pair** → **下载 private key 和 public key**（这一步只能下载一次，必须保存好） |
| **Boot volume** | 默认 47 GB 即可（最多免费 200 GB） |

点 **Create**。

### 3. 如果报「Out of capacity」怎么办

ARM 资源紧张时会报这个错。**解决办法**：
- 区域少的话切到 **大阪** / **首尔** / **新加坡** 试试（要在创建时切 Region，已注册账号没办法换 Home Region）
- 用一个开源脚本自动重试：https://github.com/hitrov/oci-arm-host-capacity（部署在自己的电脑上，每 5 分钟试一次，抢到立刻邮件通知）
- 凌晨 / 早上 6-8 点东京时间成功率高

---

## 三、网络配置（关键，少了任何一步都连不上）

### 1. 给实例绑定 Reserved Public IP（让 IP 永久不变）

默认给的 IP 是 ephemeral 的，实例重启 IP 会变。改成 Reserved 后永久不变（免费）。

- Compute → Instances → 点你的实例 → 下面 **Attached VNICs** → 点 VNIC 名字
- 左下 **IPv4 Addresses** → 三点菜单 → **Edit**
- Public IP Type 改成 **Reserved Public IP** → **Create new reserved public IP** → 命名后保存

记下这个 IP，后面要用。

### 2. 开放 3030 端口（VCN 安全列表）

- 顶部搜索栏搜 **VCN** → Networking → Virtual Cloud Networks → 进入唯一那个 VCN
- Subnets → 点子网名字 → Security Lists → **Default Security List**
- **Ingress Rules** → **Add Ingress Rules**
  - Source CIDR: `0.0.0.0/0`
  - IP Protocol: `TCP`
  - Destination Port Range: `3030`
  - Description: `mp-auto-publisher`
- Add Ingress Rules 保存

> 如果之后用 Caddy 配 HTTPS，再加一条 `80` 和 `443`。

---

## 四、SSH 连服务器

### Mac / Linux

```bash
# 把刚才下载的 private key 移到 ~/.ssh
mv ~/Downloads/ssh-key-2026-*.key ~/.ssh/oracle.key
chmod 600 ~/.ssh/oracle.key

# 登录（用刚才记的 Reserved Public IP）
ssh -i ~/.ssh/oracle.key ubuntu@<你的IP>
```

### Windows

用 PuTTY 或 Windows 10+ 的 OpenSSH：
```powershell
ssh -i C:\path\to\oracle.key ubuntu@<你的IP>
```

第一次连接确认 `yes`，进去后命令行变成 `ubuntu@mp-publisher:~$` 就对了。

---

## 五、部署项目

### 1. 把代码弄上去

**方案 A（推荐）**：项目推到 GitHub，服务器上 git clone

```bash
# 在你本地（不是服务器）把项目推到 GitHub
cd ~/mp-auto-publisher
git init && git add -A && git commit -m "init"
gh repo create mp-auto-publisher --private --source=. --push
# 或者：手动在 github.com 建仓库后 git push

# 在服务器上
sudo apt update && sudo apt install -y git
git clone https://github.com/<你的用户名>/mp-auto-publisher.git
cd mp-auto-publisher
```

**方案 B**：直接 scp 上传（本地执行）

```bash
# 在本地项目目录外面
tar czf mp.tgz --exclude=node_modules --exclude=data/sessions.json mp-auto-publisher
scp -i ~/.ssh/oracle.key mp.tgz ubuntu@<你的IP>:~/
# 在服务器上
ssh -i ~/.ssh/oracle.key ubuntu@<你的IP>
tar xzf mp.tgz && cd mp-auto-publisher
```

### 2. 一键部署

我已经准备好脚本，**进项目目录后执行**：

```bash
ACCESS_KEY='你的强密码123' bash deploy/server-setup.sh
```

脚本会：
1. 装 Node 20 + pm2
2. `npm install`
3. 放行 iptables 3030 端口
4. 用 pm2 启动并设置开机自启
5. 打印访问地址和登录密钥

完成后看到这种输出：

```
============================================
  ✓ 部署成功
--------------------------------------------
  公网 IP   : 132.226.x.x
  端口       : 3030
  访问地址   : http://132.226.x.x:3030
  登录密钥   : 你的强密码123
--------------------------------------------
```

---

## 六、把 IP 加进微信白名单

1. 浏览器 https://mp.weixin.qq.com 用 **公众号管理员** 身份登录
2. 左侧菜单底部 **设置与开发 → 开发 → 基本配置**
3. 下方「公众号开发信息」找到 **IP白名单 → 查看**
4. **管理员微信扫码确认**
5. 把上一步的公网 IP（`132.226.x.x`）填进去，**只填 IPv4，一行一个**，保存

几十秒后生效。**以后这个 IP 永远不变，加这一次即可。**

---

## 七、浏览器登录使用

浏览器打开 `http://你的IP:3030`：

1. 输入 **登录密钥**（部署脚本里的 ACCESS_KEY）
2. 进入「配置」页填：
   - 公众号 **APPID + AppSecret**
   - AI Provider + Key（DeepSeek/OpenAI 都行）
   - Pexels API Key
3. 进「生成」页输关键词试一篇，确认能推到草稿箱
4. 进「定时」页加 cron，比如：
   - `0 9 * * *` 每天上午 9 点
   - `0 9,18 * * *` 每天 9 点和 18 点各一篇
   - `0 10 * * 1-5` 工作日 10 点

加完 enable 一下，**服务器会自动按时生成文章并推送到公众号草稿箱**，你登微信公众平台直接点「群发」即可。

---

## 八、（可选）配域名 + HTTPS

不想每次输 IP:3030？买个域名（阿里云万网 ¥9/年起）配上 Caddy：

### 1. 域名解析

域名控制台加一条 **A 记录**：`mp` → 你的服务器 IP（生效 5–30 分钟）。

### 2. 装 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 3. 配 Caddy

```bash
sudo cp ~/mp-auto-publisher/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
# 把 yourdomain.com 改成你的域名（比如 mp.example.com），保存
sudo systemctl reload caddy
```

### 4. 放行 80 / 443 端口

- VCN Security List 加两条 Ingress：80、443
- 服务器上：`sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT && sudo netfilter-persistent save`

完成后访问 `https://mp.example.com` 就行，Caddy 自动申请并续期 Let's Encrypt 证书。

---

## 九、常用运维命令

```bash
# 看日志
pm2 logs mp-auto-publisher

# 重启
pm2 restart mp-auto-publisher

# 停止
pm2 stop mp-auto-publisher

# 看资源占用
pm2 monit

# 拉新代码 + 重启
cd ~/mp-auto-publisher && git pull && npm install && pm2 restart mp-auto-publisher

# 改代码后一键重新部署（脚本是幂等的）
ACCESS_KEY='你的密码' bash deploy/server-setup.sh
```

---

## 十、常见问题

### Q：访问 `http://IP:3030` 一直转圈/超时

按顺序排查：

```bash
# 1. 服务在跑吗？
pm2 list   # 看是不是 online
# 2. 端口在监听吗？
sudo ss -tlnp | grep 3030
# 3. iptables 放行了吗？
sudo iptables -L INPUT -n --line-numbers | grep 3030
# 4. VCN Security List 加了吗？（最容易忘）
# → 登 Oracle 控制台再核对一遍
```

90% 的"连不上"问题是 **VCN Security List 忘加**。

### Q：推送草稿报 40164 invalid ip

虽然 IP 加了白名单，但**复制 IP 时多了空格 / 多了 IPv6 / 加错公众号**。重新核对 IP，刷新页面再试。

### Q：实例被甲骨文回收了

Always Free 实例**长时间 0 流量**（连续 90 天）会被回收。**只要这个项目在跑就不会**。担心的话写个 cron 每周 ping 一下保活。

### Q：ARM 资源真的抢不到

退而求其次用 **2 个 x86 VM.Standard.E2.1.Micro**（1 OCPU + 1 GB），完全够跑这个项目，资源也很容易申请到。规格小一些但永久免费。

---

## 十一、改动留档

部署完后，所有生成的文章历史 / 配置 / session 都保存在服务器的 `~/mp-auto-publisher/data/` 目录下：

| 文件 | 内容 |
|---|---|
| `config.json` | APPID/Secret/AI Key 等配置 |
| `jobs.json` | 定时任务列表 |
| `history.json` | 历史发布记录 |
| `sessions.json` | 持久化登录态 |
| `session-secret` | 加密 session 的随机密钥（**别删**，删了所有人都被强制重登） |

**重要**：把 `data/` 目录定期备份（`scp -r ubuntu@IP:~/mp-auto-publisher/data ~/backup/`）。
