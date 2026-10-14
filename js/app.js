// ===== ListenBook App Logic =====

// ===== Global error surfacing (so silent failures become visible) =====
function showFatalError(msg) {
  try {
    let b = document.getElementById('__errBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = '__errBanner';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#c0392b;color:#fff;font:12px/1.5 monospace;padding:10px 14px;white-space:pre-wrap;max-height:42vh;overflow:auto;box-shadow:0 -2px 12px rgba(0,0,0,.35)';
      (document.body || document.documentElement).appendChild(b);
    }
    b.textContent += String(msg) + '\n';
  } catch (e) { /* last resort */ }
}
try {
  window.addEventListener('error', e => showFatalError('ERR: ' + (e.error ? (e.error.stack || e.error.message) : e.message)));
  window.addEventListener('unhandledrejection', e => showFatalError('PROMISE: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
} catch (e) {}

// State
let currentCategory = 'all';
let currentPage = 'home';
let previousPage = 'home';
let currentPodcastId = null;
let currentPodcast = null;
let currentEpisodeIndex = 0;
let currentEpisodeList = [];
let favorites = new Set();
let userNotes = [];
let playbackHistory = [];
let isDraggingProgress = false;
let currentEpisodeData = null;
let displayedNotes = [];
let transcriptLines = [];
let transcriptMode = 'bilingual';
let lastActiveLineIdx = -1;

// ===== 播放详情页 Reader（按英语水平标注生词）=====
let readerLevel = 'cet4';
try { readerLevel = localStorage.getItem('lbReaderLevel') || 'cet4'; } catch (e) {}
let readerGlossOn = true;
try { readerGlossOn = localStorage.getItem('lbReaderGloss') !== '0'; } catch (e) {}
let readerDictOk = false;

// ===== Membership / Vocabulary / AI / Shadowing state =====
let currentTiers = [];
let currentMembership = null;
let currentFeatures = [];
let billingPeriod = 'monthly';
let paymentTierSlug = null;
let paymentMethod = 'wechat';
let userWords = [];
let ytPlayer = null;
let ytReady = false;
let shadowRecorder = null;
let shadowChunks = [];
let shadowTimerId = null;
let shadowStartTs = 0;
let shadowTargetDuration = 0;

// ===== Language Settings =====
let appLanguage = 'zh-CN';       // display language
let translationLanguage = 'zh-CN'; // translation/explanation language
const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文', native: '简体中文' },
  { code: 'zh-TW', name: '繁體中文', native: '繁體中文' },
  { code: 'en',    name: 'English', native: 'English' },
  { code: 'ja',    name: '日本語',  native: '日本語' },
  { code: 'ko',    name: '한국어',  native: '한국어' },
];

// ===== DOM Elements =====
const searchInput = document.getElementById('searchInput');
let backendPodcasts = [];
const homeView = document.getElementById('homeView');
const categoriesView = document.getElementById('categoriesView');
const followView = document.getElementById('followView');
const notesView = document.getElementById('notesView');
const historyView = document.getElementById('historyView');
const blogView = document.getElementById('blogView');
const detailView = document.getElementById('detailView');
const searchView = document.getElementById('searchView');
const membershipView = document.getElementById('membershipView');
const vocabView = document.getElementById('vocabView');
const languageView = document.getElementById('languageView');
const backBtn = document.getElementById('backBtn');
const audioPlayer = document.getElementById('audioPlayer');

// All views map
const views = {
  home: homeView,
  categories: categoriesView,
  follow: followView,
  notes: notesView,
  history: historyView,
  blog: blogView,
  detail: detailView,
  search: searchView,
  membership: membershipView,
  vocab: vocabView,
  language: languageView,
};

// ===== Downlisted podcast tracking =====
// Note: PODCAST_DATA is defined as `var` in js/data.js (loaded first).
// We no longer override it with Object.defineProperty since that throws
// "Cannot redefine property" on var-declared globals.  The downlist lookup
// is kept for informational purposes only.
async function syncDownlistedPodcasts() {
  try {
    const res = await fetch(`${API_BASE}/admin/podcasts/`);
    if (!res.ok) return;
    const data = await res.json();
    const backendPodcasts = data.results || data || [];

    const downlistedIds = new Set();

    PODCAST_DATA.forEach(p => {
      const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const found = backendPodcasts.find(bp => {
        const bpSlug = (bp.slug || '').toLowerCase().replace(/-+/g, '-');
        return bpSlug.includes(slug) || slug.includes(bpSlug) ||
               p.title.toLowerCase().includes((bp.title || '').toLowerCase()) ||
               (bp.title || '').toLowerCase().includes(p.title.toLowerCase());
      });

      if (found && !found.is_active) {
        downlistedIds.add(p.id);
      }
    });

    localStorage.setItem('downlisted_podcasts', JSON.stringify([...downlistedIds]));

    if (downlistedIds.size > 0) {
      window._downlistedIds = downlistedIds;
    }
  } catch (e) {
    console.log('Backend not available, using local data only');
    const stored = localStorage.getItem('downlisted_podcasts');
    if (stored) {
      window._downlistedIds = new Set(JSON.parse(stored));
    }
  }
}

// ===== Initialize =====
// Disable the browser's own scroll restoration: on refresh/direct-open of a hash
// page (e.g. #detail/backend-6) the browser remembers the previous scroll offset
// and re-applies it AFTER our async renders grow the page — overriding our
// scroll-to-top and leaving the user mid-page. We manage scrolling ourselves.
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}

// Instant scroll-to-top helper (bypasses CSS `scroll-behavior: smooth`)
function scrollToTopInstant() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch (e) {}
  // Belt & braces: historically <body> was an independent scroller (html/body
  // height:100% + overflow-x:hidden), so window.scrollTo() alone did nothing.
  // Reset every plausible scroller directly.
  [document.scrollingElement, document.documentElement, document.body].forEach(el => {
    if (el && el.scrollTop) el.scrollTop = 0;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Background loads — NON-blocking so nav always wires up even if the backend is slow/unreachable
  syncDownlistedPodcasts().catch(e => showFatalError('syncDownlistedPodcasts: ' + (e && e.message)));
  loadBackendPodcasts().then(async () => {
    try { renderHome(); } catch (e) {}
    // Pull server-side favorites so a refresh restores the authoritative set
    if (isLoggedIn()) { try { await loadFavoritesFromBackend(); } catch (e) {} }
    // Re-render any view that depends on the backend podcast list — notably the
    // "我的关注" page, which may have been drawn before podcasts finished loading
    // (e.g. on a refresh that restored the #follow hash). Without this, the grid
    // stays empty even though favorites were persisted in localStorage.
    if (currentPage === 'follow') { try { renderFollowPage(); } catch (e) {} }
    // Retry hash restore for detail pages (they need the backend podcast list)
    try { if (window.__pendingHashRestore) { window.__pendingHashRestore = !restorePageFromHash(); } } catch (e) {}
  }).catch(e => showFatalError('loadBackendPodcasts: ' + (e && e.message)));

  // Clear any autofilled values from the search input
  // (Chrome hard-refresh ignores autocomplete="off" and fills saved emails)
  setTimeout(() => {
    if (searchInput && searchInput.value && !/[\u4e00-\u9fa5]/.test(searchInput.value) && searchInput.value.includes('@')) {
      searchInput.value = '';
    }
  }, 100);
  setTimeout(() => {
    if (searchInput && searchInput.value && !/[\u4e00-\u9fa5]/.test(searchInput.value) && searchInput.value.includes('@')) {
      searchInput.value = '';
    }
  }, 500);

  renderHome();
  initCategoryFilters();
  initSearch();
  initBackButton();
  initLogoHome();
  initScrollButtons();
  initSidebar();
  initAuth();
  initPlayer();
  initShadow();
  initWordPopover();
  initReader();
  initCategoriesPage();
  setupBillingToggle();
  setupPaymentModal();
  updateUserUI();
  if (isLoggedIn()) { fetchMembership(); loadWords(); }
  loadFavoritesFromStorage();
  loadLanguageSettings();

  // Restore the page the user was on before refresh (from URL hash).
  // If it's a detail page whose podcast isn't loaded yet, mark pending — retried after loadBackendPodcasts.
  try {
    const restored = restorePageFromHash();
    if (!restored && (location.hash || '').startsWith('#detail/')) {
      window.__pendingHashRestore = true;
    }
  } catch (e) {}
});

async function loadBackendPodcasts() {
  try {
    const res = await fetch(`${API_BASE}/podcasts/`);
    if (!res.ok) return;
    const data = await res.json();
    const items = data.results || data || [];
    backendPodcasts = items.filter(p => p.is_active);
    try {
      const catRes = await fetch(`${API_BASE}/categories/`);
      if (catRes.ok) {
        const catData = await catRes.json();
        const cats = catData.results || catData || [];
        window._categoryMap = {};
        cats.forEach(c => { window._categoryMap[c.id] = c; });
      }
    } catch (e) {}
  } catch (e) {
    backendPodcasts = [];
  }
}

function getVisiblePodcasts() {
  const localPodcasts = Array.isArray(PODCAST_DATA) ? PODCAST_DATA : [];
  const backendMapped = backendPodcasts.map(p => ({
    id: `backend-${p.id}`,
    title: p.title,
    author: p.author || '未知作者',
    category: (window._categoryMap && window._categoryMap[p.category]) ? window._categoryMap[p.category].slug : (p.category_name ? String(p.category) : 'news'),
    categoryLabel: (window._categoryMap && window._categoryMap[p.category]) ? window._categoryMap[p.category].name : (p.category_name || '未分类'),
    difficulty: p.difficulty || 'intermediate',
    cover: (p.cover_url || p.cover_image) ? resolveMediaUrl(p.cover_url || p.cover_image) : `https://picsum.photos/seed/${p.slug || p.id}/300/300`,
    description: p.description || '',
    episodes: [],
    isFeatured: !!p.is_featured,
    isActive: p.is_active !== false,
    backendId: p.id,
  }));

  // Prefer backend (real) data. Only keep local mock entries that have no
  // backend counterpart, so the home page never shows duplicate podcasts
  // (one real + one fake) and every card plays genuine audio.
  if (backendMapped.length > 0) {
    const backendTitles = new Set(
      backendMapped.map(p => (p.title || '').trim().toLowerCase())
    );
    const localFallback = localPodcasts.filter(
      lp => !backendTitles.has((lp.title || '').trim().toLowerCase())
    );
    return [...backendMapped, ...localFallback];
  }
  return localPodcasts;
}

// ===== Navigation =====
function navigateTo(page) {
  previousPage = currentPage;
  currentPage = page;

  Object.values(views).forEach(v => v.classList.remove('active'));

  if (views[page]) {
    views[page].classList.add('active');
  }

  const categoriesBar = document.getElementById('categoriesBar');
  if (['home', 'search', 'detail'].includes(page)) {
    categoriesBar.style.display = '';
  } else {
    categoriesBar.style.display = 'none';
  }

  if (page === 'follow') {
    renderFollowPage();
  } else if (page === 'notes') {
    renderNotesPage();
  } else if (page === 'history') {
    renderHistoryPage();
  } else if (page === 'membership') {
    renderMembershipPage();
  } else if (page === 'vocab') {
    if (!isLoggedIn()) { showAuthModal('login'); return; }
    renderVocabPage();
  } else if (page === 'language') {
    renderLanguagePage();
  }

  // Persist current page in URL hash so refresh (F5/Ctrl+F5) stays on this page
  try {
    let h = page;
    if (page === 'detail' && currentPodcastId != null) {
      h = 'detail/' + encodeURIComponent(currentPodcastId);
    }
    history.replaceState(null, '', '#' + h);
  } catch (e) {}

  // Instant (non-smooth) scroll to top on view switch.
  // Why: CSS has `html { scroll-behavior: smooth }`, and smooth scrolling gets
  // aborted mid-way by the async re-renders that follow a view switch
  // (episode list fetch, innerHTML swaps, image loads), leaving the page
  // stuck partway down. `behavior: 'instant'` bypasses the CSS smoothness.
  scrollToTopInstant();

  // Keep the freshly-rendered page's static chrome in sync with the chosen display language.
  applyI18n();
}

// ===== Restore page from URL hash on load (refresh keeps current page) =====
function restorePageFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw) return false;
  // A cache-busting query (e.g. `#language?v=...`) or trailing params must not
  // corrupt the page token, so split off `?` and `/` before matching.
  const page = raw.split(/[?#/]/)[0];
  const paramRaw = raw.split('/')[1] || '';
  const param = paramRaw.split(/[?#]/)[0];
  const restorable = ['categories', 'follow', 'notes', 'history', 'blog', 'membership', 'vocab', 'detail', 'language'];
  if (!restorable.includes(page)) return false;
  // Login-gated pages: silently stay on home if not logged in (avoid modal on refresh)
  if (['follow', 'notes', 'vocab'].includes(page) && !isLoggedIn()) return false;

  if (page === 'detail') {
    if (!param) return false;
    const pid = decodeURIComponent(param);
    const podcast = getVisiblePodcasts().find(p => String(p.id) === String(pid));
    if (!podcast) return false; // backend list may not be loaded yet; caller can retry
    openDetail(pid);
    return true;
  }

  // Sync sidebar highlight with the restored page
  const sidebarItems = document.querySelectorAll('.sidebar-nav .sidebar-item');
  sidebarItems.forEach(i => i.classList.toggle('active', i.dataset.page === page));
  navigateTo(page);
  return true;
}

// ===== Category Filters =====
function initCategoryFilters() {
  const chips = document.querySelectorAll('.category-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentCategory = chip.dataset.cat;
      renderHome();
      if (currentPage !== 'home') {
        navigateTo('home');
      }
    });
  });
}

// ===== Logo Click to Home =====
function initLogoHome() {
  const sidebarLogo = document.querySelector('.sidebar-logo');
  if (sidebarLogo) {
    sidebarLogo.style.cursor = 'pointer';
    sidebarLogo.addEventListener('click', () => {
      resetToHome();
    });
  }
}

function resetToHome() {
  const chips = document.querySelectorAll('.category-chip');
  chips.forEach(c => c.classList.remove('active'));
  const allChip = document.querySelector('.category-chip[data-cat="all"]');
  if (allChip) allChip.classList.add('active');
  currentCategory = 'all';
  searchInput.value = '';

  const sidebarItems = document.querySelectorAll('.sidebar-nav .sidebar-item');
  sidebarItems.forEach(i => i.classList.remove('active'));
  const homeItem = document.querySelector('.sidebar-nav .sidebar-item[data-page="home"]');
  if (homeItem) homeItem.classList.add('active');

  renderHome();
  navigateTo('home');
}

// ===== Render Home Page =====
function renderHome() {
  const allPodcasts = getVisiblePodcasts();
  const filtered = currentCategory === 'all'
    ? allPodcasts
    : allPodcasts.filter(p => p.category === currentCategory);

  const featured = filtered.filter(p => p.isFeatured || p.backendId);
  const popular = featured.length ? featured.slice(0, 6) : filtered.slice(0, 6);
  renderPopularPrograms(popular);

  const recommended = shuffleArray([...filtered]).slice(0, 5);
  renderPodcastGrid('recommendedGrid', recommended);

  const latest = [...filtered].sort(() => Math.random() - 0.5).slice(0, 5);
  renderPodcastGrid('latestGrid', latest);

  const beginner = filtered.filter(p => p.difficulty === 'beginner').slice(0, 5);
  renderPodcastGrid('beginnerGrid', beginner);

  const intermediate = filtered.filter(p => p.difficulty === 'intermediate').slice(0, 5);
  renderPodcastGrid('intermediateGrid', intermediate);

  const advanced = filtered.filter(p => p.difficulty === 'advanced').slice(0, 5);
  renderPodcastGrid('advancedGrid', advanced);
  applyI18n();
}

// ===== Render Popular Programs =====
function renderPopularPrograms(programs) {
  const container = document.getElementById('popularPrograms');
  container.innerHTML = programs.map(p => `
    <div class="program-card" onclick="openDetail('${p.id}')">
      <div class="program-cover">
        <img src="${p.cover}" alt="${p.title}" loading="lazy">
      </div>
      <div class="program-title">${p.title}</div>
      <div class="program-label">${p.author}</div>
      <div class="program-bottom">
        <div class="program-play-btn" onclick="event.stopPropagation(); playPodcast('${p.id}')">
          <i class="fas fa-play"></i>
          <span>${p.episodes.length}<span data-i18n="集">集</span></span>
        </div>
      </div>
    </div>
  `).join('');
}

// ===== Render Podcast Grid =====
function renderPodcastGrid(containerId, podcasts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (podcasts.length === 0) {
    container.innerHTML = '<div style="color: #8e95a3; font-size: 14px; padding: 20px 0;">暂无数据</div>';
    return;
  }

  container.innerHTML = podcasts.map(p => `
    <div class="podcast-card" onclick="openDetail('${p.id}')">
      <div class="podcast-cover-wrap">
        <img src="${p.cover}" alt="${p.title}" loading="lazy">
        <div class="podcast-overlay">
          <div class="podcast-play-icon" onclick="event.stopPropagation(); playPodcast('${p.id}')">
            <i class="fas fa-play"></i>
          </div>
        </div>
      </div>
      <div class="podcast-info">
        <div class="podcast-name">${p.title}</div>
        <div class="podcast-category">${p.categoryLabel}</div>
        <div class="podcast-difficulty">${DIFFICULTY_MAP[p.difficulty]}</div>
      </div>
    </div>
  `).join('');
}

