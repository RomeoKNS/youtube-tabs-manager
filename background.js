const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?youtube\.com\/watch/;
const CHECK_INTERVAL = 3000;

chrome.runtime.onInstalled.addListener(() => { scanExistingTabs(true); updateBadge(); });
chrome.runtime.onStartup.addListener(() => { scanExistingTabs(false); updateBadge(); });
chrome.tabs.onCreated.addListener((tab) => { handleNewTab(tab); updateBadge(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { handleTabUpdate(tabId, changeInfo, tab); });
chrome.tabs.onRemoved.addListener((tabId) => { handleTabRemoved(tabId); updateBadge(); });
chrome.runtime.onMessage.addListener(handleMessage);

chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });

async function updateBadge() {
  try {
    const alive = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://youtube.com/*'] });
    const count = alive.length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch (e) {}
}

async function handleNewTab(tab) {
  if (tab.url && YOUTUBE_PATTERN.test(tab.url)) {
    await addTab(tab);
  }
}

async function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.url && YOUTUBE_PATTERN.test(changeInfo.url)) {
    await addTab(tab);
  } else if (changeInfo.url) {
    const data = await chrome.storage.local.get(['tabs', 'history']);
    const tabs = data.tabs || {};
    if (tabs[tabId] && tabs[tabId].videoId) {
      await saveToHistory(tabs[tabId], data.history || []);
      delete tabs[tabId];
      await chrome.storage.local.set({ tabs });
    }
  }
  if (changeInfo.status === 'complete' && tab.url && YOUTUBE_PATTERN.test(tab.url)) {
    await addTab(tab);
  }
  updateBadge();
}

async function handleTabRemoved(tabId) {
  const data = await chrome.storage.local.get(['tabs', 'history', 'pinned']);
  const tabs = data.tabs || {};
  const pinned = data.pinned || {};
  if (tabs[tabId]) {
    await saveToHistory(tabs[tabId], data.history || []);
    delete tabs[tabId];
  }
  if (pinned[tabId]) delete pinned[tabId];
  await chrome.storage.local.set({ tabs, pinned });
}

