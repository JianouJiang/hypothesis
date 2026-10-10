(function () {
  "use strict";
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
      } catch {
        /* A private browser may not retain the guest. */
      }
    },
  };
  const safe = (value) =>
    String(value ?? "").replace(
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
  const money = (n, digits = 2) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const colors = [
    ["#a6baff", "#556ce0"],
    ["#94dac3", "#3b9682"],
    ["#f1c582", "#c68d47"],
    ["#d5b8ee", "#9166ba"],
    ["#f0acb2", "#c66f86"],
    ["#92cee4", "#488eaf"],
    ["#b8c9ae", "#718667"],
    ["#b4bdd0", "#63748e"],
  ];
  function avatar(index = 0) {
    const [a, b] = colors[Number.isInteger(index) && colors[index] ? index : 0];
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" rx="40" fill="${a}"/><circle cx="64" cy="17" r="29" fill="${b}" opacity=".45"/><circle cx="24" cy="66" r="31" fill="${b}" opacity=".75"/><path d="M9 41C23 18 48 63 73 35" fill="none" stroke="#fff" stroke-opacity=".68" stroke-width="2"/><circle cx="40" cy="39" r="8" fill="#fff" fill-opacity=".9"/><ellipse cx="40" cy="39" rx="24" ry="12" fill="none" stroke="#fff" stroke-opacity=".7" transform="rotate(-48 40 39)"/></svg>`;
  }
  class Client {
    constructor(onUpdate, onStatus = () => {}) {
      this.onUpdate = onUpdate;
      this.onStatus = onStatus;
      this.mode = "connecting";
      this.base = "";
      this.token = storage.get("physics-server-guest");
      this.snapshot = null;
      this.polling = false;
      this.marketId = "bitcoin";
    }
    async api(path, body) {
      const headers = { "Content-Type": "application/json" };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const response = await fetch(
        `${this.base}/api/${path}?market=${encodeURIComponent(this.marketId)}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers,
          credentials: this.base ? "omit" : "same-origin",
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not reach your guest account.");
      if (data.token) {
        this.token = data.token;
        storage.set("physics-server-guest", data.token);
      }
      return data;
    }
    accept(data) {
      if (!data?.player) return;
      this.snapshot = data;
      publishSession({
        mode: this.mode,
        base: this.base,
        token: this.token,
        snapshot: data,
      });
      this.offset = data.now - Date.now();
      this.onUpdate(data, this.mode);
      this.onStatus(
        this.mode === "local"
          ? "Practice wallet · Saved in this browser"
          : "Connected · Shared live market",
      );
      document
        .querySelectorAll("[data-guest-name]")
        .forEach((el) => (el.textContent = data.player.name));
      document
        .querySelectorAll("[data-guest-avatar]")
        .forEach((el) => (el.innerHTML = avatar(data.player.avatar)));
    }
    async local(path, body) {
      if (this.marketId !== "bitcoin") {
        this.onStatus(
          "This experiment requires a live connection. Reconnect to play.",
        );
        return;
      }
      const work = () => {
        let state;
        try {
          state = JSON.parse(
            storage.get("polymarket-physics-market-v1") || "null",
          );
        } catch {
          /* Recover a malformed save. */
        }
        const engine = new PhysicsMarket.Market({
          state: state || this.memory,
        });
        engine.addPlayer(this.localId);
        if (path === "profile") engine.updateProfile(this.localId, body);
        const data = engine.snapshot(this.localId);
        this.memory = engine.state;
        storage.set(
          "polymarket-physics-market-v1",
          JSON.stringify(engine.state),
        );
        this.accept(data);
      };
      return navigator.locks
        ? navigator.locks.request("physics-local-market", work)
        : work();
    }
    async refresh() {
      if (this.polling) return;
      this.polling = true;
      try {
        if (this.mode === "local") await this.local();
        else {
          const data = await this.api("session");
          this.accept(data.snapshot || data);
        }
      } catch {
        this.onStatus("Connection lost · Trying to reconnect…");
      } finally {
        this.polling = false;
      }
    }
    async updateProfile(input) {
      if (this.mode === "local") return this.local("profile", input);
      const data = await this.api("profile", input);
      this.accept(data.snapshot);
    }
    async start() {
      if (location.protocol !== "file:") {
        try {
          if (location.hostname.endsWith(".github.io"))
            this.base =
              (await (await fetch("deployment.json")).json()).apiBase || "";
          if (location.hostname.endsWith(".github.io") && !this.base)
            throw new Error("Practice mode");
          const data = await this.api("session");
          this.mode = "server";
          this.accept(data.snapshot || data);
        } catch {
          if (!location.hostname.endsWith(".github.io")) {
            this.mode = "server";
            this.onStatus("Connection lost · Trying to reconnect…");
          } else this.mode = this.marketId !== "bitcoin" ? "server" : "local";
        }
      } else this.mode = "local";
      if (this.mode === "local") {
        this.localId =
          storage.get("physics-local-guest") ||
          `guest-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
        storage.set("physics-local-guest", this.localId);
        await this.local();
      }
      this.timer = setInterval(() => {
        if (!document.hidden) this.refresh();
      }, this.intervalMs || 3000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) this.refresh();
      });
      window.addEventListener("pagehide", () => clearInterval(this.timer));
      window.addEventListener("pageshow", (event) => {
        if (!event.persisted) return;
        this.refresh();
        clearInterval(this.timer);
        this.timer = setInterval(() => {
          if (!document.hidden) this.refresh();
        }, this.intervalMs || 3000);
      });
    }
  }
  function publishSession(session) {
    window.PhysicsSession = session;
    window.dispatchEvent(
      new CustomEvent("physics-session", { detail: session }),
    );
  }
  window.PhysicsGuest = {
    Client,
    storage,
    safe,
    money,
    avatar,
    publishSession,
  };
})();
