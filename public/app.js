const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function toast(msg, ms = 1800) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), ms);
}
async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  if (r.status === 401) { location.href = '/'; throw new Error('unauthorized'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// === Tabs ===
$$('.tabbar .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target;
    $$('.tabbar .tab').forEach(x => x.classList.toggle('active', x === tab));
    $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === target));
    if (target === 'status') loadStatus();
    if (target === 'config') loadConfig();
    if (target === 'cron') loadJobs();
    if (target === 'history') loadHistory();
  });
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/';
});

// === Status ===
async function loadStatus() {
  try {
    const s = await api('/api/status');
    $('#publicIp').textContent = s.publicIp || '获取失败';
    $('#publicIp').onclick = () => {
      if (s.publicIp) {
        navigator.clipboard?.writeText(s.publicIp).then(() => toast('已复制 IP'));
      }
    };
    $('#localIps').textContent = (s.localIps || []).join(' / ') || '无';
    $('#hostname').textContent = s.hostname;
    $('#sys').textContent = `${s.platform} · Node ${s.nodeVersion}`;
    $('#ipBadge').textContent = s.publicIp ? '在线' : '离线';
    $('#ipBadge').style.background = s.publicIp ? '#07c160' : '#aaa';

    $('#cfgAppid').textContent = s.accountCount ? `${s.accountCount} 个 ✓` : '未配置';
    $('#cfgAppid').className = 'v ' + (s.accountCount ? 'ok' : 'warn');
    $('#cfgAi').textContent = s.aiConfigured ? '已配置 ✓' : '未配置';
    $('#cfgAi').className = 'v ' + (s.aiConfigured ? 'ok' : 'warn');
    $('#cfgImg').textContent = (s.imageSources && s.imageSources.length)
      ? s.imageSources.join(' + ')
      : '默认占位图';
    $('#cfgJobs').textContent = `${s.jobCount} 个`;
  } catch (e) { toast(e.message); }
}

// === Config ===
async function loadConfigIp() {
  $('#c_publicIp').textContent = '获取中…';
  $('#c_localIps').textContent = '--';
  try {
    const s = await api('/api/status');
    $('#c_publicIp').textContent = s.publicIp || '获取失败';
    $('#c_publicIp').onclick = () => {
      if (s.publicIp) navigator.clipboard?.writeText(s.publicIp).then(() => toast('已复制 IP'));
    };
    $('#c_localIps').textContent = (s.localIps || []).join(' / ') || '无';
  } catch (e) {
    $('#c_publicIp').textContent = '获取失败';
  }
}

async function loadConfig() {
  loadConfigIp();
  loadAccounts();
  try {
    const c = await api('/api/config');
    $('#c_aiProvider').value = c.aiProvider || 'anthropic';
    $('#c_aiKey').placeholder = c.aiKey ? `当前: ${c.aiKey}（留空不修改）` : '请输入 API Key';
    $('#c_aiModel').value = c.aiModel || '';
    $('#c_aiBaseUrl').value = c.aiBaseUrl || '';
    const imgKeys = c.imageKeys || {};
    const setImgPh = (id, val) => {
      $(id).value = '';
      $(id).placeholder = val ? `当前: ${val}（留空不修改）` : '留空表示不启用';
    };
    setImgPh('#c_imageKey_pexels', imgKeys.pexels);
    setImgPh('#c_imageKey_pixabay', imgKeys.pixabay);
    setImgPh('#c_imageKey_unsplash', imgKeys.unsplash);
    $('#c_enableBaidu').checked = !!c.enableBaidu;
  } catch (e) { toast(e.message); }
}

$('#c_refreshIp').addEventListener('click', loadConfigIp);
$('#saveCfg').addEventListener('click', async () => {
  const body = {
    aiProvider: $('#c_aiProvider').value,
    aiKey: $('#c_aiKey').value,
    aiModel: $('#c_aiModel').value.trim(),
    aiBaseUrl: $('#c_aiBaseUrl').value.trim(),
    imageKeys: {
      pexels: $('#c_imageKey_pexels').value,
      pixabay: $('#c_imageKey_pixabay').value,
      unsplash: $('#c_imageKey_unsplash').value,
    },
    enableBaidu: $('#c_enableBaidu').checked,
  };
  try {
    $('#saveCfg').disabled = true;
    await api('/api/config', { method: 'POST', body });
    toast('已保存');
    $('#c_aiKey').value = '';
    $('#c_imageKey_pexels').value = '';
    $('#c_imageKey_pixabay').value = '';
    $('#c_imageKey_unsplash').value = '';
    loadConfig();
  } catch (e) { toast(e.message); }
  finally { $('#saveCfg').disabled = false; }
});

