const HST = 10; // Hawaiʻi Standard Time is UTC−10 all year.
  const hst = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h + HST, min);
  const definitions = {
    kilauea: {
      id: "kilauea",
      title:
        "Will Kīlauea’s next lava fountaining episode begin before the deadline?",
      questionPrefix: "Will Kīlauea’s next lava fountaining episode begin before",
      short: "Kīlauea lava fountains",
      subject: "fluid",
      topic: "Volcanoes",
      eyebrow: "USGS HVO LIVE STREAM",
      subtitle:
        "A real volcano on a real camera. Trade the timing of the next official fountaining episode.",
      outcomes: ["Yes", "No"],
      eventNoun: "episode",
      priorIntervalDays: 14,
      schedule: { kind: "calendar", days: [1, 16], minDays: 7, zone: "UTC" },
      about:
        "Since 23 December 2024 Kīlauea has erupted in short, violent bursts from the north and south vents in Halemaʻumaʻu: lava fountains of 100–400 m that last under a day, separated by pauses of two weeks or more. Episode 54 ended on 25 August 2026. HVO reports the summit magma chamber is pressurized beyond its usual pre-fountain level, yet irregular ground deformation has stopped them forecasting when, or whether, episode 55 will start. The USGS Hawaiian Volcano Observatory streams the crater around the clock.",
      rule:
        "Yes resolves as soon as a USGS Hawaiian Volcano Observatory notice states that a numbered lava fountaining episode began at a time (HST) that falls inside this window, between the moment the window opened and the deadline. The time stated by HVO is used, not the time the notice was issued or the time the fountain appears on the stream. No resolves after the deadline, once this site has successfully checked the HVO notice feed at or after the deadline and found no such episode. An episode that began before the window opened does not count. Intrusions, overflows, spattering, or a new vent without a numbered fountaining episode do not count. If the official feed is discontinued or changes format, the owner may resolve or void the window from the published record, with a note shown on the page.",
      sourceNotes:
        "Settlement reads the USGS Hazard Notification System (HANS) public API: the list of recent notices is polled every few minutes and every new HVO notice for Kīlauea (volcano code hi3) is parsed for the phrase “Episode N … began/started at HH:MM HST on Month D”. Deadlines are at 00:00 UTC on the 1st and 16th of each month, at least seven days after a window opens. Earlier episode start times were seeded from the HVO status reports and activity notices for episodes 48–54.",
      modelNotes:
        "The bots quote a memoryless hazard: the chance of at least one episode before the deadline given the mean gap between recent official episodes. A better model would use the HVO daily update: summit tilt at the Uēkahuna tiltmeter (UWD) relative to the previous episode’s starting level, inflation rate, precursory north-vent overflows, tremor bursts, and whether the September–October 2026 intrusion changed the plumbing.",
      tip: "Windows last weeks, so the stream delay does not matter. The HVO daily update, not the camera, decides the result.",
      stream: {
        provider: "youtube",
        credit: "USGS Hawaiian Volcano Observatory",
        title: "Halemaʻumaʻu live cameras",
        url: "https://www.youtube.com/watch?v=HggWKlZv9yk",
        channel: "UCeXH8GZyV3sVqAr45AvupOA",
        cameras: [
          {
            id: "v1cam",
            label: "V1cam · west rim",
            video: "HggWKlZv9yk",
            short: "https://url.usgs.gov/v1cam",
          },
          {
            id: "v2cam",
            label: "V2cam · east rim",
            video: "f9-oSpYpubg",
            short: "https://url.usgs.gov/v2cam",
          },
          {
            id: "v3cam",
            label: "V3cam · south rim",
            video: "gXKuUyKt8mc",
            short: "https://url.usgs.gov/v3cam",
          },
        ],
        lagNote:
          "The stream runs tens of seconds to minutes behind real time, may show night views or weather, and restarts occasionally. The current video for each USGS camera is re-resolved from the official url.usgs.gov short links during every feed check.",
        note: "USGS public-domain live stream · delayed by the network · the official notice decides",
      },
      source: {
        name: "USGS HVO notices (HANS API)",
        url: "https://www.usgs.gov/volcanoes/kilauea/volcano-updates",
        feedUrl: "https://volcanoes.usgs.gov/hans-public/api/notice/recent/all/7",
        noticeUrl:
          "https://volcanoes.usgs.gov/hans-public/api/notice/getNotice/",
        observatory: "hvo",
        volcano: "hi3",
        parser: "hvo-episodes",
        intervalMs: 300000,
        staleMs: 3600000,
      },
      seedEvents: [
        [48, hst(2026, 6, 1, 4, 40), "DOI-USGS-HVO-2026-06-01T14:54:51+00:00"],
        [49, hst(2026, 6, 14, 9, 36), "DOI-USGS-HVO-2026-06-15T03:23:25+00:00"],
        [50, hst(2026, 6, 27, 10, 10), null],
        [51, hst(2026, 7, 15, 8, 30), null],
        [52, hst(2026, 7, 28, 19, 10), null],
        [53, hst(2026, 8, 12, 15, 45), "DOI-USGS-HVO-2026-08-13T11:52:10+00:00"],
        [54, hst(2026, 8, 25, 10, 30), "DOI-USGS-HVO-2026-08-25T20:17:36+00:00"],
      ].map(([n, time, notice]) => ({
        id: `episode-${n}`,
        time,
        label: `Episode ${n} lava fountaining began`,
        detail: "Start time stated by HVO (HST), seeded from the published record",
        url: notice
          ? `https://volcanoes.usgs.gov/hans-public/notice/${notice}`
          : "https://www.usgs.gov/volcanoes/kilauea/volcano-updates",
      })),
      accent: "#c2542c",
      accentSoft: "#f6e3da",
      art: "volcano",
    },
  };
  const ids = Object.keys(definitions);
  const parse = (id) =>
    definitions[id] ? { game: id, definition: definitions[id] } : null;
  const label = (id, side) =>
    definitions[id]
      ? definitions[id].outcomes[side === "up" ? 0 : 1]
      : null;
  const link = (id, side) =>
    definitions[id] ? `live.html?game=${id}${side ? "&side=" + side : ""}` : null;
  // Next 00:00 UTC on a scheduled day of month, at least minDays after start.
  function deadline(def, start) {
    const s = def.schedule,
      min = start + (s.minDays || 0) * 86400000,
      d = new Date(start),
      days = [...s.days].sort((a, b) => a - b);
    let y = d.getUTCFullYear(),
      m = d.getUTCMonth();
    for (let i = 0; i < 60; i++) {
      for (const day of days) {
        const t = Date.UTC(y, m, day);
        if (t >= min) return t;
      }
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return start + 30 * 86400000;
  }
  const question = (def, deadlineMs) =>
    `${def.questionPrefix} ${new Date(deadlineMs).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}?`;
  const embedUrl = (stream, video) =>
    `https://www.youtube.com/embed/${encodeURIComponent(video || stream.cameras?.[0]?.video || "")}?autoplay=1&mute=1&rel=0&playsinline=1`;
const Live={definitions,ids,parse,label,link,deadline,question,embedUrl};
export {definitions,ids,parse,label,link,deadline,question,embedUrl};
export default Live;