// ===== Open Detail View =====
async function openDetail(podcastId) {
  const podcast = getVisiblePodcasts().find(p => String(p.id) === String(podcastId));
  if (!podcast) return;

  currentPodcast = podcast;
  currentPodcastId = podcastId;

  document.getElementById('detailCover').src = podcast.cover;
  document.getElementById('detailTitle').textContent = podcast.title;
  document.getElementById('detailAuthor').innerHTML = `<i class="fas fa-user"></i> ${podcast.author}`;
  document.getElementById('detailEpisodes').innerHTML = `<i class="fas fa-list"></i> <span id="detailEpisodeCount">…</span> <span data-i18n="集">集</span>`;
  document.getElementById('detailCategories').textContent = podcast.categoryLabel || '';

  const levelEl = document.getElementById('detailLevel');
  levelEl.textContent = DIFFICULTY_MAP[podcast.difficulty];
  levelEl.className = 'detail-level ' + podcast.difficulty;

  document.getElementById('detailDesc').textContent = podcast.description;

  updateFavoriteBtn();
  navigateTo('detail');

  // 阅读器：正播的就是这个播客的节目 -> 直接接上字幕；否则回到占位态
  if (currentEpisodeData && currentPodcast && String(currentPodcast.id) === String(podcastId)) {
    loadReaderTranscript();
  } else {
    transcriptLines = [];
    lastActiveLineIdx = -1;
    setReaderNow('');
    renderReaderTranscript();
  }

  const episodesContainer = document.getElementById('episodesList');
  episodesContainer.innerHTML = '<div class="episode-loading"><i class="fas fa-spinner fa-spin"></i> 加载节目中…</div>';
  applyI18n();

  let episodes = [];
  if (podcast.backendId) {
    try {
      const res = await fetch(`${API_BASE}/episodes/?podcast=${podcast.backendId}`);
      if (res.ok) {
        const data = await res.json();
        episodes = data.results || data || [];
      }
    } catch (e) {}
  }
  if (!episodes.length) {
    episodes = Array.isArray(podcast.episodes) ? podcast.episodes : [];
  }
  currentEpisodeList = episodes;

  if (!episodes.length) {
    episodesContainer.innerHTML = '<div class="episode-empty"><i class="fas fa-inbox"></i><p>该播客暂无节目</p></div>';
    // Re-assert top position after async render (layout shifts can drag scroll down)
    if (currentPage === 'detail' && currentPodcastId === podcastId) scrollToTopInstant();
    applyI18n();
    return;
  }

  const countEl = document.getElementById('detailEpisodeCount');
  if (countEl) countEl.textContent = episodes.length;

  episodesContainer.innerHTML = episodes.map((ep, idx) => {
    const title = ep.title || '未命名节目';
    const dur = ep.duration_display || (ep.audio_duration ? formatTime(ep.audio_duration) : (ep.duration || '-'));
    const date = ep.publish_date || ep.date || '';
    return `
    <div class="episode-item ${idx === currentEpisodeIndex && currentPodcastId === podcastId ? 'playing' : ''}" onclick="playEpisode('${podcast.id}', ${idx})">
      <div class="episode-cover">
        <img src="${podcast.cover}" alt="${esc(title)}" loading="lazy">
      </div>
      <div class="episode-info">
        <div class="episode-title">${esc(title)}</div>
        <div class="episode-meta">
          <span class="episode-duration"><i class="fas fa-clock"></i> ${dur}</span>
          <span>${date}</span>
        </div>
      </div>
      <div class="episode-play-btn">
        <i class="fas fa-play"></i>
      </div>
    </div>`;
  }).join('');
  applyI18n();

  // Re-assert top position AFTER the async episode-list render. On direct
  // open / refresh of #detail/xxx the content growth above can leave the
  // viewport mid-page; only do this if the user is still on this detail view.
  if (currentPage === 'detail' && currentPodcastId === podcastId) {
    requestAnimationFrame(() => {
      if (currentPage === 'detail' && currentPodcastId === podcastId) scrollToTopInstant();
    });
  }
}

// ===== Back Button =====
function initBackButton() {
  backBtn.addEventListener('click', () => {
    if (previousPage && previousPage !== 'detail') {
      navigateTo(previousPage);
    } else {
      navigateTo('home');
    }
  });
}

// ===== Search =====
function initSearch() {
  let searchTimer;
  if (!searchInput) { console.warn('initSearch: #searchInput not found'); return; }

  searchInput.addEventListener('input', (e) => {
    // Ignore auto-fill events that look like emails
    if (e.isTrusted && e.target.value.includes('@')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const keyword = e.target.value.trim();
      if (keyword.length === 0) {
        if (currentPage === 'search') {
          navigateTo('home');
        }
        return;
      }
      performSearch(keyword);
    }, 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const keyword = e.target.value.trim();
      if (keyword.length > 0) {
        performSearch(keyword);
      }
    }
  });
}

function performSearch(keyword) {
  const lowerKeyword = keyword.toLowerCase();
  const results = getVisiblePodcasts().filter(p =>
    (p.title || '').toLowerCase().includes(lowerKeyword) ||
    (p.author || '').toLowerCase().includes(lowerKeyword) ||
    (p.categoryLabel || '').includes(keyword) ||
    (p.description || '').includes(keyword)
  );

  document.getElementById('searchKeyword').textContent = keyword;

  const resultsGrid = document.getElementById('searchResults');
  const emptyState = document.getElementById('searchEmpty');

  if (results.length === 0) {
    resultsGrid.innerHTML = '';
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    renderPodcastGrid('searchResults', results);
  }

  const sidebarItems = document.querySelectorAll('.sidebar-nav .sidebar-item');
  sidebarItems.forEach(i => i.classList.remove('active'));

  navigateTo('search');
}

// ===== Audio Player =====
function initPlayer() {
  const playPauseBtn = document.getElementById('playerPlayPause');
  const prevBtn = document.getElementById('playerPrev');
  const nextBtn = document.getElementById('playerNext');
  const rewindBtn = document.getElementById('playerRewind');
  const forwardBtn = document.getElementById('playerForward');
  const closeBtn = document.getElementById('playerClose');
  const volumeSlider = document.getElementById('playerVolume');
  const volumeBtn = document.getElementById('playerVolumeBtn');
  const noteBtn = document.getElementById('playerNoteBtn');
  const progressBar = document.getElementById('playerProgressBar');
  const progressLabel = document.getElementById('playerProgressLabel');

  playPauseBtn.addEventListener('click', togglePlayPause);
  prevBtn.addEventListener('click', playPreviousEpisode);
  nextBtn.addEventListener('click', playNextEpisode);
  rewindBtn.addEventListener('click', () => {
    seekToTime(audioPlayer.currentTime - 10);
  });
  forwardBtn.addEventListener('click', () => {
    seekToTime(audioPlayer.currentTime + 10);
  });

  closeBtn.addEventListener('click', () => {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.currentTime = 0;
    unloadYouTube();
    document.getElementById('playerBar').style.display = 'none';
    syncPlayButtonState();
  });

  volumeSlider.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value / 100;
    updateVolumeIcon();
  });

  volumeBtn.addEventListener('click', () => {
    if (audioPlayer.muted) {
      audioPlayer.muted = false;
      volumeSlider.value = audioPlayer.volume * 100;
    } else {
      audioPlayer.muted = true;
      volumeSlider.value = 0;
    }
    updateVolumeIcon();
  });

  noteBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      showAuthModal('login');
      return;
    }
    if (currentPodcast) {
      openNoteModal();
    }
  });

  const transcriptBtn = document.getElementById('playerTranscriptBtn');
  if (transcriptBtn) transcriptBtn.addEventListener('click', openTranscript);
  const shadowBtn = document.getElementById('playerShadowBtn');
  if (shadowBtn) shadowBtn.addEventListener('click', () => {
    if (!isLoggedIn()) { showAuthModal('login'); return; }
    openShadow(lastActiveLineIdx >= 0 ? lastActiveLineIdx : 0);
  });
  const transcriptModalClose = document.getElementById('transcriptModalClose');
  if (transcriptModalClose) transcriptModalClose.addEventListener('click', () => {
    document.getElementById('transcriptModal').style.display = 'none';
  });
  const transcriptModal = document.getElementById('transcriptModal');
  if (transcriptModal) transcriptModal.addEventListener('click', (e) => {
    if (e.target === transcriptModal) transcriptModal.style.display = 'none';
  });
  const tb = document.getElementById('transcriptBilingualBtn');
  if (tb) tb.addEventListener('click', () => setTranscriptMode('bilingual'));
  const te = document.getElementById('transcriptEnBtn');
  if (te) te.addEventListener('click', () => setTranscriptMode('en'));
  const tz = document.getElementById('transcriptZhBtn');
  if (tz) tz.addEventListener('click', () => setTranscriptMode('zh'));

  progressBar.addEventListener('pointerdown', (e) => {
    if (!audioPlayer.duration) return;
    isDraggingProgress = true;
    progressBar.classList.add('is-dragging');
    updatePreviewTime(e.clientX);
    seekToProgressPosition(e.clientX);
  });

  progressBar.addEventListener('pointermove', (e) => {
    if (!isDraggingProgress) return;
    requestAnimationFrame(() => {
      updatePreviewTime(e.clientX);
      seekToProgressPosition(e.clientX);
    });
  });

  progressBar.addEventListener('pointerleave', () => {
    if (!isDraggingProgress) {
      resetPreviewTime();
    }
  });

  progressBar.addEventListener('mouseenter', (e) => {
    updatePreviewTime(e.clientX);
  });

  progressBar.addEventListener('mousemove', (e) => {
    requestAnimationFrame(() => {
      updatePreviewTime(e.clientX);
    });
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDraggingProgress) return;
    requestAnimationFrame(() => {
      updatePreviewTime(e.clientX);
      seekToProgressPosition(e.clientX);
    });
  });

  window.addEventListener('pointerup', () => {
    if (!isDraggingProgress) return;
    isDraggingProgress = false;
    progressBar.classList.remove('is-dragging');
    resetPreviewTime();
  });

  document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

  audioPlayer.addEventListener('timeupdate', updatePlayerProgress);
  audioPlayer.addEventListener('ended', () => {
    if (currentEpisodeData && currentEpisodeData.id && isLoggedIn()) {
      const dur = typeof currentEpisodeData.audio_duration === 'number' ? currentEpisodeData.audio_duration : 0;
      updatePlayback(currentEpisodeData.id, dur, dur, true).catch(() => {});
    }
    playNextEpisode();
  });
  audioPlayer.addEventListener('play', syncPlayButtonState);
  audioPlayer.addEventListener('pause', syncPlayButtonState);
  audioPlayer.addEventListener('loadedmetadata', () => {
    const d = getEffectiveDuration();
    if (d > 0) {
      document.getElementById('playerDuration').textContent = formatTime(d);
    }
    document.getElementById('playerProgress').style.width = '0%';
  });
}

function syncPlayButtonState() {
  const playPauseBtn = document.getElementById('playerPlayPause');
  if (!playPauseBtn) return;
  const shouldPause = Boolean(playbackInterval) || !audioPlayer.paused;
  playPauseBtn.innerHTML = shouldPause ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

// Effective duration for the progress bar / seeking.
// Django's DEBUG media server returns `200` (not `206`) to the <audio>
// element's Range request and sends no `Accept-Ranges`, so the browser
// reports audioPlayer.duration as Infinity until the whole file buffers.
// Fall back to the episode's known audio_duration (from the API) so the bar
// moves immediately and seeking works even before the media resolves.
function getEffectiveDuration() {
  const d = Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0 ? audioPlayer.duration : 0;
  if (d) return d;
  if (currentEpisodeData && Number.isFinite(currentEpisodeData.audio_duration) && currentEpisodeData.audio_duration > 0) {
    return currentEpisodeData.audio_duration;
  }
  return 0;
}

// Unified seek — works for both real <audio> and the simulated-playback
// fallback (which drives its own clock via `simulatedTime`).
function seekToTime(seconds) {
  seconds = Number(seconds) || 0;
  if (seconds < 0) seconds = 0;
  if (playbackInterval) {
    // Simulated playback: advance the simulated clock.
    const total = Number(audioPlayer.duration) || 0;
    simulatedTime = total ? Math.min(seconds, total) : seconds;
    try { audioPlayer.currentTime = simulatedTime; } catch (e) {}
    const curEl = document.getElementById('playerCurrentTime');
    if (curEl) curEl.textContent = formatTime(simulatedTime);
    const dur = getEffectiveDuration();
    if (dur) {
      document.getElementById('playerProgress').style.width = Math.min(100, (simulatedTime / dur) * 100) + '%';
    }
    return;
  }
  if (audioPlayer && audioPlayer.src) {
    audioPlayer.currentTime = seconds;
  }
}

function seekToProgressPosition(clientX) {
  const progressBar = document.getElementById('playerProgressBar');
  const duration = getEffectiveDuration();
  if (!progressBar || !duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  seekToTime(pos * duration);
  progressBar.style.setProperty('--seek-pos', `${pos * 100}%`);
  updatePlayerProgress();
}

function updatePreviewTime(clientX) {
  const progressBar = document.getElementById('playerProgressBar');
  const progressLabel = document.getElementById('playerProgressLabel');
  const duration = getEffectiveDuration();
  if (!progressBar) return;
  if (!duration) {
    // No playable duration yet — keep the hover label hidden.
    progressBar.classList.add('no-duration');
    return;
  }
  progressBar.classList.remove('no-duration');
  const rect = progressBar.getBoundingClientRect();
  const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const time = pos * duration;
  const currentTimeEl = document.getElementById('playerCurrentTime');
  if (currentTimeEl) {
    currentTimeEl.textContent = formatTime(time);
  }
  if (progressLabel) {
    progressLabel.textContent = formatTime(time);
    // Clamp the label so it never overflows the bar edges.
    const px = pos * rect.width;
    const clamped = Math.min(Math.max(px, 24), rect.width - 24);
    progressLabel.style.left = clamped + 'px';
  }
  progressBar.style.setProperty('--seek-pos', `${pos * 100}%`);
}

function resetPreviewTime() {
  const currentTimeEl = document.getElementById('playerCurrentTime');
  const progressBar = document.getElementById('playerProgressBar');
  if (currentTimeEl && getEffectiveDuration()) {
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime || 0);
  }
  // Hide the hover label if there is no duration to scrub to.
  if (progressBar && !getEffectiveDuration()) {
    progressBar.classList.add('no-duration');
  }
  // Note: label visibility itself is driven by CSS (:hover / .is-dragging),
  // so it auto-hides the moment the pointer leaves the bar — no JS needed.
}

function handlePlayerKeyboardShortcuts(e) {
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (['input', 'textarea', 'select'].includes(tag)) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
    return;
  }

  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    seekToTime(audioPlayer.currentTime - 10);
    updatePlayerProgress();
    return;
  }

  if (e.code === 'ArrowRight') {
    e.preventDefault();
    seekToTime(audioPlayer.currentTime + 10);
    updatePlayerProgress();
    return;
  }

  if (e.code === 'ArrowUp') {
    e.preventDefault();
    audioPlayer.volume = Math.min(1, (audioPlayer.volume || 0) + 0.05);
    updateVolumeIcon();
    return;
  }

  if (e.code === 'ArrowDown') {
    e.preventDefault();
    audioPlayer.volume = Math.max(0, (audioPlayer.volume || 0) - 0.05);
    updateVolumeIcon();
    return;
  }
}

function playPodcast(podcastId) {
  playEpisode(podcastId, 0);
}

async function playEpisode(podcastId, episodeIndex) {
  unloadYouTube();
  const podcast = getVisiblePodcasts().find(p => String(p.id) === String(podcastId));
  if (!podcast) return;

  currentPodcast = podcast;
  currentPodcastId = podcastId;
  currentEpisodeIndex = episodeIndex;

  let episode = null;
  let episodeAudioUrl = '';
  let durationText = '00:00';
  currentEpisodeList = [];

  if (podcast.backendId) {
    try {
      const res = await fetch(`${API_BASE}/episodes/?podcast=${podcast.backendId}`);
      if (res.ok) {
        const data = await res.json();
        const episodes = data.results || data || [];
        currentEpisodeList = episodes;
        episode = episodes[episodeIndex] || null;
        if (episode) {
          currentEpisodeData = episode;
          const audioSrc = episode.audio_file || episode.audio_url;
          episodeAudioUrl = audioSrc ? resolveMediaUrl(audioSrc) : '';
          durationText = episode.duration_display || (episode.audio_duration ? `${Math.floor(episode.audio_duration / 60)}:${String(episode.audio_duration % 60).padStart(2, '0')}` : '00:00');
        }
      }
    } catch (e) {}
  }

  if (!episode) {
    currentEpisodeList = Array.isArray(podcast.episodes) ? podcast.episodes : [];
    episode = currentEpisodeList[episodeIndex] || { title: '暂无节目', duration: '00:00' };
    currentEpisodeData = episode;
    episodeAudioUrl = episode.audio_url ? resolveMediaUrl(episode.audio_url) : '';
    durationText = episode.duration || '00:00';
  }

  document.getElementById('playerCover').src = podcast.cover;
  document.getElementById('playerTitle').textContent = episode.title;
  document.getElementById('playerPodcast').textContent = podcast.title;
  document.getElementById('playerBar').style.display = 'block';
  document.getElementById('playerCurrentTime').textContent = '00:00';
  document.getElementById('playerDuration').textContent = durationText;

  const playPauseBtn = document.getElementById('playerPlayPause');
  playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';

  showToast(`🎧 正在播放: ${episode.title}`);

  addToHistory(podcast, episodeIndex, episode);

  if (currentPage === 'detail') {
    const episodeItems = document.querySelectorAll('.episode-item');
    episodeItems.forEach((item, idx) => {
      item.classList.toggle('playing', idx === episodeIndex);
    });
    // 详情页右侧的字幕跟着切
    loadReaderTranscript();
  }

  // YouTube content: embed player instead of audio
  if (episode && episode.youtube_id) {
    document.getElementById('playerDuration').textContent = 'YouTube';
    document.getElementById('playerProgress').style.width = '0%';
    loadYouTube(episode.youtube_id, 0);
    return;
  }

  if (episodeAudioUrl) {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    audioPlayer.src = episodeAudioUrl;
    audioPlayer.currentTime = 0;
    audioPlayer.load();
    audioPlayer.play().catch(() => {
      showToast('当前音频暂时无法播放，请稍后再试');
    });
  } else {
    const fallbackAudioUrl = `${MEDIA_BASE}/media/episodes/audio/seed-fallback.wav`;
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    audioPlayer.src = fallbackAudioUrl;
    audioPlayer.currentTime = 0;
    audioPlayer.load();
    audioPlayer.play().catch(() => {
      simulatePlayback(durationText);
    });
  }
}

