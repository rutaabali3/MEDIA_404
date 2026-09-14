/* ============================================================
 * extract.js — MediaGrab 404 server-side extraction engine
 * Strategies per platform: oEmbed APIs, Reddit JSON API,
 * FxTwitter API, TikTok embedded state, Instagram JSON blobs,
 * plus generic HTML meta / JSON-LD / media-tag parsing.
 * ============================================================ */
'use strict';
const MG = require('./sites.js');
const cheerio = require('cheerio');
const { safeFetchText, UA_DESKTOP } = require('./fetch.js');

/* ---------------- item helpers ---------------- */
function addItem(out, u, kind, extra) {
  if (!u || typeof u !== 'string') return;
  u = u.trim();
  if (!/^https?:/i.test(u)) return;
  const k = kind || MG.kindOf(u) || (MG.cdnHostOf(u) ? 'video' : null);
  if (!k) return;
  if (u.length > 4000) return;
  const ex = out.items.find((i) => i.url === u);
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
  youtube: (u) => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u),
  vimeo: (u) => 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(u) + '&width=1920',
  tiktok: (u) => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u),
  soundcloud: (u) => 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(u),
  pinterest: (u) => 'https://www.pinterest.com/oembed.json?url=' + encodeURIComponent(u),
  imgur: (u) => 'https://api.imgur.com/oembed.json?url=' + encodeURIComponent(u)
};

async function tryOembed(out, siteId, url) {
  const builder = OEMBED[siteId];
  if (!builder) return;
  const { txt } = await safeFetchText(builder(url), { timeout: 15000 });
  const j = JSON.parse(txt);
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
    if (vids) vids.forEach((v) => addItem(out, v, null, { source: 'oEmbed' }));
  }
}

