const store = require('./store');

const API = 'https://api.weixin.qq.com/cgi-bin';

async function getAccessToken() {
  const cfg = store.getConfig();
  const appid = (cfg.appid || '').trim();
  const secret = (cfg.secret || '').trim();
  if (!appid || !secret) throw new Error('未配置 APPID/Secret');
  const cache = store.getTokenCache();
  if (cache.token && cache.expire > Date.now() + 60_000 && cache.appid === appid) {
    return cache.token;
  }
  const url = `${API}/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.access_token) {
    if (data.errcode === 40125) {
      throw new Error(`AppSecret 不正确（errcode 40125）。请到「微信公众平台 → 开发 → 基本配置」核对 AppSecret，或点「重置」生成新的，然后在配置页粘贴时注意别带空格/换行。`);
    }
    if (data.errcode === 40164 || data.errcode === 40137) {
      throw new Error(`服务器公网 IP 未加入白名单（errcode ${data.errcode}）。请到「微信公众平台 → 开发 → 基本配置 → IP 白名单」把状态页显示的公网 IP 加进去。`);
    }
    if (data.errcode === 40013) {
      throw new Error(`AppID 不正确（errcode 40013）。请到「微信公众平台 → 开发 → 基本配置」核对 AppID。`);
    }
    throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`);
  }
  store.setTokenCache({
    token: data.access_token,
    expire: Date.now() + (data.expires_in - 300) * 1000,
    appid,
  });
  return data.access_token;
}

function sniffImageType(buffer, filename = '') {
  const name = filename.toLowerCase();
  if (buffer && buffer.length >= 12) {
    const b = buffer;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { mime: 'image/gif', ext: 'gif' };
    if (b[0] === 0x42 && b[1] === 0x4d) return { mime: 'image/bmp', ext: 'bmp' };
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      return { mime: 'image/webp', ext: 'webp' };
    }
  }
  if (name.endsWith('.png')) return { mime: 'image/png', ext: 'png' };
  if (name.endsWith('.gif')) return { mime: 'image/gif', ext: 'gif' };
  if (name.endsWith('.bmp')) return { mime: 'image/bmp', ext: 'bmp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

function ensureSupportedForWechat({ mime, ext }) {
  // 微信素材 / 文中图支持：bmp / png / jpeg / jpg / gif
  if (mime === 'image/webp') {
    throw new Error('微信不支持 WebP 格式图片，请更换图源（Pexels 偶尔会返回 WebP，重试一次通常即可）');
  }
  return { mime, ext };
}

function buildForm(buffer, filename, mime) {
  if (!buffer || !buffer.length) throw new Error('图片数据为空，可能下载失败');
  const form = new FormData();
  const blob = new Blob([buffer], { type: mime });
  form.append('media', blob, filename);
  return form;
}

async function uploadImageMaterial(buffer, filename = 'cover.jpg') {
  const token = await getAccessToken();
  const { mime, ext } = ensureSupportedForWechat(sniffImageType(buffer, filename));
  const safeName = filename.replace(/\.[^./\\]+$/, '') + '.' + ext;
  const form = buildForm(buffer, safeName, mime);
  const url = `${API}/material/add_material?access_token=${token}&type=image`;
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json();
  if (data.errcode) throw new Error(`上传图片失败: ${JSON.stringify(data)}`);
  return { mediaId: data.media_id, url: data.url };
}

async function uploadContentImage(buffer, filename = 'inline.jpg') {
  const token = await getAccessToken();
  const { mime, ext } = ensureSupportedForWechat(sniffImageType(buffer, filename));
  const safeName = filename.replace(/\.[^./\\]+$/, '') + '.' + ext;
  const form = buildForm(buffer, safeName, mime);
  const url = `${API}/media/uploadimg?access_token=${token}`;
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json();
  if (data.errcode) throw new Error(`上传文中图失败: ${JSON.stringify(data)}`);
  return data.url;
}

async function addDraft({ title, content, author, digest, thumbMediaId, contentSourceUrl }) {
  const token = await getAccessToken();
  const url = `${API}/draft/add?access_token=${token}`;
  const body = {
    articles: [{
      title: title.slice(0, 64),
      author: author || '',
      digest: (digest || '').slice(0, 120),
      content,
      content_source_url: contentSourceUrl || '',
      thumb_media_id: thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    }],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: Buffer.from(JSON.stringify(body), 'utf8'),
  });
  const data = await res.json();
  if (data.errcode) throw new Error(`新增草稿失败: ${JSON.stringify(data)}`);
  return data.media_id;
}

module.exports = { getAccessToken, uploadImageMaterial, uploadContentImage, addDraft };
