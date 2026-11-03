// Unit tests for links.js. Run from the app folder: node --test
// No test touches the network: every oEmbed lookup goes through a stubbed fetch.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../links.js');

const TT_ID = '7698777733794483469';
const YT_ID = '-62C9R_41Sc';
const IG_CODE = 'DDzcSlMOlEZ';
const SNAP_ID = 'W7_EDlXWTBiXAEEniNoMPwAAYeGhodnZnbHpmAaFcKWFGAaFcKRbGAAAAAQ';

// A fetch stand-in: records every address asked for and answers from a table (status + JSON body).
function stubFetch(table) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [match, res] of table) {
      if (url.includes(match)) {
        if (res === 'throw') throw new TypeError('Failed to fetch');
        return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body };
      }
    }
    throw new Error('unexpected fetch ' + url);
  };
  fn.calls = calls;
  return fn;
}
const noFetch = async (url) => { throw new Error('network used: ' + url); };

/* ---------- platform detection ---------- */
test('detects each platform and rejects look-alike hosts', () => {
  assert.equal(L.detectPlatform('https://www.tiktok.com/@a/video/' + TT_ID), 'tiktok');
  assert.equal(L.detectPlatform('https://vm.tiktok.com/ZMabc123/'), 'tiktok');
  assert.equal(L.detectPlatform('https://youtu.be/' + YT_ID), 'youtube');
  assert.equal(L.detectPlatform('https://m.youtube.com/shorts/' + YT_ID), 'youtube');
  assert.equal(L.detectPlatform('https://www.instagram.com/reel/' + IG_CODE + '/'), 'instagram');
  assert.equal(L.detectPlatform('https://www.snapchat.com/spotlight/' + SNAP_ID), 'snapchat');
  assert.equal(L.detectPlatform('https://eviltiktok.com/@a/video/' + TT_ID), null);
  assert.equal(L.detectPlatform('https://tiktok.com.evil.net/@a/video/' + TT_ID), null);
  assert.equal(L.detectPlatform('https://example.com/watch?v=' + YT_ID), null);
  assert.equal(L.detectPlatform('no link here'), null);
});

test('finds the link inside pasted text and drops trailing punctuation', () => {
  assert.equal(L.extractUrl('look at this https://vt.tiktok.com/ZSabc123/ lol'), 'https://vt.tiktok.com/ZSabc123/');
  assert.equal(L.extractUrl('(https://youtu.be/' + YT_ID + ').'), 'https://youtu.be/' + YT_ID);
  assert.equal(L.extractUrl('youtube.com/shorts/' + YT_ID), 'https://youtube.com/shorts/' + YT_ID);
  assert.equal(L.extractUrl(''), null);
  assert.equal(L.extractUrl(null), null);
});

/* ---------- TikTok ---------- */
test('TikTok full links give the id and keep the handle', () => {
  const p = L.parseLink('https://www.tiktok.com/@duolingo/video/' + TT_ID + '?is_from_webapp=1&sender_device=pc&_t=8abc&_r=1');
  assert.deepEqual(p, { platform: 'tiktok', videoId: TT_ID, url: 'https://www.tiktok.com/@duolingo/video/' + TT_ID, handle: 'duolingo' });
  assert.equal(L.parseLink('https://m.tiktok.com/@x.y/photo/' + TT_ID).videoId, TT_ID);
  assert.equal(L.parseLink('https://www.tiktok.com/embed/v2/' + TT_ID).videoId, TT_ID);
  assert.equal(L.parseLink('https://www.tiktok.com/player/v1/' + TT_ID + '?autoplay=1').videoId, TT_ID);
  assert.equal(L.parseLink('https://m.tiktok.com/v/' + TT_ID + '.html').videoId, TT_ID);
});

test('TikTok short links are marked for lookup, in all three forms', () => {
  assert.deepEqual(L.parseLink('https://vm.tiktok.com/ZMabc123/?_t=x'), { platform: 'tiktok', short: 'https://vm.tiktok.com/ZMabc123/' });
  assert.deepEqual(L.parseLink('https://vt.tiktok.com/ZSabc123'), { platform: 'tiktok', short: 'https://vt.tiktok.com/ZSabc123/' });
  assert.deepEqual(L.parseLink('https://www.tiktok.com/t/ZTfksoXuV/?_r=1'), { platform: 'tiktok', short: 'https://www.tiktok.com/t/ZTfksoXuV/' });
});

