#!/usr/bin/env node
"use strict";
// Reads the official record for every live-stream market from this machine
// and hands the observation to the hosted market, which cannot reach usgs.gov
// from its own network. Run every few minutes from cron:
//   */5 * * * * cd ~/Desktop/hypothesis && node scripts/push-live-feed.js >> data/live-feed-push.log 2>&1
// Owner key: COMMUNITY_ADMIN_TOKEN or ../polymarket_physics_private/community-admin-token.
// Target: HYPOTHESIS_API_BASE (default https://hypothesis.jianou-works.chatgpt.site).
const fs = require("node:fs");
const path = require("node:path");
const Live = require("../livestreams");
const { fetchObservation } = require("../live-feeds");

const base = (
  process.env.HYPOTHESIS_API_BASE || "https://hypothesis.jianou-works.chatgpt.site"
).replace(/\/$/, "");
const tokenFile = path.join(
  __dirname,
  "../../polymarket_physics_private/community-admin-token",
);
const token =
  process.env.COMMUNITY_ADMIN_TOKEN ||
  (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : "");
const stamp = () => new Date().toISOString();

async function owner(body) {
  const response = await fetch(`${base}/api/live-admin`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

(async () => {
  if (!token) throw new Error("No owner key: set COMMUNITY_ADMIN_TOKEN.");
  const status = (await owner()).live;
  let failures = 0;
  for (const game of Live.ids) {
    const def = Live.definitions[game];
    const current = status.find((m) => m.game === game);
    const observation = await fetchObservation(def, {
      previousMeta: current?.feed?.meta || null,
    });
    const result = await owner({ action: "observe", game, observation });
    const after = result.live.find((m) => m.game === game);
    const feed = after?.feed || {};
    if (!observation.ok) failures++;
    console.log(
      `${stamp()} ${game}: ${observation.ok ? "ok" : "FAILED " + observation.error} · ${feed.events?.length ?? 0} events · ${after?.resolved ? "resolved " + after.resolution?.outcome : "open"} · deadline ${new Date(after?.deadline || 0).toISOString()} · streams ${JSON.stringify(feed.meta?.streams || null)}`,
    );
  }
  process.exit(failures ? 2 : 0);
})().catch((error) => {
  console.error(`${stamp()} push failed: ${error.message}`);
  process.exit(1);
});
