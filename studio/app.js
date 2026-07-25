'use strict';
/* ═══════════════════════════════════════════════════════════════
   ListenLeap Admin Studio — app.js
   Pure vanilla JS · No build step · Django Same-Origin API
═══════════════════════════════════════════════════════════════ */

// ─── Helpers ────────────────────────────────────────────────
const BASE = ''; // Same-origin: /api, /admin, etc. already rooted

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function resolveMediaUrl(val) {
  if (!val) return null;
  if (val.startsWith('http')) return val;
  if (val.startsWith('/media/')) return val;
  return '/media/' + val;
}

function durationFmt(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function debounce(fn, ms = 300) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ─── API Layer ───────────────────────────────────────────────
function getAuthHeaders(includeJson = true) {
  const token = localStorage.getItem('ll_admin_token');
  const h = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (includeJson) h['Content-Type'] = 'application/json';
  return h;
}

async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: getAuthHeaders(false) });
  if (res.status === 401) { handle401(); throw new Error('UNAUTHORIZED'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || err.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) { handle401(); throw new Error('UNAUTHORIZED'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || err.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiPatch(path, bodyOrFormData, isFormData = false) {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: isFormData ? getAuthHeaders(false) : getAuthHeaders(),
    body: bodyOrFormData,
  });
  if (res.status === 401) { handle401(); throw new Error('UNAUTHORIZED'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || err.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(BASE + path, {
    method: 'DELETE',
    headers: getAuthHeaders(false),
  });
  if (res.status === 401) { handle401(); throw new Error('UNAUTHORIZED'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || err.error || `HTTP ${res.status}`); }
  return true;
}

function handle401() {
  localStorage.removeItem('ll_admin_token');
  showToast('error', '登录已过期', '请重新登录');
  setTimeout(() => location.reload(), 1200);
}

// ─── Toast Notifications ───────────────────────────────────
function showToast(type, title, message, duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { success: 'fa-check-circle', error: 'fa-xmark-circle', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${esc(type)}`;
  toast.innerHTML = `
    <i class="fa-solid ${esc(icons[type] || icons.info)} toast-icon"></i>
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${message ? `<div class="toast-message">${esc(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
  `;
  toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));
  container.appendChild(toast);

  function dismiss(el) {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }

  if (duration > 0) setTimeout(() => dismiss(toast), duration);
}

// ─── Theme ──────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('theme-icon');
  const label = document.querySelector('#theme-toggle span');
  if (icon) {
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
  if (label) label.textContent = theme === 'dark' ? '浅色模式' : '深色模式';
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

// ─── App State ───────────────────────────────────────────────
let currentPage = 'dashboard';
let podcastsCache = [];
let episodesCache = [];
let categoriesCache = [];

// ─── Auth / Login ───────────────────────────────────────────
async function tryAutoLogin() {
  const token = localStorage.getItem('ll_admin_token');
  if (!token) { showLogin(); return; }
  try {
    await apiGet('/api/admin/podcasts/');
    showShell();
  } catch {
    localStorage.removeItem('ll_admin_token');
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showShell() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  loadDashboard();
}

function setLoadingBtn(btn, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function setupLogin() {
  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      errorEl.textContent = '请输入用户名和密码';
      return;
    }

    setLoadingBtn(btn, true);
    errorEl.textContent = '';

    try {
      const data = await fetch(BASE + '/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.non_field_errors ? b.non_field_errors.join(' ') : (b.detail || '登录失败，请检查用户名和密码'));
        }
        return r.json();
      });

      localStorage.setItem('ll_admin_token', data.tokens.access);
      // Try to store username
      if (data.user) {
        localStorage.setItem('ll_admin_username', data.user.username || data.user.email || username);
      }

      showShell();
      updateAdminNames();
    } catch (err) {
      errorEl.textContent = err.message || '登录失败，请检查用户名和密码';
    } finally {
      setLoadingBtn(btn, false);
    }
  });
}

function updateAdminNames() {
  const name = localStorage.getItem('ll_admin_username') || 'Admin';
  const el1 = document.getElementById('sidebar-username');
  const el2 = document.getElementById('header-admin-name');
  if (el1) el1.textContent = name;
  if (el2) el2.textContent = name;
}

// ─── Navigation ─────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '仪表盘',
  podcasts: '播客管理',
  episodes: '节目管理',
  categories: '分类管理',
  users: '用户管理',
};

