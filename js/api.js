// ===== ListenBook API Client =====

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

function resolveMediaUrl(value) {
  if (!value) return 'https://picsum.photos/seed/default/200/200';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/media/')) return `${MEDIA_BASE}${value}`;
  if (value.startsWith('/')) return `${MEDIA_BASE}${value}`;
  return `${MEDIA_BASE}/media/${value}`;
}

// API 请求封装
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('access_token');
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    headers: defaultHeaders,
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (response.status === 401) {
      // Token 过期，尝试刷新
      const refreshResult = await refreshAccessToken();
      if (refreshResult) {
        config.headers['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`;
        const retryResponse = await fetch(url, config);
        return await retryResponse.json();
      } else {
        // 刷新失败，清除登录状态
        logout();
        return null;
      }
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw error;
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// 刷新 Token
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('access_token', data.access);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ===== Auth API =====
async function register(username, email, password) {
  const data = await apiRequest('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  if (data && data.tokens) {
    localStorage.setItem('access_token', data.tokens.access);
    localStorage.setItem('refresh_token', data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(data.user));
  }
  return data;
}

async function login(username, password) {
  const data = await apiRequest('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data && data.tokens) {
    localStorage.setItem('access_token', data.tokens.access);
    localStorage.setItem('refresh_token', data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(data.user));
  }
  return data;
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  updateUserUI();
}

function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function isLoggedIn() {
  return !!localStorage.getItem('access_token');
}

// ===== Podcasts API =====
async function getPodcasts(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = `/podcasts/${queryString ? '?' + queryString : ''}`;
  return await apiRequest(endpoint);
}

async function getPodcast(id) {
  return await apiRequest(`/podcasts/${id}/`);
}

// ===== Episodes API =====
async function getEpisodes(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = `/episodes/${queryString ? '?' + queryString : ''}`;
  return await apiRequest(endpoint);
}

async function getEpisode(id) {
  return await apiRequest(`/episodes/${id}/`);
}

// ===== Categories API =====
async function getCategories() {
  return await apiRequest('/categories/');
}

// ===== Favorites API =====
async function getFavorites() {
  return await apiRequest('/favorites/');
}

async function addFavorite(podcastId) {
  return await apiRequest('/favorites/', {
    method: 'POST',
    body: JSON.stringify({ podcast: podcastId }),
  });
}

async function removeFavorite(podcastId) {
  return await apiRequest(`/favorites/?podcast=${podcastId}`, {
    method: 'DELETE',
  });
}

// ===== Notes API =====
async function getNotes() {
  return await apiRequest('/notes/');
}

async function createNote(episodeId, content, timestampSeconds) {
  return await apiRequest('/notes/', {
    method: 'POST',
    body: JSON.stringify({ episode: episodeId, content, timestamp_seconds: timestampSeconds }),
  });
}

async function deleteNote(noteId) {
  return await apiRequest(`/notes/${noteId}/`, {
    method: 'DELETE',
  });
}

// ===== Playback History API =====
async function getPlaybackHistory() {
  return await apiRequest('/playback/history/');
}

async function updatePlayback(episodeId, currentTime, duration, isCompleted = false) {
  return await apiRequest('/playback/history/', {
    method: 'POST',
    body: JSON.stringify({ 
      episode: episodeId, 
      current_position: currentTime, 
      duration, 
      is_completed: isCompleted,
    }),
  });
}

// ===== User Stats API =====
async function getUserStats() {
  return await apiRequest('/auth/user/stats/');
}

async function getUserProfile() {
  return await apiRequest('/auth/user/profile/');
}

// ===== Membership API =====
async function getTiers() {
  return await apiRequest('/tiers/');
}

async function getMembershipStatus() {
  return await apiRequest('/membership/status/');
}

async function subscribeMembership(tierSlug, plan = 'monthly', paymentMethod = 'mock_card') {
  return await apiRequest('/membership/subscribe/', {
    method: 'POST',
    body: JSON.stringify({ tier_slug: tierSlug, plan, payment_method: paymentMethod }),
  });
}

async function cancelMembership() {
  return await apiRequest('/membership/cancel/', { method: 'POST' });
}

// ===== Vocabulary API =====
async function getWords(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = `/vocabulary/${queryString ? '?' + queryString : ''}`;
  return await apiRequest(endpoint);
}

async function addWord(payload) {
  return await apiRequest('/vocabulary/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function deleteWord(wordId) {
  return await apiRequest(`/vocabulary/${wordId}/`, { method: 'DELETE' });
}

async function clearWords() {
  return await apiRequest('/vocabulary/clear/', { method: 'DELETE' });
}

// ===== AI Explain API =====
async function explainText(payload) {
  return await apiRequest('/ai/explain/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ===== Shadowing API (multipart) =====
async function recordShadowing(formData) {
  const token = localStorage.getItem('access_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE}/shadowing/record/`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (resp.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`;
      const r2 = await fetch(`${API_BASE}/shadowing/record/`, { method: 'POST', headers, body: formData });
      return await r2.json();
    }
    logout();
    return null;
  }
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) {}
  if (!resp.ok) throw data;
  return data;
}

async function getShadowHistory(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const endpoint = `/shadowing/history/${queryString ? '?' + queryString : ''}`;
  return await apiRequest(endpoint);
}