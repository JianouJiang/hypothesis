"use strict";
// This module stays on the server. It never sends the private CFD replay bank.
import { Market } from "./engine.js";
import { CollisionMarket } from "./collision-market.js";
import { LabMarket } from "./lab-market.js";
import { LiveMarket } from "./live-market.js";
import { randomBytes } from "node:crypto";
import Labs from "./experiments.js";
import Live from "./livestreams.js";
const round = (n) => Math.round(n * 1e8) / 1e8;

class AeroMarket extends Market {
  constructor(options) {
    super({ ...options, marketId: "aerofoil", duration: 120000 });
  }
  slotAt(time) {
    const traces = this.flowData.traces;
    const period = traces.reduce((n, t) => n + t.durationMs, 0);
    const cycle = Math.floor(time / period);
    this.schedules ||= new Map();
    if (!this.schedules.has(cycle)) {
      const order = traces.slice(2);
      let seed = this.state.seed ^ cycle;
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let h = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
        return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      // Distinct first/last traces prevent repetition across cycle boundaries.
      order.unshift(traces[0]);
      order.push(traces[1]);
      let cursor = cycle * period;
      const slots = order.map((trace) => {
        const slot = { trace, start: cursor, end: cursor + trace.durationMs };
        cursor = slot.end;
        return slot;
      });
      if (this.schedules.size > 3) this.schedules.clear();
      this.schedules.set(cycle, slots);
    }
    return this.schedules
      .get(cycle)
      .find((slot) => time >= slot.start && time < slot.end);
  }
  traceAt(time) {
    return this.slotAt(time).trace;
  }
  sampled(trace) {
    this.samples ||= new Map();
    if (!this.samples.has(trace.id)) {
      const seconds = Math.ceil(trace.durationMs / 1000),
        points = [],
        times = [];
      for (let i = 0; i <= seconds; i++) {
        const fraction = Math.min(1, (i * 1000) / trace.durationMs);
        const f = fraction * (trace.points.length - 1);
        const a = Math.floor(f),
          b = Math.min(a + 1, trace.points.length - 1),
          w = f - a;
        points.push(
          trace.points[a].map((v, c) => v * (1 - w) + trace.points[b][c] * w),
        );
        times.push(
          trace.times[0] + fraction * (trace.times.at(-1) - trace.times[0]),
        );
      }
      this.samples.set(trace.id, { points, times });
    }
    return this.samples.get(trace.id);
  }
  newRound(time) {
    const { trace, start, end } = this.slotAt(time);
    const previous = this.traceAt(start - 1);
    const sampled = this.sampled(trace);
    this.duration = end - start;
    this.seconds = sampled.points.length - 1;
    this.state.round = {
      id: String(start),
      start,
      end,
      opening: previous.points.at(-1)[1],
      path: sampled.points.map((p) => p[1]),
      traceId: trace.id,
      volume: 0,
      lastTick: -1,
      liquidityUsed: {},
      inventory: { up: 0, down: 0 },
      botTick: -1,
    };
    this.state.trades = [];
    if (this.botsEnabled) this.seedBots();
  }
  advance(now = this.clock()) {
    this.duration = this.state.round.end - this.state.round.start;
    this.seconds = this.state.round.path.length - 1;
    while (now >= this.state.round.end) {
      const next = this.state.round.end;
      this.settle();
      this.newRound(now - next > 3600000 ? now : next);
    }
    super.advance(now);
  }
  probability(now = this.clock()) {
    const r = this.state.round;
    const tick = Math.min(
      this.seconds - 1,
      Math.max(0, Math.floor((now - r.start) / 1000)),
    );
    // Quotes and bots use elapsed observations, never the future exit.
    const [x, y] = this.sampled(this.traceAt(r.start)).points[tick];
    const uncertainty = 0.08 + 0.9 * Math.sqrt(Math.max(0.04, (6 - x) / 9));
    return Math.max(
      0.02,
      Math.min(
        0.98,
        Math.round(100 / (1 + Math.exp(-(y - r.opening) / uncertainty))) / 100,
      ),
    );
  }
  snapshot(id) {
    const snapshot = super.snapshot(id),
      r = this.state.round;
    const trace = this.sampled(this.traceAt(r.start));
    const tick = Math.min(
      this.seconds - 1,
      Math.max(0, Math.floor((snapshot.now - r.start) / 1000)),
    );
    const physicalTime = trace.times[tick],
      frames = this.flowData.frames;
    let lo = 0,
      hi = frames.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (frames[mid].time <= physicalTime) lo = mid;
      else hi = mid - 1;
    }
    snapshot.flow = {
      dataset: this.flowData.metadata.id,
      model: this.flowData.metadata,
      points: trace.points.slice(0, tick + 1),
      particle: trace.points[tick],
      elapsedPhysicalSeconds:
        (physicalTime - trace.times[0]) * this.flowData.metadata.timeScale,
      field: frames[lo].velocity,
      grid: this.flowData.grid,
      previousExit: r.opening,
    };
    // Transit time is future information too. Show elapsed time and an estimate.
    snapshot.round.end = null;
    snapshot.round.expectedSeconds = 120;
    return snapshot;
  }
}

