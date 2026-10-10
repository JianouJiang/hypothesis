(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { subjects, markets, svg } = PhysicsCatalog;
  const { safe, money, storage } = PhysicsGuest;
  const icon = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const subject = (id) => subjects.find((s) => s.id === id);
  const featured = markets.filter((m) => m.featured);
  let featureIndex = 0,
    limit = 11,
    snapshot,
    state = {},
    watchlist;
  try {
    watchlist = new Set(
      JSON.parse(storage.get("physics-watchlist-v1") || "[]").filter((id) =>
        markets.some((m) => m.id === id),
      ),
    );
  } catch {
    watchlist = new Set();
  }
  if (storage.get("physics-favorite") === "true") watchlist.add("bitcoin");
  if (storage.get("physics-favorite") === "false") watchlist.delete("bitcoin");
  const client = new PhysicsGuest.Client(
    (data) => {
      snapshot = data;
      $("home-balance").textContent = money(data.player.balance);
      updateLive();
    },
    (message) => ($("home-connection").textContent = message),
  );
  const choices = (m) =>
    m.choices || [
      { label: m.outcomes?.[0] || "Yes", chance: m.chance },
      { label: m.outcomes?.[1] || "No", chance: 100 - m.chance },
    ];
  const thumb = (m) => `<span class="science-thumbnail">${svg(m.art)}</span>`;
  const link = (m) => (m.live ? "bitcoin.html" : `?market=${m.id}`);
  const preview = (m) => (m.live ? "" : `data-preview="${m.id}"`);
  function bookmark(m, className = "card-bookmark") {
    return `<button class="${className}" data-bookmark="${m.id}" aria-label="${watchlist.has(m.id) ? "Remove from" : "Add to"} watchlist: ${safe(m.short)}" aria-pressed="${watchlist.has(m.id)}">${icon("bookmark")}</button>`;
  }
  function readState() {
    const params = new URLSearchParams(location.search);
    state = {
      subject: subjects.some((s) => s.id === params.get("subject"))
        ? params.get("subject")
        : "",
      q: params.get("q") || "",
      topic: params.get("topic") || "",
      new: params.get("new") === "1",
      watch: params.get("watchlist") === "1",
      status: ["live", "preview"].includes(params.get("status"))
        ? params.get("status")
        : "all",
      sort: ["title", "subject"].includes(params.get("sort"))
        ? params.get("sort")
        : "featured",
    };
    $("home-search").value = state.q;
    $("status-filter").value = state.status;
    $("sort-filter").value = state.sort;
  }
  function change(values, replace = false) {
    Object.assign(state, values);
    limit = 11;
    const params = new URLSearchParams();
    for (const key of ["subject", "q", "topic"])
      if (state[key]) params.set(key, state[key]);
    if (state.new) params.set("new", "1");
    if (state.watch) params.set("watchlist", "1");
    if (state.status !== "all") params.set("status", state.status);
    if (state.sort !== "featured") params.set("sort", state.sort);
    try {
      history[replace ? "replaceState" : "pushState"](
        {},
        "",
        `${location.pathname}${params.size ? "?" + params : ""}`,
      );
    } catch {
      /* File previews still filter without history. */
    }
    $("home-search").value = state.q;
    $("status-filter").value = state.status;
    $("sort-filter").value = state.sort;
    render();
  }
  function renderFeature() {
    const m = featured[featureIndex];
    $("featured-market").innerHTML =
      `<div class="featured-heading">${thumb(m)}<div><div class="feature-eyebrow">${safe(subject(m.subject).name)}<span class="feature-topic"> · ${safe(m.topic)}</span><span class="preview-tag">Coming soon</span></div><a href="${link(m)}" ${preview(m)}><h2>${safe(m.title)}</h2></a></div>${bookmark(m, "icon-button card-bookmark")}</div><div class="featured-body"><div class="feature-outcomes">${choices(
        m,
      )
        .map(
          (c, i) =>
            `<div class="featured-outcome"><span class="featured-outcome-label"><i class="outcome-dot" style="background:${c.color || ["#789ad7", "#c3cdda", "#a6bcad"][i]}"></i>${safe(c.label)}</span><strong>${c.chance}%</strong></div>`,
        )
        .join(
          "",
        )}<p class="feature-odds-caption">Illustrative odds · Market preview</p><p class="feature-description">${safe(m.description)}</p><a class="feature-preview-link" href="${link(m)}" ${preview(m)}>Explore this experiment ${icon("arrow")}</a></div><a class="feature-art" href="${link(m)}" ${preview(m)} aria-label="Preview ${safe(m.short)}">${svg(m.art, true)}<span class="feature-art-label">CONCEPT PREVIEW</span></a></div><div class="featured-footer"><span>${icon("clock")}Planned ${m.duration} rounds <span>·</span> Play gold</span><span class="small-brand">Polymarket <span>physics</span></span></div>`;
    $("carousel-dots").innerHTML = featured
      .map(
        (m, i) =>
          `<button data-feature="${i}" aria-label="Feature ${safe(m.short)}" aria-pressed="${i === featureIndex}"></button>`,
      )
      .join("");
    $("previous-feature-name").textContent =
      featured[(featureIndex + featured.length - 1) % featured.length].short;
    $("next-feature-name").textContent =
      featured[(featureIndex + 1) % featured.length].short;
  }
  function card(m) {
    const chance = m.live
      ? Math.round((snapshot?.probability ?? 0.5) * 100)
      : m.chance;
    return `<article class="market-card ${m.live ? "live-card" : "preview-card"}${m.choices ? " multi-card" : ""}" data-market="${m.id}"><div class="market-card-top"><a class="card-title-link" href="${link(m)}" ${preview(m)}>${thumb(m)}<div><h2>${safe(m.title)}</h2>${m.choices ? '<span class="topic-mini-label">3 possible outcomes</span>' : ""}</div></a>${m.choices ? "" : `<div class="${m.live ? "chance-gauge" : "card-chance"}" style="--chance:${chance}"><strong ${m.live ? 'id="bitcoin-chance"' : ""}>${chance}%</strong><small>${m.live ? "chance Up" : "preview"}</small></div>`}</div>${m.live ? `<div class="live-card-subtitle">${icon("clock")}5 min · <span id="bitcoin-countdown">New round every 5 minutes</span></div>` : ""}${m.choices ? `<div class="market-card-choices">${m.choices.map((c, i) => `<div class="card-choice"><i class="outcome-dot" style="background:${c.color || ["#98abc7", "#ccb78d", "#a3bcb0"][i]}"></i><a class="choice-name" href="${link(m)}" ${preview(m)}>${safe(c.label)}</a><strong>${c.chance}%</strong><span class="choice-actions"><a href="${link(m)}" ${preview(m)} aria-label="Preview ${safe(c.label)} Yes">Yes</a><a href="${link(m)}" ${preview(m)} aria-label="Preview ${safe(c.label)} No">No</a></span></div>`).join("")}</div>` : `<div class="card-outcomes">${m.live ? '<a href="bitcoin.html?side=up" id="bitcoin-up">Up ↗</a><a href="bitcoin.html?side=down" id="bitcoin-down">Down ↘</a>' : `<a href="${link(m)}" ${preview(m)}>Yes ↗</a><a href="${link(m)}" ${preview(m)}>No ↘</a>`}</div>`}<div class="market-card-footer">${m.live ? '<span class="live-label"><i></i>Live</span><span class="card-volume" id="bitcoin-volume"></span>' : '<span class="preview-tag">Coming soon</span>'}<span>·</span><span class="card-subject">${safe(subject(m.subject).name)}</span>${bookmark(m)}</div></article>`;
  }
  function render() {
    $("subject-nav").innerHTML =
      `<a href="index.html" class="subject-tab" data-subject="" aria-current="${!state.subject && !state.new}">${icon("chart")}Trending</a><a href="?new=1" class="subject-tab" data-new aria-current="${state.new}">New</a><span class="nav-separator"></span>${subjects.map((s) => `<a class="subject-tab" href="?subject=${s.id}" data-subject="${s.id}" aria-current="${state.subject === s.id}">${safe(s.name)}</a>`).join("")}`;
    const available = markets.filter(
      (m) => !state.subject || m.subject === state.subject,
    );
    const topics = ["", "Live", ...new Set(available.map((m) => m.topic))];
    $("market-topic-bar").innerHTML = topics
      .map(
        (t) =>
          `<button class="topic-chip" data-topic="${safe(t)}" aria-pressed="${state.topic === t}">${t === "Live" ? '<i class="topic-live-dot"></i>' : ""}${safe(t || "All")}</button>`,
      )
      .join("");
    let matches = available.filter(
      (m) =>
        (!state.new || m.isNew) &&
        (!state.watch || watchlist.has(m.id)) &&
        (!state.topic ||
          (state.topic === "Live" ? m.live : m.topic === state.topic)) &&
        (state.status === "all" ||
          (state.status === "live" ? m.live : !m.live)) &&
        `${m.title} ${m.description} ${m.topic} ${subject(m.subject).name}`
          .toLowerCase()
          .includes(state.q.toLowerCase()),
    );
    if (state.sort === "title")
      matches.sort((a, b) => a.title.localeCompare(b.title));
    if (state.sort === "subject")
      matches.sort((a, b) =>
        subject(a.subject).name.localeCompare(subject(b.subject).name),
      );
    const isDefault =
      !state.subject &&
      !state.q &&
      !state.new &&
      !state.watch &&
      !state.topic &&
      state.status === "all";
    $("featured-layout").hidden = !isDefault;
    $("markets-heading").textContent = state.watch
      ? "Your watchlist"
      : state.q
        ? "Search results"
        : state.subject
          ? subject(state.subject).name
          : state.new
            ? "New markets"
            : "All markets";
    $("market-result-count").textContent = isDefault
      ? ""
      : `${matches.length} market${matches.length === 1 ? "" : "s"}`;
    $("watchlist-filter").setAttribute("aria-pressed", state.watch);
    $("watchlist-count").hidden = !watchlist.size;
    $("watchlist-count").textContent = watchlist.size;
    $("market-grid").innerHTML =
      (isDefault
        ? `<article class="market-card discovery-card"><h2>The science of<br><span>what happens next.</span></h2><p>Turn your curiosity into a prediction. A new playground is taking shape.</p><div class="discovery-card-art">${svg("orbit")}</div><button class="discovery-card-link" data-dialog="how">Welcome to Polymarket Physics ${icon("arrow")}</button></article>`
        : "") + matches.slice(0, limit).map(card).join("");
    $("home-empty").hidden = matches.length > 0;
    $("empty-message").textContent = state.watch
      ? "Bookmark a market to find it here. Clear other filters to see more."
      : "Try another subject or a different search.";
    $("load-more").hidden = matches.length <= limit;
    updateLive();
  }
  function updateLive() {
    if (!snapshot || !$("bitcoin-chance")) return;
    const chance = Math.round(snapshot.probability * 100);
    $("bitcoin-chance").textContent = `${chance}%`;
    $("bitcoin-chance").parentNode.style.setProperty("--chance", chance);
    $("bitcoin-up").textContent =
      `Up ${Math.round(snapshot.quotes.up.ask * 100)}¢ ↗`;
    $("bitcoin-down").textContent =
      `Down ${Math.round(snapshot.quotes.down.ask * 100)}¢ ↘`;
    $("bitcoin-volume").textContent =
      `· ${money(snapshot.round.volume, 0)} G vol.`;
    countdown();
  }
  function countdown() {
    if (!snapshot || !$("bitcoin-countdown")) return;
    const secs = Math.max(
      0,
      Math.ceil(
        (snapshot.round.end - Date.now() - (client.offset || 0)) / 1000,
      ),
    );
    $("bitcoin-countdown").textContent =
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} remaining`;
  }
  function toggleBookmark(id) {
    if (!markets.some((m) => m.id === id)) return;
    if (watchlist.has(id)) watchlist.delete(id);
    else watchlist.add(id);
    storage.set("physics-watchlist-v1", JSON.stringify([...watchlist]));
    if (id === "bitcoin")
      storage.set("physics-favorite", String(watchlist.has(id)));
    document.querySelectorAll(`[data-bookmark="${id}"]`).forEach((b) => {
      b.setAttribute("aria-pressed", watchlist.has(id));
      if (b.dataset.modalBookmark)
        b.innerHTML = `${icon("bookmark")}${watchlist.has(id) ? "Saved to watchlist" : "Add to watchlist"}`;
    });
    $("watchlist-count").textContent = watchlist.size;
    $("watchlist-count").hidden = !watchlist.size;
    if (state.watch) render();
  }
  function showDialog(type, id) {
    let title, content;
    if (type === "preview") {
      const m = markets.find((m) => m.id === id && !m.live);
      if (!m) return;
      title = m.title;
      content = `<div class="preview-modal-art">${svg(m.art, true)}</div><div class="preview-modal-meta">${safe(subject(m.subject).name)}<i></i>Planned ${m.duration} rounds<span class="preview-tag">Coming soon</span></div><p>${safe(m.description)}</p><div class="preview-modal-choices">${choices(
        m,
      )
        .map((c) => `<div>${safe(c.label)}<strong>${c.chance}%</strong></div>`)
        .join(
          "",
        )}</div><p class="feature-odds-caption">Illustrative odds for this concept preview.</p><h3 class="modal-section-label">How this experiment will resolve</h3><p>${safe(m.rule)}</p><div class="dialog-note">This game is still being built. You can save it to your watchlist; trading opens when the simulation launches.</div><div class="preview-modal-actions"><button data-bookmark="${m.id}" data-modal-bookmark aria-pressed="${watchlist.has(m.id)}">${icon("bookmark")}${watchlist.has(m.id) ? "Saved to watchlist" : "Add to watchlist"}</button><a href="bitcoin.html">Play Bitcoin now ↗</a></div>`;
    } else if (type === "wallet") {
      const p = snapshot?.player;
      title = "Your gold wallet";
      content = p
        ? `<div class="wallet-total"><span class="coin">G</span>${money(p.balance)}</div><p>Available gold · ${safe(p.name)}</p><div class="wallet-details"><div><span>Reserved in orders</span><strong>${money(p.reserved)} G</strong></div><div><span>Total portfolio value</span><strong>${money(p.equity)} G</strong></div></div><p>Your gold is shared across the live game and your profile. Each new guest starts with 1,000 gold.</p><a class="dialog-button" href="profile.html">View your profile</a>`
        : "<p>Connecting to your guest wallet. Please try again in a moment.</p>";
    } else if (type === "about") {
      title = "A prediction playground for curious minds";
      content =
        '<p>Polymarket Physics is an independent project inspired by the layout of Polymarket. Explore science experiments, form a prediction, and see what happens.</p><p>The Bitcoin simulation is playable now. Science markets are concept previews while their games are in development. All trades use free gold with no cash value.</p><a class="dialog-button secondary" href="https://github.com/JianouJiang/polymarket_physics" target="_blank" rel="noopener">Explore the project on GitHub ↗</a>';
    } else {
      title = "A little curiosity goes a long way.";
      content =
        '<ol class="home-steps"><li><strong>Make yourself at home.</strong>Your guest account starts with 1,000 gold. Visit your profile to choose a username.</li><li><strong>Find your next prediction.</strong>Browse the science subjects, explore upcoming experiments, and save your favorites.</li><li><strong>Play the live Bitcoin market.</strong>Under Maths &amp; Statistics, predict whether a simulated price goes Up or Down in five minutes. Review and confirm each trade before spending gold.</li><li><strong>See how your ideas stack up.</strong>Follow your positions, activity, and profit/loss in your profile. Each winning share pays 1 gold.</li></ol><div class="dialog-note">Science games are coming soon. Their preview odds are illustrative. Bitcoin prices and bot traders are simulated; gold has no cash value.</div><a class="dialog-button" href="bitcoin.html">Make your first prediction</a>';
    }
    $("home-dialog-title").textContent = title;
    $("home-dialog-content").innerHTML = content;
    if (!$("home-dialog").open) $("home-dialog").showModal();
  }
  document.addEventListener("click", (event) => {
    const el = event.target.closest("button,a");
    if (!el) return;
    if (el.hasAttribute("data-subject")) {
      event.preventDefault();
      change({ subject: el.dataset.subject, topic: "", new: false, q: "" });
    } else if (el.hasAttribute("data-new")) {
      event.preventDefault();
      change({ new: true, subject: "", topic: "" });
    } else if (el.hasAttribute("data-topic"))
      change({ topic: el.dataset.topic });
    else if (el.dataset.preview) {
      event.preventDefault();
      showDialog("preview", el.dataset.preview);
    } else if (el.dataset.bookmark) toggleBookmark(el.dataset.bookmark);
    else if (el.dataset.dialog) showDialog(el.dataset.dialog);
    else if (el.hasAttribute("data-feature")) {
      featureIndex = Number(el.dataset.feature);
      renderFeature();
    } else if (el.hasAttribute("data-watchlist-link")) {
      change({ watch: true, subject: "", q: "", topic: "", new: false });
      $("all-markets").scrollIntoView();
    }
    if (!event.target.closest("#home-menu, #home-menu-toggle")) {
      $("home-menu").hidden = true;
      $("home-menu-toggle").setAttribute("aria-expanded", false);
    }
  });
  $("home-search-form").onsubmit = (event) => {
    event.preventDefault();
    change({ q: $("home-search").value.trim() });
  };
  $("home-search").oninput = () => change({ q: $("home-search").value }, true);
  $("focus-search").onclick = () => {
    $("home-search").scrollIntoView({ block: "center" });
    $("home-search").focus();
  };
  $("toggle-filters").onclick = () => {
    $("filter-options").hidden = !$("filter-options").hidden;
    $("toggle-filters").setAttribute(
      "aria-expanded",
      !$("filter-options").hidden,
    );
  };
  $("watchlist-filter").onclick = () => change({ watch: !state.watch });
  $("status-filter").onchange = () =>
    change({ status: $("status-filter").value });
  $("sort-filter").onchange = () => change({ sort: $("sort-filter").value });
  const reset = () =>
    change({
      subject: "",
      q: "",
      topic: "",
      new: false,
      watch: false,
      status: "all",
      sort: "featured",
    });
  $("clear-search").onclick = reset;
  $("reset-filters").onclick = reset;
  $("explore-all").onclick = () => {
    reset();
    $("all-markets").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  $("load-more").onclick = () => {
    limit += 12;
    render();
  };
  $("previous-feature").onclick = () => {
    featureIndex = (featureIndex + featured.length - 1) % featured.length;
    renderFeature();
  };
  $("next-feature").onclick = () => {
    featureIndex = (featureIndex + 1) % featured.length;
    renderFeature();
  };
  $("close-home-dialog").onclick = () => $("home-dialog").close();
  $("home-menu-toggle").onclick = () => {
    $("home-menu").hidden = !$("home-menu").hidden;
    $("home-menu-toggle").setAttribute("aria-expanded", !$("home-menu").hidden);
  };
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      ) &&
      !$("home-dialog").open
    ) {
      e.preventDefault();
      $("home-search").focus();
    }
    if (e.key === "Escape") {
      $("home-menu").hidden = true;
      $("home-menu-toggle").setAttribute("aria-expanded", false);
    }
  });
  window.addEventListener("popstate", () => {
    readState();
    render();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try {
      watchlist = new Set(
        JSON.parse(storage.get("physics-watchlist-v1") || "[]"),
      );
    } catch {
      watchlist = new Set();
    }
    readState();
    renderFeature();
    render();
  });
  $("subject-ranking").innerHTML = [
    "fluid",
    "solid",
    "maths",
    "thermo",
    "optics",
  ]
    .map(
      (id, i) =>
        `<a class="subject-rank" href="?subject=${id}" data-subject="${id}"><span>${i + 1}</span><span>${safe(subject(id).name)} <i style="background:${subject(id).color}"></i></span><small>${markets.filter((m) => m.subject === id).length} markets</small>${icon("chevron")}</a>`,
    )
    .join("");
  readState();
  renderFeature();
  render();
  const initialMarket = new URLSearchParams(location.search).get("market");
  if (initialMarket) showDialog("preview", initialMarket);
  setInterval(countdown, 1000);
  client.start();
})();
