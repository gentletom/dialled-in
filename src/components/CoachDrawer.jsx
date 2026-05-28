import React, { useState, useEffect } from "react";
import { X, ChevronRight, Brain, Settings } from "lucide-react";
import { C, F, DAYS, SPLIT_MAP, WORKOUTS, PHASES, PLAN_CUSTOM_KEY } from "../constants";
import { getToday } from "../utils";
import { getReadinessBanner, getAvgRIRForExercise } from "../lib/scoring";
import { getPrescription, buildCoachContextExtended } from "../lib/coaching";

import { SL } from "./shared/primitives";
import { getApiKey, setApiKey, aiHeaders, getGitBackupConfig, setGitBackupConfig, pushBackupToGit, importBackup, downloadBackup, restoreFromSnapshot, getSnapshotIndex, getLastBackupInfo, daysSince, BACKUP_NAG_DAYS } from "../lib/storage";


export function NextSessionPrescriptions({ data }) {
  const [activeDay, setActiveDay] = useState(() => {
    const dIdx = new Date().getDay();
    // Default to next training day
    const upcoming = [1,2,4,5].find(d => d > dIdx) || 1;
    return SPLIT_MAP[DAYS[upcoming]] || "Upper A";
  });

  const dayTabs = [
    { label:"MON", split:"Upper A", color:C.blue },
    { label:"TUE", split:"Lower A", color:C.teal },
    { label:"THU", split:"Upper B", color:C.orange },
    { label:"FRI", split:"Lower B", color:C.purple },
  ];

  const wo = WORKOUTS[activeDay];
  const statusColor = (s) => s === "progress" ? C.lime : s === "build" ? C.teal : C.gray;
  const statusLabel = (s) => s === "progress" ? "↑ ADD WEIGHT" : s === "build" ? "BEAT REPS" : "NEW";

  const readinessBanner = getReadinessBanner(data);
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <SL>⚡ Next Session Prescriptions</SL>
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:10, marginTop:-8 }}>
        Progressive overload engine — tap any day to see what{"'"} prescribed
      </div>
      {readinessBanner && (
        <div style={{ background:readinessBanner.bg, border:`1px solid ${readinessBanner.color}40`,
          borderRadius:10, padding:"10px 14px", marginBottom:12,
          fontFamily:F.mono, fontSize:12, color:readinessBanner.color, lineHeight:1.5 }}>
          {readinessBanner.text}
        </div>
      )}

      {/* Day tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {dayTabs.map(({ label, split, color }) => {
          const isActive = activeDay === split;
          return (
            <button
              key={label}
              onClick={() => setActiveDay(split)}
              style={{
                flex:1, padding:"7px 4px",
                background: isActive ? `${color}18` : "transparent",
                border: `1px solid ${isActive ? color : C.border}`,
                borderRadius:8, cursor:"pointer",
                fontFamily:F.mono, fontSize:11, color: isActive ? color : C.gray,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Exercise prescriptions */}
      {wo && wo.exercises.map((ex, i) => {
        const rx = getPrescription(ex.name, data.workouts, ex);
        const sc = statusColor(rx.status);
        const isLast = i === wo.exercises.length - 1;

        return (
          <div
            key={i}
            style={{
              padding:"10px 0",
              borderBottom: isLast ? "none" : `1px solid ${C.border}`,
            }}
          >
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, marginRight:10 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.white, marginBottom:4 }}>{ex.name}</div>
                {/* Prescribed target */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>{ex.sets} sets ×</div>
                  {rx.prescribedWeight ? (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:sc, fontWeight:700 }}>
                      {rx.prescribedWeight} lbs × {rx.prescribedReps}
                    </div>
                  ) : (
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>set baseline</div>
                  )}
                </div>
              </div>
              {/* Status badge */}
              <div style={{
                background:`${sc}15`,
                border:`1px solid ${sc}40`,
                borderRadius:6,
                padding:"3px 8px",
                fontFamily:F.mono,
                fontSize:8,
                color:sc,
                flexShrink:0,
                alignSelf:"flex-start",
              }}>
                {statusLabel(rx.status)}
              </div>
            </div>

            {/* Last session vs target mini comparison */}
            {rx.lastWeight && (
              <div style={{ display:"flex", gap:16, marginTop:5 }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>
                  Last: <span style={{ color:C.grayMid }}>{rx.lastWeight} × {rx.lastReps}</span>
                  {rx.lastDate && <span style={{ color:C.border }}> ({rx.lastDate})</span>}
                </div>
                {rx.prescribedWeight && rx.prescribedWeight !== rx.lastWeight && (
                  <div style={{ fontFamily:F.mono, fontSize:11, color:sc }}>
                    Next: {rx.prescribedWeight} (+{rx.prescribedWeight - rx.lastWeight} lbs)
                  </div>
                )}
                {rx.prescribedWeight && rx.prescribedWeight === rx.lastWeight && (
                  <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal }}>
                    Same weight — aim for {rx.prescribedReps} reps
                  </div>
                )}
              </div>
            )}

            {/* Reasoning */}
            {rx.status === "progress" && (
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginTop:3 }}>
                ✓ You hit the top rep range last session — time to go heavier
              </div>
            )}
            {rx.status === "build" && rx.lastReps && (
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, marginTop:3 }}>
                Got {rx.lastReps} reps at {rx.lastWeight} lbs — own {ex.reps.split("-")[1] || ex.reps} reps before adding weight
              </div>
            )}
            {rx.status === "new" && (
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:3 }}>
                No history — start conservative, log it, engine calibrates from here
              </div>
            )}
            {/* C3: RIR feedback */}
            {(() => {
              const avgRIR = getAvgRIRForExercise(data, ex.name);
              if (avgRIR === null) return null;
              // RIR is on 0-3 scale: easy=3, good=2, hard=1, fail=0
              const rirColor = avgRIR > 2 ? "#FFB800" : avgRIR < 0.5 ? "#ff4444" : C.teal;
              const rirText = avgRIR > 2
                ? `Avg RIR ${avgRIR.toFixed(1)} — leaving reps in tank. Push closer to failure (target RIR 1-2).`
                : avgRIR < 0.5
                ? `Avg RIR ${avgRIR.toFixed(1)} — grinding hard. Consider a deload set or +5 lbs next session.`
                : `Avg RIR ${avgRIR.toFixed(1)} — solid effort zone.`;
              return (
                <div style={{ fontFamily:F.mono, fontSize:10, color:rirColor, marginTop:4, opacity:0.85 }}>
                  📊 {rirText}
                </div>
              );
            })()}
          </div>
        );
      })}

      <div style={{ fontFamily:F.mono, fontSize:11, color:C.border, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, lineHeight:1.6 }}>
        🧠 Prescriptions update automatically after every logged session · Double progression: own top rep range → +5 lbs upper / +10 lbs lower
      </div>
    </div>
  );
}

