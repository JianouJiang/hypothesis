(function () {
  "use strict";
  const { safe, avatar, storage, money } = PhysicsGuest;
  const mount = document.querySelector("[data-community-game]");
  const game = mount?.dataset.communityGame || "";
  const titles = {
    bitcoin: "Bitcoin",
    aerofoil: "Aerofoil flow",
    galton: "Galton board",
    escape: "Ball escape",
    ...Object.fromEntries(
      Object.entries(window.HypothesisExperiments?.definitions || {}).map(
        ([id, d]) => [id, d.short],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(window.HypothesisLive?.definitions || {}).map(
        ([id, d]) => [id, d.short],
      ),
    ),
  };
  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const relative = (time) => {
    const seconds = Math.max(0, (Date.now() - time) / 1000);
    return seconds < 60
      ? "just now"
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : `${Math.floor(seconds / 86400)}d ago`;
  };
  const heart =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  let session = window.PhysicsSession,
    ready = false,
    feed,
    loading = false,
    tab = "comments",
    limit = 20,
    posting = false;
  const expanded = new Set(),
    longComments = new Set();
  const status = (text, error = false) => {
    const el = document.getElementById("community-status");
    if (el) {
      el.textContent = text;
      el.classList.toggle("community-error", error);
    }
  };
  async function api(body, query = "") {
    if (session?.mode !== "server")
      throw new Error(
        "Reconnect to use shared comments and feedback. You can also email us below.",
      );
    const headers = { "Content-Type": "application/json" };
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await fetch(
      `${session.base || ""}/api/community${query}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers,
        credentials: session.base ? "omit" : "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
        keepalive: body?.action === "event",
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not save. Please try again.");
    return result;
  }
  const badges = (positions) =>
    positions
      .map(
        (p) =>
          `<span class="community-badge ${p.side === "down" ? "negative" : ""}">${money(p.shares, 1)} ${safe(p.label)}</span>`,
      )
      .join("");
  const commentRow = (
    c,
    reply = false,
  ) => `<article class="community-comment ${reply ? "is-reply" : ""}" id="comment-${safe(c.id)}">
    <span class="community-avatar">${avatar(c.avatar)}</span><div class="community-comment-body">
    <div class="community-byline"><strong>${safe(c.name)}</strong>${badges(c.positions)}<time datetime="${new Date(c.time).toISOString()}" title="${new Date(c.time).toLocaleString()}">${relative(c.time)}</time>${c.own ? '<span class="community-you">You</span>' : ""}
    <details class="community-menu"><summary aria-label="Comment options">···</summary><div><button data-share="${c.id}">Copy link</button>${!c.removed ? `<button data-report="${c.id}">Report</button>${c.own ? `<button data-delete="${c.id}">Delete</button>` : ""}` : ""}</div></details></div>
    <p class="community-text ${c.removed ? "is-removed" : ""}">${safe(c.text.length > 400 && !longComments.has(c.id) ? c.text.slice(0, 400) + "…" : c.text)}</p>
    ${c.text.length > 400 ? `<button class="community-text-toggle" data-expand-text="${c.id}">${longComments.has(c.id) ? "Show less" : "Show more"}</button>` : ""}
    ${!c.removed ? `<div class="community-actions"><button data-like="${c.id}" aria-label="Like comment by ${safe(c.name)}" aria-pressed="${c.liked}" class="${c.liked ? "is-liked" : ""}">${heart}<span>${c.likes}</span></button><button data-reply="${c.id}">Reply</button></div>` : ""}
    <div data-reply-mount="${c.id}"></div>
    ${!reply && c.replies.length ? `<button class="community-replies-toggle" data-replies="${c.id}" aria-expanded="${expanded.has(c.id)}">${expanded.has(c.id) ? "⌃ Hide" : "⌄"} ${c.replies.length} ${c.replies.length === 1 ? "reply" : "replies"}</button>${expanded.has(c.id) ? c.replies.map((r) => commentRow(r, true)).join("") : ""}` : ""}
    </div></article>`;
  function render() {
    if (!mount || !feed) return;
    document.getElementById("comment-count").textContent = ` (${feed.count})`;
    const content = document.getElementById("community-content");
    if (
      content.querySelector("textarea") ||
      content.querySelector("details[open]")
    )
      return;
    if (tab === "comments") {
      content.innerHTML = feed.comments.length
        ? feed.comments.map((c) => commentRow(c)).join("")
        : `<div class="community-empty"><span>Start the conversation</span><p>${document.getElementById("community-holders").checked ? "No comments from current holders. Uncheck Holders to see everyone." : "Share your prediction, compare models, or ask about the experiment."}</p></div>`;
      document.getElementById("community-more").hidden = !feed.hasMore;
    } else if (tab === "holders") {
      content.innerHTML = feed.holders.length
        ? '<p class="community-caption">Current round · Guest traders ranked by shares held</p>' +
          feed.holders
            .map(
              (h, i) =>
                `<div class="community-holder"><span class="community-rank">${i + 1}</span><span class="community-avatar">${avatar(h.avatar)}</span><strong>${safe(h.name)}${h.own ? " (you)" : ""}</strong><div>${badges(h.positions)}</div></div>`,
            )
            .join("")
        : '<div class="community-empty"><span>No guest positions yet</span><p>Holders appear here after a trade fills in this round.</p></div>';
    } else if (tab === "positions") {
      content.innerHTML = feed.positions.length
        ? '<p class="community-caption">Your positions in the current round</p>' +
          feed.positions
            .map(
              (p) =>
                `<div class="community-position"><strong>${safe(p.label)}</strong><span>${money(p.shares)} shares</span></div>`,
            )
            .join("") +
          '<a class="community-profile-link" href="profile.html">View your full portfolio ↗</a>'
        : '<div class="community-empty"><span>No open positions</span><p>Your filled trades for this game will appear here.</p></div>';
    } else {
      content.innerHTML = feed.activity.length
        ? feed.activity
            .map(
              (t) =>
                `<div class="community-activity"><div><strong>${safe(t.actor)}</strong>${t.bot ? '<span class="community-you">Bot</span>' : ""}<p>${t.action === "buy" ? "Bought" : "Sold"} ${money(t.quantity, 1)} ${safe(t.label)} at ${Math.round(t.price * 100)}¢</p></div><time>${relative(t.time)}</time></div>`,
            )
            .join("")
        : '<div class="community-empty"><span>No trades this round yet</span><p>Fills will appear here as the market trades.</p></div>';
    }
  }
  async function refresh() {
    if (!mount || loading || session?.mode !== "server") return;
    loading = true;
    try {
      const query = new URLSearchParams({
        game,
        sort: document.getElementById("community-sort").value,
        holders: String(document.getElementById("community-holders").checked),
        limit: String(limit),
        focus: location.hash.startsWith("#comment-")
          ? location.hash.slice(9)
          : "",
      });
      feed = await api(undefined, `?${query}`);
      render();
      const targetId = location.hash.slice(1);
      if (
        targetId.startsWith("comment-") &&
        !document.getElementById(targetId)
      ) {
        const parent = feed.comments.find((c) =>
          c.replies.some((r) => `comment-${r.id}` === targetId),
        );
        if (parent) {
          expanded.add(parent.id);
          render();
        }
      }
      if (!ready) {
        document.getElementById(targetId)?.scrollIntoView({ block: "center" });
        ready = true;
      }
    } catch (error) {
      status(error.message, true);
    } finally {
      loading = false;
    }
  }
  function composerInput(form) {
    form.querySelector("textarea").addEventListener("input", () => {
      form.querySelector('[type="submit"]').disabled =
        !form.querySelector("textarea").value.trim() ||
        session?.mode !== "server";
      delete form.dataset.requestId;
    });
  }
  async function submitComment(event) {
    event.preventDefault();
    if (posting) return;
    const form = event.target,
      textarea = form.querySelector("textarea");
    posting = true;
    form.querySelector('[type="submit"]').disabled = true;
    form.dataset.requestId ||= uid();
    try {
      const result = await api({
        action: "comment",
        game,
        text: textarea.value,
        parentId: form.dataset.parent || null,
        requestId: form.dataset.requestId,
      });
      if (form.dataset.parent) {
        const root = feed.comments.find(
          (c) =>
            c.id === form.dataset.parent ||
            c.replies.some((r) => r.id === form.dataset.parent),
        );
        if (root) expanded.add(root.id);
        form.remove();
      } else {
        form.reset();
        delete form.dataset.requestId;
      }
      status("Comment posted.");
      await refresh();
      document
        .getElementById(`comment-${result.id}`)
        ?.scrollIntoView({ block: "nearest" });
    } catch (error) {
      status(error.message, true);
    } finally {
      posting = false;
      if (form.isConnected)
        form.querySelector('[type="submit"]').disabled = !textarea.value.trim();
    }
  }
  if (mount) {
    mount.id = "comments";
    mount.classList.add("community");
    mount.innerHTML = `<div class="community-tabs" role="tablist" aria-label="Market community">
      <button id="community-tab-comments" data-community-tab="comments" role="tab" aria-selected="true" aria-controls="community-panel">Comments<span id="comment-count"></span></button><button id="community-tab-holders" data-community-tab="holders" role="tab" aria-selected="false" tabindex="-1" aria-controls="community-panel">Top Holders</button><button id="community-tab-positions" data-community-tab="positions" role="tab" aria-selected="false" tabindex="-1" aria-controls="community-panel">Positions</button><button id="community-tab-activity" data-community-tab="activity" role="tab" aria-selected="false" tabindex="-1" aria-controls="community-panel">Activity</button></div>
      <div id="community-panel" role="tabpanel" aria-labelledby="community-tab-comments"><div id="community-comment-tools"><form class="community-composer" id="community-composer"><label class="sr-only" for="community-draft">Add a public comment</label><textarea id="community-draft" rows="1" maxlength="1200" placeholder="Add a comment…" required></textarea><div class="community-compose-controls"><button type="button" id="community-emoji" aria-label="Add emoji" aria-expanded="false">☺</button><button class="community-primary" type="submit" disabled>Post</button></div><div id="community-emojis" hidden>${["🔬", "📈", "🎯", "🤔", "👏", "🌊"].map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join("")}</div></form>
      <div class="community-toolbar"><div><label class="sr-only" for="community-sort">Sort comments</label><select id="community-sort"><option value="newest">Newest</option><option value="liked">Most liked</option></select><label class="community-check"><input type="checkbox" id="community-holders"> Holders</label></div><span class="community-link-warning"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.5 13 4v4c0 3-5 6.5-5 6.5S3 11 3 8V4Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg> Beware of external links.</span></div></div>
      <p id="community-status" class="community-status" role="status">Connecting to the conversation…</p><div id="community-content"></div><button id="community-more" class="community-more" hidden>Show more</button></div>
      <p class="community-caption community-public-note">Comments are public. <a href="profile.html">Edit your username</a> · Keep personal details in <button data-feedback>private feedback</button>.</p>`;
    const form = document.getElementById("community-composer");
    composerInput(form);
    form.addEventListener("submit", submitComment);
    for (const id of ["community-sort", "community-holders"])
      document.getElementById(id).addEventListener("change", () => {
        limit = 20;
        refresh();
      });
    document.getElementById("community-more").onclick = () => {
      limit += 20;
      refresh();
    };
    mount.querySelector(".community-tabs").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const tabs = [...mount.querySelectorAll('[role="tab"]')],
        i = tabs.indexOf(document.activeElement);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
    mount.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.communityTab) {
        tab = button.dataset.communityTab;
        mount.querySelectorAll('[role="tab"]').forEach((b) => {
          b.setAttribute("aria-selected", String(b === button));
          b.tabIndex = b === button ? 0 : -1;
        });
        document
          .getElementById("community-panel")
          .setAttribute("aria-labelledby", button.id);
        document.getElementById("community-comment-tools").hidden =
          tab !== "comments";
        document.getElementById("community-more").hidden = true;
        document.getElementById("community-content").innerHTML = "";
        render();
        refresh();
        return;
      }
      if (button.id === "community-emoji") {
        const el = document.getElementById("community-emojis");
        el.hidden = !el.hidden;
        button.setAttribute("aria-expanded", String(!el.hidden));
        return;
      }
      if (button.dataset.emoji) {
        const draft = document.getElementById("community-draft");
        draft.setRangeText(
          button.dataset.emoji,
          draft.selectionStart,
          draft.selectionEnd,
          "end",
        );
        draft.dispatchEvent(new Event("input"));
        draft.focus();
        document.getElementById("community-emojis").hidden = true;
        document
          .getElementById("community-emoji")
          .setAttribute("aria-expanded", "false");
        return;
      }
      if (button.dataset.replies) {
        expanded.has(button.dataset.replies)
          ? expanded.delete(button.dataset.replies)
          : expanded.add(button.dataset.replies);
        render();
        return;
      }
      if (button.dataset.expandText) {
        longComments.has(button.dataset.expandText)
          ? longComments.delete(button.dataset.expandText)
          : longComments.add(button.dataset.expandText);
        render();
        return;
      }
      const id =
        button.dataset.reply ||
        button.dataset.like ||
        button.dataset.delete ||
        button.dataset.report ||
        button.dataset.share;
      if (!id) return;
      const comment = feed?.comments
        .flatMap((c) => [c, ...c.replies])
        .find((c) => c.id === id);
      if (button.dataset.reply && comment) {
        mount
          .querySelectorAll(".community-reply-form")
          .forEach((f) => f.remove());
        const holder = mount.querySelector(`[data-reply-mount="${id}"]`);
        holder.innerHTML = `<form class="community-reply-form" data-parent="${id}"><label for="community-reply-draft">Reply to ${safe(comment.name)}</label><textarea id="community-reply-draft" maxlength="1200" rows="2" placeholder="Write a reply…" required></textarea><div><button type="button" data-cancel-reply>Cancel</button><button class="community-primary" type="submit" disabled>Reply</button></div></form>`;
        const f = holder.firstElementChild;
        composerInput(f);
        f.onsubmit = submitComment;
        f.querySelector("[data-cancel-reply]").onclick = () => {
          f.remove();
          render();
        };
        f.querySelector("textarea").focus();
        return;
      }
      button.closest("details")?.removeAttribute("open");
      if (button.dataset.report) {
        document.getElementById("community-report-form").dataset.id = id;
        openDialog("community-report");
        return;
      }
      if (button.dataset.share) {
        const url = new URL(location.href);
        url.hash = `comment-${id}`;
        try {
          await navigator.clipboard.writeText(url.href);
          status("Comment link copied.");
        } catch {
          status(`Comment link: ${url.href}`);
        }
        return;
      }
      button.disabled = true;
      try {
        await api(
          button.dataset.like
            ? { action: "like", id, liked: !comment.liked }
            : { action: "delete", id },
        );
        status(button.dataset.delete ? "Comment deleted." : "");
        await refresh();
      } catch (error) {
        status(error.message, true);
        button.disabled = false;
      }
    });
  }

  // One private feedback entry point and the same privacy choices on every page.
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog class="community-dialog" id="community-feedback" aria-labelledby="feedback-title"><button class="community-dialog-close" data-close aria-label="Close feedback">×</button><span class="community-eyebrow">BUILD THIS WITH US</span><h2 id="feedback-title">What do you think?</h2><p>Found a bug, have a model idea, or want a new experiment? Your message goes privately to Jianou.</p><form id="community-feedback-form"><div class="community-field-row"><label>About<select name="game"><option value="">The whole site</option>${Object.entries(
      titles,
    )
      .map(
        ([id, title]) =>
          `<option value="${id}" ${game === id ? "selected" : ""}>${title}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Type<select name="kind"><option value="idea">Idea</option><option value="bug">Bug</option><option value="question">Question</option><option value="other">Other</option></select></label></div><label>Your message<textarea name="message" rows="4" maxlength="2000" required placeholder="Tell us what worked, what didn't, or what you'd love to see…"></textarea></label><label>Email <span>(optional, for a reply)</span><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label class="community-check community-opt-in"><input name="updates" type="checkbox"> <span>Also email me about new experiments and competitions.</span></label><p class="community-small">Your email is private. Updates are optional. You can remove your saved email in Privacy choices, or contact us to unsubscribe.</p><p class="community-form-status" role="status"></p><button class="community-primary community-submit" type="submit">Send feedback</button></form><a class="community-direct-email" href="mailto:jianou.works@gmail.com">jianou.works@gmail.com ↗</a></dialog>
  <dialog class="community-dialog" id="community-privacy" aria-labelledby="privacy-title"><button class="community-dialog-close" data-close aria-label="Close privacy choices">×</button><span class="community-eyebrow">YOUR DATA</span><h2 id="privacy-title">Privacy choices</h2><p>We count game visits and game-link clicks to learn which experiments people enjoy. The owner sees daily totals, not individual browsing histories. The app does not collect IP addresses or device fingerprints for these counts.</p><label class="community-check community-opt-in"><input id="community-usage" type="checkbox"> <span>Share game usage counts from this browser</span></label><p class="community-small" id="community-dnt"></p><p>Public comments use your guest username and current positions. Feedback and optional reply emails are private to Jianou. Email update requests are separate and unchecked by default.</p><p>Game totals are kept for 90 days. Comments and feedback remain until removed. Your guest account is stored in this browser; clearing browser data can prevent you from managing old comments or emails.</p><button id="community-forget-email" class="community-secondary">Remove my saved email &amp; update request</button><p class="community-form-status" role="status"></p><p class="community-small">This removes email fields from your feedback and the updates list. For messages, comments, or data from another browser, contact <a href="mailto:jianou.works@gmail.com">jianou.works@gmail.com</a>.</p></dialog>
  <dialog class="community-dialog" id="community-report" aria-labelledby="report-title"><button class="community-dialog-close" data-close aria-label="Close report">×</button><h2 id="report-title">Report a comment</h2><p>Reports are private and reviewed by the site owner.</p><form id="community-report-form"><label>Reason<select name="reason"><option>Spam or misleading links</option><option>Harassment or abuse</option><option>Personal information</option><option>Other inappropriate content</option></select></label><p class="community-form-status" role="status"></p><button class="community-primary community-submit" type="submit">Send report</button></form></dialog>`,
  );
  function openDialog(id) {
    const d = document.getElementById(id);
    d.querySelector(".community-form-status").textContent = "";
    d.showModal();
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-feedback]"))
      openDialog("community-feedback");
    if (event.target.closest("[data-privacy]")) openDialog("community-privacy");
    if (event.target.closest("[data-close]"))
      event.target.closest("dialog").close();
  });
  document.querySelectorAll(".community-dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  const feedbackForm = document.getElementById("community-feedback-form");
  feedbackForm.addEventListener(
    "input",
    () => delete feedbackForm.dataset.requestId,
  );
  feedbackForm.onsubmit = async (event) => {
    event.preventDefault();
    const button = feedbackForm.querySelector('[type="submit"]'),
      message = feedbackForm.querySelector('[role="status"]');
    button.disabled = true;
    message.textContent = "Sending…";
    feedbackForm.dataset.requestId ||= uid();
    try {
      const fields = new FormData(feedbackForm);
      await api({
        action: "feedback",
        game: fields.get("game"),
        kind: fields.get("kind"),
        message: fields.get("message"),
        email: fields.get("email"),
        updates: fields.has("updates"),
        requestId: feedbackForm.dataset.requestId,
      });
      feedbackForm.reset();
      delete feedbackForm.dataset.requestId;
      message.textContent =
        "Thank you! Your feedback is saved in Jianou’s private inbox.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById("community-report-form").onsubmit = async (event) => {
    event.preventDefault();
    const f = event.target,
      button = f.querySelector('[type="submit"]'),
      message = f.querySelector('[role="status"]');
    button.disabled = true;
    try {
      await api({
        action: "report",
        id: f.dataset.id,
        reason: new FormData(f).get("reason"),
      });
      message.textContent =
        "Report sent. Thank you for helping keep the discussion useful.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  const dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
  const usageAllowed = () =>
    !dnt && storage.get("physics-usage-opt-out") !== "true";
  const usage = document.getElementById("community-usage");
  usage.checked = usageAllowed();
  usage.disabled = dnt;
  document.getElementById("community-dnt").textContent = dnt
    ? "Your browser’s Do Not Track setting is on. Usage counts are disabled."
    : "You can turn this off at any time. This does not affect playing or trading.";
  usage.onchange = () => {
    storage.set("physics-usage-opt-out", String(!usage.checked));
    if (!usage.checked) storage.set("physics-usage-queue", "[]");
  };
  document.getElementById("community-forget-email").onclick = async (event) => {
    const button = event.target,
      message = document.querySelector("#community-privacy [role=status]");
    button.disabled = true;
    try {
      await api({ action: "forget-email" });
      message.textContent =
        "Your saved email and update request have been removed.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  const queue = () => {
    try {
      return JSON.parse(storage.get("physics-usage-queue") || "[]")
        .filter((e) => e.time > Date.now() - 3600000)
        .slice(-20);
    } catch {
      return [];
    }
  };
  let flushing = false;
  async function flush() {
    if (flushing || !usageAllowed() || session?.mode !== "server") return;
    flushing = true;
    try {
      for (const event of queue()) {
        try {
          await api(event);
          storage.set(
            "physics-usage-queue",
            JSON.stringify(queue().filter((e) => e.eventId !== event.eventId)),
          );
        } catch {
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }
  function track(kind, target) {
    if (!usageAllowed()) return;
    storage.set(
      "physics-usage-queue",
      JSON.stringify([
        ...queue(),
        {
          action: "event",
          kind,
          game: target,
          eventId: uid(),
          time: Date.now(),
        },
      ]),
    );
    flush();
  }
  document.addEventListener(
    "click",
    (event) => {
      const a = event.target.closest("a[href]");
      if (!a) return;
      const url = new URL(a.href, location.href);
      const target =
        url.searchParams.get("game") ||
        url.pathname
          .split("/")
          .pop()
          .replace(/\.html$/, "");
      if (url.origin === location.origin && titles[target])
        track("click", target);
    },
    true,
  );
  let initialized = false;
  function accept(next) {
    session = next;
    if (mount)
      document.querySelector("#community-composer [type=submit]").disabled =
        session.mode !== "server" ||
        !document.getElementById("community-draft").value.trim() ||
        posting;
    if (!initialized && session.mode === "server") {
      initialized = true;
      status("");
      if (location.hash.startsWith("#comment-")) limit = 200;
      refresh();
      if (game) track("view", game);
      flush();
    }
    if (session.mode === "local")
      status("Connect to the shared market to join this conversation.");
  }
  window.addEventListener("physics-session", (e) => accept(e.detail));
  if (session) accept(session);
  setInterval(() => {
    if (!document.hidden) {
      refresh();
      flush();
    }
  }, 10000);
})();
