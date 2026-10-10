"use strict";
// Server-only community data. Never serialize this state into a market snapshot.
import Labs from "./experiments.js";
const GAMES = ["bitcoin", "aerofoil", "galton", "escape", ...Labs.ids];
const MAX_BYTES = 1500000;
const requireValue = (ok, message) => {
  if (!ok) throw new Error(message);
};
const clean = (value, limit, label) => {
  requireValue(typeof value === "string", `Enter ${label}.`);
  const text = value.trim();
  requireValue(
    text.length > 0 && text.length <= limit,
    `${label} must be 1–${limit} characters.`,
  );
  return text;
};
function adminAuthorized(header, secret) {
  if (!secret || secret.length < 32) return false;
  const expected = `Bearer ${secret}`;
  if (typeof header !== "string" || header.length !== expected.length)
    return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
class Community {
  constructor(state, market, now = Date.now()) {
    this.state = state || {
      version: 1,
      next: 1,
      actors: {},
      comments: [],
      feedback: [],
      contacts: {},
      reports: [],
      stats: {},
      receipts: [],
    };
    this.market = market;
    this.accounts = market.accounts || market.players || {};
    this.now = now;
  }
  game(game) {
    requireValue(GAMES.includes(game), "Choose a live game.");
    return game;
  }
  actor(token) {
    requireValue(
      Object.hasOwn(this.accounts, token),
      "Reconnect to your guest account.",
    );
    return (this.state.actors[token] ||= {
      id: `guest-${this.state.next++}`,
      rates: {},
    });
  }
  rate(token, kind, max, window = 60000) {
    const actor = this.actor(token);
    const times = (actor.rates[kind] || []).filter(
      (time) => time > this.now - window,
    );
    requireValue(
      times.length < max,
      "Please slow down and try again in a minute.",
    );
    actor.rates[kind] = [...times, this.now];
  }
  profile(token) {
    const account = this.accounts[token] || {};
    return { name: account.name || "Guest", avatar: account.avatar || 0 };
  }
  contracts(game) {
    this.game(game);
    return Object.entries(
      this.market.markets || { bitcoin: this.market },
    ).filter(([key]) =>
      game === "galton"
        ? /^galton-[1-7]$/.test(key)
        : key === game || Labs.parse(key)?.game === game,
    );
  }
  positions(token, game) {
    return this.contracts(game).flatMap(([key, market]) => {
      // Expired holdings must not appear as current positions before the next poll.
      if (!market?.round || this.now >= market.round.end) return [];
      return ["up", "down"].flatMap((side) => {
        const shares = market.players?.[token]?.positions?.[side]?.shares || 0;
        const label =
          Labs.label(key, side) ||
          (game === "galton"
            ? `Slot ${key.split("-")[1]} ${side === "up" ? "Yes" : "No"}`
            : game === "bitcoin"
              ? side === "up"
                ? "Up"
                : "Down"
              : game === "aerofoil"
                ? side === "up"
                  ? "Above"
                  : "Below"
                : side === "up"
                  ? "Yes"
                  : "No");
        return shares > 0.000001
          ? [{ label, side, shares: Math.round(shares * 100) / 100 }]
          : [];
      });
    });
  }
  publicComment(comment, token, game) {
    const removed = comment.deleted || comment.hidden;
    return {
      id: comment.id,
      parentId: comment.parentId,
      time: comment.time,
      ...this.profile(comment.author),
      text: removed ? "Comment removed" : comment.text,
      removed: Boolean(removed),
      own: comment.author === token,
      likes: removed ? 0 : comment.likes.length,
      liked: !removed && comment.likes.includes(token),
      positions: removed ? [] : this.positions(comment.author, game),
    };
  }
  feed(token, query = {}) {
    const game = this.game(query.game);
    const all = this.state.comments.filter((c) => c.game === game);
    let roots = all.filter(
      (c) =>
        !c.parentId &&
        ((!c.deleted && !c.hidden) ||
          all.some((r) => r.parentId === c.id && !r.deleted && !r.hidden)),
    );
    if (query.holders === "true")
      roots = roots.filter((c) => this.positions(c.author, game).length);
    roots.sort(
      query.sort === "liked"
        ? (a, b) => b.likes.length - a.likes.length || b.time - a.time
        : (a, b) => b.time - a.time || b.id.localeCompare(a.id),
    );
    const limit = Math.max(20, Math.min(5000, Number(query.limit) || 20));
    const selected = roots.slice(0, limit);
    const focus = all.find((c) => c.id === query.focus);
    const focusRoot =
      focus && roots.find((c) => c.id === (focus.parentId || focus.id));
    if (focusRoot && !selected.includes(focusRoot)) selected.unshift(focusRoot);
    const comments = selected.map((c) => ({
      ...this.publicComment(c, token, game),
      replies: all
        .filter((r) => r.parentId === c.id && !r.deleted && !r.hidden)
        .map((r) => this.publicComment(r, token, game)),
    }));
    const holders = Object.entries(this.accounts)
      .filter(([, a]) => !a.bot)
      .map(([id]) => ({
        ...this.profile(id),
        own: id === token,
        positions: this.positions(id, game),
      }))
      .filter((a) => a.positions.length)
      .sort(
        (a, b) =>
          b.positions.reduce((n, p) => n + p.shares, 0) -
          a.positions.reduce((n, p) => n + p.shares, 0),
      )
      .slice(0, 50);
    const activity = this.contracts(game)
      .flatMap(([key, m]) =>
        (m?.trades || []).map((t) => ({
          id: `${key}-${t.id}`,
          time: t.time,
          actor: t.actor,
          bot: Boolean(t.bot),
          action: t.action,
          quantity: t.quantity,
          price: t.price,
          label:
            Labs.label(key, t.side) ||
            (game === "galton"
              ? `Slot ${key.split("-")[1]} ${t.side === "up" ? "Yes" : "No"}`
              : game === "bitcoin"
                ? t.side === "up"
                  ? "Up"
                  : "Down"
                : game === "aerofoil"
                  ? t.side === "up"
                    ? "Above"
                    : "Below"
                  : t.side === "up"
                    ? "Yes"
                    : "No"),
        })),
      )
      .sort((a, b) => b.time - a.time)
      .slice(0, 40);
    return {
      comments,
      count: all.filter((c) => !c.deleted && !c.hidden).length,
      hasMore: roots.length > limit,
      holders,
      positions: this.positions(token, game),
      activity,
    };
  }
  mutate(token, input) {
    requireValue(input && typeof input === "object", "Invalid request.");
    this.actor(token);
    const action = input.action;
    if (action === "comment") {
      const game = this.game(input.game),
        text = clean(input.text, 1200, "Your comment");
      const requestId = clean(input.requestId, 80, "Request ID");
      const duplicate = this.state.comments.find(
        (c) => c.author === token && c.requestId === requestId,
      );
      if (duplicate) return { id: duplicate.id };
      const parent = input.parentId
        ? this.state.comments.find(
            (c) =>
              c.id === input.parentId &&
              c.game === game &&
              !c.deleted &&
              !c.hidden,
          )
        : null;
      requireValue(
        !input.parentId || parent,
        "That comment is no longer available.",
      );
      this.rate(token, "comment", 5);
      const comment = {
        id: `c${this.state.next++}`,
        game,
        text,
        author: token,
        parentId: parent ? parent.parentId || parent.id : null,
        time: this.now,
        likes: [],
        requestId,
      };
      this.state.comments.push(comment);
      return { id: comment.id };
    }
    if (["like", "delete", "report"].includes(action)) {
      const comment = this.state.comments.find((c) => c.id === input.id);
      requireValue(
        comment && !comment.deleted && !comment.hidden,
        "That comment is no longer available.",
      );
      if (action === "delete") {
        requireValue(
          comment.author === token,
          "You can only delete your own comments.",
        );
        comment.deleted = true;
        comment.text = "";
        comment.likes = [];
      } else if (action === "like") {
        requireValue(typeof input.liked === "boolean", "Choose a like state.");
        this.rate(token, "like", 60);
        comment.likes = comment.likes.filter((id) => id !== token);
        if (input.liked) comment.likes.push(token);
      } else {
        const reason = clean(input.reason, 300, "A report reason");
        if (
          !this.state.reports.some(
            (r) =>
              r.author === token && r.commentId === comment.id && !r.resolved,
          )
        ) {
          this.rate(token, "report", 5);
          this.state.reports.push({
            id: `r${this.state.next++}`,
            author: token,
            commentId: comment.id,
            reason,
            time: this.now,
            resolved: false,
          });
        }
      }
      return { ok: true };
    }
    if (action === "feedback") {
      const message = clean(input.message, 2000, "Your message");
      requireValue(
        ["idea", "bug", "question", "other"].includes(input.kind),
        "Choose a feedback type.",
      );
      const game = input.game ? this.game(input.game) : null;
      const email =
        typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      requireValue(
        !email ||
          (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
        "Enter a valid email address.",
      );
      requireValue(!input.updates || email, "Add an email to request updates.");
      const requestId = clean(input.requestId, 80, "Request ID");
      if (
        this.state.feedback.some(
          (f) => f.author === token && f.requestId === requestId,
        )
      )
        return { ok: true };
      this.rate(token, "feedback", 3, 3600000);
      this.state.feedback.push({
        id: `f${this.state.next++}`,
        author: token,
        kind: input.kind,
        game,
        message,
        email,
        time: this.now,
        resolved: false,
        requestId,
      });
      if (email && input.updates === true)
        this.state.contacts[token] = {
          email,
          time: this.now,
          consent: "Science market updates",
          verified: false,
        };
      return { ok: true };
    }
    if (action === "forget-email") {
      delete this.state.contacts[token];
      for (const f of this.state.feedback) if (f.author === token) f.email = "";
      return { ok: true };
    }
    if (action === "event") {
      const game = this.game(input.game);
      requireValue(["click", "view"].includes(input.kind), "Invalid event.");
      const eventId = clean(input.eventId, 80, "Event ID");
      this.state.receipts = this.state.receipts
        .filter((r) => r.time > this.now - 86400000)
        .slice(-4999);
      if (this.state.receipts.some((r) => r.id === eventId))
        return { ok: true };
      this.rate(token, "event", 30);
      this.state.receipts.push({ id: eventId, time: this.now });
      const day = new Date(this.now).toISOString().slice(0, 10);
      const stats = (this.state.stats[day] ||= {});
      const counts = (stats[game] ||= { click: 0, view: 0 });
      counts[input.kind]++;
      for (const day of Object.keys(this.state.stats))
        if (Date.parse(day) < this.now - 90 * 86400000)
          delete this.state.stats[day];
      return { ok: true };
    }
    throw new Error("Unknown community action.");
  }
  adminFeed() {
    return {
      feedback: this.state.feedback
        .map(({ author, requestId, ...f }) => ({
          ...f,
          ...this.profile(author),
        }))
        .reverse(),
      contacts: Object.entries(this.state.contacts).map(([token, c]) => ({
        ...c,
        id: this.state.actors[token].id,
        ...this.profile(token),
      })),
      reports: this.state.reports
        .map(({ author, ...r }) => {
          const c = this.state.comments.find((c) => c.id === r.commentId);
          return {
            ...r,
            reporter: this.profile(author).name,
            comment: c
              ? {
                  id: c.id,
                  text: c.text,
                  game: c.game,
                  hidden: Boolean(c.hidden),
                  deleted: Boolean(c.deleted),
                  ...this.profile(c.author),
                }
              : null,
          };
        })
        .reverse(),
      stats: this.state.stats,
      storage: {
        bytes: new TextEncoder().encode(JSON.stringify(this.state)).length,
        limit: MAX_BYTES,
      },
    };
  }
  adminMutate(input) {
    if (input.action === "moderate") {
      const comment = this.state.comments.find((c) => c.id === input.id);
      requireValue(
        comment && typeof input.hidden === "boolean",
        "Comment not found.",
      );
      comment.hidden = input.hidden;
      for (const r of this.state.reports)
        if (r.commentId === comment.id) r.resolved = true;
    } else if (input.action === "resolve") {
      const item = [...this.state.feedback, ...this.state.reports].find(
        (f) => f.id === input.id,
      );
      requireValue(item, "Response not found.");
      item.resolved = true;
    } else if (input.action === "remove-contact") {
      const token = Object.keys(this.state.actors).find(
        (t) => this.state.actors[t].id === input.id,
      );
      requireValue(token, "Contact not found.");
      this.mutate(token, { action: "forget-email" });
    } else if (input.action === "delete-feedback") {
      this.state.feedback = this.state.feedback.filter(
        (f) => f.id !== input.id,
      );
    } else throw new Error("Unknown inbox action.");
    return { ok: true };
  }
  serialize() {
    const result = JSON.stringify(this.state);
    requireValue(
      new TextEncoder().encode(result).length <= MAX_BYTES,
      "The community inbox is full. Please email jianou.works@gmail.com.",
    );
    return result;
  }
}
export { Community, adminAuthorized };
