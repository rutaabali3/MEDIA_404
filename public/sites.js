/* ============================================================
 * sites.js — MediaGrab 404 shared site registry + media helpers
 * Loaded by: background (importScripts), content scripts, popup.
 * Idempotent: safe to re-inject. Exposed as self.__MGSites.
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.__MGSites) return;

  const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'jfif'];
  const VID_EXT = ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'mpg', 'mpeg', 'ogv', '3gp', 'flv'];
  const AUD_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba', 'wma'];
  const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'zip', 'rar', '7z', 'epub'];
  const STREAM_EXT = ['m3u8', 'mpd'];

  /* CDN host fragments — used to recognise media URLs that carry
   * no extension (common for TikTok / Amazon / Reddit CDNs). */
  const CDN_HOSTS = [
    'pbs.twimg.com/media', 'video.twimg.com',
    'scontent.', 'cdninstagram.com', 'fbcdn.net',
    'i.redd.it', 'preview.redd.it', 'v.redd.it',
    'i.pinimg.com',
    'tiktokcdn.com', 'tiktokv.com',
    'media-amazon.com', 'ssl-images-amazon.com', 'images-amazon.com',
    'img.drz.lazcdn.com', 'sg-live.slatic.net', 'ph-live.slatic.net', 'live.slatic.net',
    'ae01.alicdn.com', 'ae04.alicdn.com',
    'i.ebayimg.com', 'i.ytimg.com', 'vimeocdn.com'
  ];

  const UNIVERSAL = {
    id: 'universal', name: 'Universal', short: 'MG', glyph: '✦',
    cat: 'auto', color: '#7C3AED', color2: '#A78BFA', text: '#fff', match: []
  };

  /* ---------------- Site registry ---------------- */
  const SITES = [
    /* ── Social ── */
    { id: 'facebook',    name: 'Facebook',     short: 'FB', glyph: 'f',  cat: 'social', color: '#0866FF', color2: '#4D9CFF', text: '#fff', match: ['facebook.com', 'fb.com', 'fb.watch', 'messenger.com'] },
    { id: 'instagram',   name: 'Instagram',    short: 'IG', glyph: 'i',  cat: 'social', color: '#E4405F', color2: '#F77737', text: '#fff', match: ['instagram.com'] },
    { id: 'threads',     name: 'Threads',      short: 'TH', glyph: '@',  cat: 'social', color: '#000000', color2: '#444444', text: '#fff', match: ['threads.net'] },
    { id: 'x',           name: 'X (Twitter)',  short: 'X',  glyph: 'x',  cat: 'social', color: '#000000', color2: '#3D3D3D', text: '#fff', match: ['x.com', 'twitter.com', 't.co'] },
    { id: 'tiktok',      name: 'TikTok',       short: 'TT', glyph: 't',  cat: 'social', color: '#FE2C55', color2: '#25F4EE', text: '#fff', match: ['tiktok.com'] },
    { id: 'reddit',      name: 'Reddit',       short: 'RD', glyph: 'r',  cat: 'social', color: '#FF4500', color2: '#FF7A45', text: '#fff', match: ['reddit.com'] },
    { id: 'youtube',     name: 'YouTube',      short: 'YT', glyph: '▶',  cat: 'social', color: '#FF0000', color2: '#FF4D4D', text: '#fff', match: ['youtube.com', 'youtu.be'] },
    { id: 'linkedin',    name: 'LinkedIn',     short: 'LI', glyph: 'in', cat: 'social', color: '#0A66C2', color2: '#3D9BE0', text: '#fff', match: ['linkedin.com'] },
    { id: 'pinterest',   name: 'Pinterest',    short: 'PI', glyph: 'p',  cat: 'social', color: '#E60023', color2: '#FF5C74', text: '#fff', match: ['pin.it', { h: 'pinterest', m: 'prefix' }] },
    { id: 'bluesky',     name: 'Bluesky',      short: 'BS', glyph: 'b',  cat: 'social', color: '#0085FF', color2: '#57B3FF', text: '#fff', match: ['bsky.app'] },
    { id: 'vimeo',       name: 'Vimeo',        short: 'VM', glyph: 'v',  cat: 'social', color: '#1AB7EA', color2: '#63D5F5', text: '#fff', match: ['vimeo.com'] },
    { id: 'dailymotion', name: 'Dailymotion',  short: 'DM', glyph: 'd',  cat: 'social', color: '#0066FF', color2: '#5599FF', text: '#fff', match: ['dailymotion.com'] },
    { id: 'twitch',      name: 'Twitch',       short: 'TW', glyph: 't',  cat: 'social', color: '#9146FF', color2: '#B98CFF', text: '#fff', match: ['twitch.tv'] },
    { id: 'tumblr',      name: 'Tumblr',       short: 'TU', glyph: 'tu', cat: 'social', color: '#36465D', color2: '#5C7494', text: '#fff', match: ['tumblr.com'] },
    { id: 'telegram',    name: 'Telegram',     short: 'TG', glyph: 'tg', cat: 'social', color: '#26A5E4', color2: '#6BCAF5', text: '#fff', match: ['web.telegram.org', 't.me'] },
    { id: 'whatsapp',    name: 'WhatsApp Web', short: 'WA', glyph: 'w',  cat: 'social', color: '#25D366', color2: '#5CE38E', text: '#fff', match: ['web.whatsapp.com'] },
    { id: 'soundcloud',  name: 'SoundCloud',   short: 'SC', glyph: 'sc', cat: 'social', color: '#FF5500', color2: '#FF8B4D', text: '#fff', match: ['soundcloud.com'] },
    { id: 'imgur',       name: 'Imgur',        short: 'IM', glyph: 'im', cat: 'media',  color: '#1BB76E', color2: '#66D9A0', text: '#fff', match: ['imgur.com'] },

    /* ── Shopping ── */
    { id: 'amazon',      name: 'Amazon',       short: 'AM', glyph: 'a',  cat: 'shop', color: '#FF9900', color2: '#FFC266', text: '#fff', match: [{ h: 'amazon', m: 'prefix' }] },
    { id: 'ebay',        name: 'eBay',         short: 'EB', glyph: 'e',  cat: 'shop', color: '#E53238', color2: '#FF7176', text: '#fff', match: [{ h: 'ebay', m: 'prefix' }] },
    { id: 'aliexpress',  name: 'AliExpress',   short: 'AE', glyph: 'ae', cat: 'shop', color: '#E62E04', color2: '#FF7A4D', text: '#fff', match: ['aliexpress.com', 'aliexpress.ru', { h: 'aliexpress', m: 'prefix' }] },
    { id: 'alibaba',     name: 'Alibaba',      short: 'AB', glyph: 'ab', cat: 'shop', color: '#FF6A00', color2: '#FFA14D', text: '#fff', match: ['alibaba.com'] },
    { id: 'daraz',       name: 'Daraz',        short: 'DZ', glyph: 'dz', cat: 'shop', color: '#F85606', color2: '#FF9C62', text: '#fff', match: ['daraz.pk', 'daraz.com.bd', 'daraz.lk', 'daraz.com.np', 'daraz.com'] },
    { id: 'temu',        name: 'Temu',         short: 'TM', glyph: 'tm', cat: 'shop', color: '#FB7701', color2: '#FFB14D', text: '#fff', match: ['temu.com'] },
    { id: 'shein',       name: 'SHEIN',        short: 'SH', glyph: 'sh', cat: 'shop', color: '#000000', color2: '#4A4A4A', text: '#fff', match: [{ h: 'shein', m: 'prefix' }] },
    { id: 'etsy',        name: 'Etsy',         short: 'ET', glyph: 'et', cat: 'shop', color: '#F1641E', color2: '#FF9762', text: '#fff', match: ['etsy.com'] },
    { id: 'walmart',     name: 'Walmart',      short: 'WM', glyph: 'wm', cat: 'shop', color: '#0071CE', color2: '#4DA6E8', text: '#fff', match: [{ h: 'walmart', m: 'prefix' }] },
    { id: 'noon',        name: 'Noon',         short: 'NN', glyph: 'nn', cat: 'shop', color: '#FEEE00', color2: '#FFF799', text: '#000', match: ['noon.com'] },
    { id: 'olx',         name: 'OLX',          short: 'OL', glyph: 'ol', cat: 'shop', color: '#002F34', color2: '#0E5C63', text: '#fff', match: [{ h: 'olx', m: 'prefix' }] },
    { id: 'flipkart',    name: 'Flipkart',     short: 'FK', glyph: 'fk', cat: 'shop', color: '#2874F0', color2: '#6AA4F5', text: '#fff', match: ['flipkart.com'] },
    { id: 'shopify',     name: 'Shopify store', short: 'SF', glyph: 'sf', cat: 'shop', color: '#96BF48', color2: '#C2DD8A', text: '#fff', match: ['myshopify.com'] },
    { id: 'lazada',      name: 'Lazada',       short: 'LZ', glyph: 'lz', cat: 'shop', color: '#F57224', color2: '#FFA166', text: '#fff', match: [{ h: 'lazada', m: 'prefix' }] },
    { id: 'shopee',      name: 'Shopee',       short: 'SP', glyph: 'sp', cat: 'shop', color: '#EE4D2D', color2: '#FF8A63', text: '#fff', match: [{ h: 'shopee', m: 'prefix' }] },
    { id: 'taobao',      name: 'Taobao',       short: 'TB', glyph: 'tb', cat: 'shop', color: '#FF4400', color2: '#FF8659', text: '#fff', match: ['taobao.com'] },
    { id: 'tmall',       name: 'Tmall',        short: 'TL', glyph: 'tl', cat: 'shop', color: '#FF0036', color2: '#FF5C7D', text: '#fff', match: ['tmall.com'] },
    { id: 'universal',   name: 'Universal',    short: 'MG', glyph: '✦',  cat: 'auto',  color: '#7C3AED', color2: '#A78BFA', text: '#fff', match: [] }
  ];

  /* ---------------- Detection ---------------- */
  function matchHost(host, entry) {
    const h = entry.h, m = entry.m || 'suffix';
    if (m === 'prefix') return host === h || host.startsWith(h + '.');
    return host === h || host.endsWith('.' + h);
  }

  function detectSite(host) {
    if (!host) return UNIVERSAL;
    host = String(host).toLowerCase().replace(/^www\./, '');
    for (const site of SITES) {
      for (const entry of site.match) {
        if (typeof entry === 'string') { if (matchHost(host, { h: entry, m: 'suffix' })) return site; }
        else if (matchHost(host, entry)) return site;
      }
    }
    return UNIVERSAL;
  }

  function siteById(id) {
    return SITES.find(s => s.id === id) || UNIVERSAL;
  }

  /* ---------------- Media helpers ---------------- */
  function extOf(u) {
    try {
      const path = new URL(u).pathname;
      const m = path.match(/\.([a-z0-9]{1,5})$/i);
      return m ? m[1].toLowerCase() : null;
    } catch (e) { return null; }
  }

  function isMediaUrl(u) { return kindOf(u) !== null; }

  function kindOf(u) {
    if (!/^https?:/i.test(u)) return null;
    const e = extOf(u);
    if (!e) return null;
    if (IMG_EXT.includes(e)) return 'image';
    if (VID_EXT.includes(e)) return 'video';
    if (AUD_EXT.includes(e)) return 'audio';
    if (DOC_EXT.includes(e)) return 'doc';
    if (STREAM_EXT.includes(e)) return 'hls';
    return null;
  }

  function cdnHostOf(u) {
    try {
      const host = new URL(u).hostname;
      for (const c of CDN_HOSTS) if (host.includes(c)) return c;
    } catch (e) { /* noop */ }
    return null;
  }

  /* Would we log this URL in the network capture? (excludes stream chunks) */
  function isLoggable(u) {
    if (!/^https?:/i.test(u)) return false;
    const k = kindOf(u);
    if (k && k !== 'hls') return true;
    if (k === 'hls') return true;
    if (/\.(ts|m4s|fmp4|aac|vtt|mpd|webvtt)(\?|$)/i.test(u)) return false;
    return cdnHostOf(u) !== null;
  }

  /* URL is media or lives on a known media CDN (even without an extension) */
  function looksMediaish(u) {
    if (!/^https?:/i.test(u)) return false;
    return kindOf(u) !== null || cdnHostOf(u) !== null;
  }

  /* ---------------- URL cleaning (per-site) ---------------- */
  const TRACK_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'igshid', 'igsh', 'ref_src', 'ref_url', 'spm', '_fsrp', 'cmpid', 'psc'];

  function cleanUrlForSite(u, siteId) {
    if (typeof u !== 'string') return u;
    let s = u.split('#')[0];
    let pu;
    try { pu = new URL(s); } catch (e) { return u; }
    if (!/^https?:/i.test(pu.protocol)) return u;
    for (const p of TRACK_PARAMS) pu.searchParams.delete(p);
    try {
      switch (siteId) {
        case 'x': // pbs.twimg.com/media/XXXX?format=jpg&name=small  →  name=orig
          if (pu.hostname.includes('twimg.com') && pu.pathname.includes('/media/')) {
            const q = pu.searchParams; pu.search = '';
            q.set('format', 'jpg'); q.set('name', 'orig');
            pu.search = q.toString();
          }
          break;
        case 'youtube': // hqdefault.jpg → maxresdefault.jpg
          if (/i\.ytimg\.com\/vi\//.test(s)) {
            pu.pathname = pu.pathname.replace(/\/(default|hqdefault|mqdefault|sddefault|maxresdefault|hq720|0|1|2|3)\.jpg$/i, '/maxresdefault.jpg');
          }
          break;
        case 'pinterest': // i.pinimg.com/564x/ab/cd/ef/abcdef.jpg → originals
          if (/i\.pinimg\.com/.test(s) && !pu.pathname.includes('/originals/')) {
            pu.pathname = pu.pathname.replace(/\/\d+x(\d+filters[^/]*)?\//, '/originals/');
          }
          break;
        case 'reddit': // preview.redd.it/ID.jpg?width=640&... → i.redd.it/ID.jpg
          if (/preview\.redd\.it\//.test(s)) {
            const m = pu.pathname.match(/\/([A-Za-z0-9_-]+)(\.(jpg|jpeg|png|webp|gif))?/i);
            const id = m ? m[1] : pu.pathname.replace(/\//g, '');
            return 'https://i.redd.it/' + id + '.jpg';
          }
          if (/i\.redd\.it/.test(s)) pu.search = '';
          break;
        case 'facebook':
          if (/(fbsbx|lookaside)/.test(s)) pu.search = '';
          break;
        case 'instagram':
        case 'tiktok':
        case 'amazon':
        case 'daraz':
        case 'aliexpress':
        case 'alibaba':
          break; // signed / parameterised CDN URLs must keep their params
        default:
          break;
      }
    } catch (e) { /* keep original */ }
    return pu.toString();
  }

  /* ---------------- Filenames ---------------- */
  const GENERIC_NAMES = ['media', 'video', 'image', 'photo', 'download', 'file', 'attachment',
    'output', 'origin', 'stream', 'asset', 'main', 'thumb', 'thumbnail', 'blob', 'index', 'cover', 'img'];

  function sanitizeFilename(n) {
    let s = String(n).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90);
    s = s.replace(/^\.+|\.+$/g, '');
    return s || 'file';
  }

  function defaultExtFor(kind) {
    if (kind === 'image') return 'jpg';
    if (kind === 'video') return 'mp4';
    if (kind === 'audio') return 'mp3';
    if (kind === 'doc') return 'bin';
    if (kind === 'hls') return 'ts';
    return 'bin';
  }

  function filenameGuess(u, siteId, kind) {
    let name = '';
    let origExt = null;
    try {
      const pu = new URL(u);
      let last = decodeURIComponent(pu.pathname.split('/').filter(Boolean).pop() || '');
      const em = last.match(/\.([a-z0-9]{1,6})$/i);
      if (em) origExt = em[1].toLowerCase();
      name = last.replace(/\.[a-z0-9]{1,6}$/i, '') || '';
    } catch (e) { name = ''; }
    if (!name || GENERIC_NAMES.includes(name.toLowerCase()) || /^[a-z0-9]{40,}$/i.test(name) || /^\d+$/.test(name)) {
      const s = siteById(siteId);
      name = (s ? s.name.replace(/\s+/g, '-') : 'media') + '-' + Date.now().toString(36);
    }
    name = sanitizeFilename(name);
    const hasExt = /\.[a-z0-9]{1,6}$/i.test(name);
    if (!hasExt) {
      const keep = (kind === 'image' && IMG_EXT.includes(origExt)) ||
                   (kind === 'video' && VID_EXT.includes(origExt)) ||
                   (kind === 'audio' && AUD_EXT.includes(origExt)) ||
                   (kind === 'doc' && DOC_EXT.includes(origExt));
      name += '.' + (origExt && keep ? origExt : defaultExtFor(kind));
    }
    return name;
  }

  /* ---------------- HLS playlist parsing ---------------- */
  function resolveUrl(u, base) {
    try { return new URL(u, base).toString(); }
    catch (e) { return u; }
  }

  /* Master playlist → [{uri, bw}] sorted by bandwidth (highest first) */
  function parseMasterPlaylist(text, baseUrl) {
    const lines = String(text).split(/\r?\n/);
    const variants = [];
    let lastBw = 0;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;
      if (t.startsWith('#EXT-X-STREAM-INF')) {
        const m = t.match(/BANDWIDTH=(\d+)/);
        lastBw = m ? parseInt(m[1], 10) : 0;
      } else if (!t.startsWith('#')) {
        variants.push({ uri: resolveUrl(t, baseUrl), bw: lastBw });
      }
    }
    variants.sort((a, b) => b.bw - a.bw);
    return variants;
  }

  /* Media playlist → {segments, init, isFmp4, error} */
  function parseMediaPlaylist(text, baseUrl) {
    const lines = String(text).split(/\r?\n/);
    const segments = [];
    let init = null, isFmp4 = false;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;
      if (t.startsWith('#EXT-X-KEY') && /METHOD=AES/i.test(t)) {
        return { segments: [], init: null, isFmp4: false, error: 'AES-encrypted HLS is not supported' };
      }
      if (t.startsWith('#EXT-X-MAP')) {
        const m = t.match(/URI="([^"]+)"/);
        if (m) { init = resolveUrl(m[1], baseUrl); isFmp4 = true; }
        continue;
      }
      if (!t.startsWith('#')) {
        segments.push(resolveUrl(t, baseUrl));
        if (/\.(m4s|mp4)(\?|$)/i.test(t)) isFmp4 = true;
      }
    }
    return { segments, init, isFmp4, error: null };
  }

  /* ---------------- Post / product detection (focused grabbing) ----------------
   * For social sites the "post" is the open post/status/reel; for shops it's the
   * product page. id: regexes to pull the post/product id from the URL (used for
   * anchor matching in the DOM). roots: candidate container selectors. */
  const POST_DETECT = {
    facebook: {
      id: [/\/posts\/(\d+)/, /\/videos\/(\d+)/, /\/reel\/(\d+)/, /\/photo\/?\?fbid=(\d+)/, /[?&]story_fbid=(\d+)/, /[?&]fbid=(\d+)/, /[?&]v=(\d+)/],
      roots: ['div[role="dialog"]', 'div[role="article"]', 'article[role="article"]', 'article']
    },
    instagram: {
      id: [/\/p\/([A-Za-z0-9_-]+)/, /\/reels?\/([A-Za-z0-9_-]+)/, /\/tv\/([A-Za-z0-9_-]+)/],
      roots: ['article[role="presentation"]', 'article', 'main article', 'div[role="dialog"] article']
    },
    threads: {
      id: [/\/post\/([A-Za-z0-9_-]+)/],
      roots: ['article', 'div[role="article"]']
    },
    x: {
      id: [/\/status\/(\d+)/],
      roots: ['article[data-testid="tweet"]', 'article']
    },
    tiktok: {
      id: [/\/video\/(\d+)/, /\/photo\/(\d+)/],
      roots: ['[data-e2e="video-detail"]', 'div[class*="DivVideoContainer"]', 'main']
    },
    reddit: {
      id: [/\/comments\/([a-z0-9]+)\//i, /\/s\/([a-z0-9]+)/i],
      roots: ['shreddit-post', 'div[id^="t3_"]', 'div[data-testid="post-container"]', 'article']
    },
    youtube: {
      id: [/[?&]v=([\w-]{6,})/, /\/shorts\/([\w-]{6,})/, /\/embed\/([\w-]{6,})/, /\/live\/([\w-]{6,})/],
      roots: ['ytd-watch-flexy', 'ytd-shorts']
    },
    pinterest: {
      id: [/\/pin\/(\d+)/],
      roots: ['div[data-test-id="pinWrapper"]', '[data-test-id="closeup-wrapper"]', '[data-test-id="pin-closeup-image"]']
    },
    bluesky: {
      id: [/\/post\/([a-z0-9]+)/i],
      roots: ['div[data-testid^="postThreadItem"]', 'article']
    },
    tumblr: {
      id: [/\/post\/(\d+)/],
      roots: ['article[data-id]', 'article', 'div.post']
    },
    linkedin: {
      id: [/activity[%3A:](\d+)/i],
      roots: ['div[data-urn*="activity"]', 'article.main-feed-activity-card', '.feed-shared-update-v2']
    },
    imgur: {
      id: [/\/gallery\/([A-Za-z0-9]+)/, /\/a\/([A-Za-z0-9]+)/],
      roots: ['div.post-container', 'main']
    },
    vimeo: {
      id: [/\/(\d{6,})(?:\?.*)?$/],
      roots: ['#main', 'main']
    },
    dailymotion: {
      id: [/\/video\/([a-z0-9]+)/i],
      roots: ['main', '#main']
    },
    twitch: {
      id: [/\/videos\/(\d+)/],
      roots: ['div[data-a-target="video-player"]', 'main']
    },
    soundcloud: {
      id: [/\/([^/]+)\/([^/]+)\/?$/],
      roots: ['main', '.sound__body']
    },
    /* shops — "post" = the product being viewed */
    amazon: {
      id: [/\/dp\/([A-Z0-9]{8,})/, /\/gp\/product\/([A-Z0-9]{8,})/],
      roots: ['#dp-container', '#ppd']
    },
    ebay: {
      id: [/\/itm\/(\d+)/],
      roots: ['#viBody', '#mainContent']
    },
    aliexpress: {
      id: [/\/item\/(\d+)/],
      roots: ['#main-wrap', 'div[class*="product-main"]']
    },
    daraz: {
      id: [/\/products\/[a-z0-9-]+-i(\d+)/, /\/products\/[a-z0-9-]+-s(\d+)/],
      roots: ['div[class*="pdp-block"]', '#module_product_title_1']
    }
  };

  function postIdOf(siteId, url) {
    const rule = POST_DETECT[siteId];
    if (!rule) return null;
    for (const re of rule.id) {
      const m = re.exec(String(url));
      if (m) return m[m.length - 1]; // last capture group = the id
    }
    return null;
  }

  function postRoots(siteId) {
    const rule = POST_DETECT[siteId];
    return rule ? rule.roots : [];
  }

  function hasPostRule(siteId) { return !!POST_DETECT[siteId]; }

  /* ---------------- Export ---------------- */
  const api = {
    SITES, UNIVERSAL, IMG_EXT, VID_EXT, AUD_EXT, DOC_EXT, STREAM_EXT, CDN_HOSTS,
    detectSite, siteById, matchHost,
    kindOf, isMediaUrl, isLoggable, looksMediaish, cdnHostOf, extOf,
    cleanUrlForSite, filenameGuess, sanitizeFilename, defaultExtFor,
    parseMasterPlaylist, parseMediaPlaylist, resolveUrl,
    postIdOf, postRoots, hasPostRule
  };
  global.__MGSites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
