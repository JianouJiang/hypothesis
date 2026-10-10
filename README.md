# Polymarket Physics

A Polymarket-inspired science prediction playground. Browse upcoming experiments, customize your guest profile, and play the live five-minute Bitcoin market under **Maths & Statistics**. Every guest starts with **1,000 gold coins**. No signup or real money.

**Play:** [GitHub Pages](https://jianoujiang.github.io/polymarket_physics/) · [Shared live market](https://polymarket-physics.jianou-works.chatgpt.site)

## What works

- A Polymarket-style home page with featured experiments, subject navigation, search, topic/status filters, and a saved watchlist.
- Eight science categories: Fluid Dynamics, Solid Mechanics, Thermodynamics, Electromagnetism, Optics, Quantum Physics, Astrophysics, and Maths & Statistics. The 19 science experiments are **coming-soon previews**, with illustrative odds and proposed rules; Bitcoin is the playable market.
- A personal profile with an editable username, bio, and avatar; live positions, closed positions, activity, and a gold-denominated profit/loss chart.
- An animated BTC/USD chart, opening price to beat, and five-minute countdown.
- Buy **Up** or **Down** with gold, and sell shares before the round closes.
- A review window before every market or limit order. Nothing is spent until **Confirm**; canceling or dismissing leaves the wallet unchanged. Confirmations expire when their round ends. Market execution uses prices available when confirmed.
- Market orders, resting limit orders, partial fills, cancellation, and price improvement.
- A live order book with real guest-to-guest matching and labeled bot traders.
- Automatic settlement: the final simulated price at or above the opening price pays Up; otherwise Down. Winning shares pay **1 gold each**; losing shares pay zero. Unfilled orders expire and release reserved funds/shares.
- Guest wallets, open positions, transaction activity, settled results, and a practice-wallet reset.
- Responsive desktop/mobile layout, keyboard support, chart hover, search, and reduced-motion support.

## Run locally

Requires Node.js 18 or newer. The local app has **no dependencies and no build step**.

```sh
cd ~/Desktop/polymarket_physics
npm start
```

Open **http://127.0.0.1:3000**. Different browser profiles receive separate guest wallets and trade in the same market. Tabs in the same profile share a wallet. The server saves progress to `data/market.json`, which is excluded from Git. Keep this directory to retain wallets after a restart.

To play across your local network:

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

Open `http://<your-computer-LAN-IP>:3000` on another device.

You can also open **index.html directly** to browse the home page, **bitcoin.html** to play, or **profile.html** to edit your profile. Standalone mode stores the guest and market in your browser; it does not connect to other visitors. The interface identifies practice mode explicitly.

## Guest profiles

The profile uses the same guest account as the home page and live game. Usernames are unique within the market, 3–24 characters, with a 200-character bio and eight avatar choices. Edits are saved on the shared server (or in browser storage in standalone mode). No email, password, cryptocurrency wallet, or payment is requested.

Positions Value marks held shares at the current sell quotes. Total PnL is cash plus reserved gold plus marked positions, minus the initial 1,000 gold. The chart shows recorded portfolio observations and the current value, with time filters; it never invents historical results. Biggest Win is the largest recorded positive sell-fill or settlement profit. Markets Traded counts distinct five-minute rounds with fills. Volume counts the guest's actual fills, including fills of their resting orders.

The latest 500 activity events and 100 settled rounds are retained; chart observations are sampled once per minute and older observations are thinned as the archive grows. Detailed profile tracking begins with this update. Resetting the practice wallet resets trading statistics while keeping the username, avatar, and bio.

Guest access is remembered in this browser. Clearing browser storage, changing browser profiles, or switching between the GitHub Pages and hosted site addresses creates a separate guest identity; the two online sites still share the same live market. There is no account recovery or login yet.

## Online architecture

GitHub Pages serves the plain HTML, CSS, and JavaScript. `deployment.json` points the Pages app at the shared public server. The hosted app in `hosting/` runs the same market engine on a Cloudflare Worker with D1 storage through Sites. Both URLs connect to the same market.

The online server creates anonymous guest sessions and stores profiles, balances, orders, and settlement centrally. The game polls once per second; discovery and profiles poll every three seconds. A revision check commits the full market update atomically; a conflicting update is re-read and validated before committing, preventing concurrent trades from double-spending the same gold. Future price points and guest secrets are never returned to browsers.

Local Node hosting uses server-sent events instead of polling. When GitHub Pages cannot reach the shared server at startup, it clearly switches to an independent browser practice market. It never merges practice gold into the shared market.

## Early-market bot liquidity

An empty book is no fun, so the market starts with four behaviors:

| Bot | Behavior |
| --- | --- |
| **Atlas** market maker | Quotes both sides of Up and Down at six price levels. Prices follow estimated outcome probability, with a spread and an inventory adjustment. Sizes vary each second. Consumed depth is tracked and replenished on the next tick. |
| **Momentum** | Favors the direction of the last 12 seconds of visible price movement. |
| **Contrarian** | Prefers the other side of the recent movement. |
| **Noise** | Places small randomized orders to keep activity varied. |

The three trading bots submit market and limit orders through the **same matching engine as people**, roughly every three seconds. A guest order offering a better price is eligible for a bot fill. Orders use price/time priority, avoid self-trades, and reserve cash or shares when resting. All bot activity is labeled in the feed. Market-maker quotes are simulated liquidity, backed by virtual capital, rather than genuine external traders.

The underlying Bitcoin price moves independently of trading. The outcome probability reacts to its distance from the opening price and the time left in the round. Bots use only elapsed price observations, never the generated future path. This gives the market movement without allowing bots to choose the outcome.

For an early play-money launch, keep bot orders small and the spread close to two cents. As human activity grows, reduce bot size and frequency, and let human quotes occupy the top of the book. Before scaling, replace the single market snapshot with a dedicated serialized matching service, separate wallet/order tables, guest-session expiry, and abuse/rate controls. This version is a small shared simulation, not a production exchange.

## Development

```sh
npm test                 # Engine, settlement, matching, and HTTP checks
node scripts/sync-hosting.js
```

Optional browser checks (install Playwright separately and make it available with `NODE_PATH`): `node tests/browser.cjs` verifies trading, and `node tests/site-browser.cjs` verifies discovery, profiles, confirmations, offline mode, and mobile layouts. `PHYSICS_TEST_URL` selects a different preview server; `PHYSICS_SKIP_OFFLINE=1` skips file-mode checks.

`market.js` is the source of truth for the engine. The synchronization script copies the static app and converts that engine into an ES module for the hosted build. Do not edit `hosting/lib/engine.js` or the copied assets directly.

The hosted build uses the supplied Sites/Vinext starter and its lockfile. Hosting dependencies are separate from the zero-dependency local app. `hosting/db/schema.ts` defines the database, with generated migrations in `hosting/drizzle/`.

The GitHub Actions workflow tests the engine and uploads **only the public web assets** to Pages. It does not publish wallets, server data, or hosting configuration.

## Credits

Visual references: [Polymarket home](https://polymarket.com), [public profiles](https://polymarket.com/@ImJustKen), and [Bitcoin Up or Down](https://polymarket.com/event/btc-updown-5m-1790982300). Scientific concept illustrations and avatar artwork are original SVGs. This project is an independent simulation and is not affiliated with Polymarket. It uses its own simplified simulated-price settlement rule.
