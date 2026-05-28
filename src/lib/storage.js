// ── API, storage, backup, and device helpers ─────────────────────
import { getToday } from "../utils";

// ── Low-level IndexedDB wrappers ─────────────────────────────────
export async function sGet(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch (_e) {
    return fallback;
  }
}
export async function sSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch (_e) { /* best-effort */ }
}

export const API_KEY_STORAGE = "ft:anthropicApiKey";
export function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch (_e) { return ""; }
}
export function setApiKey(k) {
  try {
    if (k && k.trim()) localStorage.setItem(API_KEY_STORAGE, k.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (_e) { /* best-effort */ }
}
export function aiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": getApiKey(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// Sanitize free-text user input before injecting into AI system prompts.
export const CURRENT_DATA_VERSION = 3;

export async function runMigrations() {
  let version = 1;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) version = parseInt(JSON.parse(r.value)) || 1;
  } catch (_e) { /* best-effort */ }

  // v1 → v2: photos go from single-key to indexed multi-photo system
  if (version < 2) {
    let migrationSucceeded = false;
    try {
      // Read existing index (in case migration was partially run before)
      let progressIdx = [];
      let goalIdx = [];
      try { progressIdx = JSON.parse((await window.storage.get("ft:photoProgressIndex")).value); } catch (_e) { /* best-effort */ }
      try { goalIdx = JSON.parse((await window.storage.get("ft:photoGoalIndex")).value); } catch (_e) { /* best-effort */ }

      const existingProgressDates = new Set(progressIdx.map(p => p.date));
      const existingGoalIds = new Set(goalIdx.map(g => g.id));

      // Migrate ft:photoHistory (array of {src, date}) → progress photos
      try {
        const hist = JSON.parse((await window.storage.get("ft:photoHistory")).value);
        for (let i = 0; i < hist.length; i++) {
          const h = hist[i];
          const id = `mig${(h.date||"").replace(/-/g,"")}_${i}`;
          // De-dupe by stable id (re-running migration produces same ids)
          if (progressIdx.some(p => p.id === id)) continue;
          await window.storage.set(`ft:photo:progress:${id}`, JSON.stringify({
            id, date: h.date || getToday(), src: h.src, caption: "", weight: null, bodyFat: null,
          }));
          progressIdx.push({ id, date: h.date || getToday() });
        }
      } catch (_e) { /* best-effort */ }

      // Migrate ft:photoCurrentLatest → most recent progress photo (if not already in history)
      try {
        const cur = JSON.parse((await window.storage.get("ft:photoCurrentLatest")).value);
        if (!existingProgressDates.has(cur.date)) {
          const id = `mig_cur_${(cur.date||"").replace(/-/g,"")}`;
          if (!progressIdx.some(p => p.id === id)) {
            await window.storage.set(`ft:photo:progress:${id}`, JSON.stringify({
              id, date: cur.date || getToday(), src: cur.src, caption: "", weight: null, bodyFat: null,
            }));
            progressIdx.push({ id, date: cur.date || getToday() });
          }
        }
      } catch (_e) { /* best-effort */ }

      // Migrate ft:photoGoal → goal photo
      try {
        const goal = JSON.parse((await window.storage.get("ft:photoGoal")).value);
        const id = `mig_goal_${(goal.date||"").replace(/-/g,"") || "init"}`;
        if (!existingGoalIds.has(id)) {
          await window.storage.set(`ft:photo:goal:${id}`, JSON.stringify({
            id, date: goal.date || getToday(), src: goal.src, caption: "", weight: null, bodyFat: null,
          }));
          goalIdx.push({ id, date: goal.date || getToday() });
        }
      } catch (_e) { /* best-effort */ }

      // Sort newest first
      progressIdx.sort((a, b) => (b.date||"").localeCompare(a.date||""));
      goalIdx.sort((a, b) => (b.date||"").localeCompare(a.date||""));

      // Write indexes (new system reads from here)
      await window.storage.set("ft:photoProgressIndex", JSON.stringify(progressIdx));
      await window.storage.set("ft:photoGoalIndex", JSON.stringify(goalIdx));

      // NOTE: old keys (ft:photoCurrentLatest, ft:photoGoal, ft:photoHistory) are LEFT INTACT
      // as a safety net. They are not read by the new system.
      migrationSucceeded = true;
    } catch (e) {
      // If migration fails, version stays < 2 and we'll retry next load.
      // Migration is idempotent (uses stable ids + de-dupe) so retry is safe.
      console.warn("Photo migration failed, will retry next load:", e);
    }

    // Only stamp version on full success — failures retry
    if (migrationSucceeded) {
      try { await window.storage.set("ft:dataVersion", JSON.stringify(2)); } catch (_e) { /* best-effort */ }
    }
  }

  // v2 → v3: meals get individual entries array (so they're editable/deletable)
  // Re-read version since it may have just been bumped to 2
  let v2 = 2;
  try {
    const r = await window.storage.get("ft:dataVersion");
    if (r && r.value) v2 = parseInt(JSON.parse(r.value)) || 2;
  } catch (_e) { /* best-effort */ }

  if (v2 < 3) {
    let succeeded = false;
    try {
      const meals = await sGet("ft:meals", {});
      const migrated = {};
      for (const [date, day] of Object.entries(meals)) {
        if (!day) continue;
        // If day already has entries, leave as-is (idempotent re-run)
        if (Array.isArray(day.entries) && day.entries.length > 0) {
          migrated[date] = day;
          continue;
        }
        // Convert legacy day → single legacy entry with that day's totals
        const hasAnyMacros = (day.calories||0) + (day.protein||0) + (day.carbs||0) + (day.fat||0) > 0;
        if (!hasAnyMacros) {
          migrated[date] = { ...day, entries: [] };
          continue;
        }
        const description = Array.isArray(day.items) && day.items.length > 0
          ? day.items.join(", ")
          : "Imported entry";
        const legacyEntry = {
          id: `legacy_${date.replace(/-/g,"")}`,
          time: "00:00",
          calories: day.calories || 0,
          protein: day.protein || 0,
          carbs: day.carbs || 0,
          fat: day.fat || 0,
          description,
          legacy: true,
        };
        migrated[date] = {
          calories: day.calories || 0,
          protein: day.protein || 0,
          carbs: day.carbs || 0,
          fat: day.fat || 0,
          items: day.items || [description],
          entries: [legacyEntry],
        };
      }
      await window.storage.set("ft:meals", JSON.stringify(migrated));
      succeeded = true;
    } catch (e) {
      console.warn("Meal migration failed, will retry:", e);
    }
    if (succeeded) {
      try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch (_e) { /* best-effort */ }
    }
  } else {
    // Already at current version
    try { await window.storage.set("ft:dataVersion", JSON.stringify(CURRENT_DATA_VERSION)); } catch (_e) { /* best-effort */ }
  }
}

