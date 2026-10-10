(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { safe, money, avatar } = PhysicsGuest;
  const icon = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const marketTitle = (id) =>
    id?.startsWith("galton-")
      ? `Galton board · Slot ${id.split("-")[1]}`
      : id === "escape"
        ? "Ring escape · 60 second challenge"
        : id === "aerofoil"
          ? "Dust above or below · ~2 min"
          : "Bitcoin Up or Down · 5 min";
  const marketWords = (id) =>
    `${marketTitle(id)} ${id?.startsWith("galton-") || id === "escape" ? "Solid Mechanics Yes No" : id === "aerofoil" ? "Fluid Dynamics Above Below" : "Maths Statistics Up Down"}`;
  const outcome = (side, id) =>
    side === "void"
      ? "Void"
      : id?.startsWith("galton-") || id === "escape"
        ? side === "up"
          ? "Yes"
          : "No"
        : id === "aerofoil"
          ? side === "up"
            ? "Above"
            : "Below"
          : cap(side);
  const marketLink = (id, side) => {
    const name = id?.startsWith("galton-")
      ? "galton"
      : id === "escape"
        ? "escape"
        : id === "aerofoil"
          ? "aerofoil"
          : "bitcoin";
    const q = new URLSearchParams();
    if (name === "galton") q.set("slot", id.split("-")[1]);
    if (side) q.set("side", side);
    return `${name}.html${q.size ? "?" + q : ""}`;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const signed = (n) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
  const cls = (n) => (n > 0.0001 ? "positive" : n < -0.0001 ? "negative" : "");
  const date = (t) =>
    new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = (t) =>
    new Date(t).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const cents = (n) => `${money(n * 100, 1)}¢`;
  let snapshot,
    tab = "positions",
    positionState = "active",
    period = "ALL",
    activityLimit = 20,
    selectedAvatar = 0,
    saving = false,
    chartPoints = [];
  const client = new PhysicsGuest.Client(
    (data) => {
      snapshot = data;
      render();
    },
    (message) => {
      $("profile-connection").textContent = message;
      $("profile-updated").textContent = message.startsWith("Connected")
        ? "Live updates"
        : message.startsWith("Practice")
          ? "Practice mode"
          : "Reconnecting…";
    },
  );
  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${icon("check")}<div><strong>${safe(message)}</strong>Your guest account is up to date.</div><button aria-label="Dismiss">×</button>`;
    el.querySelector("button").onclick = () => el.remove();
    $("profile-toasts").append(el);
    setTimeout(() => el.remove(), 5500);
  }
  function render() {
    const p = snapshot.player;
    $("home-balance").textContent = money(p.balance);
    $("profile-name").textContent = p.name;
    document.title = `${p.name} · Hypothesis`;
    $("profile-picture").innerHTML = avatar(p.avatar);
    $("profile-joined").textContent =
      `Joined ${new Date(p.joinedAt || p.trackingSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · Guest account`;
    $("profile-bio").textContent = p.bio || "";
    $("profile-bio").hidden = !p.bio;
    $("edit-profile").disabled = false;
    $("profile-position-value").textContent =
      `${money(p.positionValue ?? p.positions.up.shares * p.positions.up.mark + p.positions.down.shares * p.positions.down.mark)} G`;
    $("profile-biggest-win").textContent = `${money(p.biggestWin)} G`;
    $("profile-predictions").textContent = money(p.marketsTraded, 0);
    $("profile-total-pnl").textContent = `${signed(p.equity - 1000)} G`;
    $("profile-total-pnl").className = cls(p.equity - 1000);
    $("profile-volume").textContent = `${money(p.totalVolume)} G`;
    $("profile-gold").textContent = `${money(p.balance)} G`;
    renderChart();
    renderResults();
  }
  function renderChart() {
    if (!snapshot) return;
    const p = snapshot.player,
      now = snapshot.now,
      livePnL = p.equity - 1000;
    const durations = {
      "1D": 86400000,
      "1W": 604800000,
      "1M": 2592000000,
      "1Y": 31536000000,
    };
    const cutoff =
      period === "YTD"
        ? new Date(new Date(now).getFullYear(), 0, 1).getTime()
        : now - (durations[period] || Infinity);
    const history = p.equityHistory || [];
    const before = history.filter((point) => point.time <= cutoff).at(-1);
    const points = history
      .filter((point) => point.time > cutoff)
      .map((point) => ({ ...point }));
    if (before) points.unshift({ ...before, time: cutoff });
    // A fresh account starts at zero. Existing accounts only show observations
    // collected since profile tracking was introduced, never invented trades.
    if (points.length === 0)
      points.push({
        time: Math.max(
          p.trackingSince || now,
          Number.isFinite(cutoff) ? cutoff : 0,
        ),
        value: livePnL,
      });
    if (points.at(-1).time < now) points.push({ time: now, value: livePnL });
    else points[points.length - 1].value = livePnL;
    const periodPnL =
      period === "ALL"
        ? livePnL
        : livePnL -
          (before?.value ?? (p.trackingSince > cutoff ? 0 : points[0].value));
    $("profile-period-pnl").innerHTML = `${signed(periodPnL)} <span>G</span>`;
    $("pnl-indicator").textContent = periodPnL < 0 ? "▾" : "▴";
    $("pnl-indicator").style.color = periodPnL < 0 ? "#d35d70" : "#57ac85";
    $("pnl-period-caption").textContent = {
      "1D": "Past day",
      "1W": "Past week",
      "1M": "Past month",
      "1Y": "Past year",
      YTD: "Year to date",
      ALL: "All time",
    }[period];
    document
      .querySelectorAll("[data-period]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.period === period),
      );
    const start = points[0].time,
      duration = Math.max(1, now - start);
    const min = Math.min(0, ...points.map((p) => p.value)),
      max = Math.max(0, ...points.map((p) => p.value));
    const padding = Math.max(1, (max - min) * 0.2),
      bottom = 119,
      top = 12;
    const y = (value) =>
      bottom -
      ((value - min + padding) / (max - min + padding * 2)) * (bottom - top);
    chartPoints = points.map((point, i) => ({
      ...point,
      x: points.length === 1 ? 0 : ((point.time - start) / duration) * 440,
      y: y(point.value),
    }));
    let line = chartPoints
      .map(
        (point, i) =>
          `${i ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      )
      .join(" ");
    if (points.length === 1) line += ` L440 ${chartPoints[0].y.toFixed(1)}`;
    $("profile-chart").innerHTML =
      `<defs><linearGradient id="profit-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7160ff" stop-opacity=".18"/><stop offset="1" stop-color="#7160ff" stop-opacity=".01"/></linearGradient><linearGradient id="profit-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="440" y2="0"><stop stop-color="#3465ff"/><stop offset="1" stop-color="#9863ff"/></linearGradient></defs><path d="M0 ${y(0)}H440" stroke="#edf0f6" stroke-width="1" stroke-dasharray="3 5"/><path d="${line} L440 130 L0 130Z" fill="url(#profit-area)"/><path d="${line}" fill="none" stroke="url(#profit-line)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/><line id="chart-hover-line" y1="0" y2="130" stroke="#bcc9e0" stroke-dasharray="3 4" visibility="hidden"/>`;
    $("profile-chart").setAttribute(
      "aria-label",
      `Profit and loss: ${signed(periodPnL)} gold, ${$("pnl-period-caption").textContent.toLowerCase()}. Based on recorded portfolio values.`,
    );
    $("chart-start-label").textContent = p.marketsTraded
      ? `${date(start)} · ${time(start)}`
      : "Your first prediction starts here";
    $("chart-end-label").textContent = "Now";
  }
  function marketCell(side, label, subtitle, marketId) {
    return `<div class="profile-market-cell"><span class="mini-bitcoin">${marketId === "aerofoil" ? "∿" : marketId?.startsWith("galton-") ? "⠿" : marketId === "escape" ? "◌" : "₿"}</span><div><a href="${marketLink(marketId, side || "up")}">${marketTitle(marketId)}</a><p><span class="position-pill ${side === "down" ? "down" : ""}">${safe(label)}</span>${safe(subtitle)}</p></div></div>`;
  }
  function empty(title, detail, action = true) {
    return `<div class="profile-empty"><div class="empty-profile-icon">${icon(tab === "activity" ? "clock" : "chart")}</div><h2>${safe(title)}</h2><p>${safe(detail)}</p>${action ? `<a href="index.html?status=live">Explore live markets ${icon("arrow")}</a>` : ""}</div>`;
  }
  function renderResults() {
    if (!snapshot) return;
    const p = snapshot.player,
      query = $("position-search").value.trim().toLowerCase(),
      sort = $("position-sort").value;
    const queryMatches = (text) => !query || text.toLowerCase().includes(query);
    $("position-state").hidden = tab !== "positions";
    $("activity-type").hidden = tab !== "activity";
    $("position-sort").hidden = tab === "activity";
    $("profile-results").setAttribute("aria-labelledby", `${tab}-tab`);
    $("profile-load-more").hidden = true;
    $("profile-history-note").hidden = true;
    let html = "";
    if (tab === "activity") {
      const items = (p.activity || []).filter(
        (a) =>
          ($("activity-type").value === "all" ||
            a.type === $("activity-type").value) &&
          queryMatches(`${marketWords(a.marketId)} ${a.type} ${a.side}`),
      );
      if (!items.length)
        html = empty(
          query || $("activity-type").value !== "all"
            ? "No matching activity"
            : "Your predictions tell a story",
          query
            ? "Try a different search or activity type."
            : "Your buys, sells, and settled predictions will appear here after your first trade.",
          !query,
        );
      else {
        html = `<table class="profile-table activity-profile-table"><thead><tr><th>Market / action</th><th class="price-column">Price</th><th class="price-column">Shares</th><th class="value-col">Amount</th><th>Time</th></tr></thead><tbody>${items
          .slice(0, activityLimit)
          .map(
            (a) =>
              `<tr><td>${marketCell(a.side, `${a.type === "refund" ? "Refunded" : a.type === "settlement" ? "Settled" : a.type === "buy" ? "Bought" : "Sold"} ${outcome(a.side, a.marketId)}`, `${money(a.shares)} shares`, a.marketId)}</td><td class="price-column">${a.type === "refund" ? "Cost basis" : a.type === "settlement" ? "1 gold" : cents(a.price)}</td><td class="price-column">${money(a.shares)}</td><td><span class="position-value-main ${a.type !== "buy" ? "positive" : ""}">${a.type === "buy" ? "−" : "+"}${money(a.total)} G</span><span class="position-date">${date(a.time)} · ${time(a.time)}</span></td><td><span class="position-date">${time(a.time)}</span></td></tr>`,
          )
          .join("")}</tbody></table>`;
        $("profile-load-more").hidden = items.length <= activityLimit;
        $("profile-history-note").hidden = false;
        $("profile-history-note").textContent =
          `Your last 500 fills and settlements are retained. Tracking since ${date(p.trackingSince)}. No simulated activity is added to your profile.`;
      }
    } else if (positionState === "active") {
      let items = (
        p.allPositions ||
        ["up", "down"].map((side) => ({ side, ...p.positions[side] }))
      ).filter(
        (pos) =>
          pos.shares > 0.00001 &&
          queryMatches(`${marketWords(pos.marketId)} ${pos.side}`),
      );
      items.sort((a, b) =>
        sort === "profit"
          ? b.shares * b.mark - b.cost - (a.shares * a.mark - a.cost)
          : b.shares * b.mark - a.shares * a.mark,
      );
      if (!items.length)
        html = empty(
          query
            ? "No matching positions"
            : p.marketsTraded
              ? "No active positions"
              : "Make your first prediction",
          query
            ? "Try searching for Aerofoil, Bitcoin, or an outcome."
            : `You have ${money(p.balance)} gold available. Choose a live science market and follow your positions here.`,
        );
      else
        html = `<table class="profile-table"><thead><tr><th>Market</th><th class="price-column">Avg</th><th class="price-column">Current</th><th class="value-col">Value</th><th></th></tr></thead><tbody>${items
          .map((pos) => {
            const value = pos.shares * pos.mark,
              profit = value - pos.cost;
            return `<tr><td>${marketCell(pos.side, `${outcome(pos.side, pos.marketId)} ${cents(pos.cost / pos.shares)}`, `${money(pos.shares)} shares`, pos.marketId)}</td><td class="price-column">${cents(pos.cost / pos.shares)}</td><td class="price-column">${cents(pos.mark)}</td><td><span class="position-value-main">${money(value)} G</span><span class="position-profit ${cls(profit)}">${signed(profit)} (${money(pos.cost ? (profit / pos.cost) * 100 : 0)}%)</span></td><td><a class="profile-trade-link" href="${marketLink(pos.marketId, pos.side)}" aria-label="Trade your ${pos.side} position">Trade ↗</a></td></tr>`;
          })
          .join("")}</tbody></table>`;
      const orders = (p.allOrders || p.orders).filter((o) =>
        queryMatches(`${marketWords(o.marketId)} ${o.side} ${o.action}`),
      );
      if (orders.length)
        html += `<div class="profile-orders"><h3>Open orders <span>(${orders.length})</span></h3>${orders.map((o) => `<div class="profile-order-row"><span>${cap(o.action)} ${outcome(o.side, o.marketId)} · ${money(o.remaining)} shares at ${cents(o.price)}</span><a href="${marketLink(o.marketId, o.side)}">Manage order ↗</a></div>`).join("")}</div>`;
    } else {
      let items = p.history.map((h) => ({
        marketId: h.marketId,
        time: h.end,
        side: h.outcome,
        label: `${outcome(h.outcome, h.marketId)} won`,
        detail: `${date(h.start)} · ${time(h.start)}`,
        cost: h.cost,
        value: h.payout,
        profit: h.profit,
      }));
      items.push(
        ...(p.activity || [])
          .filter((a) => a.type === "sell")
          .map((a) => ({
            marketId: a.marketId,
            time: a.time,
            side: a.side,
            label: `Sold ${outcome(a.side, a.marketId)}`,
            detail: `${money(a.shares)} shares · ${date(a.time)}`,
            cost: a.total - (a.profit || 0),
            value: a.total,
            profit: a.profit || 0,
          })),
      );
      items = items.filter((i) =>
        queryMatches(`${marketWords(i.marketId)} ${i.label}`),
      );
      items.sort((a, b) =>
        sort === "value"
          ? b.value - a.value
          : sort === "profit"
            ? b.profit - a.profit
            : b.time - a.time,
      );
      if (!items.length)
        html = empty(
          query ? "No matching positions" : "No closed positions yet",
          "Sold shares and settled predictions will appear here.",
          !query,
        );
      else {
        html = `<table class="profile-table"><thead><tr><th>Market</th><th class="price-column">Cost</th><th class="price-column">Status</th><th class="value-col">Return</th><th></th></tr></thead><tbody>${items
          .slice(0, activityLimit)
          .map(
            (i) =>
              `<tr><td>${marketCell(i.side, i.label, i.detail, i.marketId)}</td><td class="price-column">${money(i.cost)} G</td><td class="price-column">Closed</td><td><span class="position-value-main">${money(i.value)} G</span><span class="position-profit ${cls(i.profit)}">${signed(i.profit)} G</span></td><td><a class="profile-trade-link" href="${marketLink(i.marketId)}">Play ↗</a></td></tr>`,
          )
          .join("")}</tbody></table>`;
        $("profile-load-more").hidden = items.length <= activityLimit;
      }
    }
    $("profile-load-more").textContent =
      tab === "activity" ? "Show more activity" : "Show more positions";
    $("profile-results").innerHTML = html;
  }
  function setTab(value) {
    tab = value;
    activityLimit = 20;
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.setAttribute("aria-selected", b.dataset.tab === tab);
      b.tabIndex = b.dataset.tab === tab ? 0 : -1;
    });
    $("position-search").placeholder = `Search ${tab}`;
    $("position-search").setAttribute("aria-label", `Search ${tab}`);
    renderResults();
  }
  function openEditor() {
    if (!snapshot) return;
    const p = snapshot.player;
    selectedAvatar = p.avatar || 0;
    $("username").value = p.name;
    $("profile-bio-input").value = p.bio || "";
    $("bio-count").textContent = `${(p.bio || "").length}/200`;
    $("avatar-picker").innerHTML = Array.from(
      { length: 8 },
      (_, i) =>
        `<button type="button" data-avatar="${i}" aria-label="Profile picture ${i + 1}" aria-pressed="${i === selectedAvatar}">${avatar(i)}</button>`,
    ).join("");
    $("profile-save-error").hidden = true;
    $("edit-profile-dialog").showModal();
    $("username").focus();
    $("username").select();
  }
  function closeEditor() {
    if (!saving) $("edit-profile-dialog").close();
  }
  $("edit-profile-form").onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    $("save-profile").disabled = true;
    $("save-profile").textContent = "Saving…";
    $("cancel-profile-edit").disabled = true;
    $("close-profile-editor").disabled = true;
    $("profile-save-error").hidden = true;
    try {
      await client.updateProfile({
        name: $("username").value.trim(),
        bio: $("profile-bio-input").value.trim(),
        avatar: selectedAvatar,
      });
      $("edit-profile-dialog").close();
      toast("Profile saved");
    } catch (e) {
      $("profile-save-error").textContent = e.message;
      $("profile-save-error").hidden = false;
    } finally {
      saving = false;
      $("save-profile").disabled = false;
      $("save-profile").textContent = "Save changes";
      $("cancel-profile-edit").disabled = false;
      $("close-profile-editor").disabled = false;
    }
  };
  function showInfo(type) {
    const p = snapshot?.player;
    $("home-dialog-title").textContent =
      type === "wallet"
        ? "Your gold wallet"
        : type === "about"
          ? "Hypothesis"
          : "Your prediction playground";
    $("home-dialog-content").innerHTML =
      type === "wallet" && p
        ? `<div class="wallet-total"><span class="coin">G</span>${money(p.balance)}</div><p>Available gold · ${safe(p.name)}</p><div class="wallet-details"><div><span>Reserved in orders</span><strong>${money(p.reserved)} G</strong></div><div><span>Total portfolio value</span><strong>${money(p.equity)} G</strong></div></div><div class="dialog-note">Gold has no cash value. This browser remembers your guest account. Different browsers get separate accounts.</div><a class="dialog-button" href="bitcoin.html">Explore the live market</a>`
        : '<p>Explore upcoming science experiments and trade the live Bitcoin simulation with free gold. Bitcoin lives under Maths &amp; Statistics.</p><p>Every new guest starts with 1,000 gold. Each trade asks for confirmation, and each winning share pays 1 gold. Your profile tracks real guest trades and saved portfolio observations.</p><p>Positions Value uses current sell quotes. Total PnL includes available gold, reserved gold, and marked positions, less your starting 1,000 gold. Biggest Win is your largest recorded positive sell-fill or settlement profit. Markets Traded counts distinct five-minute rounds with fills. Statistics reset when you reset your practice wallet.</p><div class="dialog-note">A playground for scientific predictions. Trade live aerofoil, Galton, escape, and Bitcoin experiments. Gold has no cash value.</div><a class="dialog-button" href="index.html">Explore science markets</a>';
    $("home-dialog").showModal();
  }
  $("profile-subject-nav").innerHTML =
    `<a class="subject-tab" href="index.html">${icon("chart")}Trending</a><a class="subject-tab" href="index.html?new=1">New</a><span class="nav-separator"></span>${PhysicsCatalog.subjects.map((s) => `<a class="subject-tab" href="index.html?subject=${s.id}">${safe(s.name)}</a>`).join("")}`;
  $("home-search-form").onsubmit = (event) => {
    event.preventDefault();
    location.href = `index.html?q=${encodeURIComponent($("home-search").value.trim())}`;
  };
  $("home-menu-toggle").onclick = () => {
    $("home-menu").hidden = !$("home-menu").hidden;
    $("home-menu-toggle").setAttribute("aria-expanded", !$("home-menu").hidden);
  };
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (b?.dataset.tab) setTab(b.dataset.tab);
    if (b?.dataset.state) {
      positionState = b.dataset.state;
      activityLimit = 20;
      document
        .querySelectorAll("[data-state]")
        .forEach((el) =>
          el.setAttribute("aria-pressed", el.dataset.state === positionState),
        );
      renderResults();
    }
    if (b?.dataset.period) {
      period = b.dataset.period;
      renderChart();
    }
    if (b?.hasAttribute("data-avatar")) {
      selectedAvatar = Number(b.dataset.avatar);
      document
        .querySelectorAll("[data-avatar]")
        .forEach((el) =>
          el.setAttribute(
            "aria-pressed",
            Number(el.dataset.avatar) === selectedAvatar,
          ),
        );
    }
    if (b?.dataset.dialog) showInfo(b.dataset.dialog);
    if (!event.target.closest("#home-menu, #home-menu-toggle")) {
      $("home-menu").hidden = true;
      $("home-menu-toggle").setAttribute("aria-expanded", false);
    }
  });
  $("edit-profile").onclick = openEditor;
  $("close-profile-editor").onclick = closeEditor;
  $("cancel-profile-edit").onclick = closeEditor;
  $("edit-profile-dialog").addEventListener("cancel", (e) => {
    if (saving) e.preventDefault();
  });
  $("profile-bio-input").oninput = () =>
    ($("bio-count").textContent = `${$("profile-bio-input").value.length}/200`);
  $("position-search").oninput = renderResults;
  $("position-sort").onchange = renderResults;
  $("activity-type").onchange = () => {
    activityLimit = 20;
    renderResults();
  };
  $("profile-load-more").onclick = () => {
    activityLimit += 20;
    renderResults();
  };
  $("close-home-dialog").onclick = () => $("home-dialog").close();
  $("profile-chart").addEventListener("pointermove", (event) => {
    if (!chartPoints.length) return;
    const bounds = $("profile-chart").getBoundingClientRect(),
      x = ((event.clientX - bounds.left) / bounds.width) * 440;
    const point = chartPoints.reduce((closest, p) =>
      Math.abs(p.x - x) < Math.abs(closest.x - x) ? p : closest,
    );
    $("profile-chart-tooltip").hidden = false;
    $("profile-chart-tooltip").innerHTML =
      `<strong>${signed(point.value)} G</strong>${date(point.time)} · ${time(point.time)}`;
    const line = $("chart-hover-line");
    line.setAttribute("x1", point.x);
    line.setAttribute("x2", point.x);
    line.setAttribute("visibility", "visible");
  });
  $("profile-chart").addEventListener("pointerleave", () => {
    $("profile-chart-tooltip").hidden = true;
    $("chart-hover-line")?.setAttribute("visibility", "hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      ) &&
      !document.querySelector("dialog[open]")
    ) {
      e.preventDefault();
      $("home-search").focus();
    }
    if (e.key === "Escape") {
      $("home-menu").hidden = true;
      $("home-menu-toggle").setAttribute("aria-expanded", false);
    }
    if (
      ["ArrowLeft", "ArrowRight"].includes(e.key) &&
      document.activeElement.matches("[data-tab]")
    ) {
      e.preventDefault();
      setTab(tab === "positions" ? "activity" : "positions");
      $(`${tab}-tab`).focus();
    }
  });
  $("profile-picture").innerHTML = avatar(0);
  setTab("positions");
  client.start();
})();
