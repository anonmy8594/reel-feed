/* Reel Feed: cleaning links on the way in.
   Every saved video becomes one record with one clean id, because everything later (dedupe, players, the future
   iPhone app's import) depends on it. Tracking codes are dropped because they identify who shared the video.
   Only official lookups are used: TikTok's oEmbed for short links, YouTube's oEmbed to see whether a video is gone.
   No other redirect is followed. Works in the browser (window.ReelLinks) and in Node (require) for the tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReelLinks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PLATFORMS = ['tiktok', 'youtube', 'instagram', 'snapchat'];
  // Strict id patterns: an id later goes into a player's address, so nothing else may get through.
  const ID_OK = {
    tiktok: /^\d{6,25}$/,
    youtube: /^[\w-]{11}$/,
    instagram: /^[\w-]{5,40}$/,
    snapchat: /^[\w-]{20,200}$/,
  };
  const SHORT_OK = /^[\w-]{4,40}$/;
  const HANDLE_OK = /^[\w.]{1,40}$/;

  // Query parameters that only say who shared, from where, or on which device. Anything starting utm_ goes too.
  const TRACKING = new Set([
    // YouTube
    'si', 'is', 'feature', 'pp', 'ab_channel', 'embeds_referring_euri', 'source_ve_path',
    // Instagram / Meta
    'igsh', 'igshid', 'obrf', 'fbclid', 'mibextid', 'ig_rid', 'ig_mid',
    // TikTok
    '_t', '_r', '_d', 'is_from_webapp', 'sender_device', 'sender_web_id', 'is_copy_url', 'share_app_id',
    'share_link_id', 'share_item_id', 'share_author_id', 'share_region', 'share_iid', 'social_share_type',
    'source', 'tt_from', 'u_code', 'user_id', 'sec_user_id', 'sec_uid', 'timestamp', 'checksum', 'web_id',
    'preview_pb', 'enter_from', 'refer', 'ug_btm', 'ugbiz_name', 'item_author_type', 'embed_source',
    // Snapchat and general
    'sc_referrer', 'sc_ua', 'share_id', 'locale', 'gclid', 'ref', 'ref_src',
  ]);

  /* The first link in a piece of pasted text (TikTok's Copy link sometimes adds words around it). */
  function extractUrl(text) {
    const s = String(text == null ? '' : text);
    let m = s.match(/https?:\/\/[^\s<>"'`]+/i);
    if (!m) m = s.match(/(?:^|[\s(])((?:[\w-]+\.)*(?:tiktok\.com|youtube\.com|youtu\.be|instagram\.com|snapchat\.com)\/[^\s<>"'`]*)/i);
    if (!m) return null;
    let u = m[1] || m[0];
    u = u.replace(/[).,!?;:'"\]]+$/, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function hostIs(host, domain) { return host === domain || host.endsWith('.' + domain); }

  function detectPlatform(text) {
    const raw = extractUrl(text);
    if (!raw) return null;
    let u;
    try { u = new URL(raw); } catch (e) { return null; }
    const h = u.hostname.toLowerCase();
    if (hostIs(h, 'tiktok.com')) return 'tiktok';
    if (hostIs(h, 'youtube.com') || h === 'youtu.be' || hostIs(h, 'youtube-nocookie.com')) return 'youtube';
    if (hostIs(h, 'instagram.com')) return 'instagram';
    if (hostIs(h, 'snapchat.com')) return 'snapchat';
    return null;
  }

  /* Drop tracking parameters and the #fragment. Returns the cleaned address, or null if it is not a web address. */
  function stripTracking(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    for (const k of Array.from(u.searchParams.keys())) {
      if (TRACKING.has(k.toLowerCase()) || /^utm_/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.href.replace(/\?$/, '');
  }

  function canonicalUrl(platform, videoId, opts) {
    const o = opts || {};
    if (platform === 'tiktok') return 'https://www.tiktok.com/@' + (o.handle && HANDLE_OK.test(o.handle) ? o.handle : '') + '/video/' + videoId;
    if (platform === 'youtube') return o.kind === 'watch' ? 'https://www.youtube.com/watch?v=' + videoId : 'https://www.youtube.com/shorts/' + videoId;
    if (platform === 'instagram') return 'https://www.instagram.com/' + (o.kind === 'p' ? 'p' : 'reel') + '/' + videoId + '/';
    if (platform === 'snapchat') return 'https://www.snapchat.com/spotlight/' + videoId;
    return null;
  }

  function ok(platform, videoId, opts) {
    if (!ID_OK[platform] || !ID_OK[platform].test(videoId)) return null;
    const o = opts || {};
    return { platform, videoId, url: canonicalUrl(platform, videoId, o), handle: o.handle || null };
  }

  /* Read a link into { platform, videoId, url } (ready), { platform, short } (a TikTok short link to resolve),
     { platform, unresolvable: true } (a share link only a server or app could follow), or null (not a video link). */
  function parseLink(text) {
    const raw = extractUrl(text);
    if (!raw) return null;
    const clean = stripTracking(raw);
    if (!clean) return null;
    const u = new URL(clean);
    const h = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    let m;

    if (hostIs(h, 'tiktok.com')) {
      if (h === 'vm.tiktok.com' || h === 'vt.tiktok.com') {
        return parts[0] && SHORT_OK.test(parts[0]) ? { platform: 'tiktok', short: 'https://' + h + '/' + parts[0] + '/' } : null;
      }
      if (parts[0] === 't' && parts[1] && SHORT_OK.test(parts[1])) return { platform: 'tiktok', short: 'https://www.tiktok.com/t/' + parts[1] + '/' };
      if (parts[0] && parts[0][0] === '@' && (parts[1] === 'video' || parts[1] === 'photo') && parts[2]) {
        const handle = parts[0].slice(1);
        return ok('tiktok', parts[2], { handle: HANDLE_OK.test(handle) ? handle : null });
      }
      if (parts[0] === 'embed' && parts[1] === 'v2' && parts[2]) return ok('tiktok', parts[2]);
      if ((parts[0] === 'embed' || parts[0] === 'video') && parts[1]) return ok('tiktok', parts[1]);
      if (parts[0] === 'player' && parts[1] === 'v1' && parts[2]) return ok('tiktok', parts[2]);
      if (parts[0] === 'v' && parts[1] && (m = parts[1].match(/^(\d{6,25})(?:\.html)?$/))) return ok('tiktok', m[1]);
      return null;
    }

    if (hostIs(h, 'youtube.com') || h === 'youtu.be' || hostIs(h, 'youtube-nocookie.com')) {
      if (h === 'youtu.be') return parts[0] ? ok('youtube', parts[0], { kind: 'watch' }) : null;
      if (parts[0] === 'shorts' && parts[1]) return ok('youtube', parts[1], { kind: 'shorts' });
      if (parts[0] === 'watch') { const v = u.searchParams.get('v'); return v ? ok('youtube', v, { kind: 'watch' }) : null; }
      if ((parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') && parts[1]) return ok('youtube', parts[1], { kind: 'watch' });
      return null;
    }

    if (hostIs(h, 'instagram.com')) {
      if (parts[0] === 'share') return { platform: 'instagram', unresolvable: true };
      const i = ['reel', 'reels', 'p', 'tv'].includes(parts[0]) ? 0 : ['reel', 'reels', 'p', 'tv'].includes(parts[1]) ? 1 : -1;
      if (i < 0 || !parts[i + 1]) return null;
      const kind = parts[i] === 'p' || parts[i] === 'tv' ? 'p' : 'reel';
      return ok('instagram', parts[i + 1], { kind });
    }

    if (hostIs(h, 'snapchat.com')) {
      if (parts[0] === 't') return { platform: 'snapchat', unresolvable: true };
      const i = parts.indexOf('spotlight');
      if (i >= 0 && i <= 1 && parts[i + 1]) return ok('snapchat', parts[i + 1]);
      return null;
    }
    return null;
  }

  /* TikTok short links carry no video id; TikTok's own oEmbed lookup is the official way to get it. */
  async function resolveTikTokShort(shortUrl, fetchFn, retryDelay) {
    let r;
    const ask = () => fetchFn('https://www.tiktok.com/oembed?url=' + encodeURIComponent(shortUrl), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    // One retry: a dropped request, a rate limit (429) or a server error often clears. (TikTok's 4xx replies carry no
    // CORS header, so in a browser a dead link also throws here and fails twice.)
    const again = () => new Promise(res => setTimeout(res, retryDelay == null ? 900 : retryDelay));
    try { r = await ask(); } catch (e) { r = null; }
    if (!r || r.status === 429 || r.status >= 500) {
      await again();
      try { r = await ask(); } catch (e2) { return { status: 'offline' }; }
    }
    if (!r.ok) return { status: r.status >= 400 && r.status < 500 && r.status !== 429 ? 'dead' : 'offline' };
    let j;
    try { j = await r.json(); } catch (e) { return { status: 'dead' }; }
    const id = String((j && j.embed_product_id) || '');
    if (!ID_OK.tiktok.test(id)) return { status: 'dead' };
    const meta = {};
    if (j.title) meta.title = String(j.title).slice(0, 300);
    if (j.author_name) meta.author = String(j.author_name).slice(0, 80);
    return { status: 'ok', id, meta };
  }

  /* YouTube's oEmbed answers 404 for a removed video and 401/403 for a private one or one barred from playing
     elsewhere. Any other failure (offline) is not held against the link: it is saved without a title. */
  async function checkYouTube(url, fetchFn) {
    let r;
    try {
      r = await fetchFn('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) { return { status: 'unknown', meta: {} }; }
    if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404) return { status: 'dead' };
    if (!r.ok) return { status: 'unknown', meta: {} };
    let j;
    try { j = await r.json(); } catch (e) { return { status: 'unknown', meta: {} }; }
    const meta = {};
    if (j && j.title) meta.title = String(j.title).slice(0, 300);
    if (j && j.author_name) meta.author = String(j.author_name).slice(0, 80);
    return { status: 'ok', meta };
  }

  function makeRecord(p, now, sender) {
    return {
      url: p.url,
      platform: p.platform,
      videoId: p.videoId,
      savedAt: new Date(now == null ? Date.now() : now).toISOString(),
      watched: false,
      sender: typeof sender === 'string' && sender.trim() ? sender.trim().slice(0, 80) : null,
    };
  }

  /* The whole way in. Result: { status: 'ok', record, meta } or { status: 'unsupported' | 'unresolvable' |
     'dead' | 'offline', platform? }. fetchFn is injected so the tests never touch the network. */
  async function cleanLink(text, opts) {
    const o = opts || {};
    const fetchFn = o.fetch || (typeof fetch === 'function' ? fetch : null);
    const p = parseLink(text);
    if (!p) return { status: 'unsupported' };
    if (p.unresolvable) return { status: 'unresolvable', platform: p.platform };
    let meta = {};
    let ready = p;
    if (p.short) {
      if (!fetchFn) return { status: 'offline', platform: 'tiktok' };
      const res = await resolveTikTokShort(p.short, fetchFn, o.retryDelay);
      if (res.status !== 'ok') return { status: res.status, platform: 'tiktok' };
      ready = ok('tiktok', res.id);
      meta = res.meta;
    } else if (p.platform === 'youtube' && fetchFn) {
      const res = await checkYouTube(p.url, fetchFn);
      if (res.status === 'dead') return { status: 'dead', platform: 'youtube' };
      meta = res.meta;
    }
    if (p.handle) meta.handle = p.handle;
    return { status: 'ok', record: makeRecord(ready, o.now, o.sender), meta };
  }

  const keyOf = r => r.platform + ':' + r.videoId;

  /* New records go first; a video already saved (same platform and id) is not added twice. */
  function addRecord(list, rec) {
    const k = keyOf(rec);
    const existing = list.find(r => keyOf(r) === k);
    if (existing) return { list, added: false, existing };
    return { list: [rec].concat(list), added: true, existing: null };
  }

  /* Feed order, a forward feed like TikTok's chat feed: watched videos above, then unwatched ones below, each in
     the order saved (oldest first). Scrolling down always moves toward newer, unwatched videos. */
  function sortRecords(list) {
    return list.slice().sort((a, b) => (Number(b.watched) - Number(a.watched)) || (Date.parse(a.savedAt) - Date.parse(b.savedAt)));
  }

  /* Where the feed opens: the first unwatched video, or the most recent one when everything is watched. */
  function startIndex(sorted) {
    const i = sorted.findIndex(r => !r.watched);
    return i >= 0 ? i : Math.max(0, sorted.length - 1);
  }

  /* Whatever comes back from storage (or a future import) is checked again before it can reach a player. */
  function sanitizeRecords(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [], seen = new Set();
    for (const r of arr) {
      if (!r || typeof r !== 'object' || !PLATFORMS.includes(r.platform)) continue;
      const id = String(r.videoId || '');
      if (!ID_OK[r.platform].test(id)) continue;
      const k = r.platform + ':' + id;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = Date.parse(r.savedAt);
      const url = typeof r.url === 'string' && /^https:\/\//.test(r.url) && detectPlatform(r.url) === r.platform ? r.url : canonicalUrl(r.platform, id);
      out.push({
        url,
        platform: r.platform,
        videoId: id,
        savedAt: Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString(),
        watched: r.watched === true,
        sender: typeof r.sender === 'string' && r.sender.trim() ? r.sender.trim().slice(0, 80) : null,
      });
    }
    return out;
  }

  return {
    PLATFORMS, ID_OK, TRACKING,
    extractUrl, detectPlatform, stripTracking, canonicalUrl, parseLink,
    resolveTikTokShort, checkYouTube, makeRecord, cleanLink,
    keyOf, addRecord, sortRecords, startIndex, sanitizeRecords,
  };
});
