# DIALLED IN — Development Guide

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 or later | 20 LTS recommended — matches CI |
| npm | 9 or later | Comes with Node |
| git | Any recent version | |

Check your versions:
```bash
node -v   # should print v18.x.x or higher
npm -v    # should print 9.x.x or higher
git --version
```

---

## First-Time Setup

```bash
# 1. Clone the repo
git clone https://github.com/gentletom/dialled-in.git
cd dialled-in

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Start the dev server
npm run dev
```

Open `http://localhost:5173/dialled-in/` in your browser.

The dev server supports Hot Module Replacement (HMR) — saves to `src/App.jsx` are reflected in the browser within ~200ms without a full page reload.

---

## Getting an Anthropic API Key

AI features (coach, micro estimation, readiness analysis) require an API key from Anthropic.

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys** in the sidebar
4. Click **Create Key**, give it a name (e.g. "dialled-in-local"), copy it
5. In the running app, open **Settings** → paste the key → **Save**

The key is stored in `localStorage` and never leaves your device except in direct calls to `api.anthropic.com`.

**Cost note:** The app uses `claude-opus-4-5`. Four AI calls per day is well within Anthropic's free tier limits for personal use.

---

## Running Locally

```bash
npm run dev          # dev server at http://localhost:5173/dialled-in/
npm run build        # production build → dist/
npm run preview      # serve the production build locally for final checks
```

### PWA behaviour in dev

The service worker is **disabled in dev mode** by default (Vite PWA plugin behaviour). To test PWA / offline behaviour, use `npm run build && npm run preview` and install from there.

---

## Making Changes Safely

**Rule: always run `npm run build` before pushing to main.**

The build catches:
- JSX syntax errors
- Missing imports
- Rollup bundling failures

CI will catch anything you miss, but a broken build blocks the deploy and requires a follow-up commit to fix.

Workflow for any change:

```bash
# 1. Make your changes to src/App.jsx (or other src files)

# 2. Check the build passes
npm run build

# 3. Verify in browser (dev server or preview)
npm run dev

# 4. Commit with a conventional message (see Git Conventions below)
git add -A
git commit -m "fix: correct macro bar percentage calculation"

# 5. Push — CI will lint, build, and deploy automatically
git push
```

---

## Git Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|---|---|
| `feat:` | New user-visible feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, dependencies, config changes |
| `refactor:` | Code restructure with no behaviour change |
| `perf:` | Performance improvement |
| `docs:` | Documentation only |
| `style:` | Formatting, whitespace (not CSS) |

For release chunks, use the established naming convention:
```
V2.3 Chunk A: brief description of what was built
```

**Branch strategy:** this is a solo project with direct pushes to `main`. For larger features, consider a short-lived feature branch:
```bash
git checkout -b chunk/v2-3-wearables
# ... work ...
git checkout main
git merge chunk/v2-3-wearables
git push
```

---

## Linting and Formatting

```bash
npm run lint          # ESLint — zero warnings enforced (CI gate)
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier — format all src files
npm run format:check  # Prettier check (used in CI)
```

**Note:** the codebase predates ESLint being added. The lint step in CI runs with `|| true` (warn-only) until the existing warnings are resolved. Once `npm run lint` exits clean, remove `|| true` from `.github/workflows/deploy.yml`.

Common warnings you will see:
- `no-unused-vars` — variables defined but not used
- `react-hooks/exhaustive-deps` — missing hook dependencies

Address these progressively as you touch each part of the code.

---

## Bundle Analysis

To see a visual breakdown of what's in the production bundle:

```bash
npm run build
npm run analyze
```

This opens a treemap in your browser showing the size of every module. Useful before shipping a chunk with new dependencies.

Current bundle strategy (defined in `vite.config.js`):
- `react` chunk — React + ReactDOM
- `charts` chunk — Recharts
- `icons` chunk — Lucide React
- `index` chunk — App code

---

## Checking CI Status

**On GitHub:**  
`https://github.com/gentletom/dialled-in/actions`

**From the command line (after a push):**
```bash
# Wait ~30s for the run to register, then:
curl -s "https://api.github.com/repos/gentletom/dialled-in/actions/runs?per_page=1" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)['workflow_runs'][0]
print(f'Status: {r[\"status\"]}  Conclusion: {r[\"conclusion\"]}  SHA: {r[\"head_sha\"][:7]}')
"
```

A successful run shows:
```
Status: completed  Conclusion: success  SHA: f480e40
```

**Deploy URL:** [https://gentletom.github.io/dialled-in/](https://gentletom.github.io/dialled-in/)

---

## Troubleshooting

### `npm install` fails with peer dependency errors
```bash
npm install --legacy-peer-deps
```
ESLint plugin ecosystem has peer dep version conflicts on npm 7+. `--legacy-peer-deps` is safe here.

### Dev server shows blank page
Check the browser console. The most common cause is a JSX syntax error in `App.jsx`. Vite will show the error in the terminal and in the browser overlay.

### Build passes locally but CI fails
Check that you haven't committed a file that's excluded by `.gitignore` (e.g. `node_modules`). Run `git status` to confirm only your intended changes are staged.

### Service worker serving stale content in production
The PWA is configured with `registerType: 'autoUpdate'`. After a deploy, the service worker updates automatically on the next page load (or after closing and reopening). Hard-reload (`Shift+Cmd+R` / `Shift+Ctrl+R`) bypasses the cache.
