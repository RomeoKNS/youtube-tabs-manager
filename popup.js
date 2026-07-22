let allTabs = [];
let currentSort = 'recent';

document.addEventListener('DOMContentLoaded', () => {
  loadTabs();
  document.getElementById('btn-refresh').addEventListener('click', loadTabs);
  document.getElementById('btn-close-all').addEventListener('click', closeAllTabs);
  document.getElementById('btn-sort').addEventListener('click', toggleSortOptions);

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sort-options').classList.add('hidden');
      renderTabs();
    });
  });
});

async function loadTabs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' });
    allTabs = Object.values(response.tabs || {});
    renderTabs();
  } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      location.reload();
    } else {
      console.error('Failed to load tabs:', e);
    }
  }
}

function renderTabs() {
  const container = document.getElementById('tabs-list');
  const emptyState = document.getElementById('empty-state');
  const badge = document.getElementById('tab-count');

  badge.textContent = allTabs.length;

  if (allTabs.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  const sorted = sortTabs([...allTabs]);

  container.innerHTML = sorted.map(tab => `
    <div class="tab-card${tab.isPlaying ? ' playing' : ''}" data-tab-id="${tab.tabId}">
      <div class="thumbnail-wrap">
        <img src="${tab.thumbnail || ''}" alt="">
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${tab.progress || 0}%"></div>
        </div>
        ${tab.progress ? `<span class="progress-text">${tab.progress}%</span>` : ''}
      </div>
      <div class="tab-info">
        <div class="tab-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || 'Nepažįstamas')}</div>
        <div class="tab-meta">
          <span class="tab-channel">${escapeHtml(tab.channel || '')}</span>
          <div class="tab-stats">
            ${tab.uploadDate ? `<span class="tab-stat">${formatUploadDate(tab.uploadDate)}</span>` : ''}
            ${tab.duration ? `<span class="tab-stat">${formatDuration(tab.duration)}</span>` : ''}
            ${tab.views ? `<span class="tab-stat">${tab.views}</span>` : ''}
          </div>
          ${tab.openedAt ? `<span class="tab-since">Žiūrima nuo ${formatTime(tab.openedAt)}</span>` : ''}
        </div>
      </div>
      <button class="tab-close" title="Uždaryti">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.tab-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      const tabId = Number(card.dataset.tabId);
      try {
        chrome.runtime.sendMessage({ type: 'SWITCH_TAB', tabId });
      } catch (err) {
        if (err.message?.includes('Extension context invalidated')) location.reload();
      }
    });

    const img = card.querySelector('.thumbnail-wrap img');
    if (img) {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    }
  });

  container.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = Number(btn.closest('.tab-card').dataset.tabId);
      try {
        chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId });
      } catch (err) {
        if (err.message?.includes('Extension context invalidated')) location.reload();
      }
      allTabs = allTabs.filter(t => t.tabId !== tabId);
      renderTabs();
    });
  });
}

function sortTabs(tabs) {
  switch (currentSort) {
    case 'recent': return tabs.sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
    case 'oldest': return tabs.sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0));
    case 'progress': return tabs.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    case 'title': return tabs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    default: return tabs;
  }
}

function toggleSortOptions() {
  document.getElementById('sort-options').classList.toggle('hidden');
}

async function closeAllTabs() {
  try {
    await chrome.runtime.sendMessage({ type: 'CLOSE_ALL_YOUTUBE' });
  } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      location.reload();
      return;
    }
  }
  allTabs = [];
  renderTabs();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}val`;
  if (hours > 0) return `${hours} val ${mins % 60} min`;
  if (mins > 0) return `${mins} min`;
  return `ką tik`;
}

function formatDuration(secs) {
  if (!secs || secs <= 0) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatUploadDate(dateStr) {
  if (!dateStr) return '';
  const months = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
                  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const year = d.getFullYear();
  const now = new Date();
  if (year === now.getFullYear()) {
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
  return `${d.getDate()} ${months[d.getMonth()]} ${year}`;
}
