// ===== ListenLeap App Logic =====

// State
let currentCategory = 'all';
let currentPage = 'home';
let previousPage = 'home';
let currentPodcastId = null;
let currentPodcast = null;
let currentEpisodeIndex = 0;
let favorites = new Set();
let userNotes = [];
let playbackHistory = [];

// ===== DOM Elements =====
const searchInput = document.getElementById('searchInput');
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
    const res = await fetch('http://localhost:8000/api/admin/podcasts/');
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
  const filtered = currentCategory === 'all'
    ? PODCAST_DATA
    : PODCAST_DATA.filter(p => p.category === currentCategory);

  const popular = filtered.slice(0, 6);
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
    <div class="program-card" onclick="openDetail(${p.id})">
      <div class="program-cover">
        <img src="${p.cover}" alt="${p.title}" loading="lazy">
      </div>
      <div class="program-title">${p.title}</div>
      <div class="program-label">${p.author}</div>
      <div class="program-bottom">
        <div class="program-play-btn" onclick="event.stopPropagation(); playPodcast(${p.id})">
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
    <div class="podcast-card" onclick="openDetail(${p.id})">
      <div class="podcast-cover-wrap">
        <img src="${p.cover}" alt="${p.title}" loading="lazy">
        <div class="podcast-overlay">
          <div class="podcast-play-icon" onclick="event.stopPropagation(); playPodcast(${p.id})">
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
function openDetail(podcastId) {
  const podcast = PODCAST_DATA.find(p => p.id === podcastId);
  if (!podcast) return;

  currentPodcast = podcast;
  currentPodcastId = podcastId;

  document.getElementById('detailCover').src = podcast.cover;
  document.getElementById('detailTitle').textContent = podcast.title;
  document.getElementById('detailAuthor').innerHTML = `<i class="fas fa-user"></i> ${podcast.author}`;
  document.getElementById('detailEpisodes').innerHTML = `<i class="fas fa-list"></i> ${podcast.episodes.length} 集`;
  document.getElementById('detailCategory').innerHTML = `<i class="fas fa-tag"></i> ${podcast.categoryLabel}`;

  const levelEl = document.getElementById('detailLevel');
  levelEl.textContent = DIFFICULTY_MAP[podcast.difficulty];
  levelEl.className = 'detail-level ' + podcast.difficulty;

  document.getElementById('detailDesc').textContent = podcast.description;

  updateFavoriteBtn();

  const episodesContainer = document.getElementById('episodesList');
  episodesContainer.innerHTML = podcast.episodes.map((ep, idx) => `
    <div class="episode-item ${idx === currentEpisodeIndex && currentPodcastId === podcastId ? 'playing' : ''}" onclick="playEpisode(${podcast.id}, ${idx})">
      <div class="episode-cover">
        <img src="${podcast.cover}" alt="${ep.title}" loading="lazy">
      </div>
      <div class="episode-info">
        <div class="episode-title">${ep.title}</div>
        <div class="episode-meta">
          <span class="episode-duration"><i class="fas fa-clock"></i> ${ep.duration}</span>
          <span>${ep.date}</span>
        </div>
      </div>
      <div class="episode-play-btn">
        <i class="fas fa-play"></i>
      </div>
    </div>
  `).join('');

  navigateTo('detail');
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
  const rewindBtn = document.getElementById('playerRewind');
  const forwardBtn = document.getElementById('playerForward');
  const closeBtn = document.getElementById('playerClose');
  const volumeSlider = document.getElementById('playerVolume');
  const volumeBtn = document.getElementById('playerVolumeBtn');
  const noteBtn = document.getElementById('playerNoteBtn');
  const progressBar = document.querySelector('.player-progress-bar');

  playPauseBtn.addEventListener('click', togglePlayPause);
  rewindBtn.addEventListener('click', () => { audioPlayer.currentTime -= 10; });
  forwardBtn.addEventListener('click', () => { audioPlayer.currentTime += 10; });

  closeBtn.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.src = '';
    document.getElementById('playerBar').style.display = 'none';
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

  progressBar.addEventListener('click', (e) => {
    if (audioPlayer.duration) {
      const rect = progressBar.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      audioPlayer.currentTime = pos * audioPlayer.duration;
    }
  });

  audioPlayer.addEventListener('timeupdate', updatePlayerProgress);
  audioPlayer.addEventListener('ended', playNextEpisode);
  audioPlayer.addEventListener('loadedmetadata', () => {
    document.getElementById('playerDuration').textContent = formatTime(audioPlayer.duration);
  });
}

function playPodcast(podcastId) {
  playEpisode(podcastId, 0);
}