function setupNav() {
  // Nav links
  document.querySelectorAll('.nav-link[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.nav;
      navigateTo(page);
    });
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Close sidebar on backdrop click (mobile)
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !document.getElementById('sidebar-toggle').contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Header refresh
  document.getElementById('header-refresh-btn').addEventListener('click', () => {
    const icon = document.getElementById('header-refresh-icon');
    icon.classList.add('spinning');
    loadCurrentPage();
    setTimeout(() => icon.classList.remove('spinning'), 800);
  });
}

function navigateTo(page) {
  currentPage = page;
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-nav="${page}"]`)?.classList.add('active');

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  loadCurrentPage();
}

function loadCurrentPage() {
  switch (currentPage) {
    case 'dashboard':   loadDashboard(); break;
    case 'podcasts':    loadPodcasts(); break;
    case 'episodes':    loadEpisodes(); break;
    case 'categories':  loadCategories(); break;
  }
}

// ─── Modal Utilities ─────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Focus first input
  const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  // Reset form if present
  const form = modal.querySelector('form');
  if (form) form.reset();
}

function setupModals() {
  // Close button
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Overlay click close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ESC key close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal-overlay:not(.hidden)');
      if (openModal) closeModal(openModal.id);
    }
  });

  // Confirm delete setup
  document.getElementById('confirm-delete-btn').addEventListener('click', handleConfirmDelete);
}

let pendingDelete = null; // { type, id, name }

function confirmDelete(type, id, name) {
  pendingDelete = { type, id, name };
  document.getElementById('confirm-message').textContent = `确定要删除「${name}」吗？此操作不可撤销。`;
  openModal('modal-confirm');
}

async function handleConfirmDelete() {
  if (!pendingDelete) return;
  const btn = document.getElementById('confirm-delete-btn');
  setLoadingBtn(btn, true);

  try {
    if (pendingDelete.type === 'podcast') {
      await apiDelete(`/api/admin/podcasts/${pendingDelete.id}/`);
      showToast('success', '删除成功', `「${pendingDelete.name}」已删除`);
    } else if (pendingDelete.type === 'episode') {
      await apiDelete(`/api/episodes/${pendingDelete.id}/`);
      showToast('success', '删除成功', `节目已删除`);
    } else if (pendingDelete.type === 'category') {
      await apiDelete(`/api/categories/${pendingDelete.id}/`);
      showToast('success', '删除成功', `「${pendingDelete.name}」已删除`);
    }
    closeModal('modal-confirm');
    loadCurrentPage();
  } catch (err) {
    showToast('error', '删除失败', err.message);
  } finally {
    setLoadingBtn(btn, false);
    pendingDelete = null;
  }
}

// ─── Dashboard ───────────────────────────────────────────────
async function loadDashboard() {
  const statsGrid = document.getElementById('stats-grid');
  const chartEl = document.getElementById('difficulty-chart');
  const recentEl = document.getElementById('recent-podcasts');

  // Reset
  statsGrid.querySelectorAll('.stat-card').forEach(c => {
    c.classList.add('loading');
    c.querySelector('.stat-value').textContent = '—';
  });
  chartEl.innerHTML = '<div class="chart-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';
  recentEl.innerHTML = '<div class="chart-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';

  const [podcastsResult, episodesResult, categoriesResult] = await Promise.allSettled([
    apiGet('/api/admin/podcasts/'),
    apiGet('/api/admin/episodes/'),
    apiGet('/api/categories/'),
  ]);

  const podcasts = podcastsResult.status === 'fulfilled' ? podcastsResult.value.results || podcastsResult.value : [];
  const episodes = episodesResult.status === 'fulfilled' ? episodesResult.value.results || episodesResult.value : [];
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value.results || categoriesResult.value : [];

  // Stats
  const cards = statsGrid.querySelectorAll('.stat-card');
  const statVals = [
    podcasts.length || '0',
    episodes.length || '0',
    categories.length || '0',
    '—',
  ];
  cards.forEach((card, i) => {
    card.classList.remove('loading');
    const valEl = card.querySelector('.stat-value');
    if (valEl) {
      if (i === 3) {
        valEl.innerHTML = '<a href="/admin/accounts/user/" target="_blank" class="stat-link">查看 →</a>';
      } else {
        valEl.textContent = statVals[i];
      }
    }
  });

  // Difficulty chart
  renderDifficultyChart(chartEl, podcasts);

  // Recent podcasts (sort by created_at desc, take 8)
  const recent = [...podcasts]
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at) : new Date(0);
      const tb = b.created_at ? new Date(b.created_at) : new Date(0);
      return tb - ta;
    })
    .slice(0, 8);
  renderRecentPodcasts(recentEl, recent);
}

function renderDifficultyChart(el, podcasts) {
  const counts = { beginner: 0, intermediate: 0, advanced: 0 };
  podcasts.forEach(p => {
    if (p.difficulty && counts.hasOwnProperty(p.difficulty)) counts[p.difficulty]++;
  });
  const total = Math.max(1, podcasts.length);

  const labels = [
    { key: 'beginner', label: '初级', color: '#22c55e' },
    { key: 'intermediate', label: '中级', color: '#f59e0b' },
    { key: 'advanced', label: '高级', color: '#ef4444' },
  ];

  el.innerHTML = labels.map(({ key, label, color }) => `
    <div class="difficulty-bar-group">
      <div class="difficulty-bar-header">
        <span class="difficulty-bar-label">
          <span class="difficulty-bar-label-dot ${key}"></span>
          ${esc(label)}
        </span>
        <span class="difficulty-bar-count">${counts[key]} 个</span>
      </div>
      <div class="difficulty-track">
        <div class="difficulty-fill ${key}" style="width:${(counts[key] / total * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderRecentPodcasts(el, podcasts) {
  if (!podcasts.length) {
    el.innerHTML = '<div class="chart-loading">暂无数据</div>';
    return;
  }
  el.innerHTML = `<div class="recent-list">${podcasts.map(p => `
    <div class="recent-item">
      <img class="recent-cover"
           src="${esc(resolveMediaUrl(p.cover_image) || '')}"
           alt="${esc(p.title)}"
           onerror="this.style.display='none'">
      <div class="recent-info">
        <div class="recent-title">${esc(p.title)}</div>
        <div class="recent-meta">${esc(p.category_name || '未分类')} · ${esc(p.difficulty || '')}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