let playbackInterval = null;
let simulatedTime = 0;

function simulatePlayback(durationStr) {
  if (playbackInterval) clearInterval(playbackInterval);

  const durationParts = durationStr.split(':');
  let totalSeconds = 0;
  if (durationParts.length === 3) {
    totalSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
  } else if (durationParts.length === 2) {
    totalSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
  }

  totalSeconds = Math.max(1, Math.min(totalSeconds, 120));
  simulatedTime = 0;
  audioPlayer.duration = totalSeconds;
  audioPlayer.currentTime = 0;
  document.getElementById('playerCurrentTime').textContent = '00:00';
  document.getElementById('playerDuration').textContent = formatTime(totalSeconds);
  document.getElementById('playerProgress').style.width = '0%';
  syncPlayButtonState();

  playbackInterval = setInterval(() => {
    simulatedTime++;
    if (simulatedTime >= totalSeconds) {
      clearInterval(playbackInterval);
      playbackInterval = null;
      playNextEpisode();
      return;
    }
    document.getElementById('playerCurrentTime').textContent = formatTime(simulatedTime);
    document.getElementById('playerProgress').style.width = (simulatedTime / totalSeconds * 100) + '%';
    audioPlayer.currentTime = simulatedTime;
    syncPlayButtonState();
  }, 1000);
}

function togglePlayPause() {
  if (audioPlayer.src) {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(() => {
        showToast('当前音频暂时无法播放，请稍后再试');
      });
    } else {
      audioPlayer.pause();
    }
    syncPlayButtonState();
    return;
  }

  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
    syncPlayButtonState();
    return;
  }

  const durationText = document.getElementById('playerDuration').textContent || '00:00';
  simulatePlayback(durationText);
  syncPlayButtonState();
}

function playPreviousEpisode() {
  if (currentEpisodeIndex > 0) {
    playEpisode(currentPodcastId, currentEpisodeIndex - 1);
  }
}

function playNextEpisode() {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }

  const totalEpisodes = currentEpisodeList.length || currentPodcast?.episodes?.length || 0;
  if (currentPodcast && currentEpisodeIndex < totalEpisodes - 1) {
    const nextIndex = currentEpisodeIndex + 1;
    setTimeout(() => {
      playEpisode(currentPodcast.id, nextIndex);
    }, 180);
  } else {
    showToast('播放完毕');
    syncPlayButtonState();
  }
}

function getCurrentPlayTime() {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    try { return ytPlayer.getCurrentTime(); } catch (e) {}
  }
  return audioPlayer.currentTime || 0;
}

function updatePlayerProgress() {
  if (ytPlayer && ytPlayer.getDuration) {
    try {
      const d = ytPlayer.getDuration();
      const t = ytPlayer.getCurrentTime();
      document.getElementById('playerCurrentTime').textContent = formatTime(t);
      if (d) document.getElementById('playerProgress').style.width = Math.min(100, (t / d) * 100) + '%';
    } catch (e) {}
    highlightTranscript();
    return;
  }
  const duration = getEffectiveDuration();
  if (duration) {
    const progress = (audioPlayer.currentTime / duration) * 100;
    document.getElementById('playerProgress').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('playerCurrentTime').textContent = formatTime(audioPlayer.currentTime);
  }
  highlightTranscript();
}

function updateVolumeIcon() {
  const btn = document.getElementById('playerVolumeBtn');
  const slider = document.getElementById('playerVolume');
  const vol = audioPlayer.muted ? 0 : audioPlayer.volume;
  if (slider) {
    slider.value = Math.round(vol * 100);
  }
  if (vol === 0) {
    btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
  } else if (vol < 0.5) {
    btn.innerHTML = '<i class="fas fa-volume-low"></i>';
  } else {
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ===== Transcript / Subtitles =====
function parseStamp(s) {
  return s.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

function stripStamp(line) {
  return line.replace(/^(\d{1,2}:)?\d{1,2}:\d{2}\s+/, '').trim();
}

function parseTranscript(en, zh) {
  const enLines = (en || '').split('\n').map(s => s.trim()).filter(Boolean);
  const zhLines = (zh || '').split('\n').map(s => s.trim()).filter(Boolean);
  const max = Math.max(enLines.length, zhLines.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const e = enLines[i] || '';
    const z = zhLines[i] || '';
    const m = e.match(/^((\d{1,2}:)?\d{1,2}:\d{2})\s+/);
    const time = m ? parseStamp(m[1]) : null;
    out.push({ time, en: stripStamp(e), zh: stripStamp(z) });
  }
  return out;
}

function openTranscript() {
  if (!currentEpisodeData) {
    showToast('请先播放一个节目');
    return;
  }
  document.getElementById('transcriptTitle').textContent = currentEpisodeData.title || '文稿';
  transcriptLines = parseTranscript(currentEpisodeData.subtitle_en, currentEpisodeData.subtitle_zh);
  lastActiveLineIdx = -1;
  renderTranscript();
  document.getElementById('transcriptModal').style.display = 'flex';
}

function setTranscriptMode(mode) {
  transcriptMode = mode;
  document.getElementById('transcriptBilingualBtn').classList.toggle('active', mode === 'bilingual');
  document.getElementById('transcriptEnBtn').classList.toggle('active', mode === 'en');
  document.getElementById('transcriptZhBtn').classList.toggle('active', mode === 'zh');
  renderTranscript();
}

/* 单个英文词 -> 带水平标注的 <span>。
   - 句中首字母大写的词按专有名词处理（人名/地名），不标注
   - WordDict 就绪后按用户所选水平给出 'syll'（本级考纲）| 'beyond'（超纲）
   - 小字中文只取第一个义项，完整释义留给点击后的弹窗 */
function renderWordToken(token, isFirstWord) {
    const m = String(token).match(/^([^A-Za-z]*)([A-Za-z][A-Za-z']*)([^A-Za-z]*)$/);
    if (!m) return esc(token);
    const pre = m[1], core = m[2], post = m[3];
    if (!isFirstWord && /^[A-Z]/.test(core)) return esc(token);   // 专有名词
    const w = core.toLowerCase().replace(/\u2019/g, "'");
    const cls = WordDict.ready() ? WordDict.classify(w, readerLevel) : null;
    if (!cls) return esc(token);
    const zh = WordDict.shortGloss(w, 8);
    const zhHtml = zh ? `<i class="tw-zh">${esc(zh)}</i>` : '';
    return `${esc(pre)}<span class="tw tw-${cls}" data-word="${esc(w)}">${esc(core)}${zhHtml}</span>${esc(post)}`;
}

function renderClickableWords(text) {
  let i = 0;
  return String(text == null ? '' : text).split(/(\s+)/).map(tok => {
    if (!tok) return '';
    if (/^\s+$/.test(tok)) return tok;
    return renderWordToken(tok, i++ === 0);
  }).join('');
}

/* 一行字幕 -> HTML。variant='modal' 时额外带「讲解 / 跟读」按钮。 */
function transcriptLineHTML(line, idx, variant) {
  const enHtml = (transcriptMode !== 'zh' && line.en)
    ? `<div class="transcript-en">${renderClickableWords(line.en)}</div>` : '';
  const zhHtml = (transcriptMode !== 'en' && line.zh)
    ? `<div class="transcript-zh">${esc(line.zh)}</div>` : '';
  const timeHtml = line.time != null
    ? `<span class="transcript-time" data-seek="${idx}">${formatTime(line.time)}</span>` : '';
  let actions = '';
  if (variant === 'modal') {
    const locked = !hasFeature('ai_explain');
    actions = `
        <div class="transcript-actions">
          <button class="transcript-act" data-explain="${idx}" ${locked ? 'disabled title="会员功能"' : ''}><i class="fas fa-brain"></i> 讲解</button>
          <button class="transcript-act" data-shadow="${idx}" ${locked ? 'disabled title="会员功能"' : ''}><i class="fas fa-microphone"></i> 跟读</button>
        </div>
        <div class="transcript-explain" id="explain-${idx}" style="display:none"></div>`;
  }
  return `
      <div class="transcript-line ${idx === lastActiveLineIdx ? 'active' : ''}" data-idx="${idx}">
        ${timeHtml}
        <div class="transcript-text">
          ${enHtml}
          ${zhHtml}
        </div>
        ${actions}
      </div>`;
}

function transcriptEmptyHTML() {
  return '<div class="transcript-empty"><i class="fas fa-file-lines"></i><p>本节目暂无字幕 / 文稿</p></div>';
}

function renderTranscript() {
  const body = document.getElementById('transcriptBody');
  if (!body) return;
  if (!transcriptLines.length) {
    body.innerHTML = transcriptEmptyHTML();
    return;
  }
  body.innerHTML = transcriptLines.map((line, idx) => transcriptLineHTML(line, idx, 'modal')).join('');

  body.querySelectorAll('.transcript-time').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); seekTranscriptLine(Number(el.dataset.seek)); });
  });
  body.querySelectorAll('.transcript-act[data-explain]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.explain);
      const box = document.getElementById('explain-' + idx);
      if (box.style.display === 'none') { box.style.display = 'block'; explainLine(idx, box); }
      else { box.style.display = 'none'; }
    });
  });
  body.querySelectorAll('.transcript-act[data-shadow]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openShadow(Number(btn.dataset.shadow)); });
  });
}

/* ===== 播放详情页的实时字幕 ===== */
function setReaderNow(title) {
  const el = document.getElementById('readerNowTitle');
  if (el) el.textContent = title || '尚未选择剧集';
}

function renderReaderTranscript() {
  const box = document.getElementById('readerTranscript');
  const ph = document.getElementById('readerPlaceholder');
  if (!box) return;
  if (!transcriptLines.length) {
    box.style.display = 'none';
    if (ph) {
      ph.style.display = '';
      const p = ph.querySelector('p');
      const sub = ph.querySelector('span');
      if (p && sub) {
        if (currentEpisodeData && currentEpisodeData.title) {
          p.textContent = '这一集没有字幕';
          sub.textContent = '跑一次爬虫的 --backfill 可以补上字幕。';
        } else {
          p.textContent = '从左侧选一集开始播放';
          sub.textContent = '播放时字幕会跟随语音逐句高亮，生词按你选的水平自动标注中文';
        }
      }
    }
    return;
  }
  if (ph) ph.style.display = 'none';
  box.style.display = '';
  box.innerHTML = transcriptLines.map((line, idx) => transcriptLineHTML(line, idx, 'reader')).join('');
  box.querySelectorAll('.transcript-time').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); seekTranscriptLine(Number(el.dataset.seek)); });
  });
  lastActiveLineIdx = -1;
  highlightTranscript();
}

/* 把当前剧集的字幕装进阅读器（切集 / 换水平 / 换显示模式时调用） */
function loadReaderTranscript() {
  if (!currentEpisodeData) return;
  ensureReaderDict();
  setReaderNow(currentEpisodeData.title);
  transcriptLines = parseTranscript(currentEpisodeData.subtitle_en, currentEpisodeData.subtitle_zh);
  lastActiveLineIdx = -1;
  renderReaderTranscript();
  updateReaderLegend();   // 换集后统计也要跟着变（词库可能已就绪）
}

/* 水平 / 中文开关 / 显示模式 变化后重绘 */
function refreshReader() {
  if (!transcriptLines.length) return;
  renderReaderTranscript();
  updateReaderLegend();
}

/* 图例上显示本集大概有多少词会被标 */
function updateReaderLegend() {
  const hint = document.querySelector('.reader-legend-hint');
  if (!hint) return;
  if (!WordDict.ready()) { hint.textContent = '词库加载中…'; return; }
  let syll = 0, beyond = 0;
  transcriptLines.forEach(l => {
    (l.en || '').split(/\s+/).forEach((tok, i) => {
      const cls = WordDict.classify(tok.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z']+$/, '').toLowerCase(), readerLevel);
      if (cls === 'syll') syll++;
      else if (cls === 'beyond') beyond++;
    });
  });
  hint.textContent = `本集标注：考纲词 ${syll} · 超纲词 ${beyond}`;
}

function applyReaderLevel(level) {
  readerLevel = level;
  try { localStorage.setItem('lbReaderLevel', level); } catch (e) {}
  const sel = document.getElementById('readerLevel');
  if (sel) sel.value = level;
  refreshReader();
}

function applyReaderGloss(on) {
  readerGlossOn = on;
  try { localStorage.setItem('lbReaderGloss', on ? '1' : '0'); } catch (e) {}
  document.body.classList.toggle('hide-gloss', !on);
  const btn = document.getElementById('readerZhToggle');
  if (btn) btn.classList.toggle('active', on);
}

function initReader() {
  const sel = document.getElementById('readerLevel');
  if (sel) {
    sel.value = readerLevel;
    sel.addEventListener('change', () => { applyReaderLevel(sel.value); });
  }
  const zh = document.getElementById('readerZhToggle');
  if (zh) zh.addEventListener('click', () => { applyReaderGloss(!readerGlossOn); });
  document.querySelectorAll('.reader-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.reader-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTranscriptMode(btn.dataset.mode);
      if (document.getElementById('transcriptModal').style.display === 'flex') renderTranscript();
      renderReaderTranscript();
    });
  });
  applyReaderGloss(readerGlossOn);

  // 点击单词 -> 复用已有的生词弹窗（见 initWordPopover），并补上词库释义
  const scroll = document.getElementById('readerScroll');
  if (scroll) {
    scroll.addEventListener('click', (e) => {
      const w = e.target.closest('.tw');
      if (w) showWordCard(w.dataset.word, w);
    });
  }

  // 词库（~3MB）只在真正进播放详情页时才拉，避免首页/列表页白扛一次带宽
  if (currentPage === 'detail') ensureReaderDict();
}

/* 按需加载词库；就绪后重画一次，让标注出现。多次调用只发一次请求。 */
let readerDictLoading = false;
function ensureReaderDict() {
  if (readerDictOk || readerDictLoading) return;
  readerDictLoading = true;
  WordDict.load().then(() => {
    readerDictOk = true;
    readerDictLoading = false;
    refreshReader();
  }).catch(() => {
    readerDictLoading = false;
    const hint = document.querySelector('.reader-legend-hint');
    if (hint) hint.textContent = '词库加载失败，已跳过标注';
  });
}

