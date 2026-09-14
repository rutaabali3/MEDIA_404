/* ============================================================
 * fetch.js — safe outbound fetching for MediaGrab 404 web
 *  • SSRF guard: no localhost / private ranges / IP literals
 *  • size + time caps
 * ============================================================ */
'use strict';
const dns = require('dns').promises;
const net = require('net');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_HTML = 12 * 1024 * 1024; // 12 MB

function isPrivateIp(ip) {
  const v = ip.split('.').map(Number);
  if (v.length === 4 && v.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    if (v[0] === 0 || v[0] === 10 || v[0] === 127) return true;
    if (v[0] === 100 && v[1] >= 64 && v[1] <= 127) return true; // CGNAT
    if (v[0] === 169 && v[1] === 254) return true;              // link-local
    if (v[0] === 172 && v[1] >= 16 && v[1] <= 31) return true;
    if (v[0] === 192 && v[1] === 168) return true;
    if (v[0] >= 224) return true; // multicast + reserved
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
  return false;
}

async function assertPublicHost(hostname) {
  const h = String(hostname).replace(/^\[|\]$/g, '').toLowerCase();
  if (!h) throw new Error('empty host');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) {
    throw new Error('blocked host: ' + h);
  }
  if (net.isIP(h)) {
    if (isPrivateIp(h)) throw new Error('blocked IP: ' + h);
    return;
  }
  let addrs;
  try { addrs = await dns.lookup(h, { all: true }); }
  catch (e) { throw new Error('DNS failed: ' + h); }
  if (!addrs || !addrs.length) throw new Error('DNS empty: ' + h);
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('blocked private address: ' + a.address);
}

async function fetchUrl(url, opts) {
  opts = opts || {};
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('unsupported protocol');
  await assertPublicHost(u.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 20000);
  try {
    return await fetch(u.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: Object.assign(
        { 'user-agent': opts.ua || UA_MOBILE, 'accept-language': 'en-US,en;q=0.9' },
        opts.headers || {}
      )
    });
  } finally { clearTimeout(timer); }
}

/* HTML fetch → { txt, url } (url = final URL after redirects) */
async function safeFetchText(url, opts) {
  const res = await fetchUrl(url, opts);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + res.url);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_HTML) throw new Error('page too large');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_HTML) throw new Error('page too large');
  return { txt: Buffer.from(buf).toString('utf8'), url: res.url };
}

module.exports = { UA_MOBILE, UA_DESKTOP, fetchUrl, safeFetchText, assertPublicHost, isPrivateIp };
