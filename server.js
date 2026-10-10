"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Market } = require("./market");

function createApp(options = {}) {
  const dataFile =
    options.dataFile || path.join(__dirname, "data", "market.json");
  let saved;
  if (options.persist !== false && fs.existsSync(dataFile))
    saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const market = options.market || new Market({ state: saved });
  const clients = new Map();
  const assets = {
    "/": ["index.html", "text/html"],
    "/index.html": ["index.html", "text/html"],
    "/styles.css": ["styles.css", "text/css"],
    "/app.js": ["app.js", "text/javascript"],
    "/market.js": ["market.js", "text/javascript"],
    "/favicon.svg": ["favicon.svg", "image/svg+xml"],
    "/deployment.json": ["deployment.json", "application/json"],
  };
  function save() {
    if (options.persist === false) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(market.state), {
      mode: 0o600,
    });
    fs.renameSync(`${dataFile}.tmp`, dataFile);
  }
  function broadcast() {
    for (const [res, id] of clients) {
      if (res.destroyed) {
        clients.delete(res);
        continue;
      }
      res.write(`data: ${JSON.stringify(market.snapshot(id))}\n\n`);
    }
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (url.pathname.startsWith("/api/")) {
        const token = req.headers.cookie
          ?.split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith("physics_guest="))
          ?.slice(14);
        let id =
          token &&
          /^[a-f0-9]{48}$/.test(token) &&
          Object.hasOwn(market.state.players, token)
            ? token
            : null;
        if (req.method === "GET" && url.pathname === "/api/session") {
          if (!id) {
            id = crypto.randomBytes(24).toString("hex");
            market.addPlayer(id);
            res.setHeader(
              "Set-Cookie",
              `physics_guest=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
            );
            save();
          }
          return json(200, market.snapshot(id));
        }
        if (!id)
          return json(401, {
            error: "Reconnect to restore your guest session.",
          });
        if (req.method === "GET" && url.pathname === "/api/events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.write(`data: ${JSON.stringify(market.snapshot(id))}\n\n`);
          clients.set(res, id);
          req.on("close", () => clients.delete(res));
          return;
        }
        if (req.method === "POST") {
          if (
            req.headers.origin &&
            req.headers.origin !== `http://${req.headers.host}` &&
            req.headers.origin !== `https://${req.headers.host}`
          )
            return json(403, {
              error: "Open the market on this server to trade.",
            });
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return json(415, { error: "Use JSON for trade requests." });
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 4096)
              return json(413, { error: "Request too large." });
          }
          const input = JSON.parse(body || "{}");
          let result;
          if (url.pathname === "/api/order") result = market.place(id, input);
          else if (url.pathname === "/api/cancel")
            market.cancel(id, input.orderId);
          else if (url.pathname === "/api/reset") market.reset(id);
          else return json(404, { error: "Not found." });
          save();
          json(200, { result, snapshot: market.snapshot(id) });
          broadcast();
          return;
        }
        return json(404, { error: "Not found." });
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        return res.end();
      }
      const asset = assets[url.pathname];
      if (!asset) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": `${asset[1]}; charset=utf-8` });
      res.end(
        req.method === "HEAD"
          ? undefined
          : fs.readFileSync(path.join(__dirname, asset[0])),
      );
    } catch (error) {
      if (!res.headersSent)
        json(400, {
          error: error.message || "The request could not be completed.",
        });
      else res.end();
    }
  });
  const tick = setInterval(() => {
    market.advance();
    broadcast();
  }, 1000);
  const persist = setInterval(save, 5000);
  server.on("close", () => {
    clearInterval(tick);
    clearInterval(persist);
    save();
  });
  return {
    server,
    market,
    save,
    stop: () => {
      for (const res of clients.keys()) res.end();
      server.close();
    },
  };
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  app.server.listen(port, host, () =>
    console.log(
      `Polymarket Physics is ready at http://${host}:${port}\nSimulated Bitcoin · 5-minute rounds · 1,000 free gold coins\nPress Ctrl+C to stop. Progress is saved in data/market.json.`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      app.save();
      app.stop();
    });
}
module.exports = { createApp };
