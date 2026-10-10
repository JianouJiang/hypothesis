import { env } from "cloudflare:workers";
import { Community, adminAuthorized } from "./community.js";

export async function communityApi(
  request: Request,
  admin: boolean,
  json: (status: number, value: unknown) => Response,
) {
  if (!env.DB)
    return json(503, {
      error: "Community storage is starting. Try again shortly.",
    });
  if (
    admin &&
    !adminAuthorized(
      request.headers.get("Authorization"),
      env.COMMUNITY_ADMIN_TOKEN,
    )
  )
    return json(403, { error: "Invalid owner key." });
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  try {
    const marketRow = await env.DB.prepare(
      "SELECT state FROM markets WHERE id = ?",
    )
      .bind("bitcoin")
      .first<{ state: string }>();
    const market = marketRow
      ? JSON.parse(marketRow.state)
      : { accounts: {}, markets: {} };
    if (
      !admin &&
      (!/^[a-f0-9]{48}$/.test(token) ||
        !Object.hasOwn(market.accounts || market.players || {}, token))
    )
      return json(401, { error: "Reconnect to your guest account." });
    let input: any;
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        return json(415, { error: "Expected JSON." });
      const body = await request.text();
      if (body.length > 16000)
        return json(413, { error: "Request too large." });
      input = JSON.parse(body);
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await env.DB.prepare(
        "SELECT state, revision FROM markets WHERE id = ?",
      )
        .bind("community")
        .first<{ state: string; revision: number }>();
      const community = new Community(
        row ? JSON.parse(row.state) : undefined,
        market,
      );
      if (request.method === "GET")
        return json(
          200,
          admin
            ? community.adminFeed()
            : community.feed(
                token,
                Object.fromEntries(new URL(request.url).searchParams),
              ),
        );
      const result = admin
        ? community.adminMutate(input)
        : community.mutate(token, input);
      const serialized = community.serialize();
      const update = row
        ? await env.DB.prepare(
            "UPDATE markets SET state = ?, revision = revision + 1, updated = ? WHERE id = ? AND revision = ?",
          )
            .bind(serialized, Date.now(), "community", row.revision)
            .run()
        : await env.DB.prepare(
            "INSERT OR IGNORE INTO markets (id, revision, state, updated) VALUES (?, 0, ?, ?)",
          )
            .bind("community", serialized, Date.now())
            .run();
      if (update.meta.changes === 1) return json(200, result);
    }
    return json(409, { error: "The community is busy. Please try again." });
  } catch (error) {
    return json(400, {
      error:
        error instanceof Error
          ? error.message
          : "Could not save your response.",
    });
  }
}