test('TikTok profile links and bad ids are not videos', () => {
  assert.equal(L.parseLink('https://www.tiktok.com/@duolingo'), null);
  assert.equal(L.parseLink('https://www.tiktok.com/@duolingo/video/12ab'), null);
  assert.equal(L.parseLink('https://www.tiktok.com/@duolingo/video/"><script>'), null);
});

test('a TikTok short link resolves through oEmbed to a clean record', async () => {
  const f = stubFetch([['tiktok.com/oembed', { status: 200, body: { embed_product_id: TT_ID } }]]);
  const res = await L.cleanLink('https://vt.tiktok.com/ZSabc123/?_t=8xyz&_r=1', { fetch: f, now: Date.UTC(2026, 10, 2, 20, 0, 0) });
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.record, {
    url: 'https://www.tiktok.com/@/video/' + TT_ID, platform: 'tiktok', videoId: TT_ID,
    savedAt: '2026-11-02T20:00:00.000Z', watched: false, sender: null,
  });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0], 'https://www.tiktok.com/oembed?url=' + encodeURIComponent('https://vt.tiktok.com/ZSabc123/'));
});

test('a dead TikTok short link is reported as dead, a failed lookup as offline', async () => {
  const dead = stubFetch([['tiktok.com/oembed', { status: 400, body: {} }]]);
  assert.deepEqual(await L.cleanLink('https://vm.tiktok.com/ZMdead00/', { fetch: dead }), { status: 'dead', platform: 'tiktok' });
  const noId = stubFetch([['tiktok.com/oembed', { status: 200, body: { title: 'x' } }]]);
  assert.equal((await L.cleanLink('https://vm.tiktok.com/ZMdead00/', { fetch: noId })).status, 'dead');
  const off = stubFetch([['tiktok.com/oembed', 'throw']]);
  assert.equal((await L.cleanLink('https://vm.tiktok.com/ZMabc123/', { fetch: off })).status, 'offline');
  const busy = stubFetch([['tiktok.com/oembed', { status: 429, body: {} }]]);
  assert.equal((await L.cleanLink('https://vm.tiktok.com/ZMabc123/', { fetch: busy })).status, 'offline');
});

test('a full TikTok link needs no lookup', async () => {
  const res = await L.cleanLink('https://www.tiktok.com/@duolingo/video/' + TT_ID + '?is_from_webapp=1', { fetch: noFetch });
  assert.equal(res.status, 'ok');
  assert.equal(res.record.url, 'https://www.tiktok.com/@duolingo/video/' + TT_ID);
  assert.equal(res.meta.handle, 'duolingo');
});

/* ---------- YouTube ---------- */
test('YouTube Shorts, watch, youtu.be, embed and live links give the 11-character id', () => {
  assert.deepEqual(L.parseLink('https://youtube.com/shorts/' + YT_ID + '?si=AbCdEf123&feature=share'),
    { platform: 'youtube', videoId: YT_ID, url: 'https://www.youtube.com/shorts/' + YT_ID, handle: null });
  assert.equal(L.parseLink('https://www.youtube.com/watch?v=' + YT_ID + '&t=5s&pp=ygU').url, 'https://www.youtube.com/watch?v=' + YT_ID);
  assert.equal(L.parseLink('https://youtu.be/' + YT_ID + '?si=xyz&is=abc').videoId, YT_ID);
  assert.equal(L.parseLink('https://www.youtube-nocookie.com/embed/' + YT_ID).videoId, YT_ID);
  assert.equal(L.parseLink('https://www.youtube.com/live/' + YT_ID).videoId, YT_ID);
  assert.equal(L.parseLink('https://www.youtube.com/@NASA'), null);
  assert.equal(L.parseLink('https://www.youtube.com/shorts/tooshort'), null);
});

test('YouTube: oEmbed 404 means dead, a title comes back otherwise, offline still saves', async () => {
  const live = stubFetch([['youtube.com/oembed', { status: 200, body: { title: 'From the Moon to the 50-Yard Line', author_name: 'NASA' } }]]);
  const res = await L.cleanLink('https://youtube.com/shorts/' + YT_ID + '?si=abc', { fetch: live });
  assert.equal(res.status, 'ok');
  assert.equal(res.meta.title, 'From the Moon to the 50-Yard Line');
  assert.ok(live.calls[0].startsWith('https://www.youtube.com/oembed?format=json&url='));
  assert.ok(!live.calls[0].includes('si%3D'), 'tracking code must not reach the lookup');

  const gone = stubFetch([['youtube.com/oembed', { status: 404, body: null }]]);
  assert.deepEqual(await L.cleanLink('https://youtu.be/' + YT_ID, { fetch: gone }), { status: 'dead', platform: 'youtube' });
  const priv = stubFetch([['youtube.com/oembed', { status: 401, body: null }]]);
  assert.equal((await L.cleanLink('https://youtu.be/' + YT_ID, { fetch: priv })).status, 'dead');

  const off = stubFetch([['youtube.com/oembed', 'throw']]);
  const r2 = await L.cleanLink('https://youtu.be/' + YT_ID, { fetch: off });
  assert.equal(r2.status, 'ok');
  assert.equal(r2.record.videoId, YT_ID);
});

