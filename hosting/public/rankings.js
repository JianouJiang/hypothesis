/* Shared, persistent realized-profit rankings. Never exposes account/session IDs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PhysicsRankings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  const round = (n) => Math.round(n * 1e8) / 1e8;
  const categories = {
    fluid: ["aerofoil", "kilauea", "convection", "vortex", "diffusion"],
    solid: ["galton", "escape", "magnetic-pendulum", "double-pendulum", "beam", "collision"],
    thermo: ["heat", "piston"],
    electro: ["charge", "induction"],
    optics: ["prism", "interference"],
    quantum: ["tunneling"],
    astro: ["orbit"],
    maths: ["bitcoin", "random-walk", "monte-carlo"],
  };
  function category(marketId = "bitcoin") {
    const game = marketId.startsWith("galton-") ? "galton" : marketId.split(":")[0];
    return Object.keys(categories).find((key) => categories[key].includes(game));
  }
  function periodStart(period, now) {
    const today = Math.floor(now / DAY) * DAY;
    if (period === "day") return today;
    if (period === "week") return today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
    if (period === "month") {
      const date = new Date(now);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    }
    return 0;
  }
  function add(stats, key, profit, volume) {
    const row = (stats[key] ||= { profit: 0, volume: 0 });
    row.profit = round(row.profit + profit);
    row.volume = round(row.volume + volume);
  }
  function best(wins, key, win) {
    const list = (wins[key] ||= []);
    list.push(win);
    list.sort((a, b) => b.profit - a.profit || b.time - a.time);
    wins[key] = list.slice(0, 10);
  }
  function accumulate(ledger, entry) {
    const key = category(entry.marketId);
    if (!key || !["buy", "sell", "settlement"].includes(entry.type)) return;
    const profit = Number.isFinite(entry.profit) ? entry.profit : 0;
    const volume = entry.type === "settlement" ? 0 : entry.total || 0;
    add(ledger.totals, key, profit, volume);
    const day = Math.floor(entry.time / DAY) * DAY;
    const bucket = (ledger.days[day] ||= { totals: {}, wins: {} });
    add(bucket.totals, key, profit, volume);
    if (profit > 0) {
      const win = {
        marketId: entry.marketId || "bitcoin", time: entry.time,
        profit, cost: round(Math.max(0, entry.total - profit)), payout: entry.total,
      };
      best(ledger.wins, key, win);
      best(bucket.wins, key, win);
    }
  }
  function prune(ledger, now) {
    // Calendar filters need at most the current month. Keep two months so a
    // week crossing a month/year boundary is covered too.
    for (const day of Object.keys(ledger.days))
      if (Number(day) < now - 62 * DAY) delete ledger.days[day];
  }
  function ensure(player, now) {
    if (player.bot || player.id.startsWith("bot-")) return null;
    if (player.leaderboard) return player.leaderboard;
    const activity = player.activity || [];
    const volume = activity.reduce((sum, a) => sum + (["buy", "sell"].includes(a.type) ? a.total || 0 : 0), 0);
    const profit = activity.reduce((sum, a) => sum + (a.profit || 0), 0);
    const limited = Math.abs(volume - (player.totalVolume || 0)) > 1e-5 ||
      Math.abs(profit - (player.realized || 0)) > 1e-5;
    const ledger = player.leaderboard = {
      since: limited ? (activity.at(-1)?.time ?? now) : (player.trackingSince || player.joinedAt || now),
      limited, totals: {}, days: {}, wins: {},
    };
    for (const entry of activity) accumulate(ledger, entry);
    prune(ledger, now);
    return ledger;
  }
  function record(player, entry, now) {
    const ledger = ensure(player, now);
    if (!ledger) return;
    accumulate(ledger, entry);
    prune(ledger, now);
  }
  function sum(stats, selected) {
    return Object.entries(stats).reduce((total, [key, row]) => {
      if (selected === "all" || selected === key) {
        total.profit += row.profit;
        total.volume += row.volume;
      }
      return total;
    }, { profit: 0, volume: 0 });
  }
  function board(players, input = {}, now = Date.now(), viewerId) {
    const period = input.period || "month", selected = input.category || "all", sort = input.sort || "profit";
    if (!["day", "week", "month", "all"].includes(period)) throw new Error("Choose a valid leaderboard period.");
    if (selected !== "all" && !Object.hasOwn(categories, selected)) throw new Error("Choose a valid science category.");
    if (!["profit", "volume"].includes(sort)) throw new Error("Choose profit or volume.");
    const query = String(input.q || "").trim().slice(0, 80).toLowerCase();
    const start = periodStart(period, now), rows = [], wins = [];
    let limitedSince = null;
    for (const player of Object.values(players)) {
      const ledger = ensure(player, now);
      if (!ledger) continue;
      prune(ledger, now);
      const buckets = period === "all" ? [ledger] : Object.entries(ledger.days)
        .filter(([day]) => Number(day) >= start && Number(day) <= now).map(([, day]) => day);
      const totals = buckets.reduce((total, bucket) => {
        const value = sum(bucket.totals, selected);
        total.profit += value.profit;
        total.volume += value.volume;
        for (const [key, list] of Object.entries(bucket.wins))
          if (selected === "all" || selected === key)
            for (const win of list) wins.push({ ...win, name: player.name, avatar: player.avatar || 0 });
        return total;
      }, { profit: 0, volume: 0 });
      // These existing lifetime counters survive activity-log truncation.
      if (period === "all" && selected === "all") {
        totals.profit = player.realized || 0;
        totals.volume = player.totalVolume || 0;
      }
      if (ledger.limited && (start < ledger.since))
        limitedSince = Math.max(limitedSince || 0, ledger.since);
      if (totals.volume <= 0 && Math.abs(totals.profit) < 1e-8) continue;
      rows.push({ name: player.name, avatar: player.avatar || 0,
        profit: round(totals.profit), volume: round(totals.volume), isYou: player.id === viewerId });
    }
    rows.sort((a, b) => b[sort] - a[sort] || b[sort === "profit" ? "volume" : "profit"] - a[sort === "profit" ? "volume" : "profit"] || a.name.localeCompare(b.name, "en"));
    rows.forEach((row, i) => row.rank = i + 1);
    const filtered = rows.filter((row) => row.name.toLowerCase().includes(query));
    const pageSize = 20, pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const requested = Number(input.page || 1);
    const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
    wins.sort((a, b) => b.profit - a.profit || b.time - a.time || a.name.localeCompare(b.name, "en"));
    return { now, period, category: selected, sort, page, pageSize, pages,
      total: filtered.length, traders: rows.length, limitedSince,
      entries: filtered.slice((page - 1) * pageSize, page * pageSize),
      you: rows.find((row) => row.isYou) || null, wins: wins.slice(0, 10) };
  }
  return { category, periodStart, ensure, record, board };
});