// ─── Podcasts ───────────────────────────────────────────────
const PODCAST_FILTER_DEBOUNCE = debounce(() => renderPodcastsTable(), 350);

function setupPodcasts() {
  document.getElementById('podcast-search').addEventListener('input', PODCAST_FILTER_DEBOUNCE);
  document.getElementById('podcast-difficulty-filter').addEventListener('change', renderPodcastsTable);
  document.getElementById('podcast-status-filter').addEventListener('change', renderPodcastsTable);

  document.getElementById('btn-add-podcast').addEventListener('click', () => {
    openPodcastModal();
  });

  setupPodcastForm();

  // Cover URL → preview
  document.getElementById('podcast-cover-url').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById('podcast-cover-preview');
    const placeholder = document.getElementById('podcast-cover-placeholder');
    if (url && (url.startsWith('http') || url.startsWith('/'))) {
      preview.src = url.startsWith('http') ? url : url;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      preview.onerror = () => { preview.style.display = 'none'; placeholder.style.display = 'flex'; };
    } else {
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  });

  // Cover file → preview
  document.getElementById('podcast-cover-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const filenameEl = document.getElementById('podcast-cover-filename');
    const preview = document.getElementById('podcast-cover-preview');
    const placeholder = document.getElementById('podcast-cover-placeholder');
    if (file) {
      filenameEl.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.src = ev.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      filenameEl.textContent = '';
    }
  });
}

async function loadPodcasts() {
  try {
    const data = await apiGet('/api/admin/podcasts/');
    podcastsCache = data.results || data;
    await loadCategoriesForSelect();
    renderPodcastsTable();
  } catch (err) {
    document.getElementById('podcasts-tbody').innerHTML = `<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-circle-exclamation"></i> 加载失败: ${esc(err.message)}</td></tr>`;
  }
}

