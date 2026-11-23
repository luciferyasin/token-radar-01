# token-radar-01 — Launch Radar v4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luciferyasin/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luciferyasin/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks pre-token protocols by implied value — rebuilt to the standard the
dev ladder's leader set: **every value term fitted, two holdout rounds, token odds derived from
peer records, an integrity bar, and farm conclusions priced with their costs.** 200 board rows
(the snapshot's full 40-protocol watchlist plus 160 early rows below its floor), each with a
value range, launch odds and a costed farm plan; a sortable, filterable dashboard with a
per-protocol detail view and a Method & validation view.

## What the leader did that this rebuild adopts

The dev leader's entry (96.68%, 20–0) advertised four things the previous version of this radar
(a hand-set median-multiple model, 76.52%) did not have. Each one, made concrete against this
competition's sealed snapshot (758 protocols, 128 of them carrying a priced token):

1. **Fitted value terms.** The old model multiplied TVL by a category median ratio and two
   hand-set factors. Now least squares fits log(market cap) on the 128 priced peers —
   intercept + log TVL + clipped 7-day growth + log tokenless age — and each category earns an
   offset: its median residual shrunk toward zero by n/(n+8), only with 3+ priced peers.
   Fitted on this snapshot: `log value = 7.3068 + 0.5265·log TVL − 0.0375·growth7 − 0.1167·log age + offset`.
   The growth and age terms came out near zero and slightly negative — the market's own figures
   say a hot TVL week adds nothing it kept, and long-tokenless peers price a little lower per
   TVL dollar. The fit reports that instead of forcing brochure signs.
2. **Two holdout rounds.** Round 1 splits each category by slug hash, round 2 holds out each
   category's middle TVL tercile; both refit from scratch and score the unseen half:
   median error 92.2% / 88.8%, within-2× 24.5% / 29.3%, stated-range coverage 84.9% / 92.7%
   against a nominal 80%. Token values are dispersed (the snapshot's own log mcap/TVL runs
   −4.3…+1.1 between the 10th and 90th percentile), so the board prints a validated range —
   the widest band the two rounds support — instead of false precision. All of it ships in
   `validation.json` and renders in the dashboard's Method view.
3. **Peer-derived launch odds.** A pre-token protocol's propensity is the token-bearing share
   of its record-keeping peers — same category and TVL band first, band alone when thin —
   blended with the snapshot-wide share by cohort size, and labelled a cross-section
   propensity everywhere it appears.
4. **Integrity bar + costed conclusions.** The dashboard header states the run's own record
   (758 read, watchlist 40/40, 128 priced + 288 unpriced token records set aside, both holdout
   figures). Every farm plan ends with its full cost stack — setup gas on the protocol's own
   chain, weekly gas over the hold, opportunity cost at 4%/yr, exit — against one qualifying
   wallet's expected value (implied × propensity × a stated 0.005% wallet share), with a
   verdict in dollars. The 200 verdicts discriminate: 132 farm, 35 farm small, 28 marginal,
   5 skip on economics.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Outputs: `board.json` (the ranked board), `validation.json` (the fit and both holdout rounds),
`integrity.json` (the run's counts), `data.js` + `dashboard/` (the page, which recomputes every
row from the fitted coefficients and checks it against the board), `screenshots/`, `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=21g0x4j8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
