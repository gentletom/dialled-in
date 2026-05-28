# DIALLED IN — Architecture

**Version:** 2.2.0  
**Last updated:** 2026-05-28 (post-engineering-excellence pass)

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     USER'S DEVICE                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              PWA (React 18 + Vite)              │    │
│  │                                                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │  HOME    │  │  SCORE   │  │     FUEL     │  │    │
│  │  │ (rings + │  │ (quad    │  │ (macros +    │  │    │
│  │  │  nudges) │  │  rings + │  │  micros +    │  │    │
│  │  └──────────┘  │  trend)  │  │  history)    │  │    │
│  │                └──────────┘  └──────────────┘  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │  LIFTS   │  │  GAINS   │  │     PLAN     │  │    │
│  │  │ (session │  │ (weight  │  │ (weekly      │  │    │
│  │  │  logger) │  │  + PRs)  │  │  template)   │  │    │
│  │  └──────────┘  └──────────┘  └──────────────┘  │    │
│  │                                                 │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │  CoachDrawer (overlay FAB → slide-up)   │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  │                                                 │    │
│  │  ┌──────────────────┐  ┌──────────────────┐     │    │
│  │  │  IndexedDB       │  │  localStorage    │     │    │
│  │  │  (all user data) │  │  (API key only)  │     │    │
│  │  └──────────────────┘  └──────────────────┘     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS (AI calls only)
                         ▼
              ┌─────────────────────┐
              │  api.anthropic.com  │
              │  (Claude claude-opus-4-5)      │
              └─────────────────────┘

                         │
              ┌──────────┴──────────┐
              │  GitHub             │
              │  - Pages (hosting)  │
              │  - Actions (CI/CD)  │
              │  - Backup repo      │
              │    (user-owned,     │
              │     opt-in)         │
              └─────────────────────┘
```

---

## Module Structure

`App.jsx` was refactored from a ~8,378-line monolith into a 10-module architecture. The root shell is now 415 lines; all domain logic lives in dedicated modules.

```
src/
├── App.jsx              # Root shell (~415 lines) — state, routing, updateData closure
├── constants.js         # Colours (C), fonts (F), DAYS, SPLIT_MAP, WORKOUTS, PHASES, PILLAR_INFO
├── utils.js             # Pure utilities — getToday(), toLocalDateStr(), calc1RM()
├── main.jsx             # ReactDOM entry point
├── storage.js           # window.storage shim — IndexedDB adapter installed as side-effect
├── lib/
│   ├── scoring.js       # Pillar scoring engine (computePillar*, computeTodayScore)
│   ├── coaching.js      # AI prompt builders (buildCoachContextExtended, getPrescription)
│   ├── nutrition.js     # Meal context + macro prompt builders
│   └── storage.js       # IndexedDB adapter, git backup, snapshot restore
└── components/
    ├── ErrorBoundary.jsx
    ├── HomeTab.jsx
    ├── FuelTab.jsx       # Recharts charts — lazy-loaded via React.lazy in App.jsx
    ├── LiftsTab.jsx
    ├── ProfileTab.jsx
    ├── CoachDrawer.jsx
    ├── MealModal.jsx
    ├── WeightModal.jsx
    ├── WeeklyCheckinModal.jsx
    ├── QuadrantRings.jsx    # memo() — skips re-render if rings data unchanged
    ├── ScoreTrendChart.jsx  # memo()
    ├── PillarInfoDrawer.jsx # memo()
    └── shared/
        ├── Sheet.jsx
        ├── FInput.jsx
        └── SaveBtn.jsx
