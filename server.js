"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Market } = require("./market");
const { Exchange } = require("./exchange");
const { Community, adminAuthorized } = require("./community");
const Live = require("./livestreams");
const { fetchObservation } = require("./live-feeds");

function createApp(options = {}) {
  const dataFile =
    options.dataFile || path.join(__dirname, "data", "market.json");
  let saved;
  if (options.persist !== false && fs.existsSync(dataFile))
    saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const flowFile =
    process.env.PHYSICS_CFD_DATA ||
    path.join(__dirname, "../polymarket_physics_private/flow-bank.json");
  const flowData =
    options.flowData ||
    (fs.existsSync(flowFile)
      ? JSON.parse(fs.readFileSync(flowFile, "utf8"))
      : undefined);
  const market = options.market || new Exchange({ state: saved, flowData });
  const communityFile =
    options.communityFile ||
    path.join(path.dirname(dataFile), "community.json");
  let communityState =
    options.persist !== false && fs.existsSync(communityFile)
      ? JSON.parse(fs.readFileSync(communityFile, "utf8"))
      : undefined;
  const adminFile = path.join(
    __dirname,
    "../polymarket_physics_private/community-admin-token",
  );
  const adminToken =
    options.adminToken ||
    process.env.COMMUNITY_ADMIN_TOKEN ||
    (fs.existsSync(adminFile) ? fs.readFileSync(adminFile, "utf8").trim() : "");
  const clients = new Map();
  const assets = {
    "/": ["index.html", "text/html"],
    "/index.html": ["index.html", "text/html"],
    "/bitcoin.html": ["bitcoin.html", "text/html"],
    "/aerofoil.html": ["aerofoil.html", "text/html"],
    "/aerofoil.js": ["aerofoil.js", "text/javascript"],
    "/flow-renderer.js": ["flow-renderer.js", "text/javascript"],
    "/aerofoil.css": ["aerofoil.css", "text/css"],
    "/galton.html": ["galton.html", "text/html"],
    "/experiment.html": ["experiment.html", "text/html"],
    "/experiment.js": ["experiment.js", "text/javascript"],
    "/experiments.js": ["experiments.js", "text/javascript"],
    "/lab-renderer.js": ["lab-renderer.js", "text/javascript"],
    "/experiment.css": ["experiment.css", "text/css"],
    "/escape.html": ["escape.html", "text/html"],
    "/live.html": ["live.html", "text/html"],
    "/live.js": ["live.js", "text/javascript"],
    "/live.css": ["live.css", "text/css"],
    "/livestreams.js": ["livestreams.js", "text/javascript"],
    "/collision.js": ["collision.js", "text/javascript"],
    "/collision.css": ["collision.css", "text/css"],
    "/competitions.html": ["competitions.html", "text/html"],
    "/competitions.js": ["competitions.js", "text/javascript"],
    "/competitions.css": ["competitions.css", "text/css"],
    "/profile.html": ["profile.html", "text/html"],
    "/home.css": ["home.css", "text/css"],
    "/home.js": ["home.js", "text/javascript"],
    "/profile.css": ["profile.css", "text/css"],
    "/profile.js": ["profile.js", "text/javascript"],
    "/guest.js": ["guest.js", "text/javascript"],
    "/catalog.js": ["catalog.js", "text/javascript"],
    "/styles.css": ["styles.css", "text/css"],
    "/app.js": ["app.js", "text/javascript"],
    "/market.js": ["market.js", "text/javascript"],
    "/favicon.svg": ["favicon.svg", "image/svg+xml"],
    "/community-ui.js": ["community-ui.js", "text/javascript"],
    "/community.css": ["community.css", "text/css"],
    "/inbox.html": ["inbox.html", "text/html"],
    "/inbox.js": ["inbox.js", "text/javascript"],
  };
  for (const file of [
    "naca0012.dat",
    "naca0012-tilted.csv",
    "naca0012.stl",
    "parameters.json",
    "provenance.json",
    "README.txt",
    "galton.json",
    "escape.json",
  ])
    assets[`/geometry/${file}`] = [
      `geometry/${file}`,
      file.endsWith("json") ? "application/json" : "text/plain",
    ];
  function save() {
    if (options.persist === false) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(market.state), {
      mode: 0o600,
    });
    fs.renameSync(`${dataFile}.tmp`, dataFile);
  }
  function broadcast() {
    for (const [res, { id, marketId }] of clients) {
      if (res.destroyed) {
        clients.delete(res);
        continue;
      }
      res.write(`data: ${JSON.stringify(market.snapshot(id, marketId))}\n\n`);
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
        const marketId = url.searchParams.get("market") || "bitcoin";
        const token = req.headers.cookie
          ?.split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith("physics_guest="))
          ?.slice(14);
        let id =
          token &&
          /^[a-f0-9]{48}$/.test(token) &&
          Object.hasOwn(market.players || market.state.players, token)
            ? token
            : null;
        if (url.pathname === "/api/live-admin") {
          if (!adminAuthorized(req.headers.authorization, adminToken))
            return json(403, { error: "Invalid owner key." });
          if (!(market instanceof Exchange))
            return json(404, { error: "Not found." });
          if (req.method === "GET") return json(200, { live: market.liveStatus() });
          if (req.method !== "POST")
            return json(405, { error: "Method not allowed." });
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return json(415, { error: "Expected JSON." });
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 262144)
              return json(413, { error: "Request too large." });
          }
          const input = JSON.parse(body || "{}");
          // "observe" lets a trusted poller that can reach the official
          // record hand observations to a server that cannot.
          const result =
            input.action === "observe"
              ? (market.observeLive(input.game, input.observation), { ok: true })
              : market.resolveLive(input.game, input);
          save();
          json(200, { result, live: market.liveStatus() });
          broadcast();
          return;
        }
        if (["/api/community", "/api/community-admin"].includes(url.pathname)) {
          const admin = url.pathname === "/api/community-admin";
          if (
            admin
              ? !adminAuthorized(req.headers.authorization, adminToken)
              : !id
          )
            return json(admin ? 403 : 401, {
              error: admin
                ? "Invalid owner key."
                : "Reconnect to your guest account.",
            });
          if (
            req.headers.origin &&
            ![
              `http://${req.headers.host}`,
              `https://${req.headers.host}`,
            ].includes(req.headers.origin)
          )
            return json(403, { error: "Open this site to send feedback." });
          if (!["GET", "POST"].includes(req.method))
            return json(405, { error: "Method not allowed." });
          let input;
          if (req.method === "POST") {
            if (!req.headers["content-type"]?.startsWith("application/json"))
              return json(415, { error: "Expected JSON." });
            let body = "";
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 16000)
                return json(413, { error: "Request too large." });
            }
            input = JSON.parse(body || "{}");
          }
          const community = new Community(
            communityState
              ? JSON.parse(JSON.stringify(communityState))
              : undefined,
            market.state,
          );
          if (req.method === "GET")
            return json(
              200,
              admin
                ? community.adminFeed()
                : community.feed(id, Object.fromEntries(url.searchParams)),
            );
          const result = admin
            ? community.adminMutate(input)
            : community.mutate(id, input);
          const serialized = community.serialize();
          if (options.persist !== false) {
            fs.mkdirSync(path.dirname(communityFile), { recursive: true });
            fs.writeFileSync(`${communityFile}.tmp`, serialized, {
              mode: 0o600,
            });
            fs.renameSync(`${communityFile}.tmp`, communityFile);
          }
          communityState = community.state;
          return json(200, result);
        }
        if (market.select) market.select(marketId);
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
          return json(200, market.snapshot(id, marketId));
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
          res.write(
            `data: ${JSON.stringify(market.snapshot(id, marketId))}\n\n`,
          );
          clients.set(res, { id, marketId });
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
          if (url.pathname === "/api/order")
            result =
              market instanceof Exchange
                ? market.place(id, input, marketId)
                : market.place(id, input);
          else if (url.pathname === "/api/cancel")
            market.cancel(
              id,
              input.orderId,
              market instanceof Exchange ? marketId : true,
            );
          else if (url.pathname === "/api/reset") market.reset(id);
          else if (url.pathname === "/api/profile")
            market.updateProfile(id, input);
          else if (
            url.pathname === "/api/competition" &&
            market instanceof Exchange
          )
            market.updateCompetition(id, input);
          else return json(404, { error: "Not found." });
          save();
          json(200, { result, snapshot: market.snapshot(id, marketId) });
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
  // Live-stream markets: poll the official record and hand observations to
  // the engine. Network failures are recorded, never thrown into trading.
  const readFeed = options.fetchObservation || fetchObservation;
  let polling = false;
  async function pollFeeds() {
    if (polling || !(market instanceof Exchange)) return;
    polling = true;
    try {
      for (const game of market.liveFeedsDue()) {
        const observation = await readFeed(Live.definitions[game], {
          previousMeta: market.liveFeedMeta(game),
        });
        market.observeLive(game, observation);
        save();
        broadcast();
      }
    } catch (error) {
      console.error("Live feed check failed:", error.message);
    } finally {
      polling = false;
    }
  }
  const feeds =
    options.liveFeeds === false ? null : setInterval(pollFeeds, 30000);
  if (feeds) pollFeeds();
  server.on("close", () => {
    clearInterval(tick);
    clearInterval(persist);
    if (feeds) clearInterval(feeds);
    save();
  });
  return {
    server,
    market,
    save,
    pollFeeds,
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
      `Hypothesis is ready at http://${host}:${port}\nScience prediction markets · 1,000 free gold coins\nPress Ctrl+C to stop. Progress is saved in data/market.json.`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      app.save();
      app.stop();
    });
}
module.exports = { createApp };