function renderPodcastsTable() {
  const search = document.getElementById('podcast-search').value.toLowerCase().trim();
  const diff = document.getElementById('podcast-difficulty-filter').value;
  const status = document.getElementById('podcast-status-filter').value;

  let filtered = podcastsCache;
  if (search) filtered = filtered.filter(p => (p.title || '').toLowerCase().includes(search) || (p.author || '').toLowerCase().includes(search));
  if (diff) filtered = filtered.filter(p => p.difficulty === diff);
  if (status === 'active') filtered = filtered.filter(p => p.is_active);
  if (status === 'inactive') filtered = filtered.filter(p => !p.is_active);

  const tbody = document.getElementById('podcasts-tbody');

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-inbox"></i> 暂无播客数据</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr data-id="${p.id}">
      <td>
        <img class="cell-cover" src="${esc(resolveMediaUrl(p.cover_image) || '')}" alt="${esc(p.title)}" onerror="this.style.display='none'; this.outerHTML='<div class=cell-cover style=display:flex;align-items:center;justify-content:center><i class=\\'fa-solid fa-podcast\\' style=\\'color:var(--text-tertiary);font-size:14px\\'></i></div>'">
      </td>
      <td><span class="cell-title" title="${esc(p.title)}">${esc(p.title)}</span></td>
      <td class="cell-text">${esc(p.author || '—')}</td>
      <td><span class="badge badge-category">${esc(p.category_name || '—')}</span></td>
      <td><span class="badge ${esc(p.difficulty || '')}">${difficultyLabel(p.difficulty)}</span></td>
      <td class="font-heading" style="text-align:center;font-weight:600">${p.episode_count ?? 0}</td>
      <td>
        ${p.is_featured ? '<i class="fa-solid fa-star" style="color:var(--warning);font-size:13px"></i>' : '<i class="fa-regular fa-star" style="color:var(--text-tertiary);font-size:13px"></i>'}
      </td>
      <td><span class="badge ${p.is_active ? 'active' : 'inactive'}">${p.is_active ? '已上架' : '已下架'}</span></td>
      <td>
        <div class="action-group">
          <button class="btn-icon btn-edit" title="编辑" data-action="edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon btn-toggle" title="${p.is_active ? '下架' : '上架'}" data-action="toggle" data-id="${p.id}">
            <i class="fa-solid ${p.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button class="btn-icon btn-featured" title="${p.is_featured ? '取消推荐' : '设为推荐'}" data-action="toggle-featured" data-id="${p.id}">
            <i class="fa-solid ${p.is_featured ? 'fa-star' : 'fa-star-half-stroke'}"></i>
          </button>
          <button class="btn-icon btn-delete" title="删除" data-action="delete" data-id="${p.id}"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>
  `).join('');

  // Bind actions
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const action = btn.dataset.action;
      const podcast = podcastsCache.find(p => p.id === id);
      if (!podcast) return;

      if (action === 'edit') openPodcastModal(podcast);
      else if (action === 'toggle') togglePodcastActive(podcast);
      else if (action === 'toggle-featured') togglePodcastFeatured(podcast);
      else if (action === 'delete') confirmDelete('podcast', podcast.id, podcast.title);
    });
  });
}

function difficultyLabel(diff) {
  const map = { beginner: '初级', intermediate: '中级', advanced: '高级' };
  return map[diff] || diff || '—';
}

async function togglePodcastActive(podcast) {
  try {
    await apiPatch(`/api/admin/podcasts/${podcast.id}/toggle/`, {});
    podcast.is_active = !podcast.is_active;
    renderPodcastsTable();
    showToast('success', podcast.is_active ? '上架成功' : '下架成功', `「${podcast.title}」`);
  } catch (err) {
    showToast('error', '操作失败', err.message);
  }
}

async function togglePodcastFeatured(podcast) {
  try {
    await apiPatch(`/api/admin/podcasts/${podcast.id}/toggle_featured/`, {});
    podcast.is_featured = !podcast.is_featured;
    renderPodcastsTable();
    showToast('success', podcast.is_featured ? '已设为推荐' : '已取消推荐', `「${podcast.title}」`);
  } catch (err) {
    showToast('error', '操作失败', err.message);
  }
}

// ─── Podcast Form ───────────────────────────────────────────
let editingPodcastId = null;

function setupPodcastForm() {
  const form = document.getElementById('form-podcast');
  const submitBtn = document.getElementById('podcast-submit-btn');

  // Slug auto-generate from title
  document.getElementById('podcast-title').addEventListener('input', (e) => {
    const title = e.target.value.trim();
    const slugInput = document.getElementById('podcast-slug');
    if (slugInput && !slugInput.dataset.manual) {
      slugInput.value = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
    }
  });

  // Color sync
  document.getElementById('category-color').addEventListener('input', (e) => {
    document.getElementById('category-color-text').value = e.target.value;
  });
  document.getElementById('category-color-text').addEventListener('input', (e) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) document.getElementById('category-color').value = v;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitPodcastForm(submitBtn);
  });
}

function openPodcastModal(podcast = null) {
  editingPodcastId = podcast ? podcast.id : null;
  const form = document.getElementById('form-podcast');
  form.reset();

  document.getElementById('podcast-cover-preview').style.display = 'none';
  document.getElementById('podcast-cover-placeholder').style.display = 'flex';
  document.getElementById('podcast-cover-filename').textContent = '';
  document.getElementById('podcast-id').value = '';
  document.getElementById('podcast-cover-url').value = '';
  document.getElementById('podcast-cover-file').value = '';

  document.getElementById('modal-podcast-title').textContent = podcast ? '编辑播客' : '添加播客';

  if (podcast) {
    document.getElementById('podcast-id').value = podcast.id;
    document.getElementById('podcast-title').value = podcast.title || '';
    document.getElementById('podcast-author').value = podcast.author || '';
    document.getElementById('podcast-description').value = podcast.description || '';
    document.getElementById('podcast-category').value = podcast.category || '';
    document.getElementById('podcast-difficulty').value = podcast.difficulty || 'beginner';
    document.getElementById('podcast-language').value = podcast.language || 'en';
    document.getElementById('podcast-featured').checked = !!podcast.is_featured;
    document.getElementById('podcast-active').checked = podcast.is_active !== false;

    if (podcast.cover_image) {
      const url = resolveMediaUrl(podcast.cover_image);
      document.getElementById('podcast-cover-url').value = url;
      document.getElementById('podcast-cover-preview').src = url;
      document.getElementById('podcast-cover-preview').style.display = 'block';
      document.getElementById('podcast-cover-placeholder').style.display = 'none';
    }
  } else {
    document.getElementById('podcast-active').checked = true;
    document.getElementById('podcast-featured').checked = false;
  }

  openModal('modal-podcast');
}

async function loadCategoriesForSelect() {
  try {
    const data = await apiGet('/api/categories/');
    const cats = data.results || data;
    categoriesCache = cats;

    ['podcast-category', 'episode-podcast'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = `<option value="">请选择分类…</option>` + cats.map(c =>
        `<option value="${c.id}">${esc(c.name)}</option>`
      ).join('');
      sel.value = current;
    });
  } catch { /* silent */ }
}

async function submitPodcastForm(submitBtn) {
  const title = document.getElementById('podcast-title').value.trim();
  const author = document.getElementById('podcast-author').value.trim();
  const description = document.getElementById('podcast-description').value.trim();
  const category = parseInt(document.getElementById('podcast-category').value) || null;
  const difficulty = document.getElementById('podcast-difficulty').value;
  const language = document.getElementById('podcast-language').value;
  const is_featured = document.getElementById('podcast-featured').checked;
  const is_active = document.getElementById('podcast-active').checked;
  const coverUrl = document.getElementById('podcast-cover-url').value.trim();
  const coverFile = document.getElementById('podcast-cover-file').files[0];

  if (!title) { showToast('error', '请填写必填项', '标题为必填项'); return; }
  if (!category) { showToast('error', '请填写必填项', '请选择分类'); return; }

  setLoadingBtn(submitBtn, true);

  try {
    const body = {
      title, author, description,
      category, difficulty, language,
      is_featured, is_active,
      cover_image: coverUrl || null,
    };

    let saved;
    if (editingPodcastId) {
      saved = await apiPatch(`/api/admin/podcasts/${editingPodcastId}/`, body);
    } else {
      saved = await apiPost('/api/admin/podcasts/', body);
    }

    // Upload cover if file selected
    if (coverFile) {
      const fd = new FormData();
      fd.append('cover_image', coverFile);
      if (editingPodcastId) {
        await apiPatch(`/api/admin/podcasts/${saved.id}/`, fd, true);
      }
    }

    closeModal('modal-podcast');
    showToast('success', editingPodcastId ? '播客已更新' : '播客已创建', `「${title}」`);
    loadPodcasts();
  } catch (err) {
    showToast('error', '保存失败', err.message);
  } finally {
    setLoadingBtn(submitBtn, false);
  }
}

// ─── Episodes ────────────────────────────────────────────────
const EPISODE_FILTER_DEBOUNCE = debounce(() => renderEpisodesTable(), 350);

function setupEpisodes() {
  document.getElementById('episode-search').addEventListener('input', EPISODE_FILTER_DEBOUNCE);
  document.getElementById('episode-podcast-filter').addEventListener('change', renderEpisodesTable);
  document.getElementById('episode-status-filter').addEventListener('change', renderEpisodesTable);
  document.getElementById('btn-add-episode').addEventListener('click', () => openEpisodeModal());

  setupEpisodeForm();

  // Audio file → filename display
  document.getElementById('episode-audio-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('episode-audio-filename').textContent = file ? file.name : '';
  });
}

async function loadEpisodes() {
  try {
    const [epData, podData] = await Promise.allSettled([
      apiGet('/api/admin/episodes/'),
      apiGet('/api/admin/podcasts/'),
    ]);

    episodesCache = (epData.status === 'fulfilled' ? (epData.value.results || epData.value) : []);
    const podcasts = (podData.status === 'fulfilled' ? (podData.value.results || podData.value) : []);

    // Populate podcast filter
    const podSel = document.getElementById('episode-podcast-filter');
    const podCurrent = podSel.value;
    podSel.innerHTML = `<option value="">全部播客</option>` + podcasts.map(p =>
      `<option value="${p.id}">${esc(p.title)}</option>`
    ).join('');
    podSel.value = podCurrent;

    // Cache podcasts for episode form
    podcastsCache = podcasts;

    renderEpisodesTable();
  } catch (err) {
    document.getElementById('episodes-tbody').innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-circle-exclamation"></i> 加载失败: ${esc(err.message)}</td></tr>`;
  }
}