function seekTranscriptLine(idx) {
  const line = transcriptLines[idx];
  if (line && line.time != null) {
    if (ytPlayer && ytPlayer.seekTo) {
      ytPlayer.seekTo(line.time, true);
    } else if (audioPlayer.duration) {
      seekToTime(line.time);
      if (audioPlayer.paused) audioPlayer.play().catch(() => {});
    }
  }
  document.querySelectorAll('.transcript-line').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.transcript-line[data-idx="${idx}"]`);
  if (el) {
    el.classList.add('active');
    lastActiveLineIdx = idx;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function highlightTranscript() {
  if (!transcriptLines.length) return;
  const t = getCurrentPlayTime();
  let active = -1;
  for (let i = 0; i < transcriptLines.length; i++) {
    if (transcriptLines[i].time != null && transcriptLines[i].time <= t) active = i;
    else break;
  }
  if (active === lastActiveLineIdx) return;
  lastActiveLineIdx = active;
  // 文稿弹窗 与 详情页阅读器 共用一份 transcriptLines，两边都要跟着高亮
  ['transcriptBody', 'readerTranscript'].forEach(id => {
    const box = document.getElementById(id);
    if (!box || box.offsetParent === null) return;   // 不可见就不动，避免误滚动页面
    box.querySelectorAll('.transcript-line').forEach(el => el.classList.remove('active'));
    if (active >= 0) {
      const el = box.querySelector(`.transcript-line[data-idx="${active}"]`);
      if (el) {
        el.classList.add('active');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  });
}

// ===== Favorites =====
function loadFavoritesFromStorage() {
  const stored = localStorage.getItem('favorites');
  if (stored) {
    favorites = new Set(JSON.parse(stored));
  }
}

function saveFavoritesToStorage() {
  localStorage.setItem('favorites', JSON.stringify([...favorites]));
}

async function toggleFavorite(podcastId) {
  if (!isLoggedIn()) {
    showAuthModal('login');
    return;
  }
  const podcast = getVisiblePodcasts().find(p => String(p.id) === String(podcastId));
  if (!podcast) return;
  const backendId = podcast.backendId || null;

  if (favorites.has(podcastId)) {
    favorites.delete(podcastId);
    showToast('已取消关注');
    if (backendId) { try { await removeFavorite(backendId); } catch (e) {} }
  } else {
    favorites.add(podcastId);
    showToast('已关注');
    if (backendId) { try { await addFavorite(backendId); } catch (e) {} }
  }
  saveFavoritesToStorage();
  updateFavoriteBtn();
}

async function loadFavoritesFromBackend() {
  try {
    const data = await getFavorites();
    const favs = data.results || data || [];
    // MERGE (don't overwrite) so a server miss can never wipe locally-stored
    // favorites. Server is authoritative for what it HAS; local keeps whatever
    // the server doesn't (e.g. just-toggled items not yet confirmed).
    for (const f of favs) {
      if (f && (f.podcast || f.podcast === 0)) favorites.add(`backend-${f.podcast}`);
    }
    saveFavoritesToStorage();
    updateFavoriteBtn();
    if (currentPage === 'follow') renderFollowPage();
  } catch (e) {}
}

function updateFavoriteBtn() {
  const btn = document.getElementById('favoriteBtn');
  if (!btn) return;
  if (currentPodcastId && favorites.has(currentPodcastId)) {
    btn.innerHTML = '<i class="fas fa-bookmark"></i><span>已关注</span>';
    btn.classList.add('favorited');
  } else {
    btn.innerHTML = '<i class="far fa-bookmark"></i><span>关注</span>';
    btn.classList.remove('favorited');
  }
  applyI18n();
}

function renderFollowPage() {
  const grid = document.getElementById('followGrid');
  const empty = document.getElementById('followEmpty');

  if (favorites.size === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  const favPodcasts = getVisiblePodcasts().filter(p => favorites.has(p.id));
  if (favPodcasts.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  renderPodcastGrid('followGrid', favPodcasts);
  applyI18n();
}

// ===== Notes =====
function getActiveEpisodeMeta() {
  if (currentEpisodeData) {
    return { id: currentEpisodeData.id, title: currentEpisodeData.title || '未命名节目' };
  }
  const ep = (currentPodcast && Array.isArray(currentPodcast.episodes)) ? currentPodcast.episodes[currentEpisodeIndex] : null;
  return { id: null, title: ep ? ep.title : '未命名节目' };
}

async function deleteNoteApi(id) {
  return await apiRequest(`/notes/${id}/`, { method: 'DELETE' });
}

async function renderNotesPage() {
  const list = document.getElementById('notesList');
  const empty = document.getElementById('notesEmpty');

  const stored = localStorage.getItem('userNotes');
  const localNotes = stored ? JSON.parse(stored) : [];

  if (isLoggedIn()) {
    try {
      const data = await getNotes();
      const backendNotes = (data.results || data || []).map(n => ({
        id: n.id,
        podcastTitle: '',
        episodeTitle: n.episode_title || '节目',
        content: n.content,
        timestamp: n.timestamp_seconds != null ? formatTime(n.timestamp_seconds) : '00:00',
        backend: true,
      }));
      displayedNotes = [...backendNotes, ...localNotes.filter(n => !n.id)];
    } catch (e) {
      displayedNotes = localNotes;
    }
  } else {
    displayedNotes = localNotes;
  }

  if (displayedNotes.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = displayedNotes.map((note, idx) => `
    <div class="note-card">
      <div class="note-header">
        <span class="note-podcast">${esc(note.podcastTitle || '')}</span>
        <span class="note-episode">${esc(note.episodeTitle || '')}</span>
        <span class="note-time">${esc(note.timestamp || '')}</span>
      </div>
      <div class="note-content">${esc(note.content || '')}</div>
      <div class="note-actions">
        <button class="note-delete-btn" onclick="deleteNote(${idx})">
          <i class="fas fa-trash"></i> 删除
        </button>
      </div>
    </div>
  `).join('');
  applyI18n();
}

function openNoteModal() {
  document.getElementById('noteModal').style.display = 'flex';
  document.getElementById('noteContent').value = '';
  const ep = getActiveEpisodeMeta();
  document.getElementById('noteEpisodeInfo').textContent =
    `${currentPodcast.title} - ${ep.title}`;
  document.getElementById('noteContent').focus();
}

async function deleteNote(index) {
  const note = displayedNotes[index];
  if (!note) return;
  if (note.backend && note.id) {
    try { await deleteNoteApi(note.id); } catch (e) {}
  } else {
    userNotes = userNotes.filter(n =>
      !(n.podcastId === note.podcastId && n.episodeTitle === note.episodeTitle &&
        n.content === note.content && n.timestamp === note.timestamp));
    localStorage.setItem('userNotes', JSON.stringify(userNotes));
  }
  displayedNotes.splice(index, 1);
  renderNotesPage();
  showToast('笔记已删除');
}

// ===== Playback History =====
function addToHistory(podcast, episodeIndex, episode) {
  const stored = localStorage.getItem('playbackHistory');
  playbackHistory = stored ? JSON.parse(stored) : [];

  const episodeTitle = episode?.title || '未知节目';
  const episodeDuration = episode?.duration || episode?.duration_display || '00:00';
  const entry = {
    podcastId: podcast.id,
    podcastTitle: podcast.title,
    podcastCover: podcast.cover,
    episodeTitle,
    episodeIndex: episodeIndex,
    duration: episodeDuration,
    timestamp: new Date().toISOString(),
  };

  playbackHistory = playbackHistory.filter(h =>
    !(h.podcastId === podcast.id && h.episodeIndex === episodeIndex)
  );

  playbackHistory.unshift(entry);
  playbackHistory = playbackHistory.slice(0, 50);

  localStorage.setItem('playbackHistory', JSON.stringify(playbackHistory));

  if (isLoggedIn() && episode && episode.id) {
    const dur = typeof episode.audio_duration === 'number' ? episode.audio_duration : 0;
    updatePlayback(episode.id, 0, dur, false).catch(() => {});
  }
}

async function renderHistoryPage() {
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');

  const stored = localStorage.getItem('playbackHistory');
  const localHistory = stored ? JSON.parse(stored) : [];
  let mergedHistory = [...localHistory];

  if (isLoggedIn()) {
    try {
      const data = await getPlaybackHistory();
      const backendItems = (data.results || data || []).map(item => ({
        podcastId: 'backend-' + item.podcast_id,
        podcastTitle: item.podcast_title || '',
        podcastCover: 'https://picsum.photos/seed/history/100/100',
        episodeTitle: item.episode_title || '',
        episodeIndex: 0,
        duration: '',
        timestamp: item.last_played || item.updated_at || new Date().toISOString(),
        fromBackend: true,
      }));
      // Merge: backend first, then local items not already matched by episode+podcast
      const matchKey = h => h.podcastTitle + '::' + h.episodeTitle;
      const beKeys = new Set(backendItems.map(matchKey));
      mergedHistory = [...backendItems, ...localHistory.filter(h => !beKeys.has(matchKey(h)))];
    } catch (e) {
      mergedHistory = localHistory;
    }
  }

  playbackHistory = mergedHistory;

  const displayed = mergedHistory.slice(0, 30);
  document.getElementById('statMinutes').textContent = displayed.length * 15;
  document.getElementById('statEpisodes').textContent = displayed.length;
  document.getElementById('statStreak').textContent = calculateStreak();
  document.getElementById('statGoal').textContent = 100;

  if (displayed.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = displayed.map(h => `
    <div class="history-item" onclick="openDetail('${esc(h.podcastId)}')">
      <div class="history-cover">
        <img src="${esc(h.podcastCover)}" alt="" loading="lazy">
      </div>
      <div class="history-info">
        <div class="history-title">${esc(h.episodeTitle)}</div>
        <div class="history-podcast">${esc(h.podcastTitle)}</div>
      </div>
      <div class="history-time">${formatHistoryTime(h.timestamp)}</div>
    </div>
  `).join('');
  applyI18n();
}

function calculateStreak() {
  if (playbackHistory.length === 0) return 0;
  const days = new Set(playbackHistory.map(h => {
    const d = new Date(h.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  return days.size;
}

function formatHistoryTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ===== Categories Page =====
function initCategoriesPage() {
  const grid = document.getElementById('categoriesPageGrid');
  const categoryList = [
    { key: 'news', icon: 'fa-newspaper', label: '新闻时事', color: '#e74c3c' },
    { key: 'tech', icon: 'fa-microchip', label: '科技', color: '#3498db' },
    { key: 'business', icon: 'fa-briefcase', label: '商业', color: '#f39c12' },
    { key: 'education', icon: 'fa-graduation-cap', label: '教育', color: '#2ecc71' },
    { key: 'health', icon: 'fa-heartbeat', label: '健康', color: '#e91e63' },
    { key: 'society', icon: 'fa-users', label: '社会', color: '#9b59b6' },
    { key: 'culture', icon: 'fa-palette', label: '文化', color: '#1abc9c' },
    { key: 'science', icon: 'fa-flask', label: '科学', color: '#34495e' },
    { key: 'sports', icon: 'fa-futbol', label: '体育', color: '#e67e22' },
    { key: 'entertainment', icon: 'fa-film', label: '娱乐', color: '#e74c3c' },
    { key: 'story', icon: 'fa-book-open', label: '故事', color: '#8e44ad' },
  ];

  grid.innerHTML = categoryList.map(cat => {
    const count = getVisiblePodcasts().filter(p => p.category === cat.key).length;
    return `
      <div class="category-page-card" style="border-left: 4px solid ${cat.color}" onclick="selectCategory('${cat.key}')">
        <div class="category-page-icon" style="color: ${cat.color}">
          <i class="fas ${cat.icon}"></i>
        </div>
        <div class="category-page-info">
          <div class="category-page-name">${cat.label}</div>
          <div class="category-page-count">${count} <span data-i18n="个播客">个播客</span></div>
        </div>
        <i class="fas fa-chevron-right category-page-arrow"></i>
      </div>
    `;
  }).join('');
  applyI18n();
}

function selectCategory(categoryKey) {
  currentCategory = categoryKey;

  const chips = document.querySelectorAll('.category-chip');
  chips.forEach(c => c.classList.remove('active'));
  const targetChip = document.querySelector(`.category-chip[data-cat="${categoryKey}"]`);
  if (targetChip) targetChip.classList.add('active');

  renderHome();
  navigateTo('home');
}

// ===== Sidebar =====
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  // Include both main nav and bottom utility items (language, etc.).
  // Exclude the theme toggle: it has its own dedicated handler.
  const sidebarItems = document.querySelectorAll('.sidebar-nav .sidebar-item, .sidebar-bottom .sidebar-item:not(#themeToggleBtn)');

  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;

      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      if (page === 'home') {
        const chips = document.querySelectorAll('.category-chip');
        chips.forEach(c => c.classList.remove('active'));
        const allChip = document.querySelector('.category-chip[data-cat="all"]');
        if (allChip) allChip.classList.add('active');
        currentCategory = 'all';
        searchInput.value = '';
        renderHome();
        navigateTo('home');
      } else if (page === 'categories') {
        navigateTo('categories');
      } else if (page === 'follow') {
        if (!isLoggedIn()) {
          showAuthModal('login');
          return;
        }
        navigateTo('follow');
      } else if (page === 'notes') {
        if (!isLoggedIn()) {
          showAuthModal('login');
          return;
        }
        navigateTo('notes');
      } else if (page === 'history') {
        navigateTo('history');
      } else if (page === 'blog') {
        navigateTo('blog');
      } else if (page === 'membership') {
        navigateTo('membership');
      } else if (page === 'vocab') {
        if (!isLoggedIn()) { showAuthModal('login'); return; }
        navigateTo('vocab');
      } else if (page === 'language') {
        navigateTo('language');
      }
    });
  });
}

// ===== Auth =====
function initAuth() {
  const userBtn = document.getElementById('userBtn');
  const authModal = document.getElementById('authModal');
  const authModalClose = document.getElementById('authModalClose');
  const loginSubmit = document.getElementById('loginSubmit');
  const registerSubmit = document.getElementById('registerSubmit');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');
  const logoutBtn = document.getElementById('logoutBtn');

  userBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isLoggedIn()) {
      showAuthModal('profile');
    } else {
      showAuthModal('login');
    }
  });

  authModalClose.addEventListener('click', () => {
    authModal.style.display = 'none';
  });

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
      authModal.style.display = 'none';
    }
  });

  showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('profileForm').style.display = 'none';
  });

  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('profileForm').style.display = 'none';
  });

  loginSubmit.addEventListener('click', handleLogin);
  registerSubmit.addEventListener('click', handleRegister);
  logoutBtn.addEventListener('click', handleLogout);

  document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('loginUsername').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginPassword').focus();
  });
  document.getElementById('regPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRegister();
  });

  document.getElementById('favoriteBtn').addEventListener('click', () => {
    if (currentPodcastId) toggleFavorite(currentPodcastId);
  });

  document.getElementById('noteModalClose').addEventListener('click', () => {
    document.getElementById('noteModal').style.display = 'none';
  });
  document.getElementById('noteModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('noteModal')) {
      document.getElementById('noteModal').style.display = 'none';
    }
  });
  document.getElementById('noteSubmit').addEventListener('click', handleNoteSubmit);
}

function showAuthModal(tab) {
  const authModal = document.getElementById('authModal');
  authModal.style.display = 'flex';

  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('profileForm').style.display = 'none';

  if (tab === 'login') {
    document.getElementById('loginForm').style.display = 'block';
  } else if (tab === 'register') {
    document.getElementById('registerForm').style.display = 'block';
  } else if (tab === 'profile') {
    document.getElementById('profileForm').style.display = 'block';
    loadProfile();
  }
}

async function loadProfile() {
  try {
    const user = getCurrentUser();
    if (user) {
      document.getElementById('profileName').textContent = user.username || '用户';
      document.getElementById('profileEmail').textContent = user.email || '-';
      document.getElementById('profileDate').textContent = user.date_joined
        ? new Date(user.date_joined).toLocaleDateString('zh-CN')
        : '-';
    }
  } catch (e) {
    console.error('Failed to load profile:', e);
  }
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  if (!username || !password) {
    errorEl.textContent = '请填写用户名和密码';
    errorEl.style.display = 'block';
    return;
  }

  try {
    errorEl.style.display = 'none';
    const data = await login(username, password);
    if (data && data.user) {
      document.getElementById('authModal').style.display = 'none';
      updateUserUI();
      loadFavoritesFromBackend();
      fetchMembership();
      loadWords();
      showToast('登录成功！');
    }
  } catch (error) {
    const msg = error.detail || error.non_field_errors?.[0] || '登录失败，请检查用户名和密码';
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
}

async function handleRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registerError');

  if (!username || !email || !password) {
    errorEl.textContent = '请填写所有字段';
    errorEl.style.display = 'block';
    return;
  }

  if (password.length < 8) {
    errorEl.textContent = '密码至少需要8个字符';
    errorEl.style.display = 'block';
    return;
  }

  try {
    errorEl.style.display = 'none';
    const data = await register(username, email, password);
    if (data && data.user) {
      document.getElementById('authModal').style.display = 'none';
      updateUserUI();
      fetchMembership();
      loadWords();
      showToast('注册成功！');
    }
  } catch (error) {
    let msg = '注册失败';
    if (error.username) msg = typeof error.username === 'string' ? error.username : error.username[0];
    else if (error.email) msg = typeof error.email === 'string' ? error.email : error.email[0];
    else if (error.password) msg = typeof error.password === 'string' ? error.password : error.password[0];
    else if (error.detail) msg = error.detail;
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
}

function handleLogout() {
  logout();
  document.getElementById('authModal').style.display = 'none';
  showToast('已退出登录');
}

function updateUserUI() {
  const userBtnText = document.getElementById('userBtnText');
  const user = getCurrentUser();
  const badge = document.getElementById('sidebarMemberBadge');
  if (user) {
    userBtnText.textContent = user.username;
    if (badge && currentMembership && currentMembership.tier_detail) {
      badge.style.display = 'inline-block';
      badge.textContent = currentMembership.tier_detail.name;
      badge.style.background = currentMembership.tier_detail.badge_color || '#5858f5';
    } else if (badge) {
      badge.style.display = 'none';
    }
  } else {
    userBtnText.textContent = '登录';
    if (badge) badge.style.display = 'none';
  }
}

// ===== Membership helpers =====
function hasFeature(name) {
  return Array.isArray(currentFeatures) && currentFeatures.includes(name);
}

async function fetchMembership() {
  if (!isLoggedIn()) { currentMembership = null; currentFeatures = []; updateUserUI(); return; }
  try {
    const data = await getMembershipStatus();
    currentMembership = data;
    currentFeatures = data.features || [];
  } catch (e) {
    currentMembership = null;
    currentFeatures = [];
  }
  updateUserUI();
}

async function renderMembershipPage() {
 try {
  const grid0 = document.getElementById('pricingGrid');
  if (grid0 && !currentTiers.length) grid0.innerHTML = '<p class="empty-hint">会员套餐加载中…</p>';
  await ensureTiers();
  const cur = document.getElementById('membershipCurrent');
  if (currentMembership && currentMembership.is_active && currentMembership.tier_detail) {
    const t = currentMembership.tier_detail;
    const exp = currentMembership.expires_at ? new Date(currentMembership.expires_at).toLocaleDateString('zh-CN') : '长期';
    cur.innerHTML = `
      <div class="member-card" style="border-color:${t.badge_color}">
        <div class="member-card-badge" style="background:${t.badge_color}">${esc(t.name)}</div>
        <div class="member-card-info">
          <p>当前会员：<strong>${esc(t.name)}</strong></p>
          <p>到期时间：${exp}</p>
          <p class="member-features">已解锁：${t.features.map(f => esc(featureLabel(f))).join('、')}</p>
        </div>
        <button class="auth-submit-btn secondary" id="cancelMemberBtn">取消自动续费</button>
      </div>`;
    const cb = document.getElementById('cancelMemberBtn');
    if (cb) cb.addEventListener('click', async () => {
      await cancelMembership();
      await fetchMembership();
      renderMembershipPage();
      showToast('已取消自动续费');
    });
  } else {
    cur.innerHTML = `<div class="member-card free">
      <div class="member-card-badge" style="background:#95a5a6">免费版</div>
      <div class="member-card-info"><p>你当前使用的是免费版，开通会员解锁 AI 智能讲解、AI 跟读评分等核心功能。</p></div>
    </div>`;
  }
  // update yearly savings badge from tiers
  const saveEl = document.getElementById('billingSave');
  if (saveEl && currentTiers.length) {
    const paid = currentTiers.find(t => t.slug !== 'free');
    if (paid && Number(paid.price_monthly) > 0) {
      const save = Math.round((1 - Number(paid.price_yearly) / (Number(paid.price_monthly) * 12)) * 100);
      if (save > 0) saveEl.innerHTML = `<span data-i18n="省">省</span> ${save}%`;
    }
  }
  renderPricingInto('pricingGrid');
  applyI18n();
 } catch (e) {
    const cur = document.getElementById('membershipCurrent');
    if (cur) cur.innerHTML = '<div class="empty-state"><p>会员页渲染出错：' + esc(String((e && e.message) || e)) + '</p></div>';
    showFatalError('renderMembershipPage: ' + (e && e.stack || e));
  }
}

async function ensureTiers() {
  if (currentTiers.length) return currentTiers;
  try {
    const data = await Promise.race([
      getTiers(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tiers request timeout')), 5000))
    ]);
    currentTiers = data.results || data || [];
  } catch (e) { currentTiers = []; }
  return currentTiers;
}

function featureLabel(f) {
  const map = {
    basic_player: '基础播放', transcript: '双语字幕', translation: '中文翻译', notes: '学习笔记',
    favorites: '收藏关注', history: '播放历史', vocabulary: '生词本', ai_explain: 'AI 智能讲解',
    shadowing: 'AI 跟读', hd_audio: '高清音质', all_content: '全部内容', no_ads: '免广告',
    offline: '离线下载', priority_support: '优先支持',
  };
  return map[f] || f;
}

function renderPricingInto(containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  if (!currentTiers.length) { grid.innerHTML = '<div class="empty-state"><p>会员套餐加载失败</p><p class="empty-hint">请检查网络后重试</p><button class="auth-submit-btn" id="retryTiersBtn">重试</button></div>'; const rb = document.getElementById('retryTiersBtn'); if (rb) rb.addEventListener('click', async () => { currentTiers = []; await ensureTiers(); renderPricingInto(containerId); }); return; }
  const mySlug = (currentMembership && currentMembership.is_active && currentMembership.tier_detail) ? currentMembership.tier_detail.slug : 'free';
  grid.innerHTML = currentTiers.map(t => {
    const isMine = t.slug === mySlug;
    const isPopular = t.slug === 'pro';
    const disabled = isMine || t.slug === 'free';
    let price, perLabel, note = '';
    if (t.slug === 'free') {
      price = '0'; perLabel = '';
    } else if (billingPeriod === 'yearly') {
      price = t.price_yearly; perLabel = '/年';
      note = `约合 ¥${(Number(t.price_yearly) / 12).toFixed(0)}<span data-i18n="/月">/月</span>`;
    } else {
      price = t.price_monthly; perLabel = '/月';
    }
    const btnLabel = isMine ? '当前方案' : (t.slug === 'free' ? '免费使用' : '立即开通');
    return `
      <div class="pricing-card ${isPopular ? 'popular' : ''} ${isMine ? 'current' : ''}" style="--tier-color:${t.badge_color}">
        ${isPopular ? '<div class="pricing-badge">最受欢迎</div>' : ''}
        <div class="pricing-name">${esc(t.name)}</div>
        <div class="pricing-price"><span class="cur">¥</span><span class="amount">${price}</span><span class="per">${perLabel}</span></div>
        ${note ? `<div class="pricing-period-note">${note}</div>` : '<div class="pricing-period-note">&nbsp;</div>'}
        <ul class="pricing-features">
          ${t.features.map(f => `<li><i class="fas fa-check"></i>${esc(featureLabel(f))}</li>`).join('')}
        </ul>
        <button class="pricing-btn" data-tier="${t.slug}" ${disabled ? 'disabled' : ''}>${btnLabel}</button>
      </div>`;
  }).join('');
  grid.querySelectorAll('.pricing-btn').forEach(btn => {
    btn.addEventListener('click', () => openPricing(btn.dataset.tier));
  });
  wireSpotlightCards(grid);
  applyI18n();
}

// QClaw-style spotlight: glow + subtle tilt follow the cursor on each card
function wireSpotlightCards(grid) {
  if (!grid) return;
  const MAX_TILT = 4; // degrees — keep it subtle
  grid.querySelectorAll('.pricing-card').forEach(card => {
    if (card.dataset.spot) return;
    card.dataset.spot = '1';
    let raf = null;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        // glow position (px)
        card.style.setProperty('--mx', `${x}px`);
        card.style.setProperty('--my', `${y}px`);
        // subtle tilt toward cursor
        const px = (x / r.width) - 0.5;   // -0.5 .. 0.5
        const py = (y / r.height) - 0.5;
        card.style.setProperty('--ry', `${(px * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(-py * MAX_TILT).toFixed(2)}deg`);
      });
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '-20%');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

function openPricing(tierSlug) {
  if (!tierSlug || tierSlug === 'free') return;
  if (!isLoggedIn()) { showAuthModal('login'); return; }
  const tier = currentTiers.find(t => t.slug === tierSlug);
  if (!tier) return;
  showPaymentModal(tierSlug);
}

function setupBillingToggle() {
  const toggle = document.getElementById('billingToggle');
  if (!toggle || toggle.dataset.wired) return;
  toggle.dataset.wired = '1';
  toggle.querySelectorAll('.billing-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      billingPeriod = btn.dataset.period;
      toggle.querySelectorAll('.billing-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPricingInto('pricingGrid');
    });
  });
}

function showPaymentModal(tierSlug) {
  const tier = currentTiers.find(t => t.slug === tierSlug);
  if (!tier) return;
  paymentTierSlug = tierSlug;
  paymentMethod = 'wechat';
  const body = document.getElementById('payBody');
  if (body) body.style.display = '';
  const price = billingPeriod === 'yearly' ? Number(tier.price_yearly) : Number(tier.price_monthly);
  const perLabel = billingPeriod === 'yearly' ? '年' : '月';
  const perMonth = billingPeriod === 'yearly' ? (Number(tier.price_yearly) / 12).toFixed(0) : Number(tier.price_monthly).toFixed(0);
  const order = document.getElementById('payOrder');
  order.innerHTML = `
    <div class="pay-order-row"><span>会员方案</span><span>${esc(tier.name)}</span></div>
    <div class="pay-order-row"><span>计费周期</span><span>${billingPeriod === 'yearly' ? '年付' : '月付'}</span></div>
    <div class="pay-order-row total"><span>应付金额</span><span class="pay-amount">¥${price}</span></div>
    <div class="pay-order-row" style="font-size:12px;color:var(--text-muted)"><span></span><span>约合 ¥${perMonth}<span data-i18n="${perLabel}">/${perLabel}</span></span></div>`;
  document.querySelectorAll('#payMethods .pay-method').forEach(m => {
    m.classList.toggle('active', m.dataset.method === 'wechat');
  });
  const btn = document.getElementById('payConfirmBtn');
  if (btn) { btn.disabled = false; btn.style.display = ''; btn.innerHTML = `确认支付 <span class="pay-amt">¥${price}</span>`; }
  const modal = document.getElementById('paymentModal');
  modal.style.display = 'flex';
  applyI18n();
}

function setupPaymentModal() {
  const modal = document.getElementById('paymentModal');
  const close = document.getElementById('paymentModalClose');
  if (close) close.addEventListener('click', () => { modal.style.display = 'none'; });
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  document.querySelectorAll('#payMethods .pay-method').forEach(m => {
    m.addEventListener('click', () => {
      document.querySelectorAll('#payMethods .pay-method').forEach(x => x.classList.remove('active'));
      m.classList.add('active');
      paymentMethod = m.dataset.method;
    });
  });
  const btn = document.getElementById('payConfirmBtn');
  if (btn) btn.addEventListener('click', submitPayment);
}

async function submitPayment() {
  if (!paymentTierSlug) return;
  const btn = document.getElementById('payConfirmBtn');
  const body = document.getElementById('payBody');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 支付处理中…';
  applyI18n();
  await new Promise(r => setTimeout(r, 1500));
  try {
    const res = await subscribeMembership(paymentTierSlug, billingPeriod, paymentMethod);
    if (res && res.membership) {
      currentMembership = res.membership;
      currentFeatures = res.membership.features || [];
      updateUserUI();
      if (body) body.style.display = 'none';
      showPaySuccess(res.membership);
      renderMembershipPage();
    } else {
      throw new Error('开通失败');
    }
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '确认支付';
    applyI18n();
    showToast((e && e.detail) || '支付失败，请重试');
  }
}

function showPaySuccess(membership) {
  const content = document.querySelector('#paymentModal .modal-content');
  let box = document.getElementById('payResult');
  if (!box) {
    box = document.createElement('div');
    box.id = 'payResult';
    box.className = 'pay-success';
    content.appendChild(box);
  }
  const tierName = (membership.tier_detail && membership.tier_detail.name) || '会员';
  const orderId = membership.order_id || '';
  box.innerHTML = `
    <div class="pay-success-icon"><i class="fas fa-check"></i></div>
    <div class="pay-success-title">开通成功！</div>
    <div class="pay-success-sub">${esc(tierName)} <span data-i18n="已激活，立即享受全部学习功能">已激活，立即享受全部学习功能</span></div>
    ${orderId ? `<div class="pay-success-sub" style="font-size:11px"><span data-i18n="订单号：">订单号：</span>${esc(orderId)}</div>` : ''}`;
  applyI18n();
  showToast('会员开通成功！' + tierName);
  setTimeout(() => {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.style.display = 'none';
    if (box) box.remove();
  }, 1400);
}

async function loadWords() {
  if (!isLoggedIn()) { userWords = []; return; }
  try {
    const data = await getWords();
    userWords = data.results || data || [];
  } catch (e) { userWords = []; }
}

async function renderVocabPage() {
  await loadWords();
  const list = document.getElementById('vocabList');
  const empty = document.getElementById('vocabEmpty');
  if (!userWords.length) {
    list.innerHTML = ''; empty.style.display = 'block'; return;
  }
  empty.style.display = 'none';
  list.innerHTML = userWords.map(w => `
    <div class="vocab-card" data-id="${w.id}">
      <div class="vocab-main">
        <div class="vocab-term">${esc(w.term)} <span class="vocab-pos">${esc(w.pos || '')}</span></div>
        <div class="vocab-def">${esc(w.definition || '')}</div>
        ${w.example ? `<div class="vocab-example">${esc(w.example)}</div>` : ''}
        ${w.episode_title ? `<div class="vocab-src">来自：${esc(w.episode_title)}</div>` : ''}
      </div>
      <button class="vocab-del" data-id="${w.id}" title="删除"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  list.querySelectorAll('.vocab-del').forEach(b => {
    b.addEventListener('click', async () => {
      await deleteWord(b.dataset.id).catch(() => {});
      renderVocabPage();
      showToast('已删除');
    });
  });
  applyI18n();
}

function requireFeature(name, label) {
  if (hasFeature(name)) return true;
  showToast(`「${label}」为会员功能，请到会员中心开通`);
  setTimeout(() => navigateTo('membership'), 1200);
  return false;
}

// ===== AI Explain (per transcript line) =====
async function explainLine(idx, container) {
  if (!requireFeature('ai_explain', 'AI 智能讲解')) return;
  const line = transcriptLines[idx];
  if (!line) return;
  container.innerHTML = '<div class="explain-loading"><i class="fas fa-spinner fa-spin"></i> AI 正在讲解…</div>';
  try {
    const epId = (currentEpisodeData && currentEpisodeData.id) ? currentEpisodeData.id : null;
    const data = await explainText({ sentence: line.en, sentence_index: idx, episode: epId });
    container.innerHTML = `
      <div class="explain-block">
        <pre class="explain-en">${esc(data.explanation_en)}</pre>
        <pre class="explain-zh">${esc(data.explanation_zh)}</pre>
      </div>`;
  } catch (e) {
    if (e && e.code === 'MEMBERSHIP_REQUIRED') {
      container.innerHTML = `<div class="explain-block"><div class="explain-gated">该功能为会员专属，<a href="#" class="explain-upgrade">开通会员</a></div></div>`;
      const up = container.querySelector('.explain-upgrade');
      if (up) up.addEventListener('click', (ev) => { ev.preventDefault(); navigateTo('membership'); });
    } else {
      container.innerHTML = '<div class="explain-block"><div class="explain-gated">讲解获取失败，请稍后再试</div></div>';
    }
  }
}

// ===== Vocabulary capture from transcript =====
function initWordPopover() {
  const pop = document.getElementById('wordPopover');
  const wordEl = document.getElementById('wordPopoverWord');
  const tagsEl = document.getElementById('wordPopoverTags');
  const glossEl = document.getElementById('wordPopoverGloss');
  const addBtn = document.getElementById('wordAddBtn');
  const exBtn = document.getElementById('wordExplainBtn');
  let selectedWord = '';

  function hide() { pop.style.display = 'none'; }

  addBtn.addEventListener('click', async () => {
    if (!isLoggedIn()) { showAuthModal('login'); hide(); return; }
    if (!selectedWord) return;
    const epId = (currentEpisodeData && currentEpisodeData.id) ? currentEpisodeData.id : null;
    try {
      await addWord({ term: selectedWord, source: 'transcript', episode: epId });
      showToast(`已加入生词本：${selectedWord}`);
      await loadWords();
    } catch (e) {
      if (e && e.id) showToast('该单词已在生词本中');
      else showToast('添加失败');
    }
    hide();
  });

  exBtn.addEventListener('click', async () => {
    if (!isLoggedIn()) { showAuthModal('login'); hide(); return; }
    if (!requireFeature('ai_explain', 'AI 智能讲解')) { hide(); return; }
    pop.classList.add('expanded');
    wordEl.textContent = selectedWord;
    const holder = document.getElementById('wordExplainHolder');
    holder.style.display = 'block';
    await explainLineText(selectedWord, holder);
  });

  // 点击字幕里的任意单词（详情页 .tw / 旧文稿 .transcript-word）
  document.addEventListener('click', (e) => {
    const w = e.target.closest('.tw, .transcript-word');
    if (w) {
      selectedWord = w.dataset.word;
      showWordCard(selectedWord, w);
      e.stopPropagation();
      return;
    }
    if (!pop.contains(e.target)) hide();
  });
}

/* 单词卡片：词库释义 + 考纲归属 + 加入生词本 / AI 讲解 */
function showWordCard(word, anchorEl) {
  const pop = document.getElementById('wordPopover');
  if (!pop || !word) return;
  const wordEl = document.getElementById('wordPopoverWord');
  const tagsEl = document.getElementById('wordPopoverTags');
  const glossEl = document.getElementById('wordPopoverGloss');
  const holder = document.getElementById('wordExplainHolder');

  wordEl.textContent = word;
  glossEl.textContent = WordDict.ready() ? (WordDict.fullGloss(word) || '词库暂无释义') : '词库加载中…';

  const tags = WordDict.ready() ? WordDict.tagsOf(word) : [];
  if (tags.length) {
    tagsEl.innerHTML = tags.map(t => `<span class="word-tag">${esc(t)}</span>`).join('');
  } else if (WordDict.ready() && WordDict.fullGloss(word)) {
    tagsEl.innerHTML = '<span class="word-tag muted">超出所有考纲</span>';
  } else {
    tagsEl.innerHTML = '';
  }
  holder.style.display = 'none';
  holder.innerHTML = '';
  pop.classList.remove('expanded');

  pop.style.display = 'block';
  const r = anchorEl.getBoundingClientRect();
  const w = 300;
  const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 12);
  let top = r.bottom + 8;
  // 靠近底部时向上弹
  if (top + 220 > window.innerHeight) top = Math.max(8, r.top - 228);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

async function explainLineText(text, container) {
  if (!isLoggedIn()) { showAuthModal('login'); return; }
  container.innerHTML = '<div class="explain-loading"><i class="fas fa-spinner fa-spin"></i> AI 正在讲解…</div>';
  try {
    const data = await explainText({ sentence: text, sentence_index: 0, episode: null });
    container.innerHTML = `<div class="explain-block"><pre class="explain-en">${esc(data.explanation_en)}</pre><pre class="explain-zh">${esc(data.explanation_zh)}</pre></div>`;
  } catch (e) { container.innerHTML = '<div class="explain-block"><div class="explain-gated">讲解获取失败</div></div>'; }
}

// ===== Shadowing =====
function initShadow() {
  const modal = document.getElementById('shadowModal');
  const close = document.getElementById('shadowModalClose');
  const recordBtn = document.getElementById('shadowRecordBtn');
  const stopBtn = document.getElementById('shadowStopBtn');
  const result = document.getElementById('shadowResult');

  close.addEventListener('click', () => { modal.style.display = 'none'; stopShadowRecording(true); });
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; stopShadowRecording(true); } });

  recordBtn.addEventListener('click', startShadowRecording);
  stopBtn.addEventListener('click', () => stopShadowRecording(false));
}

