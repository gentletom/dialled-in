# Changelog

All notable changes to DIALLED IN are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.2.0] — 2026-05-28

### Chunk F — Full Audit: Entries Display, Storage, Perf, Arch, UX Polish
**Commit:** `f480e40`

#### Fixed
- Entries display rendering regression from Chunk E refactor
- Storage key prefix collision — all IndexedDB stores now namespaced under `di_`
- Memoization gaps causing unnecessary re-renders across ScoreRings and FuelTab charts

#### Changed
- Architecture cleanup: extracted domain-logic hooks from App.jsx into logical sections
- UX polish pass: loading states, empty states, transition timing on drawers

---

### Chunk E — Score Redesign: All Rings 0-100, ACTIVITY Ring, Steps, Bar Trend
**Commit:** `3b7d9b5`

#### Added
- ACTIVITY pillar ring (0–100 scale) driven by steps data
- Steps counter integration on the HOME screen composite
- Bar chart trend view on the SCORE screen showing 7-day history

#### Changed
- All four pillar rings migrated from raw values to normalised 0–100 scale for visual consistency
- Composite headline score recalculated against new normalised pillar values

#### Fixed
- Micros nesting rendering bug where sub-rows could duplicate across meal slots

---

### Chunk D — Composite Headline, PillarInfoDrawer, Micros in FUEL History, Takeaway Rewrite
**Commit:** `b4b599a`

#### Added
- `PillarInfoDrawer` — tap any ring to see pillar definition, scoring formula, and today's inputs
- Micros detail rows in FUEL history (7-day and 30-day views)
- Composite headline score card on HOME with animated ring entrance

#### Changed
- Takeaway text generation prompt completely rewritten for sharper, more actionable coaching voice
- Ring tooltips now surface the pillar name and raw value on long-press

#### Fixed
- Micros extraction edge case where AI returned nested objects instead of flat key/value map

---

### Chunk C — AI Micro Estimation, QuadrantRings Hero, FUEL Chart Macro Toggle
**Commit:** `f25d727`

#### Added
- AI-powered micronutrient estimation: Claude estimates vitamins and minerals from meal description when no data is available
- QuadrantRings enlarged to full-width hero on SCORE tab
- FUEL tab bar chart: toggle between PROTEIN / CARBS / FAT macro views

#### Changed
- Micro estimation schema tightened — AI returns a fixed JSON envelope, parsed defensively

---

### Chunk B — Full FUEL Tab: Macro Bars, MICRO Section, Meal CRUD, 7/30d History
**Commit:** `79cc2e0`

#### Added
- FUEL tab fully built: macro progress bars (protein / carbs / fat vs. target)
- MICRO section: expandable micronutrient breakdown per meal
- Meal CRUD: add, edit, delete meal entries with slot assignment (breakfast / lunch / dinner / snack)
- 7-day and 30-day fuel history with bar chart visualisation
- 17 smart font and spacing fixes for mobile legibility

---

### Chunk A — Tab Restructure, CoachDrawer, FuelTab Scaffold, ProfileTab
**Commit:** `5b72803`

#### Added
- CoachDrawer: AI coach accessible via floating Brain FAB (centre bottom nav), slides up as overlay
- SettingsDrawer: settings moved out of tab into a slide-up overlay
- FUEL tab scaffolded with placeholder content
- ProfileTab with nested sub-tabs (Stats / Goals / History)

#### Changed
- Bottom navigation restructured: HOME · SCORE · FUEL · LIFTS · BRAIN(FAB)
- COACH and SETTINGS promoted from tabs to drawers to reclaim tab real-estate

---

## [2.1.0] — 2026-05-27

### Chunk 7 — Editable PLAN Tab + COACH Plan Proposals
**Commit:** `cdef2fe` · **Tag:** `v2.1.0`

#### Added
- PLAN tab: structured weekly training plan, fully editable inline
- COACH can now propose a new training plan and write it directly to the PLAN tab
- Plan version history stored in IndexedDB

---

### Chunk 6 — Exercise Catalogue
**Commit:** `768b427`

#### Added
- Rich `EXERCISE_CATALOGUE` with ~120 exercises covering all major movement patterns
- Muscle-group filter in the exercise picker modal
- Search within catalogue (client-side, instant)

---

### Chunk 5 — LIFTS Hevy Clone Pt.2: Routine Builder, Plate Calculator, Rest Timer
**Commit:** `c93cfc9`

#### Added
- Routine builder: create and save custom workout templates
- Plate calculator: enter target weight, get plate breakdown for a standard barbell
- Rest timer: configurable countdown between sets with haptic-style flash

---

### Chunk 4 — LIFTS Hevy Clone Pt.1: Day-of-Week Unlock, 3-Way Workout Picker
**Commit:** `ee8c837`

#### Added
- Day-of-week training schedule: lock/unlock days to match programme
- 3-way workout picker: Quick / Template / Custom session start flows

---

### Chunk 3 — Bug Fixes
**Commit:** `17b9588`

#### Fixed
- Score persistence edge case on midnight rollover
- COACH chat auto-scroll hijack restored after V2 tab restructure regression

---

### Chunk 2 — Tab Restructure
**Commit:** `7891acc`

#### Changed
- Full bottom-nav restructure: HOME · SCORE · LIFTS · COACH · SETTINGS

---

### Chunk 1 — QuadrantRings, Morning Framing, 7d Sparkline
**Commit:** `a33df4e`

#### Added
- QuadrantRings: four-pillar radial ring visualisation (FUEL · RECOVERY · LIFTS · READINESS)
- Morning framing card on HOME with time-of-day greeting and daily intention
- 7-day score sparkline on HOME

---

## [2.0.0] — 2026-05-26

### V2.0 — Today Score, Adaptive Nudges, Git Backup, COACH/SETTINGS Split

#### Added
- **Today Score** — composite daily wellness score card on HOME (`e771378`)
- Score persistence: daily scores saved to IndexedDB with 7-day rolling average trend arrow (`e090e87`)
- GAINS sparklines: PR trajectory, 14-day fuel trend, 7-day weight moving average (`b9f24a9`)
- Real-time PR celebration animation on GAINS tab (`dee046c`)
- Adaptive nudges on HOME: context-aware coaching prompts based on recent data patterns (`b5f05ec`)
- Git-based data backup: export your IndexedDB data as a JSON file committed to a private GitHub repo (`828acc0`)

#### Changed
- COACH tab split into COACH (AI chat) + SETTINGS (configuration) for cleaner UX (`e3624bc`)

#### Fixed
- GAINS weight chart: broken ternary causing black screen on render (`7c8f1ca`)
- ExercisePickerModal restored after being orphaned in a prior refactor (`dee046c`)

---

## [1.0.0] — 2026-05 (Initial Launch)

### V1.0 — Initial PWA Launch

#### Added
- Installable PWA (Web App Manifest + Vite PWA plugin)
- GitHub Pages deploy via GitHub Actions
- On-device Anthropic API key storage (localStorage, never leaves device)
- Four AI calls: morning readiness, workout analysis, fuel analysis, weekly coach summary
- FUEL tab: manual meal logging
- LIFTS tab: session logging with exercise, sets, reps, weight
- GAINS tab: bodyweight log + PR tracking with chart
- COACH tab: AI chat interface with full context injection
- Import / Export backup (JSON download and restore)

---

[2.2.0]: https://github.com/gentletom/dialled-in/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/gentletom/dialled-in/releases/tag/v2.1.0
[2.0.0]: https://github.com/gentletom/dialled-in/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/gentletom/dialled-in/releases/tag/v1.0.0