class Exchange {
  constructor(options = {}) {
    this.nowSource = options.now || Date.now;
    this.requestTime = this.nowSource();
    // Every contract in one operation observes the same instant, including at
    // a Galton round boundary while a cold Worker initializes the physics.
    this.clock = () => this.requestTime;
    const saved = options.state;
    this.state =
      saved?.version === 2
        ? saved
        : {
            version: 2,
            accounts: {},
            markets: { bitcoin: saved || null },
          };
    this.markets = {};
    const shared = {
      ...options,
      now: this.clock,
      accounts: this.state.accounts,
      trackProfile: false,
    };
    this.markets.bitcoin = new Market({
      ...shared,
      state: this.state.markets.bitcoin,
    });
    this.state.markets.bitcoin = this.markets.bitcoin.state;
    this.state.experimentSeed ||=
      options.seed || Math.floor(Math.random() * 2147483647);
    for (const key of [
      ...Array.from({ length: 7 }, (_, i) => `galton-${i + 1}`),
      "escape",
    ]) {
      const kind = key === "escape" ? "escape" : "galton";
      this.markets[key] = new CollisionMarket({
        ...shared,
        marketId: key,
        state: this.state.markets[key],
        simulation: {
          kind,
          seed: this.state.experimentSeed,
          slot: kind === "galton" ? Number(key.split("-")[1]) - 1 : null,
        },
      });
      this.state.markets[key] = this.markets[key].state;
    }
    if (options.flowData) {
      const datasetKey =
        options.flowData.metadata.fingerprint || options.flowData.metadata.id;
      if (
        this.state.markets.aerofoil?.datasetKey &&
        this.state.markets.aerofoil.datasetKey !== datasetKey
      )
        throw new Error(
          "The CFD dataset does not match the saved market. Restore its original data before resuming.",
        );
      this.markets.aerofoil = new AeroMarket({
        ...shared,
        state: this.state.markets.aerofoil,
      });
      this.state.markets.aerofoil = this.markets.aerofoil.state;
      this.state.markets.aerofoil.datasetKey = datasetKey;
    } else if (this.state.markets.aerofoil) {
      throw new Error(
        "CFD replay data is temporarily unavailable. Your wallet and positions are preserved.",
      );
    }
    this.state.labSecret ||= randomBytes(32).toString("hex");
    for (const key of Labs.contractIds) {
      const { game, index } = Labs.parse(key);
      this.markets[key] = new LabMarket({
        ...shared,
        marketId: key,
        state: this.state.markets[key],
        simulation: { kind: game, index, secret: this.state.labSecret },
      });
      this.state.markets[key] = this.markets[key].state;
    }
    for (const key of Live.ids) {
      this.markets[key] = new LiveMarket({
        ...shared,
        marketId: key,
        state: this.state.markets[key],
        simulation: { kind: key },
      });
      this.state.markets[key] = this.markets[key].state;
    }
    for (const id of Object.keys(this.state.accounts)) this.addPlayer(id);
  }
  // Live-stream markets read an official record. The server polls it and
  // hands each observation here; nothing is fetched inside the engine.
  liveFeedsDue(now = this.nowSource()) {
    return Live.ids.filter((key) => {
      const m = this.markets[key],
        feed = m.state.feed,
        interval = Live.definitions[key].source.intervalMs;
      if (!feed) return true;
      return now - feed.checkedAt >= (m.state.round.resolved ? 3 : 1) * interval;
    });
  }
  liveFeedMeta(game) {
    return this.markets[game]?.state.feed?.meta || null;
  }
  observeLive(game, observation) {
    if (!Live.definitions[game]) throw new Error("Unknown live market.");
    this.requestTime = this.nowSource();
    this.markets[game].observe(observation);
  }
  liveStatus() {
    this.advance();
    return Live.ids.map((key) => {
      const m = this.markets[key],
        r = m.state.round;
      return {
        game: key,
        title: Live.definitions[key].title,
        roundId: r.id,
        start: r.start,
        deadline: r.deadline,
        resolved: r.resolved,
        resolution: r.resolution,
        nextAt: r.nextAt,
        volume: r.volume,
        probability: m.probability(),
        feed: m.feedView(),
        history: m.state.history.slice(0, 6),
      };
    });
  }
  resolveLive(game, input) {
    if (!Live.definitions[game]) throw new Error("Unknown live market.");
    this.advance();
    return this.markets[game].override(input);
  }
  get players() {
    return this.state.accounts;
  }
  select(id = "bitcoin") {
    if (id === "galton") id = "galton-4";
    if (Labs.definitions[id]?.outcomes.length > 2) id += ":0";
    if (!this.markets[id])
      throw new Error(
        id === "aerofoil"
          ? "The OpenFOAM dataset is unavailable. Trading is paused."
          : "Unknown market.",
      );
    return this.markets[id];
  }
  addPlayer(id) {
    for (const m of Object.values(this.markets)) m.addPlayer(id);
    return this.state.accounts[id];
  }
  advance() {
    this.requestTime = this.nowSource();
    for (const m of Object.values(this.markets)) m.advance(this.requestTime);
  }
  place(id, input, marketId = "bitcoin") {
    this.advance();
    return this.select(marketId).place(id, input);
  }
  cancel(id, orderId, marketId = "bitcoin") {
    this.advance();
    return this.select(marketId).cancel(id, orderId);
  }
  updateProfile(id, input) {
    this.markets.bitcoin.updateProfile(id, input);
  }
  updateCompetition(id, input) {
    if (typeof input.interested !== "boolean")
      throw new Error("Choose whether to save your interest.");
    this.state.accounts[id].competitionInterest = input.interested;
  }
  reset(id) {
    this.advance();
    for (const m of Object.values(this.markets)) m.reset(id);
    // Resetting cannot leave positions or reserved funds in another market.
    this.state.accounts[id].balance = 1000;
  }
  snapshot(id, marketId = "bitcoin") {
    if (marketId === "galton") marketId = "galton-4";
    if (Labs.definitions[marketId]?.outcomes.length > 2) marketId += ":0";
    this.advance();
    const snapshots = Object.fromEntries(
      Object.entries(this.markets).map(([key, m]) => [key, m.snapshot(id)]),
    );
    const s = snapshots[marketId];
    if (!s) {
      this.select(marketId);
    }
    const p = s.player,
      account = this.state.accounts[id];
    for (const key of [
      "balance",
      "realized",
      "activity",
      "totalVolume",
      "biggestWin",
      "marketsTraded",
    ])
      p[key] = account[key] ?? p[key];
    p.allPositions = Object.entries(snapshots).flatMap(([key, m]) =>
      ["up", "down"].map((side) => ({
        marketId: key,
        side,
        ...m.player.positions[side],
      })),
    );
    p.allOrders = Object.entries(snapshots).flatMap(([key, m]) =>
      m.player.orders.map((o) => ({ ...o, marketId: key })),
    );
    p.history = Object.values(snapshots)
      .flatMap((m) => m.player.history)
      .sort((a, b) => b.end - a.end)
      .slice(0, 200);
    p.reserved = round(
      Object.values(snapshots).reduce((n, m) => n + m.player.reserved, 0),
    );
    p.positionValue = round(
      p.allPositions.reduce((n, pos) => n + pos.shares * pos.mark, 0),
    );
    p.equity = round(p.balance + p.reserved + p.positionValue);
    account.equityHistory ||= [];
    if (
      !account.equityHistory.length ||
      this.clock() - account.equityHistory.at(-1).time >= 60000
    ) {
      account.equityHistory.push({
        time: this.clock(),
        value: round(p.equity - 1000),
      });
      if (account.equityHistory.length > 2000)
        account.equityHistory = account.equityHistory.filter(
          (_, i, a) => i >= a.length - 500 || i % 2 === 0,
        );
    }
    p.equityHistory = account.equityHistory;
    p.competitionInterest = account.competitionInterest === true;
    s.markets = Object.fromEntries(
      Object.entries(snapshots).map(([key, m]) => [
        key,
        {
          probability: m.probability,
          quotes: m.quotes,
          round: {
            id: m.round.id,
            start: m.round.start,
            end: m.round.end,
            volume: m.round.volume,
            closed: m.round.closed === true,
            nextAt: m.round.nextAt || null,
            phase: m.round.phase,
            deadline: m.round.deadline,
          },
        },
      ]),
    );
    const outcomes = Array.from({ length: 7 }, (_, i) => {
      const key = `galton-${i + 1}`,
        m = snapshots[key];
      return {
        id: key,
        slot: i + 1,
        label: `Slot ${i + 1}`,
        probability: m.probability,
        quotes: m.quotes,
        positions: m.player.positions,
        roundId: m.round.id,
      };
    });
    s.markets.galton = {
      ...s.markets["galton-4"],
      round: {
        ...s.markets["galton-4"].round,
        volume: outcomes.reduce(
          (sum, o) => sum + snapshots[o.id].round.volume,
          0,
        ),
      },
      outcomes,
    };
    if (marketId.startsWith("galton-")) s.outcomes = outcomes;
    for (const game of Labs.ids) {
      const def = Labs.definitions[game];
      if (def.outcomes.length <= 2) continue;
      const choices = def.outcomes.map((label, i) => {
        const id = `${game}:${i}`,
          m = snapshots[id];
        return {
          id,
          label,
          probability: m.probability,
          quotes: m.quotes,
          positions: m.player.positions,
          roundId: m.round.id,
        };
      });
      s.markets[game] = { ...s.markets[`${game}:0`], outcomes: choices };
      if (marketId.startsWith(game + ":")) s.outcomes = choices;
    }
    return s;
  }
}
export { Exchange, AeroMarket };
