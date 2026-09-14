/* ============================================================
 * extract.js — MediaGrab 404 client-side extraction engine
 * Runs entirely in the browser (GitHub Pages / static host).
 * Direct fetch first, then public CORS relays if the site blocks us.
 * ============================================================ */
(function (global) {
  'use strict';
  const MG = global.__MGSites;
  if (!MG) throw new Error('sites.js must load before extract.js');

  const MAX_HTML = 12 * 1024 * 1024;
  const MAX_BYTES = 800 * 1024 * 1024;

  function isPrivateIp(ip) {
    const v = String(ip).split('.').map(Number);
    if (v.length === 4 && v.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      if (v[0] === 0 || v[0] === 10 || v[0] === 127) return true;
      if (v[0] === 100 && v[1] >= 64 && v[1] <= 127) return true;
      if (v[0] === 169 && v[1] === 254) return true;
      if (v[0] === 172 && v[1] >= 16 && v[1] <= 31) return true;
      if (v[0] === 192 && v[1] === 168) return true;
      if (v[0] >= 224) return true;
      return false;
    }
    const lower = String(ip).toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    return false;
  }

  function assertPublicUrl(url) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('unsupported protocol');
    const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!h) throw new Error('empty host');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) {
      throw new Error('blocked host: ' + h);
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf(':') !== -1) {
      if (isPrivateIp(h)) throw new Error('blocked IP: ' + h);
    }
  }

  function proxyList(url) {
    return [
      url,
      'https://corsproxy.io/?' + encodeURIComponent(url),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url)
    ];
  }

  async function fetchOnce(url, timeout, asBlob) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeout || 20000);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (asBlob) {
        const blob = await res.blob();
        if (blob.size > MAX_BYTES) throw new Error('File too large');
        return blob;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_HTML) throw new Error('page too large');
      const txt = new TextDecoder('utf-8').decode(buf);
      return { txt: txt, url: res.url || url };
    } finally {
      clearTimeout(timer);
    }
  }

  async function safeFetchText(url, opts) {
    assertPublicUrl(url);
    const timeout = (opts && opts.timeout) || 20000;
    const list = proxyList(url);
    let last = null;
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await fetchOnce(list[i], timeout, false);
        return { txt: r.txt, url: i === 0 ? r.url : url };
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error('Could not fetch page (CORS)');
  }

  async function fetchBlob(url) {
    assertPublicUrl(url);
    const list = proxyList(url);
    let last = null;
    for (let i = 0; i < list.length; i++) {
      try {
        return await fetchOnce(list[i], 90000, true);
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error('download failed');
  }

  /* ---------------- item helpers ---------------- */
  function addItem(out, u, kind, extra) {
    if (!u || typeof u !== 'string') return;
    u = u.trim();
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (!/^https?:/i.test(u)) return;
    const k = kind || MG.kindOf(u) || (MG.cdnHostOf(u) ? 'video' : null);
    if (!k) return;
    if (u.length > 4000) return;
    const ex = out.items.find(function (i) { return i.url === u; });
    if (ex) { Object.assign(ex, extra || {}); return; }
    out.items.push(Object.assign({ url: u, kind: k }, extra || {}));
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  }

  function unescapeJsonStr(s) {
    return decodeEntities(s.replace(/\\"/g, '"'));
  }

  /* ---------------- oEmbed ---------------- */
  const OEMBED = {
    youtube: function (u) { return 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u); },
    vimeo: function (u) { return 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(u) + '&width=1920'; },
    tiktok: function (u) { return 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u); },
    soundcloud: function (u) { return 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(u); },
    pinterest: function (u) { return 'https://www.pinterest.com/oembed.json?url=' + encodeURIComponent(u); },
    imgur: function (u) { return 'https://api.imgur.com/oembed.json?url=' + encodeURIComponent(u); }
  };

  function applyOembedJson(out, siteId, j) {
    if (!j) return;
    out.title = out.title || j.title || j.author_name || undefined;
    let thumb = j.thumbnail_url || j.thumbnail || (j.thumb && j.thumb.url);
    if (thumb) {
      if (siteId === 'youtube') {
        thumb = thumb.replace(/\/(default|hqdefault|mqdefault|sddefault|maxresdefault|hq720|0|1|2|3)\.jpg$/, '/maxresdefault.jpg');
      }
      addItem(out, thumb, 'image', { label: 'Cover', source: 'oEmbed' });
    }
    if (j.html && typeof j.html === 'string') {
      const vids = j.html.match(/https?:\/\/[^"'&\\\s]+\.(mp4|webm|m3u8)(\?[^"']*)?/gi);
      if (vids) vids.forEach(function (v) { addItem(out, v, null, { source: 'oEmbed' }); });
    }
  }

  async function tryOembed(out, siteId, url) {
    const builder = OEMBED[siteId];
    if (!builder) return;
    try {
      const { txt } = await safeFetchText('https://noembed.com/embed?url=' + encodeURIComponent(url), { timeout: 12000 });
      applyOembedJson(out, siteId, JSON.parse(txt));
      if (out.items.length) return;
    } catch (e) { /* fall through to native oEmbed */ }
    const { txt } = await safeFetchText(builder(url), { timeout: 15000 });
    applyOembedJson(out, siteId, JSON.parse(txt));
  }

  function youtubeId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || null;
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
      return m ? m[2] : null;
    } catch (e) { return null; }
  }

  function youtubeFromUrl(out, url) {
    const id = youtubeId(url);
    if (!id) return;
    addItem(out, 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg', 'image', { label: 'Cover', source: 'YouTube' });
    out.title = out.title || 'YouTube video';
  }

  /* ---------------- Reddit JSON API ---------------- */
  async function redditApi(out, url) {
    const u = new URL(url);
    if (!/\/comments\//.test(u.pathname) && !/\/s\//.test(u.pathname)) return;
    const jsonUrl = 'https://www.reddit.com' + u.pathname.replace(/\/?$/, '') + '.json' + u.search;
    const { txt } = await safeFetchText(jsonUrl, { timeout: 20000 });
    const data = JSON.parse(txt);
    const post = data && data[0] && data[0].data && data[0].data.children &&
      data[0].data.children[0] && data[0].data.children[0].data;
    if (post) {
      out.title = out.title || post.title;
      parseRedditPost(out, post);
    }
  }

  function parseRedditPost(out, p) {
    if (!p) return;
    if (p.title) out.title = out.title || p.title;
    if (p.crosspost_parent_list && p.crosspost_parent_list[0]) parseRedditPost(out, p.crosspost_parent_list[0]);

    if (p.media_metadata) {
      for (const key in p.media_metadata) {
        const m = p.media_metadata[key];
        if (!m) continue;
        if (m.s && m.s.u) addItem(out, decodeEntities(m.s.u), 'image', { width: m.s.x, height: m.s.y, label: 'Gallery', source: 'Reddit' });
        else if (m.m && m.m.indexOf('image/') === 0 && m.p && m.p.length) addItem(out, decodeEntities(m.p[0].u), 'image', { source: 'Reddit' });
      }
    }

    const media = p.secure_media || p.media;
    const previews = (p.preview && p.preview.images) || [];
    const rv = media && media.reddit_video;
    if (rv) {
      if (rv.hls_url) addItem(out, decodeEntities(rv.hls_url), 'hls', { label: 'HLS stream', width: rv.width, height: rv.height, source: 'Reddit' });
      if (rv.fallback_url) {
        addItem(out, decodeEntities(rv.fallback_url), 'video', {
          width: rv.width, height: rv.height,
          thumb: previews[0] && decodeEntities(previews[0].source.url),
          source: 'Reddit'
        });
      }
    }

    if (!rv) {
      for (let i = 0; i < previews.length; i++) {
        const im = previews[i];
        const src = im.source && decodeEntities(im.source.url);
        if (src) addItem(out, src, 'image', { width: im.source.width, height: im.source.height, source: 'Reddit' });
        const gif = im.variants && im.variants.gif && im.variants.gif.source && decodeEntities(im.variants.gif.source.url);
        if (gif) addItem(out, gif, 'video', { label: 'GIF', source: 'Reddit' });
      }
    }

    if (p.url_overridden_by_dest) {
      const ext = decodeEntities(p.url_overridden_by_dest);
      if (MG.kindOf(ext) || MG.looksMediaish(ext)) addItem(out, ext, null, { source: 'Reddit link' });
    }
    if (media && media.oembed && media.oembed.thumbnail_url) {
      addItem(out, decodeEntities(media.oembed.thumbnail_url), 'image', { label: 'Video cover', source: 'Reddit' });
    }
  }

  /* ---------------- X / Twitter via FxTwitter ---------------- */
  async function twitterApi(out, url) {
    const m = String(url).match(/\/([^/]+)\/status\/(\d+)/i);
    if (!m) return;
    let j = null;
    const apis = ['https://api.fxtwitter.com/', 'https://api.vxtwitter.com/'];
    for (let i = 0; i < apis.length; i++) {
      try {
        const { txt } = await safeFetchText(apis[i] + m[1] + '/status/' + m[2], { timeout: 15000 });
        j = JSON.parse(txt);
        if (j) break;
      } catch (e) { /* try next */ }
    }
    const t = j && j.tweet;
    if (!t) return;
    out.title = out.title || (t.author && t.author.name ? t.author.name + ' on X' : undefined);
    const media = t.media;
    if (media && Array.isArray(media.all)) {
      for (let i = 0; i < media.all.length; i++) {
        const it = media.all[i];
        if (it.type === 'photo') {
          addItem(out, it.url, 'image', { width: it.width, height: it.height, source: 'X API' });
        } else if (it.type === 'video' || it.type === 'gif') {
          if (it.url) addItem(out, it.url, 'video', { thumb: it.thumbnail_url || undefined, source: 'X API' });
          if (it.thumbnail_url) addItem(out, it.thumbnail_url, 'image', { label: 'Video cover', source: 'X API' });
        }
      }
    }
  }

  /* ---------------- TikTok embedded state ---------------- */
  function walkTikTok(out, node, seen) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (typeof node.playAddr === 'string' && node.playAddr.indexOf('http') === 0) {
      addItem(out, node.playAddr, 'video', { label: 'Video', thumb: typeof node.cover === 'string' ? node.cover : undefined, source: 'TikTok page' });
    }
    if (typeof node.downloadAddr === 'string' && node.downloadAddr.indexOf('http') === 0) {
      addItem(out, node.downloadAddr, 'video', { label: 'Video (no watermark)', source: 'TikTok page' });
    }
    if (typeof node.cover === 'string' && node.cover.indexOf('http') === 0) {
      addItem(out, node.cover, 'image', { label: 'Cover', source: 'TikTok page' });
    }
    for (const k in node) {
      if (k === 'playAddr' || k === 'downloadAddr' || k === 'cover') continue;
      const v = node[k];
      if (v && typeof v === 'object') walkTikTok(out, v, seen);
    }
  }

  function tiktokFromHtml(out, txt) {
    let data = null;
    const m = txt.match(/<script id="__UNIVERSAL_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) { try { data = JSON.parse(m[1]); } catch (e) { data = null; } }
    if (!data) {
      const s = txt.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
      if (s) { try { data = JSON.parse(s[1]); } catch (e) { data = null; } }
    }
    if (data) walkTikTok(out, data, new Set());
  }

  /* ---------------- Generic HTML parsing ---------------- */
  function parseJsonLd(out, text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return; }
    const stack = Array.isArray(data) ? data : [data];
    const seen = new Set();
    (function walk(n) {
      if (!n || typeof n !== 'object' || seen.has(n)) return;
      seen.add(n);
      if (typeof n.contentUrl === 'string') addItem(out, n.contentUrl, null, { source: 'JSON-LD' });
      if (typeof n.thumbnailUrl === 'string') addItem(out, n.thumbnailUrl, 'image', { source: 'JSON-LD' });
      if (typeof n.embedUrl === 'string' && /^https?:/i.test(n.embedUrl)) addItem(out, n.embedUrl, 'video', { source: 'JSON-LD' });
      if (typeof n.image === 'string' && MG.kindOf(n.image)) addItem(out, n.image, 'image', { source: 'JSON-LD' });
      else if (Array.isArray(n.image)) {
        n.image.forEach(function (i) {
          if (typeof i === 'string') addItem(out, i, 'image', { source: 'JSON-LD' });
          else if (i && typeof i.url === 'string') addItem(out, i.url, 'image', { source: 'JSON-LD' });
        });
      }
      for (const k in n) { const v = n[k]; if (v && typeof v === 'object') walk(v); }
    })(stack);
  }

  function absolutize(u, base) {
    try { return new URL(u, base).toString(); } catch (e) { return u; }
  }

  function parseHtml(out, txt, finalUrl) {
    const doc = new DOMParser().parseFromString(txt, 'text/html');
    const siteId = MG.detectSite(new URL(finalUrl).hostname).id;

    const meta = {};
    const metas = doc.querySelectorAll('meta');
    for (let i = 0; i < metas.length; i++) {
      const el = metas[i];
      const key = (el.getAttribute('property') || el.getAttribute('name') || el.getAttribute('itemprop') || '').toLowerCase();
      const val = (el.getAttribute('content') || '').trim();
      if (key && val) meta[key] = val;
    }

    const titleEl = doc.querySelector('title');
    out.title = out.title || meta['og:title'] || meta['twitter:title'] || (titleEl && titleEl.textContent.trim()) || undefined;

    const imgs = [meta['og:image'], meta['og:image:secure_url'], meta['og:image:url'],
      meta['twitter:image'], meta['twitter:image:src'], meta['thumbnail'], meta['image']];
    for (let i = 0; i < imgs.length; i++) if (imgs[i]) addItem(out, imgs[i], 'image', { source: 'Page meta' });

    const vids = [meta['og:video:secure_url'], meta['og:video:url'], meta['og:video'], meta['twitter:player:stream']];
    for (let i = 0; i < vids.length; i++) {
      const v = vids[i];
      if (v && /^https?:/i.test(v)) {
        addItem(out, v, MG.kindOf(v), { source: 'Page meta', thumb: meta['og:image'] || undefined });
      }
    }

    const videos = doc.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      const el = videos[i];
      const src = el.getAttribute('src');
      if (src) addItem(out, absolutize(src, finalUrl), 'video', { source: 'Page' });
      const sources = el.querySelectorAll('source');
      for (let j = 0; j < sources.length; j++) {
        const su = sources[j].getAttribute('src');
        if (su) addItem(out, absolutize(su, finalUrl), null, { source: 'Page' });
      }
    }
    const audios = doc.querySelectorAll('audio');
    for (let i = 0; i < audios.length; i++) {
      const el = audios[i];
      const src = el.getAttribute('src');
      if (src) addItem(out, absolutize(src, finalUrl), 'audio', { source: 'Page' });
      const sources = el.querySelectorAll('source');
      for (let j = 0; j < sources.length; j++) {
        const su = sources[j].getAttribute('src');
        if (su) addItem(out, absolutize(su, finalUrl), 'audio', { source: 'Page' });
      }
    }

    const lds = doc.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < lds.length; i++) {
      try { parseJsonLd(out, lds[i].textContent); } catch (e) { /* noop */ }
    }

    if (siteId === 'tiktok') tiktokFromHtml(out, txt);
    if (siteId === 'instagram') {
      const rx = /"(?:video_url|display_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\?\/\\?\/)[^"]+)"/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, unescapeJsonStr(mm[1]), null, { source: 'Page JSON' });
    }
    if (siteId === 'amazon') {
      const rx = /"hiRes":"(https?:[^"]+)"/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, unescapeJsonStr(mm[1]), 'image', { source: 'Amazon page' });
    }
    if (siteId === 'daraz') {
      const rx = /"image":"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, unescapeJsonStr(mm[1]), 'image', { source: 'Daraz page' });
    }
    if (siteId === 'aliexpress') {
      const rx = /https?:\/\/ae\d{2}\.alicdn\.com\/[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp|mp4)/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, mm[0], null, { source: 'AliExpress page' });
    }
    if (siteId === 'ebay') {
      const rx = /"imageUrl":"(https?:[^"]+)"/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, unescapeJsonStr(mm[1]), 'image', { source: 'eBay page' });
    }
    if (siteId === 'facebook') {
      const rx = /https?:\/\/scontent[^"'\\\s]+\.(?:jpg|jpeg|png|webp|mp4)(?:\?[^"'\\\s]*)?/g;
      let mm;
      while ((mm = rx.exec(txt))) addItem(out, unescapeJsonStr(mm[0]), null, { source: 'Facebook page' });
    }
  }

  function finalizeItems(out, site) {
    const seen = new Set();
    const cleaned = [];
    for (let i = 0; i < out.items.length; i++) {
      const it = out.items[i];
      let url = it.url;
      try { url = MG.cleanUrlForSite(url, site.id); } catch (e) { /* keep */ }
      if (url.length > 4000) continue;
      const k = it.kind || MG.kindOf(url) || 'video';
      const sig = url.split('?')[0];
      if (seen.has(sig)) continue;
      seen.add(sig);
      it.url = url;
      it.kind = k;
      it.name = MG.filenameGuess(url, site.id, k);
      it.dim = (it.width && it.height) ? it.width + '×' + it.height : '';
      delete it.count;
      cleaned.push(it);
    }
    out.items = cleaned;
    out.site = site;
  }

  async function extract(inputUrl) {
    let u;
    try { u = new URL(inputUrl); } catch (e) { const err = new Error('Invalid URL'); throw err; }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links are supported');
    assertPublicUrl(inputUrl);

    const out = { ok: true, url: inputUrl, site: null, title: null, items: [], notes: [] };
    const errors = [];
    const site0 = MG.detectSite(u.hostname);
    out.site = site0;

    if (site0.id === 'youtube') {
      try { youtubeFromUrl(out, inputUrl); } catch (e) { errors.push('YouTube: ' + e.message); }
    }

    try { await tryOembed(out, site0.id, inputUrl); }
    catch (e) { errors.push('oEmbed: ' + e.message); }

    if (site0.id === 'reddit') { try { await redditApi(out, inputUrl); } catch (e) { errors.push('Reddit API: ' + e.message); } }
    if (site0.id === 'x') { try { await twitterApi(out, inputUrl); } catch (e) { errors.push('X API: ' + e.message); } }

    let html = null, finalUrl = inputUrl;
    try {
      const r = await safeFetchText(inputUrl, { timeout: 20000 });
      html = r.txt;
      finalUrl = r.url;
    } catch (e) { errors.push('Page fetch: ' + e.message); }

    if (html) {
      const site1 = MG.detectSite(new URL(finalUrl).hostname);
      if (site1.id !== site0.id) {
        out.site = site1;
        if (site1.id === 'reddit') { try { await redditApi(out, finalUrl); } catch (e) { /* noop */ } }
        if (site1.id === 'x') { try { await twitterApi(out, finalUrl); } catch (e) { /* noop */ } }
        if (site1.id === 'youtube') { try { youtubeFromUrl(out, finalUrl); } catch (e) { /* noop */ } }
      }
      try { parseHtml(out, html, finalUrl); } catch (e) { errors.push('HTML parse: ' + e.message); }
    }

    out.finalUrl = finalUrl;
    finalizeItems(out, MG.siteById(out.site.id));
    out.notes = errors.slice(0, 4);
    out.count = out.items.length;
    return out;
  }

  async function download(url, name) {
    const blob = await fetchBlob(url);
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name || 'media';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(href); }, 5000);
  }

  const api = {
    extract: extract,
    download: download,
    parseHtml: parseHtml,
    parseRedditPost: parseRedditPost,
    parseJsonLd: parseJsonLd,
    walkTikTok: walkTikTok,
    tiktokFromHtml: tiktokFromHtml,
    decodeEntities: decodeEntities
  };
  global.__MGExtract = api;
})(typeof window !== 'undefined' ? window : self);
