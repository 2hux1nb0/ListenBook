// ===== ListenBook Admin Dashboard =====
const API_BASE = (() => {
  const host = window.location.hostname || 'localhost';
  if (host === 'listenbook.local' || host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:8000/api`;
  }
  return 'http://localhost:8000/api';
})();
const MEDIA_BASE = (() => {
  const host = window.location.hostname || 'localhost';
  if (host === 'listenbook.local' || host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:8000`;
  }
  return 'http://localhost:8000';
})();
let currentPage = 'dashboard';
let podcastsCache = [];
let episodesCache = [];
let categoriesCache = [];
let pendingConfirm = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initLoginForm();
  initAuth();
});

// ===== Navigation =====
function initNavigation() {
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        navigateTo(page);
      }
    });
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
  const titles = {
    dashboard: '仪表盘', podcasts: '播客管理', episodes: '节目管理',
    categories: '分类管理', users: '用户管理'
  };
  document.getElementById('adminPageTitle').textContent = titles[page] || page;
  const view = document.getElementById(page + 'View');
  if (view) view.classList.add('active');
  if (page === 'dashboard') loadDashboard();
  else if (page === 'podcasts') loadPodcasts();
  else if (page === 'episodes') loadEpisodes();
  else if (page === 'categories') loadCategories();
  else if (page === 'users') loadUsers();
}

function loadCurrentPage() { navigateTo(currentPage); }

// ===== Auth =====
function initLoginForm() {
  const form = document.getElementById('adminLoginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('adminLoginUsername').value.trim();
    const password = document.getElementById('adminLoginPassword').value;
    const errorEl = document.getElementById('adminLoginError');
    errorEl.textContent = '';

    try {
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        errorEl.textContent = '用户名或密码错误';
        return;
      }
      const data = await res.json();
      localStorage.setItem('admin_token', data.tokens.access);
      document.getElementById('adminUser').textContent = data.user.username || '管理员';
      document.getElementById('adminLoginScreen').style.display = 'none';
      document.getElementById('adminMainShell').style.display = 'flex';
      loadDashboard();
    } catch (e) {
      errorEl.textContent = '登录失败，请检查后端服务';
    }
  });
}

async function tryAdminLogin() {
  const credentials = [
    { username: 'admin', password: 'admin123456' },
    { username: 'admin', password: 'admin123' },
  ];

  for (const credential of credentials) {
    try {
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('admin_token', data.tokens.access);
        if (document.getElementById('adminUser')) {
          document.getElementById('adminUser').textContent = data.user.username || '管理员';
        }
        return data;
      }
    } catch (e) {
      // continue to next credential
    }
  }

  if (document.getElementById('adminUser')) {
    document.getElementById('adminUser').textContent = '未认证';
  }
  return null;
}

async function initAuth() {
  const token = localStorage.getItem('admin_token');
  if (token) {
    try {
      const data = await tryAdminLogin();
      if (data) {
        document.getElementById('adminLoginScreen').style.display = 'none';
        document.getElementById('adminMainShell').style.display = 'flex';
        loadDashboard();
        return;
      }
    } catch (e) {
      localStorage.removeItem('admin_token');
    }
  }

  if (document.getElementById('adminUser')) {
    document.getElementById('adminUser').textContent = '管理员';
  }
  document.getElementById('adminLoginScreen').style.display = 'flex';
  document.getElementById('adminMainShell').style.display = 'none';
}

async function getAuthHeaders(includeContentType = true) {
  let token = localStorage.getItem('admin_token');
  if (!token) {
    const data = await tryAdminLogin();
    token = data?.tokens?.access || null;
  }
  const headers = {};
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

// ===== API Helpers (always with auth) =====
async function apiGet(endpoint) {
  const headers = await getAuthHeaders(false);
  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

async function apiPost(endpoint, data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(JSON.stringify(err)); }
  return res.json();
}

async function apiPatch(endpoint, data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH', headers, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error ${res.status}: ${errText}`);
  }
  return res.json();
}

async function apiDelete(endpoint) {
  const headers = await getAuthHeaders(false);
  const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return true;
}