// ── Meal entry helpers ───────────────────────────────────────────
export function recomputeMealDay(day) {
  const entries = day?.entries || [];
  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (parseFloat(e.calories) || 0),
    protein: acc.protein + (parseFloat(e.protein) || 0),
    carbs: acc.carbs + (parseFloat(e.carbs) || 0),
    fat: acc.fat + (parseFloat(e.fat) || 0),
  }), { calories:0, protein:0, carbs:0, fat:0 });
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
    items: entries.map(e => e.description).filter(Boolean),
    entries,
  };
}

export function newEntryId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ── Auto-snapshot system (in-app safety net) ─────────────────────
// Takes a daily snapshot of core data. Keeps last N days, rotates oldest out.
// Snapshots are intentionally photo-INDEX-free (photos have their own lifecycle).
export const SNAPSHOT_RETENTION_DAYS = 14;
export const BACKUP_NAG_DAYS = 7;

export async function takeSnapshotIfNeeded() {
  const today = getToday();
  const snapKey = `ft:snapshot:${today}`;

  // Skip if today's snapshot already exists
  try {
    const existing = await window.storage.get(snapKey);
    if (existing) return false;
  } catch (_e) { /* best-effort */ } // doesn't exist, continue

  try {
    const snapshot = {
      date: today,
      ts: Date.now(),
      version: CURRENT_DATA_VERSION,
      data: {
        profile: await sGet("ft:profile", null),
        weightLog: await sGet("ft:weightLog", []),
        prs: await sGet("ft:prs", []),
        workouts: await sGet("ft:workouts", []),
        meals: await sGet("ft:meals", {}),
        measurements: await sGet("ft:measurements", []),
      },
    };

    await window.storage.set(snapKey, JSON.stringify(snapshot));

    // Update index
    let idx = [];
    try { idx = JSON.parse((await window.storage.get("ft:snapshotIndex")).value); } catch (_e) { /* best-effort */ }
    idx = idx.filter(s => s.date !== today);
    idx.unshift({ date: today, ts: Date.now() });
    idx.sort((a, b) => b.date.localeCompare(a.date));

    // Trim to retention limit
    const toRemove = idx.slice(SNAPSHOT_RETENTION_DAYS);
    idx = idx.slice(0, SNAPSHOT_RETENTION_DAYS);
    for (const old of toRemove) {
      try { await window.storage.delete(`ft:snapshot:${old.date}`); } catch (_e) { /* best-effort */ }
    }

    await window.storage.set("ft:snapshotIndex", JSON.stringify(idx));
    return true;
  } catch (e) {
    console.warn("Snapshot failed:", e);
    return false;
  }
}

