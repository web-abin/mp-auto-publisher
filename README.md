# 微信公众号全自动发文 H5 后台

手机端 H5 后台，关键词一句话 → 挖掘热搜 → AI 写稿 → 自动配图 → 排版美化 → 推送到公众号草稿箱。

## 启动

```bash
cd mp-auto-publisher
npm install
npm start
# 默认端口 3030，访问 http://<服务器IP>:3030
```

如需改端口或密钥：

```bash
PORT=8080 ACCESS_KEY=AIZAOWUJINHUA npm start
```

## 登录

访问首页输入访问密钥：**`AIZAOWUJINHUA`**

## 使用步骤

1. **状态页**：复制公网 IP，去微信公众平台「开发 → 基本配置 → IP 白名单」加进去。
2. **配置页**：填好 APPID / AppSecret、AI Key（Anthropic 或 OpenAI 兼容接口）、图库 Key（Pexels / Pixabay / Unsplash 任选一个，不填用占位图）。
3. **生成页**：输入关键词 → 点「挖掘热搜」预览相关词 → 「生成并推送草稿」。AI 写完后自动搜图、上传素材、调用 `draft/add` 写入草稿箱，去公众号后台确认即可发布。
4. **定时页**：填关键词 + cron 表达式（带预设按钮）即可周期性自动发文，比如 `0 9 * * *` = 每天 9 点。

## 目录结构

```
mp-auto-publisher/
├── server.js            Express 服务、路由、定时调度
├── lib/
│   ├── store.js         JSON 文件存储
│   ├── wechat.js        微信 API（access_token / 素材 / 草稿）
│   ├── ai.js            AI 文章生成（Anthropic / OpenAI）
│   ├── trends.js        百度/微博热搜 + 关键词联想
│   ├── images.js        Pexels/Pixabay/Unsplash 配图
│   └── pipeline.js      关键词 → 草稿箱完整流程
├── public/              H5 前端
└── data/                运行时数据（自动生成）
```

## 注意

- 公众号 IP 白名单必须配置成本服务的公网 IP，否则 `access_token` 会拿不到。
- 文章正文中 `[IMG: 英文描述]` 会被 AI 自动标注，pipeline 会替换为真实图片并上传到微信。
- 内容生成 prompt 已要求规避政治敏感、医疗夸大、金融承诺等违规内容；上线前请人工抽检几篇。


pexles

杀死进程 lsof -i :3030 -t | xargs kill -9 2>/dev/null  