/* ---------- Instagram ---------- */
test('Instagram reel, reels, post, tv and user-prefixed links give the code', () => {
  assert.deepEqual(L.parseLink('https://www.instagram.com/reel/' + IG_CODE + '/?igsh=MWQ1ZGUxMzBkMA==&utm_source=ig_web_copy_link'),
    { platform: 'instagram', videoId: IG_CODE, url: 'https://www.instagram.com/reel/' + IG_CODE + '/', handle: null });
  assert.equal(L.parseLink('https://instagram.com/reels/' + IG_CODE).url, 'https://www.instagram.com/reel/' + IG_CODE + '/');
  assert.equal(L.parseLink('https://www.instagram.com/p/' + IG_CODE + '/?igshid=abc&obrf=xyz').url, 'https://www.instagram.com/p/' + IG_CODE + '/');
  assert.equal(L.parseLink('https://www.instagram.com/tv/' + IG_CODE + '/').url, 'https://www.instagram.com/p/' + IG_CODE + '/');
  assert.equal(L.parseLink('https://www.instagram.com/somebody/reel/' + IG_CODE + '/').videoId, IG_CODE);
  assert.equal(L.parseLink('https://www.instagram.com/somebody/'), null);
});

test('Instagram share links cannot be followed here', async () => {
  assert.deepEqual(L.parseLink('https://www.instagram.com/share/reel/BAabc123'), { platform: 'instagram', unresolvable: true });
  assert.deepEqual(await L.cleanLink('https://www.instagram.com/share/reel/BAabc123', { fetch: noFetch }), { status: 'unresolvable', platform: 'instagram' });
});

/* ---------- Snapchat ---------- */
test('Snapchat Spotlight links give the id; /t/ share links cannot be followed here', async () => {
  assert.deepEqual(L.parseLink('https://www.snapchat.com/spotlight/' + SNAP_ID + '?share_id=abc&locale=en-GB'),
    { platform: 'snapchat', videoId: SNAP_ID, url: 'https://www.snapchat.com/spotlight/' + SNAP_ID, handle: null });
  assert.equal(L.parseLink('https://www.snapchat.com/@someone/spotlight/' + SNAP_ID).videoId, SNAP_ID);
  assert.deepEqual(L.parseLink('https://snapchat.com/t/AbCdEf12'), { platform: 'snapchat', unresolvable: true });
  assert.equal((await L.cleanLink('https://snapchat.com/t/AbCdEf12', { fetch: noFetch })).status, 'unresolvable');
  assert.equal(L.parseLink('https://www.snapchat.com/add/someone'), null);
});

/* ---------- tracking codes ---------- */
test('stripTracking drops every known tracking code and keeps what matters', () => {
  assert.equal(L.stripTracking('https://www.youtube.com/watch?v=' + YT_ID + '&si=a&is=b&feature=c&pp=d'), 'https://www.youtube.com/watch?v=' + YT_ID);
  assert.equal(L.stripTracking('https://www.instagram.com/reel/X/?igsh=a&igshid=b&obrf=c&utm_source=d&utm_medium=e&UTM_campaign=f'), 'https://www.instagram.com/reel/X/');
  assert.equal(L.stripTracking('https://www.tiktok.com/@a/video/1?_t=a&_r=1&is_from_webapp=1&sender_device=pc&sender_web_id=9&share_app_id=1233'), 'https://www.tiktok.com/@a/video/1');
  assert.equal(L.stripTracking('https://example.com/a?keep=1&si=x#frag'), 'https://example.com/a?keep=1');
  assert.equal(L.stripTracking('javascript:alert(1)'), null);
  assert.equal(L.stripTracking('not a url'), null);
});