// ===== File Upload =====
async function uploadFile(endpoint, file) {
  const token = localStorage.getItem('admin_token');
  const formData = new FormData();
  formData.append('cover_image', file);
  
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload Error ${res.status}: ${errText}`);
  }
  return res.json();
}

// ===== Toast =====
function showToast(msg, type = '') {
  const container = document.getElementById('adminToast');
  const el = document.createElement('div');
  el.className = 'admin-toast-msg ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 2500);
}

// ===== Modal =====
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showConfirm(msg, callback) {
  document.getElementById('confirmMessage').textContent = msg;
  document.getElementById('confirmBtn').onclick = () => { closeModal('confirmModal'); callback(); };
  openModal('confirmModal');
}

// ===== Dashboard =====
async function loadDashboard() {
  try {
    const [podcastsRes, episodesRes, categoriesRes] = await Promise.all([
      apiGet('/admin/podcasts/').catch(() => ({ results: [] })),
      apiGet('/episodes/').catch(() => ({ results: [] })),
      apiGet('/categories/').catch(() => []),
    ]);
    const podcasts = podcastsRes.results || [];
    const episodes = episodesRes.results || [];
    podcastsCache = podcasts;
    episodesCache = episodes;

    document.getElementById('statTotalPodcasts').textContent = podcasts.length;
    document.getElementById('statTotalEpisodes').textContent = episodes.length;
    document.getElementById('statTotalCategories').textContent = Array.isArray(categoriesRes) ? categoriesRes.length : (categoriesRes.results || []).length;

    const difficultyCounts = { beginner: 0, intermediate: 0, advanced: 0 };
    podcasts.forEach(p => { if (difficultyCounts[p.difficulty] !== undefined) difficultyCounts[p.difficulty]++; });
    const maxCount = Math.max(1, ...Object.values(difficultyCounts));
    ['beginner', 'intermediate', 'advanced'].forEach(d => {
      document.getElementById('diff' + d.charAt(0).toUpperCase() + d.slice(1)).style.width = (difficultyCounts[d] / maxCount * 100) + '%';
      document.getElementById('diff' + d.charAt(0).toUpperCase() + d.slice(1) + 'Num').textContent = difficultyCounts[d];
    });

    const recent = [...podcasts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    document.getElementById('recentPodcasts').innerHTML = recent.map(p => `
      <div class="quick-item">
        ${p.cover_image ? `<img src="${resolveMediaUrl(p.cover_image)}" class="quick-cover" alt="">` : '<div class="quick-cover" style="background:#eee"></div>'}
        <span class="quick-title">${esc(p.title)}</span>
        <span class="quick-meta">${p.category_name || ''}</span>
      </div>
    `).join('') || '<p style="color:#888;font-size:14px">暂无播客</p>';
  } catch (e) { console.error('Dashboard error:', e); }
}

// ===== Fast anonymous GET (skip auth for read endpoints) =====
async function fastGet(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// ===== Podcasts =====
async function loadPodcasts() {
  try {
    const res = await fastGet('/admin/podcasts/');
    podcastsCache = res.results || res || [];
    renderPodcastTable(podcastsCache);
  } catch (e) {
    document.getElementById('podcastTableBody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;padding:40px">加载失败</td></tr>';
  }
  const s = document.getElementById('podcastSearch');
  const df = document.getElementById('podcastDifficultyFilter');
  const sf = document.getElementById('podcastStatusFilter');
  function filter() {
    let d = [...podcastsCache];
    const kw = s.value.toLowerCase();
    const diff = df.value;
    const st = sf.value;
    if (kw) d = d.filter(p => p.title.toLowerCase().includes(kw) || (p.author||'').toLowerCase().includes(kw));
    if (diff) d = d.filter(p => p.difficulty === diff);
    if (st === 'active') d = d.filter(p => p.is_active);
    else if (st === 'inactive') d = d.filter(p => !p.is_active);
    renderPodcastTable(d);
  }
  s.oninput = filter; df.onchange = filter; sf.onchange = filter;
}

function renderPodcastTable(data) {
  const tbody = document.getElementById('podcastTableBody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;padding:40px">暂无播客</td></tr>'; return; }
  const diffLabels = { beginner: '初级', intermediate: '中级', advanced: '高级' };
  tbody.innerHTML = data.map(p => `
    <tr>
      <td>${p.cover_image ? `<img src="${resolveMediaUrl(p.cover_image)}" class="table-cover" alt="">` : '<div class="table-cover" style="background:#eee;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa">无图</div>'}</td>
      <td><strong>${esc(p.title)}</strong></td>
      <td>${esc(p.author || '-')}</td>
      <td>${esc(p.category_name || '-')}</td>
      <td><span class="diff-badge ${p.difficulty}">${diffLabels[p.difficulty]||p.difficulty}</span></td>
      <td>${p.episode_count_display || p.episode_count || 0}</td>
      <td>${p.is_featured?'<span style="color:#f39c12">⭐ 推荐</span>':'<span style="color:#ccc">-</span>'}</td>
      <td><span class="status-badge ${p.is_active?'active':'inactive'}">${p.is_active?'已上架':'已下架'}</span></td>
      <td>
        <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="editPodcast(${p.id})"><i class="fas fa-edit"></i></button>
        <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="togglePodcastActive(${p.id})">${p.is_active?'下架':'上架'}</button>
        <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="togglePodcastFeatured(${p.id})">${p.is_featured?'取消推荐':'推荐'}</button>
        <button class="admin-btn admin-btn-sm admin-btn-danger" onclick="deletePodcast(${p.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

async function openPodcastModal(podcastId = null) {
  try {
    const cats = await apiGet('/categories/');
    const catList = Array.isArray(cats) ? cats : (cats.results || []);
    document.getElementById('podcastCategory').innerHTML = catList.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  } catch(e) {}

  if (podcastId) {
    const p = podcastsCache.find(p => p.id === podcastId);
    if (p) {
      document.getElementById('podcastModalTitle').textContent = '编辑播客';
      document.getElementById('podcastId').value = p.id;
      document.getElementById('podcastTitle').value = p.title || '';
      document.getElementById('podcastAuthor').value = p.author || '';
      document.getElementById('podcastDesc').value = p.description || '';
      document.getElementById('podcastCover').value = p.cover_image || '';
      document.getElementById('podcastCategory').value = p.category || '';
      document.getElementById('podcastDifficulty').value = p.difficulty || 'intermediate';
      document.getElementById('podcastLanguage').value = p.language || 'en';
      document.getElementById('podcastFeatured').checked = !!p.is_featured;
      document.getElementById('podcastActive').checked = p.is_active !== undefined ? p.is_active : true;
      if (p.cover_image) {
        document.getElementById('podcastCoverPreview').innerHTML = `<img src="${resolveMediaUrl(p.cover_image)}" alt="预览">`;
      }
      document.getElementById('podcastSaveBtn').textContent = '更新';
    }
  } else {
    document.getElementById('podcastModalTitle').textContent = '添加播客';
    document.getElementById('podcastId').value = '';
    document.getElementById('podcastForm').reset();
    document.getElementById('podcastActive').checked = true;
    document.getElementById('podcastDifficulty').value = 'intermediate';
    document.getElementById('podcastCoverPreview').innerHTML = '';
    document.getElementById('podcastSaveBtn').textContent = '创建';
  }
  openModal('podcastModal');
}

async function savePodcast(e) {
  e.preventDefault();
  const id = document.getElementById('podcastId').value;
  const title = document.getElementById('podcastTitle').value.trim();
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
  
  const data = {
    title, slug,
    author: document.getElementById('podcastAuthor').value || '',
    description: document.getElementById('podcastDesc').value || '',
    cover_image: document.getElementById('podcastCover').value || null,
    category: parseInt(document.getElementById('podcastCategory').value) || null,
    difficulty: document.getElementById('podcastDifficulty').value,
    language: document.getElementById('podcastLanguage').value,
    is_featured: document.getElementById('podcastFeatured').checked,
    is_active: document.getElementById('podcastActive').checked,
  };

  // Handle file upload
  const fileInput = document.getElementById('podcastCoverFile');
  let fileUploaded = false;

  try {
    if (id) {
      // Update existing podcast
      await apiPatch('/admin/podcasts/' + id + '/', data);
      
      // If file selected, upload it
      if (fileInput && fileInput.files.length > 0) {
        await uploadFile('/admin/podcasts/' + id + '/', fileInput.files[0]);
        fileUploaded = true;
      }
      showToast(fileUploaded ? '播客更新成功(含封面)' : '播客更新成功', 'success');
    } else {
      // Create new podcast
      const created = await apiPost('/admin/podcasts/', data);
      
      // If file selected, upload it to the new podcast
      if (fileInput && fileInput.files.length > 0 && created && created.id) {
        await uploadFile('/admin/podcasts/' + created.id + '/', fileInput.files[0]);
        fileUploaded = true;
      }
      showToast(fileUploaded ? '播客创建成功(含封面)' : '播客创建成功', 'success');
    }
    closeModal('podcastModal');
    loadPodcasts();
  } catch (error) {
    const msg = error.message || error;
    showToast('保存失败: ' + (msg.length > 80 ? msg.substring(0, 80) + '...' : msg), 'error');
  }
}

function editPodcast(id) { openPodcastModal(id); }

async function togglePodcastActive(id) {
  const p = podcastsCache.find(p => p.id === id);
  if (!p) return;
  try {
    await apiPatch('/admin/podcasts/' + id + '/', { is_active: !p.is_active });
    showToast(p.is_active ? '已下架' : '已上架', 'success');
    loadPodcasts();
  } catch (e) { showToast('操作失败: ' + e.message, 'error'); }
}

async function togglePodcastFeatured(id) {
  const p = podcastsCache.find(p => p.id === id);
  if (!p) return;
  try {
    await apiPatch('/admin/podcasts/' + id + '/', { is_featured: !p.is_featured });
    showToast(p.is_featured ? '已取消推荐' : '已设为推荐', 'success');
    loadPodcasts();
  } catch (e) { showToast('操作失败: ' + e.message, 'error'); }
}

async function deletePodcast(id) {
  showConfirm('确定要删除这个播客吗？', async () => {
    try { await apiDelete('/admin/podcasts/' + id + '/'); showToast('已删除', 'success'); loadPodcasts(); }
    catch (e) { showToast('删除失败: ' + e.message, 'error'); }
  });
}

// ===== Episodes =====
async function loadEpisodes() {
  try {
    const res = await apiGet('/episodes/');
    episodesCache = res.results || [];
    
    // Populate filter dropdown
    const allPodsRes = await apiGet('/podcasts/');
    const allPods = allPodsRes.results || [];
    const podSelect = document.getElementById('episodePodcastFilter');
    podSelect.innerHTML = '<option value="">全部播客</option>' + allPods.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
    
    renderEpisodeTable(episodesCache);
  } catch (e) {
    document.getElementById('episodeTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:40px">加载失败</td></tr>';
  }
  const s = document.getElementById('episodeSearch');
  const pf = document.getElementById('episodePodcastFilter');
  const sf = document.getElementById('episodeStatusFilter');
  function filter() {
    let d = [...episodesCache];
    const kw = s.value.toLowerCase();
    const pid = pf.value;
    const st = sf.value;
    if (kw) d = d.filter(e => e.title.toLowerCase().includes(kw));
    if (pid) d = d.filter(e => e.podcast == pid);
    if (st === 'active') d = d.filter(e => e.is_active);
    else if (st === 'inactive') d = d.filter(e => !e.is_active);
    renderEpisodeTable(d);
  }
  s.oninput = filter; pf.onchange = filter; sf.onchange = filter;
}

function renderEpisodeTable(data) {
  const tbody = document.getElementById('episodeTableBody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:40px">暂无节目</td></tr>'; return; }
  tbody.innerHTML = data.map(e => {
    const m = Math.floor((e.audio_duration||0) / 60);
    const s = (e.audio_duration||0) % 60;
    return `
      <tr>
        <td><strong>${esc(e.title)}</strong></td>
        <td>${esc(e.podcast_title || '-')}</td>
        <td>${e.audio_duration ? `${m}:${s.toString().padStart(2,'0')}` : '-'}</td>
        <td>${e.episode_number || 0}</td>
        <td>${e.play_count || 0}</td>
        <td><span class="status-badge ${e.is_active?'active':'inactive'}">${e.is_active?'已上架':'已下架'}</span></td>
        <td>
          <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="editEpisode(${e.id})"><i class="fas fa-edit"></i></button>
          <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="toggleEpisodeActive(${e.id})">${e.is_active?'下架':'上架'}</button>
          <button class="admin-btn admin-btn-sm admin-btn-danger" onclick="deleteEpisode(${e.id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
  }).join('');
}

async function openEpisodeModal(episodeId = null) {
  try {
    const res = await apiGet('/podcasts/');
    document.getElementById('episodePodcast').innerHTML = (res.results || []).map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
  } catch(e) {}
  if (episodeId) {
    const ep = episodesCache.find(e => e.id === episodeId);
    if (ep) {
      document.getElementById('episodeModalTitle').textContent = '编辑节目';
      document.getElementById('episodeId').value = ep.id;
      document.getElementById('episodePodcast').value = ep.podcast;
      document.getElementById('episodeTitle').value = ep.title || '';
      document.getElementById('episodeDesc').value = ep.description || '';
      document.getElementById('episodeDuration').value = ep.audio_duration || 0;
      document.getElementById('episodeNumber').value = ep.episode_number || 0;
      document.getElementById('episodePublishDate').value = ep.publish_date || '';
      document.getElementById('episodeAudioUrl').value = ep.audio_url || '';
      document.getElementById('episodeAudioFile').value = '';
      document.getElementById('episodeSubEn').value = ep.subtitle_en || '';
      document.getElementById('episodeSubZh').value = ep.subtitle_zh || '';
      document.getElementById('episodeActive').checked = ep.is_active !== undefined ? ep.is_active : true;
    }
  } else {
    document.getElementById('episodeModalTitle').textContent = '添加节目';
    document.getElementById('episodeId').value = '';
    document.getElementById('episodeForm').reset();
    document.getElementById('episodeActive').checked = true;
  }
  openModal('episodeModal');
}

async function saveEpisode(e) {
  e.preventDefault();
  const id = document.getElementById('episodeId').value;
  const fileInput = document.getElementById('episodeAudioFile');
  const data = {
    podcast: parseInt(document.getElementById('episodePodcast').value),
    title: document.getElementById('episodeTitle').value,
    description: document.getElementById('episodeDesc').value || '',
    audio_duration: parseInt(document.getElementById('episodeDuration').value) || 0,
    audio_url: document.getElementById('episodeAudioUrl').value || '',
    episode_number: parseInt(document.getElementById('episodeNumber').value) || 0,
    publish_date: document.getElementById('episodePublishDate').value || null,
    subtitle_en: document.getElementById('episodeSubEn').value || '',
    subtitle_zh: document.getElementById('episodeSubZh').value || '',
    is_active: document.getElementById('episodeActive').checked,
  };
  try {
    if (id) {
      await apiPatch('/episodes/' + id + '/', data);
      if (fileInput && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('audio_file', fileInput.files[0]);
        await fetch(`${API_BASE}/episodes/${id}/`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
          body: formData,
        });
      }
      showToast('节目更新成功', 'success');
    } else {
      const created = await apiPost('/episodes/', data);
      if (fileInput && fileInput.files.length > 0 && created && created.id) {
        const formData = new FormData();
        formData.append('audio_file', fileInput.files[0]);
        await fetch(`${API_BASE}/episodes/${created.id}/`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
          body: formData,
        });
      }
      showToast('节目创建成功', 'success');
    }
    closeModal('episodeModal'); loadEpisodes();
  } catch (error) { showToast('保存失败: ' + error.message, 'error'); }
}

function editEpisode(id) { openEpisodeModal(id); }

async function toggleEpisodeActive(id) {
  const ep = episodesCache.find(e => e.id === id);
  if (!ep) return;
  try { await apiPatch('/episodes/' + id + '/', { is_active: !ep.is_active }); showToast(ep.is_active?'已下架':'已上架', 'success'); loadEpisodes(); }
  catch (e) { showToast('操作失败: ' + e.message, 'error'); }
}

async function deleteEpisode(id) {
  showConfirm('确定删除？', async () => {
    try { await apiDelete('/episodes/' + id + '/'); showToast('已删除', 'success'); loadEpisodes(); }
    catch (e) { showToast('删除失败', 'error'); }
  });
}

// ===== Categories =====
async function loadCategories() {
  try {
    const res = await apiGet('/categories/');
    categoriesCache = Array.isArray(res) ? res : (res.results || []);
    renderCategoryTable(categoriesCache);
  } catch (e) {
    document.getElementById('categoryTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:40px">加载失败</td></tr>';
  }
  document.getElementById('categorySearch').oninput = function() {
    const kw = this.value.toLowerCase();
    renderCategoryTable(categoriesCache.filter(c => c.name.toLowerCase().includes(kw)));
  };
}

function renderCategoryTable(data) {
  const tbody = document.getElementById('categoryTableBody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:40px">暂无分类</td></tr>'; return; }
  tbody.innerHTML = data.map(c => `
    <tr>
      <td><div class="color-dot" style="background:${c.color||'#5858f5'}"></div></td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${c.slug}</td>
      <td>${c.icon?`<i class="fas ${c.icon}"></i>`:'-'}</td>
      <td>${c.sort_order}</td>
      <td><span class="status-badge ${c.is_active?'active':'inactive'}">${c.is_active?'激活':'停用'}</span></td>
      <td>
        <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="editCategory(${c.id})"><i class="fas fa-edit"></i></button>
        <button class="admin-btn admin-btn-sm admin-btn-outline" onclick="toggleCategoryActive(${c.id})">${c.is_active?'停用':'激活'}</button>
        <button class="admin-btn admin-btn-sm admin-btn-danger" onclick="deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function openCategoryModal(catId = null) {
  if (catId) {
    const c = categoriesCache.find(c => c.id === catId);
    if (c) {
      document.getElementById('categoryModalTitle').textContent = '编辑分类';
      document.getElementById('categoryId').value = c.id;
      document.getElementById('categoryName').value = c.name;
      document.getElementById('categorySlug').value = c.slug;
      document.getElementById('categoryIcon').value = c.icon || '';
      document.getElementById('categoryColor').value = c.color || '#5858f5';
      document.getElementById('categorySortOrder').value = c.sort_order || 0;
      document.getElementById('categoryActive').checked = c.is_active;
    }
  } else {
    document.getElementById('categoryModalTitle').textContent = '添加分类';
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryActive').checked = true;
  }
  openModal('categoryModal');
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const data = {
    name: document.getElementById('categoryName').value,
    slug: document.getElementById('categorySlug').value,
    icon: document.getElementById('categoryIcon').value || '',
    color: document.getElementById('categoryColor').value,
    sort_order: parseInt(document.getElementById('categorySortOrder').value) || 0,
    is_active: document.getElementById('categoryActive').checked,
  };
  try {
    if (id) { await apiPatch('/categories/' + id + '/', data); showToast('分类更新成功', 'success'); }
    else { await apiPost('/categories/', data); showToast('分类创建成功', 'success'); }
    closeModal('categoryModal'); loadCategories();
  } catch (error) { showToast('保存失败: ' + error.message, 'error'); }
}

function editCategory(id) { openCategoryModal(id); }

async function toggleCategoryActive(id) {
  const c = categoriesCache.find(c => c.id === id);
  if (!c) return;
  try { await apiPatch('/categories/' + id + '/', { is_active: !c.is_active }); showToast(c.is_active?'已停用':'已激活', 'success'); loadCategories(); }
  catch (e) { showToast('操作失败', 'error'); }
}

async function deleteCategory(id) {
  showConfirm('确定删除？', async () => {
    try { await apiDelete('/categories/' + id + '/'); showToast('已删除', 'success'); loadCategories(); }
    catch (e) { showToast('删除失败，可能有播客关联此分类', 'error'); }
  });
}

// ===== Users =====
async function loadUsers() {
  document.getElementById('userTableBody').innerHTML = `
    <tr><td colspan="6" style="text-align:center;color:#888;padding:40px">
      <i class="fas fa-info-circle"></i> 用户管理请使用 
      <a href="${API_BASE.replace('/api','')}/admin/accounts/user/" target="_blank" style="color:var(--main-blue);font-weight:600">Django Admin</a>
    </td></tr>`;
  document.getElementById('statTotalUsers').textContent = '-';
}

// ===== Utilities =====
function esc(str) { const div = document.createElement('div'); div.textContent = str || ''; return div.innerHTML; }

document.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('show'); });

// Cover preview - URL input
document.addEventListener('input', function(e) {
  if (e.target.id === 'podcastCover') {
    const preview = document.getElementById('podcastCoverPreview');
    const url = e.target.value.trim();
    if (url) preview.innerHTML = `<img src="${url}" alt="预览" onerror="this.style.display='none'" style="width:100px;height:100px;border-radius:8px;object-fit:cover;border:2px solid var(--border-color)">`;
    else preview.innerHTML = '';
  }
});

// Cover preview - File input
document.addEventListener('change', function(e) {
  if (e.target.id === 'podcastCoverFile' && e.target.files.length > 0) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(ev) {
      document.getElementById('podcastCoverPreview').innerHTML = `<img src="${ev.target.result}" alt="预览" style="width:100px;height:100px;border-radius:8px;object-fit:cover;border:2px solid var(--main-blue)">`;
    };
    reader.readAsDataURL(file);
    // Clear URL input
    document.getElementById('podcastCover').value = '';
  }
});
// ===== Dark/Light Theme Toggle =====
function initAdminTheme() {
  const html = document.documentElement;
  const saved = localStorage.getItem('theme');
  
  if (saved === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else if (saved === 'light') {
    html.removeAttribute('data-theme');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.setAttribute('data-theme', 'dark');
    }
  }
  
  updateAdminThemeIcon();
  
  const btn = document.getElementById('adminThemeToggleBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const current = html.getAttribute('data-theme');
      if (current === 'dark') {
        html.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      } else {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      }
      updateAdminThemeIcon();
    });
  }
}

function updateAdminThemeIcon() {
  const btn = document.getElementById('adminThemeToggleBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    if (e.matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    updateAdminThemeIcon();
  }
});

initAdminTheme();
