"use strict";
// Reads the official record behind each live-stream market. Pure parsing
// functions are exported for tests; network access is injectable.
const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};
const HST_OFFSET_HOURS = 10; // UTC−10, no daylight saving.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function noticeText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(
        code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code),
      ),
    )
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}
const TIME_RE =
  /\b(?:(noon|midnight)|(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?|(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?))(?:\s*HST)?/i;
const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i;
const VERB_RE = /\b(began|started|commenced)\b/i;
function clock(match) {
  if (match[1]) return match[1].toLowerCase() === "noon" ? [12, 0] : [0, 0];
  let hour = Number(match[2] ?? match[5]),
    minute = Number(match[3] ?? 0);
  const meridiem = (match[4] || match[6] || "").replace(/[\s.]/g, "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}
// Finds "Episode N … began/started at HH:MM HST on Month D, YYYY" statements.
function parseEpisodeStarts(text, sentUtcMs) {
  const results = [];
  const sent = new Date(sentUtcMs);
  const re = /\b[Ee]pisode\s+(\d{1,3})\b/g;
  let m;
  while ((m = re.exec(text))) {
    const episode = Number(m[1]);
    const snippet = text.slice(m.index, m.index + 260);
    const verb = VERB_RE.exec(snippet);
    if (!verb) continue;
    // "Episode 53 Chronology: … episode 54 … began" belongs to the later mention.
    if (/\b[Ee]pisode\s+\d{1,3}\b/.test(snippet.slice(m[0].length, verb.index))) continue;
    const after = snippet.slice(verb.index + verb[0].length);
    const time = TIME_RE.exec(after.slice(0, 90));
    if (!time) continue;
    const hm = clock(time);
    if (!hm) continue;
    const dateAfter = DATE_RE.exec(after);
    const date = dateAfter || DATE_RE.exec(snippet);
    if (!date) continue;
    let year = date[3] ? Number(date[3]) : sent.getUTCFullYear();
    const month = MONTHS[date[1].toLowerCase()];
    let day = Number(date[2]);
    // "began around 3:45 p.m. HST and ended at 1:23 a.m. HST on August 13":
    // the only date belongs to the end of an overnight episode.
    const ended = /\b(ended|stopped|ceased)\b/i.exec(after);
    if (ended && dateAfter && dateAfter.index > ended.index) {
      const endTime = TIME_RE.exec(after.slice(ended.index, date.index));
      const endHm = endTime && clock(endTime);
      if (endHm && endHm[0] * 60 + endHm[1] < hm[0] * 60 + hm[1]) day -= 1;
    }
    let when = Date.UTC(year, month, day, hm[0] + HST_OFFSET_HOURS, hm[1]);
    if (!date[3] && when > sentUtcMs + 2 * 86400000)
      when = Date.UTC(--year, month, day, hm[0] + HST_OFFSET_HOURS, hm[1]);
    if (when > sentUtcMs + 86400000 || when < sentUtcMs - 120 * 86400000) continue;
    if (results.some((r) => r.episode === episode)) continue;
    results.push({
      episode,
      time: when,
      snippet: snippet.slice(0, verb.index + verb[0].length + date.index + date[0].length + 1).trim(),
    });
  }
  return results;
}
const signal = (ms) =>
  typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
async function getJson(fetchImpl, url, ms = 9000) {
  const response = await fetchImpl(url, {
    signal: signal(ms),
    headers: { Accept: "application/json", "User-Agent": "Hypothesis science market (jianou.works@gmail.com)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}
async function resolveShortLink(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      method: "HEAD",
      redirect: "manual",
      signal: signal(6000),
    });
    const location = response.headers.get("location") || "";
    const id = /[?&]v=([\w-]{6,})/.exec(location)?.[1] || /youtu\.be\/([\w-]{6,})/.exec(location)?.[1];
    return id || null;
  } catch {
    return null;
  }
}
// One observation of the official record for a definition. `previousMeta`
// carries parsed notices so each notice is fetched once.
async function fetchObservation(def, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const now = options.now ? options.now() : Date.now();
  const src = def.source;
  const notices = { ...(options.previousMeta?.notices || {}) };
  const streams = { ...(options.previousMeta?.streams || {}) };
  const observation = { at: now, source: src.name, ok: false, error: null, events: [], meta: null };
  try {
    const list = await getJson(fetchImpl, src.feedUrl);
    if (!Array.isArray(list)) throw new Error("Unexpected notice list.");
    const mine = list.filter(
      (n) =>
        n &&
        n.obs_abbr === src.observatory &&
        String(n.volcano_cds_csv || "").split(",").includes(src.volcano) &&
        typeof n.notice_identifier === "string",
    );
    let failures = 0,
      fetched = 0,
      deferred = 0;
    const maxNotices = options.maxNotices ?? 25;
    for (const n of mine.slice().sort((a, b) => b.sent_unixtime - a.sent_unixtime)) {
      if (notices[n.notice_identifier]) continue;
      if (fetched >= maxNotices) {
        deferred++;
        continue;
      }
      fetched++;
      try {
        const notice = await getJson(fetchImpl, src.noticeUrl + encodeURIComponent(n.notice_identifier));
        const sentMs = Number(notice.sent_unixtime) * 1000 || Date.parse(String(notice.sent_utc).replace(" ", "T") + "Z") || Number(n.sent_unixtime) * 1000;
        const starts = parseEpisodeStarts(noticeText(notice.notice_html), sentMs);
        notices[n.notice_identifier] = {
          sent: sentMs,
          type: notice.notice_type_cd || n.notice_type_cd,
          url: n.notice_url,
          starts: starts.map((s) => ({ episode: s.episode, time: s.time, snippet: s.snippet.slice(0, 200) })),
        };
      } catch {
        failures++;
      }
    }
    if (failures) throw new Error(`${failures} notice${failures > 1 ? "s" : ""} could not be read.`);
    if (deferred) throw new Error(`Catching up: ${deferred} older notice${deferred > 1 ? "s" : ""} still to read.`);
    const ids = Object.keys(notices).sort((a, b) => notices[b].sent - notices[a].sent).slice(0, 80);
    for (const id of Object.keys(notices)) if (!ids.includes(id)) delete notices[id];
    // Earliest-issued notice wins for each episode number.
    const byEpisode = new Map();
    for (const id of ids.slice().reverse())
      for (const s of notices[id].starts)
        if (!byEpisode.has(s.episode))
          byEpisode.set(s.episode, {
            id: `episode-${s.episode}`,
            time: s.time,
            label: `Episode ${s.episode} lava fountaining began`,
            detail: `HVO: ${s.snippet}`,
            url: notices[id].url,
          });
    const seeds = (def.seedEvents || []).filter((e) => !byEpisode.has(Number(e.id.split("-")[1])));
    observation.events = [...seeds, ...byEpisode.values()].sort((a, b) => a.time - b.time);
    observation.ok = true;
    const newest = mine.slice().sort((a, b) => b.sent_unixtime - a.sent_unixtime)[0];
    observation.meta = {
      notices,
      streams,
      newest: newest
        ? { id: newest.notice_identifier, type: newest.notice_type_cd, sent: Number(newest.sent_unixtime) * 1000, url: newest.notice_url }
        : options.previousMeta?.newest || null,
      noticeCount: mine.length,
    };
  } catch (error) {
    observation.error = error?.message || "Could not read the official record.";
  }
  // Camera video ids change when a stream restarts; re-resolve them a few
  // times a day from the official short links.
  const streamsAt = Number(options.previousMeta?.streamsAt) || 0;
  if (
    def.stream?.cameras &&
    options.resolveStreams !== false &&
    now - streamsAt >= (options.streamsEveryMs ?? 6 * 3600000)
  ) {
    for (const camera of def.stream.cameras) {
      if (!camera.short) continue;
      const id = await resolveShortLink(fetchImpl, camera.short);
      if (id) streams[camera.id] = id;
    }
    observation.meta = { ...(observation.meta || options.previousMeta || {}), streams, streamsAt: now };
  } else if (observation.meta) {
    observation.meta.streams = streams;
    observation.meta.streamsAt = streamsAt;
  }
  return observation;
}
module.exports = { noticeText, parseEpisodeStarts, fetchObservation, resolveShortLink };
