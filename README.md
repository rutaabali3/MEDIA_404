# MediaGrab 404

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Open in GitHub Pages](https://img.shields.io/badge/Open-GitHub_Pages-222?logo=github)](https://rutaabali3.github.io/MEDIA_404/)

**Paste any post or product link — get its media.** Runs **entirely in your browser**. No server, no extension, no install.

Open it: **[rutaabali3.github.io/MEDIA_404](https://rutaabali3.github.io/MEDIA_404/)**

**Same UI as the extension**: M3 app bar that re-brands to the detected platform (exact logo + brand gradient), Universal / Social apps / Shopping pills, filter chips with counts, media card grid with selection, bottom bar with Select all + Download, settings bottom sheet, snackbar and linear progress — just full-page.

## Use it

### GitHub Pages (client-side)

1. Open [https://rutaabali3.github.io/MEDIA_404/](https://rutaabali3.github.io/MEDIA_404/)
2. Paste a public post or product link
3. Press **Grab**, select items, **Download**

After you merge to `main`, GitHub Pages serves `public/` (the app). Until then, open the `public/` folder on this branch.

### Open the files locally

Any static file server works — there is no Node API to run:

```bash
git clone https://github.com/rutaabali3/MEDIA_404.git
cd MEDIA_404
npx --yes serve public
```

Or open `public/index.html` after cloning (some browsers restrict `file://` fetches; a tiny static server is more reliable).

macOS / Linux: `python3 -m http.server 3000 --directory public`

## How it works

```
you paste a link
        ↓
browser extract.js
        ├─ YouTube covers from the video id (no network)
        ├─ oEmbed / noembed (YouTube, Vimeo, TikTok, SoundCloud…)
        ├─ Reddit JSON API
        ├─ X/Twitter media API (FxTwitter)
        ├─ TikTok / Instagram / Amazon / Daraz / AliExpress page JSON
        └─ generic: og: meta, Twitter cards, JSON-LD, <video>/<audio>
        ↓
if the site blocks CORS → retry through public CORS relays
        ↓
Download: save as a blob in the browser (else open the file)
```

## Supported platforms (35)

**Social:** Facebook, Instagram, Threads, X (Twitter), TikTok, Reddit, YouTube, LinkedIn, Pinterest, Bluesky, Vimeo, Dailymotion, Twitch, Tumblr, Telegram, WhatsApp Web, SoundCloud, Imgur  
**Shopping:** Amazon, eBay, AliExpress, Alibaba, Daraz (pk/bd/lk/np), Temu, SHEIN, Etsy, Walmart, Noon, OLX, Flipkart, Shopify stores, Lazada, Shopee, Taobao, Tmall  
**Everything else:** Universal mode parses any public page (og tags, JSON-LD, media tags).

## Honest limits

- **Public content only** — login-gated posts can't be reached by any web tool (no browser session to ride on).
- **CORS / hotlink** — some CDNs hide media from other origins. Relays help; if a save still fails, the file opens in a new tab.
- **DRM platforms** (Netflix, Spotify, Prime Video) are intentionally not supported.
- **YouTube** returns covers/page media, not full videos (ToS).
- **Security**: the client refuses localhost / private IP ranges / non-http(s) URLs.

## Layout

```
MEDIA_404/
├── public/              client-side app (GitHub Pages)
│   ├── index.html
│   ├── extract.js       browser extraction + CORS relays + blob downloads
│   ├── app.js / ui.js / style.css
│   └── sites.js + logos.js
├── lib/ + server.js     optional Node API (same extract logic, for local proxying)
└── tests/
```

## Tests

```bash
npm test              # extraction engine + SSRF guard
node tests/smoke.js   # frontend UI smoke test
```

## License

[MIT](LICENSE)
