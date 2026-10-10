(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    { safe, money } = PhysicsGuest;
  const label = (s) => (s === "up" ? "Above" : "Below"),
    cents = (n) => `${Math.round(n * 100)}¢`;
  let snapshot,
    params,
    side =
      new URLSearchParams(location.search).get("side") === "down"
        ? "down"
        : "up";
  let action = "buy",
    panel = "book",
    pending,
    submitting = false,
    lastUpdate = 0,
    streamlines = true;
  let shownParticle,
    previousParticle,
    particleReceived = 0,
    lastRound;
  const client = new PhysicsGuest.Client(
    (data) => {
      if (!data.flow) return;
      previousParticle =
        lastRound === data.round.id
          ? shownParticle || data.flow.particle
          : data.flow.particle;
      particleReceived = performance.now();
      lastRound = data.round.id;
      snapshot = data;
      lastUpdate = Date.now();
      $("flow-loading").hidden = true;
      $("aero-balance").textContent = money(data.player.balance);
      $("target-y").innerHTML =
        `${data.round.opening.toFixed(4)} <small>y/c</small>`;
      $("particle-y").innerHTML =
        `${data.flow.particle[1].toFixed(4)} <small>y/c</small>`;
      $("flow-time").textContent =
        `${data.flow.elapsedPhysicalSeconds.toFixed(2)} s physical time · Ends at the outlet`;
      $("dataset-id").textContent =
        `Dataset: ${data.flow.dataset} · Genuine OpenFOAM fields`;
      $("release-y").textContent = String(data.flow.model.releaseY);
      renderTicket();
      renderPanel();
      renderPositions();
      drawField();
      drawHeight();
    },
    (message) => {
      $("aero-connection").textContent = message;
      if (!snapshot) $("flow-loading").textContent = message;
    },
  );
  client.marketId = "aerofoil";
  client.intervalMs = 1000;
  const ready = () => snapshot && Date.now() - lastUpdate < 10000;
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
    $("review-trade").textContent = `Review ${action} ${label(side)}`;
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
    } else
      el.innerHTML =
        snapshot.history
          .slice(0, 12)
          .map(
            (r) =>
              `<div class="flow-result"><strong>${new Date(r.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong><span>${r.opening.toFixed(4)} → ${r.close.toFixed(4)} y/c</span><strong class="${r.outcome}">${label(r.outcome)}</strong></div>`,
          )
          .join("") ||
        '<p class="book-caption">The next completed round will appear here.</p>';
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
      `<div><span>Prediction</span><strong>${label(side)}</strong></div><div><span>Order</span><strong>${action === "buy" ? "Buy" : "Sell"} · ${type() === "limit" ? "Limit" : "Market"}</strong></div><div><span>${quantityInput() ? "Shares" : "Spend up to"}</span><strong>${money(amount)} ${quantityInput() ? "shares" : "G"}</strong></div><div><span>${type() === "limit" ? "Limit price" : "Current quote"}</span><strong>${cents(type() === "limit" ? price : quote())}</strong></div>`;
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

  // Instantaneous streamlines from observed CFD; only the gold tracer settles.
  const canvas = $("flow-canvas"),
    ctx = canvas.getContext("2d"),
    background = document.createElement("canvas"),
    bg = background.getContext("2d");
  let width = 800,
    height = 400;
  const xy = (p) => [
    26 + ((p[0] + 3) / 9) * (width - 66),
    height / 2 - (p[1] / 3) * (height - 95),
  ];
  function velocity(x, y) {
    const f = snapshot.flow,
      g = f.grid,
      a = ((x - g.xmin) / (g.xmax - g.xmin)) * (g.nx - 1),
      b = ((y - g.ymin) / (g.ymax - g.ymin)) * (g.ny - 1);
    if (a < 0 || b < 0 || a >= g.nx - 1 || b >= g.ny - 1) return null;
    const i = Math.floor(a),
      j = Math.floor(b),
      u = a - i,
      v = b - j,
      w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v],
      ids = [
        j * g.nx + i,
        j * g.nx + i + 1,
        (j + 1) * g.nx + i,
        (j + 1) * g.nx + i + 1,
      ],
      out = [0, 0];
    for (let k = 0; k < 4; k++)
      for (let c = 0; c < 2; c++)
        out[c] += (f.field[ids[k] * 2 + c] * w[k]) / g.scale;
    return out;
  }
  function drawField() {
    bg.clearRect(0, 0, width, height);
    bg.fillStyle = "#0c1828";
    bg.fillRect(0, 0, width, height);
    const glow = bg.createRadialGradient(
      width * 0.49,
      height * 0.46,
      5,
      width * 0.49,
      height * 0.46,
      width * 0.6,
    );
    glow.addColorStop(0, "#122840");
    glow.addColorStop(1, "#0c1828");
    bg.fillStyle = glow;
    bg.fillRect(0, 0, width, height);
    bg.strokeStyle = "#273d542f";
    bg.lineWidth = 0.6;
    for (let x = -3; x <= 6; x++) {
      const p = xy([x, 0]);
      bg.beginPath();
      bg.moveTo(p[0], 40);
      bg.lineTo(p[0], height - 40);
      bg.stroke();
    }
    for (let y = -1.5; y <= 1.5; y += 0.5) {
      const p = xy([0, y]);
      bg.beginPath();
      bg.moveTo(26, p[1]);
      bg.lineTo(width - 40, p[1]);
      bg.stroke();
    }
    if (!snapshot) return;
    if (streamlines)
      for (let row = 0; row < 21; row++)
        for (let col = 0; col < 8; col++) {
          let x = -2.96 + col * 1.13,
            y = -1.34 + row * 0.134,
            speed = 1;
          bg.beginPath();
          bg.moveTo(...xy([x, y]));
          for (let i = 0; i < 28; i++) {
            const v = velocity(x, y);
            if (!v) break;
            speed = Math.hypot(...v);
            if (speed < 0.025) break;
            const dt = 0.029 / Math.max(speed, 0.1);
            x += v[0] * dt;
            y += v[1] * dt;
            bg.lineTo(...xy([x, y]));
          }
          bg.strokeStyle = `rgba(${speed < 0.75 ? "98,174,182" : "82,139,185"},${speed < 0.75 ? 0.52 : 0.32})`;
          bg.lineWidth = 0.75;
          bg.stroke();
        }
    if (params?.geometry) {
      bg.beginPath();
      params.geometry.forEach((p, i) =>
        i ? bg.lineTo(...xy(p)) : bg.moveTo(...xy(p)),
      );
      bg.closePath();
      const metal = bg.createLinearGradient(0, height * 0.41, 0, height * 0.59);
      metal.addColorStop(0, "#d9e4ee");
      metal.addColorStop(0.5, "#9daec2");
      metal.addColorStop(1, "#526b88");
      bg.fillStyle = metal;
      bg.fill();
      bg.strokeStyle = "#cadbec";
      bg.lineWidth = 0.7;
      bg.stroke();
      bg.fillStyle = "#7892ae";
      bg.font = "9px system-ui";
      bg.textAlign = "center";
      bg.fillText("NACA 0012", ...xy([0.25, -0.65]));
    }
    const outlet = xy([6, 0])[0];
    bg.strokeStyle = "#6c8da759";
    bg.beginPath();
    bg.moveTo(outlet, 44);
    bg.lineTo(outlet, height - 44);
    bg.stroke();
    bg.fillStyle = "#7188a1";
    bg.font = "8px system-ui";
    bg.textAlign = "left";
    bg.fillText("INLET", 26, height - 45);
    bg.textAlign = "right";
    bg.fillText("OUTLET", outlet, height - 45);
  }
  function resize() {
    const box = canvas.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    width = box.width;
    height = box.height;
    for (const c of [canvas, background]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drawField();
  }
  function drawHeight() {
    const svg = $("height-chart");
    if (!svg || !snapshot) return;
    const points = snapshot.flow.points,
      target = snapshot.round.opening,
      ys = [target, ...points.map((p) => p[1])],
      min = Math.min(...ys) - 0.12,
      max = Math.max(...ys) + 0.12;
    const y = (v) => 97 - ((v - min) / (max - min)) * 77,
      chartSeconds = Math.max(120, Math.ceil((points.length - 1) / 30) * 30),
      clockLabel = (sec) =>
        `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`,
      x = (i) => 12 + (i / chartSeconds) * 650,
      path = points
        .map(
          (p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(p[1]).toFixed(2)}`,
        )
        .join(" ");
    svg.innerHTML = `<line x1="12" x2="662" y1="${y(target)}" y2="${y(target)}" stroke="#97a4b7" stroke-width="1" stroke-dasharray="5 5"/><path d="${path}" fill="none" stroke="#d5a44d" stroke-width="2" stroke-linecap="round"/><circle cx="${x(points.length - 1)}" cy="${y(points.at(-1)[1])}" r="3" fill="#d5a44d"/><text x="668" y="${y(target) + 3}" fill="#8897ac" font-size="9">${target.toFixed(3)}</text><text x="12" y="119" fill="#a0aabb" font-size="9">0:00</text><text x="325" y="119" fill="#a0aabb" font-size="9">${clockLabel(chartSeconds / 2)}</text><text x="638" y="119" fill="#a0aabb" font-size="9">${clockLabel(chartSeconds)}</text>`;
    svg.setAttribute(
      "aria-label",
      `Particle height ${points.at(-1)[1].toFixed(4)} chord lengths. Previous exit ${target.toFixed(4)}.`,
    );
  }
  function animate(now) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(background, 0, 0, width, height);
    if (snapshot) {
      const target = xy([6, snapshot.round.opening]);
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "#acbfd28f";
      ctx.beginPath();
      ctx.moveTo(...xy([-3, snapshot.round.opening]));
      ctx.lineTo(...target);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#c5d2e0";
      ctx.beginPath();
      ctx.arc(...target, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "8px system-ui";
      ctx.textAlign = "right";
      ctx.fillStyle = "#7fcbb4";
      ctx.fillText("ABOVE", target[0] - 7, Math.max(56, target[1] - 12));
      ctx.fillStyle = "#d68d99";
      ctx.fillText(
        "BELOW",
        target[0] - 7,
        Math.min(height - 55, target[1] + 18),
      );
      ctx.beginPath();
      snapshot.flow.points.forEach((p, i) =>
        i ? ctx.lineTo(...xy(p)) : ctx.moveTo(...xy(p)),
      );
      ctx.strokeStyle = "#eac582a0";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      const next = snapshot.flow.particle,
        t = Math.min(1, (now - particleReceived) / 950);
      shownParticle = next.map(
        (v, i) => (previousParticle?.[i] ?? v) * (1 - t) + v * t,
      );
      const p = xy(shownParticle);
      ctx.strokeStyle = "#edc17480";
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(26, p[1]);
      ctx.lineTo(width - 40, p[1]);
      ctx.stroke();
      ctx.shadowColor = "#ffdc99";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffdd9a";
      ctx.beginPath();
      ctx.arc(...p, 3.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(...p, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "#d7b67555";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    requestAnimationFrame(animate);
  }
  $("toggle-streamlines").onclick = () => {
    streamlines = !streamlines;
    $("toggle-streamlines").setAttribute("aria-pressed", streamlines);
    $("toggle-streamlines").textContent =
      `Streamlines ${streamlines ? "on" : "off"}`;
    drawField();
  };
  new ResizeObserver(resize).observe(canvas);
  fetch("geometry/parameters.json")
    .then((r) => r.json())
    .then((data) => {
      params = data;
      drawField();
    })
    .catch(() => {});
  setInterval(() => {
    if (!snapshot) return;
    const elapsed = Math.max(
      0,
      Math.floor(
        (Date.now() + (client.offset || 0) - snapshot.round.start) / 1000,
      ),
    );
    $("aero-countdown").textContent =
      `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
    $("flow-progress-bar").style.width =
      `${Math.max(0, Math.min(100, ((snapshot.flow.particle[0] + 3) / 9) * 100))}%`;
    $("review-trade").disabled = !ready();
    if (
      pending &&
      !submitting &&
      (!ready() || pending.roundId !== snapshot.round.id)
    ) {
      $("confirm-submit").disabled = true;
      $("confirm-error").textContent =
        "This quote expired. Close this window and review the current round.";
    }
    if (Date.now() - lastUpdate > 10000)
      $("aero-connection").textContent =
        "Connection lost · Trading paused until reconnection";
  }, 250);
  renderTicket();
  resize();
  requestAnimationFrame(animate);
  client.start();
})();