// === 公众号账号管理 ===
let availableAccounts = [];
let defaultAccountId = '';
const accountSelectIds = ['#g_accountId', '#m_accountId', '#j_accountId'];

async function loadAccounts() {
  try {
    const r = await api('/api/accounts');
    availableAccounts = r.accounts || [];
    defaultAccountId = r.defaultAccountId || (availableAccounts[0] && availableAccounts[0].id) || '';
    renderAccountList();
    renderAccountSelects();
  } catch (e) { toast(e.message); }
}

function renderAccountList() {
  const box = $('#accountList');
  if (!box) return;
  if (!availableAccounts.length) {
    box.innerHTML = '<div class="empty">还没添加公众号，点下方按钮新增</div>';
    return;
  }
  box.innerHTML = availableAccounts.map((a, i) => `
    <div class="account-item" data-id="${escapeHtml(a.id)}" data-idx="${i}">
      <div class="acc-head">
        <input class="a-name" placeholder="公众号名称（如：养老健康号）" value="${escapeHtml(a.name || '')}"/>
        ${a.id === defaultAccountId ? '<span class="builtin-badge">默认</span>' : `<button class="ghost-btn" data-act="setDefault">设为默认</button>`}
        <button class="del-btn" data-act="del">删除</button>
      </div>
      <div class="acc-row">
        <label>APPID</label>
        <input class="a-appid" placeholder="wx开头的应用 ID" value="${escapeHtml(a.appid || '')}"/>
      </div>
      <div class="acc-row">
        <label>AppSecret</label>
        <input class="a-secret" type="password" placeholder="${a.secret ? `当前: ${a.secret}（留空不修改）` : '请输入 AppSecret'}"/>
      </div>
      <button class="btn small" data-act="save">保存此公众号</button>
    </div>
  `).join('');
  box.querySelectorAll('.account-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('[data-act=save]').onclick = () => saveAccount(id, el);
    el.querySelector('[data-act=del]').onclick = () => deleteAccount(id);
    const setDefBtn = el.querySelector('[data-act=setDefault]');
    if (setDefBtn) setDefBtn.onclick = () => setDefaultAccount(id);
  });
}

