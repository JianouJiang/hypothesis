(function () {
  "use strict";
  const { safe, money, avatar, Client } = PhysicsGuest;
  const $ = (id) => document.getElementById(id);
  const icon = (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const params = new URLSearchParams(location.search);
  const state = {
    period: ["day", "week", "month", "all"].includes(params.get("period")) ? params.get("period") : "month",
    category: PhysicsCatalog.subjects.some((s) => s.id === params.get("category")) ? params.get("category") : "all",
    sort: params.get("sort") === "volume" ? "volume" : "profit",
    q: (params.get("q") || "").slice(0, 80), page: Math.max(1, Number(params.get("page")) || 1),
  };
  let request = 0, controller, debounce, refreshTimer;
  const client = new Client((snapshot) => {
    $("home-balance").textContent = money(snapshot.player.balance);
  }, (message) => { $("leaderboard-connection").textContent = message; });
  client.intervalMs = 30000;
  const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))} G`;
  const amount = (n) => `${money(n)} G`;
  function medal(rank) {
    if (rank > 3) return "";
    const color = ["#dba822", "#94aab4", "#ba806a"][rank - 1];
    return `<svg class="leaderboard-medal" viewBox="0 0 24 28" aria-label="${["Gold", "Silver", "Bronze"][rank - 1]} medal"><path d="m7 17-1 10 6-4 6 4-1-10" fill="${color}" stroke="white" stroke-width="2"/><path d="m12 1 4 2 4 1 1 4 2 4-2 4-1 4-4 1-4 2-4-2-4-1-1-4-2-4 2-4 1-4 4-1z" fill="${color}" stroke="white" stroke-width="2"/></svg>`;
  }
  function trader(row) {
    const name = row.isYou ? `<a class="leaderboard-name" href="profile.html">${safe(row.name)}</a>` : `<span class="leaderboard-name">${safe(row.name)}</span>`;
    return `<div class="leaderboard-trader"><span class="leaderboard-rank">${row.rank}</span><span class="leaderboard-avatar">${avatar(row.avatar)}${medal(row.rank)}</span>${name}${row.isYou ? '<span class="leaderboard-you-tag">You</span>' : ""}</div>`;
  }
  function render(data) {
    state.page = data.page;
    $("leaderboard-table").dataset.sort = state.sort;
    document.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.period === state.period));
    document.querySelectorAll("[data-sort]").forEach((b) => {
      if (b.tagName === "BUTTON") b.setAttribute("aria-pressed", b.dataset.sort === state.sort);
    });
    document.querySelectorAll(".leaderboard-sort-mobile").forEach((select) => select.value = state.sort);
    $("leaderboard-rows").innerHTML = data.entries.map((row) => `<tr class="${row.isYou ? "leaderboard-own-row" : ""}"><td>${trader(row)}</td><td class="profit-column ${row.profit < 0 ? "leaderboard-loss" : ""}">${signed(row.profit)}</td><td class="volume-column">${amount(row.volume)}</td></tr>`).join("");
    $("leaderboard-empty").hidden = data.entries.length > 0;
    $("leaderboard-empty").innerHTML = state.q
      ? '<strong>No traders found</strong><p>Try another username or clear your search.</p>'
      : '<strong>No predictions on the board yet</strong><p>Trade a science market to earn your place.</p><a href="index.html">Explore markets →</a>';
    const range = new Set([1, data.pages]);
    for (let i = Math.max(1, data.page - 2); i <= Math.min(data.pages, data.page + 2); i++) range.add(i);
    let previous = 0;
    const pages = [...range].sort((a, b) => a - b).map((page) => {
      const ellipsis = previous && page > previous + 1 ? '<span aria-hidden="true">…</span>' : "";
      previous = page;
      return `${ellipsis}<button data-page="${page}" aria-label="Page ${page}" ${page === data.page ? 'aria-current="page"' : ""}>${page}</button>`;
    }).join("");
    $("leaderboard-pagination").innerHTML = data.total ? `<button data-page="${data.page - 1}" aria-label="Previous page" ${data.page === 1 ? "disabled" : ""}>${icon("chevron", "previous")}</button>${pages}<button data-page="${data.page + 1}" aria-label="Next page" ${data.page === data.pages ? "disabled" : ""}>${icon("chevron")}</button>` : "";
    const you = data.you;
    $("leaderboard-your-rank").hidden = !you || data.entries.some((row) => row.isYou);
    $("leaderboard-your-rank").innerHTML = you ? `${trader(you)}<span>${state.sort === "profit" ? signed(you.profit) : amount(you.volume)}</span>` : "";
    $("leaderboard-wins-title").textContent = `Biggest wins ${ { day: "today", week: "this week", month: "this month", all: "of all time" }[state.period]}`;
    $("leaderboard-wins-list").innerHTML = data.wins.map((win, i) => {
      const id = win.marketId.startsWith("galton-") ? "galton" : win.marketId.split(":")[0];
      const market = PhysicsCatalog.markets.find((m) => m.id === id);
      const href = ["bitcoin", "aerofoil", "galton", "escape"].includes(id) ? `${id}.html` : id === "kilauea" ? "live.html?game=kilauea" : `experiment.html?game=${encodeURIComponent(id)}`;
      return `<li class="leaderboard-win"><span class="leaderboard-rank">${i + 1}</span><span class="guest-avatar">${avatar(win.avatar)}</span><div class="leaderboard-win-detail"><div class="leaderboard-win-title" title="${safe(win.name)} · ${safe(market?.title || id)}"><strong>${safe(win.name)}</strong> <a href="${safe(href)}">| ${safe(market?.title || id)}</a></div><div class="leaderboard-win-amount" title="Profit: ${signed(win.profit)}">${amount(win.cost)} <span class="arrow">→</span> <span class="payout">${amount(win.payout)}</span></div></div></li>`;
    }).join("");
    $("leaderboard-wins-empty").hidden = data.wins.length > 0;
    const coverage = data.limitedSince ? " Earlier category results and wins may be incomplete for accounts whose old activity was no longer retained; lifetime totals include all trades." : "";
    $("leaderboard-status").textContent = `${data.traders} ${data.traders === 1 ? "trader" : "traders"} · Realized profit · Gold has no cash value.${coverage}`;
    $("leaderboard-table").setAttribute("aria-busy", "false");
  }
  async function refresh() {
    const sequence = ++request;
    controller?.abort();
    controller = new AbortController();
    $("leaderboard-table").setAttribute("aria-busy", "true");
    try {
      let data;
      if (client.mode === "local") {
        let saved;
        try { saved = JSON.parse(PhysicsGuest.storage.get("polymarket-physics-market-v1") || "null"); } catch {}
        const engine = new PhysicsMarket.Market({ state: saved || client.memory });
        data = engine.leaderboard(state, client.localId);
      } else {
        const headers = client.token ? { Authorization: `Bearer ${client.token}` } : {};
        const response = await fetch(`/api/leaderboard?${new URLSearchParams(state)}`, {
          headers, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the leaderboard.");
      }
      if (sequence !== request) return;
      render(data);
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      $("leaderboard-rows").innerHTML = "";
      $("leaderboard-empty").hidden = false;
      $("leaderboard-empty").innerHTML = '<strong>Leaderboard unavailable</strong><p>Please try again in a moment.</p><button id="leaderboard-retry">Try again</button>';
      $("leaderboard-retry").onclick = refresh;
      $("leaderboard-pagination").innerHTML = "";
      $("leaderboard-your-rank").hidden = true;
      $("leaderboard-wins-list").innerHTML = "";
      $("leaderboard-wins-empty").hidden = false;
      $("leaderboard-status").textContent = "Connection lost · Rankings could not be refreshed.";
      $("leaderboard-table").setAttribute("aria-busy", "false");
    }
  }
  function change(values) {
    Object.assign(state, { page: 1 }, values);
    history.replaceState(null, "", `?${new URLSearchParams(state)}`);
    refresh();
  }
  $("leaderboard-category").innerHTML = '<option value="all">All Categories</option>' + PhysicsCatalog.subjects.map((s) => `<option value="${s.id}">${safe(s.name)}</option>`).join("");
  $("leaderboard-category").value = state.category;
  $("leaderboard-category").onchange = (event) => change({ category: event.target.value });
  $("leaderboard-search").value = state.q;
  $("leaderboard-search").oninput = (event) => {
    clearTimeout(debounce);
    const q = event.target.value;
    // Cancel a pending response immediately so it cannot overwrite a new search.
    ++request; controller?.abort();
    debounce = setTimeout(() => change({ q }), 200);
  };
  document.querySelectorAll(".leaderboard-sort-mobile").forEach((select) => select.onchange = (event) => change({ sort: event.target.value }));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.period) change({ period: button.dataset.period });
    if (button?.dataset.sort) change({ sort: button.dataset.sort });
    if (button?.dataset.page) { change({ page: Number(button.dataset.page) }); $("leaderboard-main").scrollIntoView({ block: "start" }); }
    if (!event.target.closest("#home-menu, #home-menu-toggle")) {
      $("home-menu").hidden = true; $("home-menu-toggle").setAttribute("aria-expanded", "false");
    }
  });
  $("leaderboard-info-open").onclick = () => $("leaderboard-info-dialog").showModal();
  $("leaderboard-info-close").onclick = () => $("leaderboard-info-dialog").close();
  document.querySelectorAll("[data-dialog]").forEach((button) => button.onclick = () => {
    if (button.dataset.dialog === "wallet") location.href = "profile.html";
    else $("leaderboard-info-dialog").showModal();
  });
  $("home-search-form").onsubmit = (event) => {
    event.preventDefault(); location.href = `index.html?q=${encodeURIComponent($("home-search").value.trim())}`;
  };
  $("home-menu-toggle").onclick = () => { $("home-menu").hidden = !$("home-menu").hidden; $("home-menu-toggle").setAttribute("aria-expanded", !$("home-menu").hidden); };
  $("subject-nav").innerHTML = `<a href="index.html" class="subject-tab">${icon("chart")}Trending</a><a href="index.html?new=1" class="subject-tab">New</a><a href="leaderboard.html" class="subject-tab" aria-current="page">Leaderboard</a><a href="competitions.html" class="subject-tab">Competitions</a><span class="nav-separator"></span>${PhysicsCatalog.subjects.map((s) => `<a class="subject-tab" href="index.html?subject=${s.id}">${safe(s.name)}</a>`).join("")}`;
  function startRefresh() { clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (!document.hidden) refresh(); }, 30000); }
  if (location.protocol === "file:") {
    client.start().then(() => { refresh(); startRefresh(); });
  } else {
    refresh(); startRefresh();
    client.start().then(() => { if (client.snapshot) refresh(); });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("pagehide", () => { clearInterval(refreshTimer); clearTimeout(debounce); controller?.abort(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) { refresh(); startRefresh(); } });
})();
