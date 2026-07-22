(function () {
  let lastData = null;
  let sendTimeout = null;
  let videoListenersAttached = false;

  function getData() {
    try {
      const video = document.querySelector('video');
      if (!video) return null;

      const duration = video.duration || 0;
      const currentTime = video.currentTime || 0;
      const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
                    document.title.replace(' - YouTube', '').trim();
      const channel = document.querySelector('#channel-name a')?.textContent?.trim() ||
                     document.querySelector('ytd-channel-name yt-formatted-string a')?.textContent?.trim() || '';

      const videoId = new URL(window.location.href).searchParams.get('v');
      const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

      let views = '', uploadDate = '';

      try {
        const pr = window.ytInitialPlayerResponse;
        if (pr) {
          const vd = pr?.videoDetails;
          if (vd && vd.viewCount) views = formatCount(vd.viewCount);

          const mf = pr?.microformat?.playerMicroformatRenderer;
          if (mf) {
            uploadDate = mf.uploadDate || mf.publishDate || mf.liveBroadcastDetails?.startTimestamp || '';
          }
        }
      } catch (e) {}

      if (!views) {
        const viewEl = document.querySelector('#info span.view-count') ||
                      document.querySelector('ytd-video-primary-info-renderer #info-text span') ||
                      document.querySelector('#count .ytd-video-primary-info-renderer');
        if (viewEl) views = viewEl.textContent.trim();
      }

      if (!uploadDate) {
        const info = document.querySelector('#info-strings yt-formatted-string, span.date.ytd-video-primary-info-renderer');
        if (info) uploadDate = info.textContent.trim();
      }

      return {
        title,
        channel,
        views,
        uploadDate,
        thumbnail,
        videoId,
        duration,
        currentTime,
        progress: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
        isPlaying: !video.paused
      };
    } catch {
      return null;
    }
  }

  function formatCount(n) {
    n = Number(n);
    if (!n) return '';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
  }

  function sendData() {
    const data = getData();
    if (!data) return;

    const dataStr = JSON.stringify(data);
    if (dataStr === lastData) return;
    lastData = dataStr;

    chrome.runtime.sendMessage({
      type: 'VIDEO_DATA',
      payload: data
    }).catch(() => {});
  }

  function attachVideoListeners() {
    if (videoListenersAttached) return;
    const video = document.querySelector('video');
    if (!video) return;
    videoListenersAttached = true;

    video.addEventListener('timeupdate', () => {
      if (sendTimeout) clearTimeout(sendTimeout);
      sendTimeout = setTimeout(sendData, 1000);
    });
    video.addEventListener('play', sendData);
    video.addEventListener('pause', sendData);
    video.addEventListener('ended', sendData);
  }

  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video) {
      attachVideoListeners();
      setTimeout(sendData, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  attachVideoListeners();
  setInterval(sendData, 3000);

  setInterval(() => {
    const video = document.querySelector('video');
    if (video && !video.paused) sendData();
  }, 2000);

  window.addEventListener('yt-navigate-finish', () => {
    videoListenersAttached = false;
    setTimeout(() => {
      attachVideoListeners();
      sendData();
    }, 1000);
  });

  setTimeout(sendData, 2000);
})();