export async function getSnapshotIndex() {
  try { return JSON.parse((await window.storage.get("ft:snapshotIndex")).value) || []; }
  catch { return []; }
}

export async function getSnapshot(date) {
  try { return JSON.parse((await window.storage.get(`ft:snapshot:${date}`)).value); }
  catch { return null; }
}

export async function restoreFromSnapshot(date) {
  const snap = await getSnapshot(date);
  if (!snap || !snap.data) throw new Error("Snapshot not found");
  const { data } = snap;
  // Best-effort write of all keys — use ft: prefix so sGet can read them back
  await window.storage.set("ft:profile", JSON.stringify(data.profile));
  await window.storage.set("ft:weightLog", JSON.stringify(data.weightLog));
  await window.storage.set("ft:prs", JSON.stringify(data.prs));
  await window.storage.set("ft:workouts", JSON.stringify(data.workouts));
  await window.storage.set("ft:meals", JSON.stringify(data.meals));
  await window.storage.set("ft:measurements", JSON.stringify(data.measurements));
  return true;
}

// ── Full backup (download as JSON) ────────────────────────────────
export async function generateFullBackup() {
  const progressIdx = await sGet("ft:photoProgressIndex", []);
  const goalIdx = await sGet("ft:photoGoalIndex", []);

  const progressPhotos = [];
  for (const p of progressIdx) {
    try {
      const r = await window.storage.get(`ft:photo:progress:${p.id}`);
      progressPhotos.push(JSON.parse(r.value));
    } catch (_e) { /* best-effort */ }
  }
  const goalPhotos = [];
  for (const p of goalIdx) {
    try {
      const r = await window.storage.get(`ft:photo:goal:${p.id}`);
      goalPhotos.push(JSON.parse(r.value));
    } catch (_e) { /* best-effort */ }
  }

  return {
    app: "DIALLED IN",
    version: CURRENT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: await sGet("ft:profile", null),
    weightLog: await sGet("ft:weightLog", []),
    prs: await sGet("ft:prs", []),
    workouts: await sGet("ft:workouts", []),
    meals: await sGet("ft:meals", {}),
    measurements: await sGet("ft:measurements", []),
    photos: { progress: progressPhotos, goal: goalPhotos },
  };
}


