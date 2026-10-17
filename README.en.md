# Vigía

[Versión en español](README.md)

I keep a watchlist of crypto, stocks and ETFs, and I had a bad habit: opening the broker
app "just to check" several times a day. Vigía exists to reverse that. I define concrete
thresholds ("alert me if BTC's weekly RSI drops below 30", "if IBE.MC goes above €16")
and a process that runs on its own checks them and sends me a Telegram message when one
is met. In the meantime, I don't look at anything.

Vigía does not give opinions, recommend or predict. It does not connect to any broker or
exchange with trading keys: it only reads public prices and compares numbers with the
thresholds I set. It is a personal monitoring tool, not an advisor.

It is the companion to [Bóveda](https://github.com/seakerop/boveda): Bóveda stores,
Vigía watches. They are separate projects on purpose: Bóveda promises that nothing leaves
your device, and Vigía needs the opposite, something awake 24/7 even when my phone is off.

The interface is in Spanish. Live demo: https://vigia-fawn.vercel.app

## Two modes

By default Vigía runs entirely on the device: assets, rules and history are stored in the
browser, and the app itself fetches prices every 15 minutes while it is open, checks the
rules and alerts on screen (and with a system notification if you allow it). No account
is needed. The drawback is that nothing is monitored while the app is closed, and the
data lives in that browser: Settings has a backup you can download and import again.

Server mode is what the rest of this README describes: rules in Upstash, a cron job every
two hours and Telegram alerts even when the phone is off. It is enabled from Settings once
those accounts are configured.

## How server mode works

Three pieces, all on free tiers:

- **The PWA** (React + Vite, deployed on Vercel): the dashboard where I manage the
  watchlist and the rules, with the candlestick chart, the RSI series and the alert
  history. Market data is drawn with the same modules the cron job uses, so what you see
  on screen is exactly what gets evaluated.
- **The state** lives in a free Upstash Redis database, because the cron job needs to read
  my watchlist without the app being open. Three keys with a deliberate split: `config`
  (assets and rules) is written only by the PWA; `state` (the runtime of each rule) and
  `alerts` (the history, capped) are written only by the cron job. That way nothing
  overwrites anything else without needing transactions.
- **The cron job** is a GitHub Actions workflow with a two-hour `schedule` that runs
  `scripts/check.mjs`: it reads the config from the KV store, downloads candles from
  Binance and Yahoo Finance, computes the RSI, evaluates the rules and sends alerts
  through a Telegram bot. No dependencies and no `npm install`: a run takes seconds.

Why GitHub Actions and not a Vercel cron? Vercel's Hobby plan limits cron jobs to one run
a day with no guaranteed time. Actions is free for public repositories and goes down to
every 5 minutes, with two trade-offs: the schedule can be delayed by a few minutes at peak
times (irrelevant for a daily RSI), and GitHub disables it after 60 days without activity
in the repository; it sends an email and any commit re-enables it.

A less known catch: Actions runners are in the US and `api.binance.com` returns 451 to US
IPs, so the fetcher uses `data-api.binance.vision` as a fallback host. Yahoo sometimes
behaves similarly, and the fallback there is my own proxy deployed on Vercel.

## RSI from scratch

The RSI is implemented from scratch ([src/core/rsi.js](src/core/rsi.js)), without an
indicator library: Wilder smoothing, 14 periods by default, a pure module that runs the
same in the browser and in Node. The first average gain and loss is a simple average;
from there each value is smoothed with `avg = (prevAvg × 13 + change) / 14`, which is the
original 1978 definition and the reason the RSI needs much more history than 14 candles to
converge (the fetchers request about 300).

The tests ([src/core/rsi.test.js](src/core/rsi.test.js)) validate against the classic
StockCharts example dataset, also cross-checked against a reference library, and against
properties that are not open to debate: a series that only rises gives 100, one that only
falls gives 0, and a flat one does not divide by zero.

## Rules that do not repeat

A rule fires once and disarms. It re-arms when the value crosses back over the threshold
by a margin (2 RSI points, 1% for price): without that hysteresis, an RSI hovering between
29.8 and 30.2 would send the same alert every two hours. Each trigger stores a snapshot
(date, value, threshold) that feeds the app's history. The logic is in
[src/core/rules.js](src/core/rules.js), with the full cycle tested: fire, stay quiet,
re-arm, fire again.

## Alerts with context

An "RSI below 30" alert is not very useful without knowing what usually happens next. While
building the [Thermometer](https://github.com/seakerop/termometro) study I found that many
of these rules do not mean what people think: in Bitcoin, a high RSI has been followed by
further gains rather than falls, and buying oversold readings has done worse than buying on
any day in recent years.

So each rule is tested against the asset's history ([src/core/history.js](src/core/history.js)).
It replays the data candle by candle with the same firing and re-arming logic as the cron
job, so it counts exactly how many times the alert would have arrived, and looks at what the
price did 5, 10 and 30 days later compared with what is normal for that asset. The test is
an exact binomial using only non-overlapping triggers, and there is a second look at the last
three years, because a signal may have worked in 2018 and not now. When creating a rule I
see the result while adjusting the threshold, and the alert message includes a sentence with
that context.

Besides RSI and price, rules can watch Bollinger Bands, the distance to a moving average and
the drawdown from the one-year high. For Bitcoin there is also a card with the current phase
of the halving cycle and what happened in that phase in previous cycles.

## Running locally

```
npm install
npm run dev      # PWA at http://localhost:5176
npm test         # indicators, rules, rule tester and cycle
npm run check    # one cron run (DRY_RUN=1 to skip sending Telegram)
```

Without credentials, the store is a local file (`.data/dev-store.json`) and you can test the
full cycle without signing up for anything. The real system needs the variables in
`.env.example`: the personal API token, the Upstash REST credentials and the Telegram bot
token and chat ID; in `.env` locally, in Vercel for the API and in GitHub Secrets for the
cron job. None of it touches the repository.

## Disclaimer

Vigía watches the thresholds you define. It is not financial advice and it does not place
orders anywhere.
