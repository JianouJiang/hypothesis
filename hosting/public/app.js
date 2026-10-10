(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const money = (n, digits = 2) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const dollars = (n) => `$${money(n)}`;
  const cents = (n) => `${Math.round(n * 100)}¢`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const icon = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const safe = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const time = (t) =>
    new Date(t).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
  let snapshot,
    mode = "connecting",
    connection = false,
    busy = false,
    timeOffset = 0;
  let action = "buy",
    side =
      new URLSearchParams(location.search).get("side") === "down"
        ? "down"
        : "up",
    bookSide = "up",
    panel = "book",
    selectedRound = null;
  let engine,
    localId,
    stream,
    lastUpdate = 0,
    apiBase = "",
    authToken = null;
  let lastSettled = null,
    previousRound = null,
    chartFrom = null,
    chartReceived = 0,
    hoverIndex = null;
  let localStateMemory = null;
  let pendingTrade = null;
  const localKey = "polymarket-physics-market-v1";

  function toast(title, detail = "", error = false) {
    const el = document.createElement("div");
    el.className = `toast${error ? " error" : ""}`;
    el.innerHTML = `${icon(error ? "info" : "check")}<div><strong>${safe(title)}</strong>${safe(detail)}</div><button aria-label="Dismiss notification">×</button>`;
    el.querySelector("button").onclick = () => el.remove();
    $("toasts").append(el);
    setTimeout(() => el.remove(), 6500);
  }

  async function api(path, body) {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(`${apiBase}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      credentials: apiBase ? "omit" : "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "The market could not be reached.");
    if (data.token) {
      authToken = data.token;
      storage.set("physics-server-guest", authToken);
    }
    return data;
  }

  async function withLocal(callback) {
    const work = async () => {
      let state;
      try {
        state = JSON.parse(storage.get(localKey) || "null");
      } catch {
        /* Start clean after a damaged browser save. */
      }
      engine = new PhysicsMarket.Market({
        state: state || localStateMemory || undefined,
      });
      engine.addPlayer(localId);
      const result = callback ? callback(engine) : null;
      localStateMemory = engine.state;
      storage.set(localKey, JSON.stringify(engine.state));
      accept(engine.snapshot(localId));
      return result;
    };
    return navigator.locks
      ? navigator.locks.request("physics-local-market", work)
      : work();
  }

  async function mutate(path, body) {
    if (mode === "local")
      return withLocal((market) => {
        if (path === "order") return market.place(localId, body);
        if (path === "cancel") return market.cancel(localId, body.orderId);
        if (path === "reset") return market.reset(localId);
      });
    const data = await api(path, body);
    accept(data.snapshot);
    return data.result;
  }

  function accept(data) {
    if (!data?.round || !data.player) return;
    chartFrom =
      snapshot?.round.id === data.round.id
        ? snapshot.round.price
        : data.round.price;
    chartReceived = performance.now();
    snapshot = data;
    const avatarLink = document.querySelector(".avatar");
    avatarLink.innerHTML = PhysicsGuest.avatar(data.player.avatar);
    avatarLink.setAttribute("aria-label", `${data.player.name} · Your profile`);
    timeOffset = data.now - Date.now();
    lastUpdate = Date.now();
    connection = true;
    if (previousRound && previousRound !== data.round.id) {
      selectedRound = null;
      const result = data.player.history.find((r) => r.id === previousRound);
      if (result)
        toast(
          result.payout > 0
            ? `Round settled · +${money(result.payout)} gold`
            : "Round settled",
          `${cap(result.outcome)} won. ${result.payout > 0 ? "Your winnings are in your balance." : "Your shares finished out of the money."}`,
        );
      else
        toast(
          "A new five-minute round is live",
          "The price to beat has reset.",
        );
    }
    previousRound = data.round.id;
    const latest = data.player.history[0];
    if (latest && !lastSettled) lastSettled = latest.id;
    render();
  }

  function viewedRound() {
    if (!snapshot) return null;
    if (selectedRound) {
      const old = snapshot.history.find((r) => r.id === selectedRound);
      if (old)
        return {
          ...old,
          price: old.close,
          points: old.path.map((price, i) => ({
            price,
            time: old.start + i * 1000,
          })),
          past: true,
        };
    }
    return snapshot.round;
  }

  function render() {
    const r = viewedRound();
    const player = snapshot.player;
    const date = new Date(r.start).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    const zone = new Date(r.start)
      .toLocaleTimeString("en-US", { timeZoneName: "short" })
      .split(" ")
      .pop();
    $("round-label").textContent =
      `${date}, ${time(r.start)} – ${time(r.end)} ${zone}`;
    $("opening-price").textContent = dollars(r.opening);
    $("current-price").textContent = dollars(r.price);
    const difference = r.price - r.opening;
    $("price-difference").textContent =
      `${difference >= 0 ? "+" : "−"}$${money(Math.abs(difference))}`;
    $("price-difference").classList.toggle("negative", difference < 0);
    $("chart-mode").textContent = r.past
      ? `RESOLVED ${r.outcome.toUpperCase()}`
      : "LIVE SIMULATION";
    $("header-balance").textContent = money(player.balance);
    $("card-balance").innerHTML =
      `${money(player.balance)} <small>GOLD</small>`;
    $("volume").textContent = money(r.volume, 0);
    $("connection-text").textContent =
      mode === "local"
        ? "Practice mode · saved in this browser"
        : "Live market · connected";
    $("positions-count").textContent = ["up", "down"].filter(
      (s) => player.positions[s].shares > 0.00001,
    ).length;
    document.querySelector(".status-dot").classList.remove("offline");
    renderRounds();
    renderTrade();
    renderPanel();
    renderCountdown();
  }

  function renderRounds() {
    const previous = snapshot.history.slice(0, 1).reverse();
    const rounds = [
      ...previous,
      snapshot.round,
      { start: snapshot.round.end },
      { start: snapshot.round.end + 300000 },
    ];
    $("round-chips").innerHTML = rounds
      .map((r) => {
        const active = selectedRound
          ? r.id === selectedRound
          : r.id === snapshot.round.id;
        const future = !r.id;
        return `<button class="round-chip${active ? " active" : ""}${r.outcome ? " past" : ""}" ${future ? 'disabled title="Opens when the current round ends"' : `data-round="${r.id}"`} ${active ? 'aria-current="true"' : ""}>${r.id === snapshot.round.id ? '<span class="live-dot"></span>' : ""}${time(r.start)}</button>`;
      })
      .join("");
  }

  function estimate() {
    const type = $("order-type").value;
    const value = Math.max(0, Number($("trade-amount").value) || 0);
    if (type === "limit") {
      const price = (Number($("limit-price").value) || 0) / 100;
      return { shares: value, total: value * price, price, partial: false };
    }
    const offers = snapshot.book[side][
      action === "buy" ? "asks" : "bids"
    ].filter((o) => !o.mine);
    let rest = value,
      shares = 0,
      total = 0;
    for (const offer of offers) {
      const quantity = Math.min(
        offer.quantity,
        action === "buy" ? rest / offer.price : rest,
      );
      if (quantity <= 0) continue;
      shares += quantity;
      total += quantity * offer.price;
      rest -= action === "buy" ? quantity * offer.price : quantity;
    }
    return {
      shares,
      total,
      price: shares
        ? total / shares
        : snapshot.quotes[side][action === "buy" ? "ask" : "bid"],
      partial: rest > 0.01,
    };
  }

  function renderTrade() {
    if (!snapshot) return;
    const isLimit = $("order-type").value === "limit";
    const p = snapshot.player;
    document
      .querySelectorAll("[data-action]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.action === action),
      );
    document.querySelectorAll("[data-side]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.side === side);
      b.setAttribute("aria-pressed", b.dataset.side === side);
    });
    $("up-price").textContent = cents(
      snapshot.quotes.up[action === "buy" ? "ask" : "bid"],
    );
    $("down-price").textContent = cents(
      snapshot.quotes.down[action === "buy" ? "ask" : "bid"],
    );
    $("limit-price-field").hidden = !isLimit;
    $("amount-label").textContent =
      isLimit || action === "sell" ? "Shares" : "Amount";
    $("amount-unit").innerHTML =
      isLimit || action === "sell"
        ? "Shares"
        : '<span class="coin">G</span> Gold';
    $("available-balance").textContent =
      action === "buy"
        ? `Balance: ${money(p.balance)} gold`
        : `Available: ${money(p.positions[side].available)} shares`;
    const e = estimate();
    $("estimate-label").textContent = isLimit
      ? action === "buy"
        ? "Gold reserved"
        : "Estimated proceeds"
      : action === "buy"
        ? "Estimated shares"
        : "Shares to sell";
    $("estimate-shares").textContent = isLimit
      ? `${money(e.total)} gold`
      : money(e.shares);
    $("average-price").textContent =
      `${money(e.price * 100, (e.price * 100) % 1 > 0.05 ? 1 : 0)}¢`;
    $("payout-label").innerHTML =
      action === "buy" ? `To win ${icon("info")}` : "You receive";
    $("payout-value").textContent = money(
      action === "buy" ? e.shares : e.total,
    );
    const locked = Boolean(selectedRound) || !connection;
    $("submit-trade").disabled = busy || locked;
    $("submit-trade").classList.toggle("is-down", side === "down");
    $("submit-trade").innerHTML = busy
      ? "Placing order…"
      : locked
        ? selectedRound
          ? "View live round to trade"
          : "Reconnecting…"
        : `${isLimit ? "Place" : cap(action)} ${isLimit ? cap(side) + " limit order" : cap(side)} ${icon("arrow")}`;
    $("trade-caption").textContent = isLimit
      ? "Your order stays open until filled, canceled, or the round ends."
      : action === "buy"
        ? `Win 1 gold per share if Bitcoin finishes ${side}.`
        : "Sell your shares at the best available bid.";
    if (e.partial && !isLimit)
      $("trade-caption").textContent =
        "Limited liquidity: your order may only partially fill.";
  }

  function renderCountdown() {
    if (!snapshot) return;
    const remaining = Math.max(
      0,
      Math.ceil((snapshot.round.end - Date.now() - timeOffset) / 1000),
    );
    $("countdown-min").textContent = selectedRound
      ? "00"
      : String(Math.floor(remaining / 60)).padStart(2, "0");
    $("countdown-sec").textContent = selectedRound
      ? "00"
      : String(remaining % 60).padStart(2, "0");
    $("countdown-label").textContent = selectedRound
      ? "ROUND RESOLVED"
      : "TIME REMAINING";
    if (
      pendingTrade &&
      !busy &&
      (pendingTrade.roundId !== snapshot.round.id || remaining === 0)
    ) {
      $("confirm-error").textContent =
        "This round has ended. Close this window and review the new round.";
      $("confirm-error").hidden = false;
      $("confirm-trade").disabled = true;
    }
    document
      .querySelector(".countdown")
      .classList.toggle("urgent", !selectedRound && remaining <= 30);
    if (mode === "server" && Date.now() - lastUpdate > 6500) {
      connection = false;
      $("connection-text").textContent = "Reconnecting · trading paused";
      document.querySelector(".status-dot").classList.add("offline");
      renderTrade();
    }
  }

  const empty = (title, text) =>
    `<div class="empty-state">${icon("wallet")}<h3>${title}</h3><p>${text}</p></div>`;
  const pill = (s) =>
    `<span class="outcome-pill ${s}">${icon("arrow")}${cap(s)}</span>`;
  function positionsHTML() {
    const p = snapshot.player;
    let html = ["up", "down"]
      .filter((s) => p.positions[s].shares > 0.00001)
      .map((s) => {
        const pos = p.positions[s];
        const value = pos.shares * pos.mark;
        const pnl = value - pos.cost;
        return `<div class="position-row">${pill(s)}<div class="position-info"><span>${money(pos.shares)} shares</span><small>Avg. ${cents(pos.cost / pos.shares)} · Cost ${money(pos.cost)} gold</small></div><div class="position-value"><span>${money(value)} gold</span><small class="${pnl >= 0 ? "up-text" : "down-text"}">${pnl >= 0 ? "+" : "−"}${money(Math.abs(pnl))}</small></div><button class="sell-position" data-sell="${s}" ${pos.available < 0.0001 ? "disabled" : ""}>Sell</button></div>`;
      })
      .join("");
    if (!html)
      html = empty(
        "Your next prediction starts here",
        "Buy Up or Down to open a position. Your shares and their current value will appear here.",
      );
    if (p.orders.length) {
      html += '<h4 class="subsection-title">Open orders</h4>';
      html += p.orders
        .map(
          (o) =>
            `<div class="open-order-row">${pill(o.side)}<div class="position-info"><span>${cap(o.action)} ${money(o.remaining)} shares at ${cents(o.price)}</span><small>${money(o.filled)} filled · Expires this round</small></div><button class="cancel-order" data-cancel="${o.id}">Cancel</button></div>`,
        )
        .join("");
    }
    return html;
  }

  function renderPanel() {
    if (!snapshot) return;
    if (panel === "book") {
      document
        .querySelectorAll("[data-book-side]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.bookSide === bookSide),
        );
      for (const type of ["bids", "asks"]) {
        const grouped = new Map();
        for (const o of snapshot.book[bookSide][type]) {
          const entry = grouped.get(o.price) || {
            price: o.price,
            quantity: 0,
            mine: false,
          };
          entry.quantity += o.quantity;
          entry.mine ||= o.mine;
          grouped.set(o.price, entry);
        }
        const rows = [...grouped.values()]
          .sort((a, b) =>
            type === "bids" ? b.price - a.price : a.price - b.price,
          )
          .slice(0, 5);
        const max = Math.max(1, ...rows.map((o) => o.quantity));
        $(`book-${type}`).innerHTML =
          rows
            .map(
              (o) =>
                `<button class="book-row ${type === "bids" ? "bid" : "ask"}" style="--depth:${Math.round((100 * o.quantity) / max)}%" data-book-price="${o.price}" data-book-action="${type === "bids" ? "sell" : "buy"}" aria-label="${type === "bids" ? "Sell" : "Buy"} ${cap(bookSide)} at ${cents(o.price)}"><span>${cents(o.price)}${o.mine ? '<i class="mine-marker" title="Your order"></i>' : ""}</span><span>${money(o.quantity, 0)}</span><span>${money(o.quantity * o.price)}</span></button>`,
            )
            .join("") || '<div class="empty-state">No orders yet</div>';
      }
      const book = snapshot.book[bookSide];
      $("spread").textContent =
        book.asks[0] && book.bids[0]
          ? cents(book.asks[0].price - book.bids[0].price)
          : "—";
    } else if (panel === "positions")
      $("panel-positions").innerHTML = positionsHTML();
    else if (panel === "activity") {
      $("panel-activity").innerHTML = snapshot.trades.length
        ? `<table class="activity-table"><thead><tr><th>Trader</th><th>Outcome</th><th>Shares</th><th>Price</th><th>Time</th></tr></thead><tbody>${snapshot.trades
            .slice(0, 10)
            .map(
              (t) =>
                `<tr><td>${safe(t.actor)}${t.bot || /simulator|bot/i.test(t.actor) ? '<span class="bot-label">BOT</span>' : ""}</td><td class="${t.side === "up" ? "up-text" : "down-text"}">${cap(t.action)} ${cap(t.side)}</td><td>${money(t.quantity, 1)}</td><td>${cents(t.price)}</td><td>${new Date(t.time).toLocaleTimeString("en-US", { hour12: false })}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : empty(
            "The round just opened",
            "Filled orders from guests and bot traders will appear here in real time.",
          );
    } else if (panel === "history") {
      $("panel-history").innerHTML = snapshot.player.history.length
        ? '<h4 class="subsection-title" style="margin-top:0">Your settled positions</h4>' +
          snapshot.player.history
            .slice(0, 10)
            .map(
              (r) =>
                `<div class="history-item">${pill(r.outcome)}<div class="history-details"><span>${time(r.start)} – ${time(r.end)}</span><small>Paid ${money(r.payout)} gold · Cost ${money(r.cost)}</small></div><strong class="${r.profit >= 0 ? "up-text" : "down-text"}">${r.profit >= 0 ? "+" : "−"}${money(Math.abs(r.profit))} G</strong></div>`,
            )
            .join("")
        : empty(
            "A fresh start",
            "Your settled predictions will appear here after your first round finishes.",
          );
      if (snapshot.history.length)
        $("panel-history").innerHTML +=
          '<h4 class="subsection-title">Recent market rounds</h4>' +
          snapshot.history
            .slice(0, 5)
            .map(
              (r) =>
                `<div class="history-item">${pill(r.outcome)}<div class="history-details"><span>${time(r.start)} – ${time(r.end)}</span><small>${dollars(r.opening)} → ${dollars(r.close)}</small></div><button class="text-button" data-round="${r.id}">View chart ↗</button></div>`,
            )
            .join("");
    }
  }

  function showPanel(name, scroll = false) {
    panel = name;
    document
      .querySelectorAll(".detail-tabs [data-panel]")
      .forEach((b) =>
        b.setAttribute("aria-selected", b.dataset.panel === name),
      );
    document
      .querySelectorAll(".detail-panel")
      .forEach((p) => (p.hidden = p.id !== `panel-${name}`));
    renderPanel();
    if (scroll)
      $("details").scrollIntoView({
        behavior: reducedMotion ? "instant" : "smooth",
        block: "start",
      });
  }

  function submitTrade(event) {
    event.preventDefault();
    if (!snapshot || busy || !connection || selectedRound) return;
    const type = $("order-type").value;
    const amount = Number($("trade-amount").value);
    if (!Number.isFinite(amount) || amount <= 0) {
      $("trade-error").textContent = "Enter an amount greater than zero.";
      $("trade-error").hidden = false;
      return;
    }
    const request = {
      side,
      action,
      type,
      amount,
      quantity: PhysicsMarket.floorShares(amount),
      price: Number($("limit-price").value) / 100,
      roundId: snapshot.round.id,
    };
    const reserve =
      action === "buy"
        ? type === "market"
          ? amount
          : request.quantity * request.price
        : 0;
    let error;
    if (
      type === "limit" &&
      (!Number.isFinite(request.price) ||
        request.price < 0.01 ||
        request.price > 0.99 ||
        Math.abs(request.price * 100 - Math.round(request.price * 100)) > 1e-7)
    )
      error = "Limit price must be 1–99 cents.";
    else if (type === "market" && action === "buy" && amount < 0.01)
      error = "Enter at least 0.01 gold.";
    else if (
      amount > 1000000 ||
      ((type === "limit" || action === "sell") && request.quantity < 0.0001)
    )
      error = "Enter a valid number of shares.";
    else if (reserve > snapshot.player.balance + 0.0000001)
      error = "Not enough gold for this order.";
    else if (
      action === "sell" &&
      request.quantity > snapshot.player.positions[side].available + 0.0000001
    )
      error =
        "Not enough available shares. Cancel any reserved sell orders first.";
    if (error) {
      $("trade-error").textContent = error;
      $("trade-error").hidden = false;
      return;
    }
    $("trade-error").hidden = true;
    pendingTrade = request;
    const e = estimate();
    $("dialog-title").textContent = "Review your trade";
    $("dialog-content").innerHTML =
      `<div class="confirm-market"><span class="bitcoin-logo">₿</span><div><strong>Bitcoin Up or Down</strong><span>${time(snapshot.round.start)} – ${time(snapshot.round.end)} · 5-minute round</span></div></div><div class="confirm-direction ${side}"><span>${cap(action)} ${cap(side)} ${side === "up" ? "↗" : "↘"}</span><small>${type === "limit" ? "Limit order" : "Market order"}</small></div><div class="confirm-summary"><div><span>${action === "buy" ? (type === "limit" ? "Gold reserved" : "Maximum spend") : "Shares to sell"}</span><strong>${money(action === "buy" ? reserve : request.quantity)} ${action === "buy" ? "G" : "shares"}</strong></div><div><span>${type === "limit" ? "Limit price" : "Estimated average price"}</span><strong>${money(e.price * 100, 1)}¢</strong></div><div><span>${action === "buy" ? "Estimated shares" : "Estimated proceeds"}</span><strong>${money(action === "buy" ? e.shares : e.total)}${action === "sell" ? " G" : ""}</strong></div>${action === "buy" ? `<div class="confirm-payout"><span>Payout if ${cap(side)} wins</span><strong>${money(e.shares)} G</strong></div>` : ""}<div><span>Your available gold</span><span>${money(snapshot.player.balance)} G</span></div></div><p class="confirm-note">${type === "limit" ? "Your order stays open until filled, canceled, or the round ends. Only filled shares can earn a payout." : "Prices move in real time. Your trade executes at the best available prices when you confirm; final shares and proceeds may differ."}</p><div class="confirm-gold"><span class="coin">G</span>Play gold only · No real payment</div><p id="confirm-error" class="trade-error" role="alert" hidden></p><div class="confirm-actions"><button id="cancel-trade" class="dialog-button secondary">Cancel</button><button id="confirm-trade" class="dialog-button">Confirm ${type === "limit" ? "order" : action}</button></div>`;
    $("cancel-trade").onclick = () => $("info-dialog").close();
    $("confirm-trade").onclick = confirmTrade;
    $("info-dialog").showModal();
    $("cancel-trade").focus();
  }

  async function confirmTrade() {
    if (!pendingTrade || busy) return;
    const request = pendingTrade;
    if (
      !connection ||
      request.roundId !== snapshot.round.id ||
      Date.now() + timeOffset >= snapshot.round.end
    ) {
      $("confirm-error").textContent =
        "This quote has expired. Close this window and review the live round.";
      $("confirm-error").hidden = false;
      $("confirm-trade").disabled = true;
      return;
    }
    busy = true;
    $("confirm-trade").disabled = true;
    $("confirm-trade").textContent = "Confirming…";
    $("cancel-trade").disabled = true;
    $("close-dialog").disabled = true;
    renderTrade();
    try {
      const result = await mutate("order", request);
      $("info-dialog").close();
      pendingTrade = null;
      if (result.remaining > 0.00001)
        toast(
          "Limit order placed",
          `${money(result.remaining)} ${request.side} shares waiting at ${Math.round(request.price * 100)}¢.${result.filled ? ` ${money(result.filled)} already filled.` : ""}`,
        );
      else if (result.filled > 0)
        toast(
          `${request.action === "buy" ? "Bought" : "Sold"} ${cap(request.side)}`,
          `${money(result.filled)} shares · ${money(result.total)} gold${result.partial ? " · Partially filled; unused gold returned." : ""}`,
        );
      else
        toast(
          "No fill available",
          "No matching orders right now. Your gold and shares are unchanged.",
          true,
        );
      showPanel("positions");
    } catch (error) {
      $("confirm-error").textContent = error.message;
      $("confirm-error").hidden = false;
      // A network timeout can occur after a committed trade. Require a fresh
      // review instead of offering a blind retry that might place it twice.
      $("confirm-trade").textContent = "Close and review order";
      $("cancel-trade").textContent = "Close";
    } finally {
      busy = false;
      $("close-dialog").disabled = false;
      $("cancel-trade").disabled = false;
      renderTrade();
    }
  }

  function showDialog(type) {
    const p = snapshot?.player;
    const content = $("dialog-content");
    const titles = {
      how: "A market. A hunch. Five minutes.",
      bots: "Meet your market makers",
      wallet: "Your gold wallet",
      portfolio: "Your portfolio",
      search: "Find a market",
    };
    $("dialog-title").textContent = titles[type];
    if (type === "how")
      content.innerHTML = `<ol><li><strong>Start with 1,000 gold.</strong> Your guest wallet is ready as soon as you arrive.</li><li><strong>Pick Up or Down.</strong> Predict whether the simulated Bitcoin price will finish above or below the opening price after five minutes.</li><li><strong>Trade your view.</strong> Take the best price with a market order, or set your own price with a limit order. You can sell before the round ends.</li><li><strong>Get paid automatically.</strong> Each winning share pays 1 gold. Losing shares pay zero. A tie settles Up.</li></ol><div class="dialog-note">A 50¢ share costs 0.50 gold. If it wins, it returns 1 gold — 0.50 gold profit. No signup, deposits, withdrawals, or fees. This is an independent simulation.</div><button class="dialog-button" data-dismiss>Let's trade</button>`;
    else if (type === "bots")
      content.innerHTML = `<p>There's always someone on the other side. Our simulated market makers quote both <strong>Up and Down</strong> at multiple prices and refresh their orders every second.</p><div class="bot-stat-grid"><div><strong>1 sec</strong>Order book refresh</div><div><strong>2–5 sec</strong>Bot trading cadence</div></div><p><strong>Atlas</strong> supplies two-sided liquidity with a spread and inventory adjustment. <strong>Momentum</strong> follows the recent move. <strong>Contrarian</strong> takes the other side. <strong>Noise</strong> makes small randomized trades.</p><p>Bots use the same matching engine as you, so they can fill your limit orders. Their activity is labeled <strong>BOT</strong>. Human orders get filled whenever they offer a better price.</p><div class="dialog-note">Bitcoin follows an independent simulated price process. Bot orders respond only to prices already visible; they cannot see future prices. All bot capital is play money.</div>`;
    else if (type === "wallet" && p) {
      content.innerHTML = `<div class="wallet-total"><span class="coin">G</span>${money(p.balance)}</div><p>Available gold · ${safe(p.name)}</p><div class="wallet-details"><div><span>Reserved in orders</span><strong>${money(p.reserved)} gold</strong></div><div><span>Shares value</span><strong>${money(p.positions.up.shares * p.positions.up.mark + p.positions.down.shares * p.positions.down.mark)} gold</strong></div><div><span>Realized profit / loss</span><strong>${p.realized >= 0 ? "+" : "−"}${money(Math.abs(p.realized))} gold</strong></div></div><div class="dialog-note">${mode === "local" ? "Practice mode: your wallet and market are saved in this browser." : "Your guest wallet is saved on the server and restored in this browser. Different browser profiles receive their own wallet."} Gold has no cash value.</div><button class="dialog-button secondary" id="reset-wallet">Start over with 1,000 gold</button><p id="reset-explanation" hidden class="dialog-note">This clears your current positions, open orders, and personal history. Other traders are unaffected. <button class="dialog-button" id="confirm-reset">Reset my practice wallet</button></p>`;
      $("reset-wallet").onclick = () => {
        $("reset-explanation").hidden = false;
        $("reset-wallet").hidden = true;
      };
      $("confirm-reset").onclick = async () => {
        $("confirm-reset").disabled = true;
        try {
          await mutate("reset", {});
          $("info-dialog").close();
          toast("A fresh 1,000 gold", "Your practice wallet has been reset.");
        } catch (e) {
          toast("Could not reset wallet", e.message, true);
          $("confirm-reset").disabled = false;
        }
      };
    } else if (type === "portfolio" && p)
      content.innerHTML = `<div class="wallet-total"><span class="coin">G</span>${money(p.balance + p.reserved + p.positions.up.shares * p.positions.up.mark + p.positions.down.shares * p.positions.down.mark)}</div><p>Total gold value · Cash, reserved gold, and marked shares</p>${positionsHTML()}`;
    else if (type === "search") {
      content.innerHTML = `<input class="search-input" id="market-search" placeholder="Search Bitcoin, BTC, 5 min…" aria-label="Search markets" autocomplete="off"><div id="search-results"></div>`;
      const results = () => {
        const query = $("market-search").value.toLowerCase().trim();
        $("search-results").innerHTML =
          !query ||
          ["bitcoin", "btc", "up", "down", "maths", "statistics", "5 min"].some(
            (s) => s.includes(query) || query.includes(s),
          )
            ? `<button class="search-result" data-dismiss><span class="bitcoin-logo">₿</span><span>Bitcoin Up or Down<small>5-minute rounds · Live · Play gold</small></span>${icon("chevron")}</button>`
            : '<p>Explore more subjects on the home page.</p><a class="dialog-button" href="./">Browse all science markets</a>';
      };
      $("market-search").addEventListener("input", results);
      results();
    }
    if (!$("info-dialog").open) $("info-dialog").showModal();
    if (type === "search") $("market-search").focus();
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.open) showDialog(button.dataset.open);
    if (button.hasAttribute("data-dismiss")) $("info-dialog").close();
    if (button.dataset.action) {
      action = button.dataset.action;
      $("trade-error").hidden = true;
      renderTrade();
    }
    if (button.dataset.side) {
      side = button.dataset.side;
      $("trade-error").hidden = true;
      renderTrade();
    }
    if (button.dataset.panel)
      showPanel(button.dataset.panel, !button.closest(".detail-tabs"));
    if (button.dataset.bookSide) {
      bookSide = button.dataset.bookSide;
      renderPanel();
    }
    if (button.dataset.amount) {
      $("trade-amount").value =
        Math.round(
          ((Number($("trade-amount").value) || 0) +
            Number(button.dataset.amount)) *
            10000,
        ) / 10000;
      renderTrade();
    }
    if (button.dataset.round) {
      selectedRound =
        button.dataset.round === snapshot.round.id
          ? null
          : button.dataset.round;
      hoverIndex = null;
      render();
    }
    if (button.dataset.bookPrice) {
      selectedRound = null;
      side = bookSide;
      action = button.dataset.bookAction;
      $("order-type").value = "limit";
      $("limit-price").value = Math.round(
        Number(button.dataset.bookPrice) * 100,
      );
      renderTrade();
      $("trade-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
      $("trade-amount").focus({ preventScroll: true });
    }
    if (button.dataset.sell) {
      if ($("info-dialog").open) $("info-dialog").close();
      side = button.dataset.sell;
      action = "sell";
      selectedRound = null;
      $("order-type").value = "market";
      $("trade-amount").value = PhysicsMarket.floorShares(
        snapshot.player.positions[side].available,
      );
      renderTrade();
      $("trade-form").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (button.dataset.cancel) {
      button.disabled = true;
      try {
        await mutate("cancel", { orderId: button.dataset.cancel });
        toast("Order canceled", "Reserved gold or shares are available again.");
        if ($("info-dialog").open) showDialog("portfolio");
      } catch (error) {
        toast("Could not cancel", error.message, true);
      }
    }
  });
  $("trade-form").addEventListener("submit", submitTrade);
  $("trade-amount").addEventListener("input", () => {
    $("trade-error").hidden = true;
    renderTrade();
  });
  $("limit-price").addEventListener("input", renderTrade);
  $("order-type").addEventListener("change", () => {
    if ($("order-type").value === "limit" && snapshot)
      $("limit-price").value = Math.round(
        snapshot.quotes[side][action === "buy" ? "bid" : "ask"] * 100,
      );
    renderTrade();
  });
  $("max-amount").onclick = () => {
    if (!snapshot) return;
    $("trade-amount").value =
      action === "sell"
        ? PhysicsMarket.floorShares(snapshot.player.positions[side].available)
        : $("order-type").value === "limit"
          ? PhysicsMarket.floorShares(
              snapshot.player.balance /
                (Math.max(1, Number($("limit-price").value)) / 100),
            )
          : Math.floor(snapshot.player.balance * 100) / 100;
    renderTrade();
  };
  $("return-live").onclick = () => {
    selectedRound = null;
    render();
  };
  $("search-trigger").onclick = () => showDialog("search");
  $("close-dialog").onclick = () => $("info-dialog").close();
  $("info-dialog").addEventListener("close", () => {
    pendingTrade = null;
  });
  $("info-dialog").addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  $("info-dialog").addEventListener("click", (event) => {
    if (event.target === $("info-dialog") && !busy) {
      const r = $("info-dialog").getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        $("info-dialog").close();
    }
  });
  $("bookmark").setAttribute(
    "aria-pressed",
    storage.get("physics-favorite") === "true",
  );
  $("bookmark").onclick = () => {
    const active = $("bookmark").getAttribute("aria-pressed") !== "true";
    $("bookmark").setAttribute("aria-pressed", active);
    storage.set("physics-favorite", String(active));
    let saved;
    try {
      saved = JSON.parse(storage.get("physics-watchlist-v1") || "[]");
    } catch {
      saved = [];
    }
    const watchlist = new Set(Array.isArray(saved) ? saved : []);
    if (active) watchlist.add("bitcoin");
    else watchlist.delete("bitcoin");
    storage.set("physics-watchlist-v1", JSON.stringify([...watchlist]));
    toast(active ? "Added to your favorites" : "Removed from favorites");
  };
  $("share").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Market link copied", "Send it to a friend to start trading.");
    } catch {
      showDialog("how");
      toast("Market link", location.href);
    }
  };
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      showDialog("search");
    }
    if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      document.activeElement.matches(".detail-tabs button")
    ) {
      event.preventDefault();
      const tabs = [...document.querySelectorAll(".detail-tabs button")];
      const i =
        (tabs.indexOf(document.activeElement) +
          (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
        tabs.length;
      tabs[i].focus();
      showPanel(tabs[i].dataset.panel);
    }
  });

  const canvas = $("price-chart");
  const ctx = canvas.getContext("2d");
  let chartWidth = 0,
    chartHeight = 0,
    scaleMin = null,
    scaleMax = null,
    chartRoundId = null;
  function resizeChart() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartWidth = rect.width;
    chartHeight = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resizeChart).observe(canvas);
  canvas.addEventListener("pointermove", (e) => {
    const r = viewedRound();
    if (!r) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(chartWidth - 78, e.clientX - rect.left - 9));
    hoverIndex = Math.min(
      r.points.length - 1,
      Math.round((x / (chartWidth - 89)) * 300),
    );
    const point = r.points[hoverIndex];
    $("chart-tooltip").hidden = false;
    $("chart-tooltip").style.left =
      `${Math.min(Math.max(3, x - 38), chartWidth - 140)}px`;
    $("chart-tooltip").innerHTML =
      `${dollars(point.price)}<small>${new Date(point.time).toLocaleTimeString("en-US")}</small>`;
  });
  canvas.addEventListener("pointerleave", () => {
    hoverIndex = null;
    $("chart-tooltip").hidden = true;
  });
  function drawChart(now) {
    requestAnimationFrame(drawChart);
    if (!snapshot || document.hidden || !chartWidth) return;
    const r = viewedRound();
    const left = 9,
      right = chartWidth - 80,
      top = 34,
      bottom = chartHeight - 29;
    const points = r.points;
    const prices = points.map((p) => p.price);
    const low = Math.min(...prices, r.opening),
      high = Math.max(...prices, r.opening);
    const pad = Math.max(14, (high - low) * 0.28);
    if (chartRoundId !== r.id) {
      chartRoundId = r.id;
      scaleMin = low - pad;
      scaleMax = high + pad;
    }
    const smoothing = reducedMotion ? 1 : 0.045;
    scaleMin += (low - pad - scaleMin) * smoothing;
    scaleMax += (high + pad - scaleMax) * smoothing;
    const x = (i) => left + ((right - left) * i) / 300;
    const y = (price) =>
      bottom - ((price - scaleMin) / (scaleMax - scaleMin)) * (bottom - top);
    ctx.clearRect(0, 0, chartWidth, chartHeight);
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const py = top + ((bottom - top) * i) / 4;
      ctx.strokeStyle = "#f0f2f6";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right + 7, py);
      ctx.stroke();
      ctx.fillStyle = "#a6afbd";
      ctx.fillText(
        money(scaleMax - ((scaleMax - scaleMin) * i) / 4, 0),
        right + 15,
        py,
      );
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#a6afbd";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const label = new Date(r.start + i * 60000).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      ctx.fillText(label, Math.max(18, x(i * 60)), chartHeight - 7);
    }
    const openingY = y(r.opening);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#adb7c9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, openingY);
    ctx.lineTo(right + 7, openingY);
    ctx.stroke();
    ctx.setLineDash([]);
    const fraction =
      reducedMotion || r.past ? 1 : Math.min(1, (now - chartReceived) / 800);
    const smoothPrice = r.past
      ? r.price
      : chartFrom + (r.price - chartFrom) * (1 - Math.pow(1 - fraction, 3));
    const last = points.length - 1;
    const coords = points.map((p, i) => [
      x(i),
      y(i === last ? smoothPrice : p.price),
    ]);
    if (coords.length === 1) coords.push([left + 1, y(r.opening)]);
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "#2e5bff18");
    gradient.addColorStop(1, "#2e5bff00");
    ctx.beginPath();
    coords.forEach(([px, py], i) =>
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py),
    );
    ctx.lineTo(coords.at(-1)[0], bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    coords.forEach(([px, py], i) =>
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py),
    );
    ctx.strokeStyle = "#3563f5";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    const [endX, endY] = coords.at(-1);
    if (!r.past) {
      const pulse = reducedMotion ? 6 : 6 + Math.sin(now / 450) * 1.8;
      ctx.beginPath();
      ctx.arc(endX, endY, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#3463ff18";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(endX, endY, 3.3, 0, Math.PI * 2);
    ctx.fillStyle = "#3563f5";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "#3563f54a";
    ctx.lineWidth = 0.8;
    ctx.moveTo(endX, endY);
    ctx.lineTo(right + 10, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    const flagY = Math.min(bottom - 10, Math.max(top + 10, endY));
    ctx.fillStyle = "#3563f5";
    ctx.beginPath();
    ctx.roundRect(right + 9, flagY - 10, 69, 20, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(money(smoothPrice), right + 43, flagY);
    if (Math.abs(openingY - flagY) > 27) {
      ctx.fillStyle = "#eef1f6";
      ctx.beginPath();
      ctx.roundRect(right + 9, openingY - 9, 69, 18, 3);
      ctx.fill();
      ctx.fillStyle = "#8c9aae";
      ctx.fillText(money(r.opening), right + 43, openingY);
    }
    if (hoverIndex !== null && points[hoverIndex]) {
      const hx = x(hoverIndex),
        hy = y(points[hoverIndex].price);
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#bdc8dc";
      ctx.moveTo(hx, top);
      ctx.lineTo(hx, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#3563f5";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  requestAnimationFrame(drawChart);
  setInterval(renderCountdown, 250);

  async function startLocal() {
    mode = "local";
    localId =
      storage.get("physics-local-guest") ||
      `guest-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    storage.set("physics-local-guest", localId);
    await withLocal();
    setInterval(() => {
      if (!document.hidden) withLocal().catch(console.error);
    }, 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) withLocal().catch(console.error);
    });
  }
  async function connectServer() {
    const data = await api("session");
    mode = "server";
    accept(data.snapshot || data);
    if (data.transport === "poll" || apiBase) {
      let polling = false;
      setInterval(async () => {
        if (polling || document.hidden) return;
        polling = true;
        try {
          const fresh = await api("session");
          accept(fresh.snapshot || fresh);
        } catch {
          /* The countdown shows stale connections and disables trades. */
        } finally {
          polling = false;
        }
      }, 1000);
    } else {
      stream = new EventSource("/api/events");
      stream.onmessage = (event) => {
        try {
          accept(JSON.parse(event.data));
        } catch {
          /* Let the next event recover. */
        }
      };
      stream.onerror = () => {
        connection = false;
        renderTrade();
      };
    }
  }
  async function init() {
    if (location.protocol === "file:") return startLocal();
    try {
      const configResponse = await fetch("deployment.json", {
        cache: "no-store",
      });
      if (configResponse.ok) {
        const config = await configResponse.json();
        if (location.hostname.endsWith(".github.io"))
          apiBase = config.apiBase || "";
      }
    } catch {
      /* Local server does not need a deployment config. */
    }
    authToken = storage.get("physics-server-guest");
    if (location.hostname.endsWith(".github.io") && !apiBase)
      return startLocal();
    try {
      await connectServer();
    } catch (error) {
      if (location.hostname.endsWith(".github.io")) {
        await startLocal();
        toast(
          "Practice market is ready",
          "The shared server is unavailable. This session is saved only in your browser.",
        );
      } else {
        $("connection-text").textContent = "Unable to reach the market";
        $("trade-error").textContent = `${error.message} Refresh to reconnect.`;
        $("trade-error").hidden = false;
        $("submit-trade").disabled = true;
        toast("Market connection unavailable", error.message, true);
      }
    }
  }
  init();
})();