function playEpisode(podcastId, episodeIndex) {
  const podcast = PODCAST_DATA.find(p => p.id === podcastId);
  if (!podcast) return;

  currentPodcast = podcast;
  currentPodcastId = podcastId;
  currentEpisodeIndex = episodeIndex;
  const episode = podcast.episodes[episodeIndex];

  document.getElementById('playerCover').src = podcast.cover;
  document.getElementById('playerTitle').textContent = episode.title;
  document.getElementById('playerPodcast').textContent = podcast.title;
  document.getElementById('playerBar').style.display = 'block';
  document.getElementById('playerCurrentTime').textContent = '00:00';
  document.getElementById('playerDuration').textContent = episode.duration;

  const playPauseBtn = document.getElementById('playerPlayPause');
  playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';

  showToast(`🎧 正在播放: ${episode.title}`);

  addToHistory(podcast, episodeIndex);

  if (currentPage === 'detail') {
    const episodeItems = document.querySelectorAll('.episode-item');
    episodeItems.forEach((item, idx) => {
      item.classList.toggle('playing', idx === episodeIndex);
    });
  }

  if (episode.audio_url) {
    audioPlayer.src = episode.audio_url;
    audioPlayer.load();
    audioPlayer.play();
  } else {
    simulatePlayback(episode.duration);
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

  totalSeconds = Math.min(totalSeconds, 120);
  simulatedTime = 0;
  audioPlayer.duration = totalSeconds;

  const playPauseBtn = document.getElementById('playerPlayPause');
  playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';

  playbackInterval = setInterval(() => {
    simulatedTime++;
    if (simulatedTime >= totalSeconds) {
      clearInterval(playbackInterval);
      playNextEpisode();
      return;
    }
    document.getElementById('playerCurrentTime').textContent = formatTime(simulatedTime);
    document.getElementById('playerProgress').style.width = (simulatedTime / totalSeconds * 100) + '%';
    audioPlayer.currentTime = simulatedTime;
  }, 1000);
}

function togglePlayPause() {
  const playPauseBtn = document.getElementById('playerPlayPause');
  if (playPauseBtn.innerHTML.includes('fa-play')) {
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    if (!playbackInterval && audioPlayer.src) {
      audioPlayer.play();
    }
  } else {
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    } else if (audioPlayer.src) {
      audioPlayer.pause();
    }
  }
}

function playNextEpisode() {
  if (playbackInterval) clearInterval(playbackInterval);
  playbackInterval = null;

  if (currentPodcast && currentEpisodeIndex < currentPodcast.episodes.length - 1) {
    playEpisode(currentPodcast.id, currentEpisodeIndex + 1);
  } else {
    showToast('播放完毕');
    document.getElementById('playerPlayPause').innerHTML = '<i class="fas fa-play"></i>';
  }
}

function updatePlayerProgress() {
  if (audioPlayer.duration) {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    document.getElementById('playerProgress').style.width = progress + '%';
    document.getElementById('playerCurrentTime').textContent = formatTime(audioPlayer.currentTime);
  }
}

function updateVolumeIcon() {
  const btn = document.getElementById('playerVolumeBtn');
  const vol = audioPlayer.muted ? 0 : audioPlayer.volume;
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

function toggleFavorite(podcastId) {
  if (!isLoggedIn()) {
    showAuthModal('login');
    return;
  }
  if (favorites.has(podcastId)) {
    favorites.delete(podcastId);
    showToast('已取消关注');
  } else {
    favorites.add(podcastId);
    showToast('已关注');
  }
  saveFavoritesToStorage();
  updateFavoriteBtn();
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
  const favPodcasts = PODCAST_DATA.filter(p => favorites.has(p.id));
  renderPodcastGrid('followGrid', favPodcasts);
}

// ===== Notes =====
function renderNotesPage() {
  const list = document.getElementById('notesList');
  const empty = document.getElementById('notesEmpty');

  const stored = localStorage.getItem('userNotes');
  userNotes = stored ? JSON.parse(stored) : [];

  if (userNotes.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = userNotes.map((note, idx) => `
    <div class="note-card">
      <div class="note-header">
        <span class="note-podcast">${note.podcastTitle}</span>
        <span class="note-episode">${note.episodeTitle}</span>
        <span class="note-time">${note.timestamp}</span>
      </div>
      <div class="note-content">${note.content}</div>
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
  const episode = currentPodcast.episodes[currentEpisodeIndex];
  document.getElementById('noteEpisodeInfo').textContent =
    `${currentPodcast.title} - ${episode.title}`;
  document.getElementById('noteContent').focus();
}

function deleteNote(index) {
  userNotes.splice(index, 1);
  localStorage.setItem('userNotes', JSON.stringify(userNotes));
  renderNotesPage();
  showToast('笔记已删除');
}

// ===== Playback History =====
function addToHistory(podcast, episodeIndex) {
  const stored = localStorage.getItem('playbackHistory');
  playbackHistory = stored ? JSON.parse(stored) : [];

  const episode = podcast.episodes[episodeIndex];
  const entry = {
    podcastId: podcast.id,
    podcastTitle: podcast.title,
    podcastCover: podcast.cover,
    episodeTitle: episode.title,
    episodeIndex: episodeIndex,
    duration: episode.duration,
    timestamp: new Date().toISOString(),
  };

  playbackHistory = playbackHistory.filter(h =>
    !(h.podcastId === podcast.id && h.episodeIndex === episodeIndex)
  );

  playbackHistory.unshift(entry);
  playbackHistory = playbackHistory.slice(0, 50);

  localStorage.setItem('playbackHistory', JSON.stringify(playbackHistory));
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

function handleNoteSubmit() {
  const content = document.getElementById('noteContent').value.trim();
  if (!content) {
    showToast('请输入笔记内容');
    return;
  }

  const episode = currentPodcast.episodes[currentEpisodeIndex];
  const note = {
    podcastId: currentPodcast.id,
    podcastTitle: currentPodcast.title,
    episodeTitle: episode.title,
    content: content,
    timestamp: new Date().toLocaleString('zh-CN'),
  };

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
