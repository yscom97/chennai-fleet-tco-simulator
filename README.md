# Chennai Fleet TCO Simulator

A Total Cost of Ownership (TCO) and feasibility simulator for logistics operations in
Chennai, India. Compare owning a truck fleet vs. hiring from the market, with a built-in
rule-based advisor and sensitivity analysis.

Fully self-contained — **no API keys or backend required**. All calculations and the
advisory report run locally in the browser.

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