async function handleMessage(msg, sender) {
  if (msg.type === 'VIDEO_DATA' && sender.tab) {
    const tabId = sender.tab.id;
    const data = await chrome.storage.local.get('tabs');
    const tabs = data.tabs || {};

    const existing = tabs[tabId] || {};
    const merged = { ...existing };
    for (const [k, v] of Object.entries(msg.payload)) {
      if (v === '' || v === null || v === undefined) continue;
      if (k === 'progress' && v === 0 && existing.currentTime > 0) continue;
      if (k === 'duration' && (!v || v <= 0) && existing.duration > 0) continue;
      if (k === 'currentTime' && (!v || v <= 0) && existing.currentTime > 0) continue;
      merged[k] = v;
    }
    tabs[tabId] = {
      ...merged,
      tabId,
      url: sender.tab.url,
      discarded: false,
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({ tabs });
  }

  if (msg.type === 'GET_ALL_TABS') {
    const data = await chrome.storage.local.get(['tabs', 'pinned']);
    const tabs = data.tabs || {};
    const pinned = data.pinned || {};

    const aliveTabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://youtube.com/*'] });
    const aliveIds = new Set(aliveTabs.map(t => t.id));

    const tabIds = Object.keys(tabs).map(Number);
    for (const id of tabIds) {
      if (!aliveIds.has(id)) {
        delete tabs[id];
      }
    }

    // Drop pins for tabs that no longer exist
    let pinsDirty = false;
    for (const id of Object.keys(pinned)) {
      if (!aliveIds.has(Number(id))) {
        delete pinned[id];
        pinsDirty = true;
      }
    }

    for (const tab of aliveTabs) {
      if (tabs[tab.id]) tabs[tab.id].discarded = !!tab.discarded;
      if (tab.discarded) continue;
      if (!tabs[tab.id] || !tabs[tab.id].channel) {
        await addTab(tab);
        const fresh = await chrome.storage.local.get('tabs');
        if (fresh.tabs && fresh.tabs[tab.id]) {
          tabs[tab.id] = fresh.tabs[tab.id];
        }
        if (tabs[tab.id] && !tabs[tab.id].channel) {
          tabs[tab.id].discarded = true;
        }
      } else {
        let scraped = false;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              if (document.visibilityState === 'hidden') return null;
              const video = document.querySelector('video');
              if (!video) return null;
              const duration = video.duration || 0;
              const currentTime = video.currentTime || 0;
              return {
                duration,
                currentTime,
                progress: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
                isPlaying: !video.paused
              };
            }
          });
          if (results && results[0] && results[0].result) {
            tabs[tab.id] = {
              ...tabs[tab.id],
              ...results[0].result,
              discarded: false,
              lastUpdated: Date.now()
            };
            scraped = true;
          }
        } catch (e) {}
        if (!scraped) tabs[tab.id].discarded = true;
      }
    }

    await chrome.storage.local.set({ tabs });
    if (pinsDirty) await chrome.storage.local.set({ pinned });
    updateBadge();
    return { tabs, pinned };
  }

  if (msg.type === 'PIN_TAB') {
    const data = await chrome.storage.local.get('pinned');
    const pinned = data.pinned || {};
    pinned[msg.tabId] = true;
    await chrome.storage.local.set({ pinned });
    return { pinned };
  }

  if (msg.type === 'UNPIN_TAB') {
    const data = await chrome.storage.local.get('pinned');
    const pinned = data.pinned || {};
    delete pinned[msg.tabId];
    await chrome.storage.local.set({ pinned });
    return { pinned };
  }

  if (msg.type === 'CLOSE_TAB') {
    try { await chrome.tabs.remove(msg.tabId); } catch (e) {}
  }

  if (msg.type === 'SWITCH_TAB') {
    try {
      await chrome.tabs.update(msg.tabId, { active: true });
      await chrome.windows.update(
        (await chrome.tabs.get(msg.tabId)).windowId,
        { focused: true }
      );
    } catch (e) {}
  }

  if (msg.type === 'CLOSE_ALL_YOUTUBE') {
    const data = await chrome.storage.local.get('tabs');
    const tabs = data.tabs || {};
    const tabIds = Object.keys(tabs).map(Number);
    for (const id of tabIds) {
      try { await chrome.tabs.remove(id); } catch (e) {}
    }
    await chrome.storage.local.set({ tabs: {} });
  }

  if (msg.type === 'GET_HISTORY') {
    const data = await chrome.storage.local.get('history');
    return { history: data.history || [] };
  }

  if (msg.type === 'SAVE_TO_HISTORY') {
    const data = await chrome.storage.local.get('history');
    await saveToHistory(msg.payload, data.history || []);
  }

  if (msg.type === 'CLEAR_HISTORY') {
    await chrome.storage.local.set({ history: [] });
    return { history: [] };
  }

  if (msg.type === 'REMOVE_FROM_HISTORY') {
    const data = await chrome.storage.local.get('history');
    const history = (data.history || []).filter(h => h.videoId !== msg.videoId);
    await chrome.storage.local.set({ history });
    return { history };
  }
}

async function saveToHistory(payload, history) {
  if (!payload || !payload.videoId) return;
  const exists = history.findIndex(h => h.videoId === payload.videoId);
  if (exists >= 0) {
    const merged = { ...history[exists], ...payload, lastSeen: Date.now() };
    history.splice(exists, 1);
    history.unshift(merged);
  } else {
    history.unshift({ ...payload, lastSeen: Date.now() });
  }
  if (history.length > 10) history.length = 10;
  await chrome.storage.local.set({ history });
}

