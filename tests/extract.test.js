/* tests/extract.test.js — fixture-based unit tests for the extraction engine */
'use strict';
const path = require('path');
const MG = require(path.join(__dirname, '..', 'lib', 'sites.js'));
const { parseHtml, parseRedditPost, parseJsonLd, walkTikTok, tiktokFromHtml, decodeEntities } = require(path.join(__dirname, '..', 'lib', 'extract.js'));
const { assertPublicHost, isPrivateIp } = require(path.join(__dirname, '..', 'lib', 'fetch.js'));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' → ' + e.message); }
}
function eq(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function newOut() { return { url: 'https://x.test/', site: null, title: null, items: [], notes: [] }; }
function urls(o) { return o.items.map((i) => i.url); }

console.log('HTML meta parsing:');
t('og:image + og:video collected', async () => {
  const html = '<html><head><title>Test post</title>' +
    '<meta property="og:title" content="A cool post">' +
    '<meta property="og:image" content="https://cdn.example.com/img/a1.jpg">' +
    '<meta property="og:video:secure_url" content="https://cdn.example.com/vid/v1.mp4">' +
    '<meta property="og:type" content="video">' +
    '</head><body></body></html>';
  const out = newOut();
  await parseHtml(out, html, 'https://example.com/post/1');
  ok(urls(out).includes('https://cdn.example.com/img/a1.jpg'), 'image missing');
  ok(urls(out).includes('https://cdn.example.com/vid/v1.mp4'), 'video missing');
  eq(out.title, 'A cool post');
});
t('relative video source absolutized', async () => {
  const html = '<html><body><video><source src="/media/clip.mp4" type="video/mp4"></video></body></html>';
  const out = newOut();
  await parseHtml(out, html, 'https://example.com/watch');
  ok(urls(out).some((u) => u === 'https://example.com/media/clip.mp4'), urls(out).join(','));
});
t('audio tag collected', async () => {
  const html = '<html><body><audio src="https://cdn.example.com/track.mp3"></audio></body></html>';
  const out = newOut();
  await parseHtml(out, html, 'https://example.com/');
  eq(urls(out).length, 1);
});

console.log('JSON-LD parsing:');
t('contentUrl / thumbnailUrl / image arrays', () => {
  const out = newOut();
  parseJsonLd(out, JSON.stringify({
    '@type': 'Product',
    name: 'Widget',
    image: ['https://cdn.example.com/w1.jpg', 'https://cdn.example.com/w2.jpg'],
    subjectOf: { contentUrl: 'https://cdn.example.com/w1.mp4' },
    thumbnailUrl: 'https://cdn.example.com/w0.jpg'
  }));
  eq(urls(out).length, 4);
});

console.log('Reddit JSON parsing:');
t('image post', () => {
  const out = newOut();
  parseRedditPost(out, {
    title: 'Nice pic',
    post_hint: 'image',
    preview: { images: [{ source: { url: 'https://preview.redd.it/abc123.jpg?width=640&amp;auto=webp', width: 640, height: 480 } }] }
  });
  eq(out.title, 'Nice pic');
  eq(urls(out).length, 1);
  ok(urls(out)[0].includes('preview.redd.it/abc123'), urls(out)[0]);
});
t('gallery post', () => {
  const out = newOut();
  parseRedditPost(out, {
    title: 'Gallery',
    media_metadata: {
      a: { m: 'image/jpeg', s: { u: 'https://preview.redd.it/g1.jpg?width=1080', x: 1080, y: 720 } },
      b: { m: 'image/jpeg', s: { u: 'https://preview.redd.it/g2.jpg?width=1080', x: 1080, y: 720 } }
    }
  });
  eq(urls(out).length, 2);
});
t('video post (fallback + hls + thumb)', () => {
  const out = newOut();
  parseRedditPost(out, {
    title: 'Video',
    is_video: true,
    preview: { images: [{ source: { url: 'https://preview.redd.it/v1.jpg?width=640', width: 640, height: 360 } }] },
    media: {
      reddit_video: {
        fallback_url: 'https://v.redd.it/v1/DASH_720.mp4?source=fallback',
        hls_url: 'https://v.redd.it/v1/HLSPlaylist.m3u8',
        width: 1280, height: 720
      }
    }
  });
  const kinds = out.items.map((i) => i.kind).sort();
  eq(kinds, ['hls', 'video']);
  const vid = out.items.find((i) => i.kind === 'video');
  ok(vid.thumb && vid.thumb.includes('preview.redd.it'), 'no thumb');
});
t('crosspost recurses', () => {
  const out = newOut();
  parseRedditPost(out, {
    title: 'Crosspost',
    crosspost_parent_list: [{
      post_hint: 'image',
      preview: { images: [{ source: { url: 'https://preview.redd.it/orig1.jpg?width=1000', width: 1000, height: 1000 } }] }
    }]
  });
  eq(urls(out).length, 1);
  ok(urls(out)[0].includes('orig1'), urls(out)[0]);
});
t('external media link', () => {
  const out = newOut();
  parseRedditPost(out, { title: 'Link', url_overridden_by_dest: 'https://i.imgur.com/abc123.png' });
  eq(urls(out).length, 1);
});

console.log('TikTok state walk:');
t('playAddr / cover found in deep JSON', () => {
  const out = newOut();
  walkTikTok(out, {
    ItemModule: { abc: { video: { playAddr: 'https://v16.tiktokcdn.com/video/abc.mp4', cover: 'https://p16.tiktokcdn.com/img/abc.jpeg' } } }
  }, new Set());
  const kinds = out.items.map((i) => i.kind).sort();
  eq(kinds, ['image', 'video']);
});
t('tiktokFromHtml parses __UNIVERSAL_DATA__', () => {
  const out = newOut();
  const payload = JSON.stringify({ default: { video: { playAddr: 'https://v16.tiktokcdn.com/x.mp4' } } });
  const html = '<html><script id="__UNIVERSAL_DATA__" type="application/json">' + payload + '</script></html>';
  tiktokFromHtml(out, html);
  eq(urls(out).length, 1);
});

console.log('Decoding:');
t('decodeEntities handles &amp; and \\u0026', () => {
  eq(decodeEntities('https://a.com/x.jpg?width=640&amp;auto=webp'), 'https://a.com/x.jpg?width=640&auto=webp');
  eq(decodeEntities('https://a.com/x.jpg?a\\u0026b'), 'https://a.com/x.jpg?a&b');
});

console.log('SSRF guard:');
t('private IPv4 blocked', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.9', '169.254.1.1', '0.0.0.0', '100.64.0.1']) {
    if (!isPrivateIp(ip)) throw new Error(ip + ' not flagged');
  }
});
t('private IPv6 blocked', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1']) {
    if (!isPrivateIp(ip)) throw new Error(ip + ' not flagged');
  }
});
t('localhost variants rejected', async () => {
  for (const h of ['localhost', 'x.localhost', 'x.local', 'x.internal']) {
    let threw = false;
    try { await assertPublicHost(h); } catch (e) { threw = true; }
    if (!threw) throw new Error(h + ' not rejected');
  }
});
t('public host passes', async () => {
  await assertPublicHost('example.com');
  await assertPublicHost('www.reddit.com');
});

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
