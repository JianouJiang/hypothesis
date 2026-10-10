(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    { safe, money } = PhysicsGuest;
  const isGalton = document.body.dataset.game === "galton",
    query = new URLSearchParams(location.search);
  let selectedSlot = Math.max(1, Math.min(7, Number(query.get("slot")) || 4));
  const label = (s) => (s === "up" ? "Yes" : s === "down" ? "No" : "Void"),
    cents = (n) => `${Math.round(n * 100)}¢`;
  let snapshot,
    scene,
    side = query.get("side") === "down" ? "down" : "up",
    action = "buy",
    panel = "book",
    pending,
    submitting = false,
    lastUpdate = 0;
  const colors = [
    "#6dbda9",
    "#71b2c6",
    "#839cc7",
    "#aaa1d4",
    "#c4a0c4",
    "#d7ad80",
    "#cb967d",
  ];
  const client = new PhysicsGuest.Client(
    (data) => {
      if (!data.physics || data.marketId !== client.marketId) return;
      if (scene?.round.id !== data.round.id) {
        lastSoundTime = Infinity;
        ringRipples = [];
      }
      scene = data;
      snapshot = data;
      lastUpdate = Date.now();
      $("physics-loading").hidden = true;
      $("aero-balance").textContent = money(data.player.balance);
      $("selected-contract").textContent = isGalton
        ? `Slot ${selectedSlot} · Will the ball land here?`
        : "Will the ball escape all three rings?";
      $("confirm-market-name").textContent = isGalton
        ? `Galton board · Slot ${selectedSlot}`
        : "Ring escape · 60 second challenge";
      renderTicket();
      renderPositions();
      renderPanel();
      renderSlots();
    },
    (message) => {
      $("aero-connection").textContent = message;
      if (!snapshot) $("physics-loading").textContent = message;
    },
  );
  client.marketId = isGalton ? `galton-${selectedSlot}` : "escape";
  client.intervalMs = 1000;
  const ready = () =>
    snapshot && !snapshot.round.closed && Date.now() - lastUpdate < 10000;
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
    $("review-trade").textContent = snapshot?.round.closed
      ? "Waiting for the next round"
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
      el.innerHTML = `<div class="aero-book-head"><span>${label(side)} price</span><span>Shares</span><span>Source</span></div>${asks.map((o) => row(o, true)).join("")}<div class="book-spread">${label(side)} · Buy ${cents(snapshot.quotes[side].ask)} / Sell ${cents(snapshot.quotes[side].bid)}</div>${bids.map((o) => row(o, false)).join("")}<p class="book-caption">Simulated market makers and bots provide early liquidity using elapsed observations only.</p>`;
    } else if (panel === "activity") {
      el.innerHTML =
        snapshot.trades
          .slice(0, 15)
          .map(
            (t) =>
              `<div class="flow-activity"><strong>${label(t.side)} · ${cents(t.price)}</strong><span>${safe(t.actor)}${t.bot ? " · Bot" : ""} · ${money(t.quantity)} shares</span><span>${new Date(t.time).toLocaleTimeString()}</span></div>`,
          )
          .join("") || '<p class="book-caption">Trades will appear here.</p>';
    } else {
      el.innerHTML =
        snapshot.history
          .slice(0, 12)
          .map(
            (r) =>
              `<div class="flow-result"><strong>${new Date(r.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong><span>${isGalton ? (r.winningSlot != null ? "Slot " + (r.winningSlot + 1) : "No landing") : "60 second challenge"}</span><strong class="${r.outcome}">${r.outcome === "void" ? "Refunded" : isGalton ? (r.winningSlot != null ? "Landed" : "Void") : r.outcome === "up" ? "Escaped" : "Stayed inside"}</strong></div>`,
          )
          .join("") ||
        '<p class="book-caption">Completed rounds will appear here.</p>';
    }
  }
  function review() {
    const fail = (message) => {
      $("trade-error").textContent = message;
    };
    fail("");
    if (!ready())
      return fail("Reconnect and wait for the current round before trading.");
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
      price,
      ...(quantityInput() ? { quantity: amount } : { amount }),
    };
    $("confirm-summary").innerHTML =
      `<div><span>Prediction</span><strong>${isGalton ? "Slot " + selectedSlot + " · " : ""}${label(side)}</strong></div><div><span>Order</span><strong>${action === "buy" ? "Buy" : "Sell"} · ${type() === "limit" ? "Limit" : "Market"}</strong></div><div><span>${quantityInput() ? "Shares" : "Spend up to"}</span><strong>${money(amount)} ${quantityInput() ? "shares" : "G"}</strong></div><div><span>${type() === "limit" ? "Limit price" : "Current quote"}</span><strong>${cents(type() === "limit" ? price : quote())}</strong></div>`;
    $("confirm-error").textContent = "";
    $("confirm-submit").disabled = false;
    $("confirm-submit").textContent = "Confirm trade";
    $("trade-confirm").showModal();
  }
  async function submit() {
    if (submitting || !pending) return;
    if (!ready() || pending.roundId !== snapshot.round.id) {
      $("confirm-error").textContent =
        "This quote expired. Close this window and review the new round.";
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

  function renderSlots() {
    if (!isGalton || !snapshot?.outcomes) return;
    const host = $("slot-markets");
    if (!host.children.length)
      host.innerHTML = snapshot.outcomes
        .map(
          (o, i) =>
            `<div class="slot-row" data-row="${o.slot}" style="--slot-color:${colors[i]}"><div class="slot-name"><span class="slot-swatch">${o.slot}</span><div><b>Slot ${o.slot}</b><small>${["Far left", "Left", "Inner left", "Center", "Inner right", "Right", "Far right"][i]}</small></div></div><strong class="slot-probability" id="slot-prob-${o.slot}">—</strong><button class="slot-order" data-slot="${o.slot}" data-side="up">Yes —</button><button class="slot-order" data-slot="${o.slot}" data-side="down">No —</button></div>`,
        )
        .join("");
    for (const o of snapshot.outcomes) {
      $(`slot-prob-${o.slot}`).textContent =
        `${Math.round(o.probability * 100)}%`;
      host
        .querySelector(`[data-row="${o.slot}"]`)
        .classList.toggle("selected", o.slot === selectedSlot);
      for (const s of ["up", "down"]) {
        const button = host.querySelector(
          `[data-slot="${o.slot}"][data-side="${s}"]`,
        );
        button.textContent = `${label(s)} ${cents(o.quotes[s].ask)}`;
        button.setAttribute(
          "aria-pressed",
          o.slot === selectedSlot && s === side,
        );
        button.setAttribute(
          "aria-label",
          `Trade ${label(s)} on slot ${o.slot} at ${cents(o.quotes[s].ask)}`,
        );
      }
    }
  }
  if (isGalton)
    $("slot-markets").onclick = (event) => {
      const b = event.target.closest("[data-slot]");
      if (!b || submitting) return;
      selectedSlot = Number(b.dataset.slot);
      side = b.dataset.side;
      const next = `galton-${selectedSlot}`;
      history.replaceState(
        {},
        "",
        `galton.html?slot=${selectedSlot}&side=${side}`,
      );
      if (client.marketId !== next) {
        client.marketId = next;
        snapshot = null;
        lastUpdate = 0;
        pending = null;
        client.refresh();
      } else {
        renderTicket();
        renderPanel();
        renderSlots();
      }
      $("review-trade").disabled = !ready();
    };

  const canvas = $("physics-canvas"),
    ctx = canvas.getContext("2d");
  let width = 700,
    height = 550,
    audioCtx,
    music = false,
    lastSoundTime = Infinity,
    lastNoteAt = 0,
    ringRipples = [];
  function resize() {
    const b = canvas.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    width = b.width;
    height = b.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  const position = (x, y) => {
    const scale = isGalton
      ? Math.min((width - 65) / 7.7, (height - 100) / 9.6)
      : Math.min(width - 50, height - 95) / 9.2;
    return [
      width / 2 + x * scale,
      isGalton ? 49 + y * scale : height / 2 + y * scale,
      scale,
    ];
  };
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function sample(frames, t) {
    let i = 0;
    while (i < frames.length - 1 && frames[i + 1][0] <= t) i++;
    const a = frames[i],
      b = frames[Math.min(i + 1, frames.length - 1)],
      u =
        b[0] === a[0]
          ? 0
          : Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    return a.map((v, k) => (k === 0 ? t : v * (1 - u) + b[k] * u));
  }
  // The score comes entirely from measured contact impulses. No looping track.
  function impactNote(hit) {
    if (!music || !audioCtx || audioCtx.state !== "running" || document.hidden)
      return;
    const now = audioCtx.currentTime;
    if (now - lastNoteAt < 0.065) return;
    lastNoteAt = now;
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const index = isGalton
      ? hit[3] % 8
      : Math.min(7, hit[3] * 2 + Math.floor((hit[1] + 4) / 4));
    const hz = 220 * Math.pow(2, scale[index] / 12),
      strength = Math.max(0.1, hit[4]);
    const gain = audioCtx.createGain(),
      pan = audioCtx.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, hit[1] / 4));
    gain.connect(pan);
    pan.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.045 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    for (const [partial, level] of [
      [1, 1],
      [2, 0.25],
      [3, 0.075],
    ]) {
      const osc = audioCtx.createOscillator(),
        amp = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz * partial;
      amp.gain.value = level;
      osc.connect(amp);
      amp.connect(gain);
      osc.start(now);
      osc.stop(now + 1.12);
      osc.onended = () => {
        osc.disconnect();
        amp.disconnect();
      };
    }
    setTimeout(() => {
      gain.disconnect();
      pan.disconnect();
    }, 1300);
  }
  $("sound-toggle").onclick = async () => {
    if (!music) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) {
        $("sound-toggle").textContent = "Audio unavailable";
        return;
      }
      audioCtx ||= new Audio();
      await audioCtx.resume();
      music = true;
      lastSoundTime = Infinity;
    } else {
      music = false;
      await audioCtx.suspend();
    }
    $("sound-toggle").textContent = music
      ? "♫ Mute collision music"
      : "♫ Play collision music";
    $("sound-toggle").setAttribute("aria-pressed", music);
  };
  document.addEventListener("visibilitychange", () => {
    lastSoundTime = Infinity;
    if (document.hidden && audioCtx) audioCtx.suspend();
    else if (music && audioCtx) audioCtx.resume().catch(() => {});
  });
  function drawBoard(physics, point) {
    const c = physics.config,
      p0 = position(-3.75, -0.1),
      p1 = position(3.75, 9.3),
      scale = p0[2];
    ctx.save();
    ctx.shadowColor = "#0008";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#20232a";
    ctx.beginPath();
    ctx.roundRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1], 13);
    ctx.fill();
    ctx.restore();
    const material = ctx.createLinearGradient(p0[0], 0, p1[0], 0);
    material.addColorStop(0, "#2f343b");
    material.addColorStop(0.15, "#20232b");
    material.addColorStop(0.7, "#161d26");
    material.addColorStop(1, "#303943");
    ctx.fillStyle = material;
    ctx.beginPath();
    ctx.roundRect(
      p0[0] + 3,
      p0[1] + 3,
      p1[0] - p0[0] - 6,
      p1[1] - p0[1] - 6,
      10,
    );
    ctx.fill();
    for (let slot = 0; slot < 7; slot++) {
      const a = position(slot - 3.5, c.binTop),
        b = position(slot - 2.5, c.floor),
        won = physics.phase === "result" && physics.result === slot;
      ctx.fillStyle =
        colors[slot] + (won ? "65" : selectedSlot === slot + 1 ? "30" : "10");
      ctx.fillRect(a[0] + 1, a[1], b[0] - a[0] - 2, b[1] - a[1]);
      ctx.strokeStyle = "#6e7b884d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0], b[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b[0], a[1]);
      ctx.stroke();
      ctx.font = `600 ${Math.max(10, scale * 0.26)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = colors[slot];
      ctx.fillText(slot + 1, (a[0] + b[0]) / 2, b[1] + scale * 0.24);
    }
    for (const [x, y] of physics.pegs) {
      const p = position(x, y),
        r = c.pegRadius * scale;
      circle(p[0] + 1, p[1] + 2, r + 1, "#0005");
      const metal = ctx.createRadialGradient(
        p[0] - r * 0.4,
        p[1] - r * 0.5,
        0,
        p[0],
        p[1],
        r,
      );
      metal.addColorStop(0, "#f9ead3");
      metal.addColorStop(0.3, "#bcb7af");
      metal.addColorStop(0.75, "#717d86");
      metal.addColorStop(1, "#37424d");
      circle(p[0], p[1], r, metal);
    }
    const release = position(0, 0.05);
    ctx.strokeStyle = "#dbc69c50";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(release[0] - 12, release[1] - 4);
    ctx.lineTo(release[0] - 5, release[1] + 7);
    ctx.moveTo(release[0] + 12, release[1] - 4);
    ctx.lineTo(release[0] + 5, release[1] + 7);
    ctx.stroke();
  }
  function drawRings(physics, t) {
    const c = physics.config,
      center = position(0, 0),
      physical = Math.max(0, (t - c.preludeMs) / 1000);
    const palette = ["#84d2c2", "#c0acf0", "#f0c99a"];
    for (let i = 2; i >= 0; i--) {
      const radius = c.radii[i] * center[2],
        theta = physics.phases[i] + c.angularSpeeds[i] * physical;
      ctx.save();
      ctx.shadowColor = palette[i] + "60";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = palette[i];
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(
        center[0],
        center[1],
        radius,
        theta + c.gap / 2,
        theta + Math.PI * 2 - c.gap / 2,
      );
      ctx.stroke();
      ctx.restore();
      for (const a of [theta - c.gap / 2, theta + c.gap / 2])
        circle(
          center[0] + radius * Math.cos(a),
          center[1] + radius * Math.sin(a),
          2.3,
          palette[i],
        );
    }
    ctx.font = "9px system-ui";
    ctx.fillStyle = "#606779";
    ctx.textAlign = "center";
    ctx.fillText(
      physics.phase === "release"
        ? "PREDICTION WINDOW"
        : "FOLLOW THE COLLISIONS",
      center[0],
      height - 48,
    );
  }
  function frame(now) {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      5,
      width * 0.5,
      height * 0.5,
      width * 0.7,
    );
    bg.addColorStop(0, isGalton ? "#20242c" : "#161625");
    bg.addColorStop(1, "#090e18");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    if (!isGalton)
      for (let i = 0; i < 65; i++) {
        const x = (Math.sin(i * 127.1) + 1) * 0.5 * width,
          y = (Math.sin(i * 71.7 + 6) + 1) * 0.5 * height;
        ctx.fillStyle = "#d5d2ef" + (i % 3 === 0 ? "23" : "10");
        ctx.fillRect(x, y, 1, 1);
      }
    if (scene) {
      const physics = scene.physics,
        elapsed = Math.max(0, Date.now() + client.offset - scene.round.start),
        latest = physics.frames.at(-1)[0];
      const t = Math.max(
        physics.frames[0][0],
        Math.min(latest, elapsed - 1100),
      );
      const point = sample(physics.frames, t),
        p = position(point[1], point[2]);
      if (isGalton) drawBoard(physics, point);
      else drawRings(physics, t);
      const tail = physics.frames.filter(
        (q) => q[0] <= t && q[0] > t - (isGalton ? 4500 : 2600),
      );
      tail.forEach((q, i) => {
        if (!i) return;
        ctx.beginPath();
        ctx.moveTo(...position(tail[i - 1][1], tail[i - 1][2]).slice(0, 2));
        ctx.lineTo(...position(q[1], q[2]).slice(0, 2));
        ctx.strokeStyle = `rgba(${isGalton ? "236,216,174" : "200,191,237"},${(i / tail.length) * 0.35})`;
        ctx.lineWidth = isGalton ? 1.5 : 2.3;
        ctx.stroke();
      });
      if (!Number.isFinite(lastSoundTime)) lastSoundTime = t;
      for (const hit of physics.impacts || [])
        if (hit[0] > lastSoundTime && hit[0] <= t) {
          impactNote(hit);
          ringRipples.push({
            x: hit[1],
            y: hit[2],
            born: now,
            strength: hit[4],
          });
        }
      lastSoundTime = t;
      ringRipples = ringRipples.filter((r) => now - r.born < 650);
      for (const r of ringRipples) {
        const q = position(r.x, r.y),
          age = (now - r.born) / 650;
        ctx.lineWidth = 0.8;
        circle(
          q[0],
          q[1],
          4 + age * 15,
          null,
          `rgba(232,217,184,${(1 - age) * 0.6})`,
        );
      }
      const radius = Math.max(
        isGalton ? 3.6 : 4.5,
        physics.config.ballRadius * p[2],
      );
      ctx.save();
      ctx.shadowColor = isGalton ? "#f4d59b" : "#decaff";
      ctx.shadowBlur = isGalton ? 8 : 18;
      const ball = ctx.createRadialGradient(
        p[0] - radius * 0.3,
        p[1] - radius * 0.4,
        0,
        p[0],
        p[1],
        radius,
      );
      ball.addColorStop(0, "#fffff7");
      ball.addColorStop(0.45, isGalton ? "#e4d4ae" : "#e9dcff");
      ball.addColorStop(1, isGalton ? "#8a7b63" : "#9e8bd2");
      circle(p[0], p[1], radius, ball);
      ctx.restore();
      const resolved = physics.phase === "result" && t >= latest - 1;
      $("stage-result").hidden = !resolved;
      if (resolved) {
        const title =
          physics.result === "void"
            ? "Round refunded"
            : isGalton
              ? `Slot ${physics.result + 1}`
              : physics.result === "yes"
                ? "It escaped!"
                : "The rings held";
        $("stage-result").innerHTML =
          `<strong>${title}</strong><small>Next round in ${Math.max(0, Math.ceil((scene.round.nextAt - Date.now() - client.offset) / 1000))}s</small>`;
      }
      const release = Math.max(
        0,
        Math.ceil((physics.config.preludeMs - elapsed) / 1000),
      );
      const seconds =
        physics.phase === "release"
          ? release
          : isGalton
            ? Math.max(
                0,
                Math.floor((elapsed - physics.config.preludeMs) / 1000),
              )
            : Math.max(
                0,
                Math.ceil(
                  (scene.round.start +
                    physics.config.durationMs -
                    Date.now() -
                    client.offset) /
                    1000,
                ),
              );
      $("physics-clock").textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      $("physics-phase").textContent = resolved
        ? "ROUND COMPLETE"
        : physics.phase === "release"
          ? isGalton
            ? "RELEASING SOON"
            : "PREDICT BEFORE RELEASE"
          : "LIVE EXPERIMENT";
      $("physics-observation").textContent =
        `${Math.round(point[4])} impacts · ${isGalton ? "One ball at a time" : "Motor-driven rings"}`;
      $("physics-caption").textContent =
        physics.phase === "release"
          ? `Ball releases in ${release}s · Make your prediction`
          : isGalton
            ? `Slow motion · ${(Math.max(0, t - physics.config.preludeMs) / 1000 / physics.config.playbackScale).toFixed(2)} s physical time`
            : "Collision music follows actual contact impulses";
    }
    requestAnimationFrame(frame);
  }
  setInterval(() => {
    $("review-trade").disabled = !ready();
    if (
      pending &&
      !submitting &&
      (!ready() || pending.roundId !== snapshot?.round.id)
    ) {
      $("confirm-submit").disabled = true;
      $("confirm-error").textContent =
        "This round has closed or the connection was lost. Review a fresh order.";
    }
  }, 250);
  renderTicket();
  resize();
  requestAnimationFrame(frame);
  client.start();
})();
