# YouTube Tabs Manager — Chrome Extension

## Overview
Chrome Manifest V3 extension that aggregates all open YouTube video tabs into a single popup view with video metadata, progress tracking, and quick navigation.

**Language:** Lithuanian UI  
**Version:** 1.0.0  
**Platform:** Chromium-based browsers (Chrome, Vivaldi, Edge, etc.)

---

## File Structure

```
youtube-tabs-manager/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker — tab tracking, storage, message handling
├── content.js             # Content script — scrapes video data from YouTube pages
├── popup.html             # Popup UI structure
├── popup.js               # Popup logic — rendering, sorting, actions
├── popup.css              # Popup styles — dark theme, YouTube-inspired
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Architecture

### Data Flow

```
YouTube Page
    │
    ▼
content.js (scrapes DOM + ytInitialPlayerResponse)
    │
    │  chrome.runtime.sendMessage({ type: 'VIDEO_DATA', payload })
    ▼
background.js (service worker)
    │
    │  chrome.storage.local.set({ tabs })
    ▼
chrome.storage.local
    │
    │  chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' })
    ▼
popup.js (renders UI)
```

### Message Types (background.js)

| Type | Direction | Description |
|------|-----------|-------------|
| `VIDEO_DATA` | content → background | Sends scraped video metadata |
| `GET_ALL_TABS` | popup → background | Returns all tracked tabs from storage |
| `SWITCH_TAB` | popup → background | Activates a specific tab |
| `CLOSE_TAB` | popup → background | Closes a specific tab |
| `CLOSE_ALL_YOUTUBE` | popup → background | Closes all tracked YouTube tabs |
| `GET_HISTORY` | popup → background | Returns video history (up to 10 entries) |
| `SAVE_TO_HISTORY` | popup → background | Manually saves video to history (auto-saved on tab close/nav away/video change) |
| `REMOVE_FROM_HISTORY` | popup → background | Removes a single video from history by `videoId` |
| `CLEAR_HISTORY` | popup → background | Clears entire history |

---

## Key Data Points (per tab)

```javascript
{
  tabId: Number,           // Chrome tab ID
  videoId: String,         // YouTube video ID (from ?v= param)
  title: String,           // Video title
  channel: String,         // Channel name
  url: String,             // Full YouTube URL
  thumbnail: String,       // hqdefault.jpg URL
  duration: Number,        // Video duration in seconds
  currentTime: Number,     // Current playback position in seconds
  progress: Number,        // 0-100 percentage
  views: String,           // View count (formatted: "1.2K", "33,522")
  uploadDate: String,      // Upload date (YYYY-MM-DD format)
  openedAt: Number|null,   // Timestamp when tab was opened (null for pre-extension tabs)
  lastUpdated: Number,     // Timestamp of last data update
  isPlaying: Boolean,      // Whether video is currently playing (content.js only)
  favicon: String          // Tab favicon URL
}
```

---

## Data Scraping Strategy

### Sources (in priority order)

1. **`window.ytInitialPlayerResponse`** — YouTube's embedded JSON with structured video data
   - `videoDetails.viewCount` → views (numeric)
   - `microformat.playerMicroformatRenderer.uploadDate` → upload date
   - `microformat.playerMicroformatRenderer.publishDate` → fallback upload date

2. **DOM selectors** — Fallback when JSON data unavailable
   - Views: `#info span.view-count`, `ytd-video-primary-info-renderer #info-text span`
   - Upload date: `#info-strings yt-formatted-string`, `span.date.ytd-video-primary-info-renderer`

3. **`window.ytInitialData`** — Used for data not in player response (currently unused)

### Notes
- YouTube uses custom web components (shadow DOM) — selectors may break after YouTube updates
- `ytInitialPlayerResponse` is the most stable source
- Content script runs at `document_idle` — some elements may load later (SPA navigation)
- `yt-navigate-finish` event is used to detect YouTube SPA page changes

---

## Popup Features

### Display per card
- **Thumbnail** — 140×78px with `object-fit: cover`, progress bar overlay
- **Title** — max 2 lines with ellipsis
- **Channel name**
- **Stats row** — `uploadDate | duration | views` separated by `|` (via CSS `::before`)
- **"Žiūrima nuo..."** — relative time since tab opened (hidden for pre-extension tabs)
- **Playing indicator** — red left border when video is playing
- **Close button** — appears on hover

### Sorting options
- Naujausi viršuje (recent first — by `openedAt`)
- Seniausi viršuje (oldest first)
- Progresas (by watch progress %)
- Pavadinimas (alphabetical)

### Header actions
- ↻ Refresh — re-fetches tabs from background
- ✕ Close All — closes all tracked YouTube tabs
- ↕ Sort — toggles sort options panel

---

## Important Implementation Details

### CSP Compliance
- **NO inline event handlers** (`onclick`, `onerror`, etc.) — violates Manifest V3 CSP
- All event listeners must use `addEventListener` after DOM insertion
- Image error handling: attach `error` listener in `renderTabs()` after `innerHTML`

### Extension Context Invalidation
- Popup auto-reloads when extension is reloaded/updated (`location.reload()`)
- All `chrome.runtime.sendMessage` calls wrapped in try-catch

### Retroactive Tab Scanning
- On install/startup, `scanExistingTabs()` finds existing YouTube tabs
- These get `openedAt: null` (can't know actual open time)
- Popup hides "Žiūrima nuo" when `openedAt` is null

### Tab Lifecycle
- `addTab(tab, retroactive=false)` — creates or updates tab in storage
- When `videoId` changes on an existing tab, the old video is saved to history and a fresh entry is created
- Script execution via `chrome.scripting.executeScript` fetches live data
- Dead tabs cleaned up on `GET_ALL_TABS` request

### History

The extension automatically saves videos to history (up to 10 entries) when:

- A YouTube tab is closed (`handleTabRemoved`)
- A tab navigates away from YouTube to a non-YouTube URL (`handleTabUpdate`)
- A tab navigates from one YouTube video to another with a different `videoId` (`addTab`)

History entries store the same fields as tracked tabs plus `lastSeen` (timestamp of when it was saved). If a video already exists in history, it is updated and moved to the front.

The popup provides a toggle (🕘 button) between the active tabs view and the history view. In the history view, each card can be clicked to reopen the video in a new tab, removed individually via the ✕ button, or all at once via the "Išvalyti" (Clear) button.

`saveToHistory(payload, history)` is the central helper — it handles deduplication, updates `lastSeen`, and enforces the 10-entry limit.

---

## YouTube Data Known Limitations

- **Like count** — not reliably available (hidden behind A/B tests, requires login)
- **Comment count** — requires scrolling to load, not in initial page data
- **Upload date** — may be empty for some video types (livestreams, shorts)
- **View count** — sometimes shows as "No views" initially

---

## Installation (Development)

1. Open `vivaldi://extensions/` or `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `youtube-tabs-manager/` directory

### After code changes
- Click refresh icon on the extension card
- Close and reopen the popup
- For content script changes: reload YouTube tabs

---

## Future Ideas
- Keyboard shortcuts
- Drag-to-reorder tabs
- Group tabs by channel
- Pin important videos
