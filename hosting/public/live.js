(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    { safe, money } = PhysicsGuest;
  const query = new URLSearchParams(location.search),
    Live = HypothesisLive;
  const kind = Live.definitions[query.get("game")]
      ? query.get("game")
      : Live.ids[0],
    def = Live.definitions[kind];
  let snapshot,
    side = query.get("side") === "down" ? "down" : "up",
    action = "buy",
    panel = "book",
    pending,
    submitting = false,
    lastUpdate = 0,
    parametersKey;
  const label = (s) =>
      s === "void" ? "Void" : def.outcomes[s === "up" ? 0 : 1],
    cents = (n) => `${Math.round(n * 100)}¢`;
  const subjects = {
    fluid: "Fluid Dynamics",
    solid: "Solid Mechanics",
    thermo: "Thermodynamics",
    electro: "Electromagnetism",
    optics: "Optics",
    astro: "Astrophysics",
    maths: "Maths & Statistics",
    quantum: "Quantum Physics",
  };
  const dateTime = (t, opts = {}) =>
    new Date(t).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
      ...opts,
    });
  const dateOnly = (t) =>
    new Date(t).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const serverNow = () => Date.now() + (client.offset || 0);
  const remaining = (ms) => {
    if (ms <= 0) return "0:00";
    const d = Math.floor(ms / 86400000),
      h = Math.floor((ms % 86400000) / 3600000),
      m = Math.floor((ms % 3600000) / 60000),
      s = Math.floor((ms % 60000) / 1000);
    if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const relative = (t) => {
    const s = Math.max(0, (serverNow() - t) / 1000);
    return s < 90
      ? "just now"
      : s < 3600
        ? `${Math.round(s / 60)} min ago`
        : s < 86400
          ? `${Math.round(s / 3600)} h ago`
          : `${Math.round(s / 86400)} d ago`;
  };
  document.title = `${def.short} · Hypothesis`;
  document.body.dataset.game = kind;
  document.body.style.setProperty("--live-accent", def.accent);
  document.body.style.setProperty("--live-accent-soft", def.accentSoft);
  document.querySelector("[data-community-game]").dataset.communityGame = kind;
  $("live-title").textContent = def.title;
  $("live-short").textContent = def.short;
  $("live-subtitle").textContent = def.subtitle;
  $("live-subject").textContent = subjects[def.subject];
  $("live-subject").href = `index.html?subject=${def.subject}`;
  document.querySelectorAll(".subject-nav a").forEach((a) => {
    a.removeAttribute("aria-current");
    if (a.getAttribute("href") === `index.html?subject=${def.subject}`)
      a.setAttribute("aria-current", "true");
  });
  for (const [id, text] of Object.entries({
    "live-about": def.about,
    "live-rule": def.rule,
    "live-source-notes": def.sourceNotes,
    "live-model-notes": def.modelNotes,
    "live-lag-note": def.stream.lagNote,
    "live-credit": `${def.stream.credit} · ${def.stream.title}`,
    "live-last-label": `LAST OFFICIAL ${def.eventNoun.toUpperCase()}`,
    "live-tip": def.tip,
  }))
    $(id).textContent = text;
  $("live-source-link").href = def.source.url;
  $("live-feed-link").href = def.source.feedUrl;
  $("live-stream-link").href = def.stream.url;
  $("live-stream-link-2").href = def.stream.url;
  $("label-up").textContent = label("up");
  $("label-down").textContent = label("down");
  $("choose-up").setAttribute("aria-label", label("up"));
  $("choose-down").setAttribute("aria-label", label("down"));
  $("selected-contract").textContent = def.short;
  $("confirm-market-name").textContent = def.short;
  $("live-video").title = `${def.stream.title} · ${def.stream.credit}`;
  // The official short links are re-resolved by the server; the static ids
  // are a fallback until the first feed check arrives.
  let camera = def.stream.cameras.find((c) => c.id === query.get("camera")) || def.stream.cameras[0],
    videoId = camera.video;
  function videoFor(c) {
    return snapshot?.live.feed?.meta?.streams?.[c.id] || c.video;
  }
  function renderCameras() {
    const next = videoFor(camera);
    if (next !== videoId || !$("live-video").src) {
      videoId = next;
      $("live-video").src = Live.embedUrl(def.stream, videoId);
      $("live-stream-link").href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
    $("live-cameras").innerHTML = def.stream.cameras
      .map(
        (c) =>
          `<button type="button" data-camera="${safe(c.id)}" aria-pressed="${c.id === camera.id}">${safe(c.id.toUpperCase())}</button>`,
      )
      .join("");
  }
  $("live-cameras").onclick = (e) => {
    const b = e.target.closest("[data-camera]");
    if (!b) return;
    camera = def.stream.cameras.find((c) => c.id === b.dataset.camera) || camera;
    renderCameras();
  };
  renderCameras();
  const timeline = $("live-timeline");
  const client = new PhysicsGuest.Client(
    (data) => {
      if (!data.live || data.marketId !== client.marketId) return;
      snapshot = data;
      lastUpdate = Date.now();
      $("aero-balance").textContent = money(data.player.balance);
      $("download-conditions").disabled = false;
      const key = `${data.round.id}:${data.live.feed?.checkedAt || 0}`;
      if (parametersKey !== key) {
        parametersKey = key;
        $("live-parameters").textContent = JSON.stringify(
          {
            window: {
              opened: new Date(data.live.window.start).toISOString(),
              deadline: new Date(data.live.window.deadline).toISOString(),
            },
            phase: data.live.phase,
            schedule: data.live.schedule,
            liquidityModel: data.live.model,
            officialRecord: data.live.feed && {
              source: data.live.feed.source,
              lastSuccessfulCheck: data.live.feed.fetchedAt
                ? new Date(data.live.feed.fetchedAt).toISOString()
                : null,
              lastCheck: new Date(data.live.feed.checkedAt).toISOString(),
              ok: data.live.feed.ok,
              error: data.live.feed.error,
              events: data.live.feed.events.map((e) => ({
                ...e,
                time: new Date(e.time).toISOString(),
              })),
            },
          },
          null,
          2,
        );
        renderEvents();
        renderCameras();
      }
      renderObservation();
      renderTicket();
      renderPositions();
      renderPanel();
      drawTimeline();
    },
    (message) => {
      $("aero-connection").textContent = message;
    },
  );
  client.marketId = kind;
  client.intervalMs = 2500;
  const ready = () =>
    snapshot && snapshot.round.phase === "open" && Date.now() - lastUpdate < 15000;
  const type = () => $("trade-type").value,
    quantityInput = () => action === "sell" || type() === "limit";
  const quote = () =>
    snapshot?.quotes[side][action === "buy" ? "ask" : "bid"] || 0.5;
  function renderTicket() {
    for (const s of ["up", "down"]) {
      $("choose-" + s).setAttribute("aria-pressed", side === s);
      $("quote-" + s).textContent = snapshot
        ? cents(snapshot.quotes[s][action === "buy" ? "ask" : "bid"])
        : "—";
    }
    for (const a of ["buy", "sell"])
      $("trade-" + a).setAttribute("aria-pressed", action === a);
    $("amount-label").textContent = quantityInput() ? "Shares" : "Amount";
    $("amount-unit").textContent = quantityInput() ? "shares" : "gold";
    $("trade-available").textContent = snapshot
      ? action === "buy"
        ? `${money(snapshot.player.balance)} G available`
        : `${money(snapshot.player.positions[side].available)} shares available`
      : "— available";
    $("limit-label").hidden = type() !== "limit";
    const amount = Number($("trade-amount").value),
      price = type() === "limit" ? Number($("limit-price").value) : quote();
    const estimate =
      action === "sell"
        ? amount * price
        : quantityInput()
          ? amount
          : amount / price;
    $("estimate-label").textContent =
      action === "sell" ? "Estimated proceeds" : "Potential payout";
    $("trade-estimate").textContent =
      `${money(Number.isFinite(estimate) ? estimate : 0)} G`;
    $("review-trade").textContent =
      snapshot?.round.phase === "result"
        ? "Waiting for the next window"
        : snapshot?.round.phase === "awaiting"
          ? "Deadline passed · awaiting record"
          : `Review ${action} ${label(side)}`;
    $("review-trade").disabled = !ready();
  }
  function renderPositions() {
    const p = snapshot.player,
      held = ["up", "down"].filter((s) => p.positions[s].shares > 0.00001);
    $("aero-positions").innerHTML = held.length
      ? held
          .map(
            (s) =>
              `<div class="position-line"><span>${label(s)}</span><strong>${money(p.positions[s].shares)} shares</strong></div>`,
          )
          .join("")
      : "No positions yet. Make your prediction.";
    $("aero-orders").innerHTML = p.orders
      .map(
        (o) =>
          `<div class="position-line"><span>${safe(o.action)} ${label(o.side)} · ${money(o.remaining)} at ${cents(o.price)}</span><button data-cancel="${safe(o.id)}">Cancel</button></div>`,
      )
      .join("");
  }
  const resolutionText = (r) => {
    if (!r) return "Resolved";
    if (r.outcome === "void") return "Void · positions refunded";
    if (r.by === "feed" && r.event)
      return `${safe(r.event.label)} · ${dateTime(r.event.time)}`;
    if (r.by === "deadline") return "No event by the deadline";
    if (r.by === "owner") return `Owner resolution · ${safe(r.note || "")}`;
    return "Resolved";
  };
  function renderPanel() {
    if (!snapshot) return;
    const el = $("aero-market-panel");
    if (panel === "book") {
      const b = snapshot.book[side],
        asks = b.asks.slice(0, 5).reverse(),
        bids = b.bids.slice(0, 5),
        max = Math.max(
          1,
          ...asks.map((o) => o.quantity),
          ...bids.map((o) => o.quantity),
        );
      const row = (o, ask) =>
        `<div class="aero-book-row ${ask ? "ask" : "bid"}" style="--depth:${(o.quantity / max) * 85}%"><span class="price">${cents(o.price)}</span><span>${money(o.quantity)}</span><span>${o.mine ? "You" : o.source === "player" ? (o.bot ? "Bot" : "Guest") : "Liquidity"}</span></div>`;
      el.innerHTML = `<div class="aero-book-head"><span>${label(side)} price</span><span>Shares</span><span>Source</span></div>${asks.map((o) => row(o, true)).join("")}<div class="book-spread">${label(side)} · Buy ${cents(snapshot.quotes[side].ask)} / Sell ${cents(snapshot.quotes[side].bid)}</div>${bids.map((o) => row(o, false)).join("")}<p class="book-caption">Simulated market makers and bots provide early liquidity from the official event rate only.</p>`;
    } else if (panel === "activity") {
      el.innerHTML =
        snapshot.trades
          .slice(0, 15)
          .map(
            (t) =>
              `<div class="flow-activity"><strong>${label(t.side)} · ${cents(t.price)}</strong><span>${safe(t.actor)}${t.bot ? " · Bot" : ""} · ${money(t.quantity)} shares</span><span>${dateTime(t.time)}</span></div>`,
          )
          .join("") || '<p class="book-caption">Trades will appear here.</p>';
    } else {
      el.innerHTML =
        snapshot.history
          .slice(0, 12)
          .map(
            (r) =>
              `<div class="flow-result"><strong>${dateOnly(r.windowStart || r.start)} → ${dateOnly(r.deadline || r.end)}</strong><span>${resolutionText(r.resolution)}</span><strong class="${safe(r.outcome)}">${label(r.outcome)}</strong></div>`,
          )
          .join("") ||
        '<p class="book-caption">Completed windows will appear here.</p>';
    }
  }
  function renderEvents() {
    const feed = snapshot?.live.feed,
      w = snapshot?.live.window;
    const events = (feed?.events || []).slice().reverse().slice(0, 12);
    $("live-events").innerHTML = events.length
      ? events
          .map(
            (e) =>
              `<li class="${e.time >= w.start && e.time < w.deadline ? "in-window" : ""}"><time datetime="${new Date(e.time).toISOString()}">${dateTime(e.time)}</time><span>${e.url ? `<a href="${safe(e.url)}" target="_blank" rel="noopener">${safe(e.label)} ↗</a>` : safe(e.label)}${e.detail ? `<small>${safe(e.detail)}</small>` : ""}</span></li>`,
          )
          .join("")
      : `<li><span>${feed ? "No events reported yet by the official record." : "Waiting for the first check of the official record."}</span></li>`;
  }
  function renderObservation() {
    if (!snapshot) return;
    const live = snapshot.live,
      r = snapshot.round,
      feed = live.feed,
      now = serverNow();
    const last = feed?.events?.length ? feed.events.at(-1) : null;
    $("live-last-event").innerHTML = last
      ? `${safe(dateTime(last.time))}<small>${safe(last.label)}</small>`
      : "—<small>No events on record yet</small>";
    const stale =
      !feed || !feed.fetchedAt || now - feed.fetchedAt > def.source.staleMs;
    $("live-feed-status").innerHTML = feed
      ? `<span class="${stale ? "live-feed-stale" : "live-feed-ok"}">${feed.fetchedAt ? safe(relative(feed.fetchedAt)) : "never"}</span><small>${feed.ok ? safe(feed.source || def.source.name) : "Last check failed · " + safe(feed.error || "unavailable")}</small>`
      : "—<small>First check pending</small>";
    $("live-window-start").textContent = dateTime(live.window.start);
    $("live-window-end").textContent = dateTime(live.window.deadline);
    $("live-model").innerHTML = `${Math.round(live.model.probability * 100)}% ${safe(def.outcomes[0])}<small>mean gap ${live.model.intervalDays.toFixed(1)} d · ${safe(live.model.basis)}</small>`;
    $("live-eyebrow").textContent =
      `${def.eyebrow} · DEADLINE ${dateOnly(live.window.deadline).toUpperCase()}`;
    $("live-title").textContent = Live.question(def, live.window.deadline);
    $("live-deadline-short").textContent =
      r.phase === "open"
        ? `${remaining(live.window.deadline - now)} left`
        : r.phase === "awaiting"
          ? "Deadline passed"
          : `Next window in ${remaining(r.nextAt - now)}`;
    $("live-clock-label").textContent =
      r.phase === "open"
        ? "TIME TO DEADLINE"
        : r.phase === "awaiting"
          ? "AWAITING OFFICIAL RECORD"
          : "NEXT WINDOW OPENS IN";
    $("live-countdown").textContent =
      r.phase === "open"
        ? remaining(live.window.deadline - now)
        : r.phase === "awaiting"
          ? "Checking…"
          : remaining(r.nextAt - now);
    $("live-phase").textContent =
      Date.now() - lastUpdate > 10000
        ? "RECONNECTING"
        : r.phase === "open"
          ? "LIVE STREAM · MARKET OPEN"
          : r.phase === "awaiting"
            ? "TRADING CLOSED · AWAITING RECORD"
            : "RESOLVED";
    const res = live.resolution;
    $("stage-result").hidden = r.phase !== "result";
    $("stage-result").innerHTML =
      r.phase === "result" && res
        ? `<strong>${safe(res.outcome === "void" ? "Void" : label(res.outcome === "yes" ? "up" : "down"))}${res.outcome === "void" ? "" : " wins"}</strong><small>${resolutionText(res)}</small>`
        : "";
    $("live-phase-note").hidden = r.phase === "open" && !stale;
    $("live-phase-note").textContent =
      r.phase === "awaiting"
        ? `The deadline has passed. ${def.outcomes[1]} settles as soon as the official record has been checked after the deadline; a ${def.eventNoun} recorded with a start time inside the window would settle ${def.outcomes[0]}.`
        : r.phase === "result"
          ? `This window has resolved. The next window opens ${dateTime(r.nextAt)} with a new deadline.`
          : stale
            ? `The official record has not been checked successfully for a while. Quotes still reflect the last good check; settlement waits for a fresh one.`
            : "";
    $("review-trade").disabled = !ready();
  }
  function drawTimeline() {
    if (!snapshot) return;
    const live = snapshot.live,
      ctx = timeline.getContext("2d"),
      dpr = window.devicePixelRatio || 1,
      width = timeline.clientWidth,
      height = timeline.clientHeight;
    if (!width || !height) return;
    if (timeline.width !== Math.round(width * dpr)) {
      timeline.width = Math.round(width * dpr);
      timeline.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const events = live.feed?.events || [],
      now = serverNow(),
      w = live.window;
    const lookback = Math.max(
      60 * 86400000,
      (w.deadline - w.start) * 2,
      events.length ? now - events.at(-Math.min(8, events.length)).time : 0,
    );
    const t0 = Math.min(w.start, now) - lookback * 0.08 - lookback,
      t1 = Math.max(w.deadline, now) + (w.deadline - w.start) * 0.12;
    const padL = 10,
      padR = 10,
      top = 22,
      base = height - 30;
    const x = (t) => padL + ((t - t0) / (t1 - t0)) * (width - padL - padR);
    ctx.fillStyle = "#eef3fb";
    ctx.fillRect(x(w.start), top, x(w.deadline) - x(w.start), base - top);
    ctx.strokeStyle = "#d8dee8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, base);
    ctx.lineTo(width - padR, base);
    ctx.stroke();
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#7b8999";
    ctx.textAlign = "left";
    ctx.fillText(dateOnly(t0), padL, base + 16);
    ctx.textAlign = "right";
    ctx.fillText(dateOnly(t1), width - padR, base + 16);
    ctx.textAlign = "center";
    ctx.fillStyle = "#5b6b80";
    ctx.fillText("window", (x(w.start) + x(w.deadline)) / 2, top - 8);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = def.accent;
    ctx.beginPath();
    ctx.moveTo(x(w.deadline), top - 4);
    ctx.lineTo(x(w.deadline), base);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = def.accent;
    ctx.fillText("deadline", Math.min(width - 28, x(w.deadline)), base + 28);
    for (const e of events) {
      if (e.time < t0 || e.time > t1) continue;
      const inWindow = e.time >= w.start && e.time < w.deadline;
      ctx.strokeStyle = inWindow ? def.accent : "#c9a24a";
      ctx.lineWidth = inWindow ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x(e.time), base);
      ctx.lineTo(x(e.time), top + 14);
      ctx.stroke();
      ctx.fillStyle = inWindow ? def.accent : "#e2b85c";
      ctx.beginPath();
      ctx.arc(x(e.time), top + 12, inWindow ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#3376d7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x(now), top + 4);
    ctx.lineTo(x(now), base);
    ctx.stroke();
    ctx.fillStyle = "#3376d7";
    ctx.textAlign = "center";
    ctx.fillText("now", x(now), base + 28);
  }
  function review() {
    const fail = (message) => {
      $("trade-error").textContent = message;
    };
    fail("");
    if (!ready())
      return fail("Reconnect and wait for an open window before trading.");
    const amount = Number($("trade-amount").value),
      price = Number($("limit-price").value);
    if (!Number.isFinite(amount) || amount <= 0)
      return fail("Enter a positive amount.");
    if (
      type() === "limit" &&
      (!Number.isFinite(price) || price < 0.01 || price > 0.99)
    )
      return fail("Choose a price from 0.01 to 0.99 gold.");
    if (
      action === "buy" &&
      (type() === "limit" ? amount * price : amount) >
        snapshot.player.balance + 1e-8
    )
      return fail("You do not have enough available gold.");
    if (
      action === "sell" &&
      amount > snapshot.player.positions[side].available + 1e-8
    )
      return fail("You do not have enough available shares.");
    pending = {
      side,
      action,
      type: type(),
      roundId: snapshot.round.id,
      marketId: client.marketId,
      price,
      ...(quantityInput() ? { quantity: amount } : { amount }),
    };
    $("confirm-summary").innerHTML =
      `<div><span>Prediction</span><strong>${label(side)}</strong></div><div><span>Order</span><strong>${action === "buy" ? "Buy" : "Sell"} · ${type() === "limit" ? "Limit" : "Market"}</strong></div><div><span>${quantityInput() ? "Shares" : "Spend up to"}</span><strong>${money(amount)} ${quantityInput() ? "shares" : "G"}</strong></div><div><span>${type() === "limit" ? "Limit price" : "Current quote"}</span><strong>${cents(type() === "limit" ? price : quote())}</strong></div><div><span>Deadline</span><strong>${safe(dateTime(snapshot.live.window.deadline))}</strong></div>`;
    $("confirm-error").textContent = "";
    $("confirm-submit").disabled = false;
    $("confirm-submit").textContent = "Confirm trade";
    $("trade-confirm").showModal();
  }
  async function submit() {
    if (submitting || !pending) return;
    if (
      !ready() ||
      pending.roundId !== snapshot.round.id ||
      pending.marketId !== client.marketId
    ) {
      $("confirm-error").textContent =
        "This quote expired. Close this window and review the new window.";
      $("confirm-submit").disabled = true;
      return;
    }
    submitting = true;
    $("confirm-submit").disabled = true;
    $("confirm-submit").textContent = "Placing trade…";
    try {
      const data = await client.api("order", pending);
      client.accept(data.snapshot);
      $("trade-confirm").close();
      pending = null;
    } catch (error) {
      $("confirm-error").textContent = error.message;
    } finally {
      submitting = false;
      $("confirm-submit").disabled = false;
      $("confirm-submit").textContent = "Confirm trade";
    }
  }
  for (const s of ["up", "down"])
    $("choose-" + s).onclick = () => {
      side = s;
      renderTicket();
      renderPanel();
    };
  for (const a of ["buy", "sell"])
    $("trade-" + a).onclick = () => {
      action = a;
      renderTicket();
    };
  $("trade-type").onchange = renderTicket;
  $("trade-amount").oninput = renderTicket;
  $("limit-price").oninput = renderTicket;
  document.querySelectorAll("[data-add]").forEach(
    (b) =>
      (b.onclick = () => {
        $("trade-amount").value =
          Math.max(0, Number($("trade-amount").value)) + Number(b.dataset.add);
        renderTicket();
      }),
  );
  $("amount-max").onclick = () => {
    if (!snapshot) return;
    const max =
      action === "sell"
        ? snapshot.player.positions[side].available
        : snapshot.player.balance /
          (type() === "limit" ? Number($("limit-price").value) || 0.5 : 1);
    $("trade-amount").value = Math.floor(max * 100) / 100;
    renderTicket();
  };
  document.querySelectorAll("[data-panel]").forEach(
    (b) =>
      (b.onclick = () => {
        panel = b.dataset.panel;
        document
          .querySelectorAll("[data-panel]")
          .forEach((t) => t.setAttribute("aria-selected", t === b));
        $("aero-market-panel").setAttribute("aria-labelledby", b.id);
        renderPanel();
      }),
  );
  $("review-trade").onclick = review;
  $("confirm-submit").onclick = submit;
  const close = () => {
    if (!submitting) {
      $("trade-confirm").close();
      pending = null;
    }
  };
  $("confirm-close").onclick = close;
  $("confirm-cancel").onclick = close;
  $("trade-confirm").addEventListener("cancel", (e) => {
    if (submitting) e.preventDefault();
    else pending = null;
  });
  $("aero-orders").onclick = async (event) => {
    const b = event.target.closest("[data-cancel]");
    if (!b) return;
    b.disabled = true;
    try {
      const data = await client.api("cancel", { orderId: b.dataset.cancel });
      client.accept(data.snapshot);
    } catch (error) {
      $("trade-error").textContent = error.message;
      b.disabled = false;
    }
  };
  $("download-conditions").onclick = () => {
    if (!snapshot) return;
    const live = snapshot.live,
      payload = {
        schemaVersion: 1,
        experiment: kind,
        title: def.title,
        roundId: snapshot.round.id,
        windowOpenedUtc: new Date(live.window.start).toISOString(),
        deadlineUtc: new Date(live.window.deadline).toISOString(),
        phase: live.phase,
        resolution: live.resolution,
        schedule: live.schedule,
        settlement: def.rule,
        officialRecord: { ...def.source, snapshot: live.feed },
        liveStream: def.stream,
        liquidityModel: live.model,
        exportedUtc: new Date(serverNow()).toISOString(),
      };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2) + "\n"], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-${snapshot.round.id}-window.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("live-video-note").hidden = !def.stream.note;
  $("live-video-note").textContent = def.stream.note || "";
  window.addEventListener("resize", drawTimeline);
  setInterval(renderObservation, 1000);
  client.start();
})();
