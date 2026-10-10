(function () {
  "use strict";
  const { safe } = PhysicsGuest;
  const $ = (id) => document.getElementById(id);
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
  };
  let key = "",
    base = "",
    data;
  async function api(body) {
    const response = await fetch(`${base}/api/community-admin`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      credentials: "omit",
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not load the inbox.");
    return result;
  }
  const date = (time) => new Date(time).toLocaleString();
  const action = (label, kind, id, extra = "") =>
    `<button class="community-secondary" data-action="${kind}" data-id="${safe(id)}" ${extra}>${label}</button>`;
  function render() {
    $("inbox-metrics").innerHTML = Object.entries(titles)
      .map(([game, title]) => {
        const totals = Object.values(data.stats).reduce(
          (sum, day) => ({
            click: sum.click + (day[game]?.click || 0),
            view: sum.view + (day[game]?.view || 0),
          }),
          { click: 0, view: 0 },
        );
        return `<div class="inbox-metric"><h3>${title}</h3><strong>${totals.view}</strong><span>visits</span><p>${totals.click} game-link clicks</p></div>`;
      })
      .join("");
    $("inbox-feedback-count").textContent =
      `(${data.feedback.filter((f) => !f.resolved).length} open)`;
    $("inbox-feedback").innerHTML =
      data.feedback
        .map(
          (f) =>
            `<article class="inbox-card ${f.resolved ? "inbox-resolved" : ""}"><strong>${safe(f.kind.toUpperCase())} · ${safe(titles[f.game] || "Whole site")}</strong><p>${safe(f.message)}</p><small>${safe(f.name)} · ${date(f.time)} · ${safe(f.id)}${f.resolved ? " · Resolved" : ""}</small><div>${f.email ? `<a href="mailto:${encodeURIComponent(f.email)}?subject=Re%3A%20Hypothesis%20feedback">Reply to ${safe(f.email)} ↗</a>` : "<small>No reply email</small>"}${!f.resolved ? action("Mark resolved", "resolve", f.id) : ""}${action("Delete message", "delete-feedback", f.id)}</div></article>`,
        )
        .join("") ||
      "<p>No feedback yet. New submissions will appear here.</p>";
    $("inbox-contacts").innerHTML =
      data.contacts
        .map(
          (c) =>
            `<article class="inbox-card"><strong>${safe(c.email)}</strong><p>${safe(c.name)} · Requested ${date(c.time)} · Unverified</p><small>Consent: ${safe(c.consent)}</small><div>${action("Remove saved email", "remove-contact", c.id)}</div></article>`,
        )
        .join("") || "<p>No update requests yet.</p>";
    $("inbox-reports").innerHTML =
      data.reports
        .map(
          (r) =>
            `<article class="inbox-card"><strong>${safe(r.reason)}</strong><p>${safe(r.comment?.text || "Comment deleted")}</p><small>By ${safe(r.comment?.name || "Guest")} · Reported by ${safe(r.reporter)} · ${date(r.time)}${r.resolved ? " · Reviewed" : ""}</small><div>${r.comment ? `<a href="${r.comment.game}.html#comment-${r.comment.id}">View conversation ↗</a>` : ""}${r.comment && !r.comment.deleted ? action(r.comment.hidden ? "Restore comment" : "Hide comment", "moderate", r.comment.id, `data-hidden="${!r.comment.hidden}"`) : ""}${!r.resolved ? action("Dismiss report", "resolve", r.id) : ""}</div></article>`,
        )
        .join("") || "<p>No reports to review.</p>";
    $("inbox-storage").textContent =
      `Community storage: ${Math.round((data.storage.bytes / data.storage.limit) * 100)}% of pilot capacity. Export and clear old feedback as needed; a full inbox rejects new submissions rather than dropping saved responses.`;
  }
  async function refresh() {
    data = await api();
    render();
    $("inbox-status").textContent =
      `Updated ${new Date().toLocaleTimeString()}`;
  }
  $("inbox-login").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    key = $("inbox-key").value.trim();
    $("inbox-status").textContent = "Unlocking…";
    try {
      if (location.hostname.endsWith(".github.io"))
        base = (await (await fetch("deployment.json")).json()).apiBase || "";
      await refresh();
      $("inbox-key").value = "";
      $("inbox-login").hidden = true;
      $("inbox-dashboard").hidden = false;
    } catch (error) {
      key = "";
      $("inbox-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("inbox-refresh").onclick = async () => {
    try {
      await refresh();
    } catch (error) {
      $("inbox-status").textContent = error.message;
    }
  };
  $("inbox-lock").onclick = () => {
    key = "";
    data = undefined;
    $("inbox-dashboard").hidden = true;
    [
      "inbox-feedback",
      "inbox-reports",
      "inbox-contacts",
      "inbox-metrics",
    ].forEach((id) => $(id).replaceChildren());
    $("inbox-login").hidden = false;
    $("inbox-status").textContent = "Inbox locked.";
    $("inbox-key").focus();
  };
  $("inbox-dashboard").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (
      ["delete-feedback", "remove-contact"].includes(button.dataset.action) &&
      !confirm(
        button.dataset.action === "delete-feedback"
          ? "Permanently delete this feedback message?"
          : "Remove this email from saved feedback fields and the updates list?",
      )
    )
      return;
    button.disabled = true;
    try {
      await api({
        action: button.dataset.action,
        id: button.dataset.id,
        hidden: button.dataset.hidden === "true",
      });
      await refresh();
    } catch (error) {
      $("inbox-status").textContent = error.message;
      button.disabled = false;
    }
  });
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("inbox-export").onclick = () =>
    download(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), ...data },
        null,
        2,
      ),
      "physics-inbox.json",
      "application/json",
    );
  $("inbox-export-contacts").onclick = () => {
    const cell = (value) =>
      `"${String(value)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      ["email", "name", "consent", "requested_at", "verified"],
      ...data.contacts.map((c) => [
        c.email,
        c.name,
        c.consent,
        new Date(c.time).toISOString(),
        "false",
      ]),
    ];
    download(
      rows.map((r) => r.map(cell).join(",")).join("\r\n"),
      "physics-update-requests.csv",
      "text/csv;charset=utf-8",
    );
  };
})();
