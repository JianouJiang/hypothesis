(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    { safe, money } = PhysicsGuest;
  const query = new URLSearchParams(location.search),
    Labs = HypothesisExperiments;
  const kind = Labs.definitions[query.get("game")]
      ? query.get("game")
      : "convection",
    def = Labs.definitions[kind],
    multi = def.outcomes.length > 2;
  let choice = Math.max(
    0,
    Math.min(
      def.outcomes.length - 1,
      Math.floor(Number(query.get("outcome")) || 0),
    ),
  );
  let snapshot,
    side = query.get("side") === "down" ? "down" : "up",
    action = "buy",
    panel = "book",
    pending,
    submitting = false,
    lastUpdate = 0,
    parametersRound;
  const label = (s) =>
      s === "void"
        ? "Void"
        : multi
          ? s === "up"
            ? "Yes"
            : "No"
          : def.outcomes[s === "up" ? 0 : 1],
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
  document.title = `${def.short} · Hypothesis`;
  document.body.dataset.game = kind;
  document.querySelector("[data-community-game]").dataset.communityGame = kind;
  $("lab-title").textContent = def.title;
  $("lab-short").textContent = def.short;
  $("lab-model").textContent = def.model;
  $("lab-subtitle").textContent = multi
    ? "One experiment. Three outcomes. Trade Yes or No on each."
    : "A fresh experiment every two minutes. Model it. Make your prediction.";
  $("lab-subject").textContent = subjects[def.subject];
  $("lab-subject").href = `index.html?subject=${def.subject}`;
  document.querySelectorAll(".subject-nav a").forEach((a) => {
    a.removeAttribute("aria-current");
    if (a.getAttribute("href") === `index.html?subject=${def.subject}`)
      a.setAttribute("aria-current", "true");
  });
  for (const [id, text] of Object.entries({
    "lab-assumptions": def.assumptions,
    "lab-rule": def.rule,
    "lab-equations": def.equations,
    "lab-metric": def.metric,
  }))
    $(id).textContent = text;
  $("lab-source").href = def.source;
  $("label-up").textContent = kind === "convection" ? "↻ CW" : label("up");
  $("label-down").textContent = kind === "convection" ? "↺ CCW" : label("down");
  $("choose-up").setAttribute("aria-label", label("up"));
  $("choose-down").setAttribute("aria-label", label("down"));
  $("physics-canvas").setAttribute(
    "aria-label",
    `${def.short}: observed server simulation`,
  );
  const renderer = new HypothesisRenderer($("physics-canvas"), $("lab-chart"));
  const client = new PhysicsGuest.Client(
    (data) => {
      if (!data.lab || data.marketId !== client.marketId) return;
      snapshot = data;
      lastUpdate = Date.now();
      $("physics-loading").hidden = true;
      $("aero-balance").textContent = money(data.player.balance);
      $("selected-contract").textContent = multi
        ? def.outcomes[choice]
        : def.short;
      $("confirm-market-name").textContent =
        def.short + (multi ? " · " + def.outcomes[choice] : "");
      $("download-conditions").disabled = false;
      if (parametersRound !== data.round.id) {
        parametersRound = data.round.id;
        $("lab-parameters").textContent = JSON.stringify(
          {
            parameters: data.lab.parameters,
            stateVariables: def.stateVariables,
            initialState: data.lab.initial,
          },
          null,
          2,
        );
      }
      renderer.update(data.lab, def);
      renderObservation();
      renderTicket();
      renderPositions();
      renderPanel();
      renderChoices();
    },
    (message) => {
      $("aero-connection").textContent = message;
      if (!snapshot) $("physics-loading").textContent = message;
    },
  );
  client.marketId = multi ? `${kind}:${choice}` : kind;
  client.intervalMs = 750;
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
              `<div class="flow-result"><strong>${new Date(r.end).toLocaleTimeString()}</strong><span>${safe(def.outcomes[r.winningChoice] || "Resolved")}</span><strong class="${r.outcome}">${label(r.outcome)}</strong></div>`,
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
      marketId: client.marketId,
      price,
      ...(quantityInput() ? { quantity: amount } : { amount }),
    };
    $("confirm-summary").innerHTML =
      `<div><span>Prediction</span><strong>${multi ? safe(def.outcomes[choice]) + " · " : ""}${label(side)}</strong></div><div><span>Order</span><strong>${action === "buy" ? "Buy" : "Sell"} · ${type() === "limit" ? "Limit" : "Market"}</strong></div><div><span>${quantityInput() ? "Shares" : "Spend up to"}</span><strong>${money(amount)} ${quantityInput() ? "shares" : "G"}</strong></div><div><span>${type() === "limit" ? "Limit price" : "Current quote"}</span><strong>${cents(type() === "limit" ? price : quote())}</strong></div>`;
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

  function renderChoices() {
    if (!multi || !snapshot?.outcomes) return;
    const host = $("lab-choices");
    host.hidden = false;
    host.innerHTML = snapshot.outcomes
      .map(
        (o, i) =>
          `<div class="lab-choice ${i === choice ? "selected" : ""}"><strong><i style="background:${(kind === "prism" ? ["#f48b95", "#73d7b2", "#71baff"] : ["#f48b95", "#71baff", "#73d7b2"])[i]}"></i>${safe(o.label)}</strong><b>${Math.round(o.probability * 100)}%</b><button data-choice="${i}" data-side="up" aria-pressed="${i === choice && side === "up"}">Yes ${cents(o.quotes.up.ask)}</button><button data-choice="${i}" data-side="down" aria-pressed="${i === choice && side === "down"}">No ${cents(o.quotes.down.ask)}</button></div>`,
      )
      .join("");
  }
  $("lab-choices").onclick = (e) => {
    const b = e.target.closest("[data-choice]");
    if (!b || submitting) return;
    choice = Number(b.dataset.choice);
    side = b.dataset.side;
    pending = null;
    $("trade-confirm").close();
    history.replaceState({}, "", Labs.link(`${kind}:${choice}`, side));
    if (client.marketId !== `${kind}:${choice}`) {
      client.marketId = `${kind}:${choice}`;
      snapshot = null;
      lastUpdate = 0;
      client.refresh();
    }
    renderTicket();
    renderChoices();
  };
  function renderObservation() {
    if (!snapshot) return;
    const lab = snapshot.lab,
      value = lab.frame.value,
      seconds = Math.max(
        0,
        Math.ceil(
          (snapshot.round.end - Date.now() - (client.offset || 0)) / 1000,
        ),
      );
    $("lab-value").textContent =
      (kind === "monte-carlo" && lab.frame.t === 0
        ? "—"
        : Number(value).toLocaleString("en-US", {
            maximumFractionDigits: Math.abs(value) < 0.1 ? 5 : 3,
          })) + (def.unit ? " " + def.unit : "");
    $("physics-observation").textContent =
      `${def.metric}: ${$("lab-value").textContent}`;
    $("lab-time").textContent =
      `t = ${lab.frame.t.toFixed(lab.parameters.timeUnit === "steps" || lab.parameters.timeUnit === "samples" ? 0 : 2)} ${lab.parameters.timeUnit || "s physical"}`;
    $("physics-phase").textContent =
      Date.now() - lastUpdate > 5000
        ? "RECONNECTING"
        : snapshot.round.closed
          ? "RESOLVED"
          : "LIVE EXPERIMENT";
    $("physics-clock").textContent = snapshot.round.closed
      ? `Next in ${Math.max(0, Math.ceil((snapshot.round.nextAt - Date.now() - (client.offset || 0)) / 1000))}s`
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    $("stage-result").hidden = !snapshot.round.closed;
    $("stage-result").textContent = snapshot.round.closed
      ? `${def.outcomes[lab.result]} wins`
      : "";
    $("lab-chart-caption").textContent = Number.isFinite(def.threshold)
      ? `Observed ${def.metric.toLowerCase()} · Dashed threshold ${def.threshold}${def.unit}`
      : "Observed history · Physical time";
    $("review-trade").disabled = !ready();
  }
  $("download-conditions").onclick = () => {
    if (!snapshot) return;
    const lab = snapshot.lab,
      payload = {
        schemaVersion: 1,
        experiment: kind,
        roundId: snapshot.round.id,
        roundStartUtc: new Date(snapshot.round.start).toISOString(),
        marketDurationMs: lab.durationMs,
        parameters: lab.parameters,
        stateVariables: def.stateVariables,
        units: def.units,
        initialState: lab.initial,
        equations: def.equations,
        assumptions: def.assumptions,
        settlement: def.rule,
      };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2) + "\n"], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-${snapshot.round.id}-conditions.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  setInterval(renderObservation, 250);
  client.start();
})();
