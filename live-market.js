"use strict";
// Long-horizon markets on a live-streamed, officially monitored experiment.
// The outcome is never simulated: a round resolves Yes when the official
// record reports an event inside its window, or No once the record has been
// checked after the deadline. This module stays on the server.
const { Market } = require("./market");
const Live = require("./livestreams");
const round = (n) => Math.round(n * 1e8) / 1e8;
const RESULT_MS = 10 * 60000; // Result display before the next window opens.
const MAX_EVENTS = 60;

class LiveMarket extends Market {
  constructor(options) {
    super({ ...options, duration: 86400000 });
    this.state.feed ||= null;
  }
  get definition() {
    return Live.definitions[this.simulation.kind];
  }
  newRound(start) {
    const now = this.clock();
    // A hand-off from the previous result keeps the clock continuous; a cold
    // start or a long shutdown opens the window now, never in the past, so
    // an episode reported before launch can never count.
    if (!this.state.round || !(start <= now && start > now - 7 * 86400000))
      start = now;
    const deadline = Live.deadline(this.definition, start);
    this.duration = deadline - start;
    this.seconds = 1;
    this.state.round = {
      id: String(start),
      start,
      end: deadline,
      deadline,
      settlementAt: null,
      nextAt: null,
      opening: 0.5,
      path: [0.5, 0.5],
      volume: 0,
      lastTick: -1,
      liquidityUsed: {},
      inventory: { up: 0, down: 0 },
      botTick: -1,
      resolved: false,
      resolution: null,
    };
    this.state.trades = [];
    if (this.botsEnabled) this.seedBots();
  }
  // Store one observation of the official record. Failed checks keep the last
  // good event list but are still recorded so the page can show feed health.
  observe(observation) {
    const at = Number(observation?.at) || this.clock();
    const previous = this.state.feed || { events: [], fetchedAt: 0 };
    const feed = {
      source: observation?.source || previous.source || null,
      checkedAt: at,
      fetchedAt: observation?.ok ? at : previous.fetchedAt || 0,
      ok: observation?.ok === true,
      error: observation?.ok
        ? null
        : String(observation?.error || "Unavailable").slice(0, 200),
      events: previous.events || [],
      meta: observation?.ok ? observation.meta || null : previous.meta || null,
    };
    if (observation?.ok) {
      const seen = new Set();
      feed.events = (observation.events || [])
        .filter(
          (e) =>
            e &&
            Number.isFinite(Number(e.time)) &&
            !seen.has(String(e.id ?? e.time)) &&
            seen.add(String(e.id ?? e.time)),
        )
        .map((e) => ({
          id: String(e.id ?? e.time).slice(0, 80),
          time: Number(e.time),
          label: String(e.label || "Event").slice(0, 120),
          detail: e.detail ? String(e.detail).slice(0, 400) : undefined,
          url: e.url ? String(e.url).slice(0, 300) : undefined,
        }))
        .sort((a, b) => a.time - b.time)
        .slice(-MAX_EVENTS);
    }
    this.state.feed = feed;
    this.advance();
  }
  eventInWindow(r = this.state.round) {
    return (this.state.feed?.events || []).find(
      (e) => e.time >= r.start && e.time < r.deadline,
    );
  }
  intervalDays() {
    const events = this.state.feed?.events || [];
    const gaps = [];
    for (let i = Math.max(1, events.length - 8); i < events.length; i++)
      gaps.push((events[i].time - events[i - 1].time) / 86400000);
    const basis = gaps.filter((g) => g > 0);
    if (basis.length)
      return {
        days: basis.reduce((a, b) => a + b, 0) / basis.length,
        basis: "recent official events",
        count: basis.length,
      };
    return {
      days: this.definition.priorIntervalDays,
      basis: "published prior interval",
      count: 0,
    };
  }
  probability(now = this.clock()) {
    const r = this.state.round;
    if (r.resolved) return r.path.at(-1);
    // Memoryless hazard from the recent official event rate; a liquidity
    // heuristic for bots and quotes, not a scientific forecast.
    const remaining = Math.max(0, r.deadline - now) / 86400000;
    const p = 1 - Math.exp(-remaining / Math.max(0.5, this.intervalDays().days));
    return Math.max(0.02, Math.min(0.98, Math.round(p * 100) / 100));
  }
  resolve(outcome, now, info = {}) {
    const r = this.state.round;
    if (r.resolved) return;
    if (!["yes", "no", "void"].includes(outcome))
      throw new Error("Choose Yes, No, or Void.");
    r.settlementAt = now;
    r.nextAt = now + RESULT_MS;
    r.resolution = { outcome, at: now, ...info };
    const details = {
      experiment: this.simulation.kind,
      deadline: r.deadline,
      windowStart: r.start,
      resolution: r.resolution,
    };
    if (outcome === "void") {
      for (const order of [...this.state.orders])
        this.cancel(order.playerId, order.id, false);
      const result = {
        marketId: this.marketId,
        id: r.id,
        start: r.start,
        end: now,
        opening: 0.5,
        close: null,
        outcome: "void",
        volume: r.volume,
        ...details,
      };
      for (const player of Object.values(this.state.players)) {
        const cost = player.positions.up.cost + player.positions.down.cost;
        if (cost > 0) {
          player.balance = round(player.balance + cost);
          player.history.unshift({ ...result, cost, payout: cost, profit: 0 });
          player.history = player.history.slice(0, 100);
          this.recordActivity(player, {
            type: "refund",
            side: "void",
            shares: 0,
            total: cost,
            profit: 0,
            time: now,
          });
        }
        player.positions = {
          up: { shares: 0, cost: 0 },
          down: { shares: 0, cost: 0 },
        };
      }
      this.state.history.unshift(result);
      this.state.history = this.state.history.slice(0, 24);
    } else {
      r.path[r.path.length - 1] = outcome === "yes" ? 1 : 0;
      super.settle();
      Object.assign(this.state.history[0], details);
      delete this.state.history[0].path;
      for (const p of Object.values(this.state.players))
        if (p.history[0]?.id === r.id) Object.assign(p.history[0], details);
    }
    r.resolved = true;
  }
  // Owner override for a broken or discontinued official feed.
  override(input = {}) {
    this.advance();
    const outcome = String(input.outcome || "").toLowerCase();
    if (!["yes", "no", "void"].includes(outcome))
      throw new Error("Choose Yes, No, or Void.");
    if (this.state.round.resolved)
      throw new Error("This window has already resolved.");
    const note = String(input.note || "").trim().slice(0, 300);
    if (!note) throw new Error("Add a note citing the official record.");
    this.resolve(outcome, this.clock(), { by: "owner", note });
    return { ok: true, roundId: this.state.round.id, outcome };
  }
  advance(now = this.clock()) {
    for (let guard = 0; guard < 12; guard++) {
      const r = this.state.round;
      if (!r.resolved) {
        const event = this.eventInWindow(r);
        const feed = this.state.feed;
        if (event) this.resolve("yes", now, { by: "feed", event });
        else if (now >= r.deadline && feed?.ok && feed.fetchedAt >= r.deadline)
          this.resolve("no", now, {
            by: "deadline",
            checkedAt: feed.fetchedAt,
          });
      }
      if (this.state.round.resolved && now >= this.state.round.nextAt)
        this.newRound(this.state.round.nextAt);
      else break;
    }
    const r = this.state.round;
    this.duration = r.deadline - r.start;
    this.seconds = 1;
    if (!r.resolved && now < r.deadline) super.advance(now);
    else r.lastTick = Math.floor((now - r.start) / 1000);
  }
  runBots(tick, now) {
    // A month-long question does not need a trade every three seconds.
    if (tick % 30 !== 0) return;
    super.runBots(tick, now);
  }
  place(id, input, internal = false) {
    if (!internal) this.advance();
    const r = this.state.round,
      now = this.clock();
    if (r.resolved)
      throw new Error(
        "This question has resolved. The next window opens in a few minutes.",
      );
    if (now >= r.deadline)
      throw new Error(
        "Trading closed at the deadline. Waiting for the official record.",
      );
    return super.place(id, input, internal);
  }
  feedView() {
    const f = this.state.feed;
    if (!f) return null;
    return {
      source: f.source,
      checkedAt: f.checkedAt,
      fetchedAt: f.fetchedAt,
      ok: f.ok,
      error: f.error,
      events: f.events,
      meta: f.meta,
    };
  }
  snapshot(id) {
    const s = super.snapshot(id),
      r = this.state.round,
      def = this.definition;
    const phase = r.resolved
      ? "result"
      : s.now >= r.deadline
        ? "awaiting"
        : "open";
    s.round.closed = phase !== "open";
    s.round.resolved = r.resolved;
    s.round.end = r.deadline;
    s.round.deadline = r.deadline;
    s.round.phase = phase;
    s.round.nextAt = r.resolved ? r.nextAt : null;
    s.round.settlementAt = r.settlementAt;
    const interval = this.intervalDays();
    s.live = {
      kind: this.simulation.kind,
      window: { start: r.start, deadline: r.deadline },
      phase,
      resolution: r.resolution,
      feed: this.feedView(),
      model: {
        probability: this.probability(s.now),
        intervalDays: interval.days,
        basis: interval.basis,
        intervalCount: interval.count,
        resultDisplayMs: RESULT_MS,
      },
      stream: def.stream,
      source: def.source,
      schedule: def.schedule,
    };
    return s;
  }
}
module.exports = { LiveMarket, RESULT_MS };
