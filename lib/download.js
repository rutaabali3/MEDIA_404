/* ============================================================
 * download.js — media download proxy
 * Streams media through the server with the right referer so
 * CDNs don't block hotlinking; bypasses CORS for the browser.
 * ============================================================ */
'use strict';
const { Readable } = require('stream');
const MG = require('./sites.js');
const { fetchUrl, UA_DESKTOP } = require('./fetch.js');

const REFERERS = [
  ['i.redd.it', 'https://www.reddit.com/'],
  ['preview.redd.it', 'https://www.reddit.com/'],
  ['external-preview.redd.it', 'https://www.reddit.com/'],
  ['v.redd.it', 'https://www.reddit.com/'],
  ['pbs.twimg.com', 'https://twitter.com/'],
  ['video.twimg.com', 'https://twitter.com/'],
  ['i.ytimg.com', 'https://www.youtube.com/'],
  ['i.pinimg.com', 'https://www.pinterest.com/'],
  ['i.vimeocdn.com', 'https://vimeo.com/'],
  ['i.imgur.com', 'https://imgur.com/'],
  ['m.media-amazon.com', 'https://www.amazon.com/'],
  ['ssl-images-amazon.com', 'https://www.amazon.com/'],
  ['i.ebayimg.com', 'https://www.ebay.com/'],
  ['ae01.alicdn.com', 'https://www.aliexpress.com/'],
  ['ae04.alicdn.com', 'https://www.aliexpress.com/'],
  ['static-01.daraz.pk', 'https://www.daraz.pk/'],
  ['img.drz.lazcdn.com', 'https://www.daraz.pk/'],
  ['sg-live.slatic.net', 'https://www.daraz.pk/'],
  ['scontent.', 'https://www.facebook.com/'],
  ['fbcdn.net', 'https://www.facebook.com/'],
  ['cdninstagram.com', 'https://www.instagram.com/'],
  ['tiktokcdn.com', 'https://www.tiktok.com/']
];

const MAX_BYTES = 800 * 1024 * 1024; // 800 MB hard cap

async function proxyDownload(req, res) {
  let url;
  try { url = new URL(req.query.url); }
  catch (e) { return res.status(400).send('Invalid URL'); }
  if (!/^https?:$/.test(url.protocol)) return res.status(400).send('Only http(s) media can be downloaded');

  const host = url.hostname.toLowerCase();
  const referer = (REFERERS.find((r) => host.includes(r[0])) || [null, url.origin + '/'])[1];
  const siteId = MG.detectSite(host).id;
  const name = req.query.name
    ? MG.sanitizeFilename(String(req.query.name))
    : MG.filenameGuess(url.href, siteId, MG.kindOf(url.href) || 'video');

  try {
    const upstream = await fetchUrl(url.href, {
      ua: UA_DESKTOP,
      timeout: 90000,
      headers: { referer, accept: '*/*' }
    });
    if (!upstream.ok) return res.status(502).send('Upstream returned HTTP ' + upstream.status);
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return res.status(413).send('File too large');

    res.status(200);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
    if (len) res.setHeader('content-length', String(len));
    res.setHeader('content-disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name));
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).send('Download failed: ' + ((e && e.message) || e));
    else { try { res.destroy(); } catch (x) { /* noop */ } }
  }
}

module.exports = { proxyDownload };
