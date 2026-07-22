const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?youtube\.com\/watch/;
const CHECK_INTERVAL = 3000;

chrome.runtime.onInstalled.addListener(scanExistingTabs);
chrome.runtime.onStartup.addListener(scanExistingTabs);
chrome.tabs.onCreated.addListener(handleNewTab);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.runtime.onMessage.addListener(handleMessage);

async function handleNewTab(tab) {
  if (tab.url && YOUTUBE_PATTERN.test(tab.url)) {
    await addTab(tab);
  }
}

async function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.url && YOUTUBE_PATTERN.test(changeInfo.url)) {
    await addTab(tab);
  }
  if (changeInfo.status === 'complete' && tab.url && YOUTUBE_PATTERN.test(tab.url)) {
    await addTab(tab);
  }
}

async function handleTabRemoved(tabId) {
  const data = await chrome.storage.local.get('tabs');
  const tabs = data.tabs || {};
  if (tabs[tabId]) {
    delete tabs[tabId];
    await chrome.storage.local.set({ tabs });
  }
}

async function handleMessage(msg, sender) {
  if (msg.type === 'VIDEO_DATA' && sender.tab) {
    const tabId = sender.tab.id;
    const data = await chrome.storage.local.get('tabs');
    const tabs = data.tabs || {};

    const existing = tabs[tabId] || {};
    tabs[tabId] = {
      ...existing,
      ...msg.payload,
      tabId,
      url: sender.tab.url,
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({ tabs });
  }

  if (msg.type === 'GET_ALL_TABS') {
    const data = await chrome.storage.local.get('tabs');
    const tabs = data.tabs || {};

    const aliveTabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://youtube.com/*'] });
    const aliveIds = new Set(aliveTabs.map(t => t.id));

    const tabIds = Object.keys(tabs).map(Number);
    for (const id of tabIds) {
      if (!aliveIds.has(id)) {
        delete tabs[id];
      }
    }

    for (const tab of aliveTabs) {
      if (!tabs[tab.id]) {
        await addTab(tab);
      } else {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
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
              lastUpdated: Date.now()
            };
          }
        } catch (e) {}
      }
    }

    await chrome.storage.local.set({ tabs });
    return { tabs };
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
    const history = data.history || [];
    const exists = history.findIndex(h => h.videoId === msg.payload.videoId);
    if (exists >= 0) {
      history[exists] = { ...history[exists], ...msg.payload, lastSeen: Date.now() };
    } else {
      history.unshift({ ...msg.payload, lastSeen: Date.now() });
    }
    if (history.length > 200) history.length = 200;
    await chrome.storage.local.set({ history });
  }
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
      openedAt: retroactive ? null : Date.now(),
      lastUpdated: Date.now(),
      progress: 0
    };
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

async function scanExistingTabs() {
  const existingTabs = await chrome.tabs.query({
    url: ['https://www.youtube.com/*', 'https://youtube.com/*']
  });
  for (const tab of existingTabs) {
    await addTab(tab, true);
  }
}