function renderEpisodesTable() {
  const search = document.getElementById('episode-search').value.toLowerCase().trim();
  const podId = document.getElementById('episode-podcast-filter').value;
  const status = document.getElementById('episode-status-filter').value;

  let filtered = episodesCache;
  if (search) filtered = filtered.filter(e => (e.title || '').toLowerCase().includes(search) || (e.podcast_title || '').toLowerCase().includes(search));
  if (podId) filtered = filtered.filter(e => e.podcast === parseInt(podId));
  if (status === 'active') filtered = filtered.filter(e => e.is_active);
  if (status === 'inactive') filtered = filtered.filter(e => !e.is_active);

  const tbody = document.getElementById('episodes-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-inbox"></i> 暂无节目数据</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr data-id="${e.id}">
      <td><span class="cell-title" title="${esc(e.title)}">${esc(e.title)}</span></td>
      <td class="cell-text">${esc(e.podcast_title || '—')}</td>
      <td><span class="cell-duration">${durationFmt(e.audio_duration)}</span></td>
      <td style="text-align:center"><span class="font-heading" style="font-weight:600">${e.episode_number || '—'}</span></td>
      <td class="font-heading" style="text-align:center;font-weight:600">${e.play_count ?? 0}</td>
      <td><span class="badge ${e.is_active ? 'active' : 'inactive'}">${e.is_active ? '已上架' : '已下架'}</span></td>
      <td>
        <div class="action-group">
          <button class="btn-icon btn-edit" title="编辑" data-action="edit" data-id="${e.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon btn-toggle" title="${e.is_active ? '下架' : '上架'}" data-action="toggle" data-id="${e.id}">
            <i class="fa-solid ${e.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button class="btn-icon btn-delete" title="删除" data-action="delete" data-id="${e.id}"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const action = btn.dataset.action;
      const episode = episodesCache.find(e => e.id === id);
      if (!episode) return;
      if (action === 'edit') openEpisodeModal(episode);
      else if (action === 'toggle') toggleEpisodeActive(episode);
      else if (action === 'delete') confirmDelete('episode', episode.id, episode.title);
    });
  });
}