// ── Coach Chat ────────────────────────────────────────────────────
// ── Plan Proposal Card — inline in CoachChat (V2.1 Chunk 7) ─────────────────
function PlanProposalCard({ proposal, onAccept, onDismiss }) {
  const phaseColors = { 1:C.lime, 2:C.teal, 3:C.orange, 4:C.purple };
  const color = phaseColors[proposal.phaseId] || C.lime;
  const phaseName = PHASES.find(p => p.id === proposal.phaseId)?.name || `Phase ${proposal.phaseId}`;
  return (
    <div style={{ background:`${color}10`, border:`1px solid ${color}40`, borderRadius:10, padding:"12px 14px", marginTop:8 }}>
      <div style={{ fontFamily:F.mono, fontSize:11, color:color, letterSpacing:1.5, marginBottom:6 }}>
        📋 PROPOSED PLAN CHANGE · {phaseName.toUpperCase()}
      </div>
      <div style={{ fontFamily:F.mono, fontSize:12, color:C.white, lineHeight:1.6, marginBottom:10 }}>
        {proposal.text}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onAccept}
          style={{ flex:1, padding:"7px", background:`${color}20`, border:`1px solid ${color}`, borderRadius:8, fontFamily:F.mono, fontSize:11, color:color, cursor:"pointer", letterSpacing:1 }}>
          ✓ ADD TO PLAN
        </button>
        <button onClick={onDismiss}
          style={{ padding:"7px 12px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}>
          DISMISS
        </button>
      </div>
    </div>
  );
}

function CoachChat({ data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [dismissedProposals, setDismissedProposals] = useState(new Set());
  const messagesEndRef = React.useRef(null);

  const savePlanProposal = async (proposal) => {
    try {
      const raw = await window.storage.get(PLAN_CUSTOM_KEY);
      const planCustom = raw && raw.value ? JSON.parse(raw.value) : { baseMilestoneDone:{}, customMilestones:[], phaseNotes:{} };
      const milestone = { id:`m_${Date.now()}`, phaseId: proposal.phaseId, text: proposal.text, done: false };
      const updated = { ...planCustom, customMilestones: [...(planCustom.customMilestones || []), milestone] };
      await window.storage.set(PLAN_CUSTOM_KEY, JSON.stringify(updated));
    } catch (_e) { /* best-effort */ }
  };

  // Load chat history from storage
  useEffect(() => {
    async function load() {
      try {
        const hist = await window.storage.get("ft:chatHistory");
        if (hist) {
          const parsed = JSON.parse(hist.value);
          setMessages(parsed);
        } else {
          // Welcome message
          setMessages([{
            role:"assistant",
            content:`Hey — I'm your coach. I have full access to your training history, nutrition, PRs, and your 12-month roadmap.\n\nRight now you're ${[...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8} lbs, ${data.workouts.length} sessions logged, and Phase 1 is active. Your incline bench is stuck at 110 lbs — that's the number one thing we're fixing this phase.\n\nTell me anything: how a session felt, if you're sore, if you skipped something, if you want to adjust the plan. I'll adapt. What's on your mind?`,
            timestamp: getToday(),
          }]);
        }
      } catch (_e) { /* best-effort */ }
      setHistoryLoaded(true);
    }
    load();
  // intentional: mount-only — welcome message uses data snapshot at load time; re-running would clobber loaded chat history
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the chat to the latest message — called EXPLICITLY after real user
  // actions (send / receive / error). Not driven by useEffect on [messages], because
  // that fires on hydration (welcome message + history load) and was yanking the page
  // on every COACH tab open. block:"nearest" keeps it minimal even for real scrolls.
  function scrollChatToEnd() {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior:"smooth", block:"nearest" });
      }
    }, 50);
  }

  async function saveHistory(msgs) {
    try {
      await window.storage.set("ft:chatHistory", JSON.stringify(msgs.slice(-40)));
    } catch (_e) { /* best-effort */ }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", content:input.trim(), timestamp:getToday() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    scrollChatToEnd();
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = buildCoachContextExtended(data);

      // Build message history for API (exclude timestamps, last 20 messages)
      const apiMessages = newMessages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      if (!getApiKey()) throw new Error("No API key set. Add yours in the COACH tab under AI / API Key.");
      const controller3 = new AbortController();
      const timeoutId3 = setTimeout(() => controller3.abort(), 30000);
      let resp;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers: aiHeaders(),
          body:JSON.stringify({
            model:"claude-haiku-4-5-20251001",
            max_tokens:600,
            system: systemPrompt,
            messages: apiMessages,
          }),
          signal: controller3.signal,
        });
      } finally {
        clearTimeout(timeoutId3);
      }
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);

      const d = await resp.json();
      const text = (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("");
      const assistantMsg = { role:"assistant", content:text, timestamp:getToday() };
      const updated = [...newMessages, assistantMsg];
      setMessages(updated);
      scrollChatToEnd();
      await saveHistory(updated);
    } catch (e) {
      const isAbort = e && e.name === "AbortError";
      const errText = isAbort ? "Request timed out — check your connection and try again." : "Connection error — check your network and try again.";
      const errMsg = { role:"assistant", content:errText, timestamp:getToday() };
      const updated = [...newMessages, errMsg];
      setMessages(updated);
      scrollChatToEnd();
    }
    setLoading(false);
  }

  async function clearChat() {
    const fresh = [{
      role:"assistant",
      content:`Chat cleared. Still here — what do you need?`,
      timestamp: getToday(),
    }];
    setMessages(fresh);
    await saveHistory(fresh);
  }

  const quickPrompts = [
    "What should I focus on next session?",
    "I skipped sets today — adjust the plan",
    "My lower back is tight, modify Lower A",
    "Am I on pace for my goals?",
    "I went to failure on everything today",
    "How's my nutrition looking this week?",
  ];

  if (!historyLoaded) return null;

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden", marginBottom:12 }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, textTransform:"uppercase", letterSpacing:1.5 }}>🧠 Coach Chat</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>
            Knows your full history · {messages.length - 1} messages
          </div>
        </div>
        <button
          onClick={clearChat}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 9px", fontFamily:F.mono, fontSize:11, color:C.gray, cursor:"pointer" }}
        >
          CLEAR
        </button>
      </div>

      {/* Messages */}
      <div style={{ height:340, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((msg, i) => {
          // Parse plan proposals from assistant messages
          let displayContent = msg.content;
          let proposal = null;
          if (msg.role === "assistant") {
            const match = msg.content.match(/<PLAN_PROPOSAL>([\s\S]*?)<\/PLAN_PROPOSAL>/);
            if (match) {
              displayContent = msg.content.replace(/<PLAN_PROPOSAL>[\s\S]*?<\/PLAN_PROPOSAL>/g, "").trim();
              try { proposal = JSON.parse(match[1]); } catch (_e) { /* best-effort */ }
            }
          }
          const proposalKey = `${i}_${proposal?.text}`;
          return (
            <div key={i}>
              <div style={{ display:"flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth:"85%",
                  background: msg.role === "user" ? `${C.lime}20` : C.surfaceAlt,
                  border: `1px solid ${msg.role === "user" ? C.lime+"40" : C.border}`,
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding:"10px 12px",
                }}>
                  <div style={{
                    fontFamily:F.mono,
                    fontSize:12,
                    color: msg.role === "user" ? C.lime : C.grayLight,
                    lineHeight:1.6,
                    whiteSpace:"pre-wrap",
                  }}>
                    {displayContent}
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray, marginTop:4, textAlign:msg.role==="user"?"right":"left" }}>
                    {msg.timestamp}
                  </div>
                </div>
              </div>
              {proposal && !dismissedProposals.has(proposalKey) && (
                <PlanProposalCard
                  proposal={proposal}
                  onAccept={async () => {
                    await savePlanProposal(proposal);
                    setDismissedProposals(s => new Set([...s, proposalKey]));
                  }}
                  onDismiss={() => setDismissedProposals(s => new Set([...s, proposalKey]))}
                />
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:"14px 14px 14px 4px", padding:"10px 16px" }}>
              <div style={{ display:"flex", gap:4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.lime, opacity:0.6, animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 2 && (
        <div style={{ padding:"0 14px 10px" }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:6 }}>QUICK PROMPTS</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => setInput(p)}
                style={{ background:`${C.lime}10`, border:`1px solid ${C.lime}30`, borderRadius:20, padding:"4px 10px", fontFamily:F.mono, fontSize:11, color:C.lime, cursor:"pointer" }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:"10px 14px 14px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Tell your coach anything — deviations, injuries, questions..."
          style={{
            flex:1,
            background:"#1A1A22",
            border:`1px solid ${C.border}`,
            borderRadius:12,
            padding:"10px 14px",
            color:C.white,
            fontSize:13,
            fontFamily:F.mono,
            outline:"none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            background: input.trim() && !loading ? C.lime : C.border,
            border:"none",
            borderRadius:12,
            width:44,
            height:44,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            cursor: input.trim() && !loading ? "pointer" : "default",
            flexShrink:0,
            fontSize:18,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:0.3;transform:scale(0.8)}
          50%{opacity:1;transform:scale(1.1)}
        }
      `}</style>
    </div>
  );
}

// ── COACH Tab ─────────────────────────────────────────────────────
// ── Import Backup card (restore a downloaded backup JSON into this device) ──
function ImportBackupCard() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!window.confirm("Import this backup? It REPLACES the data currently on this device.")) {
      e.target.value = ""; return;
    }
    setBusy(true); setStatus("Reading file...");
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      setStatus("Writing data...");
      await importBackup(backup);
      setStatus("Imported — reloading...");
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setStatus("Import failed: " + ((err && err.message) || "unreadable file"));
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.teal}40`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:18 }}>📤</div>
        <SL>Import Backup</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
        Load a DIALLED IN backup .json (e.g. exported from the old artifact) onto this device. Replaces current data.
      </div>
      <label style={{ display:"block", width:"100%", boxSizing:"border-box", padding:"12px", borderRadius:10, textAlign:"center", fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: busy ? "#1A1A22" : C.teal, color: busy ? C.gray : C.white, cursor: busy ? "default" : "pointer" }}>
        {busy ? "WORKING..." : "CHOOSE BACKUP FILE"}
        <input type="file" accept="application/json,.json" onChange={onFile} disabled={busy} style={{ display:"none" }} />
      </label>
      {status && <div style={{ fontFamily:F.mono, fontSize:11, color: status.indexOf("failed") >= 0 ? C.orange : C.lime, marginTop:10 }}>{status}</div>}
    </div>
  );
}

// ── CloudBackupCard (COACH tab) — git-based daily backup setup + manual trigger ──
function CloudBackupCard() {
  const [cfg, setCfg] = useState(() => getGitBackupConfig());
  const [repoInput, setRepoInput] = useState(cfg.repo);
  const [tokenInput, setTokenInput] = useState("");
  const [auto, setAuto] = useState(cfg.auto);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  function refresh() { setCfg(getGitBackupConfig()); }

  function saveConfig() {
    setGitBackupConfig({
      repo: repoInput,
      token: tokenInput || (cfg.token ? null : ""), // null = keep existing
      auto,
    });
    setTokenInput("");
    setSaved(true);
    refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  async function runBackup() {
    setBusy(true); setStatus("Pushing to git…");
    try {
      const result = await pushBackupToGit();
      setStatus(`✓ Pushed — commit ${(result?.commit?.sha || "").slice(0,7)}`);
      refresh();
    } catch (e) {
      setStatus(`✗ ${(e && e.message) || "failed"}`);
    }
    setBusy(false);
    setTimeout(() => setStatus(""), 8000);
  }

  const hasToken = !!cfg.token;
  const maskedToken = hasToken ? `${cfg.token.slice(0,7)}…${cfg.token.slice(-4)}` : "";
  const lastAtStr = cfg.lastAt ? (() => {
    const d = new Date(cfg.lastAt);
    const diff = Date.now() - d.getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return "less than an hour ago";
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs/24)}d ago`;
  })() : "never";
  const ready = !!cfg.repo && hasToken;
  const inputStyle = { width:"100%", boxSizing:"border-box", padding:"9px 11px", background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:7, color:C.white, fontFamily:F.mono, fontSize:12, marginBottom:8 };

  return (
    <div style={{ background:C.surface, border:`1px solid ${ready ? C.lime+"40" : C.amber+"40"}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:18 }}>☁️</div>
        <SL>Cloud Backup (git)</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:11, color: ready ? C.lime : C.amber, marginBottom:10 }}>
        {ready ? `Last push: ${lastAtStr} → ${cfg.repo}` : "Not configured yet — paste repo + token below"}
      </div>

      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:3 }}>BACKUP REPO (owner/name, must be PRIVATE)</div>
      <input type="text" value={repoInput} onChange={e => setRepoInput(e.target.value)} placeholder="gentletom/dialled-in-data" style={inputStyle} />

      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1, marginBottom:3 }}>
        FINE-GRAINED PAT {hasToken ? `(${maskedToken} on device — paste new to replace)` : ""}
      </div>
      <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder={hasToken ? "leave blank to keep current" : "github_pat_..."} style={inputStyle} />

      <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, cursor:"pointer" }}>
        <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
        <span style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight }}>Auto-backup daily on app open (after 20h)</span>
      </label>

      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <button onClick={saveConfig} style={{ flex:1, padding:"10px", background: saved ? C.lime : C.teal, border:"none", color: saved ? C.dark : C.white, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:11, letterSpacing:1, cursor:"pointer" }}>
          {saved ? "✓ SAVED" : "SAVE CONFIG"}
        </button>
        <button onClick={runBackup} disabled={busy || !ready} style={{ flex:1, padding:"10px", background: ready ? (busy ? "#1A1A22" : C.lime) : "#1A1A22", border:"none", color: ready ? (busy ? C.gray : C.dark) : C.gray, borderRadius:8, fontFamily:F.mono, fontWeight:700, fontSize:11, letterSpacing:1, cursor: ready && !busy ? "pointer" : "default" }}>
          {busy ? "PUSHING…" : "BACKUP NOW"}
        </button>
      </div>
      {status && (
        <div style={{ fontFamily:F.mono, fontSize:11, color: status.startsWith("✓") ? C.lime : C.orange, marginTop:4, lineHeight:1.4 }}>{status}</div>
      )}
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginTop:10 }}>
        Push your data to a private GitHub repo via the Contents API. Pairs with your home-SSD auto-pull script for off-device safety. Token stored only on this device, never in the app code.
      </div>
    </div>
  );
}