/* ---------------- Reddit JSON API ---------------- */
async function redditApi(out, url) {
  const u = new URL(url);
  if (!/\/comments\//.test(u.pathname) && !/\/s\//.test(u.pathname)) return;
  const jsonUrl = 'https://www.reddit.com' + u.pathname.replace(/\/?$/, '') + '.json' + u.search;
  const { txt } = await safeFetchText(jsonUrl, { ua: UA_DESKTOP, timeout: 20000 });
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

  // gallery
  if (p.media_metadata) {
    for (const key in p.media_metadata) {
      const m = p.media_metadata[key];
      if (!m) continue;
      if (m.s && m.s.u) addItem(out, decodeEntities(m.s.u), 'image', { width: m.s.x, height: m.s.y, label: 'Gallery', source: 'Reddit' });
      else if (m.m && m.m.startsWith('image/') && m.p && m.p.length) addItem(out, decodeEntities(m.p[0].u), 'image', { source: 'Reddit' });
    }
  }

  // reddit-hosted video
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

  // previews (single images) — skipped for reddit videos (they're just frames)
  if (!rv) {
    for (const im of previews) {
      const src = im.source && decodeEntities(im.source.url);
      if (src) addItem(out, src, 'image', { width: im.source.width, height: im.source.height, source: 'Reddit' });
      const gif = im.variants && im.variants.gif && im.variants.gif.source && decodeEntities(im.variants.gif.source.url);
      if (gif) addItem(out, gif, 'video', { label: 'GIF', source: 'Reddit' });
    }
  }

  // external media links
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
  for (const api of ['https://api.fxtwitter.com/', 'https://api.vxtwitter.com/']) {
    try {
      const { txt } = await safeFetchText(api + m[1] + '/status/' + m[2], { ua: UA_DESKTOP, timeout: 15000 });
      j = JSON.parse(txt);
      if (j) break;
    } catch (e) { /* try next */ }
  }
  const t = j && j.tweet;
  if (!t) return;
  out.title = out.title || (t.author && t.author.name ? t.author.name + ' on X' : undefined);
  const media = t.media;
  if (media && Array.isArray(media.all)) {
    for (const it of media.all) {
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
  if (typeof node.playAddr === 'string' && node.playAddr.startsWith('http')) {
    addItem(out, node.playAddr, 'video', { label: 'Video', thumb: typeof node.cover === 'string' ? node.cover : undefined, source: 'TikTok page' });
  }
  if (typeof node.downloadAddr === 'string' && node.downloadAddr.startsWith('http')) {
    addItem(out, node.downloadAddr, 'video', { label: 'Video (no watermark)', source: 'TikTok page' });
  }
  if (typeof node.cover === 'string' && node.cover.startsWith('http')) {
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
      n.image.forEach((i) => {
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

async function parseHtml(out, txt, finalUrl) {
  const $ = cheerio.load(txt);
  const siteId = MG.detectSite(new URL(finalUrl).hostname).id;

  // meta tags
  const meta = {};
  $('meta').each((i, el) => {
    const key = ($(el).attr('property') || $(el).attr('name') || $(el).attr('itemprop') || '').toLowerCase();
    const val = ($(el).attr('content') || '').trim();
    if (key && val) meta[key] = val;
  });

  out.title = out.title || meta['og:title'] || meta['twitter:title'] || ($('title').first().text() || '').trim() || undefined;

  const imgs = [meta['og:image'], meta['og:image:secure_url'], meta['og:image:url'],
    meta['twitter:image'], meta['twitter:image:src'], meta['thumbnail'], meta['image']];
  for (const i of imgs) if (i) addItem(out, i, 'image', { source: 'Page meta' });

  const vids = [meta['og:video:secure_url'], meta['og:video:url'], meta['og:video'], meta['twitter:player:stream']];
  for (const v of vids) {
    if (v && /^https?:/i.test(v)) {
      addItem(out, v, MG.kindOf(v), { source: 'Page meta', thumb: meta['og:image'] || undefined });
    }
  }

  // media elements
  $('video').each((i, el) => {
    const src = $(el).attr('src');
    if (src) addItem(out, absolutize(src, finalUrl), 'video', { source: 'Page' });
    $(el).find('source').each((j, s) => {
      const su = $(s).attr('src');
      if (su) addItem(out, absolutize(su, finalUrl), null, { source: 'Page' });
    });
  });
  $('audio').each((i, el) => {
    const src = $(el).attr('src');
    if (src) addItem(out, absolutize(src, finalUrl), 'audio', { source: 'Page' });
    $(el).find('source').each((j, s) => {
      const su = $(s).attr('src');
      if (su) addItem(out, absolutize(su, finalUrl), 'audio', { source: 'Page' });
    });
  });

  // JSON-LD
  $('script[type="application/ld+json"]').each((i, el) => {
    try { parseJsonLd(out, $(el).text()); } catch (e) { /* noop */ }
  });

  // site-specific bits inside the HTML
  if (siteId === 'tiktok') tiktokFromHtml(out, txt);
  if (siteId === 'instagram') {
    const un = (s) => unescapeJsonStr(s);
    const rx = /"(?:video_url|display_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\?\/\\?\/)[^"]+)"/g;
    let mm;
    while ((mm = rx.exec(txt))) addItem(out, un(mm[1]), null, { source: 'Page JSON' });
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

/* ---------------- Finalize ---------------- */
function finalizeItems(out, site) {
  const seen = new Set();
  const cleaned = [];
  for (const it of out.items) {
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

/* ---------------- Main entry ---------------- */
async function extract(inputUrl) {
  let u;
  try { u = new URL(inputUrl); } catch (e) { const err = new Error('Invalid URL'); err.status = 400; throw err; }
  if (!/^https?:$/.test(u.protocol)) { const err = new Error('Only http(s) links are supported'); err.status = 400; throw err; }

  const out = { ok: true, url: inputUrl, site: null, title: null, items: [], notes: [] };
  const errors = [];
  const site0 = MG.detectSite(u.hostname);
  out.site = site0;

  // 1) oEmbed (cheap, public APIs)
  try { await tryOembed(out, site0.id, inputUrl); }
  catch (e) { errors.push('oEmbed: ' + e.message); }

  // 2) platform JSON APIs
  if (site0.id === 'reddit') { try { await redditApi(out, inputUrl); } catch (e) { errors.push('Reddit API: ' + e.message); } }
  if (site0.id === 'x') { try { await twitterApi(out, inputUrl); } catch (e) { errors.push('X API: ' + e.message); } }

  // 3) the page itself (follows redirects; re-detects platform)
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
    }
    try { await parseHtml(out, html, finalUrl); } catch (e) { errors.push('HTML parse: ' + e.message); }
  }

  out.finalUrl = finalUrl;
  finalizeItems(out, MG.siteById(out.site.id));
  out.notes = errors.slice(0, 4);
  out.count = out.items.length;
  return out;
}

module.exports = { extract, parseHtml, parseRedditPost, parseJsonLd, walkTikTok, tiktokFromHtml, decodeEntities };