async function toggleEpisodeActive(episode) {
  try {
    await apiPatch(`/api/admin/episodes/${episode.id}/toggle/`, {});
    episode.is_active = !episode.is_active;
    renderEpisodesTable();
    showToast('success', episode.is_active ? '已上架' : '已下架', `「${episode.title}」`);
  } catch (err) {
    showToast('error', '操作失败', err.message);
  }
}

// ─── Episode Form ───────────────────────────────────────────
let editingEpisodeId = null;

function setupEpisodeForm() {
  const form = document.getElementById('form-episode');
  const submitBtn = document.getElementById('episode-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitEpisodeForm(submitBtn);
  });
}

function openEpisodeModal(episode = null) {
  editingEpisodeId = episode ? episode.id : null;
  const form = document.getElementById('form-episode');
  form.reset();
  document.getElementById('episode-id').value = '';
  document.getElementById('episode-audio-filename').textContent = '';

  document.getElementById('modal-episode-title').textContent = episode ? '编辑节目' : '添加节目';

  // Populate podcast select
  const podSel = document.getElementById('episode-podcast');
  podSel.innerHTML = `<option value="">请选择播客…</option>` + podcastsCache.map(p =>
    `<option value="${p.id}">${esc(p.title)}</option>`
  ).join('');

  if (episode) {
    document.getElementById('episode-id').value = episode.id;
    document.getElementById('episode-podcast').value = episode.podcast || '';
    document.getElementById('episode-title').value = episode.title || '';
    document.getElementById('episode-desc').value = episode.description || '';
    document.getElementById('episode-number').value = episode.episode_number || '';
    document.getElementById('episode-duration').value = episode.audio_duration || '';
    document.getElementById('episode-publish-date').value = episode.publish_date || '';
    document.getElementById('episode-audio-url').value = episode.audio_url || '';
    document.getElementById('episode-subtitle-en').value = episode.subtitle_en || '';
    document.getElementById('episode-subtitle-zh').value = episode.subtitle_zh || '';
    document.getElementById('episode-active').checked = episode.is_active !== false;
  } else {
    document.getElementById('episode-active').checked = true;
  }

  openModal('modal-episode');
}

