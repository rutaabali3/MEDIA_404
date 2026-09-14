/* tests/smoke.js — run the real frontend in jsdom with a mocked API.
 * Asserts the web app's UI matches the extension: app bar (detected app,
 * exact logo, pills), chips, cards grid, footer bar, settings sheet. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadJsdom() {
  try { return require(path.join(__dirname, 'jsdom/node_modules/jsdom')); }
  catch (e) {
    execSync('npm init -y >/dev/null 2>&1; npm install jsdom@24 --no-audit --no-fund', { cwd: path.join(__dirname, 'jsdom'), stdio: 'ignore' });
    return require(path.join(__dirname, 'jsdom/node_modules/jsdom'));
  }
}
const { JSDOM, VirtualConsole } = loadJsdom();

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' → ' + e.message); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURE = {
  ok: true,
  url: 'https://www.reddit.com/r/pics/comments/abc123/cool_pic/',
  finalUrl: 'https://www.reddit.com/r/pics/comments/abc123/cool_pic/',
  site: { id: 'reddit', name: 'Reddit', short: 'RD', glyph: 'r', cat: 'social', color: '#FF4500', color2: '#FF7A45', text: '#fff' },
  title: 'Cool pic from r/pics',
  items: [
    // image + its low-res variant (same fingerprint) → deduped, keep hi-res
    { url: 'https://scontent.fna.fbcdn.net/v/t1.0-9/photo_890_o.jpg', kind: 'image', width: 1080, height: 1350, name: 'photo_890_o.jpg', dim: '1080×1350', source: 'Reddit' },
    { url: 'https://scontent.fna.fbcdn.net/v/t1.0-9/photo_890_n.jpg', kind: 'image', width: 320, height: 400, name: 'photo_890_n.jpg', dim: '320×400', source: 'Reddit' },
    { url: 'https://v.redd.it/xyz/DASH_720.mp4', kind: 'video', width: 1280, height: 720, name: 'xyz-DASH_720.mp4', dim: '1280×720', source: 'Reddit', thumb: 'https://i.redd.it/cover.jpg' },
    { url: 'https://cdn.example.com/manual.pdf', kind: 'doc', name: 'manual.pdf', source: 'Page' }
  ],
  notes: []
};

function buildHtml() {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const mock = '<script>' +
    'window.__fetches = []; window.__dls = [];' +
    'window.fetch = function(u, o) {' +
    '  window.__fetches.push(String(u));' +
    '  if (String(u).includes("/api/extract")) {' +
    '    return Promise.resolve({ ok: true, json: function(){ return Promise.resolve(' + JSON.stringify(FIXTURE) + '); } });' +
    '  }' +
    '  return Promise.resolve({ ok: true, status: 200 });' +
    '};' +
    'window.HTMLAnchorElement.prototype.click = function(){ window.__dls.push(this.href); };' +
    '</script>';
  const inline = (f) => '<script>' + fs.readFileSync(path.join(PUBLIC, f), 'utf8') + '</script>';
  return html
    .split('<script src="sites.js"></script>').join(inline('sites.js'))
    .split('<script src="logos.js"></script>').join(inline('logos.js'))
    .split('<script src="ui.js"></script>').join(mock + inline('ui.js'))
    .split('<script src="app.js"></script>').join(inline('app.js'));
}

(async () => {
  console.log('Web app UI smoke test (extension-identical):');
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://app.test/', virtualConsole: new VirtualConsole().sendTo(console, { omitJSDOMErrors: true })
  });
  const { window } = dom;
  const d = window.document;
  await wait(150);

  await t('supported platforms rendered (35)', () => {
    assert(d.querySelectorAll('.sitecell').length === 35, 'count = ' + d.querySelectorAll('.sitecell').length);
  });

  await t('initial app bar: universal mode', () => {
    assert(d.querySelector('#mg-title').textContent === 'MediaGrab 404', 'title = ' + d.querySelector('#mg-title').textContent);
    assert(d.querySelector('#mg-sub').textContent === 'Universal mode · any site', 'sub = ' + d.querySelector('#mg-sub').textContent);
  });

  await t('grab flow: app bar brands itself to Reddit', async () => {
    d.querySelector('#url-input').value = FIXTURE.url;
    d.querySelector('#btn-grab').click();
    await wait(300);
    assert(d.querySelector('#mg-title').textContent === 'Reddit', 'title = ' + d.querySelector('#mg-title').textContent);
    assert(d.querySelector('#mg-sub').textContent === 'MediaGrab 404 · detected', 'sub = ' + d.querySelector('#mg-sub').textContent);
    assert(window.getComputedStyle(d.body).getPropertyValue('--c1').trim() === '#FF4500', 'brand color not applied');
    assert(d.querySelector('#mg-status-txt').textContent.includes('found'), 'status = ' + d.querySelector('#mg-status-txt').textContent);
    // social pill active
    const pills = d.querySelectorAll('.mg-pill');
    assert(pills[1].classList.contains('active'), 'social pill not active');
  });

  await t('results rendered with dedupe', () => {
    const cards = d.querySelectorAll('#grid .mg-card');
    assert(cards.length === 3, 'expected 3 cards, got ' + cards.length);
    assert(Array.from(cards).some((c) => c.dataset.url.includes('_o.jpg')), 'hi-res variant missing');
    assert(!Array.from(cards).some((c) => c.dataset.url.includes('_n.jpg')), 'lo-res variant not deduped');
  });

  await t('video card has poster thumbnail', () => {
    const videoCard = Array.from(d.querySelectorAll('#grid .mg-card')).find((c) => c.dataset.url.includes('.mp4'));
    const img = videoCard.querySelector('img.thumb');
    assert(img && img.src.includes('cover.jpg'), 'no poster on video card');
  });

  await t('filter chips switch', () => {
    d.querySelector('.chip[data-f="image"]').click();
    assert(d.querySelectorAll('#grid .mg-card').length === 1, 'image filter wrong');
    d.querySelector('.chip[data-f="all"]').click();
    assert(d.querySelectorAll('#grid .mg-card').length === 3, 'all filter wrong');
  });

  await t('card click selects and enables bottom bar Download', () => {
    d.querySelector('#grid .mg-card').click();
    assert(!d.querySelector('#btn-dl').disabled, 'download still disabled');
    assert(d.querySelector('#btn-dl-lbl').textContent === 'Download 1', 'label = ' + d.querySelector('#btn-dl-lbl').textContent);
  });

  await t('select all selects visible; clear empties', () => {
    d.querySelector('#btn-sel').click();
    assert(d.querySelector('#btn-dl-lbl').textContent === 'Download 3', 'select-all wrong');
    d.querySelector('#btn-sel').click();
    assert(d.querySelector('#btn-dl').disabled, 'not cleared');
    assert(d.querySelector('#btn-dl-lbl').textContent === 'Download 0', 'label after clear wrong');
  });

  await t('download queue hits /api/download proxy', async () => {
    d.querySelector('#grid .mg-card').click();
    d.querySelector('#btn-dl').click();
    await wait(600);
    assert(window.__dls.length === 1, 'downloads fired = ' + window.__dls.length);
    assert(window.__dls[0].includes('/api/download?url='), 'href = ' + window.__dls[0]);
    assert(window.__dls[0].includes('name='), 'name param missing');
  });

  await t('recents saved and clickable', () => {
    const recents = d.querySelectorAll('.recent');
    assert(recents.length === 1, 'recent missing');
    assert(recents[0].textContent.includes('Cool pic'), 'recent text = ' + recents[0].textContent);
  });

  await t('settings sheet toggles dedupe live', async () => {
    d.querySelector('#mg-settings').click();
    assert(!d.querySelector('#mg-sheet').hidden, 'sheet not open');
    const box = d.querySelector('#set-dedupe');
    box.checked = false;
    box.dispatchEvent(new window.Event('change'));
    await wait(100);
    assert(d.querySelectorAll('#grid .mg-card').length === 4, 'dedupe off should show 4');
    box.checked = true;
    box.dispatchEvent(new window.Event('change'));
    await wait(100);
    assert(d.querySelectorAll('#grid .mg-card').length === 3, 'dedupe on should show 3');
    d.querySelector('#mg-sheet-close').click();
    assert(d.querySelector('#mg-sheet').hidden, 'sheet not closed');
  });

  await t('pills cycle platforms (same as extension)', () => {
    d.querySelectorAll('.mg-pill')[1].click(); // Social apps → next after Reddit = YouTube
    assert(d.querySelector('#mg-title').textContent === 'YouTube', 'title = ' + d.querySelector('#mg-title').textContent);
    d.querySelectorAll('.mg-pill')[0].click(); // Universal
    assert(d.querySelector('#mg-title').textContent === 'MediaGrab 404', 'universal title wrong');
    assert(d.querySelector('#mg-sub').textContent === 'Universal mode · any site', 'universal sub wrong');
  });

  await t('invalid link shows error', async () => {
    d.querySelector('#url-input').value = 'not a url';
    d.querySelector('#btn-grab').click();
    await wait(150);
    assert(!d.querySelector('#grab-err').hidden, 'no error shown');
  });

  window.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