```

## Component Hierarchy

`App.jsx` is the root shell. It owns all state and the `updateData` closure; tabs receive slices via props.

```
<App>
  └── <BottomNav>                  — five-tab bar + Brain FAB
  └── <CoachDrawer>                — slide-up overlay, lazy-mounts chat
  └── <SettingsDrawer>             — slide-up overlay, API key + backup config
  └── <PillarInfoDrawer memo()>    — tap ring → pillar detail
  │
  ├── HOME tab        (HomeTab.jsx)
  │   ├── <TodayScoreCard>         — composite headline + 4 rings
  │   └── <AdaptiveNudges>         — data-driven prompt list
  │
  ├── SCORE tab
  │   ├── <QuadrantRings memo()>   — hero 4-ring radial (0-100 scale)
  │   ├── <ScoreTrendChart memo()> — 7-day trend bar chart
  │   └── <PillarBreakdown>        — per-pillar detail rows
  │
  ├── FUEL tab        (FuelTab.jsx — lazy-loaded via React.lazy)
  │   ├── <MacroBars>              — protein/carbs/fat vs target
  │   ├── <MealList>               — today's meals
  │   ├── <MealModal>              — add/edit meal (+ AI micro estimation)
  │   └── <FuelHistory>            — 7d/30d Recharts bar chart + macros/micros tabs
  │
  ├── LIFTS tab       (LiftsTab.jsx)
  │   ├── <WorkoutPicker>          — Quick / Template / Custom
  │   ├── <ActiveSession>          — live set logger + rest timer
  │   └── <ExercisePicker>         — catalogue with muscle filter + search
  │
  └── PROFILE tab     (ProfileTab.jsx)
      └── targets, backup config, measurements
```

---

## Data Model

All data is stored in IndexedDB via the adapter in `src/storage.js`. Each store has a string key (`date` for daily records, `id` for ad-hoc records).

### `meals`
```
{
  id:        string,          // uuid
  date:      string,          // "YYYY-MM-DD"
  slot:      'breakfast' | 'lunch' | 'dinner' | 'snack',
  name:      string,
  kcal:      number,
  protein:   number,          // grams
  carbs:     number,          // grams
  fat:       number,          // grams
  micros:    {                // optional; AI-estimated or user-entered
    vitaminC?: number,
    iron?:     number,
    calcium?:  number,
    // ... extensible map
  }
}
```

### `workouts`
```
{
  id:        string,          // uuid
  date:      string,          // "YYYY-MM-DD"
  name:      string,          // session name or template name
  exercises: [
    {
      name:  string,
      sets:  [
        { reps: number, weight: number, unit: 'kg' | 'lb' }
      ]
    }
  ],
  durationMin: number,
  notes:       string
}
```

### `weightLog`
```
{
  date:   string,   // "YYYY-MM-DD" (primary key)
  weight: number,   // kg
  unit:   'kg' | 'lb'
}
```

### `scores`
```
{
  date:        string,   // "YYYY-MM-DD" (primary key)
  fuel:        number,   // 0-100
  recovery:    number,   // 0-100
  lifts:       number,   // 0-100
  readiness:   number,   // 0-100
  composite:   number,   // 0-100, weighted average
  steps:       number    // raw step count (feeds ACTIVITY ring)
}
```

### `plan`
```
{
  id:      'current',   // singleton
  version: number,
  days: {
    monday:    { name: string, exercises: string[], notes: string },
    tuesday:   { ... },
    // ...
  }
}
```

### `profile` (localStorage, not IndexedDB)
```
{
  targets: {
    kcal:    number,
    protein: number,
    carbs:   number,
    fat:     number,
    steps:   number
  },
  units:     'metric' | 'imperial',
  apiKey:    string    // Anthropic key — localStorage only, never synced
}
```

---

## AI Integration

Four distinct call types, all using `claude-opus-4-5`. Each call constructs a context object from the current IndexedDB state and passes it as a structured system prompt.

### 1. Morning Readiness Analysis
- **Trigger:** tapped from HOME on first open of the day
- **Input:** last 7 days of scores, last night's sleep (if logged), weight trend
- **Output:** 2-3 sentence readiness assessment + intensity recommendation
- **Tokens:** ~800 max output

### 2. Fuel Analysis
- **Trigger:** tapped from FUEL tab
- **Input:** today's meals (macros + micros), user's targets, 7-day fuel history
- **Output:** macro gap analysis, micro flags, 2 specific meal suggestions
- **Tokens:** ~600 max output

### 3. Workout Analysis
- **Trigger:** on session completion
- **Input:** the completed session (all exercises, sets, reps, weight), last 5 sessions for the same exercises
- **Output:** volume comparison, progressive overload flags, recovery note
- **Tokens:** ~500 max output

### 4. Weekly Coach Summary (COACH drawer)
- **Trigger:** user sends a chat message
- **Input:** full 7-day history (scores, meals, workouts, weight), user's PLAN, previous chat context (last 10 turns)
- **Output:** free-form coaching response in conversational tone
- **Tokens:** 1800 max output; temperature 0.7

All calls are wrapped in a try/catch; failures surface as a toast and never crash the app. If no API key is set, the call is skipped and a friendly prompt to add a key is shown instead.

---

## Scoring System

### Four Pillars

| Pillar | Source data | Formula |
|---|---|---|
| **FUEL** | Today's kcal vs target | `min(actual/target, 1) * 100` — capped at 100. Protein weight: if protein < 80% of target, score is capped at 70. |
| **RECOVERY** | Sleep hours (manual log) + HRV if available | `(sleepHours / 8) * 0.7 + (hrv / hrv7dAvg) * 0.3 * 100` — default 50 if no data |
| **LIFTS** | Workout logged today (boolean) + volume vs 7d avg | `hasWorkout ? 60 + min((volume/avg7dVolume)*40, 40) : 0` |
| **READINESS** | Subjective 1-5 input on HOME + resting HR if available | `(subjective/5)*70 + hrBonus*30` — default 50 if no input |

### Composite Formula
```
composite = (FUEL * 0.30) + (RECOVERY * 0.25) + (LIFTS * 0.25) + (READINESS * 0.20)
```

Scores are persisted to the `scores` IndexedDB store at end-of-day (or whenever updated).

---

## Storage Strategy

| Data type | Store | Rationale |
|---|---|---|
| Meals, workouts, weight, scores, plan | IndexedDB (`di_` prefix) | Structured, queryable, large capacity |
| API key, unit preference, targets | `localStorage` | Simple key/value, survives app updates |
| App shell, assets | Service worker cache | Offline support, fast startup |
| Full data backup | Git repo (user-owned) | Survives device loss; no vendor lock-in |

The storage adapter (`src/storage.js`) wraps the IndexedDB API in Promise-based helpers (`get`, `set`, `getAll`, `delete`) so the rest of the app never touches raw IDB callbacks.

---

## Deployment Pipeline

```
Developer machine
    │
    │  git push origin main
    ▼
