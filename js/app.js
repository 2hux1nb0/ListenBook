// ===== ListenBook App Logic =====

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
document.addEventListener('DOMContentLoaded', async () => {
  await syncDownlistedPodcasts();
  await loadBackendPodcasts();

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
  initCategoriesPage();
  updateUserUI();
  loadFavoritesFromStorage();
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
    cover: resolveMediaUrl(p.cover_image),
    description: p.description || '',
    episodes: [],
    isFeatured: !!p.is_featured,
    isActive: p.is_active !== false,
    backendId: p.id,
  }));

  const merged = [...localPodcasts, ...backendMapped];
  const unique = [];
  const seen = new Set();
  merged.forEach(item => {
    const key = item.backendId ? `backend:${item.backendId}` : `local:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  });
  return unique;
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
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <span>${p.episodes.length}集</span>
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
  document.getElementById('detailEpisodes').innerHTML = `<i class="fas fa-list"></i> <span id="detailEpisodeCount">…</span> 集`;
  document.getElementById('detailCategories').innerHTML = `<i class="fas fa-tag"></i> ${podcast.categoryLabel}`;

  const levelEl = document.getElementById('detailLevel');
  levelEl.textContent = DIFFICULTY_MAP[podcast.difficulty];
  levelEl.className = 'detail-level ' + podcast.difficulty;

  document.getElementById('detailDesc').textContent = podcast.description;

  updateFavoriteBtn();
  navigateTo('detail');

  const episodesContainer = document.getElementById('episodesList');
  episodesContainer.innerHTML = '<div class="episode-loading"><i class="fas fa-spinner fa-spin"></i> 加载节目中…</div>';

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
  const results = PODCAST_DATA.filter(p =>
    p.title.toLowerCase().includes(lowerKeyword) ||
    p.author.toLowerCase().includes(lowerKeyword) ||
    p.categoryLabel.includes(keyword) ||
    p.description.includes(keyword)
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
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
  });
  forwardBtn.addEventListener('click', () => {
    audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 10);
  });

  closeBtn.addEventListener('click', () => {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.currentTime = 0;
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
    if (Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
      document.getElementById('playerDuration').textContent = formatTime(audioPlayer.duration);
      document.getElementById('playerProgress').style.width = '0%';
    }
  });
}

function syncPlayButtonState() {
  const playPauseBtn = document.getElementById('playerPlayPause');
  if (!playPauseBtn) return;
  const shouldPause = Boolean(playbackInterval) || !audioPlayer.paused;
  playPauseBtn.innerHTML = shouldPause ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function seekToProgressPosition(clientX) {
  const progressBar = document.getElementById('playerProgressBar');
  if (!progressBar || !audioPlayer.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  audioPlayer.currentTime = pos * audioPlayer.duration;
  progressBar.style.setProperty('--seek-pos', `${pos * 100}%`);
  updatePlayerProgress();
}

function updatePreviewTime(clientX) {
  const progressBar = document.getElementById('playerProgressBar');
  const progressLabel = document.getElementById('playerProgressLabel');
  if (!progressBar || !audioPlayer.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const time = pos * audioPlayer.duration;
  const currentTimeEl = document.getElementById('playerCurrentTime');
  if (currentTimeEl) {
    currentTimeEl.textContent = formatTime(time);
  }
  if (progressLabel) {
    progressLabel.textContent = formatTime(time);
    progressLabel.style.left = `${pos * 100}%`;
    progressLabel.classList.add('visible');
  }
  progressBar.style.setProperty('--seek-pos', `${pos * 100}%`);
}

function resetPreviewTime() {
  const currentTimeEl = document.getElementById('playerCurrentTime');
  const progressLabel = document.getElementById('playerProgressLabel');
  if (currentTimeEl && audioPlayer.duration) {
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime || 0);
  }
  if (progressLabel) {
    progressLabel.classList.remove('visible');
  }
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
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
    updatePlayerProgress();
    return;
  }

  if (e.code === 'ArrowRight') {
    e.preventDefault();
    audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 10);
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
    const fallbackAudioUrl = `${MEDIA_BASE}/media/demo-audio.wav`;
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

function updatePlayerProgress() {
  const duration = Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0 ? audioPlayer.duration : 0;
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

function renderTranscript() {
  const body = document.getElementById('transcriptBody');
  if (!transcriptLines.length) {
    body.innerHTML = '<div class="transcript-empty"><i class="fas fa-file-lines"></i><p>本节目暂无字幕 / 文稿</p></div>';
    return;
  }
  body.innerHTML = transcriptLines.map((line, idx) => `
    <div class="transcript-line ${idx === lastActiveLineIdx ? 'active' : ''}" data-idx="${idx}" onclick="seekTranscriptLine(${idx})">
      ${line.time != null ? `<span class="transcript-time">${formatTime(line.time)}</span>` : ''}
      <div class="transcript-text">
        ${transcriptMode !== 'zh' && line.en ? `<div class="transcript-en">${esc(line.en)}</div>` : ''}
        ${transcriptMode !== 'en' && line.zh ? `<div class="transcript-zh">${esc(line.zh)}</div>` : ''}
      </div>
    </div>`).join('');
}

function seekTranscriptLine(idx) {
  const line = transcriptLines[idx];
  if (line && line.time != null && audioPlayer.duration) {
    audioPlayer.currentTime = line.time;
    if (audioPlayer.paused) audioPlayer.play().catch(() => {});
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
  const modal = document.getElementById('transcriptModal');
  if (modal.style.display !== 'flex') return;
  const t = audioPlayer.currentTime;
  let active = -1;
  for (let i = 0; i < transcriptLines.length; i++) {
    if (transcriptLines[i].time != null && transcriptLines[i].time <= t) active = i;
    else break;
  }
  if (active === lastActiveLineIdx) return;
  lastActiveLineIdx = active;
  document.querySelectorAll('.transcript-line').forEach(el => el.classList.remove('active'));
  if (active >= 0) {
    const el = document.querySelector(`.transcript-line[data-idx="${active}"]`);
    if (el) {
      el.classList.add('active');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
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
    favorites = new Set(favs.map(f => `backend-${f.podcast}`));
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

function renderHistoryPage() {
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');

  const stored = localStorage.getItem('playbackHistory');
  playbackHistory = stored ? JSON.parse(stored) : [];

  document.getElementById('statMinutes').textContent = playbackHistory.length * 15;
  document.getElementById('statEpisodes').textContent = playbackHistory.length;
  document.getElementById('statStreak').textContent = calculateStreak();
  document.getElementById('statGoal').textContent = 100;

  if (playbackHistory.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = playbackHistory.slice(0, 20).map(h => `
    <div class="history-item" onclick="openDetail(${h.podcastId})">
      <div class="history-cover">
        <img src="${h.podcastCover}" alt="" loading="lazy">
      </div>
      <div class="history-info">
        <div class="history-title">${h.episodeTitle}</div>
        <div class="history-podcast">${h.podcastTitle}</div>
      </div>
      <div class="history-time">${formatHistoryTime(h.timestamp)}</div>
    </div>
  `).join('');
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
    const count = PODCAST_DATA.filter(p => p.category === cat.key).length;
    return `
      <div class="category-page-card" style="border-left: 4px solid ${cat.color}" onclick="selectCategory('${cat.key}')">
        <div class="category-page-icon" style="color: ${cat.color}">
          <i class="fas ${cat.icon}"></i>
        </div>
        <div class="category-page-info">
          <div class="category-page-name">${cat.label}</div>
          <div class="category-page-count">${count} 个播客</div>
        </div>
        <i class="fas fa-chevron-right category-page-arrow"></i>
      </div>
    `;
  }).join('');
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
  const sidebarItems = document.querySelectorAll('.sidebar-nav .sidebar-item');

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
  if (user) {
    userBtnText.textContent = user.username;
  } else {
    userBtnText.textContent = '登录';
  }
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
  toast.textContent = message;
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
