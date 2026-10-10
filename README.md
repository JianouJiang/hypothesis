# Polymarket Physics

A Polymarket-inspired **science prediction platform**. Predict aerofoil dust, Galton-board landings, ring escapes, and mathematical simulations. Explore more science experiments and seasonal in-person competitions. Every guest starts with **1,000 gold coins**, shared across all live markets. No signup or real money.

**Play:** [GitHub Pages](https://jianoujiang.github.io/polymarket_physics/) · [Shared live market](https://polymarket-physics.jianou-works.chatgpt.site)

## What works

- A Polymarket-style home page with featured experiments, subject navigation, search, topic/status filters, and a saved watchlist.
- Eight science categories: Fluid Dynamics, Solid Mechanics, Thermodynamics, Electromagnetism, Optics, Quantum Physics, Astrophysics, and Maths & Statistics. **Aerofoil dust** is live in Fluid Dynamics; **Bitcoin Up or Down** remains live in Maths & Statistics. **Galton board** and **ring escape** are live in Solid Mechanics. The other 17 experiments are coming-soon previews.
- An aerofoil game with rounds around two minutes using genuine, precomputed OpenFOAM velocity fields and passive-tracer trajectories. Thousands of advected dust tracers and adjustable photographic trails reveal the flow. A dashed horizontal line marks the previous exit; a solid gold line and height chart show the current particle. Download the NACA 0012 geometry and public physical parameters.
- A personal profile with an editable username, bio, and avatar; live positions, closed positions, activity, and a gold-denominated profit/loss chart.
- An animated BTC/USD chart, opening price to beat, and five-minute countdown.
- Buy **Above / Below** for the dust particle or **Up / Down** for Bitcoin, and sell shares before the round closes.
- A review window before every market or limit order. Nothing is spent until **Confirm**; canceling or dismissing leaves the wallet unchanged. Confirmations expire when their round ends. Market execution uses prices available when confirmed.
- Market orders, resting limit orders, partial fills, cancellation, and price improvement.
- A live order book with real guest-to-guest matching and labeled bot traders.
- Automatic settlement: the final simulated price at or above the opening price pays Up; otherwise Down. Winning shares pay **1 gold each**; losing shares pay zero. Unfilled orders expire and release reserved funds/shares.
- Guest wallets, open positions, transaction activity, settled results, and a practice-wallet reset.
- Responsive desktop/mobile layout, keyboard support, chart hover, and search.

## Run locally

Requires Node.js 18 or newer. The local app needs **no npm install and no build step**. A pinned MIT-licensed Planck.js 1.5.0 build is included in `vendor/` for the collision games.

```sh
cd ~/Desktop/polymarket_physics
npm start
```

Open **http://127.0.0.1:3000**. Different browser profiles receive separate guest wallets and trade in the same market. Tabs in the same profile share a wallet. The server saves progress to `data/market.json`, which is excluded from Git. Keep this directory to retain wallets after a restart.

The public repository includes the games, matching engine, geometry, and physical conditions. The private CFD replay library is intentionally excluded. The owner's local server reads `../polymarket_physics_private/flow-bank.json`, or a file selected with `PHYSICS_CFD_DATA=/absolute/path/flow-bank.json`. Without it, Bitcoin, Galton board, ring escape, and browsing still work; aerofoil trading reports unavailable rather than inventing flow. Existing aerofoil positions require their original dataset to resume safely. Use the hosted game to play without running CFD yourself.

To play across your local network:

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

Open `http://<your-computer-LAN-IP>:3000` on another device.

You can also open **index.html directly** to browse the home page, **bitcoin.html** to play, or **profile.html** to edit your profile. Standalone mode stores the guest and market in your browser; it does not connect to other visitors. The interface identifies practice mode explicitly.

## Aerofoil experiment

**[Play the aerofoil market](https://polymarket-physics.jianou-works.chatgpt.site/aerofoil.html)** · **[Geometry and physical conditions](geometry/)**

The geometry is NASA's sharp-trailing-edge version of the well-studied **NACA 0012**, at **20° angle of attack**. A 0.10 m chord, 0.15 m/s inlet velocity, and 1.5 × 10⁻⁵ m²/s kinematic viscosity give a chord Reynolds number of **1,000**. The two-dimensional domain spans x/c = −3…6 and y/c = −3…3. The particle starts at (−3, 0) and is advected through the unsteady separated flow. It is an ideal small-dust tracer: inertia, gravity, and feedback on the fluid are neglected.

A consistent playback speed puts typical transits **around two minutes**. Rounds finish on arrival at the outlet, so wake recirculation can make them longer. The page shows elapsed time rather than revealing the future arrival time, and also displays physical simulation time. **Above** wins if the right-boundary exit y is at or above the previous round's exit y; otherwise **Below** wins. The first target comes from another completed CFD trajectory. Exact equality pays Above. Winning shares pay 1 gold, and open orders expire at settlement. All connected guests see the same round.

The downloadable DAT contains the normalized profile, the CSV its tilted coordinates, and the closed STL a convenient extrusion; multiply chord-unit coordinates by 0.10 to obtain metres. `parameters.json` specifies inlet conditions, fluid properties, domain, boundaries, particle assumptions, and the pitch convention. The numerical solver configuration, mesh, initial wake state, and full replay bank remain private. The browser receives only elapsed particle positions and the currently observed velocity field. Background dust particles advect through the currently observed field with bilinear velocity interpolation and a midpoint step. A transparent trail buffer gives short/long exposure; only the highlighted dust particle determines the result. Rounds use preselected, completed transits with varied wake phases. The finite precomputed library repeats, so this is an educational prototype rather than an unlimited source of new CFD realizations.

NACA 0012 is a validation geometry, but **that does not validate this particular simulation**. This exploratory, low-Reynolds-number 2D model is not a validated prediction of real 3D stall. NASA's reference case uses different conditions, and published Re = 1,000 research reports three-dimensional wake transitions at high incidence. See the [NASA geometry reference](https://tmbwg.github.io/turbmodels/naca0012_val.html) and [wake-transition study](https://journals.sagepub.com/doi/10.1177/17568293211055656).

## Galton board, ring escape, and round timing

All live rounds last **1–5 minutes**. Bitcoin stays at five minutes; the CFD aerofoil keeps its arrival-based 106–168 second transits. The new collision games use [Planck.js 1.5.0](https://github.com/piqnt/planck.js), a Box2D-based rigid-body engine, with a fixed 120 Hz physics step and continuous collision detection. OpenFOAM remains responsible for fluid flow; it is not used for peg impacts.

**[Galton board](https://polymarket-physics.jianou-works.chatgpt.site/galton.html):** one ball falls through eleven rows into seven slots. Each slot has its own **Yes and No** contracts, order book, limit orders, and positions. First solver-reported contact with the floor settles the containing slot Yes and all six other slots No. Every winning share pays 1 gold. New release conditions generate trajectories; no slot is chosen in advance. Playback normally maps one physical second to 20 wall seconds; short falls slow down further to give at least 75 seconds of transit. A 10-second release countdown and 3.5-second result display keep rounds between about 1:29 and 4:14. Failure to land within 12 physical seconds voids the round, returns held positions’ cost basis, and releases open orders. [Download parameters](geometry/galton.json).

**[Ring escape](https://polymarket-physics.jianou-works.chatgpt.site/escape.html):** a one-minute prediction window precedes a 60-second physical challenge. Three kinematic rings with gaps rotate around one ball. Yes settles as soon as the entire ball clears the outer ring plus the published 0.04 m detection tolerance; No settles at the deadline. The next round follows after a 3.5-second result display, giving roughly 1–2 minute rounds. Ring motors can transfer energy during impacts. [Download parameters](geometry/escape.json).

**The collisions make the music.** There is no background recording or looping track. Measured contact impulses trigger original synthesized pentatonic notes: struck ring/peg row affects pitch, impulse affects loudness, and horizontal position affects stereo pan. Harmonics decay after each hit. Click **Play collision music** to satisfy browser audio activation, and use **Mute collision music** at any time. Hidden tabs suspend audio; rejoining never plays a backlog of missed impacts.

Both games compute authoritative trajectories on the server and send only elapsed positions and impacts. A short rendering buffer smooths the 1-second network updates. Guests share the same ball, clock, book, and wallet. Their trades do not alter physics. The Galton probability vector is normalized from visible ball position; escape quotes use current radius and remaining time. These are liquidity heuristics, not calibrated scientific forecasts. Seeds and unobserved outcomes stay on the server. Contracts in one request share a clock sample so all seven slots cross a round boundary together.

## Seasonal in-person competitions

The **[competition page](https://polymarket-physics.jianou-works.chatgpt.site/competitions.html)** is linked from the main navigation, discovery page, and ball games. It proposes public practice, simultaneous release of new geometry/conditions at the venue, calibration, a model freeze, and scored held-out trials. Separate forecasting and trading leaderboards would expose model robustness across unseen cases rather than performance on a memorized trajectory.

Dates, venue, entry arrangements, prizes, final scoring and compute budgets are **to be announced**. The page does not claim a scheduled event or fabricate a leaderboard. **Save my interest** persists a reversible preference in the guest profile; it is not an event registration and does not send notifications. Running the competition itself with new solver datasets is a future event setup task.

## Guest profiles

The profile uses the same guest account as the home page and all four live experiments. Usernames are unique within the market, 3–24 characters, with a 200-character bio and eight avatar choices. Edits are saved on the shared server (or in browser storage in standalone mode). No email, password, cryptocurrency wallet, or payment is requested.

Positions Value marks held shares at the current sell quotes. Total PnL is cash plus reserved gold plus marked positions, minus the initial 1,000 gold. The chart shows recorded portfolio observations and the current value, with time filters; it never invents historical results. Biggest Win is the largest recorded positive sell-fill or settlement profit. Markets Traded counts distinct market rounds with fills. Volume counts the guest's actual fills, including fills of their resting orders.

The latest 500 activity events and 100 settled rounds per market are retained; chart observations are sampled once per minute and older observations are thinned as the archive grows. Detailed profile tracking begins with this update. Resetting the practice wallet resets trading statistics while keeping the username, avatar, and bio.

Guest access is remembered in this browser. Clearing browser storage, changing browser profiles, or switching between the GitHub Pages and hosted site addresses creates a separate guest identity; the two online sites still share the same live market. There is no account recovery or login yet.

## Online architecture

GitHub Pages serves the plain HTML, CSS, and JavaScript. `deployment.json` points the Pages app at the shared public server. The hosted app in `hosting/` runs the same market engine on a Cloudflare Worker with D1 wallet storage and a private R2 CFD replay library through Sites. Both URLs connect to the same market.

The online server creates anonymous guest sessions and stores profiles, balances, orders, and settlement centrally. The live games poll once per second; discovery and profiles poll every three seconds. A revision check commits the full market update atomically; a conflicting update is re-read and validated before committing, preventing concurrent trades from double-spending the same gold. Future price points and guest secrets are never returned to browsers.

Local Node hosting provides server-sent events for Bitcoin and polling for the other pages. When GitHub Pages cannot reach the shared server at startup, Bitcoin and profile pages clearly switch to an independent browser practice market. Aerofoil trading requires a live connection and never falls back to synthetic CFD. It never merges practice gold into the shared market.

## Early-market bot liquidity

An empty book is no fun, so the market starts with four behaviors:

| Bot | Behavior |
| --- | --- |
| **Atlas** market maker | Quotes both outcomes in each market at six price levels. Prices follow estimated outcome probability, with a spread and an inventory adjustment. Sizes vary each second. Consumed depth is tracked and replenished on the next tick. |
| **Momentum** | Favors the direction of the last 12 seconds of visible price movement. |
| **Contrarian** | Prefers the other side of the recent movement. |
| **Noise** | Places small randomized orders to keep activity varied. |

The three trading bots submit market and limit orders through the **same matching engine as people**, roughly every three seconds. A guest order offering a better price is eligible for a bot fill. Orders use price/time priority, avoid self-trades, and reserve cash or shares when resting. All bot activity is labeled in the feed. Market-maker quotes are simulated liquidity, backed by virtual capital, rather than genuine external traders.

The underlying Bitcoin price moves independently of trading. The outcome probability reacts to its distance from the opening price and the time left in the round. Aerofoil quotes use current particle height, previous exit height, and remaining distance; they are a heuristic rather than a calibrated scientific probability. Bots use only elapsed observations, never the future path. This gives the market movement without allowing bots to choose the outcome.

For an early play-money launch, keep bot orders small and the spread close to two cents. As human activity grows, reduce bot size and frequency, and let human quotes occupy the top of the book. Before scaling, replace the single market snapshot with a dedicated serialized matching service, separate wallet/order tables, guest-session expiry, and abuse/rate controls. This version is a small shared simulation, not a production exchange.

## Development

```sh
npm test                 # Engine, settlement, matching, and HTTP checks
node scripts/sync-hosting.js
```

The private replay bank is uploaded once to the R2-backed `/api/cfd-ingest` endpoint using the secret `CFD_INGEST_TOKEN` runtime variable. The active bank is immutable; no public route serves the bank or arbitrary future frames. Do not commit CFD fields, solver dictionaries, meshes, ingestion secrets, or runtime wallets.

Optional browser checks (install Playwright separately and make it available with `NODE_PATH`): `node tests/browser.cjs` verifies trading, and `node tests/site-browser.cjs` verifies discovery, profiles, confirmations, offline mode, and mobile layouts. `node tests/aerofoil-browser.cjs` checks the CFD view, shared wallet, downloads, responsive layout, and an actual arrival-based settlement on a server with the private dataset loaded. `node tests/games-browser.cjs` runs an isolated real-HTTP browser scenario with an injected clock: seven outcomes, confirmations, settlement, profile links, competition interest, and contact-triggered audio/mute. `PHYSICS_TEST_URL` selects a different preview server for the other scripts; `PHYSICS_SKIP_OFFLINE=1` skips file-mode checks.

`market.js` is the matching engine; `exchange.js` coordinates all markets and their shared wallet. Existing Bitcoin and aerofoil states migrate without resetting gold or positions. The synchronization script copies the static app and converts that engine into an ES module for the hosted build. Do not edit `hosting/lib/engine.js` or the copied assets directly.

The hosted build uses the supplied Sites/Vinext starter and its lockfile. Hosting dependencies are separate from the zero-dependency local app. `hosting/db/schema.ts` defines the database, with generated migrations in `hosting/drizzle/`.

The GitHub Actions workflow tests the engine and uploads **only the public web assets** to Pages. It does not publish wallets, server data, or hosting configuration.

## Rendering and inspiration

The new dust renderer is original Canvas code using the field-driven particle/trail approach demonstrated by [Mapbox’s WebGL wind project](https://github.com/mapbox/webgl-wind). It preserves the existing CFD data, adds metallic lighting and small seeded dust, and removes the old background streamline drawing. Its background tracers are visualization particles, not extra settlement particles.

The escape game is an original interactive take on satisfying rotating-gap ball videos, including [satisfying.ba11s](https://www.youtube.com/watch?v=Peo-DIOmmRo). A research source [historically documented tens of millions of views](https://knowyourmeme.com/memes/will-the-ball-escape-ball-bouncing-brainrot) for this genre. Current view counts and a global “most viewed” ranking could not be verified; we do not claim either. No creator footage, soundtrack, or melody is reused.

Planck’s [body/continuous collision documentation](https://piqnt.com/planck.js/docs/body.html) and [simulation guide](https://piqnt.com/planck.js/docs/world/simulation.html) informed the collision engine choice. Its license is retained in `vendor/PLANCK-LICENSE.txt` and the hosted source copy.

## Credits

Visual references: [Polymarket home](https://polymarket.com), [public profiles](https://polymarket.com/@ImJustKen), and [Bitcoin Up or Down](https://polymarket.com/event/btc-updown-5m-1790982300). Scientific concept illustrations and avatar artwork are original SVGs. This project is an independent simulation and is not affiliated with Polymarket. It uses its own experiment and settlement rules.