// ── Git-based data backup (V2.0) ─────────────────────────────────
// Thomas's idea: instead of cloud (Drive/Dropbox), push backups to a separate
// PRIVATE GitHub repo via the Contents API. He auto-pulls that repo to his
// home SSD (same Task Scheduler pattern as the source). Full git history of
// every backup, no extra cloud account, free, encrypted in transit.
//
// Setup (one-time, user does):
//   1) Create private repo (e.g. gentletom/dialled-in-data)
//   2) Generate fine-grained PAT scoped to that repo, Contents: Read & Write
//   3) Paste repo + PAT into the in-app "CLOUD BACKUP" card

export const GIT_BACKUP_REPO_KEY  = "ft:gitBackupRepo";   // "owner/name"
export const GIT_BACKUP_TOKEN_KEY = "ft:gitBackupToken";  // PAT
export const GIT_BACKUP_LAST_KEY  = "ft:gitBackupLast";   // ISO timestamp of last successful push
export const GIT_BACKUP_AUTO_KEY  = "ft:gitBackupAuto";   // "1" if auto-backup enabled

export function getGitBackupConfig() {
  try {
    return {
      repo: localStorage.getItem(GIT_BACKUP_REPO_KEY) || "",
      token: localStorage.getItem(GIT_BACKUP_TOKEN_KEY) || "",
      lastAt: localStorage.getItem(GIT_BACKUP_LAST_KEY) || null,
      auto: localStorage.getItem(GIT_BACKUP_AUTO_KEY) === "1",
    };
  } catch (_e) {
    return { repo: "", token: "", lastAt: null, auto: false };
  }
}

export function setGitBackupConfig({ repo, token, auto }) {
  try {
    if (repo != null) localStorage.setItem(GIT_BACKUP_REPO_KEY, (repo || "").trim());
    if (token != null) {
      if (token) localStorage.setItem(GIT_BACKUP_TOKEN_KEY, token.trim());
      else localStorage.removeItem(GIT_BACKUP_TOKEN_KEY);
    }
    if (auto != null) localStorage.setItem(GIT_BACKUP_AUTO_KEY, auto ? "1" : "0");
  } catch (_e) { /* best-effort */ }
}

// Base64-encode a UTF-8 string (browser btoa needs latin-1; we encode UTF-8 first)
export function b64utf8(str) {
  try { return btoa(unescape(encodeURIComponent(str))); }
  catch { return btoa(str); }
}

export async function pushBackupToGit() {
  const { repo, token } = getGitBackupConfig();
  if (!repo || !token) throw new Error("Cloud Backup not configured — paste repo + token in COACH first");
  if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error(`Repo must be "owner/name", got "${repo}"`);

  const backup = await generateFullBackup();
  const json = JSON.stringify(backup, null, 2);
  const content = b64utf8(json);

  const apiBase = `https://api.github.com/repos/${repo}/contents`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // Always push to current.json (overwritten). Git history maintains every version.
  const path = "current.json";
  const url = `${apiBase}/${path}`;

  // GET to retrieve the file's current sha (required to update existing file)
  let sha = null;
  try {
    const getCtrl = new AbortController();
    const getTimeout = setTimeout(() => getCtrl.abort(), 30000);
    let get;
    try {
      get = await fetch(url, { headers, signal: getCtrl.signal });
    } finally {
      clearTimeout(getTimeout);
    }
    if (get.ok) {
      const j = await get.json();
      if (j && j.sha) sha = j.sha;
    } else if (get.status !== 404) {
      // 401 = bad token; 403 = scope missing; surface explicitly
      const errText = await get.text().catch(() => "");
      throw new Error(`GET ${get.status}: ${(errText || "").slice(0, 100)}`);
    }
  } catch (e) {
    if ((e.message || "").startsWith("GET ")) throw e;
    // Network issues — let the PUT report
  }

  const body = {
    message: `Backup ${new Date().toISOString()} — ${backup.workouts?.length || 0} workouts, ${Object.keys(backup.meals || {}).length} meal days`,
    content,
    ...(sha ? { sha } : {}),
  };

  const putCtrl = new AbortController();
  const putTimeout = setTimeout(() => putCtrl.abort(), 30000);
  let put;
  try {
    put = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body), signal: putCtrl.signal });
  } finally {
    clearTimeout(putTimeout);
  }
  if (!put.ok) {
    const errText = await put.text().catch(() => "");
    throw new Error(`PUT ${put.status}: ${(errText || put.statusText || "").slice(0, 200)}`);
  }
  try { localStorage.setItem(GIT_BACKUP_LAST_KEY, new Date().toISOString()); } catch (_e) { /* best-effort */ }
  return await put.json();
}