let shadowCurrentLineIdx = -1;

function openShadow(idx) {
  if (!requireFeature('shadowing', 'AI 跟读')) return;
  if (idx == null) idx = lastActiveLineIdx;
  if (idx < 0 || !transcriptLines[idx]) {
    showToast('请先在文稿中选择一句开始跟读');
    return;
  }
  shadowCurrentLineIdx = idx;
  shadowTargetDuration = transcriptLines[idx].time != null && idx + 1 < transcriptLines.length && transcriptLines[idx + 1].time != null
    ? (transcriptLines[idx + 1].time - transcriptLines[idx].time)
    : (transcriptLines[idx].en ? Math.max(2, transcriptLines[idx].en.split(/\s+/).length * 0.5) : 4);
  document.getElementById('shadowSentence').textContent = transcriptLines[idx].en;
  document.getElementById('shadowResult').innerHTML = '';
  document.getElementById('shadowTimer').textContent = '00:00';
  document.getElementById('shadowRecordBtn').disabled = false;
  document.getElementById('shadowStopBtn').disabled = true;
  document.getElementById('shadowModal').style.display = 'flex';
}

async function startShadowRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('当前浏览器不支持录音');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    shadowChunks = [];
    shadowRecorder = new MediaRecorder(stream);
    shadowRecorder.ondataavailable = (e) => { if (e.data.size > 0) shadowChunks.push(e.data); };
    shadowRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(shadowChunks, { type: shadowRecorder.mimeType || 'audio/webm' });
      await uploadShadow(blob);
    };
    shadowRecorder.start();
    document.getElementById('shadowRecordBtn').disabled = true;
    document.getElementById('shadowStopBtn').disabled = false;
    shadowStartTs = Date.now();
    shadowTimerId = setInterval(() => {
      const s = Math.floor((Date.now() - shadowStartTs) / 1000);
      document.getElementById('shadowTimer').textContent = formatTime(s);
    }, 200);
  } catch (e) {
    showToast('无法访问麦克风，请允许录音权限');
  }
}