GitHub Actions (.github/workflows/deploy.yml)
    ├── actions/checkout@v4
    ├── actions/setup-node@v4  (Node 20, npm cache)
    ├── npm ci --legacy-peer-deps
    ├── npm run lint            (--max-warnings 0 — hard gate, blocks deploy on any warning)
    ├── npm run build           (Vite → dist/)
    ├── Report bundle sizes     (logged to Actions summary)
    ├── actions/configure-pages@v5
    └── actions/upload-pages-artifact@v3
         │
         ▼
    deploy job
         └── actions/deploy-pages@v4
                  │
                  ▼
         https://gentletom.github.io/dialled-in/
```

Build output (Vite manual chunks):
- `react-[hash].js` — React + ReactDOM
- `charts-[hash].js` — Recharts
- `icons-[hash].js` — Lucide React
- `index-[hash].js` — App code

---

## Known Limitations

1. **Sleep data is manual** — no wearable integration yet; RECOVERY pillar defaults to 50 without input.
2. **Steps are manual or estimated** — no Health/Fit API integration yet.
3. **IndexedDB is browser-local** — no cross-device sync beyond the git backup.
4. **`storage.js` and `nutrition.js` have no unit tests** — they require IndexedDB and live AI API calls respectively. Coverage thresholds are set conservatively until mocks are added.

## Roadmap Notes

- Wearable integration (Apple Health via Shortcuts, Google Fit API)
- Cross-device sync via a lightweight serverless function + encrypted blob
- Unit tests for `storage.js` (via fake-indexeddb) and `nutrition.js` (with AI mocks) — will unlock 75%+ coverage threshold
- Raise coverage thresholds to lines:75, functions:80, statements:75 once above mocks land
