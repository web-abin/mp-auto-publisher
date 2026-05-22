function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 把已经 escapeHtml 过的文本里的 markdown inline 语法转成 HTML
function processInline(escaped, theme) {
  let s = escaped
    // [text](url) → <a>
    .replace(/\[([^\]\n]+?)\]\(([^)\s]+?)\)/g, (_m, text, url) => `<a href="${url}" style="${theme.linkStyle}">${text}</a>`)
    // **bold**
    .replace(/\*\*([^*\n]+?)\*\*/g, `<strong style="${theme.strongStyle}">$1</strong>`)
    // *em*
    .replace(/(^|[^\*])\*([^\*\n]+?)\*(?!\*)/g, `$1<em style="${theme.emStyle}">$2</em>`)
    // `code`
    .replace(/`([^`\n]+?)`/g, '<code style="background:#f4f5f7;padding:1px 6px;border-radius:4px;font-size:.95em;font-family:Menlo,Consolas,monospace;">$1</code>');

  // 引号内容样式（保留引号字符本身，整体包一层 span）
  // 仅在主题定义了 quoteStyle 时启用；跳过英文单引号避免误伤 don't 之类的撇号
  if (theme.quoteStyle) {
    const qs = theme.quoteStyle;
    s = s
      // 中文双引号 "…"
      .replace(/“([^“”\n]+?)”/g, `<span style="${qs}">“$1”</span>`)
      // 中文单引号 '…'
      .replace(/‘([^‘’\n]+?)’/g, `<span style="${qs}">‘$1’</span>`)
      // 英文直引号 "…"（已被 escapeHtml 转成 &quot;）
      .replace(/&quot;([^\n]+?)&quot;/g, `<span style="${qs}">&quot;$1&quot;</span>`);
  }
  return s;
}

const THEMES = {
  'default-green': {
    label: '简约绿',
    desc: '公众号经典，绿色左侧条小标题',
    sectionStyle: `font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;padding:4px 2px;`,
    h3Style: `font-size:18px;font-weight:600;margin:24px 0 12px;color:#222;border-left:4px solid #07c160;padding-left:10px;`,
    pStyle: `font-size:16px;line-height:1.85;color:#333;margin:14px 0;text-indent:0;`,
    imgWrapStyle: `text-align:center;margin:18px 0;`,
    imgStyle: `max-width:100%;border-radius:8px;display:inline-block;`,
    placeholderStyle: `text-align:center;margin:18px 0;color:#aaa;padding:30px 16px;background:#f4f5f7;border:1px dashed #d0d3d8;border-radius:8px;font-size:13px;`,
    endStyle: `font-size:13px;color:#999;text-align:center;margin-top:30px;`,
    endText: '— END —',
    hrHtml: `<p style="text-align:center;margin:28px 0;line-height:1;"><span style="display:inline-block;width:48px;height:2px;background:#07c160;vertical-align:middle;border-radius:1px;"></span></p>`,
    strongStyle: `color:#07c160;font-weight:600;`,
    emStyle: `font-style:normal;color:#222;background:linear-gradient(transparent 60%,#c8f0d8 60%);padding:0 2px;`,
    ulStyle: `padding-left:1.5em;margin:14px 0;color:#333;`,
    olStyle: `padding-left:1.5em;margin:14px 0;color:#333;`,
    liStyle: `margin:6px 0;line-height:1.85;font-size:16px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;`,
    thStyle: `background:#f2f9f5;color:#07c160;padding:8px 10px;border:1px solid #d0e8d8;text-align:left;font-weight:600;`,
    tdStyle: `padding:8px 10px;border:1px solid #e6eeea;color:#333;`,
    linkStyle: `color:#07c160;border-bottom:1px solid #07c160;text-decoration:none;`,
    blockquoteStyle: `margin:18px 0;padding:12px 16px;background:#f2f9f5;border-left:4px solid #07c160;color:#3a3a3a;border-radius:0 6px 6px 0;font-size:15px;line-height:1.85;`,
    quoteStyle: `color:#07c160;background:#f2f9f5;padding:0 4px;border-radius:3px;font-weight:600;`,
  },
  'magazine': {
    label: '杂志衬线',
    desc: '衬线字体 + 米白底，复古杂志风',
    sectionStyle: `font-family:Georgia,'Source Han Serif SC','Songti SC',serif;padding:14px 12px;background:#f9f8f5;`,
    h3Style: `font-size:20px;font-weight:700;margin:28px 0 14px;color:#1a1a1a;border-bottom:2px solid #1a1a1a;padding-bottom:6px;display:inline-block;`,
    pStyle: `font-size:16px;line-height:1.95;color:#3a3a3a;margin:16px 0;text-indent:2em;`,
    imgWrapStyle: `text-align:center;margin:24px 0;`,
    imgStyle: `max-width:100%;border-radius:0;display:inline-block;box-shadow:0 6px 18px rgba(0,0,0,.12);`,
    placeholderStyle: `text-align:center;margin:24px 0;color:#aaa;padding:36px 16px;background:#fff;border:1px solid #ddd;font-size:13px;font-style:italic;`,
    endStyle: `font-size:12px;color:#999;text-align:center;margin-top:36px;letter-spacing:4px;`,
    endText: '· F I N ·',
    hrHtml: `<p style="text-align:center;margin:32px 0;line-height:1;color:#1a1a1a;letter-spacing:10px;font-size:14px;font-family:Georgia,'Source Han Serif SC','Songti SC',serif;">· · ·</p>`,
    strongStyle: `font-weight:700;color:#1a1a1a;`,
    emStyle: `font-style:italic;color:#1a1a1a;`,
    ulStyle: `padding-left:1.6em;margin:16px 0;color:#3a3a3a;`,
    olStyle: `padding-left:1.6em;margin:16px 0;color:#3a3a3a;`,
    liStyle: `margin:8px 0;line-height:1.95;font-size:16px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:22px 0;font-size:14.5px;font-family:Georgia,'Source Han Serif SC','Songti SC',serif;`,
    thStyle: `border-top:2px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:10px 8px;text-align:left;font-weight:700;color:#1a1a1a;`,
    tdStyle: `border-bottom:1px solid #d8d4c8;padding:10px 8px;color:#3a3a3a;`,
    linkStyle: `color:#1a1a1a;border-bottom:1px solid #1a1a1a;text-decoration:none;font-style:italic;`,
    blockquoteStyle: `margin:20px 0;padding:14px 18px;background:#f0ece1;border-left:4px solid #1a1a1a;color:#3a3a3a;font-style:italic;font-family:Georgia,'Source Han Serif SC','Songti SC',serif;font-size:15.5px;line-height:1.9;`,
    quoteStyle: `color:#1a1a1a;font-style:italic;font-family:Georgia,'Source Han Serif SC','Songti SC',serif;font-weight:700;`,
  },
  'tech-blue': {
    label: '科技蓝',
    desc: '蓝紫渐变小标题 + 圆角卡片图',
    sectionStyle: `font-family:-apple-system,'SF Pro Text','PingFang SC',sans-serif;padding:6px 2px;`,
    h3Style: `font-size:17px;font-weight:600;margin:26px 0 12px;color:#fff;background:linear-gradient(135deg,#4a6cff,#6c47ff);padding:8px 14px;border-radius:6px;display:inline-block;`,
    pStyle: `font-size:15.5px;line-height:1.85;color:#2a2a2a;margin:14px 0;text-indent:0;`,
    imgWrapStyle: `text-align:center;margin:20px 0;`,
    imgStyle: `max-width:100%;border-radius:12px;display:inline-block;box-shadow:0 4px 16px rgba(74,108,255,.18);`,
    placeholderStyle: `text-align:center;margin:20px 0;color:#7e8aff;padding:32px 16px;background:#f3f5ff;border:1px dashed #b6c2ff;border-radius:12px;font-size:13px;`,
    endStyle: `font-size:12px;color:#4a6cff;text-align:center;margin-top:32px;letter-spacing:2px;font-weight:600;`,
    endText: '/ / END / /',
    hrHtml: `<p style="text-align:center;margin:28px 0;line-height:1;"><span style="display:inline-block;width:140px;height:2px;background:linear-gradient(90deg,transparent,#4a6cff,#6c47ff,transparent);vertical-align:middle;"></span></p>`,
    strongStyle: `color:#4a6cff;font-weight:600;`,
    emStyle: `color:#6c47ff;font-style:normal;background:#f3f5ff;padding:0 4px;border-radius:3px;`,
    ulStyle: `padding-left:1.5em;margin:14px 0;`,
    olStyle: `padding-left:1.5em;margin:14px 0;`,
    liStyle: `margin:6px 0;line-height:1.85;font-size:15.5px;color:#2a2a2a;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border-radius:8px;overflow:hidden;`,
    thStyle: `background:linear-gradient(135deg,#4a6cff,#6c47ff);color:#fff;padding:10px 12px;text-align:left;font-weight:600;`,
    tdStyle: `padding:10px 12px;border-bottom:1px solid #e8ebff;color:#2a2a2a;background:#fafbff;`,
    linkStyle: `color:#4a6cff;text-decoration:none;border-bottom:1px dashed #4a6cff;`,
    blockquoteStyle: `margin:18px 0;padding:12px 16px;background:#f3f5ff;border-left:4px solid #4a6cff;color:#2a2a2a;border-radius:0 8px 8px 0;font-size:15px;line-height:1.85;`,
    quoteStyle: `color:#4a6cff;background:#f3f5ff;padding:0 5px;border-radius:4px;font-weight:600;`,
  },
  'warm': {
    label: '暖橙手记',
    desc: '米黄背景 + 棕色字 + 边框图片',
    sectionStyle: `font-family:'PingFang SC','Microsoft YaHei',sans-serif;padding:14px 12px;background:#fff8ee;border-radius:12px;`,
    h3Style: `font-size:17px;font-weight:600;margin:22px 0 12px;color:#a66200;border-bottom:2px dashed #e9b96e;padding-bottom:5px;display:inline-block;`,
    pStyle: `font-size:16px;line-height:1.9;color:#5a3f1e;margin:14px 0;text-indent:0;`,
    imgWrapStyle: `text-align:center;margin:20px 0;`,
    imgStyle: `max-width:100%;border-radius:8px;display:inline-block;border:4px solid #fff;box-shadow:0 0 0 1px #e9b96e;`,
    placeholderStyle: `text-align:center;margin:20px 0;color:#a98762;padding:30px 16px;background:#fff3d9;border:1px dashed #d6b070;border-radius:8px;font-size:13px;`,
    endStyle: `font-size:13px;color:#a98762;text-align:center;margin-top:30px;font-style:italic;`,
    endText: '✿ 写完了 ✿',
    hrHtml: `<p style="text-align:center;margin:26px 0;line-height:1;"><span style="display:inline-block;width:60px;border-top:1px dashed #c89b54;vertical-align:middle;"></span></p>`,
    strongStyle: `color:#a66200;font-weight:600;`,
    emStyle: `color:#5a3f1e;background:#ffe9c8;padding:0 4px;border-radius:3px;font-style:normal;`,
    ulStyle: `padding-left:1.5em;margin:14px 0;color:#5a3f1e;`,
    olStyle: `padding-left:1.5em;margin:14px 0;color:#5a3f1e;`,
    liStyle: `margin:6px 0;line-height:1.9;font-size:16px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:20px 0;font-size:14.5px;`,
    thStyle: `background:#fff3d9;color:#a66200;padding:9px 12px;border:1px dashed #e9b96e;text-align:left;font-weight:600;`,
    tdStyle: `padding:9px 12px;border:1px dashed #e9b96e;color:#5a3f1e;`,
    linkStyle: `color:#a66200;border-bottom:1px dashed #a66200;text-decoration:none;`,
    blockquoteStyle: `margin:18px 0;padding:12px 16px;background:#fff3d9;border-left:4px solid #c89b54;color:#5a3f1e;border-radius:0 8px 8px 0;font-size:15px;line-height:1.9;`,
    quoteStyle: `color:#a66200;background:#ffe9c8;padding:0 5px;border-radius:4px;font-weight:600;`,
  },
  'minimal': {
    label: '极简留白',
    desc: '黑白极简 + 大行距，专注内容',
    sectionStyle: `font-family:-apple-system,'PingFang SC',sans-serif;padding:8px 4px;`,
    h3Style: `font-size:19px;font-weight:600;margin:32px 0 14px;color:#000;border-bottom:1px solid #000;padding-bottom:8px;`,
    pStyle: `font-size:16px;line-height:1.95;color:#1a1a1a;margin:18px 0;text-indent:0;letter-spacing:0.2px;`,
    imgWrapStyle: `text-align:center;margin:24px 0;`,
    imgStyle: `max-width:100%;display:inline-block;`,
    placeholderStyle: `text-align:center;margin:24px 0;color:#bbb;padding:30px 16px;background:#fafafa;border:1px solid #eee;font-size:13px;`,
    endStyle: `font-size:12px;color:#bbb;text-align:center;margin-top:40px;letter-spacing:6px;`,
    endText: 'END',
    hrHtml: `<p style="text-align:center;margin:36px 0;line-height:1;"><span style="display:inline-block;width:32px;height:1px;background:#000;vertical-align:middle;"></span></p>`,
    strongStyle: `font-weight:700;color:#000;`,
    emStyle: `font-style:normal;color:#000;border-bottom:1px solid #000;`,
    ulStyle: `padding-left:1.4em;margin:18px 0;`,
    olStyle: `padding-left:1.4em;margin:18px 0;`,
    liStyle: `margin:8px 0;line-height:1.95;font-size:16px;color:#1a1a1a;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:22px 0;font-size:14.5px;`,
    thStyle: `border-top:1px solid #000;border-bottom:1px solid #000;padding:10px 8px;text-align:left;font-weight:600;color:#000;`,
    tdStyle: `border-bottom:1px solid #eee;padding:10px 8px;color:#1a1a1a;`,
    linkStyle: `color:#000;border-bottom:1px solid #000;text-decoration:none;`,
    blockquoteStyle: `margin:22px 0;padding:14px 18px;background:#fafafa;border-left:3px solid #000;color:#1a1a1a;font-size:15.5px;line-height:1.95;`,
    quoteStyle: `color:#000;font-weight:700;border-bottom:1px solid #000;`,
  },
  'xhs': {
    label: '小红书种草',
    desc: '米白底 + 粉色重点，emoji 友好',
    sectionStyle: `font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;padding:14px 14px;background:#fff7f5;border-radius:14px;`,
    h3Style: `font-size:17px;font-weight:700;margin:24px 0 12px;color:#222;padding:6px 12px;background:linear-gradient(90deg,#ffd6e0,#fff);border-radius:8px;display:inline-block;`,
    pStyle: `font-size:15.5px;line-height:1.85;color:#3d2a2a;margin:12px 0;text-indent:0;`,
    imgWrapStyle: `text-align:center;margin:18px 0;`,
    imgStyle: `max-width:100%;border-radius:14px;display:inline-block;box-shadow:0 4px 18px rgba(255,120,140,.16);`,
    placeholderStyle: `text-align:center;margin:18px 0;color:#d27b8a;padding:30px 16px;background:#fff0f3;border:1px dashed #f4b9c5;border-radius:14px;font-size:13px;`,
    endStyle: `font-size:13px;color:#e85777;text-align:center;margin-top:28px;font-weight:500;`,
    endText: '✨ 喜欢就点个赞吧 ✨',
    hrHtml: `<p style="text-align:center;margin:24px 0;line-height:1;color:#e85777;letter-spacing:8px;font-size:14px;">♡&nbsp;♡&nbsp;♡</p>`,
    strongStyle: `color:#e85777;font-weight:700;`,
    emStyle: `color:#fff;background:#ff8aa3;padding:1px 6px;border-radius:8px;font-style:normal;`,
    ulStyle: `padding-left:1.5em;margin:14px 0;color:#3d2a2a;`,
    olStyle: `padding-left:1.5em;margin:14px 0;color:#3d2a2a;`,
    liStyle: `margin:8px 0;line-height:1.85;font-size:15.5px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;border-radius:12px;overflow:hidden;background:#fff;`,
    thStyle: `background:linear-gradient(90deg,#ffd6e0,#fff);color:#e85777;padding:10px 12px;text-align:left;font-weight:700;`,
    tdStyle: `padding:10px 12px;border-top:1px solid #ffe4ea;color:#3d2a2a;`,
    linkStyle: `color:#e85777;text-decoration:none;border-bottom:1px solid #ffb6c8;`,
    blockquoteStyle: `margin:18px 0;padding:12px 16px;background:#fff0f3;border-left:4px solid #ff8aa3;color:#3d2a2a;border-radius:0 12px 12px 0;font-size:15px;line-height:1.85;`,
    quoteStyle: `color:#e85777;background:#fff0f3;padding:0 6px;border-radius:6px;font-weight:700;`,
  },
  'kol-bigtext': {
    label: '干货大V',
    desc: '加粗大字号正文 + 红色重点块，公众号高赞文常用',
    sectionStyle: `font-family:'PingFang SC','Microsoft YaHei',sans-serif;padding:6px 2px;`,
    h3Style: `font-size:19px;font-weight:700;margin:30px 0 14px;color:#fff;background:#e64340;padding:8px 16px;border-radius:4px;display:inline-block;letter-spacing:1px;`,
    pStyle: `font-size:17px;line-height:1.9;color:#222;margin:16px 0;text-indent:0;font-weight:500;`,
    imgWrapStyle: `text-align:center;margin:22px 0;`,
    imgStyle: `max-width:100%;border-radius:6px;display:inline-block;`,
    placeholderStyle: `text-align:center;margin:22px 0;color:#aaa;padding:32px 16px;background:#fff5f4;border:1px dashed #f3c1bf;border-radius:6px;font-size:13px;`,
    endStyle: `font-size:14px;color:#e64340;text-align:center;margin-top:32px;font-weight:600;letter-spacing:3px;`,
    endText: '◤  全 文 完  ◢',
    hrHtml: `<p style="text-align:center;margin:30px 0;line-height:1;"><span style="display:inline-block;width:48px;height:4px;background:#e64340;vertical-align:middle;border-radius:2px;"></span></p>`,
    strongStyle: `color:#e64340;font-weight:700;background:#fff5f4;padding:0 4px;`,
    emStyle: `color:#e64340;font-weight:600;font-style:normal;`,
    ulStyle: `padding-left:1.5em;margin:16px 0;`,
    olStyle: `padding-left:1.5em;margin:16px 0;`,
    liStyle: `margin:10px 0;line-height:1.9;font-size:17px;color:#222;font-weight:500;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:20px 0;font-size:15px;`,
    thStyle: `background:#e64340;color:#fff;padding:10px 12px;text-align:left;font-weight:700;`,
    tdStyle: `padding:10px 12px;border:1px solid #f3c1bf;color:#222;font-weight:500;`,
    linkStyle: `color:#e64340;font-weight:600;text-decoration:none;border-bottom:2px solid #e64340;`,
    blockquoteStyle: `margin:18px 0;padding:14px 18px;background:#fff5f4;border-left:4px solid #e64340;color:#222;border-radius:0 4px 4px 0;font-size:16px;line-height:1.9;font-weight:500;`,
    quoteStyle: `color:#e64340;background:#fff5f4;padding:0 5px;font-weight:700;`,
  },
  'finance-blue': {
    label: '财经数据',
    desc: '深蓝标题 + 数字醒目，适合财经/科技分析',
    sectionStyle: `font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;padding:6px 2px;`,
    h3Style: `font-size:17px;font-weight:600;margin:26px 0 12px;color:#1a3a8f;border-left:6px solid #1a3a8f;padding:4px 0 4px 12px;background:linear-gradient(90deg,#eef2fb,transparent);`,
    pStyle: `font-size:15.5px;line-height:1.85;color:#2a2a2a;margin:14px 0;text-indent:0;`,
    imgWrapStyle: `text-align:center;margin:20px 0;`,
    imgStyle: `max-width:100%;border-radius:4px;display:inline-block;border:1px solid #e0e4ec;`,
    placeholderStyle: `text-align:center;margin:20px 0;color:#7588b8;padding:30px 16px;background:#f4f6fb;border:1px dashed #c8d2e8;border-radius:4px;font-size:13px;`,
    endStyle: `font-size:12px;color:#1a3a8f;text-align:center;margin-top:32px;letter-spacing:2px;font-weight:600;border-top:1px solid #1a3a8f;padding-top:10px;display:inline-block;`,
    endText: '— 数据说话，仅供参考 —',
    hrHtml: `<p style="text-align:center;margin:26px 0;line-height:1;"><span style="display:inline-block;width:72px;height:1px;background:#1a3a8f;vertical-align:middle;"></span></p>`,
    strongStyle: `color:#1a3a8f;font-weight:700;`,
    emStyle: `color:#1a3a8f;background:#eef2fb;padding:0 4px;font-style:normal;`,
    ulStyle: `padding-left:1.5em;margin:14px 0;color:#2a2a2a;`,
    olStyle: `padding-left:1.5em;margin:14px 0;color:#2a2a2a;`,
    liStyle: `margin:6px 0;line-height:1.85;font-size:15.5px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;`,
    thStyle: `background:#1a3a8f;color:#fff;padding:10px 12px;text-align:left;font-weight:600;`,
    tdStyle: `padding:9px 12px;border-bottom:1px solid #e0e4ec;color:#2a2a2a;`,
    linkStyle: `color:#1a3a8f;text-decoration:none;border-bottom:1px solid #1a3a8f;`,
    blockquoteStyle: `margin:18px 0;padding:12px 16px;background:#eef2fb;border-left:4px solid #1a3a8f;color:#2a2a2a;font-size:15px;line-height:1.85;`,
    quoteStyle: `color:#1a3a8f;background:#eef2fb;padding:0 5px;font-weight:700;`,
  },
  'emotion-soft': {
    label: '情感柔和',
    desc: '米黄 + 引号装饰，适合情感故事',
    sectionStyle: `font-family:'PingFang SC','Source Han Serif SC','Songti SC',serif;padding:16px 14px;background:#fdf9f0;`,
    h3Style: `font-size:18px;font-weight:600;margin:28px auto 14px;color:#5c4a36;text-align:center;padding:6px 16px;display:block;border-top:1px solid #d4c1a3;border-bottom:1px solid #d4c1a3;`,
    pStyle: `font-size:16px;line-height:2.0;color:#4a3a2a;margin:16px 0;text-indent:2em;letter-spacing:0.5px;`,
    imgWrapStyle: `text-align:center;margin:22px 0;`,
    imgStyle: `max-width:100%;border-radius:0;display:inline-block;border:6px solid #fff;box-shadow:0 4px 12px rgba(140,100,60,.18);`,
    placeholderStyle: `text-align:center;margin:22px 0;color:#a89478;padding:32px 16px;background:#faf3e2;border:1px dashed #d4c1a3;font-size:13px;font-style:italic;`,
    endStyle: `font-size:13px;color:#a89478;text-align:center;margin-top:32px;font-style:italic;`,
    endText: '❀ 愿你被温柔以待 ❀',
    hrHtml: `<p style="text-align:center;margin:30px 0;line-height:1;color:#a89478;letter-spacing:10px;font-size:14px;font-style:italic;font-family:'Source Han Serif SC','Songti SC',serif;">❀&nbsp;❀&nbsp;❀</p>`,
    strongStyle: `color:#8b6b47;font-weight:600;`,
    emStyle: `color:#8b6b47;font-style:italic;`,
    ulStyle: `padding-left:1.6em;margin:16px 0;color:#4a3a2a;`,
    olStyle: `padding-left:1.6em;margin:16px 0;color:#4a3a2a;`,
    liStyle: `margin:8px 0;line-height:2.0;font-size:16px;`,
    tableStyle: `width:100%;border-collapse:collapse;margin:22px 0;font-size:14.5px;font-family:'Source Han Serif SC','Songti SC',serif;`,
    thStyle: `border-top:1px solid #d4c1a3;border-bottom:1px solid #d4c1a3;padding:10px 12px;text-align:left;color:#5c4a36;font-weight:600;`,
    tdStyle: `border-bottom:1px solid #ede0c8;padding:10px 12px;color:#4a3a2a;`,
    linkStyle: `color:#8b6b47;border-bottom:1px solid #8b6b47;text-decoration:none;font-style:italic;`,
    blockquoteStyle: `margin:22px 0;padding:14px 18px;background:#faf3e2;border-left:3px solid #8b6b47;color:#4a3a2a;font-style:italic;font-family:'Source Han Serif SC','Songti SC',serif;font-size:15.5px;line-height:2.0;`,
    quoteStyle: `color:#8b6b47;font-style:italic;font-family:'Source Han Serif SC','Songti SC',serif;font-weight:600;`,
  },
};