function stopShadowRecording(silent) {
  if (shadowTimerId) { clearInterval(shadowTimerId); shadowTimerId = null; }
  if (shadowRecorder && shadowRecorder.state !== 'inactive') {
    shadowRecorder.stop();
  } else if (!silent) {
    document.getElementById('shadowRecordBtn').disabled = false;
    document.getElementById('shadowStopBtn').disabled = true;
  }
}

async function uploadShadow(blob) {
  const result = document.getElementById('shadowResult');
  result.innerHTML = '<div class="explain-loading"><i class="fas fa-spinner fa-spin"></i> 评分中…</div>';
  const form = new FormData();
  form.append('audio', blob, 'shadow.webm');
  form.append('episode', (currentEpisodeData && currentEpisodeData.id) ? currentEpisodeData.id : '');
  form.append('sentence_index', shadowCurrentLineIdx);
  form.append('sentence_text', transcriptLines[shadowCurrentLineIdx] ? transcriptLines[shadowCurrentLineIdx].en : '');
  form.append('target_duration', shadowTargetDuration.toFixed(2));
  try {
    const data = await recordShadowing(form);
    if (!data) { result.innerHTML = '<div class="explain-gated">请先登录后再跟读</div>'; return; }
    const score = data.score || 0;
    const level = score >= 80 ? '优秀' : score >= 60 ? '良好' : score >= 40 ? '及格' : '继续加油';
    result.innerHTML = `
      <div class="shadow-score">
        <div class="shadow-score-num">${score}</div>
        <div class="shadow-score-level">${level}</div>
        <div class="shadow-score-tip">${scoreTip(score)}</div>
      </div>`;
  } catch (e) {
    if (e && e.code === 'MEMBERSHIP_REQUIRED') {
      result.innerHTML = '<div class="explain-gated">AI 跟读为会员功能，请开通会员</div>';
    } else {
      result.innerHTML = '<div class="explain-gated">评分失败，请重试</div>';
    }
  }
  document.getElementById('shadowRecordBtn').disabled = false;
  document.getElementById('shadowStopBtn').disabled = true;
}

function scoreTip(score) {
  if (score >= 80) return '语速自然、连贯度很好，继续保持！';
  if (score >= 60) return '整体不错，注意停顿与重音会更自然。';
  if (score >= 40) return '试着跟原句节奏走，别太赶也别拖。';
  return '多听几遍原句，先慢速跟读再加速。';
}

// ===== YouTube playback =====
function ensureYouTubeAPI() {
  if (window.YT || document.getElementById('ytapi')) return;
  const tag = document.createElement('script');
  tag.id = 'ytapi';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => { ytReady = true; };
}

function loadYouTube(videoId, startSeconds) {
  ensureYouTubeAPI();
  const wrap = document.getElementById('ytWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = '<div id="ytPlayerInner"></div>';
  const start = startSeconds || 0;
  const tryCreate = () => {
    ytPlayer = new YT.Player('ytPlayerInner', {
      height: '100%', width: '100%', videoId,
      playerVars: { start: Math.floor(start), rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { if (start) ytPlayer.seekTo(start, true); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) syncPlayButtonState();
          if (e.data === YT.PlayerState.PAUSED) syncPlayButtonState();
        },
      },
    });
  };
  if (window.YT && window.YT.Player) tryCreate();
  else { const iv = setInterval(() => { if (window.YT && window.YT.Player) { clearInterval(iv); tryCreate(); } }, 200); }
}

function unloadYouTube() {
  const wrap = document.getElementById('ytWrap');
  if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch (e) {} }
  ytPlayer = null;
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

async function handleNoteSubmit() {
  const content = document.getElementById('noteContent').value.trim();
  if (!content) {
    showToast('请输入笔记内容');
    return;
  }

  const ep = getActiveEpisodeMeta();
  const ts = audioPlayer.currentTime ? Math.round(audioPlayer.currentTime) : 0;
  const note = {
    podcastId: currentPodcast.id,
    podcastTitle: currentPodcast.title,
    episodeTitle: ep.title,
    content: content,
    timestamp: formatTime(ts),
  };

  if (isLoggedIn() && ep.id) {
    try {
      await createNote(ep.id, content, ts);
      showToast('笔记已同步到云端');
    } catch (e) {
      showToast('云端保存失败，已存到本地');
    }
  }

  userNotes.unshift(note);
  localStorage.setItem('userNotes', JSON.stringify(userNotes));
  document.getElementById('noteModal').style.display = 'none';
  showToast('笔记已保存');
}

// ===== Scroll Buttons =====
function initScrollButtons() {
  const scrollContainer = document.getElementById('programsScroll');
  const leftBtn = document.getElementById('scrollLeftBtn');
  const rightBtn = document.getElementById('scrollRightBtn');

  if (!scrollContainer || !leftBtn || !rightBtn) return;

  const scrollAmount = 290;

  leftBtn.addEventListener('click', () => {
    scrollContainer.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });

  rightBtn.addEventListener('click', () => {
    scrollContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });

  function updateButtons() {
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
    const hasOverflow = scrollWidth > clientWidth + 5;

    if (!hasOverflow) {
      leftBtn.classList.add('hidden');
      rightBtn.classList.add('hidden');
      return;
    }

    if (scrollLeft <= 5) {
      leftBtn.classList.add('hidden');
    } else {
      leftBtn.classList.remove('hidden');
    }

    if (scrollLeft >= scrollWidth - clientWidth - 5) {
      rightBtn.classList.add('hidden');
    } else {
      rightBtn.classList.remove('hidden');
    }
  }

  scrollContainer.addEventListener('scroll', updateButtons);
  setTimeout(updateButtons, 500);
  setTimeout(updateButtons, 1000);
  setTimeout(updateButtons, 2000);
  window.addEventListener('resize', updateButtons);
}

