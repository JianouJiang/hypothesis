import { env } from "cloudflare:workers";
import { Exchange } from "../../../lib/exchange.js";
import { communityApi } from "../../../lib/community-api";
import { adminAuthorized } from "../../../lib/community.js";
import Live from "../../../lib/livestreams.js";
import { fetchObservation } from "../../../lib/live-feeds.js";

// Official-record observations are shared across requests for a minute so a
// burst of traffic cannot hammer the USGS feed; the engine stores the result.
const feedCache = new Map<string, { at: number; observation: any }>();
async function observeDue(market: any) {
  let changed = false;
  for (const game of market.liveFeedsDue()) {
    const cached = feedCache.get(game);
    let observation = cached && Date.now() - cached.at < 60000 ? cached.observation : null;
    if (!observation) {
      observation = await fetchObservation((Live.definitions as Record<string, any>)[game], {
        previousMeta: market.liveFeedMeta(game),
        maxNotices: 4,
      });
      feedCache.set(game, { at: Date.now(), observation });
    }
    market.observeLive(game, observation);
    changed = true;
  }
  return changed;
}

let flowCache: any = null;
async function loadFlow() {
  if (flowCache) return flowCache;
  const object = await env.BUCKET?.get("cfd/active-bank.json");
  if (object) flowCache = await object.json();
  return flowCache;
}

async function ingest(
  request: Request,
  json: (status: number, value: unknown) => Response,
) {
  if (
    !env.CFD_INGEST_TOKEN ||
    request.headers.get("Authorization") !== `Bearer ${env.CFD_INGEST_TOKEN}`
  )
    return json(403, { error: "Forbidden." });
  if (!env.BUCKET) return json(503, { error: "Dataset storage is not ready." });
  if (await env.BUCKET.head("cfd/active-bank.json"))
    return json(409, {
      error:
        "The active dataset is immutable. Use a new dataset version for updates.",
    });
  const text = await request.text();
  if (text.length > 24000000) return json(413, { error: "Dataset too large." });
  const data = JSON.parse(text);
  if (
    data.version !== 1 ||
    !data.metadata?.id ||
    !Array.isArray(data.traces) ||
    data.traces.length < 2 ||
    data.traces.length > 2000 ||
    !Array.isArray(data.frames) ||
    !data.frames.length ||
    data.frames.length > 1000
  )
    return json(400, { error: "Invalid CFD dataset." });
  const finite = (v: any) => typeof v === "number" && Number.isFinite(v);
  if (
    !data.traces.every(
      (t: any) =>
        Number.isInteger(t.durationMs) &&
        t.durationMs >= 75000 &&
        t.durationMs <= 180000 &&
        t.points?.length === 121 &&
        t.times?.length === 121 &&
        t.points.every((p: any) => p.length === 2 && p.every(finite)) &&
        t.times.every(finite),
    )
  )
    return json(400, { error: "Invalid trajectories." });
  const size = data.grid?.nx * data.grid?.ny * 2;
  if (
    !Number.isInteger(size) ||
    size < 8 ||
    size > 40000 ||
    !data.frames.every(
      (f: any) =>
        finite(f.time) &&
        f.velocity?.length === size &&
        f.velocity.every(finite),
    )
  )
    return json(400, { error: "Invalid velocity fields." });
  await env.BUCKET.put("cfd/active-bank.json", text, {
    httpMetadata: { contentType: "application/json" },
  });
  flowCache = data;
  return json(201, {
    dataset: data.metadata.id,
    trajectories: data.traces.length,
    frames: data.frames.length,
  });
}

const allowedOrigins = new Set([
  "https://jianoujiang.github.io",
  "https://hypothesis.jianou-works.chatgpt.site",
]);

function headers(request: Request) {
  const origin = request.headers.get("Origin");
  const result: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    origin &&
    (allowedOrigins.has(origin) ||
      origin === new URL(request.url).origin ||
      /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  )
    result["Access-Control-Allow-Origin"] = origin;
  return result;
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...headers(request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "3600",
    },
  });
}