// Auto-trigger guard: returns true if backup should fire (auto enabled + >20h since last)
export function shouldAutoBackup() {
  const cfg = getGitBackupConfig();
  if (!cfg.auto || !cfg.repo || !cfg.token) return false;
  if (!cfg.lastAt) return true;
  const last = new Date(cfg.lastAt).getTime();
  return Date.now() - last > 20 * 60 * 60 * 1000;
}

// ── Restore a full backup JSON (inverse of generateFullBackup). Used by Import + future SSD restore. ──
export async function importBackup(b) {
  if (!b || typeof b !== "object") throw new Error("not a valid backup file");
  const setk = (k, v) => window.storage.set(k, JSON.stringify(v));
  if ("profile" in b) await setk("ft:profile", b.profile);
  if ("weightLog" in b) await setk("ft:weightLog", b.weightLog || []);
  if ("prs" in b) await setk("ft:prs", b.prs || []);
  if ("workouts" in b) await setk("ft:workouts", b.workouts || []);
  if ("meals" in b) await setk("ft:meals", b.meals || {});
  if ("measurements" in b) await setk("ft:measurements", b.measurements || []);
  if ("chatHistory" in b) await setk("ft:chatHistory", b.chatHistory || []);
  if ("coachAnalyses" in b) await setk("ft:lastCoachAnalysis", b.coachAnalyses);
  const photos = b.photos || {};
  for (const type of ["progress", "goal"]) {
    const arr = Array.isArray(photos[type]) ? photos[type] : [];
    const idx = [];
    for (const p of arr) {
      if (!p || !p.id) continue;
      await window.storage.set(`ft:photo:${type}:${p.id}`, JSON.stringify(p));
      idx.push({ id: p.id, date: p.date });
    }
    await setk(type === "progress" ? "ft:photoProgressIndex" : "ft:photoGoalIndex", idx);
  }
  if ("version" in b) await setk("ft:dataVersion", b.version);
}


export function downloadJSON(obj, filename) {
  try {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 200);
    return true;
  } catch (e) {
    console.warn("Download failed:", e);
    return false;
  }
}

export async function downloadBackup() {
  const backup = await generateFullBackup();
  const filename = `dialledin_backup_${getToday()}.json`;
  const ok = downloadJSON(backup, filename);
  if (ok) {
    try { await window.storage.set("ft:lastBackupDownload", JSON.stringify({ ts: Date.now(), date: getToday() })); } catch (_e) { /* best-effort */ }
  }
  return ok;
}

export async function getLastBackupInfo() {
  try { return JSON.parse((await window.storage.get("ft:lastBackupDownload")).value); }
  catch { return null; }
}

export function daysSince(ts) {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

// ── Mobile webview detection (for file upload limitation banner) ─
// claude.ai mobile app renders artifacts in a restricted webview that blocks
// file pickers. Detect this so we can warn the user and link them to the
// browser version where uploads work.
export function detectMobileAppContext() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return null;

  // iOS: real Safari has both "Safari/" and "Version/" in UA.
  // iOS in-app webviews (WKWebView) typically lack one or both of these.
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS && (!/Safari\//.test(ua) || !/Version\//.test(ua))) {
    return "ios-webview";
  }

  // Android WebView includes "; wv)" in UA.
  if (/Android/.test(ua) && /; wv\)/.test(ua)) {
    return "android-webview";
  }

  return null;
}

// ── Image processing (downscale + compress for storage) ───────────
export async function processImageFile(file, maxDim = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Meal context for in-app AI calls ──────────────────────────────
