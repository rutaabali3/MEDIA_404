/* ============================================================
 * server.js — MediaGrab 404 web app
 *   GET /api/extract?url=…   → find all media on a post/product page
 *   GET /api/download?url=…  → stream a media file to the browser
 *   GET /api/health
 *   static: public/
 * ============================================================ */
'use strict';
const express = require('express');
const path = require('path');
const { extract } = require('./lib/extract');
const { proxyDownload } = require('./lib/download');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));

/* tiny in-memory rate limiter (60 req/min per IP) */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim();
  const now = Date.now();
  const w = hits.get(ip) || [];
  while (w.length && now - w[0] > 60000) w.shift();
  if (w.length >= 60) return res.status(429).send('Too many requests — slow down a little.');
  w.push(now);
  hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'MediaGrab 404', version: '1.0.0' }));

app.get('/api/extract', rateLimit, async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });
  try {
    const out = await extract(url);
    res.json(out);
  } catch (e) {
    res.status(e.status || 422).json({ error: String((e && e.message) || e) });
  }
});

app.get('/api/download', rateLimit, proxyDownload);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('MediaGrab 404 web app listening on http://0.0.0.0:' + PORT);
});