async function submitEpisodeForm(submitBtn) {
  const podcast = parseInt(document.getElementById('episode-podcast').value) || null;
  const title = document.getElementById('episode-title').value.trim();
  const description = document.getElementById('episode-desc').value.trim();
  const episode_number = parseInt(document.getElementById('episode-number').value) || null;
  const audio_duration = parseInt(document.getElementById('episode-duration').value) || null;
  const publish_date = document.getElementById('episode-publish-date').value || null;
  const audio_url = document.getElementById('episode-audio-url').value.trim();
  const subtitle_en = document.getElementById('episode-subtitle-en').value.trim();
  const subtitle_zh = document.getElementById('episode-subtitle-zh').value.trim();
  const is_active = document.getElementById('episode-active').checked;
  const audioFile = document.getElementById('episode-audio-file').files[0];

  if (!title) { showToast('error', '请填写必填项', '节目标题为必填项'); return; }
  if (!podcast) { showToast('error', '请填写必填项', '请选择所属播客'); return; }

  setLoadingBtn(submitBtn, true);

  try {
    const body = {
      podcast, title, description, episode_number,
      audio_duration, publish_date, audio_url,
      subtitle_en, subtitle_zh, is_active,
    };

    let saved;
    if (editingEpisodeId) {
      saved = await apiPatch(`/api/episodes/${editingEpisodeId}/`, body);
    } else {
      saved = await apiPost('/api/episodes/', body);
    }

    // Upload audio if file selected
    if (audioFile) {
      const fd = new FormData();
      fd.append('audio_file', audioFile);
      await apiPatch(`/api/episodes/${saved.id}/`, fd, true);
    }

    closeModal('modal-episode');
    showToast('success', editingEpisodeId ? '节目已更新' : '节目已创建', `「${title}」`);
    loadEpisodes();
  } catch (err) {
    showToast('error', '保存失败', err.message);
  } finally {
    setLoadingBtn(submitBtn, false);
  }
}

// ─── Categories ─────────────────────────────────────────────
const CATEGORY_FILTER_DEBOUNCE = debounce(() => renderCategoriesTable(), 300);

function setupCategories() {
  document.getElementById('category-search').addEventListener('input', CATEGORY_FILTER_DEBOUNCE);
  document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal());

  setupCategoryForm();

  // Color sync
  document.getElementById('category-color').addEventListener('input', (e) => {
    document.getElementById('category-color-text').value = e.target.value;
  });
  document.getElementById('category-color-text').addEventListener('input', (e) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) document.getElementById('category-color').value = v;
  });

  // Auto-slug
  document.getElementById('category-name').addEventListener('input', (e) => {
    const name = e.target.value.trim();
    const slugEl = document.getElementById('category-slug');
    if (!slugEl.dataset.manual) {
      slugEl.value = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
    }
  });
}

function setupCategoryForm() {
  document.getElementById('form-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitCategoryForm(document.getElementById('category-submit-btn'));
  });
}

async function loadCategories() {
  try {
    const data = await apiGet('/api/categories/');
    categoriesCache = data.results || data;
    renderCategoriesTable();
  } catch (err) {
    document.getElementById('categories-tbody').innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-circle-exclamation"></i> 加载失败: ${esc(err.message)}</td></tr>`;
  }
}