function renderAccountSelects() {
  for (const sid of accountSelectIds) {
    const sel = $(sid);
    if (!sel) continue;
    const prev = sel.value;
    if (!availableAccounts.length) {
      sel.innerHTML = '<option value="">（请先到「配置」添加公众号）</option>';
      continue;
    }
    sel.innerHTML = availableAccounts.map(a =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}${a.id === defaultAccountId ? '（默认）' : ''}</option>`
    ).join('');
    if (prev && availableAccounts.some(a => a.id === prev)) sel.value = prev;
    else sel.value = defaultAccountId;
  }
}

async function saveAccount(id, el) {
  const name = el.querySelector('.a-name').value.trim();
  const appid = el.querySelector('.a-appid').value.trim();
  const secret = el.querySelector('.a-secret').value;
  if (!name || !appid) return toast('公众号名称和 APPID 必填');
  try {
    await api('/api/accounts', { method: 'POST', body: { id, name, appid, secret } });
    toast('已保存');
    loadAccounts();
  } catch (e) { toast(e.message); }
}

$('#addAccountBtn')?.addEventListener('click', async () => {
  const name = prompt('请输入新公众号名称（如：养老健康号）');
  if (!name || !name.trim()) return;
  const appid = prompt('请输入 APPID（wx 开头）');
  if (!appid || !appid.trim()) return;
  const secret = prompt('请输入 AppSecret');
  if (!secret || !secret.trim()) return;
  try {
    await api('/api/accounts', { method: 'POST', body: { name: name.trim(), appid: appid.trim(), secret: secret.trim() } });
    toast('已添加');
    loadAccounts();
  } catch (e) { toast(e.message); }
});

async function deleteAccount(id) {
  const a = availableAccounts.find(x => x.id === id);
  if (!confirm(`确定删除公众号「${a ? a.name : id}」？\n关联的定时任务会被一并停用。`)) return;
  try {
    await api(`/api/accounts/${id}`, { method: 'DELETE' });
    toast('已删除');
    loadAccounts();
    loadJobs();
  } catch (e) { toast(e.message); }
}

async function setDefaultAccount(id) {
  try {
    await api('/api/accounts/default', { method: 'POST', body: { id } });
    loadAccounts();
  } catch (e) { toast(e.message); }
}

loadAccounts();

// === 生成 ===
$('#mineBtn').addEventListener('click', async () => {
  const kw = $('#g_keyword').value.trim();
  if (!kw) return toast('请输入关键词');
  $('#mineBtn').disabled = true; $('#mineBtn').textContent = '挖掘中...';
  try {
    const data = await api('/api/trends', { method: 'POST', body: { keyword: kw } });
    const list = $('#trendsList'); list.innerHTML = '';
    (data.related || []).forEach(w => {
      const t = document.createElement('span'); t.className = 'tag'; t.textContent = w;
      t.onclick = () => { $('#g_keyword').value = w; };
      list.appendChild(t);
    });
    (data.weiboHot || []).slice(0, 6).forEach(w => {
      const t = document.createElement('span'); t.className = 'tag hot'; t.textContent = '🔥 ' + w;
      t.onclick = () => { $('#g_keyword').value = w; };
      list.appendChild(t);
    });
    $('#trendsBox').style.display = 'block';
  } catch (e) { toast(e.message); }
  finally { $('#mineBtn').disabled = false; $('#mineBtn').textContent = '挖掘热搜'; }
});

let pollTimer = null;
let currentArticle = null;
let lastRevision = -1;
let firstPreviewRendered = false;
let availableThemes = [];
let activeTheme = 'default-green';
let availableWriters = [];
let defaultWriterId = 'default';
const userEdited = { title: false, digest: false, cover: false, body: false };

async function loadThemes() {
  try {
    const r = await api('/api/themes');
    availableThemes = r.themes || [];
    activeTheme = r.default || (availableThemes[0] && availableThemes[0].key) || 'default-green';
    if (!manualActiveTheme) manualActiveTheme = activeTheme;
    if (!jobActiveTheme) jobActiveTheme = activeTheme;
    renderThemePicker();
    renderManualThemePicker();
    renderJobThemePicker();
  } catch (e) { /* ignore */ }
}
function renderThemePicker() {
  const box = $('#themePicker'); if (!box) return;
  box.innerHTML = availableThemes.map(t =>
    `<span class="theme-pill ${t.key === activeTheme ? 'active' : ''}" data-key="${t.key}" title="${escapeHtml(t.desc || '')}">${escapeHtml(t.label)}</span>`
  ).join('');
  box.querySelectorAll('.theme-pill').forEach(el => {
    el.onclick = () => switchTheme(el.dataset.key);
  });
}
async function switchTheme(key) {
  if (!key || key === activeTheme) return;
  activeTheme = key;
  renderThemePicker();
  if (!currentArticle || !currentArticle.bodyRaw) return;
  try {
    const r = await api('/api/restyle', {
      method: 'POST',
      body: { bodyRaw: currentArticle.bodyRaw, imgUrlMap: currentArticle.imgUrlMap || {}, theme: key },
    });
    currentArticle.html = r.html;
    currentArticle.themeName = key;
    $('#p_body').innerHTML = r.html;
    userEdited.body = false;
  } catch (e) { toast('切换主题失败: ' + e.message); }
}
loadThemes();

// === 写手 ===
async function loadWriters() {
  try {
    const r = await api('/api/writers');
    availableWriters = r.writers || [];
    defaultWriterId = r.defaultId || (availableWriters[0] && availableWriters[0].id) || 'default';
    renderWriterSelects();
    renderWriterEditor();
  } catch (e) { /* ignore */ }
}

function renderWriterSelects() {
  for (const id of ['#g_writerId', '#j_writerId']) {
    const sel = $(id);
    if (!sel) continue;
    const prev = sel.value;
    sel.innerHTML = availableWriters.map(w =>
      `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`
    ).join('');
    if (prev && availableWriters.some(w => w.id === prev)) sel.value = prev;
    else sel.value = defaultWriterId;
  }
}

function renderWriterEditor() {
  const box = $('#writerList');
  if (!box) return;
  if (!availableWriters.length) { box.innerHTML = ''; return; }
  box.innerHTML = availableWriters.map((w, i) => `
    <div class="writer-item" data-idx="${i}">
      <div class="writer-head">
        <input class="w-name" placeholder="写手名称" value="${escapeHtml(w.name || '')}" />
        ${w.builtin ? '<span class="builtin-badge">默认</span>' : ''}
        <button class="del-btn" data-act="del" ${w.builtin ? 'disabled title="默认写手不可删除"' : ''}>删除</button>
      </div>
      <textarea class="w-prompt" placeholder="系统提示词（决定文章风格、结构、口吻）">${escapeHtml(w.prompt || '')}</textarea>
    </div>
  `).join('');
  box.querySelectorAll('.writer-item').forEach(el => {
    const idx = Number(el.dataset.idx);
    const delBtn = el.querySelector('.del-btn');
    delBtn.onclick = () => {
      if (delBtn.disabled) return;
      if (!confirm(`确定删除写手「${availableWriters[idx].name}」？`)) return;
      collectWriterEdits();
      availableWriters.splice(idx, 1);
      renderWriterEditor();
    };
  });
}

function collectWriterEdits() {
  const items = $$('#writerList .writer-item');
  items.forEach(el => {
    const idx = Number(el.dataset.idx);
    if (!availableWriters[idx]) return;
    availableWriters[idx].name = el.querySelector('.w-name').value.trim();
    availableWriters[idx].prompt = el.querySelector('.w-prompt').value;
  });
}

$('#addWriterBtn')?.addEventListener('click', () => {
  collectWriterEdits();
  availableWriters.push({
    id: 'new_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '新写手',
    prompt: '',
    builtin: false,
  });
  renderWriterEditor();
});

$('#saveWritersBtn')?.addEventListener('click', async () => {
  collectWriterEdits();
  $('#saveWritersBtn').disabled = true;
  try {
    const r = await api('/api/writers', { method: 'POST', body: { writers: availableWriters } });
    availableWriters = r.writers || [];
    renderWriterEditor();
    renderWriterSelects();
    toast('已保存');
  } catch (e) {
    toast(e.message);
  } finally {
    $('#saveWritersBtn').disabled = false;
  }
});

loadWriters();

async function loadNewsCategories() {
  try {
    const r = await api('/api/news-categories');
    const opts = (r.categories || []).map(c =>
      `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`
    ).join('');
    const genSel = $('#g_newsCategory');
    const jobSel = $('#j_newsCategory');
    if (genSel) genSel.insertAdjacentHTML('beforeend', opts);
    if (jobSel) jobSel.insertAdjacentHTML('beforeend', opts);
  } catch (e) { /* ignore */ }
}
loadNewsCategories();

// 新闻开关联动类目下拉
$('#g_useNews')?.addEventListener('change', () => {
  $('#g_newsCategoryBox').style.display = $('#g_useNews').checked ? 'block' : 'none';
});
$('#j_useNews')?.addEventListener('change', () => {
  $('#j_newsCategoryBox').style.display = $('#j_useNews').checked ? 'block' : 'none';
});

// === 关键词历史记录（localStorage，最多 5 个）===
const KW_HISTORY_KEY = 'mp_keyword_history';
const KW_HISTORY_MAX = 5;

function loadKwHistory() {
  try { return JSON.parse(localStorage.getItem(KW_HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveKwHistory(list) {
  localStorage.setItem(KW_HISTORY_KEY, JSON.stringify(list.slice(0, KW_HISTORY_MAX)));
}
function pushKwHistory(kw) {
  if (!kw) return;
  const list = loadKwHistory().filter(x => x !== kw);
  list.unshift(kw);
  saveKwHistory(list);
  renderKwHistory();
}
function renderKwHistory() {
  const list = loadKwHistory();
  const box = $('#kwHistoryBox');
  const ul = $('#kwHistoryList');
  if (!list.length) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  ul.innerHTML = list.map(kw =>
    `<span class="kw-chip" data-kw="${escapeHtml(kw)}">${escapeHtml(kw)}</span>`
  ).join('');
  ul.querySelectorAll('.kw-chip').forEach(el => {
    el.onclick = () => { $('#g_keyword').value = el.dataset.kw; $('#g_keyword').focus(); };
  });
}
$('#kwHistoryClear').addEventListener('click', () => {
  if (!confirm('清空关键词历史记录？')) return;
  localStorage.removeItem(KW_HISTORY_KEY);
  renderKwHistory();
});
renderKwHistory();

$('#p_title').addEventListener('input', () => { userEdited.title = true; });
$('#p_digest').addEventListener('input', () => { userEdited.digest = true; });
$('#p_coverUrl').addEventListener('input', () => {
  userEdited.cover = true;
  $('#p_coverImg').src = $('#p_coverUrl').value.trim();
});
$('#p_body').addEventListener('input', () => { userEdited.body = true; });

$('#genBtn').addEventListener('click', async () => {
  const keyword = $('#g_keyword').value.trim();
  const refLinksRaw = ($('#g_refLinks')?.value || '').split(/[\n\r\s]+/);
  const referenceLinks = [...new Set(refLinksRaw.map(s => s.trim()).filter(s => /^https?:\/\//i.test(s)))];
  if (!keyword && !referenceLinks.length) return toast('请输入关键词或至少一个参考链接');
  if (keyword) pushKwHistory(keyword);
  const extra = $('#g_extra').value.trim();
  $('#genBtn').disabled = true;
  $('#genBtn').innerHTML = '<span class="spinner"></span>生成中';
  $('#logCard').style.display = 'block';
  $('#previewCard').style.display = 'none';
  $('#taskLog').textContent = '';
  currentArticle = null;
  lastRevision = -1;
  firstPreviewRendered = false;
  userEdited.title = userEdited.digest = userEdited.cover = userEdited.body = false;
  try {
    const webSearch = $('#g_webSearch').checked;
    const useNews = $('#g_useNews').checked;
    const newsCategory = useNews ? $('#g_newsCategory').value : '';
    const writerId = $('#g_writerId').value || defaultWriterId;
    const { taskId } = await api('/api/generate', { method: 'POST', body: { keyword, extra, theme: activeTheme, webSearch, useNews, newsCategory, writerId, referenceLinks } });
    pollGenerateTask(taskId);
  } catch (e) {
    toast(e.message);
    $('#genBtn').disabled = false;
    $('#genBtn').textContent = '生成文章';
  }
});

function pollGenerateTask(id) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const t = await api(`/api/task/${id}`);
      $('#taskLog').textContent = (t.logs || []).join('\n');
      $('#taskLog').scrollTop = $('#taskLog').scrollHeight;

      if (t.result && t.revision !== lastRevision) {
        lastRevision = t.revision;
        currentArticle = t.result;
        renderEditablePreview(t.result);
      }

      if (t.done) {
        clearInterval(pollTimer);
        $('#genBtn').disabled = false;
        $('#genBtn').textContent = '生成文章';
        if (t.error) toast('生成失败: ' + t.error, 3000);
        else toast('已生成，可在下方调整后推送');
      }
    } catch (e) {
      clearInterval(pollTimer);
      $('#genBtn').disabled = false;
      $('#genBtn').textContent = '生成文章';
      toast(e.message);
    }
  }, 800);
}

function renderEditablePreview(r) {
  $('#previewCard').style.display = 'block';
  const imagesPending = !!r.imagesPending;

  if (!firstPreviewRendered) {
    $('#p_title').value = r.title || '';
    $('#p_digest').value = r.digest || '';
    $('#p_coverUrl').value = r.coverUrl || '';
    $('#p_coverImg').src = r.coverUrl || '';
    $('#p_body').innerHTML = r.html || '';
    $('#pushResultBox').innerHTML = '';
    firstPreviewRendered = true;
    $('#previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    if (!userEdited.title) $('#p_title').value = r.title || '';
    if (!userEdited.digest) $('#p_digest').value = r.digest || '';
    if (!userEdited.cover) {
      $('#p_coverUrl').value = r.coverUrl || '';
      $('#p_coverImg').src = r.coverUrl || '';
    }
    if (!userEdited.body) $('#p_body').innerHTML = r.html || '';
  }

  $('#pushDraftBtn').disabled = imagesPending;
  $('#pushDraftBtn').innerHTML = imagesPending
    ? '<span class="spinner"></span>配图加载中…'
    : '推送到微信草稿箱';
}

$('#pushDraftBtn').addEventListener('click', async () => {
  if (!currentArticle) return toast('请先生成文章');
  const title = $('#p_title').value.trim();
  const digest = $('#p_digest').value.trim();
  const coverUrl = $('#p_coverUrl').value.trim();
  const html = $('#p_body').innerHTML.trim();
  if (!title) return toast('标题不能为空');
  if (!html) return toast('正文不能为空');

  const accountId = $('#g_accountId').value || defaultAccountId;
  if (!accountId) return toast('请先到「配置」页添加公众号');

  $('#pushDraftBtn').disabled = true;
  $('#pushDraftBtn').innerHTML = '<span class="spinner"></span>推送中';
  $('#pushResultBox').innerHTML = '';
  $('#logCard').style.display = 'block';
  $('#taskLog').textContent = '';
  try {
    const { taskId } = await api('/api/push-draft', {
      method: 'POST',
      body: { accountId, title, digest, html, coverUrl, keyword: currentArticle.keyword || '' },
    });
    pollPushTask(taskId);
  } catch (e) {
    toast(e.message);
    $('#pushDraftBtn').disabled = false;
    $('#pushDraftBtn').textContent = '推送到微信草稿箱';
  }
});

function pollPushTask(id) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const t = await api(`/api/task/${id}`);
      $('#taskLog').textContent = (t.logs || []).join('\n');
      $('#taskLog').scrollTop = $('#taskLog').scrollHeight;
      if (t.done) {
        clearInterval(pollTimer);
        $('#pushDraftBtn').disabled = false;
        $('#pushDraftBtn').textContent = '推送到微信草稿箱';
        if (t.error) {
          toast('推送失败: ' + t.error, 3000);
          $('#pushResultBox').innerHTML = `<div class="push-err">❌ ${escapeHtml(t.error)}</div>`;
        } else if (t.result && t.result.draftId) {
          toast('已推送到草稿箱');
          $('#pushResultBox').innerHTML =
            `<div class="push-ok">✅ 已推送至公众号草稿箱<br/>media_id: <code>${escapeHtml(t.result.draftId)}</code><br/>请到微信公众平台「草稿箱」查看并发布。</div>`;
          loadHistory();
        }
      }
    } catch (e) {
      clearInterval(pollTimer);
      $('#pushDraftBtn').disabled = false;
      $('#pushDraftBtn').textContent = '推送到微信草稿箱';
      toast(e.message);
    }
  }, 1500);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// === 定时任务 ===
$$('.cron-presets .preset').forEach(p => p.addEventListener('click', () => {
  $('#j_cron').value = p.dataset.cron;
}));
let jobActiveTheme = null;
function renderJobThemePicker() {
  const box = $('#j_themePicker'); if (!box) return;
  box.innerHTML = availableThemes.map(t =>
    `<span class="theme-pill ${t.key === jobActiveTheme ? 'active' : ''}" data-key="${t.key}" title="${escapeHtml(t.desc || '')}">${escapeHtml(t.label)}</span>`
  ).join('');
  box.querySelectorAll('.theme-pill').forEach(el => {
    el.onclick = () => { jobActiveTheme = el.dataset.key; renderJobThemePicker(); };
  });
}

$('#addJob').addEventListener('click', async () => {
  const keyword = $('#j_keyword').value.trim();
  const cronExpr = $('#j_cron').value.trim();
  const extra = $('#j_extra').value.trim();
  const webSearch = $('#j_webSearch').checked;
  const useNews = $('#j_useNews').checked;
  const newsCategory = useNews ? $('#j_newsCategory').value : '';
  const theme = jobActiveTheme || activeTheme;
  if (!keyword || !cronExpr) return toast('关键词和 cron 都要填');
  const accountId = $('#j_accountId').value || defaultAccountId;
  if (!accountId) return toast('请先到「配置」页添加公众号');
  try {
    $('#addJob').disabled = true;
    const writerId = $('#j_writerId').value || defaultWriterId;
    await api('/api/jobs', { method: 'POST', body: { accountId, keyword, cron: cronExpr, extra, theme, webSearch, useNews, newsCategory, writerId } });
    toast('已添加');
    $('#j_keyword').value = ''; $('#j_extra').value = ''; $('#j_cron').value = '';
    $('#j_webSearch').checked = false;
    $('#j_useNews').checked = false;
    $('#j_newsCategoryBox').style.display = 'none';
    loadJobs();
  } catch (e) { toast(e.message); }
  finally { $('#addJob').disabled = false; }
});

async function loadJobs() {
  try {
    const list = await api('/api/jobs');
    $('#jobCount').textContent = list.length;
    const box = $('#jobList');
    if (!list.length) { box.innerHTML = '<div class="empty">暂无定时任务</div>'; return; }
    const themeLabel = (key) => {
      const t = availableThemes.find(x => x.key === key);
      return t ? t.label : (key || '默认');
    };
    const writerLabel = (id) => {
      const w = availableWriters.find(x => x.id === id);
      return w ? w.name : (id || 'AI公众号写手');
    };
    const accountLabel = (id) => {
      const a = availableAccounts.find(x => x.id === id);
      return a ? a.name : (id ? '（已删除）' : '（未指定）');
    };
    box.innerHTML = list.map(j => `<div class="job-item" data-id="${j.id}">
      <div class="row">
        <div>
          <div class="kw">${escapeHtml(j.keyword)}</div>
          <div class="meta">📤 ${escapeHtml(accountLabel(j.accountId))} · cron: <code>${escapeHtml(j.cron)}</code> · ${j.enabled ? '✅ 启用' : '⏸ 已停'} · 写手: ${escapeHtml(writerLabel(j.writerId))} · 主题: ${escapeHtml(themeLabel(j.theme))} · 联网: ${j.webSearch ? '✅' : '✕'} · 抓新闻: ${j.useNews ? (j.newsCategory ? `✅(${escapeHtml(j.newsCategory)})` : '✅(关键词)') : '✕'}</div>
          <div class="meta">最近: ${j.lastRun ? new Date(j.lastRun).toLocaleString() + ' — ' + escapeHtml(j.lastResult || '') : '从未执行'}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn small ghost" data-act="run">立即执行</button>
        <button class="btn small ghost" data-act="toggle">${j.enabled ? '停用' : '启用'}</button>
        <button class="btn small danger" data-act="del">删除</button>
      </div>
    </div>`).join('');
    box.querySelectorAll('.job-item').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('[data-act=run]').onclick = async () => {
        try { const { taskId } = await api(`/api/jobs/${id}/run`, { method: 'POST' });
          toast('已开始执行，可在「生成」页查看日志'); } catch (e) { toast(e.message); }
      };
      el.querySelector('[data-act=toggle]').onclick = async () => {
        try { await api(`/api/jobs/${id}/toggle`, { method: 'POST' }); loadJobs(); } catch (e) { toast(e.message); }
      };
      el.querySelector('[data-act=del]').onclick = async () => {
        if (!confirm('确定删除该定时任务？')) return;
        try { await api(`/api/jobs/${id}`, { method: 'DELETE' }); loadJobs(); } catch (e) { toast(e.message); }
      };
    });
  } catch (e) { toast(e.message); }
}

// === 历史 ===
async function loadHistory() {
  try {
    const list = await api('/api/history');
    const box = $('#historyList');
    if (!list.length) { box.innerHTML = '<div class="empty">暂无发布记录</div>'; return; }
    box.innerHTML = list.map(h => `<div class="history-item">
      <div class="ht">${escapeHtml(h.title || '(无标题)')}</div>
      <div class="hm">${h.accountName ? '📤 ' + escapeHtml(h.accountName) + ' · ' : ''}关键词: ${escapeHtml(h.keyword || '')} · ${new Date(h.ts).toLocaleString()}${h.draftId ? ' · 草稿 ✓' : ''}</div>
    </div>`).join('');
  } catch (e) { toast(e.message); }
}

// === 手写页 ===
let manualActiveTheme = null;
let manualRenderTimer = null;
let manualPushPollTimer = null;
let manualPreviewEdited = false;

function renderManualThemePicker() {
  const box = $('#m_themePicker'); if (!box) return;
  box.innerHTML = availableThemes.map(t =>
    `<span class="theme-pill ${t.key === manualActiveTheme ? 'active' : ''}" data-key="${t.key}" title="${escapeHtml(t.desc || '')}">${escapeHtml(t.label)}</span>`
  ).join('');
  box.querySelectorAll('.theme-pill').forEach(el => {
    el.onclick = () => {
      manualActiveTheme = el.dataset.key;
      renderManualThemePicker();
      renderManualPreview(true);
    };
  });
}

async function renderManualPreview(forceOverwrite = false) {
  const body = $('#m_body').value;
  if (!body.trim()) {
    $('#m_previewCard').style.display = 'none';
    return;
  }
  try {
    const r = await api('/api/restyle', {
      method: 'POST',
      body: { bodyRaw: body, imgUrlMap: {}, theme: manualActiveTheme || 'default-green' },
    });
    $('#m_previewCard').style.display = 'block';
    if (forceOverwrite || !manualPreviewEdited) {
      $('#m_previewBody').innerHTML = r.html;
      manualPreviewEdited = false;
    }
  } catch (e) { /* 静默：用户还在打字，渲染失败先忽略 */ }
}

function scheduleManualRender() {
  clearTimeout(manualRenderTimer);
  manualRenderTimer = setTimeout(() => {
    manualPreviewEdited = false;
    renderManualPreview(true);
  }, 400);
}

$('#m_body').addEventListener('input', scheduleManualRender);
$('#m_previewBody').addEventListener('input', () => { manualPreviewEdited = true; });
$('#m_coverUrl').addEventListener('input', () => {
  $('#m_coverImg').src = $('#m_coverUrl').value.trim();
});

$('#m_pushDraftBtn').addEventListener('click', async () => {
  const title = $('#m_title').value.trim();
  const digest = $('#m_digest').value.trim();
  const coverUrl = $('#m_coverUrl').value.trim();
  const bodyRaw = $('#m_body').value.trim();
  if (!title) return toast('标题不能为空');
  if (!bodyRaw) return toast('正文不能为空');

  if (!$('#m_previewBody').innerHTML.trim()) {
    await renderManualPreview(true);
  }
  const html = $('#m_previewBody').innerHTML.trim();
  if (!html) return toast('正文渲染失败，请检查内容');

  const accountId = $('#m_accountId').value || defaultAccountId;
  if (!accountId) return toast('请先到「配置」页添加公众号');

  $('#m_pushDraftBtn').disabled = true;
  $('#m_pushDraftBtn').innerHTML = '<span class="spinner"></span>推送中';
  $('#m_pushResultBox').innerHTML = '';
  $('#m_logCard').style.display = 'block';
  $('#m_taskLog').textContent = '';
  try {
    const { taskId } = await api('/api/push-draft', {
      method: 'POST',
      body: { accountId, title, digest, html, coverUrl, keyword: '(手写)' },
    });
    pollManualPushTask(taskId);
  } catch (e) {
    toast(e.message);
    $('#m_pushDraftBtn').disabled = false;
    $('#m_pushDraftBtn').textContent = '推送到微信草稿箱';
  }
});

function pollManualPushTask(id) {
  clearInterval(manualPushPollTimer);
  manualPushPollTimer = setInterval(async () => {
    try {
      const t = await api(`/api/task/${id}`);
      $('#m_taskLog').textContent = (t.logs || []).join('\n');
      $('#m_taskLog').scrollTop = $('#m_taskLog').scrollHeight;
      if (t.done) {
        clearInterval(manualPushPollTimer);
        $('#m_pushDraftBtn').disabled = false;
        $('#m_pushDraftBtn').textContent = '推送到微信草稿箱';
        if (t.error) {
          toast('推送失败: ' + t.error, 3000);
          $('#m_pushResultBox').innerHTML = `<div class="push-err">❌ ${escapeHtml(t.error)}</div>`;
        } else if (t.result && t.result.draftId) {
          toast('已推送到草稿箱');
          $('#m_pushResultBox').innerHTML =
            `<div class="push-ok">✅ 已推送至公众号草稿箱<br/>media_id: <code>${escapeHtml(t.result.draftId)}</code><br/>请到微信公众平台「草稿箱」查看并发布。</div>`;
          loadHistory();
        }
      }
    } catch (e) {
      clearInterval(manualPushPollTimer);
      $('#m_pushDraftBtn').disabled = false;
      $('#m_pushDraftBtn').textContent = '推送到微信草稿箱';
      toast(e.message);
    }
  }, 1500);
}

loadStatus();