/* ---------- unsupported ---------- */
test('unsupported links and junk are rejected without any lookup', async () => {
  for (const t of ['https://example.com/video/123', 'https://twitter.com/x/status/1', 'hello', '', 'ftp://tiktok.com/@a/video/' + TT_ID]) {
    assert.deepEqual(await L.cleanLink(t, { fetch: noFetch }), { status: 'unsupported' }, t);
  }
});

/* ---------- records, dedupe, order ---------- */
test('the record shape is exactly url, platform, videoId, savedAt, watched, sender', async () => {
  const res = await L.cleanLink('https://www.instagram.com/reel/' + IG_CODE + '/', { fetch: noFetch, now: 0, sender: '  Maya ' });
  assert.deepEqual(Object.keys(res.record), ['url', 'platform', 'videoId', 'savedAt', 'watched', 'sender']);
  assert.equal(res.record.sender, 'Maya');
  assert.equal(res.record.savedAt, '1970-01-01T00:00:00.000Z');
});

test('dedupe key is platform plus id, whatever the link looked like', async () => {
  // noFetch throws inside checkYouTube's try, which counts as offline and still saves
  const a = await L.cleanLink('https://youtube.com/shorts/' + YT_ID + '?si=1', { fetch: noFetch });
  assert.equal(a.status, 'ok');
  const b = await L.cleanLink('https://youtu.be/' + YT_ID + '?si=2', { fetch: noFetch });
  assert.equal(L.keyOf(a.record), 'youtube:' + YT_ID);
  assert.equal(L.keyOf(a.record), L.keyOf(b.record));
  const first = L.addRecord([], a.record);
  assert.equal(first.added, true);
  const second = L.addRecord(first.list, b.record);
  assert.equal(second.added, false);
  assert.equal(second.list.length, 1);
  assert.equal(second.existing, a.record);
  // same id on another platform is a different video
  const other = { ...a.record, platform: 'instagram', videoId: 'ABCDEFGHIJK' };
  assert.notEqual(L.keyOf(other), L.keyOf(a.record));
});

test('order: unwatched first, newest first within each', () => {
  const r = (id, day, watched) => ({ url: 'u', platform: 'tiktok', videoId: id, savedAt: `2026-11-0${day}T10:00:00.000Z`, watched, sender: null });
  const sorted = L.sortRecords([r('1000001', 1, false), r('1000002', 3, true), r('1000003', 2, false), r('1000004', 4, true)]);
  assert.deepEqual(sorted.map(x => x.videoId), ['1000003', '1000001', '1000004', '1000002']);
});

test('records read back from storage are re-checked', () => {
  const good = { url: 'https://www.youtube.com/shorts/' + YT_ID, platform: 'youtube', videoId: YT_ID, savedAt: '2026-11-02T10:00:00.000Z', watched: true, sender: null };
  const out = L.sanitizeRecords([
    good,
    { ...good },                                                     // duplicate
    { ...good, videoId: 'bad"><img>' },                              // unsafe id
    { ...good, platform: 'vimeo' },                                  // unknown platform
    null, 'x',
    { url: 'javascript:alert(1)', platform: 'tiktok', videoId: TT_ID, savedAt: 'nope', watched: 'yes', sender: 5 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], good);
  assert.deepEqual(out[1], { url: 'https://www.tiktok.com/@/video/' + TT_ID, platform: 'tiktok', videoId: TT_ID, savedAt: '1970-01-01T00:00:00.000Z', watched: false, sender: null });
  assert.deepEqual(L.sanitizeRecords('garbage'), []);
});

test('pasted text with words around the link, or a link without https, still works', async () => {
  const f = stubFetch([['tiktok.com/oembed', { status: 200, body: { embed_product_id: TT_ID } }]]);
  const a = await L.cleanLink('Watch this https://youtu.be/' + YT_ID + '?si=abc 😂', { fetch: noFetch });
  assert.equal(a.status, 'ok');
  assert.equal(a.record.videoId, YT_ID);
  const b = await L.cleanLink('vm.tiktok.com/ZMabc123/', { fetch: f });
  assert.equal(b.status, 'ok');
  assert.equal(b.record.videoId, TT_ID);
  assert.equal(f.calls[0], 'https://www.tiktok.com/oembed?url=' + encodeURIComponent('https://vm.tiktok.com/ZMabc123/'));
  const c = await L.cleanLink('lol www.instagram.com/reel/' + IG_CODE + '/?igsh=x', { fetch: noFetch });
  assert.equal(c.record.url, 'https://www.instagram.com/reel/' + IG_CODE + '/');
});
