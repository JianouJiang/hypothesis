"use strict";
import { Market } from "./engine.js";
import { definitions } from "./experiments.js";
import {
  experiment,
  probabilities,
  FRAME_COUNT,
  DURATION_MS,
  COOLDOWN_MS,
} from "./lab-physics.js";
class LabMarket extends Market {
  constructor(options) {
    super({ ...options, duration: DURATION_MS + COOLDOWN_MS });
  }
  model(start = this.state.round.start) {
    return experiment(this.simulation.kind, this.simulation.secret, start);
  }
  newRound(start) {
    const model = this.model(start),
      duration = DURATION_MS + COOLDOWN_MS;
    this.duration = duration;
    this.seconds = duration / 1000;
    const path = Array.from(
      { length: this.seconds + 1 },
      (_, i) =>
        probabilities(
          model,
          Math.min(
            FRAME_COUNT,
            Math.floor(((i * 1000) / DURATION_MS) * FRAME_COUNT),
          ),
        )[this.simulation.index],
    );
    path[path.length - 1] = model.result === this.simulation.index ? 1 : 0;
    this.state.round = {
      id: String(start),
      start,
      end: start + duration,
      settlementAt: start + DURATION_MS,
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
  probability(now = this.clock()) {
    if (this.state.round.resolved) return this.state.round.path.at(-1);
    return probabilities(
      this.model(),
      Math.min(
        FRAME_COUNT,
        Math.max(
          0,
          Math.floor(
            ((now - this.state.round.start) / DURATION_MS) * FRAME_COUNT,
          ),
        ),
      ),
    )[this.simulation.index];
  }
  settle() {
    if (this.state.round.resolved) return this.state.round.path.at(-1);
    const model = this.model(),
      value = super.settle();
    this.state.round.resolved = true;
    const details = {
      winningChoice: model.result,
      experiment: this.simulation.kind,
      measurement: model.frames.at(-1).value,
    };
    Object.assign(this.state.history[0], details);
    delete this.state.history[0].path; // Results need a measurement, not every historical bot quote.
    for (const p of Object.values(this.state.players))
      if (p.history[0]?.id === this.state.round.id)
        Object.assign(p.history[0], details);
    return value;
  }
  advance(now = this.clock()) {
    while (now >= this.state.round.end) {
      const next = this.state.round.end;
      this.settle();
      this.newRound(
        now - next > DURATION_MS
          ? Math.floor(now / (DURATION_MS + COOLDOWN_MS)) *
              (DURATION_MS + COOLDOWN_MS)
          : next,
      );
    }
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
      throw new Error(
        "This experiment has resolved. The next round starts in three seconds.",
      );
    return super.place(id, input, internal);
  }
  snapshot(id) {
    const s = super.snapshot(id),
      r = this.state.round,
      model = this.model();
    const index = Math.min(
        FRAME_COUNT,
        Math.max(
          0,
          Math.floor(((s.now - r.start) / DURATION_MS) * FRAME_COUNT),
        ),
      ),
      current = model.frames[index];
    s.round.closed = r.resolved;
    s.round.resolved = r.resolved;
    s.round.end = r.settlementAt;
    s.round.nextAt = r.resolved ? r.end : null;
    s.lab = {
      kind: model.kind,
      parameters: model.parameters,
      initial: model.initial,
      frame: current,
      previous: model.frames[Math.max(0, index - 1)],
      index,
      durationMs: DURATION_MS,
      history: model.frames.slice(0, index + 1).map((f) => [f.t, f.value]),
      trail: model.frames
        .slice(0, index + 1)
        .map((f) =>
          model.kind === "diffusion" || model.kind === "heat"
            ? [f.t]
            : [f.t, ...f.state],
        ),
      points: model.points?.slice(0, current.state[1]),
      result: r.resolved ? model.result : null,
      probabilities: r.resolved
        ? definitions[model.kind].outcomes.map((_, i) =>
            i === model.result ? 1 : 0,
          )
        : probabilities(model, index),
    };
    return s;
  }
}
export { LabMarket };