// ── API Key settings card (lives in COACH tab) ──
function ApiKeyCard() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(""); // "" | "ok" | "fail"
  const [testError, setTestError] = useState("");

  useEffect(() => {
    const k = getApiKey();
    setHasKey(!!k);
    setMaskedKey(k ? `${k.slice(0,7)}…${k.slice(-4)}` : "");
  }, []);

  function save() {
    setApiKey(key);
    const k = getApiKey();
    setHasKey(!!k);
    setMaskedKey(k ? `${k.slice(0,7)}…${k.slice(-4)}` : "");
    setKey("");
    setSaved(true);
    setTestResult(""); setTestError("");
    setTimeout(() => setSaved(false), 2500);
  }
  function clear() {
    setApiKey("");
    setHasKey(false);
    setMaskedKey("");
    setTestResult(""); setTestError("");
  }
  async function testKey() {
    if (!getApiKey()) return;
    setTesting(true); setTestResult(""); setTestError("");
    try {
      const controller4 = new AbortController();
      const timeoutId4 = setTimeout(() => controller4.abort(), 30000);
      let r;
      try {
        r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: aiHeaders(),
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: controller4.signal,
        });
      } finally {
        clearTimeout(timeoutId4);
      }
      if (r.ok) { setTestResult("ok"); }
      else {
        const txt = await r.text().catch(() => "");
        setTestResult("fail");
        setTestError(`${r.status} ${(txt || r.statusText || "").slice(0, 120)}`);
      }
    } catch (e) {
      setTestResult("fail");
      const isAbort = e && e.name === "AbortError";
      setTestError(isAbort ? "Request timed out — check your connection and try again" : ((e && e.message) || "network error"));
    }
    setTesting(false);
    setTimeout(() => { setTestResult(""); setTestError(""); }, 10000);
  }

  const canSave = !!key.trim();
  const onDevice = hasKey && !canSave && !saved;
  const btnBg = saved ? C.lime : onDevice ? "transparent" : (canSave ? C.teal : "#1A1A22");
  const btnColor = saved ? C.dark : onDevice ? C.lime : (canSave ? C.white : C.gray);
  const btnBorder = onDevice ? `1px solid ${C.lime}` : "none";
  const btnLabel = saved ? "✓ SAVED" : onDevice ? `✓ KEY ON DEVICE (${maskedKey})` : (hasKey ? "REPLACE KEY" : "SAVE KEY");

  return (
    <div style={{ background:C.surface, border:`1px solid ${hasKey ? C.lime+"40" : C.orange+"60"}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:18 }}>🔑</div>
        <SL>AI / API Key</SL>
      </div>
      <div style={{ fontFamily:F.mono, fontSize:11, color: hasKey ? C.lime : C.orange, marginBottom:10 }}>
        {hasKey ? "Key set — AI features active" : "No key set — meal scan & coach stay off until you add one"}
      </div>
      <input
        type="password"
        value={key}
        onChange={e => setKey(e.target.value)}
        placeholder={hasKey ? "paste a new key to replace" : "sk-ant-..."}
        style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px", borderRadius:8, background:C.surfaceAlt, border:`1px solid ${C.border}`, color:C.white, fontFamily:F.mono, fontSize:12, marginBottom:10 }}
      />
      <div style={{ display:"flex", gap:8, marginBottom: hasKey ? 8 : 0 }}>
        <button onClick={save} disabled={!canSave} style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: btnBg, color: btnColor, border: btnBorder, cursor: canSave?"pointer":"default" }}>
          {btnLabel}
        </button>
        {hasKey && (
          <button onClick={clear} style={{ padding:"10px 14px", borderRadius:8, fontFamily:F.mono, fontSize:11, letterSpacing:1, background:"transparent", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer" }}>
            CLEAR
          </button>
        )}
      </div>
      {hasKey && (
        <button onClick={testKey} disabled={testing} style={{ width:"100%", padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1, background: testResult==="ok" ? C.lime : testResult==="fail" ? C.orange : "transparent", color: testResult==="ok" ? C.dark : testResult==="fail" ? C.white : C.teal, border: testResult ? "none" : `1px solid ${C.teal}`, cursor: testing?"default":"pointer" }}>
          {testing ? "TESTING..." : testResult==="ok" ? "✓ KEY WORKS — AI READY" : testResult==="fail" ? "✗ KEY FAILED" : "TEST KEY (1 call, ~5 tokens)"}
        </button>
      )}
      {testError && (
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, marginTop:6, lineHeight:1.4 }}>{testError}</div>
      )}
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginTop:10 }}>
        Your Anthropic API key is stored only on this device and sent directly to Anthropic. Get one at console.anthropic.com — usage is billed to your account.
      </div>
    </div>
  );
}

function CoachTab({ data, _updateData, onAction }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [expandedInsight, setExpandedInsight] = useState(null);



  useEffect(() => {
    async function loadCached() {
      try {
        const cached = await window.storage.get("ft:lastCoachAnalysis");
        if (cached) setLastAnalysis(JSON.parse(cached.value));
      } catch (_e) { /* best-effort */ }
    }
    loadCached();
  }, []);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      if (!getApiKey()) throw new Error("No API key set. Add yours in COACH → AI / API Key.");
      const prompt = buildCoachContextExtended(data) + `\n\nProvide a comprehensive analysis of this athlete's current state. Return ONLY valid JSON (no markdown, no prose before or after the JSON):
{
  "overallStatus": "one sentence summary of where they are",
  "insights": [
    {
      "category": "Nutrition|Training|Recovery|Progress",
      "emoji": "🥩|💪|😴|📈",
      "title": "short title",
      "detail": "2-3 sentences of specific actionable advice using their actual numbers",
      "priority": "high|medium|low",
      "adjustment": "specific change to make or null"
    }
  ],
  "nextSessionFocus": "one specific thing to prioritize in the very next workout",
  "weeklyRating": 7
}`;
      const controller5 = new AbortController();
      const timeoutId5 = setTimeout(() => controller5.abort(), 30000);
      let resp;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers: aiHeaders(),
          body:JSON.stringify({
            model:"claude-haiku-4-5-20251001",
            max_tokens:2500,
            messages:[{ role:"user", content:prompt }],
          }),
          signal: controller5.signal,
        });
      } finally {
        clearTimeout(timeoutId5);
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${(errText || resp.statusText || "").slice(0, 120)}`);
      }
      const d = await resp.json();
      const text = (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("");
      if (!text) throw new Error("Empty response from API");
      // Robust JSON extraction: strip code fences, then carve from first { to last }
      let jsonStr = text.replace(/```json|```/g,"").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      let parsed;
      try { parsed = JSON.parse(jsonStr); }
      catch (pe) { throw new Error(`Parse error: ${(pe.message || "unknown").slice(0,60)} — raw start: ${jsonStr.slice(0,80)}`); }
      const withDate = { ...parsed, analyzedAt:getToday() };
      setAnalysis(withDate);
      setLastAnalysis(withDate);
      await window.storage.set("ft:lastCoachAnalysis", JSON.stringify(withDate));
    } catch (e) {
      setAnalysis({ error: `Analysis failed — ${(e && e.message) || "unknown"}`, insights:[] });
    }
    setAnalyzing(false);
  }

  const displayAnalysis = analysis || lastAnalysis;
  const priorityColor = (p) => p === "high" ? C.orange : p === "medium" ? C.amber : C.teal;

  return (
    <div style={{ padding:"18px 16px" }}>

      {/* AI Analysis */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <SL>🧠 Snapshot Analysis</SL>
            {displayAnalysis?.analyzedAt && (
              <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:-8, marginBottom:4 }}>Last: {displayAnalysis.analyzedAt}</div>
            )}
          </div>
          <button onClick={runAnalysis} disabled={analyzing}
            style={{ background:analyzing?C.border:C.lime, border:"none", borderRadius:10, padding:"8px 14px", fontFamily:F.display, fontSize:14, color:analyzing?C.gray:C.dark, cursor:analyzing?"wait":"pointer" }}>
            {analyzing ? "ANALYZING..." : "ANALYZE NOW"}
          </button>
        </div>

        {analyzing && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime }}>Reading your sessions, meals, and progress...</div>
          </div>
        )}

        {!analyzing && displayAnalysis && !displayAnalysis.error && (
          <div>
            <div style={{ background:"#0A1100", border:`1px solid ${C.lime}30`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.6, flex:1 }}>{displayAnalysis.overallStatus}</div>
                {displayAnalysis.weeklyRating && (
                  <div style={{ textAlign:"center", marginLeft:12, flexShrink:0 }}>
                    <div style={{ fontFamily:F.display, fontSize:28, color:displayAnalysis.weeklyRating>=8?C.lime:displayAnalysis.weeklyRating>=6?C.amber:C.orange }}>{displayAnalysis.weeklyRating}</div>
                    <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>/ 10</div>
                  </div>
                )}
              </div>
            </div>
            {displayAnalysis.nextSessionFocus && (
              <div style={{ background:`${C.teal}10`, border:`1px solid ${C.teal}30`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, marginBottom:4, letterSpacing:1 }}>NEXT SESSION FOCUS</div>
                <div style={{ fontFamily:F.mono, fontSize:11, color:C.white }}>{displayAnalysis.nextSessionFocus}</div>
              </div>
            )}
            {(displayAnalysis.insights||[]).map((insight, i) => (
              <div key={i} style={{ background:C.surfaceAlt, border:`1px solid ${priorityColor(insight.priority)}30`, borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
                <div onClick={() => setExpandedInsight(expandedInsight===i?null:i)} style={{ cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:16 }}>{insight.emoji}</span>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:priorityColor(insight.priority), textTransform:"uppercase", letterSpacing:1 }}>{insight.category}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{insight.title}</div>
                    </div>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:priorityColor(insight.priority), background:`${priorityColor(insight.priority)}18`, borderRadius:5, padding:"2px 7px", flexShrink:0 }}>
                      {insight.priority}
                    </div>
                  </div>
                </div>
                {expandedInsight === i && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                    <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.7, marginBottom:insight.adjustment?10:0 }}>{insight.detail}</div>
                    {insight.adjustment && (
                      <div style={{ background:`${C.lime}10`, border:`1px solid ${C.lime}30`, borderRadius:8, padding:"6px 10px" }}>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.lime, marginBottom:2 }}>RECOMMENDED ADJUSTMENT</div>
                        <div style={{ fontFamily:F.mono, fontSize:11, color:C.white }}>{insight.adjustment}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!analyzing && !displayAnalysis && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray }}>Tap &quot;Analyze Now&quot; for a full coaching snapshot</div>
          </div>
        )}
        {!analyzing && displayAnalysis?.error && (
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.orange, padding:"12px 0" }}>{displayAnalysis.error}</div>
        )}
      </div>

      {/* Persistent Chat */}
      <CoachChat data={data} />

      {/* Settings hint — settings live in their own tab now */}
      <div onClick={() => onAction("settings")}
        style={{ background:C.surfaceAlt, border:`1px dashed ${C.border}`, borderRadius:12, padding:"12px 14px", marginTop:14, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
        <div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>UTILITIES</div>
          <div style={{ fontSize:12, color:C.white, marginTop:2 }}>API key, backup, import / export</div>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal }}>SETTINGS →</div>
      </div>

    </div>
  );
}

