/* ============================================================
 * app.js — MediaGrab 404 web app logic
 * Same UI flow as the extension popup:
 *   app bar (detected app + exact logo + pills) → grab →
 *   chips + cards grid → select → bottom bar Download → sheet.
 * grab(url) → client-side extract.js (browser). Downloads save as blobs.
 * ============================================================ */
(function () {
  'use strict';

  const RECENT_KEY = 'mg404-recents';
  const SETTINGS_KEY = 'mg404-settings';

  const STATE = {
    site: MG.UNIVERSAL,
    raw: [],              // items exactly as returned by the API
    items: [],            // after dedupe setting
    filter: 'all',
    selected: new Set(),
    busy: false,
    lastTitle: null,
    settings: { dedupe: true, askFirst: false, showRecents: true }
  };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      STATE.settings = Object.assign({ dedupe: true, askFirst: false, showRecents: true }, s);
    } catch (e) { /* defaults */ }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(STATE.settings)); } catch (e) { /* noop */ }
  }

  /* ---------------- recents ---------------- */
  function getRecents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function addRecent(url, siteId, title) {
    let r = getRecents();
    r = r.filter((x) => x.url !== url);
    r.unshift({ url, siteId, title: title || '', t: Date.now() });
    r = r.slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) { /* noop */ }
    renderRecents();
  }
  function renderRecents() {
    const r = getRecents();
    const card = $('#recents-card');
    card.hidden = !STATE.settings.showRecents || r.length === 0;
    $('#recents').innerHTML = r.map((x) => {
      const site = MG.siteById(x.siteId);
      const logo = ML.html(site.id, 20) || ('<span class="msr" style="color:' + site.color + '">apps</span>');
      return '<div class="recent" data-url="' + esc(x.url) + '">' +
        '<div class="tile">' + logo + '</div>' +
        '<span class="rtxt">' + esc(x.title || hostOf(x.url)) + '</span></div>';
    }).join('');
    $$('#recents .recent').forEach((el) => {
      el.onclick = () => {
        $('#url-input').value = el.dataset.url;
        grab(el.dataset.url);
      };
    });
  }

  /* ---------------- app bar: same as the extension header ---------------- */
  function renderHeader() {
    const s = STATE.site;
    document.body.style.setProperty('--c1', s.color);
    document.body.style.setProperty('--c2', s.color2 || s.color);
    document.body.style.setProperty('--ct', contrastText(s.color, s.color2 || s.color));
    applyM3Theme(s.color);

    // exact brand logo tile (white tile, real logo) — universal gets gradient tile
    const tile = $('#mg-logo');
    const logo = ML.html(s.id, 26);
    if (s.id === 'universal' || !logo) {
      tile.style.background = 'linear-gradient(135deg, ' + s.color + ', ' + (s.color2 || s.color) + ')';
      tile.innerHTML = '<span class="msr msr-22" style="color:#fff">all_inclusive</span>';
    } else {
      tile.style.background = '#ffffff';
      tile.innerHTML = logo;
    }

    if (s.id === 'universal') {
      $('#mg-title').textContent = 'MediaGrab 404';
      $('#mg-sub').textContent = 'Universal mode · any site';
    } else {
      $('#mg-title').textContent = s.name;
      $('#mg-sub').textContent = 'MediaGrab 404 · detected';
    }
    document.title = 'MediaGrab 404 — ' + s.name;

    // quick-switch pills: universal / social / shopping
    const pills = $('#mg-pills');
    pills.innerHTML = '';
    const groups = [
      { label: 'Universal', act: () => { STATE.site = MG.UNIVERSAL; renderHeader(); } },
      { label: 'Social apps', act: () => pickCategory('social') },
      { label: 'Shopping', act: () => pickCategory('shop') }
    ];
    groups.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'mg-pill';
      if (g.label === 'Universal' && s.id === 'universal') b.classList.add('active');
      if ((g.label === 'Social apps' && s.cat === 'social') || (g.label === 'Shopping' && s.cat === 'shop')) b.classList.add('active');
      b.textContent = g.label;
      b.onclick = g.act;
      pills.appendChild(b);
    });
  }

  function pickCategory(cat) {
    const list = MG.SITES.filter((x) => x.cat === cat && x.id !== 'universal');
    const cur = list.findIndex((x) => x.id === STATE.site.id);
    STATE.site = list[(cur + 1) % list.length];
    renderHeader();
    toast('Mode: ' + STATE.site.name);
  }

  /* ---------------- status line ---------------- */
  function setStatus(t, spinning) {
    $('#mg-status-txt').textContent = t;
    $('#mg-status-icon').hidden = !spinning;
  }

  /* ---------------- grabbing ---------------- */
  function setBusy(b) {
    STATE.busy = b;
    $('#btn-grab').disabled = b;
  }

  function showError(msg) {
    const el = $('#grab-err');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError() { $('#grab-err').hidden = true; }

  function runExtract(url) {
    if (typeof window.__MG_TEST_EXTRACT === 'function') return window.__MG_TEST_EXTRACT(url);
    if (!window.__MGExtract || typeof window.__MGExtract.extract !== 'function') {
      return Promise.reject(new Error('Extractor failed to load'));
    }
    return window.__MGExtract.extract(url);
  }

  async function grab(url) {
    url = String(url || '').trim();
    if (!url) return;
    if (STATE.busy) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let valid;
    try { valid = new URL(url); } catch (e) { showError('That link looks invalid.'); return; }
    if (!/^https?:$/.test(valid.protocol)) { showError('Only http(s) links are supported.'); return; }

    STATE.selected.clear();
    hideError();
    setBusy(true);
    setStatus('Working…', true);
    const t0 = Date.now();

    try {
      const data = await runExtract(url);
      if (!data || !data.ok) throw new Error((data && data.error) || 'Extraction failed');

      STATE.site = MG.siteById(data.site && data.site.id) ||
        MG.siteById(MG.detectSite(hostOf(data.finalUrl || url)).id);
      STATE.raw = data.items || [];
      STATE.lastTitle = data.title || null;
      STATE.items = STATE.settings.dedupe ? dedupeItems(STATE.raw) : STATE.raw.slice();

      renderHeader();
      renderChips();
      renderGrid();
      addRecent(url, STATE.site.id, data.title || '');

      setStatus(STATE.items.length + ' found · ' + (Date.now() - t0) + 'ms');
      toast(STATE.items.length + ' item(s) found' + (STATE.items.length === 0 ? ' — nothing public on that page' : ''));
    } catch (e) {
      showError(String((e && e.message) || e));
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- chips (same as the extension filters) ---------------- */
  const FILTERS = [
    ['all', 'apps', 'All'],
    ['image', 'image', 'Images'],
    ['video', 'movie', 'Videos'],
    ['audio', 'music_note', 'Audio'],
    ['doc', 'description', 'Docs'],
    ['hls', 'stream', 'Live']
  ];

  function renderChips() {
    const counts = { all: STATE.items.length, image: 0, video: 0, audio: 0, doc: 0, hls: 0 };
    STATE.items.forEach((it) => { counts[it.kind] = (counts[it.kind] || 0) + 1; });
    $('#filters').innerHTML = FILTERS.map(([id, icon, label]) =>
      '<button class="chip' + (STATE.filter === id ? ' active' : '') + '" data-f="' + id + '">' +
      '<span class="msr msr-16">' + icon + '</span>' + label +
      ' <span class="cnt">' + (counts[id] || 0) + '</span></button>'
    ).join('');
    $$('#filters .chip').forEach((c) => {
      c.onclick = () => {
        STATE.filter = c.dataset.f;
        renderChips();
        renderGrid();
      };
    });
  }

  /* ---------------- grid (same cards as the extension) ---------------- */
  function visibleItems() {
    if (STATE.filter === 'all') return STATE.items;
    return STATE.items.filter((x) => x.kind === STATE.filter);
  }

  function cardHtml(it) {
    const meta = KIND_META[it.kind] || KIND_META.other;
    const thumb = it.kind === 'image' ? it.url : (it.thumb || null);
    const sel = STATE.selected.has(it.url);
    let inner;
    if (thumb) {
      inner = '<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="' + esc(thumb) + '" alt=""' +
        ' onerror="this.outerHTML=\'<div class=ph><span class=msr>' + meta.icon + '</span><b>' + esc(meta.label) + '</b></div>\'">';
    } else {
      inner = '<div class="ph"><span class="msr">' + meta.icon + '</span><b>' + esc(meta.label) + '</b></div>';
    }
    return '<div class="mg-card' + (sel ? ' sel' : '') + '" data-url="' + esc(it.url) + '" title="' + esc(it.url) + '">' +
      inner +
      '<span class="kind-badge">' + esc(meta.label) + '</span>' +
      (it.dim ? '<span class="dim-badge">' + esc(it.dim) + '</span>' : '') +
      '<span class="check"><span class="msr msr-14">check</span></span></div>';
  }

  function renderGrid() {
    const vis = visibleItems();
    $('#grid').innerHTML = vis.map(cardHtml).join('');
    $$('#grid .mg-card').forEach((card) => {
      card.onclick = () => {
        const u = card.dataset.url;
        if (STATE.selected.has(u)) STATE.selected.delete(u);
        else STATE.selected.add(u);
        card.classList.toggle('sel');
        updateFooter();
      };
      card.ondblclick = () => dlByUrl(card.dataset.url);
    });
    $('#empty').hidden = vis.length > 0;
    if (!vis.length) {
      $('#empty-txt').innerHTML = STATE.items.length === 0
        ? 'No media found yet.<br>Paste a post / product link and press <b>Grab</b>.<br>Private or login-only content can\u2019t be reached.'
        : 'No <b>' + esc(FILTERS.find((f) => f[0] === STATE.filter)[2]) + '</b> on that page.';
    }
    updateFooter();
  }

  /* ---------------- bottom bar (same as the extension footer) ---------------- */
  function updateFooter() {
    const vis = visibleItems();
    const selInView = vis.filter((x) => STATE.selected.has(x.url)).length;
    $('#btn-sel').textContent = selInView === vis.length && vis.length ? 'Clear' : 'Select all';
    $('#btn-dl').disabled = STATE.selected.size === 0;
    $('#btn-dl-lbl').textContent = 'Download ' + STATE.selected.size;
  }

  /* ---------------- downloads (client-side blob, else open the file) ---------------- */
  async function dlUrl(url, name) {
    try {
      if (window.__MGExtract && typeof window.__MGExtract.download === 'function' && typeof window.__MG_TEST_EXTRACT !== 'function') {
        await window.__MGExtract.download(url, name);
        return;
      }
    } catch (e) { /* fall through to direct link */ }
    const a = document.createElement('a');
    a.href = url;
    a.download = name || '';
    a.rel = 'noopener';
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 5000);
  }
  function dlByUrl(url) {
    const it = STATE.items.find((x) => x.url === url) || { url, kind: 'video' };
    dlUrl(url, it.name);
    toast('Downloading ' + (it.name || 'file'));
  }

  async function downloadSelected() {
    const list = Array.from(STATE.selected);
    if (!list.length) return;
    if (STATE.settings.askFirst && !confirm('Download ' + list.length + ' file(s)?')) return;
    STATE.selected.clear();
    renderGrid();
    setStatus('Downloading…', true);

    const p = $('#progress');
    const bar = p.firstElementChild;
    for (let i = 0; i < list.length; i++) {
      const it = STATE.items.find((x) => x.url === list[i]) || { url: list[i], kind: 'video' };
      bar.style.width = Math.round((i / list.length) * 100) + '%';
      await dlUrl(it.url, it.name);
      await new Promise((r) => setTimeout(r, 400));
    }
    bar.style.width = '100%';
    setTimeout(() => { bar.style.width = '0'; }, 600);
    setStatus(list.length + ' download(s) started');
    toast(list.length + ' download(s) started');
  }

  /* ---------------- supported sites ---------------- */
  function renderSites() {
    $('#sites').innerHTML = MG.SITES.filter((x) => x.id !== 'universal').map((site) => {
      const logo = ML.html(site.id, 18) || ('<span class="msr" style="color:' + site.color + '">apps</span>');
      return '<div class="sitecell" title="' + esc(site.name) + '">' +
        '<div class="tile">' + logo + '</div><b>' + esc(site.name) + '</b></div>';
    }).join('');
  }

  /* ---------------- init ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applyM3Theme(MG.UNIVERSAL.color);
    renderHeader();
    renderSites();
    renderRecents();
    updateFooter();
    $('#set-dedupe').checked = STATE.settings.dedupe;
    $('#set-ask').checked = STATE.settings.askFirst;
    $('#set-recents').checked = STATE.settings.showRecents;

    $('#btn-grab').addEventListener('click', () => grab($('#url-input').value));
    $('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') grab($('#url-input').value); });
    $('#url-input').addEventListener('input', () => {
      // live detection preview, like the extension's auto-detect
      const v = $('#url-input').value.trim();
      if (/^https?:\/\//i.test(v)) {
        try {
          STATE.site = MG.detectSite(hostOf(v));
          renderHeader();
        } catch (e) { /* noop */ }
      }
    });

    // select all / clear
    $('#btn-sel').addEventListener('click', () => {
      const vis = visibleItems();
      const allSel = vis.length && vis.every((x) => STATE.selected.has(x.url));
      if (allSel) { vis.forEach((x) => STATE.selected.delete(x.url)); }
      else { vis.forEach((x) => STATE.selected.add(x.url)); }
      renderGrid();
    });
    $('#btn-dl').addEventListener('click', downloadSelected);

    // settings sheet
    $('#mg-settings').addEventListener('click', () => { $('#mg-sheet').hidden = false; });
    $('#mg-sheet-close').addEventListener('click', () => { $('#mg-sheet').hidden = true; });
    $('#mg-sheet').addEventListener('click', (e) => { if (e.target.id === 'mg-sheet') $('#mg-sheet').hidden = true; });
    $('#set-dedupe').addEventListener('change', (e) => {
      STATE.settings.dedupe = e.target.checked;
      saveSettings();
      STATE.items = STATE.settings.dedupe ? dedupeItems(STATE.raw) : STATE.raw.slice();
      renderChips();
      renderGrid();
    });
    $('#set-ask').addEventListener('change', (e) => {
      STATE.settings.askFirst = e.target.checked;
      saveSettings();
    });
    $('#set-recents').addEventListener('change', (e) => {
      STATE.settings.showRecents = e.target.checked;
      saveSettings();
      renderRecents();
    });

    // paste anywhere → grab
    document.addEventListener('paste', (e) => {
      if (document.activeElement && document.activeElement.id === 'url-input') return;
      const t = (e.clipboardData || window.clipboardData).getData('text') || '';
      if (/^https?:\/\//i.test(t.trim())) {
        $('#url-input').value = t.trim();
        grab(t.trim());
      }
    });
  });
})();
