"use strict";
import { Market } from "./engine.js";
import {
  experiment,
  atTime,
  slotProbabilities,
  GALTON,
  ESCAPE,
} from "./physics.js";

class CollisionMarket extends Market {
  constructor(options) {
    super({ ...options, duration: 65000 });
  }
  model(start = this.state.round.start) {
    return experiment(this.simulation.kind, this.simulation.seed, start);
  }
  newRound(start) {
    const model = this.model(start),
      end = start + model.resolveMs + 3500;
    this.duration = end - start;
    this.seconds = Math.ceil(this.duration / 1000);
    const path = Array.from({ length: this.seconds + 1 }, (_, i) =>
      this.estimate(model, i * 1000),
    );
    path[path.length - 1] =
      model.kind === "galton"
        ? model.slot === this.simulation.slot
          ? 1
          : 0
        : model.escaped
          ? 1
          : 0;
    this.state.round = {
      id: String(start),
      start,
      end,
      settlementAt: start + model.resolveMs,
      opening: 0.5,
      path,
      volume: 0,
      lastTick: -1,
      liquidityUsed: {},
      inventory: { up: 0, down: 0 },
      botTick: -1,
      resolved: false,
    };
    this.state.trades = [];
    if (this.botsEnabled) this.seedBots();
  }
  estimate(model, elapsed) {
    if (model.kind === "galton")
      return slotProbabilities(model, elapsed)[this.simulation.slot];
    const p = atTime(model, elapsed).point,
      r = Math.hypot(p[1], p[2]);
    const left = Math.max(0, (model.config.durationMs - elapsed) / 1000);
    // Current radius and remaining time only. Never consult the future escape.
    return Math.max(
      0.02,
      Math.min(0.98, 1 - Math.exp(-left * (0.01 + 0.006 * r))),
    );
  }
  probability(now = this.clock()) {
    const model = this.model();
    if (this.state.round.resolved && !model.void)
      return this.state.round.path.at(-1);
    return this.estimate(model, Math.max(0, now - this.state.round.start));
  }
  settle() {
    const r = this.state.round;
    if (r.resolved) return r.path.at(-1);
    const model = this.model();
    if (!model.void) {
      super.settle();
      Object.assign(this.state.history[0], {
        winningSlot: model.slot,
        escaped: model.escaped,
      });
    } else {
      for (const order of [...this.state.orders])
        this.cancel(order.playerId, order.id, false);
      const result = {
        marketId: this.marketId,
        id: r.id,
        start: r.start,
        end: r.settlementAt,
        opening: 0.5,
        close: null,
        outcome: "void",
        volume: r.volume,
      };
      for (const player of Object.values(this.state.players)) {
        const cost = player.positions.up.cost + player.positions.down.cost;
        if (cost > 0) {
          player.balance = Math.round((player.balance + cost) * 1e8) / 1e8;
          player.history.unshift({ ...result, cost, payout: cost, profit: 0 });
          player.history = player.history.slice(0, 100);
          this.recordActivity(player, {
            type: "refund",
            side: "void",
            shares: 0,
            total: cost,
            profit: 0,
            time: r.settlementAt,
          });
        }
        player.positions = {
          up: { shares: 0, cost: 0 },
          down: { shares: 0, cost: 0 },
        };
      }
      this.state.history.unshift(result);
      this.state.history = this.state.history.slice(0, 24);
    }
    r.resolved = true;
    return r.path.at(-1);
  }
  advance(now = this.clock()) {
    while (now >= this.state.round.end) {
      const next = this.state.round.end;
      this.settle();
      this.newRound(
        now - next > 130000 ? Math.floor(now / 65000) * 65000 : next,
      );
    }
    this.duration = this.state.round.end - this.state.round.start;
    this.seconds = this.state.round.path.length - 1;
    if (now >= this.state.round.settlementAt) this.settle();
    if (!this.state.round.resolved) super.advance(now);
    else
      this.state.round.lastTick = Math.floor(
        (now - this.state.round.start) / 1000,
      );
  }
  place(id, input, internal = false) {
    if (!internal) this.advance();
    if (
      this.state.round.resolved ||
      this.clock() >= this.state.round.settlementAt
    )
      throw new Error("This round has resolved. Wait for the next ball.");
    return super.place(id, input, internal);
  }
  snapshot(id) {
    const s = super.snapshot(id),
      r = this.state.round,
      model = this.model();
    const elapsed = Math.max(0, s.now - r.start),
      sample = atTime(model, elapsed);
    s.round.resolved = r.resolved;
    s.round.closed = r.resolved;
    s.round.end = model.kind === "escape" ? r.start + ESCAPE.durationMs : null;
    s.round.nextAt = r.resolved ? r.end : null;
    s.physics = {
      kind: model.kind,
      config: model.config,
      pegs: model.pegs,
      phases: model.phases,
      frames: model.frames.slice(
        Math.max(0, sample.index - 100),
        sample.index + 1,
      ),
      impacts: model.impacts.filter(
        (hit) => hit[0] <= elapsed && hit[0] >= elapsed - 6000,
      ),
      particle: sample.point,
      phase: r.resolved
        ? "result"
        : elapsed < model.config.preludeMs
          ? "release"
          : "running",
      result: r.resolved
        ? model.void
          ? "void"
          : model.kind === "galton"
            ? model.slot
            : model.escaped
              ? "yes"
              : "no"
        : null,
      probabilities:
        model.kind === "galton" ? slotProbabilities(model, elapsed) : null,
    };
    return s;
  }
}
export { CollisionMarket };
