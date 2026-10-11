# Hypothesis

**Hypothesis** is a science prediction playground: build a model, take a position, and test it against the experiment. Trade 22 live experiments covering fluids, mechanics, heat, light, fields, quantum physics, gravity, probability, and a live-streamed volcano. Explore seasonal in-person competitions. Every guest starts with **1,000 gold coins**, shared across all live markets. No signup or real money.

**Play:** [hypothesis.jianou-works.chatgpt.site](https://hypothesis.jianou-works.chatgpt.site) — one hosted site serves the pages, the shared live market, and the owner inbox. The old GitHub Pages address redirects there.

## What works

- A science market home page with featured experiments, subject navigation, search, topic/status filters, and a saved watchlist.
- Eight science categories: Fluid Dynamics, Solid Mechanics, Thermodynamics, Electromagnetism, Optics, Quantum Physics, Astrophysics, and Maths & Statistics. All **22 catalogue experiments are playable**, including the original aerofoil, Bitcoin, Galton board and ring escape, the live-streamed Kīlauea market, plus 17 numerical experiments listed below.
- An aerofoil game with rounds around two minutes using genuine, precomputed OpenFOAM velocity fields and passive-tracer trajectories. Thousands of advected dust tracers and adjustable photographic trails reveal the flow. A dashed horizontal line marks the previous exit; a solid gold line and height chart show the current particle. Download the NACA 0012 geometry and public physical parameters.
- A personal profile with an editable username, bio, and avatar; live positions, closed positions, activity, and a gold-denominated profit/loss chart.
- An animated BTC/USD chart, opening price to beat, and five-minute countdown.
- Buy **Above / Below** for the dust particle or **Up / Down** for Bitcoin, and sell shares before the round closes.
- A review window before every market or limit order. Nothing is spent until **Confirm**; canceling or dismissing leaves the wallet unchanged. Confirmations expire when their round ends. Market execution uses prices available when confirmed.
- Market orders, resting limit orders, partial fills, cancellation, and price improvement.
- A live order book with real guest-to-guest matching and labeled bot traders.
- Automatic settlement follows each game’s published rule. Winning shares pay **1 gold each**; losing shares pay zero. Unfilled orders expire and release reserved funds/shares.
- Guest wallets, open positions, transaction activity, settled results, and a practice-wallet reset.
- Responsive desktop/mobile layout, keyboard support, chart hover, and search.
- Public discussions on all 22 live games: guest avatars, current-position badges, threaded replies, likes, Newest/Most liked sorting, a Holders filter, comment links, reports, and deletion of your own posts. Comments stay with the game across rounds; holdings reflect the current round.
- Private feedback with optional reply email and a separate, unchecked email-updates opt-in; contact **jianou.works@gmail.com** from every page.
- Aggregate game-link clicks and visits, with a browser opt-out and Do Not Track support. A protected owner inbox shows feedback, update requests, engagement totals, and reported comments.

## Feedback, privacy, and owner inbox

Open **[the owner inbox](https://hypothesis.jianou-works.chatgpt.site/inbox.html)** and enter the owner access key. The key stays in tab memory, never in a URL or public asset. Local hosting reads `COMMUNITY_ADMIN_TOKEN`, or the owner's private `../polymarket_physics_private/community-admin-token` file; hosted deployment uses the same secret runtime variable. Neither key is committed to GitHub. Set a random secret of at least 32 characters when self-hosting.

The inbox supports private feedback review, manual email replies, JSON export, an opt-in contacts CSV, comment hiding/restoration, report dismissal, and contact/message deletion. Feedback is stored in the inbox; **no automatic email notifications or campaigns are sent**. Update requests record explicit consent and time, but addresses are **unverified**; verify ownership before importing into a mailing provider. An email supplied only for a reply never enters the updates list.

Visitors can remove their saved reply emails and update request through **Privacy choices**. This uses the current guest session; clearing browser data or using another browser may require contacting the owner for removal. Comments are public; feedback text and email fields are owner-only. Daily game counts are retained for 90 days and are not unique-user counts. The app does not store IP addresses, device fingerprints, or per-person browsing histories for analytics. Short-lived event receipts deduplicate navigation retries; existing guest sessions enforce basic action limits. Do Not Track disables collection, and opt-out clears queued counts. Optional email data is never joined to engagement totals or included in public snapshots.

`community.js` is shared server logic. Node stores its separate state in `data/community.json` with owner-only file permissions. Hosting stores it in a separate `community` row of the existing D1 table, using revision checks so concurrent writes cannot overwrite one another. Trading state and balances remain separate. Request-size, content-length, ownership, origin, and per-guest rate checks protect the endpoints; comments are rendered as plain text. The owner endpoint requires the secret, even for reads.

This is a small pilot: community state is capped at 1.5 MB, visible in the owner inbox. At capacity, submissions fail explicitly rather than discarding existing feedback. Export and clear old feedback as needed; use dedicated comment/contact tables and stronger abuse controls before growing to a large anonymous audience. No signup means guest identities and rate limits are browser-session based.

## Run locally

Requires Node.js 18 or newer. The local app needs **no npm install and no build step**. A pinned MIT-licensed Planck.js 1.5.0 build is included in `vendor/` for the collision games.

```sh
cd ~/Desktop/hypothesis
npm start
```

Open **http://127.0.0.1:3000**. Different browser profiles receive separate guest wallets and trade in the same market. Tabs in the same profile share a wallet. The server saves progress to `data/market.json`, which is excluded from Git. Keep this directory to retain wallets after a restart.

The public repository includes the games, matching engine, geometry, and physical conditions. The private CFD replay library is intentionally excluded. The owner's local server reads `../polymarket_physics_private/flow-bank.json`, or a file selected with `PHYSICS_CFD_DATA=/absolute/path/flow-bank.json`. Without it, all 21 other games and browsing still work; aerofoil trading reports unavailable rather than inventing flow. Existing aerofoil positions require their original dataset to resume safely. Use the hosted game to play without running CFD yourself.

To play across your local network:

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

Open `http://<your-computer-LAN-IP>:3000` on another device.

You can also open **index.html directly** to browse the home page, **bitcoin.html** to play, or **profile.html** to edit your profile. Standalone mode stores the guest and market in your browser; it does not connect to other visitors. The interface identifies practice mode explicitly.

## Aerofoil experiment

**[Play the aerofoil market](https://hypothesis.jianou-works.chatgpt.site/aerofoil.html)** · **[Geometry and physical conditions](geometry/)**

The geometry is NASA's sharp-trailing-edge version of the well-studied **NACA 0012**, at **20° angle of attack**. A 0.10 m chord, 0.15 m/s inlet velocity, and 1.5 × 10⁻⁵ m²/s kinematic viscosity give a chord Reynolds number of **1,000**. The two-dimensional domain spans x/c = −3…6 and y/c = −3…3. The particle starts at (−3, 0) and is advected through the unsteady separated flow. It is an ideal small-dust tracer: inertia, gravity, and feedback on the fluid are neglected.

A consistent playback speed puts typical transits **around two minutes**. Rounds finish on arrival at the outlet, so wake recirculation can make them longer. The page shows elapsed time rather than revealing the future arrival time, and also displays physical simulation time. **Above** wins if the right-boundary exit y is at or above the previous round's exit y; otherwise **Below** wins. The first target comes from another completed CFD trajectory. Exact equality pays Above. Winning shares pay 1 gold, and open orders expire at settlement. All connected guests see the same round.

The downloadable DAT contains the normalized profile, the CSV its tilted coordinates, and the closed STL a convenient extrusion; multiply chord-unit coordinates by 0.10 to obtain metres. `parameters.json` specifies inlet conditions, fluid properties, domain, boundaries, particle assumptions, and the pitch convention. The numerical solver configuration, mesh, initial wake state, and full replay bank remain private. The browser receives only elapsed particle positions and the currently observed velocity field. Background dust particles advect through the currently observed field with bilinear velocity interpolation and a midpoint step. A transparent trail buffer gives short/long exposure; only the highlighted dust particle determines the result. Rounds use preselected, completed transits with varied wake phases. The finite precomputed library repeats, so this is an educational prototype rather than an unlimited source of new CFD realizations.

NACA 0012 is a validation geometry, but **that does not validate this particular simulation**. This exploratory, low-Reynolds-number 2D model is not a validated prediction of real 3D stall. NASA's reference case uses different conditions, and published Re = 1,000 research reports three-dimensional wake transitions at high incidence. See the [NASA geometry reference](https://tmbwg.github.io/turbmodels/naca0012_val.html) and [wake-transition study](https://journals.sagepub.com/doi/10.1177/17568293211055656).

## Galton board, ring escape, and round timing

Bitcoin, CFD and Galton rounds last **1–5 minutes**. Escape attempts run for up to **60 seconds**, ending early on a successful escape, with **3 seconds between balls**. Bitcoin stays at five minutes; the CFD aerofoil keeps its arrival-based 106–168 second transits. The new collision games use [Planck.js 1.5.0](https://github.com/piqnt/planck.js), a Box2D-based rigid-body engine, with a fixed 120 Hz physics step and continuous collision detection. OpenFOAM remains responsible for fluid flow; it is not used for peg impacts.

**[Galton board](https://hypothesis.jianou-works.chatgpt.site/galton.html):** one ball falls through eleven rows into seven slots. Each slot has its own **Yes and No** contracts, order book, limit orders, and positions. First solver-reported contact with the floor settles the containing slot Yes and all six other slots No. Every winning share pays 1 gold. Each round varies the release x within **±0.22 m of the centre**. The board marks x = 0; its launcher follows the actual starting position. The round’s signed **x₀** and initial horizontal speed **vₓ₀** remain visible throughout the fall. **Round data** downloads the full-precision initial state, release timestamp, parameters, and peg geometry; `physics.release` exposes the same state in the API snapshot even for late joiners. Positive x points right, positive y points down, and velocities use physical seconds. No slot is chosen in advance. Playback normally maps one physical second to 20 wall seconds; short falls slow down further to give at least 75 seconds of transit. A 10-second release countdown and 3.5-second result display keep rounds between about 1:29 and 4:14. Failure to land within 12 physical seconds voids the round, returns held positions’ cost basis, and releases open orders. [Download parameters](geometry/galton.json).

**[Ring escape](https://hypothesis.jianou-works.chatgpt.site/escape.html):** each ball launches immediately into a 60-second physical challenge. Three kinematic rings with gaps rotate around one ball. Yes settles as soon as the entire ball clears the outer ring plus the published 0.04 m detection tolerance; No settles at the deadline. Trading stays open while the ball moves. After escape or timeout, the result appears for exactly 3 seconds before the next ball launches. There is no additional prediction window. Existing rounds from the older timing finish on their original clock before adopting the new cadence, preserving open positions and their outcomes. Ring motors can transfer energy during impacts. [Download parameters](geometry/escape.json).

**The collisions make the music.** There is no background recording or looping track. Measured contact impulses trigger original synthesized pentatonic notes: struck ring/peg row affects pitch, impulse affects loudness, and horizontal position affects stereo pan. Harmonics decay after each hit. Click **Play collision music** to satisfy browser audio activation, and use **Mute collision music** at any time. Hidden tabs suspend audio; rejoining never plays a backlog of missed impacts.

Both games compute authoritative trajectories on the server and send only elapsed positions and impacts. A short rendering buffer smooths the 1-second network updates. Guests share the same ball, clock, book, and wallet. Their trades do not alter physics. The Galton probability vector is normalized from visible ball position; escape quotes use current radius and remaining time. These are liquidity heuristics, not calibrated scientific forecasts. Seeds and unobserved outcomes stay on the server. Contracts in one request share a clock sample so all seven slots cross a round boundary together.

## Kīlauea live-stream market

**[Play the Kīlauea market](https://hypothesis.jianou-works.chatgpt.site/live.html?game=kilauea)** · `live.html?game=kilauea`

The first game built on a **real experiment watched through a live stream** rather than a simulation. Since 23 December 2024 Kīlauea has erupted in numbered lava fountaining episodes separated by pauses of two weeks or more; the USGS Hawaiian Volcano Observatory (HVO) streams Halemaʻumaʻu around the clock on three public-domain cameras (V1cam, V2cam, V3cam). The page embeds the stream and asks **“Will Kīlauea’s next lava fountaining episode begin before the deadline?”**

Because a live stream lags real time by seconds to minutes and the camera cannot settle anything, the market is deliberately slow: windows last one to four weeks, with deadlines at **00:00 UTC on the 1st and 16th of each month**, always at least seven days after a window opens. Trading stays open until the deadline. **Yes** resolves as soon as an HVO notice states that a numbered episode began at a time (HST) inside the window; **No** resolves after the deadline once the site has successfully checked the record at or after the deadline. Episodes that began before the window, intrusions, overflows, spattering or new vents without a numbered fountaining episode do not count. The result stays on screen for ten minutes, then the next window opens.

Settlement reads the public USGS Hazard Notification System API: `live-feeds.js` polls the recent-notice list, fetches each new HVO notice for volcano `hi3` once, strips the HTML, and parses “Episode N … began/started at HH:MM HST on Month D”. Real notices for episodes 48, 53 and 54 are kept in `tests/fixtures/hvo/` and drive the parser tests, including overnight episodes whose only date belongs to the end time and daily updates that merely restate earlier episodes. Episode start times for episodes 48–54 are seeded from the HVO status reports so the liquidity model has a recent event rate from day one. The USGS `url.usgs.gov/v1cam|v2cam|v3cam` short links are re-resolved a few times a day so the embed survives stream restarts; viewers can switch cameras on the page.

`livestreams.js` holds the public specification (question, rule, schedule, stream, source, seeded events) and is shared by the browser, the Node server and the hosted Worker. `live-market.js` is the engine: a window is a `Market` round whose outcome is unknown until an observation arrives, so `path` never contains a future value, bots quote a memoryless hazard from the mean gap between recent official episodes (a liquidity heuristic, not a forecast), and a window that passes its deadline closes trading and waits for a fresh successful check rather than guessing. The local server polls every 30 seconds when a check is due (every five minutes while open); the hosted Worker checks during requests when the stored observation is older than five minutes, bounded to four notice fetches per request. If the feed is discontinued or changes format, the owner can resolve or void a window from the **owner inbox** with a note citing the published record; the note is shown on the page and in past windows. Nothing about this market is simulated: the volcano, the camera and the record are real, and gold has no cash value.

## Numerical experiment catalogue

All 17 former previews are playable at `experiment.html?game=<id>`. Each uses **120 seconds of trading, then a 3-second result display**. The physical/simulation clock is separate; its units are visible on the stage. A round generates fresh published initial conditions. The browser draws only elapsed server observations, with a live measurement history and dashed threshold where appropriate. **Round data** downloads full-precision parameters, initial-state variable labels, equations, assumptions, timestamps and settlement rules.

| Game ID             | Model                                                          | Settlement                                                                                 |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `convection`        | Lorenz-63 three-mode convection, RK4                           | Sign of circulation X at dimensionless t = 30; X ≥ 0 is Clockwise                          |
| `magnetic-pendulum` | Damped planar point-attractor model, RK4                       | Nearest of three magnets at t = 60 s; three independent Yes/No markets                     |
| `vortex`            | Original D2Q9 BGK lattice Boltzmann cylinder wake              | Mean vertical bounce-back force over the final 15 lattice steps is positive                |
| `double-pendulum`   | Exact nonlinear two-link equations, RK4                        | Net unwrapped lower-arm rotation from release is at least one turn at t = 12 s             |
| `heat`              | 2D Dirichlet heat equation, separated Fourier solution         | Centre temperature ≥ 50°C at t = 180 s                                                     |
| `prism`             | N-BK7 Sellmeier dispersion, Snell refraction and group delay   | First pulse to its detector, including published launch delays; three Yes/No markets       |
| `charge`            | Exact solution of uniform-field Lorentz motion                 | Centre within the 1.4 m target at t = 6 s                                                  |
| `orbit`             | Softened three-body gravity, velocity Verlet at 0.00025        | No body satisfies the published finite-time escape criterion at t = 12                     |
| `beam`              | First-mode cantilever response                                 | Tip deflection ≥ 10 mm at t = 8 s                                                          |
| `tunneling`         | 1D time-dependent Schrödinger equation, complex Crank–Nicolson | One Born-rule position-region measurement beyond the barrier at t = 16                     |
| `piston`            | Ideal gas, piston mechanics and first-law heat balance         | Position ≥ 0.12 m at t = 10 s                                                              |
| `interference`      | Two coherent sources with time-varying phase                   | Normalized detector intensity ≥ 0.6 at t = 6 s                                             |
| `diffusion`         | 120 reflecting Brownian tracers                                | More than 60 centres in the left half at t = 20 s; a tie is No                             |
| `random-walk`       | Independent cardinal steps on a 2D square lattice              | Within 10 lattice units of the origin after exactly 120 steps; earlier visits do not count |
| `induction`         | Axial dipole flux and an RL coil                               | Current > +0.005 A at t = 6 s                                                              |
| `collision`         | Analytic momentum and restitution solution                     | Red-ball velocity strictly positive after impact                                           |
| `monte-carlo`       | 1,600 private uniform samples of the square                    | Final estimate of π strictly above 3.14                                                    |

**Model scope matters.** Convection is a reduced Lorenz model, the magnetic pendulum uses softened point attractors, and the beam is a single-mode approximation. The cylinder uses a coarse 96×48 grid with an eight-cell diameter, periodic transverse boundaries, and a published symmetry-breaking perturbation. Its visual shows interpolated calculated vorticity; it is not a mesh-converged engineering CFD prediction. The independent aerofoil game continues to use the private OpenFOAM bank. Quantum evolution uses 1,024 interior grid points, cell-averaged barrier potential, dimensionless ħ = m = 1, and a maximum time step of 0.01. Its curve is a probability density; the final measurement is stochastic, not a pre-existing classical trajectory.

The equations and primary references are linked from each game. Useful references include [UCAR Lorenz-63](https://docs.dart.ucar.edu/en/v11.7.1/guide/lorenz-63-model.html), [Berkeley double-pendulum mechanics](https://rotations.berkeley.edu/the-double-pendulum/), [OpenLB cylinder demonstrations](https://www.openlb.net/cylinder/), [SCHOTT N-BK7 coefficients](https://media.schott.com/api/public/content/41e799d0bf874807a0bb8e702fbb75b5?v=54856406), and [Bielefeld quantum propagation notes](https://roesner.pages.ub.uni-bielefeld.de/lectures/computational-physics/semester/sose2026/lecture/08_pde/04_operator_splitting.html). These references support the model choices; they do not independently validate this implementation.

Deterministic experiments can be predicted from their published initial conditions, subject to numerical and chaotic sensitivity. Stochastic games require probability forecasts. Independent SHA-256 counter streams isolate public initial conditions from future noise and quantum measurements. The persisted private `labSecret` preserves rounds over server restarts and is never serialized into public snapshots. In-process caches retain generated trajectories; no new external service or paid dependency is needed. Bot prices use observed state and are liquidity heuristics, not exact probabilities. The three-outcome markets share one trajectory, one settlement instant, and the same guest wallet.

`experiments.js` contains the public specifications; `lab-physics.js`, `wave-physics.js` and `wake-physics.js` run on the server, and `lab-market.js` handles settlement. `experiment.js` and `lab-renderer.js` provide the common trade interface and distinct canvas scenes. The new games participate in the home page, subject filters, watchlists, profile, discussions, feedback and private aggregate engagement dashboard. None of these changes resets existing wallets or the original games.

## Seasonal in-person competitions

The **[competition page](https://hypothesis.jianou-works.chatgpt.site/competitions.html)** is linked from the main navigation, discovery page, and ball games. It proposes public practice, simultaneous release of new geometry/conditions at the venue, calibration, a model freeze, and scored held-out trials. Separate forecasting and trading leaderboards would expose model robustness across unseen cases rather than performance on a memorized trajectory.

Dates, venue, entry arrangements, prizes, final scoring and compute budgets are **to be announced**. The page does not claim a scheduled event or fabricate a leaderboard. **Save my interest** persists a reversible preference in the guest profile; it is not an event registration and does not send notifications. Running the competition itself with new solver datasets is a future event setup task.

## Guest profiles

The profile uses the same guest account as the home page and all 22 live experiments. Usernames are unique within the market, 3–24 characters, with a 200-character bio and eight avatar choices. Edits are saved on the shared server (or in browser storage in standalone mode). No email, password, cryptocurrency wallet, or payment is requested.

Positions Value marks held shares at the current sell quotes. Total PnL is cash plus reserved gold plus marked positions, minus the initial 1,000 gold. The chart shows recorded portfolio observations and the current value, with time filters; it never invents historical results. Biggest Win is the largest recorded positive sell-fill or settlement profit. Markets Traded counts distinct market rounds with fills. Volume counts the guest's actual fills, including fills of their resting orders.

The latest 500 activity events and 100 settled rounds per market are retained; chart observations are sampled once per minute and older observations are thinned as the archive grows. Detailed profile tracking begins with this update. Resetting the practice wallet resets trading statistics while keeping the username, avatar, and bio.

Guest access is remembered in this browser. Clearing browser storage or changing browser profiles creates a separate guest identity. There is no account recovery or login yet.

## Online architecture

The hosted app in `hosting/` serves the plain HTML, CSS, and JavaScript and runs the market engine on a Cloudflare Worker with D1 wallet storage and a private R2 CFD replay library through Sites. Pages and API share one origin, so there is exactly one public address. GitHub holds the source and runs the tests on every push; the former GitHub Pages address keeps a redirect so old links and deep links still work.

The online server creates anonymous guest sessions and stores profiles, balances, orders, and settlement centrally. The numerical experiments poll every 750 ms and the original live games once per second; discovery and profiles poll every three seconds. A revision check commits the full market update atomically; a conflicting update is re-read and validated before committing, preventing concurrent trades from double-spending the same gold. Future price points and guest secrets are never returned to browsers.

Local Node hosting provides server-sent events for Bitcoin and polling for the other pages. Opening the HTML files directly from disk gives an independent browser practice market on the Bitcoin and profile pages; online, a lost connection is reported and retried rather than silently replaced. Aerofoil trading requires a live connection and never falls back to synthetic CFD. Practice gold is never merged into the shared market.

## Early-market bot liquidity

An empty book is no fun, so the market starts with four behaviors:

| Bot                    | Behavior                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Atlas** market maker | Quotes both outcomes in each market at six price levels. Prices follow estimated outcome probability, with a spread and an inventory adjustment. Sizes vary each second. Consumed depth is tracked and replenished on the next tick. |
| **Momentum**           | Favors the direction of the last 12 seconds of visible price movement.                                                                                                                                                               |
| **Contrarian**         | Prefers the other side of the recent movement.                                                                                                                                                                                       |
| **Noise**              | Places small randomized orders to keep activity varied.                                                                                                                                                                              |

The three trading bots submit market and limit orders through the **same matching engine as people**, roughly every three seconds. A guest order offering a better price is eligible for a bot fill. Orders use price/time priority, avoid self-trades, and reserve cash or shares when resting. All bot activity is labeled in the feed. Market-maker quotes are simulated liquidity, backed by virtual capital, rather than genuine external traders.

The underlying Bitcoin price moves independently of trading. The outcome probability reacts to its distance from the opening price and the time left in the round. Aerofoil quotes use current particle height, previous exit height, and remaining distance; they are a heuristic rather than a calibrated scientific probability. Bots use only elapsed observations, never the future path. This gives the market movement without allowing bots to choose the outcome.

For an early play-money launch, keep bot orders small and the spread close to two cents. As human activity grows, reduce bot size and frequency, and let human quotes occupy the top of the book. Before scaling, replace the single market snapshot with a dedicated serialized matching service, separate wallet/order tables, guest-session expiry, and abuse/rate controls. This version is a small shared simulation, not a production exchange.

## Development

```sh
npm test                 # Engine, settlement, matching, and HTTP checks
node scripts/sync-hosting.js
```

The private replay bank is uploaded once to the R2-backed `/api/cfd-ingest` endpoint using the secret `CFD_INGEST_TOKEN` runtime variable. The active bank is immutable; no public route serves the bank or arbitrary future frames. Do not commit CFD fields, solver dictionaries, meshes, ingestion secrets, or runtime wallets.

Optional browser checks (install Playwright separately and make it available with `NODE_PATH`): `node tests/browser.cjs` verifies trading, and `node tests/site-browser.cjs` verifies discovery, profiles, confirmations, offline mode, and mobile layouts. `node tests/aerofoil-browser.cjs` checks the CFD view, shared wallet, downloads, responsive layout, and an actual arrival-based settlement on a server with the private dataset loaded. `node tests/games-browser.cjs` runs an isolated real-HTTP browser scenario with an injected clock: seven outcomes, confirmations, settlement, profile links, competition interest, contact-triggered audio/mute, full-precision release downloads, and the three-second escape restart. `PHYSICS_TEST_URL` selects a different preview server for the other scripts; `PHYSICS_SKIP_OFFLINE=1` skips file-mode checks.

`market.js` is the matching engine; `exchange.js` coordinates all markets and their shared wallet. Existing Bitcoin and aerofoil states migrate without resetting gold or positions. The synchronization script copies the static app and converts that engine into an ES module for the hosted build. Do not edit `hosting/lib/engine.js` or the copied assets directly.

The hosted build uses the supplied Sites/Vinext starter and its lockfile. Hosting dependencies are separate from the zero-dependency local app. `hosting/db/schema.ts` defines the database, with generated migrations in `hosting/drizzle/`.

The GitHub Actions workflow tests the engine on every push and publishes only the two redirect pages in `redirect/` to the old GitHub Pages address. It does not publish wallets, server data, or hosting configuration; the playable site is published from `hosting/` through Sites.

`node tests/community-browser.cjs` covers the original four comment sections, two-browser replies/likes, filters, reports and moderation, email privacy and erasure, owner exports, opt-out/Do Not Track, mobile layouts, and Hypothesis branding. These tests run against an isolated local server and never submit data to the live site or send email.

## Rendering and inspiration

The new dust renderer is original Canvas code using the field-driven particle/trail approach demonstrated by [Mapbox’s WebGL wind project](https://github.com/mapbox/webgl-wind). It preserves the existing CFD data, adds metallic lighting and small seeded dust, and removes the old background streamline drawing. Its background tracers are visualization particles, not extra settlement particles.

The escape game is an original interactive take on satisfying rotating-gap ball videos, including [satisfying.ba11s](https://www.youtube.com/watch?v=Peo-DIOmmRo). A research source [historically documented tens of millions of views](https://knowyourmeme.com/memes/will-the-ball-escape-ball-bouncing-brainrot) for this genre. Current view counts and a global “most viewed” ranking could not be verified; we do not claim either. No creator footage, soundtrack, or melody is reused.

Planck’s [body/continuous collision documentation](https://piqnt.com/planck.js/docs/body.html) and [simulation guide](https://piqnt.com/planck.js/docs/world/simulation.html) informed the collision engine choice. Its license is retained in `vendor/PLANCK-LICENSE.txt` and the hosted source copy.

## Credits

Hypothesis is an independent science playground with original identity, scientific illustrations, and avatar artwork. Each experiment publishes its own physical conditions and settlement rules.

`tests/live.test.js` covers the Kīlauea market: deadline scheduling, the HVO notice parser on real fixtures, feed walking with cached notices and camera re-resolution, Yes settlement from an in-window episode, No settlement only after a post-deadline check, pre-window events, owner override and void refunds, hazard quotes, restart persistence, the community listing, the HTTP owner endpoint and the feed poller. `NODE_PATH=/path/to/playwright/node_modules node tests/live-browser.cjs` opens the page in a real browser against an isolated server with a stubbed feed.

`tests/lab.test.js` checks all new models, conservation and symmetry properties, heat bounds, Brownian reflection, Lorentz motion, restitution, Faraday flux, wave normalization/free propagation/grid refinement, SCHOTT indices/Snell refraction, cylinder density and mirror symmetry, private future state, shared-wallet settlement, restart persistence and the exact three-second rollover. `NODE_PATH=/path/to/playwright/node_modules node tests/labs-browser.cjs` runs each of the 17 games through a real browser and local HTTP server: visual rendering, parameter downloads, review/cancel/confirm, positions, comments, mobile overflow, catalogue/profile links and expired confirmations. Browser tests use isolated wallets and never submit comments or feedback to production.