async function addTab(tab, retroactive = false) {
  const data = await chrome.storage.local.get('tabs');
  const tabs = data.tabs || {};

  const videoId = extractVideoId(tab.url);
  if (!videoId) return;

  if (!tabs[tab.id]) {
    tabs[tab.id] = {
      tabId: tab.id,
      videoId,
      title: tab.title || 'YouTube',
      url: tab.url,
      favicon: tab.favIconUrl || '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      openedAt: retroactive ? null : Date.now(),
      lastUpdated: Date.now(),
      progress: 0
    };
  } else if (tabs[tab.id].videoId && tabs[tab.id].videoId !== videoId) {
    await saveToHistory(tabs[tab.id], (await chrome.storage.local.get('history')).history || []);
    const fresh = await chrome.storage.local.get('tabs');
    const freshTabs = fresh.tabs || {};
    freshTabs[tab.id] = {
      tabId: tab.id,
      videoId,
      title: tab.title || 'YouTube',
      url: tab.url,
      favicon: tab.favIconUrl || '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      openedAt: Date.now(),
      lastUpdated: Date.now(),
      progress: 0
    };
    await chrome.storage.local.set({ tabs: freshTabs });
    return;
  } else {
    tabs[tab.id].title = tab.title || tabs[tab.id].title;
    tabs[tab.id].url = tab.url || tabs[tab.id].url;
    tabs[tab.id].favicon = tab.favIconUrl || tabs[tab.id].favicon;
  }
  await chrome.storage.local.set({ tabs });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const player = document.querySelector('#movie_player');
        if (!player) return null;
        const video = document.querySelector('video');
        const duration = video ? video.duration : 0;
        const currentTime = video ? video.currentTime : 0;
        const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
                      document.title.replace(' - YouTube', '').trim();
        const channel = document.querySelector('#channel-name a')?.textContent?.trim() || '';
        let views = '';
        try {
          const pr = window.ytInitialPlayerResponse;
          const vd = pr?.videoDetails;
          if (vd && vd.viewCount) views = Number(vd.viewCount).toLocaleString('lt-LT');
        } catch (e) {}
        if (!views) {
          views = document.querySelector('#info span.view-count')?.textContent?.trim() ||
                 document.querySelector('ytd-video-primary-info-renderer #info-text span')?.textContent?.trim() || '';
        }
        const thumbnail = `https://i.ytimg.com/vi/${new URL(window.location.href).searchParams.get('v')}/hqdefault.jpg`;
        let uploadDate = '';
        try {
          const pr = window.ytInitialPlayerResponse;
          const mf = pr?.microformat?.playerMicroformatRenderer;
          if (mf) uploadDate = mf.uploadDate || mf.publishDate || '';
        } catch (e) {}
        if (!uploadDate) {
          const info = document.querySelector('#info-strings yt-formatted-string, span.date.ytd-video-primary-info-renderer');
          if (info) uploadDate = info.textContent.trim();
        }
        return {
          title,
          channel,
          views,
          thumbnail,
          uploadDate,
          duration,
          currentTime,
          progress: duration > 0 ? Math.round((currentTime / duration) * 100) : 0
        };
      }
    });

    if (results && results[0] && results[0].result) {
      tabs[tab.id] = {
        ...tabs[tab.id],
        ...results[0].result,
        lastUpdated: Date.now()
      };
      await chrome.storage.local.set({ tabs });
    }
  } catch (e) {}
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v');
  } catch { return null; }
}

async function scanExistingTabs(retroactive = true) {
  const data = await chrome.storage.local.get('tabs');
  const storedTabs = data.tabs || {};

  for (const id of Object.keys(storedTabs)) {
    if (storedTabs[id]) storedTabs[id].isPlaying = false;
  }

  const existingTabs = await chrome.tabs.query({
    url: ['https://www.youtube.com/*', 'https://youtube.com/*']
  });
  const aliveIds = new Set(existingTabs.map(t => t.id));

  const videoIdMap = {};
  for (const id of Object.keys(storedTabs)) {
    const t = storedTabs[id];
    if (t && t.videoId && !aliveIds.has(Number(id))) {
      videoIdMap[t.videoId] = t;
    }
  }

  for (const id of Object.keys(storedTabs)) {
    if (!aliveIds.has(Number(id))) delete storedTabs[id];
  }
  await chrome.storage.local.set({ tabs: storedTabs });

  for (const tab of existingTabs) {
    const videoId = extractVideoId(tab.url);
    if (videoId && videoIdMap[videoId] && !storedTabs[tab.id]) {
      storedTabs[tab.id] = {
        ...videoIdMap[videoId],
        tabId: tab.id,
        url: tab.url,
        favicon: tab.favIconUrl || videoIdMap[videoId].favicon || '',
        isPlaying: false,
        discarded: !!tab.discarded,
        lastUpdated: Date.now()
      };
      await chrome.storage.local.set({ tabs: storedTabs });
    }
    await addTab(tab, retroactive || tab.discarded);
  }
}