const DEFAULT_THEME = 'default-green';

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function isTableBlock(lines) {
  if (lines.length < 2) return false;
  if (!/^\|.*\|$/.test(lines[0])) return false;
  // 分隔行：只含 | - : 和空白，且至少一个 -
  const sep = lines[1];
  return /^\|?[\s\-:|]+\|?$/.test(sep) && sep.includes('-');
}

function renderTable(lines, theme) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const thead = `<thead><tr>${headers.map(h => `<th style="${theme.thStyle}">${processInline(escapeHtml(h), theme)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td style="${theme.tdStyle}">${processInline(escapeHtml(c), theme)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table style="${theme.tableStyle}" cellspacing="0" cellpadding="0">${thead}${tbody}</table>`;
}

function renderBody(body, imgUrlMap = {}, themeName = DEFAULT_THEME) {
  const theme = THEMES[themeName] || THEMES[DEFAULT_THEME];
  const blocks = String(body || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const html = [];
  const hrFallback = `<p style="text-align:center;margin:28px 0;line-height:1;"><span style="display:inline-block;width:48px;height:1px;background:#ccc;vertical-align:middle;"></span></p>`;
  for (const blk of blocks) {
    if (/^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(blk)) {
      html.push(theme.hrHtml || hrFallback);
      continue;
    }
    const m = blk.match(/^\[IMG:\s*(.+?)\]$/i);
    if (m) {
      const desc = m[1].trim();
      const isUrl = /^https?:\/\//i.test(desc);
      const url = imgUrlMap[desc] || (isUrl ? desc : null) || imgUrlMap.__cover;
      if (url) {
        html.push(`<p style="${theme.imgWrapStyle}"><img src="${url}" style="${theme.imgStyle}"/></p>`);
      } else {
        html.push(`<p style="${theme.placeholderStyle}">📷 配图加载中… <span style="opacity:.6;">${escapeHtml(desc)}</span></p>`);
      }
      continue;
    }

    const lines = blk.split('\n').map(s => s.trim()).filter(Boolean);

    // 表格
    if (isTableBlock(lines)) {
      html.push(renderTable(lines, theme));
      continue;
    }

    // 引用块：所有行均为 > 开头（包括 `>` 单独成行的空段落分隔）
    if (lines.length > 0 && lines.every(l => /^>/.test(l))) {
      const innerLines = lines.map(l => l.replace(/^>\s?/, ''));
      const paragraphs = [];
      let cur = [];
      for (const l of innerLines) {
        if (l) cur.push(l);
        else if (cur.length) { paragraphs.push(cur); cur = []; }
      }
      if (cur.length) paragraphs.push(cur);
      const inner = paragraphs.map((p, i) => {
        const mb = i === paragraphs.length - 1 ? '0' : '10px';
        const lineHtml = p.map(line => processInline(escapeHtml(line), theme)).join('<br/>');
        return `<p style="margin:0 0 ${mb};">${lineHtml}</p>`;
      }).join('');
      html.push(`<blockquote style="${theme.blockquoteStyle}">${inner}</blockquote>`);
      continue;
    }

    // 无序列表：所有行均为 - / * / + 开头
    if (lines.length > 0 && lines.every(l => /^[\-\*\+]\s+\S/.test(l))) {
      const items = lines.map(l => l.replace(/^[\-\*\+]\s+/, ''))
        .map(t => `<li style="${theme.liStyle}">${processInline(escapeHtml(t), theme)}</li>`).join('');
      html.push(`<ul style="${theme.ulStyle}">${items}</ul>`);
      continue;
    }

    // 有序列表：所有行均为 1. / 2) 开头
    if (lines.length > 0 && lines.every(l => /^\d+[\.\)]\s+\S/.test(l))) {
      const items = lines.map(l => l.replace(/^\d+[\.\)]\s+/, ''))
        .map(t => `<li style="${theme.liStyle}">${processInline(escapeHtml(t), theme)}</li>`).join('');
      html.push(`<ol style="${theme.olStyle}">${items}</ol>`);
      continue;
    }

    const sub = blk.match(/^#+\s*(.+)$/);
    if (sub) {
      html.push(`<h3 style="${theme.h3Style}">${processInline(escapeHtml(sub[1]), theme)}</h3>`);
      continue;
    }
    // 整段是 **xxx** 的（AI 常用来当小标题）→ 渲染成 h3
    const boldHeading = blk.match(/^\*\*([^*\n]+?)\*\*\s*$/);
    if (boldHeading) {
      html.push(`<h3 style="${theme.h3Style}">${processInline(escapeHtml(boldHeading[1]), theme)}</h3>`);
      continue;
    }
    const inlineProcessed = processInline(escapeHtml(blk), theme).replace(/\n/g, '<br/>');
    html.push(`<p style="${theme.pStyle}">${inlineProcessed}</p>`);
  }
  return `<section style="${theme.sectionStyle}">${html.join('')}<p style="${theme.endStyle}">${theme.endText}</p></section>`;
}

function listThemes() {
  return Object.entries(THEMES).map(([key, t]) => ({ key, label: t.label, desc: t.desc }));
}

module.exports = { THEMES, renderBody, listThemes, DEFAULT_THEME };
