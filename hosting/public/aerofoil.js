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

  const canvas = $("flow-canvas");
  const renderer = new FlowRenderer(canvas);
  function drawField() {
    renderer.update(snapshot, params);
  }
  function resize() {
    renderer.resize();
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
    renderer.render(now);
    requestAnimationFrame(animate);
  }
  $("toggle-streamlines").onclick = () => {
    renderer.dust = !renderer.dust;
    $("toggle-streamlines").setAttribute("aria-pressed", renderer.dust);
    $("toggle-streamlines").textContent =
      `Tracer dust ${renderer.dust ? "on" : "off"}`;
  };
  $("toggle-exposure").onclick = () => {
    renderer.exposure = !renderer.exposure;
    $("toggle-exposure").setAttribute("aria-pressed", renderer.exposure);
    $("toggle-exposure").textContent = renderer.exposure
      ? "Long exposure"
      : "Short exposure";
  };
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
