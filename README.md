# Chennai Fleet TCO Simulator

A Total Cost of Ownership (TCO) and feasibility simulator for logistics operations in
Chennai, India. Compare owning a truck fleet vs. hiring from the market, with a built-in
rule-based advisor, lifecycle NPV modelling, and probabilistic risk analysis.

Fully self-contained — **no API keys or backend required**. All calculations and the
advisory report run locally in the browser.

## Features

- **Lifecycle NPV** — discounted total cost over the ownership horizon, with residual
  value recovery, depreciation, and diesel/salary escalation (ICCT / NREL T3CO-style).
- **Availability-aware** — owned-fleet downtime is back-filled by market hire, so uptime
  actually moves the numbers.
- **Monte Carlo risk** — 1,000-run simulation over diesel price, mileage, rotation and
  interest, returning the probability that ownership stays profitable (P10 / P50 / P90).
- **Tornado sensitivity** — ranks the cost drivers by swing impact.
- **EV vs Diesel** — battery-electric lifecycle NPV and CO₂ comparison (eFAST India-style),
  honest about India's coal-heavy grid intensity.
- **Accurate cost structure** — every rupee attributed (no magic-number placeholders).
- **Scenario save & compare**, **CSV export**, **shareable URL**, **dark mode**, and a
  rule-based advisor (Verdict / Risk / Action Plan).

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

## Deploy to GitHub Pages

Deployment is automated via GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment**, and set
   **Source** to **GitHub Actions**.
3. Push to the `main` branch (or run the workflow manually). The site publishes to
   `https://<your-username>.github.io/<repo-name>/`.

The Vite `base` is set to `./` (relative), so the build works from any Pages sub-path
without extra configuration.

## Tech Stack

React 19 · TypeScript · Vite · Recharts · Phosphor Icons · Tailwind (CDN)