async function handle(request: Request) {
  const responseHeaders = headers(request);
  const json = (status: number, value: unknown) =>
    new Response(JSON.stringify(value), { status, headers: responseHeaders });
  if (
    request.headers.has("Origin") &&
    !responseHeaders["Access-Control-Allow-Origin"]
  )
    return json(403, {
      error: "This market is not available from that origin.",
    });
  const route = new URL(request.url).pathname.split("/").pop();
  if (route === "community" || route === "community-admin")
    return communityApi(request, route === "community-admin", json);
  if (route === "cfd-ingest" && request.method === "POST") {
    try {
      return await ingest(request, json);
    } catch {
      return json(400, { error: "Could not store the CFD dataset." });
    }
  }
  const owner = route === "live-admin";
  if (owner && !["GET", "POST"].includes(request.method))
    return json(405, { error: "Method not allowed." });
  if (
    owner &&
    !adminAuthorized(
      request.headers.get("Authorization"),
      env.COMMUNITY_ADMIN_TOKEN,
    )
  )
    return json(403, { error: "Invalid owner key." });
  if (request.method === "GET" && route !== "session" && !owner)
    return json(404, { error: "Not found." });
  if (
    request.method === "POST" &&
    !owner &&
    !["order", "cancel", "reset", "profile", "competition"].includes(
      route || "",
    )
  )
    return json(404, { error: "Not found." });
  if (!env.DB)
    return json(503, {
      error: "The shared market is initializing. Please try again.",
    });
  const database = env.DB;
  let token = owner
    ? ""
    : request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (token && !/^[a-f0-9]{48}$/.test(token)) token = "";
  let input: any = {};
  try {
    const marketId =
      new URL(request.url).searchParams.get("market") || "bitcoin";
    const flowData = await loadFlow();
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        return json(415, { error: "Expected a JSON trade request." });
      const body = await request.text();
      if (body.length > 4096) return json(413, { error: "Request too large." });
      input = JSON.parse(body);
      if (!token && !owner)
        return json(401, { error: "Reconnect to restore your guest wallet." });
    }
    // The seed never leaves the server. Rebuilding a state snapshot advances the
    // simulation to wall-clock time, including after an idle period or restart.
    for (let attempt = 0; attempt < 10; attempt++) {
      let row = await database
        .prepare("SELECT revision, state FROM markets WHERE id = ?")
        .bind("bitcoin")
        .first<{ revision: number; state: string }>();
      if (!row) {
        const initial = new Exchange({ flowData });
        await database
          .prepare(
            "INSERT OR IGNORE INTO markets (id, revision, state, updated) VALUES (?, 0, ?, ?)",
          )
          .bind("bitcoin", JSON.stringify(initial.state), Date.now())
          .run();
        row = await database
          .prepare("SELECT revision, state FROM markets WHERE id = ?")
          .bind("bitcoin")
          .first<{ revision: number; state: string }>();
        if (!row) throw new Error("Market is initializing. Try again.");
      }
      const previousState = JSON.parse(row.state);
      const signature = (state: any) =>
        JSON.stringify(
          Object.values(state.markets || { bitcoin: state }).map((m: any) => [
            m?.round?.id,
            m?.round?.lastTick,
          ]),
        );
      const previousTick = signature(previousState);
      const market = new Exchange({ state: previousState, flowData });
      const observed = await observeDue(market);
      if (owner) {
        // The owner reads live-market status or resolves a window by hand
        // from the published record. No guest wallet is involved.
        let result;
        if (request.method === "POST")
          result = market.resolveLive(input.game, input);
        const live = market.liveStatus();
        if (request.method === "POST" || observed) {
          const update = await database
            .prepare(
              "UPDATE markets SET state = ?, revision = revision + 1, updated = ? WHERE id = ? AND revision = ?",
            )
            .bind(JSON.stringify(market.state), Date.now(), "bitcoin", row.revision)
            .run();
          if (update.meta.changes !== 1) continue;
        }
        return json(200, { result, live });
      }
      market.select(marketId);
      let created = false;
      if (!token || !Object.hasOwn(market.players, token)) {
        if (request.method === "POST")
          return json(401, {
            error: "Guest session expired. Refresh to reconnect.",
          });
        if (!token)
          token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
        market.addPlayer(token);
        created = true;
      }
      let result;
      if (request.method === "POST") {
        if (route === "order") result = market.place(token, input, marketId);
        if (route === "cancel") market.cancel(token, input.orderId, marketId);
        if (route === "reset") market.reset(token);
        if (route === "profile") market.updateProfile(token, input);
        if (route === "competition") market.updateCompetition(token, input);
      }
      const snapshot = market.snapshot(token, marketId);
      const changed =
        created ||
        observed ||
        request.method === "POST" ||
        previousTick !== signature(market.state) ||
        previousState.version !== 2;
      if (changed) {
        const update = await database
          .prepare(
            "UPDATE markets SET state = ?, revision = revision + 1, updated = ? WHERE id = ? AND revision = ?",
          )
          .bind(
            JSON.stringify(market.state),
            Date.now(),
            "bitcoin",
            row.revision,
          )
          .run();
        // An overlapping trade won the race. Re-read and validate against its
        // committed balance/book. No side effects escape a losing transaction.
        if (update.meta.changes !== 1) continue;
      }
      return json(200, { token, transport: "poll", result, snapshot });
    }
    return json(409, {
      error: "The market is busy. Please try your order again.",
    });
  } catch (error) {
    return json(400, {
      error:
        error instanceof Error
          ? error.message
          : "The request could not be completed.",
    });
  }
}

export const GET = handle;
export const POST = handle;
