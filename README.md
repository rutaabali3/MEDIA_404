# MediaGrab 404 — Web

**Paste any post or product link — get its media.** The web version of MediaGrab 404: no extension, no install. The server fetches and parses the page for you, finds every image / video / audio / file on it, and streams downloads through a proxy so hotlink-protected CDNs still work.

**Same UI as the extension**: M3 app bar that re-brands to the detected platform (exact logo + brand gradient), Universal / Social apps / Shopping pills, filter chips with counts, media card grid with selection, bottom bar with Select all + Download, settings bottom sheet, snackbar and linear progress — just full-page.

## How it works

```
you → [ /api/extract?url=… ] → server fetches the page (mobile UA)
                                   ├─ oEmbed APIs (YouTube, Vimeo, TikTok, SoundCloud…)
                                   ├─ Reddit JSON API (posts, galleries, videos)
                                   ├─ X/Twitter media API (FxTwitter)
                                   ├─ TikTok embedded state (playAddr / downloadAddr)
                                   ├─ Instagram / Amazon / Daraz / AliExpress page JSON
                                   └─ generic: og: meta, Twitter cards, JSON-LD, <video>/<audio>
        [ /api/download?url=… ] → streams the file with the right referer
                                   (bypasses CORS + hotlink blocks)
```

## Run it

```bash
npm install
npm start          # → http://localhost:3000
```

## API

| Endpoint | What it does |
|---|---|
| `GET /api/extract?url=<url>` | Returns `{ site, title, items: [{url, kind, dim, name, source, thumb}], notes }` |
| `GET /api/download?url=<url>&name=<file>` | Streams the media as an attachment |
| `GET /api/health` | Liveness check |

## Supported platforms (35)

**Social:** Facebook, Instagram, Threads, X (Twitter), TikTok, Reddit, YouTube, LinkedIn, Pinterest, Bluesky, Vimeo, Dailymotion, Twitch, Tumblr, Telegram, WhatsApp Web, SoundCloud, Imgur
**Shopping:** Amazon, eBay, AliExpress, Alibaba, Daraz (pk/bd/lk/np), Temu, SHEIN, Etsy, Walmart, Noon, OLX, Flipkart, Shopify stores, Lazada, Shopee, Taobao, Tmall
**Everything else:** Universal mode parses any public page (og tags, JSON-LD, media tags).

## Honest limits

- **Public content only** — login-gated posts can't be reached by any web tool (no browser session to ride on).
- **DRM platforms** (Netflix, Spotify, Prime Video) are intentionally not supported.
- **YouTube** returns covers/page media, not full videos (ToS).
- **Reddit** JSON works from normal/residential IPs; some datacenter IPs get blocked by Reddit itself.
- **Security**: the fetcher refuses localhost / private IP ranges / non-http(s) URLs (SSRF-safe), caps page size at 12 MB, download size at 800 MB, and rate-limits 60 requests/min per IP.

## Layout

```
mediagrab-app/
├── server.js            Express app (static + API + rate limit)
├── lib/fetch.js         SSRF-safe fetcher (UA, caps, DNS guard)
├── lib/extract.js       extraction engine (oEmbed / APIs / HTML)
├── lib/download.js      download proxy with per-CDN referers
├── public/              M3 frontend (index.html, app.js, ui.js, style.css,
│                        sites.js + logos.js with exact brand logos)
└── tests/               fixture unit tests + jsdom frontend smoke test
```