// ── SettingsTab ──────────────────────────────────────────────────
// New in V2.0 Chunk 6 — split the utility plumbing out of COACH so the
// coaching tab is purely coaching content. Lives here: API key, git
// backup, local snapshot backup, manual import.
function SettingsTab() {
  return (
    <div style={{ padding:"18px 16px" }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontFamily:F.display, fontSize:22, color:C.lime, letterSpacing:2 }}>SETTINGS</div>
        <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginTop:2 }}>app plumbing · keys · backups</div>
      </div>
      <CloudBackupCard />
      <ApiKeyCard />
      <BackupCard />
      <ImportBackupCard />
      <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", marginTop:18, lineHeight:1.6 }}>
        DIALLED IN · v2.0<br/>
        Personal fitness, locally stored. Your data lives on your device.<br/>
        <span style={{ color:C.teal }}>github.com/gentletom/dialled-in</span>
      </div>
    </div>
  );
}

// ── Backup & Restore Card ────────────────────────────────────────
function BackupCard() {
  const [snapshots, setSnapshots] = useState([]);
  const [lastDownload, setLastDownload] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadOk, setDownloadOk] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  async function refresh() {
    const idx = await getSnapshotIndex();
    setSnapshots(idx);
    const last = await getLastBackupInfo();
    setLastDownload(last);
  }

  useEffect(() => { refresh(); }, []);

  async function handleDownload() {
    setDownloading(true);
    setDownloadOk(false);
    try {
      const ok = await downloadBackup();
      setDownloadOk(ok);
      await refresh();
      if (ok) setTimeout(() => setDownloadOk(false), 3000);
    } catch (e) {
      alert("Backup failed: " + (e.message || "unknown error"));
    }
    setDownloading(false);
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreFromSnapshot(restoreTarget);
      // Force reload so the app re-reads from storage
      window.location.reload();
    } catch (e) {
      alert("Restore failed: " + (e.message || "unknown error"));
      setRestoring(false);
      setRestoreTarget(null);
    }
  }

  const lastDownloadAge = lastDownload ? daysSince(lastDownload.ts) : null;
  const isStale = lastDownloadAge === null || lastDownloadAge >= BACKUP_NAG_DAYS;

  return (
    <div style={{ background:C.surface, border:`1px solid ${isStale ? C.orange+"60" : C.lime+"40"}`, borderRadius:16, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:18 }}>💾</div>
          <SL>Backup & Restore</SL>
        </div>
        <div style={{ fontFamily:F.mono, fontSize:8, color:C.gray }}>auto-saves daily</div>
      </div>

      {/* Last backup status */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:C.surfaceAlt, borderRadius:8, marginBottom:10 }}>
        <div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>LAST DOWNLOAD</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color: isStale ? C.orange : C.lime, marginTop:2 }}>
            {!lastDownload ? "Never" :
              lastDownloadAge === 0 ? "Today" :
              lastDownloadAge === 1 ? "Yesterday" :
              `${lastDownloadAge} days ago`}
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, letterSpacing:1 }}>SNAPSHOTS</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.teal, marginTop:2 }}>{snapshots.length} saved</div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        style={{
          width:"100%", padding:"12px", borderRadius:10,
          fontFamily:F.mono, fontSize:11, fontWeight:700, letterSpacing:1,
          background: downloadOk ? C.lime : downloading ? "#1A1A22" : (isStale ? C.orange : C.teal),
          color: downloadOk ? C.dark : downloading ? C.gray : C.white,
          border:"none", cursor: downloading ? "default" : "pointer",
          marginBottom:10,
        }}
      >
        {downloadOk ? "✓ DOWNLOADED" : downloading ? "⏳ PREPARING..." : "📥 DOWNLOAD BACKUP NOW"}
      </button>

      <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginBottom:10 }}>
        Saves a JSON file (everything: profile, meals, weights, workouts, PRs, measurements, photos) to your phone{"'"} Downloads folder. Save it to Drive/Files for off-device safety.
      </div>

      {/* Snapshots toggle */}
      <button
        onClick={() => setShowSnapshots(!showSnapshots)}
        style={{
          width:"100%", padding:"10px", borderRadius:8,
          fontFamily:F.mono, fontSize:11, letterSpacing:1,
          background:"transparent", border:`1px solid ${C.border}`,
          color:C.gray, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center",
        }}
      >
        <span>⏮ RESTORE FROM SNAPSHOT ({snapshots.length})</span>
        <ChevronRight size={14} style={{ transform: showSnapshots ? "rotate(90deg)" : "none", transition:"transform 0.2s" }} />
      </button>

      {showSnapshots && (
        <div style={{ marginTop:10, padding:10, background:C.surfaceAlt, borderRadius:10 }}>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, marginBottom:8, lineHeight:1.5 }}>
            Tap a snapshot to roll back your data to that day. Photos are not affected.
          </div>
          {snapshots.length === 0 ? (
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.gray, textAlign:"center", padding:"12px 0" }}>No snapshots yet</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {snapshots.map((s, i) => {
                const age = daysSince(s.ts);
                const ageLabel = age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`;
                const isLatest = i === 0;
                return (
                  <button
                    key={s.date}
                    onClick={() => setRestoreTarget(s.date)}
                    disabled={isLatest}
                    style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      padding:"8px 12px", borderRadius:6,
                      background: isLatest ? C.surface : "#1A1A22",
                      border:`1px solid ${C.border}`,
                      fontFamily:F.mono, fontSize:11,
                      cursor: isLatest ? "default" : "pointer",
                      color: isLatest ? C.gray : C.white,
                    }}
                  >
                    <span>{s.date} <span style={{ color:C.gray }}>· {ageLabel}</span></span>
                    <span style={{ color: isLatest ? C.gray : C.teal, fontSize:11, letterSpacing:1 }}>
                      {isLatest ? "CURRENT" : "RESTORE →"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div onClick={() => !restoring && setRestoreTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.orange}`, borderRadius:14, padding:18, maxWidth:380, width:"100%" }}>
            <div style={{ fontFamily:F.display, fontSize:22, color:C.orange, marginBottom:8, letterSpacing:2 }}>RESTORE CONFIRM</div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.white, lineHeight:1.5, marginBottom:14 }}>
              This will replace your current data with the snapshot from <span style={{ color:C.orange, fontWeight:600 }}>{restoreTarget}</span>.
            </div>
            <div style={{ fontFamily:F.mono, fontSize:11, color:C.grayLight, lineHeight:1.5, marginBottom:14, padding:"8px 10px", background:"#1A1A22", borderRadius:6 }}>
              Replaces: meals, weights, workouts, PRs, measurements, sleep, profile.<br/>
              Keeps: photos, chat history, snapshots.<br/>
              The app will reload after restore.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setRestoreTarget(null)} disabled={restoring}
                style={{ flex:1, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:"#1A1A22", border:`1px solid ${C.border}`, color:C.gray, cursor:"pointer", letterSpacing:1 }}>
                CANCEL
              </button>
              <button onClick={handleRestore} disabled={restoring}
                style={{ flex:2, padding:"10px", borderRadius:8, fontFamily:F.mono, fontSize:11, background:C.orange, border:"none", color:C.white, cursor:"pointer", fontWeight:700, letterSpacing:1 }}>
                {restoring ? "⏳ RESTORING..." : "RESTORE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ── CoachDrawer (V2.2 Chunk A — full-screen bottom-sheet overlay) ──────────
export function CoachDrawer({ data, updateData, onAction, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, display:"flex", flexDirection:"column" }}>
      <div onClick={onClose} style={{ flex:1, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(2px)" }} />
      <div style={{ background:C.bg, borderTop:"2px solid rgba(200,255,0,0.25)", borderRadius:"20px 20px 0 0", maxHeight:"92vh", overflowY:"auto", maxWidth:480, width:"100%", margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px 6px", borderBottom:"1px solid "+C.border }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Brain size={16} color={C.lime} />
            <div style={{ fontFamily:F.display, fontSize:18, color:C.lime, letterSpacing:2 }}>COACH</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
            <X size={20} color={C.gray} />
          </button>
        </div>
        <CoachTab data={data} updateData={updateData} onAction={function(act) { onAction(act); if (act === "settings") onClose(); }} />
      </div>
    </div>
  );
}

// ── SettingsDrawer (V2.2 Chunk A — standalone settings overlay) ────────────
export function SettingsDrawer({ onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, display:"flex", flexDirection:"column" }}>
      <div onClick={onClose} style={{ flex:1, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(2px)" }} />
      <div style={{ background:C.bg, borderTop:"2px solid "+C.border, borderRadius:"20px 20px 0 0", maxHeight:"92vh", overflowY:"auto", maxWidth:480, width:"100%", margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px 6px", borderBottom:"1px solid "+C.border }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Settings size={16} color={C.gray} />
            <div style={{ fontFamily:F.display, fontSize:18, color:C.white, letterSpacing:2 }}>SETTINGS</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
            <X size={20} color={C.gray} />
          </button>
        </div>
        <SettingsTab />
      </div>
    </div>
  );
}