// ===== Toast Notification =====
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #05142f;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    animation: fadeInUp 0.3s ease;
    white-space: nowrap;
    max-width: 90vw;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  toast.textContent = t(message);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ===== Utilities =====
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Add animation keyframe
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`;
document.head.appendChild(style);
// ===== Dark/Light Theme Toggle =====
function initTheme() {
  const html = document.documentElement;
  const saved = localStorage.getItem('theme');
  
  if (saved === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else if (saved === 'light') {
    html.removeAttribute('data-theme');
  } else {
    // No saved preference: follow system
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.setAttribute('data-theme', 'dark');
    }
  }
  
  updateThemeIcon();
  
  const btn = document.getElementById('themeToggleBtn');
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
      updateThemeIcon();
    });
  }
}

function updateThemeIcon() {
  const btn = document.getElementById('themeToggleBtn');
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
    updateThemeIcon();
  }
});

// Initialize theme (must run before DOMContentLoaded-dependent code that sets data-theme)
initTheme();

// ===== Language Settings =====

function loadLanguageSettings() {
  try {
    const storedApp = localStorage.getItem('app_language');
    const storedTrans = localStorage.getItem('translation_language');
    if (storedApp && SUPPORTED_LANGUAGES.some(l => l.code === storedApp)) appLanguage = storedApp;
    if (storedTrans && SUPPORTED_LANGUAGES.some(l => l.code === storedTrans)) translationLanguage = storedTrans;
  } catch (e) {}
  applyLanguageSettings();
}

function saveLanguageSettings() {
  try {
    localStorage.setItem('app_language', appLanguage);
    localStorage.setItem('translation_language', translationLanguage);
  } catch (e) {}
  applyLanguageSettings();
}

function applyLanguageSettings() {
  // Persist the chosen display language on the html element for CSS/SSR hooks.
  document.documentElement.setAttribute('lang', appLanguage);
  // Dispatch a small event so other components can react if needed.
  try {
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { appLanguage, translationLanguage } }));
  } catch (e) {}
  // Translate the whole UI into the chosen display language.
  applyI18n();
}

// ===== Global i18n engine =====
// Every UI string is keyed by its Chinese (source) text. applyI18n() walks the
// whole DOM and translates any element whose own text (or a supported attribute)
// matches a key. Elements built from backend data (podcast titles, transcripts,
// notes content, etc.) are never in the dictionary, so they are left untouched.
// Original (Chinese) text is cached on the element so switching languages always
// translates from the source — round-trips never get "stuck" on a translation.
const I18N = {
  // ---- Sidebar / nav ----
  '主页': { 'zh-TW': '主頁', 'en': 'Home', 'ja': 'ホーム', 'ko': '홈' },
  '关注': { 'zh-TW': '關注', 'en': 'Following', 'ja': 'フォロー', 'ko': '팔로잉' },
  '笔记': { 'zh-TW': '筆記', 'en': 'Notes', 'ja': 'ノート', 'ko': '노트' },
  '学习记录': { 'zh-TW': '學習記錄', 'en': 'History', 'ja': '学習記録', 'ko': '학습 기록' },
  '生词本': { 'zh-TW': '生字本', 'en': 'Vocabulary', 'ja': '単語帳', 'ko': '단어장' },
  '会员中心': { 'zh-TW': '會員中心', 'en': 'Membership', 'ja': 'メンバーシップ', 'ko': '멤버십' },
  'blog': { 'zh-TW': '部落格', 'en': 'Blog', 'ja': 'ブログ', 'ko': '블로그' },
  '主题切换': { 'zh-TW': '主題切換', 'en': 'Theme', 'ja': 'テーマ切替', 'ko': '테마 전환' },
  '语言设置': { 'zh-TW': '語言設定', 'en': 'Language Settings', 'ja': '言語設定', 'ko': '언어 설정' },
  '联系我们': { 'zh-TW': '聯繫我們', 'en': 'Contact', 'ja': 'お問い合わせ', 'ko': '문의하기' },
  '下载 App': { 'zh-TW': '下載 App', 'en': 'Download App', 'ja': 'アプリをダウンロード', 'ko': '앱 다운로드' },
  '隐私政策': { 'zh-TW': '隱私政策', 'en': 'Privacy', 'ja': 'プライバシー', 'ko': '개인정보' },
  '用户': { 'zh-TW': '用戶', 'en': 'User', 'ja': 'ユーザー', 'ko': '사용자' },
  '登录': { 'zh-TW': '登入', 'en': 'Sign in', 'ja': 'ログイン', 'ko': '로그인' },
  // ---- Search ----
  '搜索播客、节目、作者': { 'zh-TW': '搜尋播客、節目、作者', 'en': 'Search podcasts, episodes, authors', 'ja': 'ポッドキャスト、エピソード、作者を検索', 'ko': '팟캐스트, 에피소드, 저자 검색' },
  // ---- Page titles / sections ----
  '🔥 热门节目': { 'zh-TW': '🔥 熱門節目', 'en': '🔥 Popular Programs', 'ja': '🔥 人気番組', 'ko': '🔥 인기 프로그램' },
  '热门推荐播客': { 'zh-TW': '熱門推薦播客', 'en': 'Recommended Podcasts', 'ja': 'おすすめポッドキャスト', 'ko': '추천 팟캐스트' },
  '🆕 最新更新': { 'zh-TW': '🆕 最新更新', 'en': '🆕 Latest Updates', 'ja': '🆕 最新アップデート', 'ko': '🆕 최신 업데이트' },
  '📗 初级难度': { 'zh-TW': '📗 初級難度', 'en': '📗 Beginner', 'ja': '📗 初級レベル', 'ko': '📗 초급' },
  '📘 中级难度': { 'zh-TW': '📘 中級難度', 'en': '📘 Intermediate', 'ja': '📘 中級レベル', 'ko': '📘 중급' },
  '📕 高级难度': { 'zh-TW': '📕 高級難度', 'en': '📕 Advanced', 'ja': '📕 上級レベル', 'ko': '📕 고급' },
  '📂 精选分类': { 'zh-TW': '📂 精選分類', 'en': '📂 Categories', 'ja': '📂 カテゴリー', 'ko': '📂 카테고리' },
  '🔖 我的关注': { 'zh-TW': '🔖 我的關注', 'en': '🔖 My Following', 'ja': '🔖 フォロー一覧', 'ko': '🔖 내 팔로잉' },
  '📝 我的笔记': { 'zh-TW': '📝 我的筆記', 'en': '📝 My Notes', 'ja': '📝 マイノート', 'ko': '📝 내 노트' },
  '📊 学习记录': { 'zh-TW': '📊 學習記錄', 'en': '📊 Learning History', 'ja': '📊 学習記録', 'ko': '📊 학습 기록' },
  '最近播放': { 'zh-TW': '最近播放', 'en': 'Recent Plays', 'ja': '最近再生', 'ko': '최근 재생' },
  '📰 Blog': { 'zh-TW': '📰 部落格', 'en': '📰 Blog', 'ja': '📰 ブログ', 'ko': '📰 블로그' },
  '📚 我的生词本': { 'zh-TW': '📚 我的生字本', 'en': '📚 My Vocabulary', 'ja': '📚 マイ単語帳', 'ko': '📚 내 단어장' },
  '选择适合你的会员方案': { 'zh-TW': '選擇適合你的會員方案', 'en': 'Choose your membership plan', 'ja': 'あなたに合ったプランを選択', 'ko': '맞는 멤버십 플랜을 선택하세요' },
  '搜索结果': { 'zh-TW': '搜尋結果', 'en': 'Search Results', 'ja': '検索結果', 'ko': '검색 결과' },
  '播客列表': { 'zh-TW': '播客列表', 'en': 'Episodes', 'ja': 'エピソード一覧', 'ko': '에피소드 목록' },
  '返回': { 'zh-TW': '返回', 'en': 'Back', 'ja': '戻る', 'ko': '뒤로' },
  // ---- Empty states ----
  '去发现感兴趣的播客吧！': { 'zh-TW': '去發現感興趣的播客吧！', 'en': 'Go discover podcasts you like!', 'ja': '気になるポッドキャストを見つけよう！', 'ko': '관심 있는 팟캐스트를 찾아보세요!' },
  '在播放节目时可以添加笔记哦！': { 'zh-TW': '在播放節目時可以添加筆記哦！', 'en': 'You can add notes while playing episodes!', 'ja': '番組を再生中にノートを追加できます！', 'ko': '재생 중에 노트를 추가할 수 있어요!' },
  '暂无播放记录': { 'zh-TW': '暫無播放記錄', 'en': 'No playback history yet', 'ja': '再生履歴はまだありません', 'ko': '재생 기록이 없습니다' },
  '开始收听播客来记录你的学习历程吧！': { 'zh-TW': '開始收聽播客來記錄你的學習歷程吧！', 'en': 'Start listening to record your learning journey!', 'ja': 'ポッドキャストを聴いて学習履歴を記録しましょう！', 'ko': '팟캐스트를 들어 학습 기록을 남겨보세요!' },
  '在文稿中点击任意单词即可加入生词本': { 'zh-TW': '在文稿中點擊任意單字即可加入生字本', 'en': 'Tap any word in the transcript to save it', 'ja': '文字起こしで単語をタップして単語帳に追加', 'ko': '자막에서 단어를 탭하여 단어장에 추가' },
  '暂无数据': { 'zh-TW': '暫無資料', 'en': 'No data', 'ja': 'データがありません', 'ko': '데이터 없음' },
  '暂无节目': { 'zh-TW': '暫無節目', 'en': 'No episodes', 'ja': 'エピソードなし', 'ko': '에피소드 없음' },
  // ---- Stats ----
  '收听分钟': { 'zh-TW': '收聽分鐘', 'en': 'Minutes listened', 'ja': '再生分数', 'ko': '청취 분' },
  '播放集数': { 'zh-TW': '播放集數', 'en': 'Episodes played', 'ja': '再生エピソード数', 'ko': '재생 에피소드 수' },
  '连续天数': { 'zh-TW': '連續天數', 'en': 'Day streak', 'ja': '連続日数', 'ko': '연속 일수' },
  '周目标': { 'zh-TW': '週目標', 'en': 'Weekly goal', 'ja': '週間目標', 'ko': '주간 목표' },
  // ---- Auth ----
  '欢迎回来': { 'zh-TW': '歡迎回來', 'en': 'Welcome back', 'ja': 'おかえりなさい', 'ko': '다시 오신 것을 환영합니다' },
  '登录你的 ListenBook 账号': { 'zh-TW': '登入你的 ListenBook 帳號', 'en': 'Sign in to your ListenBook account', 'ja': 'ListenBookアカウントにログイン', 'ko': 'ListenBook 계정에 로그인하세요' },
  '用户名': { 'zh-TW': '用戶名', 'en': 'Username', 'ja': 'ユーザー名', 'ko': '사용자 이름' },
  '请输入用户名': { 'zh-TW': '請輸入用戶名', 'en': 'Enter username', 'ja': 'ユーザー名を入力', 'ko': '사용자 이름을 입력하세요' },
  '密码': { 'zh-TW': '密碼', 'en': 'Password', 'ja': 'パスワード', 'ko': '비밀번호' },
  '请输入密码': { 'zh-TW': '請輸入密碼', 'en': 'Enter password', 'ja': 'パスワードを入力', 'ko': '비밀번호를 입력하세요' },
  '请输入密码（至少8位）': { 'zh-TW': '請輸入密碼（至少8位）', 'en': 'Enter password (at least 8 characters)', 'ja': 'パスワードを入力（8文字以上）', 'ko': '비밀번호를 입력하세요(8자 이상)' },
  '还没有账号？立即注册': { 'zh-TW': '還沒有帳號？立即註冊', 'en': 'No account? Sign up now', 'ja': 'アカウントをお持ちでない方はこちら', 'ko': '계정이 없으신가요? 지금 가입하세요' },
  '创建账号': { 'zh-TW': '建立帳號', 'en': 'Create account', 'ja': 'アカウント作成', 'ko': '계정 만들기' },
  '邮箱': { 'zh-TW': '郵箱', 'en': 'Email', 'ja': 'メール', 'ko': '이메일' },
  '请输入邮箱': { 'zh-TW': '請輸入郵箱', 'en': 'Enter email', 'ja': 'メールを入力', 'ko': '이메일을 입력하세요' },
  '注册': { 'zh-TW': '註冊', 'en': 'Sign up', 'ja': '登録', 'ko': '가입' },
  '已有账号？去登录': { 'zh-TW': '已有帳號？去登入', 'en': 'Already have an account? Sign in', 'ja': 'すでにアカウントをお持ちの方', 'ko': '계정이 있으신가요? 로그인하기' },
  '注册时间': { 'zh-TW': '註冊時間', 'en': 'Joined', 'ja': '登録日', 'ko': '가입일' },
  '退出登录': { 'zh-TW': '退出登入', 'en': 'Log out', 'ja': 'ログアウト', 'ko': '로그아웃' },
  '请填写所有字段': { 'zh-TW': '請填寫所有欄位', 'en': 'Please fill in all fields', 'ja': 'すべての項目を入力してください', 'ko': '모든 항목을 입력하세요' },
  '请填写用户名和密码': { 'zh-TW': '請填寫用戶名和密碼', 'en': 'Enter username and password', 'ja': 'ユーザー名とパスワードを入力してください', 'ko': '사용자 이름과 비밀번호를 입력하세요' },
  '密码至少需要8个字符': { 'zh-TW': '密碼至少需要8個字符', 'en': 'Password needs at least 8 characters', 'ja': 'パスワードは8文字以上必要です', 'ko': '비밀번호는 8자 이상 필요합니다' },
  '登录成功！': { 'zh-TW': '登入成功！', 'en': 'Signed in!', 'ja': 'ログイン成功！', 'ko': '로그인 성공!' },
  '登录失败，请检查用户名和密码': { 'zh-TW': '登入失敗，請檢查用戶名和密碼', 'en': 'Login failed, check username and password', 'ja': 'ログイン失敗、ユーザー名とパスワードを確認してください', 'ko': '로그인 실패, 사용자 이름과 비밀번호를 확인하세요' },
  '注册成功！': { 'zh-TW': '註冊成功！', 'en': 'Signed up!', 'ja': '登録成功！', 'ko': '가입 성공!' },
  '注册失败': { 'zh-TW': '註冊失敗', 'en': 'Sign up failed', 'ja': '登録失敗', 'ko': '가입 실패' },
  '添加失败': { 'zh-TW': '添加失敗', 'en': 'Add failed', 'ja': '追加失敗', 'ko': '추가 실패' },
  // ---- Note modal ----
  '添加笔记': { 'zh-TW': '添加筆記', 'en': 'Add Note', 'ja': 'ノートを追加', 'ko': '노트 추가' },
  '写下你的笔记...': { 'zh-TW': '寫下你的筆記...', 'en': 'Write your note...', 'ja': 'ノートを書く...', 'ko': '노트를 작성하세요...' },
  '保存笔记': { 'zh-TW': '保存筆記', 'en': 'Save Note', 'ja': 'ノートを保存', 'ko': '노트 저장' },
  '请输入笔记内容': { 'zh-TW': '請輸入筆記內容', 'en': 'Enter note content', 'ja': 'ノートの内容を入力', 'ko': '노트 내용을 입력하세요' },
  // ---- Transcript modal ----
  '文稿': { 'zh-TW': '文稿', 'en': 'Transcript', 'ja': '文字起こし', 'ko': '대본' },
  '双语': { 'zh-TW': '雙語', 'en': 'Bilingual', 'ja': 'バイリンガル', 'ko': '이중 언어' },
  '英文': { 'zh-TW': '英文', 'en': 'English', 'ja': '英語', 'ko': '영어' },
  '中文': { 'zh-TW': '中文', 'en': 'Chinese', 'ja': '中国語', 'ko': '중국어' },
  '本节目暂无字幕 / 文稿': { 'zh-TW': '本節目暫無字幕 / 文稿', 'en': 'No transcript for this episode', 'ja': 'このエピソードの文字起こしはありません', 'ko': '이 에피소드의 대본이 없습니다' },
  // ---- Payment modal ----
  '确认开通会员': { 'zh-TW': '確認開通會員', 'en': 'Confirm Membership', 'ja': 'メンバーシップを確定', 'ko': '멤버십 확인' },
  '微信支付': { 'zh-TW': '微信支付', 'en': 'WeChat Pay', 'ja': 'WeChat Pay', 'ko': '위챗페이' },
  '支付宝': { 'zh-TW': '支付寶', 'en': 'Alipay', 'ja': 'Alipay', 'ko': '알리페이' },
  '银行卡': { 'zh-TW': '銀行卡', 'en': 'Bank Card', 'ja': '銀行カード', 'ko': '신용카드' },
  '确认支付': { 'zh-TW': '確認支付', 'en': 'Confirm Payment', 'ja': '支払いを確定', 'ko': '결제 확인' },
  '演示环境，不会真实扣款': { 'zh-TW': '演示環境，不會真實扣款', 'en': 'Demo only, no real charge', 'ja': 'デモ環境です。実際の決済は行われません', 'ko': '데모 환경이며 실제 결제되지 않습니다' },
  '支付处理中…': { 'zh-TW': '支付處理中…', 'en': 'Processing payment…', 'ja': '支払い処理中…', 'ko': '결제 처리 중…' },
  '会员方案': { 'zh-TW': '會員方案', 'en': 'Plan', 'ja': 'プラン', 'ko': '플랜' },
  '计费周期': { 'zh-TW': '計費週期', 'en': 'Billing period', 'ja': '請求周期', 'ko': '청구 주기' },
  '应付金额': { 'zh-TW': '應付金額', 'en': 'Amount due', 'ja': '支払金額', 'ko': '결제 금액' },
  '年付': { 'zh-TW': '年付', 'en': 'Yearly', 'ja': '年払い', 'ko': '연간' },
  '月付': { 'zh-TW': '月付', 'en': 'Monthly', 'ja': '月払い', 'ko': '월간' },
  '/月': { 'zh-TW': '/月', 'en': '/mo', 'ja': '/月', 'ko': '/월' },
  '/年': { 'zh-TW': '/年', 'en': '/yr', 'ja': '/年', 'ko': '/년' },
  '省': { 'zh-TW': '省', 'en': 'Save', 'ja': '節約', 'ko': '절약' },
  '订单号：': { 'zh-TW': '訂單號：', 'en': 'Order #: ', 'ja': '注文番号：', 'ko': '주문번호: ' },
  '开通成功！': { 'zh-TW': '開通成功！', 'en': 'Activated!', 'ja': '開通済み！', 'ko': '활성화되었습니다!' },
  '已激活，立即享受全部学习功能': { 'zh-TW': '已激活，立即享受全部學習功能', 'en': 'Now active — enjoy all learning features', 'ja': '有効になりました。すべての学習機能をお楽しみください', 'ko': '이제 활성화되어 모든 학습 기능을 이용하세요' },
  '会员': { 'zh-TW': '會員', 'en': 'Membership', 'ja': 'メンバーシップ', 'ko': '멤버십' },
  // ---- Shadow modal ----
  'AI 跟读评分': { 'zh-TW': 'AI 跟讀評分', 'en': 'AI Shadowing Score', 'ja': 'AI シャドーイング採点', 'ko': 'AI 쉐도잉 채점' },
  '开始跟读': { 'zh-TW': '開始跟讀', 'en': 'Start Shadowing', 'ja': 'シャドーイング開始', 'ko': '쉐도잉 시작' },
  '停止': { 'zh-TW': '停止', 'en': 'Stop', 'ja': '停止', 'ko': '정지' },
  // ---- Word popover ----
  '加入生词本': { 'zh-TW': '加入生字本', 'en': 'Add to Vocabulary', 'ja': '単語帳に追加', 'ko': '단어장에 추가' },
  'AI 讲解': { 'zh-TW': 'AI 講解', 'en': 'AI Explain', 'ja': 'AI 解説', 'ko': 'AI 설명' },
  // ---- Player controls (aria-label / title) ----
  '上一个': { 'zh-TW': '上一個', 'en': 'Previous', 'ja': '前へ', 'ko': '이전' },
  '下一个': { 'zh-TW': '下一個', 'en': 'Next', 'ja': '次へ', 'ko': '다음' },
  '后退10秒': { 'zh-TW': '後退10秒', 'en': 'Back 10s', 'ja': '10秒戻る', 'ko': '10초 뒤로' },
  '快进10秒': { 'zh-TW': '快進10秒', 'en': 'Forward 10s', 'ja': '10秒進む', 'ko': '10초 앞으로' },
  '播放/暂停': { 'zh-TW': '播放/暫停', 'en': 'Play/Pause', 'ja': '再生/一時停止', 'ko': '재생/일시정지' },
  '切换深色/浅色主题': { 'zh-TW': '切換深色/淺色主題', 'en': 'Toggle dark/light theme', 'ja': 'ダーク/ライトテーマ切替', 'ko': '다크/라이트 테마 전환' },
  '字幕/文稿': { 'zh-TW': '字幕/文稿', 'en': 'Subtitles/Transcript', 'ja': '字幕/文字起こし', 'ko': '자막/대본' },
  // ---- Membership ----
  '会员套餐加载中…': { 'zh-TW': '會員套餐加載中…', 'en': 'Loading membership plans…', 'ja': 'メンバーシッププラン読み込み中…', 'ko': '멤버십 플랜 불러오는 중…' },
  '会员页渲染出错：': { 'zh-TW': '會員頁渲染出錯：', 'en': 'Membership page error: ', 'ja': 'メンバーシップページエラー：', 'ko': '멤버십 페이지 오류: ' },
  '会员套餐加载失败': { 'zh-TW': '會員套餐加載失敗', 'en': 'Failed to load membership plans', 'ja': 'メンバーシッププランの読み込みに失敗', 'ko': '멤버십 플랜 로드 실패' },
  '请检查网络后重试': { 'zh-TW': '請檢查網絡後重試', 'en': 'Check your network and retry', 'ja': 'ネットワークを確認して再試行', 'ko': '네트워크를 확인하고 다시 시도' },
  '重试': { 'zh-TW': '重試', 'en': 'Retry', 'ja': '再試行', 'ko': '다시 시도' },
  '最受欢迎': { 'zh-TW': '最受歡迎', 'en': 'Most Popular', 'ja': '一番人気', 'ko': '가장 인기' },
  '当前方案': { 'zh-TW': '當前方案', 'en': 'Current Plan', 'ja': '現在のプラン', 'ko': '현재 플랜' },
  '免费使用': { 'zh-TW': '免費使用', 'en': 'Free', 'ja': '無料', 'ko': '무료' },
  '立即开通': { 'zh-TW': '立即開通', 'en': 'Subscribe Now', 'ja': '今すぐ登録', 'ko': '지금 가입' },
  '你当前使用的是免费版，开通会员解锁 AI 智能讲解、AI 跟读评分等核心功能。': { 'zh-TW': '你當前使用的是免費版，開通會員解鎖 AI 智能講解、AI 跟讀評分等核心功能。', 'en': 'You are on the free plan. Upgrade to unlock AI Smart Explain, AI Shadowing scoring and other core features.', 'ja': '現在無料版をご利用中です。アップグレードするとAIスマート解説やAIシャドーイング採点などの主要機能が利用できます。', 'ko': '현재 무료 버전을 이용 중입니다. 멤버십에 가입하면 AI 스마트 설명, AI 쉐도잉 채점 등 핵심 기능을 이용할 수 있습니다.' },
  '解锁 AI 智能讲解、AI 跟读评分等核心学习功能，让英语听力突飞猛进': { 'zh-TW': '解鎖 AI 智能講解、AI 跟讀評分等核心學習功能，讓英語聽力突飛猛進', 'en': 'Unlock AI Smart Explain, AI Shadowing scoring and other core learning features to boost your English listening', 'ja': 'AIスマート解説やAIシャドーイング採点など主要学習機能を解放し、英語リスニングを飛躍させましょう', 'ko': 'AI 스마트 설명, AI 쉐도잉 채점 등 핵심 학습 기능을 해제하여 영어 듣기 실력을 향상시키세요' },
  '已解锁：': { 'zh-TW': '已解鎖：', 'en': 'Unlocked: ', 'ja': '解放済み：', 'ko': '잠금 해제됨: ' },
  '取消自动续费': { 'zh-TW': '取消自動續費', 'en': 'Cancel auto-renew', 'ja': '自動更新をキャンセル', 'ko': '자동 갱신 취소' },
  '当前会员：': { 'zh-TW': '當前會員：', 'en': 'Current membership: ', 'ja': '現在のメンバーシップ：', 'ko': '현재 멤버십: ' },
  '到期时间：': { 'zh-TW': '到期時間：', 'en': 'Expiry: ', 'ja': '有効期限：', 'ko': '만료일: ' },
  '免费版': { 'zh-TW': '免費版', 'en': 'Free', 'ja': '無料版', 'ko': '무료 버전' },
  '长期': { 'zh-TW': '長期', 'en': 'Lifetime', 'ja': '永久', 'ko': '영구' },
  'ListenBook是英语学习和听力练习平台，通过播客帮助用户提升英语听力水平': { 'zh-TW': 'ListenBook是英語學習和聽力練習平台，通過播客幫助用戶提升英語聽力水平', 'en': 'ListenBook is an English learning and listening practice platform that uses podcasts to improve your listening skills', 'ja': 'ListenBookは英語学習・リスニング練習プラットフォームで、ポッドキャストを通じて英語リスニング力を向上させます', 'ko': 'ListenBook은 팟캐스트를 통해 영어 듣기 실력을 향상시키는 영어 학습 및 리스닝 연습 플랫폼입니다' },
  // ---- Membership features (featureLabel) ----
  '基础播放': { 'zh-TW': '基礎播放', 'en': 'Basic Player', 'ja': '基本再生', 'ko': '기본 재생' },
  '双语字幕': { 'zh-TW': '雙語字幕', 'en': 'Bilingual Subtitles', 'ja': 'バイリンガル字幕', 'ko': '이중 자막' },
  '中文翻译': { 'zh-TW': '中文翻譯', 'en': 'Chinese Translation', 'ja': '中国語翻訳', 'ko': '중국어 번역' },
  '学习笔记': { 'zh-TW': '學習筆記', 'en': 'Study Notes', 'ja': '学習ノート', 'ko': '학습 노트' },
  '收藏关注': { 'zh-TW': '收藏關注', 'en': 'Favorites', 'ja': 'お気に入り', 'ko': '즐겨찾기' },
  '播放历史': { 'zh-TW': '播放歷史', 'en': 'Playback History', 'ja': '再生履歴', 'ko': '재생 기록' },
  'AI 智能讲解': { 'zh-TW': 'AI 智能講解', 'en': 'AI Smart Explain', 'ja': 'AI スマート解説', 'ko': 'AI 스마트 설명' },
  '高清音质': { 'zh-TW': '高清音質', 'en': 'HD Audio', 'ja': '高音質', 'ko': '고음질' },
  '全部内容': { 'zh-TW': '全部內容', 'en': 'All Content', 'ja': 'すべてのコンテンツ', 'ko': '모든 콘텐츠' },
  '免广告': { 'zh-TW': '免廣告', 'en': 'Ad-free', 'ja': '広告なし', 'ko': '광고 없음' },
  '离线下载': { 'zh-TW': '離線下載', 'en': 'Offline Download', 'ja': 'オフライン再生', 'ko': '오프라인 다운로드' },
  '优先支持': { 'zh-TW': '優先支持', 'en': 'Priority Support', 'ja': '優先サポート', 'ko': '우선 지원' },
  // ---- Detail / episodes ----
  '该播客暂无节目': { 'zh-TW': '該播客暫無節目', 'en': 'This podcast has no episodes yet', 'ja': 'このポッドキャストにはエピソードがありません', 'ko': '이 팟캐스트에는 에피소드가 없습니다' },
  '加载节目中…': { 'zh-TW': '加載節目中…', 'en': 'Loading episodes…', 'ja': 'エピソード読み込み中…', 'ko': '에피소드 불러오는 중…' },
  '讲解': { 'zh-TW': '講解', 'en': 'Explain', 'ja': '解説', 'ko': '설명' },
  '讲解获取失败': { 'zh-TW': '講解獲取失敗', 'en': 'Failed to get explanation', 'ja': '解説の取得に失敗', 'ko': '설명을 가져오지 못했습니다' },
  '讲解获取失败，请稍后再试': { 'zh-TW': '講解獲取失敗，請稍後再試', 'en': 'Failed to get explanation, please retry', 'ja': '解説の取得に失敗しました。後でもう一度お試しください', 'ko': '설명을 가져오지 못했습니다. 나중에 다시 시도하세요' },
  '该功能为会员专属，开通会员': { 'zh-TW': '該功能為會員專屬，開通會員', 'en': 'This feature is for members only — upgrade', 'ja': 'この機能は会員限定です。アップグレードしてください', 'ko': '이 기능은 멤버 전용입니다. 멤버십에 가입하세요' },
  '开通会员': { 'zh-TW': '開通會員', 'en': 'Upgrade', 'ja': 'アップグレード', 'ko': '멤버십 가입' },
  'AI 跟读为会员功能，请开通会员': { 'zh-TW': 'AI 跟讀為會員功能，請開通會員', 'en': 'AI Shadowing is a member feature — please upgrade', 'ja': 'AIシャドーイングは会員機能です。アップグレードしてください', 'ko': 'AI 쉐도잉은 멤버 전용 기능입니다. 멤버십에 가입하세요' },
  '评分失败，请重试': { 'zh-TW': '評分失敗，請重試', 'en': 'Scoring failed, please retry', 'ja': '採点に失敗しました。再試行してください', 'ko': '채점에 실패했습니다. 다시 시도하세요' },
  '请先登录后再跟读': { 'zh-TW': '請先登入後再跟讀', 'en': 'Please log in before shadowing', 'ja': 'シャドーイング前にログインしてください', 'ko': '쉐도잉 전에 로그인하세요' },
  'AI 正在讲解…': { 'zh-TW': 'AI 正在講解…', 'en': 'AI is explaining…', 'ja': 'AIが解説中…', 'ko': 'AI가 설명 중…' },
  '评分中…': { 'zh-TW': '評分中…', 'en': 'Scoring…', 'ja': '採点中…', 'ko': '채점 중…' },
  '集': { 'zh-TW': '集', 'en': 'Episodes', 'ja': 'エピソード', 'ko': '에피소드' },
  '个播客': { 'zh-TW': '個播客', 'en': 'podcasts', 'ja': 'ポッドキャスト', 'ko': '팟캐스트' },
  '播放完毕': { 'zh-TW': '播放完畢', 'en': 'Playback finished', 'ja': '再生終了', 'ko': '재생 완료' },
  '关注': { 'zh-TW': '關注', 'en': 'Follow', 'ja': 'フォロー', 'ko': '팔로우' },
  '已关注': { 'zh-TW': '已關注', 'en': 'Following', 'ja': 'フォロー中', 'ko': '팔로잉' },
  '节目': { 'zh-TW': '節目', 'en': 'Episode', 'ja': 'エピソード', 'ko': '에피소드' },
  '会员功能': { 'zh-TW': '會員功能', 'en': 'Member feature', 'ja': '会員機能', 'ko': '멤버 전용 기능' },
  // ---- Toasts / misc ----
  '已取消关注': { 'zh-TW': '已取消關注', 'en': 'Unfollowed', 'ja': 'フォロー解除', 'ko': '팔로우 취소됨' },
  '已加入生词本：': { 'zh-TW': '已加入生字本：', 'en': 'Added to vocabulary: ', 'ja': '単語帳に追加しました：', 'ko': '단어장에 추가됨: ' },
  '云端保存失败，已存到本地': { 'zh-TW': '雲端保存失敗，已存到本地', 'en': 'Cloud save failed, saved locally', 'ja': 'クラウド保存失敗、ローカルに保存しました', 'ko': '클라우드 저장 실패, 로컬에 저장됨' },
  '笔记已保存': { 'zh-TW': '筆記已保存', 'en': 'Note saved', 'ja': 'ノートを保存しました', 'ko': '노트가 저장됨' },
  '笔记已删除': { 'zh-TW': '筆記已刪除', 'en': 'Note deleted', 'ja': 'ノートを削除しました', 'ko': '노트가 삭제됨' },
  '笔记已同步到云端': { 'zh-TW': '筆記已同步到雲端', 'en': 'Note synced to cloud', 'ja': 'ノートをクラウドに同期しました', 'ko': '노트가 클라우드에 동기화됨' },
  '会员开通成功！': { 'zh-TW': '會員開通成功！', 'en': 'Membership activated!', 'ja': 'メンバーシップ開通成功！', 'ko': '멤버십 활성화 성공!' },
  '当前浏览器不支持录音': { 'zh-TW': '當前瀏覽器不支援錄音', 'en': "Current browser doesn't support recording", 'ja': '現在のブラウザは録音に対応していません', 'ko': '현재 브라우저는 녹음을 지원하지 않습니다' },
  '当前音频暂时无法播放，请稍后再试': { 'zh-TW': '當前音頻暫時無法播放，請稍後再試', 'en': "This audio can't play right now, please retry", 'ja': '現在この音声は再生できません。後ほどお試しください', 'ko': '현재 오디오를 재생할 수 없습니다. 나중에 다시 시도하세요' },
  '请先在文稿中选择一句开始跟读': { 'zh-TW': '請先在文稿中選擇一句開始跟讀', 'en': 'Select a sentence in the transcript to start shadowing', 'ja': '文字起こしで文を選択してシャドーイングを始めてください', 'ko': '대본에서 문장을 선택해 쉐도잉을 시작하세요' },
  '请先播放一个节目': { 'zh-TW': '請先播放一個節目', 'en': 'Play an episode first', 'ja': 'まずエピソードを再生してください', 'ko': '먼저 에피소드를 재생하세요' },
  '该单词已在生词本中': { 'zh-TW': '該單字已在生字本中', 'en': 'This word is already in your vocabulary', 'ja': 'この単語はすでに単語帳にあります', 'ko': '이 단어는 이미 단어장에 있습니다' },
  '无法访问麦克风，请允许录音权限': { 'zh-TW': '無法存取麥克風，請允許錄音權限', 'en': "Can't access microphone, please allow recording permission", 'ja': 'マイクにアクセスできません。録音権限を許可してください', 'ko': '마이크에 접근할 수 없습니다. 녹음 권한을 허용하세요' },
  '显示语言': { 'zh-TW': '顯示語言', 'en': 'Display Language', 'ja': '表示言語', 'ko': '표시 언어' },
  '翻译语言': { 'zh-TW': '翻譯語言', 'en': 'Translation Language', 'ja': '翻訳言語', 'ko': '번역 언어' },
  '根据你选择的语言显示功能': { 'zh-TW': '根據你選擇的語言顯示功能', 'en': 'The language used to display features', 'ja': '選択した言語で機能を表示します', 'ko': '선택한 언어로 기능을 표시합니다' },
  '根据你选择的语言显示翻译与讲解': { 'zh-TW': '根據你選擇的語言顯示翻譯與講解', 'en': 'The language used for translations and explanations', 'ja': '選択した言語で翻訳と解説を表示します', 'ko': '선택한 언어로 번역과 설명을 표시합니다' },
  '显示语言已设置为：': { 'zh-TW': '顯示語言已設定為：', 'en': 'Display language set to: ', 'ja': '表示言語を設定しました：', 'ko': '표시 언어를 설정했습니다: ' },
  '翻译语言已设置为：': { 'zh-TW': '翻譯語言已設定為：', 'en': 'Translation language set to: ', 'ja': '翻訳言語を設定しました：', 'ko': '번역 언어를 설정했습니다: ' },
  '继续加油': { 'zh-TW': '繼續加油', 'en': 'Keep going', 'ja': 'がんばろう', 'ko': '계속 화이팅' },
  // ---- Shadowing scores / tips ----
  '优秀': { 'zh-TW': '優秀', 'en': 'Excellent', 'ja': '優秀', 'ko': '우수' },
  '良好': { 'zh-TW': '良好', 'en': 'Good', 'ja': '良好', 'ko': '양호' },
  '及格': { 'zh-TW': '及格', 'en': 'Pass', 'ja': '及格', 'ko': '합격' },
  '多听几遍原句，先慢速跟读再加速。': { 'zh-TW': '多聽幾遍原句，先慢速跟讀再加速。', 'en': 'Listen to the original sentence a few times; shadow slowly first, then speed up.', 'ja': '原稿を何度か聞き、まずはゆっくりシャドーイングしてからスピードを上げましょう。', 'ko': '원문을 몇 번 듣고, 먼저 천천히 쉐도잉한 뒤 속도를 높이세요.' },
  '整体不错，注意停顿与重音会更自然。': { 'zh-TW': '整體不錯，注意停頓與重音會更自然。', 'en': 'Pretty good overall — mind the pauses and stress for a more natural feel.', 'ja': '全体的に良いです。ポーズとアクセントに気をつけるとより自然になります。', 'ko': '전반적으로 좋습니다. 쉼표와 강세에 신경 쓰면 더 자연스러워집니다.' },
  '试着跟原句节奏走，别太赶也别拖。': { 'zh-TW': '試著跟原句節奏走，別太趕也別拖。', 'en': "Try to follow the original rhythm — don't rush or drag.", 'ja': '原稿のリズムに合わせて。急ぎすぎず、引きずらず。', 'ko': '원문의 리듬을 따라가세요. 너무 빠르거나 느리지 않게.' },
  '语速自然、连贯度很好，继续保持！': { 'zh-TW': '語速自然、連貫度很好，繼續保持！', 'en': 'Natural pace and great fluency — keep it up!', 'ja': '自然な話速で流暢さも素晴らしい。この調子で！', 'ko': '자연스러운 속도와 유창함이 훌륭합니다. 계속 유지하세요!' },
  // ---- Categories ----
  '新闻时事': { 'zh-TW': '新聞時事', 'en': 'News', 'ja': 'ニュース', 'ko': '뉴스' },
  '科技': { 'zh-TW': '科技', 'en': 'Tech', 'ja': 'テクノロジー', 'ko': '기술' },
  '商业': { 'zh-TW': '商業', 'en': 'Business', 'ja': 'ビジネス', 'ko': '비즈니스' },
  '教育': { 'zh-TW': '教育', 'en': 'Education', 'ja': '教育', 'ko': '교육' },
  '健康': { 'zh-TW': '健康', 'en': 'Health', 'ja': '健康', 'ko': '건강' },
  '社会': { 'zh-TW': '社會', 'en': 'Society', 'ja': '社会', 'ko': '사회' },
  '文化': { 'zh-TW': '文化', 'en': 'Culture', 'ja': '文化', 'ko': '문화' },
  '科学': { 'zh-TW': '科學', 'en': 'Science', 'ja': '科学', 'ko': '과학' },
  '体育': { 'zh-TW': '體育', 'en': 'Sports', 'ja': 'スポーツ', 'ko': '스포츠' },
  '娱乐': { 'zh-TW': '娛樂', 'en': 'Entertainment', 'ja': 'エンタメ', 'ko': '엔터테인먼트' },
  '故事': { 'zh-TW': '故事', 'en': 'Stories', 'ja': 'ストーリー', 'ko': '이야기' },
  '未分类': { 'zh-TW': '未分類', 'en': 'Uncategorized', 'ja': '未分類', 'ko': '분류 없음' },
  '未命名节目': { 'zh-TW': '未命名節目', 'en': 'Untitled Episode', 'ja': '無題のエピソード', 'ko': '제목 없음 에피소드' },
  '未知作者': { 'zh-TW': '未知作者', 'en': 'Unknown Author', 'ja': '不明な作者', 'ko': '알 수 없는 작성자' },
  '未知节目': { 'zh-TW': '未知節目', 'en': 'Unknown Episode', 'ja': '不明なエピソード', 'ko': '알 수 없는 에피소드' },
  // ---- Difficulty ----
  '初级': { 'zh-TW': '初級', 'en': 'Beginner', 'ja': '初級', 'ko': '초급' },
  '中级': { 'zh-TW': '中級', 'en': 'Intermediate', 'ja': '中級', 'ko': '중급' },
  '高级': { 'zh-TW': '高級', 'en': 'Advanced', 'ja': '上級', 'ko': '고급' },
  // ---- Misc ----
  '删除': { 'zh-TW': '刪除', 'en': 'Delete', 'ja': '削除', 'ko': '삭제' },
};

function t(key) {
  const entry = I18N[key];
  if (entry && entry[appLanguage]) return entry[appLanguage];
  return key;
}

function getOwnText(el) {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue;
  }
  return s.replace(/\s+/g, ' ').trim();
}

function setOwnText(el, text) {
  const textNodes = [];
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) textNodes.push(n);
  if (textNodes.length === 0) { el.appendChild(document.createTextNode(text)); return; }
  textNodes[0].nodeValue = text;
  for (let i = 1; i < textNodes.length; i++) el.removeChild(textNodes[i]);
}

// Translate the whole document (or a subtree) into the current display language.
// Safe to call repeatedly: original (Chinese) text is cached on each element,
// and stale caches are re-anchored or cleared when an element's content is
// replaced programmatically (e.g. the user button showing a username).
function isConsistent(key, text) {
  if (text === key) return true;
  const entry = I18N[key];
  if (!entry) return false;
  for (const lang in entry) { if (entry[lang] === text) return true; }
  return false;
}

function applyI18n(root) {
  root = root || document.body;
  // 1) Explicit data-i18n keys (used for dynamic / count-unit strings).
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  // 2) Generic: translate any element whose own text is a known key,
  //    plus translatable attributes (placeholder / title / aria-label).
  root.querySelectorAll('*').forEach(el => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'OPTION') return;
    if (el.dataset.i18n) return; // handled above

    ['placeholder', 'title', 'aria-label'].forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const dk = 'i18n' + attr.replace(/[^a-zA-Z]/g, '');
      let val = el.getAttribute(attr);
      let akey = el.dataset[dk];
      if (akey === undefined || akey === '') {
        if (I18N[val]) { akey = val; el.dataset[dk] = val; }
        else { el.dataset[dk] = ''; return; }
      }
      if (!isConsistent(akey, val)) {
        if (I18N[val]) { el.dataset[dk] = val; akey = val; }
        else { el.dataset[dk] = ''; return; }
      }
      const tr = t(akey);
      if (tr !== val) el.setAttribute(attr, tr);
    });

    const own = getOwnText(el);
    if (!own) return;
    let key = el.dataset.i18nOrig;
    if (key === undefined || key === '') {
      if (I18N[own]) { key = own; el.dataset.i18nOrig = own; }
      else { el.dataset.i18nOrig = ''; return; }
    }
    if (!isConsistent(key, own)) {
      if (I18N[own]) { el.dataset.i18nOrig = own; key = own; }
      else { el.dataset.i18nOrig = ''; return; }
    }
    const tr = t(key);
    if (tr !== own) setOwnText(el, tr);
  });
}

function languageToast(key, name) {
  const messages = {
    'zh-CN': { app: '显示语言已设置为：', trans: '翻译语言已设置为：' },
    'zh-TW': { app: '顯示語言已設定為：', trans: '翻譯語言已設定為：' },
    'en': { app: 'Display language set to: ', trans: 'Translation language set to: ' },
    'ja': { app: '表示言語を設定しました：', trans: '翻訳言語を設定しました：' },
    'ko': { app: '표시 언어를 설정했습니다: ', trans: '번역 언어를 설정했습니다: ' },
  };
  const m = (messages[appLanguage] || messages['zh-CN'])[key];
  showToast(m + name);
}

function getLanguageName(code) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang ? lang.native : code;
}

function renderLanguagePage() {
  const appSelect = document.getElementById('appLanguageSelect');
  const transSelect = document.getElementById('translationLanguageSelect');
  if (!appSelect || !transSelect) return;
  appSelect.value = appLanguage;
  transSelect.value = translationLanguage;

  appSelect.onchange = () => {
    appLanguage = appSelect.value;
    saveLanguageSettings();
    renderLanguagePage();
    languageToast('app', getLanguageName(appLanguage));
  };
  transSelect.onchange = () => {
    translationLanguage = transSelect.value;
    saveLanguageSettings();
    languageToast('trans', getLanguageName(translationLanguage));
  };
}

function changeAppLanguage(code) {
  if (!SUPPORTED_LANGUAGES.some(l => l.code === code)) return;
  appLanguage = code;
  saveLanguageSettings();
  renderLanguagePage();
}

function changeTranslationLanguage(code) {
  if (!SUPPORTED_LANGUAGES.some(l => l.code === code)) return;
  translationLanguage = code;
  saveLanguageSettings();
  renderLanguagePage();
}