function renderCategoriesTable() {
  const search = document.getElementById('category-search').value.toLowerCase().trim();
  let filtered = categoriesCache;
  if (search) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(search) ||
      (c.slug || '').toLowerCase().includes(search)
    );
  }

  const tbody = document.getElementById('categories-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-inbox"></i> 暂无分类</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => `
    <tr data-id="${c.id}">
      <td>
        <span class="category-color-dot" style="background:${esc(c.color || '#5858f5')}" title="${esc(c.color)}"></span>
      </td>
      <td><strong>${esc(c.name)}</strong></td>
      <td><code style="font-size:12px;color:var(--text-secondary)">${esc(c.slug)}</code></td>
      <td>
        <div class="category-icon-preview">
          <i class="fa-solid ${esc(c.icon || 'fa-folder')}" style="color:${esc(c.color || '#5858f5')}"></i>
        </div>
      </td>
      <td class="font-heading" style="text-align:center;font-weight:600">${c.sort_order ?? 0}</td>
      <td><span class="badge ${c.is_active ? 'active' : 'inactive'}">${c.is_active ? '激活' : '停用'}</span></td>
      <td>
        <div class="action-group">
          <button class="btn-icon btn-edit" title="编辑" data-action="edit" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon btn-toggle" title="${c.is_active ? '停用' : '激活'}" data-action="toggle" data-id="${c.id}">
            <i class="fa-solid ${c.is_active ? 'fa-ban' : 'fa-check'}"></i>
          </button>
          <button class="btn-icon btn-delete" title="删除" data-action="delete" data-id="${c.id}"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const action = btn.dataset.action;
      const cat = categoriesCache.find(c => c.id === id);
      if (!cat) return;
      if (action === 'edit') openCategoryModal(cat);
      else if (action === 'toggle') toggleCategoryActive(cat);
      else if (action === 'delete') confirmDelete('category', cat.id, cat.name);
    });
  });
}

async function toggleCategoryActive(cat) {
  try {
    const updated = await apiPatch(`/api/categories/${cat.id}/`, { is_active: !cat.is_active });
    cat.is_active = updated.is_active;
    renderCategoriesTable();
    showToast('success', cat.is_active ? '已激活' : '已停用', `「${cat.name}」`);
  } catch (err) {
    showToast('error', '操作失败', err.message);
  }
}

let editingCategoryId = null;

function openCategoryModal(cat = null) {
  editingCategoryId = cat ? cat.id : null;
  const form = document.getElementById('form-category');
  form.reset();

  document.getElementById('modal-category-title').textContent = cat ? '编辑分类' : '添加分类';

  if (cat) {
    document.getElementById('category-id').value = cat.id;
    document.getElementById('category-name').value = cat.name || '';
    document.getElementById('category-slug').value = cat.slug || '';
    document.getElementById('category-icon').value = cat.icon || '';
    document.getElementById('category-color').value = cat.color || '#5858f5';
    document.getElementById('category-color-text').value = cat.color || '#5858f5';
    document.getElementById('category-sort').value = cat.sort_order ?? 0;
    document.getElementById('category-active').checked = cat.is_active !== false;
  } else {
    document.getElementById('category-active').checked = true;
    document.getElementById('category-color').value = '#5858f5';
    document.getElementById('category-color-text').value = '#5858f5';
    document.getElementById('category-sort').value = 0;
  }

  openModal('modal-category');
}

async function submitCategoryForm(submitBtn) {
  const name = document.getElementById('category-name').value.trim();
  const slug = document.getElementById('category-slug').value.trim().toLowerCase();
  const icon = document.getElementById('category-icon').value.trim();
  const color = document.getElementById('category-color-text').value.trim() || '#5858f5';
  const sort_order = parseInt(document.getElementById('category-sort').value) || 0;
  const is_active = document.getElementById('category-active').checked;

  if (!name) { showToast('error', '请填写必填项', '分类名称为必填项'); return; }
  if (!slug) { showToast('error', '请填写必填项', 'Slug 为必填项'); return; }

  setLoadingBtn(submitBtn, true);

  try {
    const body = { name, slug, icon, color, sort_order, is_active };
    if (editingCategoryId) {
      await apiPatch(`/api/categories/${editingCategoryId}/`, body);
      showToast('success', '分类已更新', `「${name}」`);
    } else {
      await apiPost('/api/categories/', body);
      showToast('success', '分类已创建', `「${name}」`);
    }
    closeModal('modal-category');
    loadCategories();
  } catch (err) {
    showToast('error', '保存失败', err.message);
  } finally {
    setLoadingBtn(submitBtn, false);
  }
}

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupLogin();
  setupNav();
  setupModals();
  setupPodcasts();
  setupEpisodes();
  setupCategories();

  tryAutoLogin();
});
