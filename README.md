# DIALLED IN

[![Deploy PWA to GitHub Pages](https://github.com/gentletom/dialled-in/actions/workflows/deploy.yml/badge.svg)](https://github.com/gentletom/dialled-in/actions/workflows/deploy.yml)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa)](https://gentletom.github.io/dialled-in/)

**A personal fitness operating system — built for one, optimised for clarity.**

---

## What is DIALLED IN?

DIALLED IN is a progressive web app (PWA) that replaces the scattered mess of gym trackers, food logs, and sleep apps with a single, opinionated daily dashboard. It tracks four pillars — **Fuel, Recovery, Lifts, and Readiness** — and synthesises them into a composite daily score that tells you, at a glance, how dialled in you actually are.

The app is designed to run entirely on your device. There is no account, no backend, no subscription. Your data lives in your browser's IndexedDB; your Anthropic API key is pasted once and stored locally. The AI coach (powered by Claude) reads your real data — your actual meals, your actual lifts, your actual sleep — and responds with coaching that knows your history.

---

## Screenshots

<!-- screenshot: home-score -->
<!-- screenshot: fuel-tab -->
<!-- screenshot: lifts-session -->
<!-- screenshot: coach-drawer -->

---

## Features

- **Composite Daily Score** — four-pillar radial rings (Fuel · Recovery · Lifts · Readiness) collapse into a single 0–100 headline score tracked over time
- **FUEL Tab** — log meals with macro and micronutrient tracking; AI estimates micros from meal descriptions when data is absent; 7/30-day history with bar charts
- **LIFTS Tab** — session logging in the style of Hevy; exercise catalogue (~120 movements), routine builder, plate calculator, rest timer
- **GAINS Tab** — bodyweight log, PR tracking, sparklines for weight trend and PR trajectory
- **COACH Drawer** — floating AI coach with full context injection (your scores, meals, lifts, recent history); responds like a coach who read your notes
- **PLAN Tab** — structured weekly training plan, editable inline; COACH can write to it directly
- **Adaptive Nudges** — context-aware prompts on the HOME screen based on real data patterns
- **Git Backup** — export your full data as a JSON commit to a private GitHub repo (no separate cloud required)
- **Fully Offline-Capable** — service worker caches the app shell; works without a connection after first load
- **Installable** — add to home screen on iOS and Android for a native-app feel

---

## Architecture

| Layer | Technology |
|---|---|
| Framework | React 18 (hooks, no class components) |
| Build tool | Vite 5 with manual chunk splitting |
| PWA | `vite-plugin-pwa` — manifest + service worker auto-generated |
| Charts | Recharts 2 |
| Icons | Lucide React |
| Persistence | IndexedDB via a thin custom adapter (`src/storage.js`) |
| Credentials | `localStorage` (API key only — never synced) |
| AI | Anthropic Claude API (4 distinct call types) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

**All logic lives in `src/App.jsx`.** At ~15 000 lines this is intentionally a single-file PWA — no routing library, no state manager, no build complexity. The tradeoff is accepted; modularisation is a future milestone.

---

## Getting Started

### Prerequisites

- Node 18 or later
- npm 9 or later
- git

### Clone and run

```bash
git clone https://github.com/gentletom/dialled-in.git
cd dialled-in
npm install
npm run dev
```

The app will be available at `http://localhost:5173/dialled-in/`.

---

## Configuration

DIALLED IN requires an [Anthropic API key](https://console.anthropic.com/) to enable AI features (coach, micro estimation, readiness analysis). The key is **never sent to any server other than `api.anthropic.com`**.

1. Get a key at [console.anthropic.com](https://console.anthropic.com/)
2. Open the app → tap the **Settings** icon (or open the Settings drawer)
3. Paste your key in the **API Key** field and tap **Save**
4. The key is stored in `localStorage` on your device only

AI features are gracefully disabled if no key is present — the rest of the app works fully without it.

---

## Deployment

The app deploys automatically to GitHub Pages on every push to `main`.

**Pipeline:** `git push` → GitHub Actions → `npm ci` → `npm run build` → upload `dist/` → deploy to Pages.

Live URL: **[https://gentletom.github.io/dialled-in/](https://gentletom.github.io/dialled-in/)**

To deploy a fork:
1. Fork the repo
2. Enable GitHub Pages in repo Settings → Pages → Source: **GitHub Actions**
3. Push to `main`

---

## Data & Privacy

- **All data is stored on your device** in IndexedDB (meals, workouts, weight log, scores, plan)
- **No account required** — there is no user account, no email, no sign-up
- **No server** — the app is a static bundle; the only outbound network calls are to `api.anthropic.com` when you use an AI feature
- **Your API key never leaves your device** except in direct calls to Anthropic
- **Git backup is opt-in** — if you configure it, your data is committed to a GitHub repo *you own and control*
- Clearing browser storage removes all data; use the Export Backup feature to keep a copy

---

## Development Scripts

```bash
npm run dev           # local dev server (HMR)
npm run build         # production build → dist/
npm run preview       # preview production build locally
npm run lint          # ESLint (zero warnings enforced)
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier write
npm run format:check  # Prettier check (used in CI)
npm run analyze       # Bundle size visualiser
```

---

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for a full release history.

Current version: **2.2.0** (Chunk F — full audit)

---

## Contributing

This is a personal project but PRs are welcome for bug fixes. Use the PR template and make sure `npm run build` passes before opening a PR.
