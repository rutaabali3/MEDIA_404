/* ============================================================
 * ui.js — M3 theme engine + small helpers for the web app
 * ============================================================ */
'use strict';

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

const MG = window.__MGSites;
const ML = window.__MGLogos || { LOGOS: {}, html: () => null };

const KIND_META = {
  image: { label: 'Image', icon: 'image' },
  video: { label: 'Video', icon: 'movie' },
  audio: { label: 'Audio', icon: 'music_note' },
  doc:   { label: 'Doc',   icon: 'description' },
  hls:   { label: 'Live',  icon: 'stream' },
  other: { label: 'Other', icon: 'inventory_2' }
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

/* ---------- M3 tonal theme from a seed brand color ---------- */
function hexRgb(h) {
  h = String(h).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((c) => c / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function hslStr(h, s, l) { return 'hsl(' + h + ' ' + Math.min(100, Math.max(0, s)) + '% ' + Math.min(100, Math.max(0, l)) + '%)'; }

function m3Theme(seedHex) {
  const [h, s] = rgbHsl(seedHex);
  const onPrimaryLight = luminance(seedHex) > 0.5 ? hslStr(h, s, 12) : '#ffffff';
  const onPrimaryDark = luminance(seedHex) > 0.5 ? '#ffffff' : hslStr(h, s, 20);
  return ':root{' +
    '--md-primary:' + hslStr(h, s, 40) + ';' +
    '--md-on-primary:' + onPrimaryLight + ';' +
    '--md-primary-container:' + hslStr(h, s * 0.9, 90) + ';' +
    '--md-on-primary-container:' + hslStr(h, s, 16) + ';' +
    '--md-secondary-container:' + hslStr(h, s * 0.35, 90) + ';' +
    '--md-on-secondary-container:' + hslStr(h, s * 0.4, 24) + ';' +
    '--md-surface:' + hslStr(h, s * 0.06, 98.5) + ';' +
    '--md-surface-container-lowest:' + hslStr(h, s * 0.05, 100) + ';' +
    '--md-surface-container-low:' + hslStr(h, s * 0.07, 96.5) + ';' +
    '--md-surface-container:' + hslStr(h, s * 0.08, 94.5) + ';' +
    '--md-surface-container-high:' + hslStr(h, s * 0.09, 92.5) + ';' +
    '--md-on-surface:' + hslStr(h, s * 0.4, 10) + ';' +
    '--md-on-surface-variant:' + hslStr(h, s * 0.25, 30) + ';' +
    '--md-outline:' + hslStr(h, s * 0.15, 78) + ';' +
    '--md-outline-variant:' + hslStr(h, s * 0.1, 90) + ';' +
    '--md-inverse-surface:' + hslStr(h, s * 0.3, 22) + ';' +
    '--md-inverse-on-surface:' + hslStr(h, s * 0.1, 96) + ';' +
    '--md-error:#b3261e;--md-error-container:#f9dedc;--md-on-error-container:#410e0b;' +
    '--md-elev1:0 1px 2px rgba(0,0,0,.18), 0 1px 3px 1px rgba(0,0,0,.10);' +
    '--md-elev2:0 1px 2px rgba(0,0,0,.22), 0 2px 6px 2px rgba(0,0,0,.12);' +
    '--md-elev3:0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.22);' +
    '}' +
    '@media (prefers-color-scheme: dark){:root{' +
    '--md-primary:' + hslStr(h, s, 80) + ';' +
    '--md-on-primary:' + onPrimaryDark + ';' +
    '--md-primary-container:' + hslStr(h, s, 30) + ';' +
    '--md-on-primary-container:' + hslStr(h, s * 0.7, 90) + ';' +
    '--md-secondary-container:' + hslStr(h, s * 0.3, 30) + ';' +
    '--md-on-secondary-container:' + hslStr(h, s * 0.35, 90) + ';' +
    '--md-surface:' + hslStr(h, s * 0.15, 6.5) + ';' +
    '--md-surface-container-lowest:' + hslStr(h, s * 0.15, 4) + ';' +
    '--md-surface-container-low:' + hslStr(h, s * 0.15, 10) + ';' +
    '--md-surface-container:' + hslStr(h, s * 0.15, 12) + ';' +
    '--md-surface-container-high:' + hslStr(h, s * 0.15, 17) + ';' +
    '--md-on-surface:' + hslStr(h, s * 0.12, 90) + ';' +
    '--md-on-surface-variant:' + hslStr(h, s * 0.12, 80) + ';' +
    '--md-outline:' + hslStr(h, s * 0.12, 60) + ';' +
    '--md-outline-variant:' + hslStr(h, s * 0.12, 30) + ';' +
    '--md-inverse-surface:' + hslStr(h, s * 0.12, 90) + ';' +
    '--md-inverse-on-surface:' + hslStr(h, s * 0.4, 20) + ';' +
    '--md-error:#f2b8b5;--md-error-container:#8c1d18;--md-on-error-container:#f9dedc;' +
    '}}';
}

function applyM3Theme(seedHex) {
  let st = document.getElementById('mg-theme');
  if (!st) {
    st = document.createElement('style');
    st.id = 'mg-theme';
    document.head.appendChild(st);
  }
  st.textContent = m3Theme(seedHex);
}

function contrastText(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (l1 + l2) / 2 > 0.45 ? '#1b1b1f' : '#ffffff';
}

/* ---------- Dedupe (image resolution variants) ---------- */
function imgFingerprint(u) {
  try {
    const pu = new URL(u);
    let p = pu.pathname;
    p = p.replace(/\._[A-Z]{1,6}_[^.]*_\./g, '._.');
    p = p.replace(/_\d+x\d+(?=[_.]|$)/g, '');
    p = p.replace(/\/\d+x\//g, '/');
    p = p.replace(/_(?:small|medium|large|orig|original|thumb|thumbnail|tiny|big|hq)(?=[_.]|$)/gi, '');
    p = p.replace(/_[a-z]{1,2}(?=\.[a-z0-9]{3,4}$)/, '');
    return pu.hostname + p;
  } catch (e) { return u; }
}

function dedupeItems(items) {
  const best = new Map();
  const order = [];
  for (const it of items) {
    let key = it.url;
    if (it.kind === 'image') key = imgFingerprint(it.url);
    const prev = best.get(key);
    if (!prev) { best.set(key, it); order.push(key); continue; }
    const pa = (prev.width || 0) * (prev.height || 0);
    const na = (it.width || 0) * (it.height || 0);
    if (na > pa) best.set(key, it);
  }
  return order.map((k) => best.get(k));
}

/* ---------- Toast ---------- */
let _toastTm = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTm);
  _toastTm = setTimeout(() => t.classList.remove('show'), 2400);
}
