import { useState, useRef, useEffect, useCallback } from "react";
import AnimatedBackground from "./AnimatedBackground";

type Tab = "travel" | "leave" | "regulation" | "eval";
type Status = "idle" | "thinking" | "searching" | "calculating" | "done" | "error";

interface FormOutput {
  form_name: string;
  filled_fields: Record<string, string>;
  missing_fields: string[];
  pdf_path: string | null;
  summary: string;
}

interface ToolCallItem {
  tool: string;
  label: string;
  result_summary: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tool_calls?: ToolCallItem[];
  form_output?: FormOutput | null;
}

interface SoldierProfile {
  name_last_first: string;
  rank: string;
  grade: string;
  ssn_last4: string;
  dod_id: string;
  unit: string;
  installation: string;
  uic: string;
  supervisor_name: string;
  supervisor_title: string;
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  ollama: boolean;
  model: string;
  vector_store_chunks: number;
  vector_store_ready: boolean;
  gsa_cache_loaded: boolean;
  offline_ready: boolean;
}

const RANKS_WITH_GRADES: { rank: string; grade: string }[] = [
  { rank: "PVT", grade: "E-1" }, { rank: "PV2", grade: "E-2" },
  { rank: "PFC", grade: "E-3" }, { rank: "SPC", grade: "E-4" },
  { rank: "CPL", grade: "E-4" }, { rank: "SGT", grade: "E-5" },
  { rank: "SSG", grade: "E-6" }, { rank: "SFC", grade: "E-7" },
  { rank: "MSG", grade: "E-8" }, { rank: "1SG", grade: "E-8" },
  { rank: "SGM", grade: "E-9" }, { rank: "CSM", grade: "E-9" },
  { rank: "2LT", grade: "O-1" }, { rank: "1LT", grade: "O-2" },
  { rank: "CPT", grade: "O-3" }, { rank: "MAJ", grade: "O-4" },
  { rank: "LTC", grade: "O-5" }, { rank: "COL", grade: "O-6" },
  { rank: "WO1", grade: "W-1" }, { rank: "CW2", grade: "W-2" },
  { rank: "CW3", grade: "W-3" }, { rank: "CW4", grade: "W-4" },
  { rank: "CW5", grade: "W-5" },
];

const INSTALLATIONS = [
  "Fort Liberty", "Fort Moore", "Fort Bragg", "Fort Hood",
  "Fort Campbell", "Fort Bliss", "Fort Drum", "Fort Stewart",
  "Fort Wainwright", "Fort Irwin", "Fort Carson", "Fort Riley",
  "Joint Base Lewis-McChord", "Fort Benning", "Fort Gordon",
];

const DEFAULT_PROFILE: SoldierProfile = {
  name_last_first: "Rivera, Maria J.", rank: "SPC", grade: "E-4",
  ssn_last4: "", dod_id: "", unit: "1-503 INF, 82nd ABN",
  installation: "Fort Liberty", uic: "", supervisor_name: "", supervisor_title: "",
};

const TAB_CONFIG: Record<Tab, { label: string; icon: string; description: string }> = {
  travel:     { label: "TDY Travel",   icon: "\u2708",       description: "Per diem, mileage, DD 1610" },
  leave:      { label: "Leave / HR",   icon: "\uD83D\uDCC4", description: "DA 31, personnel actions" },
  regulation: { label: "Regulations", icon: "\uD83D\uDCD6", description: "JTR, ARs, AFIs lookup" },
  eval:       { label: "Evaluations", icon: "\u2B50",       description: "NCOERs, OERs, counseling" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; dot: string; pulse: boolean }> = {
  idle:        { label: "READY",       color: "text-zinc-400",   dot: "bg-zinc-600",   pulse: false },
  thinking:    { label: "PROCESSING",  color: "text-navy-200",   dot: "bg-navy-300",   pulse: true  },
  searching:   { label: "SEARCHING",  color: "text-navy-200",   dot: "bg-navy-300",   pulse: true  },
  calculating: { label: "CALCULATING",color: "text-navy-200",   dot: "bg-navy-300",   pulse: true  },
  done:        { label: "COMPLETE",   color: "text-green-400",  dot: "bg-green-400",  pulse: false },
  error:       { label: "ERROR",      color: "text-red-400",    dot: "bg-red-400",    pulse: false },
};

const EXAMPLE_QUERIES: Record<Tab, { label: string; prompt: string }[]> = {
  travel: [
    { label: "TDY Planning",           prompt: "I need to plan TDY travel from Fort Liberty to San Diego for 5 days next month. What's my per diem rate and what forms do I need?" },
    { label: "Form Generation",        prompt: "Generate a completed DA Form 1610 for a 3-day TDY trip to Washington D.C. for a training conference." },
    { label: "Cross-Domain",           prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?" },
  ],
  leave: [
    { label: "Leave Workflow",         prompt: "I want to request 10 days of annual leave starting June 15th. Walk me through the approval process and any blackout dates I should know about." },
    { label: "Cross-Domain",           prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?" },
  ],
  regulation: [
    { label: "Regulation Lookup",      prompt: "What are the current Army regulations on unauthorized absence? I need citations." },
    { label: "Cross-Domain",           prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?" },
  ],
  eval: [
    { label: "Regulation Lookup",      prompt: "What are the current Army regulations on unauthorized absence? I need citations." },
    { label: "Leave Workflow",         prompt: "I want to request 10 days of annual leave starting June 15th. Walk me through the approval process and any blackout dates I should know about." },
  ],
};

/* ── Status indicator ────────────────────────────────────────────── */
function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className={`flex items-center gap-2 font-mono text-[11px] tracking-wider ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? "animate-pulse-amber" : ""}`} />
      {cfg.label}
    </div>
  );
}

/* ── Reasoning steps ─────────────────────────────────────────────── */
function ReasoningSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[11px] font-mono text-slate-400 hover:text-navy-200 transition-colors">
        <span className={`transition-transform duration-150 text-[8px] ${open ? "rotate-90" : ""}`}>▶</span>
        {open ? "HIDE" : "SHOW"} TRACE ({steps.length} STEPS)
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-navy-700 pl-3 space-y-1">
          {steps.map((s, i) => (
            <p key={i} className="text-[11px] font-mono text-slate-400 leading-relaxed whitespace-pre-wrap">{s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Message bubble ──────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded bg-navy-700 border border-navy-600 flex items-center justify-center mr-2.5 mt-0.5">
          <span className="text-[9px] font-mono font-bold text-navy-200">DL</span>
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? "" : "flex-1"}`}>
        {!isUser && (
          <>
            {msg.tool_calls && msg.tool_calls.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {msg.tool_calls.map((tc, i) => (
                  <span key={`${tc.tool}-${i}`}
                    className="text-[10px] px-2 py-0.5 rounded-sm font-mono border tracking-wide" style={{ background:"rgba(26,40,72,0.5)", color:"#93b5d8", borderColor:"rgba(74,111,168,0.3)" }}>
                    {tc.tool}
                  </span>
                ))}
              </div>
            )}
            {msg.tool_calls && msg.tool_calls.length > 0 && (
              <ReasoningSteps steps={msg.tool_calls.map(tc => `⚙ ${tc.label}\n  → ${tc.result_summary}`)} />
            )}
          </>
        )}

        <div
          className={`rounded px-4 py-3 text-sm leading-relaxed ${isUser ? "text-navy-100 rounded-br-none" : "text-zinc-200 rounded-bl-none"}`}
          style={isUser
            ? { background: "rgba(26,40,72,0.92)", border: "1px solid rgba(36,54,96,0.7)" }
            : { background: "rgba(15,19,24,0.92)", border: "1px solid rgba(26,33,48,0.8)" }}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>

          {!isUser && msg.form_output?.pdf_path && (
            <a href={msg.form_output.pdf_path} download
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] font-mono bg-navy-800 border border-navy-600 text-navy-200 hover:bg-navy-700 hover:border-navy-500 transition-all group">
              <svg className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              DOWNLOAD {msg.form_output.form_name} (PDF)
            </a>
          )}

          {!isUser && msg.form_output?.missing_fields && msg.form_output.missing_fields.length > 0 && (
            <div className="mt-2 text-[10px] font-mono text-crimson-300">
              ⚠ MISSING FIELDS: {msg.form_output.missing_fields.join(" · ")}
            </div>
          )}
        </div>

        <div className={`text-[9px] font-mono mt-1 ${isUser ? "text-right text-slate-600" : "text-slate-600"}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isUser && " · YOU"}
          {!isUser && " · DUTY LINE"}
        </div>
      </div>
    </div>
  );
}

/* ── Profile Modal ───────────────────────────────────────────────── */
function ProfileModal({ profile, onSave, onClose }: {
  profile: SoldierProfile; onSave: (p: SoldierProfile) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<SoldierProfile>({ ...profile });
  const [saving, setSaving] = useState(false);

  function handleRankChange(rank: string) {
    const grade = RANKS_WITH_GRADES.find(r => r.rank === rank)?.grade ?? "";
    setDraft(d => ({ ...d, rank, grade }));
  }

  async function handleSave() {
    if (!draft.name_last_first.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch { /* non-fatal */ } finally {
      setSaving(false); onSave(draft); onClose();
    }
  }

  const fieldCls = "w-full bg-slate-900 border border-slate-700 rounded-sm px-3 py-2 text-sm text-zinc-200 placeholder-slate-600 font-mono focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/30 transition-all";
  const labelCls = "block text-[9px] font-mono tracking-widest text-slate-500 uppercase mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md mx-4 bg-slate-800 border border-slate-600 rounded shadow-2xl max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-900">
          <div>
            <p className="text-[9px] font-mono tracking-widest text-slate-500 uppercase">Soldier Profile</p>
            <h2 className="text-sm font-semibold text-zinc-200 mt-0.5">Edit Record</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-zinc-200 hover:bg-slate-700 rounded transition-all font-mono text-xs">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Name (Last, First MI.)</label>
            <input type="text" value={draft.name_last_first} placeholder="Rivera, Maria J."
              onChange={e => setDraft(d => ({ ...d, name_last_first: e.target.value }))} className={fieldCls} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Rank</label>
              <select value={draft.rank} onChange={e => handleRankChange(e.target.value)}
                className={fieldCls}>
                {RANKS_WITH_GRADES.map(({ rank }) => <option key={rank} value={rank}>{rank}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Grade</label>
              <input type="text" value={draft.grade} readOnly
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-sm px-3 py-2 text-sm text-slate-500 font-mono cursor-not-allowed" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>SSN Last 4</label>
              <input type="password" maxLength={4} value={draft.ssn_last4} placeholder="••••"
                onChange={e => setDraft(d => ({ ...d, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>DOD ID</label>
              <input type="text" value={draft.dod_id} placeholder="Optional"
                onChange={e => setDraft(d => ({ ...d, dod_id: e.target.value }))} className={fieldCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Unit</label>
            <input type="text" value={draft.unit} placeholder="1-503 INF, 82nd ABN"
              onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} className={fieldCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Installation</label>
              <select value={draft.installation} onChange={e => setDraft(d => ({ ...d, installation: e.target.value }))}
                className={fieldCls}>
                {INSTALLATIONS.map(inst => <option key={inst} value={inst}>{inst}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>UIC</label>
              <input type="text" value={draft.uic} placeholder="Optional"
                onChange={e => setDraft(d => ({ ...d, uic: e.target.value }))} className={fieldCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Supervisor Name</label>
              <input type="text" value={draft.supervisor_name} placeholder="Optional"
                onChange={e => setDraft(d => ({ ...d, supervisor_name: e.target.value }))} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Supervisor Title</label>
              <input type="text" value={draft.supervisor_title} placeholder="Optional"
                onChange={e => setDraft(d => ({ ...d, supervisor_title: e.target.value }))} className={fieldCls} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700 bg-slate-900/50">
          <p className="text-[9px] font-mono text-slate-600">SAVED TO profile.json</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-xs font-mono text-slate-400 hover:text-zinc-200 hover:bg-slate-700 rounded-sm transition-all">CANCEL</button>
            <button onClick={handleSave} disabled={saving || !draft.name_last_first.trim()}
              className="px-4 py-1.5 text-xs font-mono bg-navy-700 text-navy-200 border border-navy-600 hover:bg-navy-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-all">
              {saving ? "SAVING..." : "SAVE RECORD"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Health dot ──────────────────────────────────────────────────── */
function HealthDot({ on }: { on: boolean | null }) {
  if (on === null) return <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />;
  return <span className={`w-1.5 h-1.5 rounded-full inline-block ${on ? "bg-green-400" : "bg-red-400"}`} />;
}

/* ── Main App ────────────────────────────────────────────────────── */
export default function App() {
  const [activeTab, setActiveTab]               = useState<Tab>("travel");
  const [status, setStatus]                     = useState<Status>("idle");
  const [messages, setMessages]                 = useState<Message[]>([]);
  const [input, setInput]                       = useState("");
  const [isStreaming, setIsStreaming]           = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profile, setProfile]                   = useState<SoldierProfile>(DEFAULT_PROFILE);
  const [health, setHealth]                     = useState<HealthStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) setHealth(await res.json());
      else setHealth(null);
    } catch { setHealth(null); }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data: SoldierProfile = await res.json();
          if (data.name_last_first) setProfile(data);
        }
      } catch { /* keep default */ }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setMessages(prev => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setStatus("thinking");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tab: activeTab }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.error) {
        setStatus("error");
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error}`, timestamp: new Date() }]);
        return;
      }

      setStatus("done");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response || "No response received.",
        timestamp: new Date(),
        tool_calls: data.tool_calls || [],
        form_output: data.form_output ?? null,
      }]);
    } catch {
      setStatus("error");
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Verify backend is running on port 8000.", timestamp: new Date() }]);
    } finally {
      setIsStreaming(false);
      setTimeout(() => setStatus(s => (s === "thinking" || s === "done" || s === "error") ? "idle" : s), 3000);
    }
  }

  async function handleClearHistory() {
    setMessages([]);
    try { await fetch("/api/chat/history", { method: "DELETE" }); } catch { /* non-fatal */ }
  }

  function handleExampleClick(prompt: string) { setInput(prompt); inputRef.current?.focus(); }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  }

  // Auto-resize textarea as user types
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const ollamaOk    = health?.ollama ?? null;
  const vectorOk    = health ? health.vector_store_chunks > 0 : null;
  const gsaOk       = health?.gsa_cache_loaded ?? null;
  const offlineMode = health?.offline_ready ?? null;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", background: "#0a0c0f", position: "relative" }}>
      <AnimatedBackground />
      {showProfileModal && (
        <ProfileModal profile={profile} onSave={setProfile} onClose={() => setShowProfileModal(false)} />
      )}

      {/* ── Top Nav Bar ── */}
      <header className="flex items-center justify-between px-5 py-0 border-b border-slate-700 h-12 flex-shrink-0" style={{ position: "relative", zIndex: 10, background: "rgba(10,12,15,0.88)", backdropFilter: "blur(8px)" }}>
        {/* Left: Logo */}
        <div className="flex items-center gap-5">
          <div className="flex flex-col leading-none select-none py-2">
            <span className="text-[13px] font-black text-navy-300 tracking-[0.14em]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}>DUTY</span>
            <div className="flex flex-col gap-[1.5px] my-[2px]">
              <div className="h-[1px] w-full" style={{ background: "linear-gradient(90deg, #243660 60%, #5c1020 100%)" }} />
              <div className="h-[1px] w-3/4 self-center bg-crimson-500" />
              <div className="h-[1px] w-full" style={{ background: "linear-gradient(90deg, #243660 60%, #5c1020 100%)" }} />
            </div>
            <span className="text-[13px] font-black text-crimson-400 tracking-[0.14em]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}>LINE</span>
          </div>

          <div className="h-6 w-px bg-slate-700" />

          {/* Tab navigation in top bar — GenAI.mil style */}
          <nav className="flex items-center h-12">
            {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`h-full px-4 text-[11px] font-mono tracking-wide border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === key
                    ? "border-crimson-500 text-zinc-200 bg-slate-900/40"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                }`}>
                <span className="text-xs">{cfg.icon}</span>
                {cfg.label.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: Status + Profile */}
        <div className="flex items-center gap-5">
          <StatusBadge status={status} />
          <div className="h-5 w-px bg-slate-700" />
          <button onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2.5 group cursor-pointer py-2">
            <div className="w-7 h-7 rounded bg-navy-800 border border-navy-700 flex items-center justify-center">
              <span className="text-[9px] font-mono font-bold text-navy-300">
                {profile.name_last_first.split(",")[0]?.slice(0, 2).toUpperCase() || "SP"}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-zinc-200 group-hover:text-navy-200 transition-colors font-medium">
                {profile.rank} {profile.name_last_first}
              </p>
              <p className="text-[10px] text-slate-400">{profile.installation} · {profile.grade}</p>
            </div>
            <span className="text-[10px] text-slate-600 group-hover:text-navy-300 transition-colors ml-1">▾</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-52 border-r border-slate-700 flex flex-col flex-shrink-0 relative scanline" style={{ position: "relative", zIndex: 10, background: "rgba(10,12,15,0.75)", backdropFilter: "blur(8px)" }}>
          <div className="p-3 relative z-10">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-3 px-1">Modules</p>
            <nav className="space-y-0.5">
              {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-left transition-all ${
                    activeTab === key
                      ? "bg-navy-800/80 text-navy-200 border-l-2 border-crimson-500 pl-2.5"
                      : "text-slate-500 hover:bg-slate-700/50 hover:text-slate-300 border-l-2 border-transparent"
                  }`}>
                  <span className="text-xs flex-shrink-0">{cfg.icon}</span>
                  <div>
                    <p className="text-[12px] font-medium">{cfg.label}</p>
                    <p className="text-[10px] text-slate-500">{cfg.description}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* System status */}
          <div className="mt-auto border-t border-slate-700 p-3 relative z-10">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-2 px-1">System</p>
            <div className="space-y-1.5 px-1">
              {[
                { dot: ollamaOk,    label: `Ollama${health?.model ? ` · ${health.model}` : ""}` },
                { dot: vectorOk,    label: `Vector${health ? ` · ${health.vector_store_chunks}` : ""}` },
                { dot: gsaOk,       label: "GSA Cache" },
                { dot: offlineMode, label: "Offline Ready" },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <HealthDot on={dot} />
                  <span className="text-[10px] text-slate-400 truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main chat area ── */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ position: "relative", zIndex: 10, background: "transparent" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {messages.length === 0 ? (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto">
                <div className="w-12 h-12 rounded border border-navy-700 flex items-center justify-center mb-5" style={{ background: "rgba(10,16,48,0.6)" }}>
                  <span className="text-2xl">{TAB_CONFIG[activeTab].icon}</span>
                </div>
                <h2 className="text-lg font-semibold text-zinc-200 tracking-wide mb-1">
                  {TAB_CONFIG[activeTab].label.toUpperCase()}
                </h2>
                <p className="text-sm text-slate-400 mb-8">
                  {TAB_CONFIG[activeTab].description.toUpperCase()}
                </p>

                <div className="w-full space-y-2">
                  <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-3">
                    — SUGGESTED QUERIES —
                  </p>
                  {EXAMPLE_QUERIES[activeTab].map(({ label, prompt }) => (
                    <button key={prompt} onClick={() => handleExampleClick(prompt)}
                      className="w-full text-left px-4 py-3 border border-slate-700 hover:border-navy-600 transition-all group rounded-sm" style={{ background: "rgba(15,19,24,0.8)", backdropFilter: "blur(4px)" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 border rounded-sm font-semibold" style={{ background:"rgba(124,24,48,0.2)", color:"#e05070", borderColor:"rgba(124,24,48,0.4)" }}>
                          {label.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[13px] text-slate-300 group-hover:text-zinc-100 transition-colors leading-relaxed">
                        {prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 max-w-3xl mx-auto">
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isStreaming && (
                  <div className="flex items-start gap-2.5 animate-fade-in">
                    <div className="w-7 h-7 rounded bg-navy-700 border border-navy-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-mono font-bold text-navy-200">DL</span>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded px-4 py-3 rounded-bl-none">
                      <div className="flex gap-1.5 items-center">
                        {[0, 200, 400].map(d => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full bg-navy-400 animate-bounce"
                            style={{ animationDelay: `${d}ms` }} />
                        ))}
                        <span className="text-[9px] font-mono text-slate-600 ml-2">PROCESSING</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Input bar ── */}
          <div className="border-t border-slate-700 px-6 pt-3 pb-4"
            style={{ background: "rgba(10,12,15,0.92)", backdropFilter: "blur(12px)" }}>
            <div className="max-w-3xl mx-auto">
              {/* Active module indicator */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[8px] font-mono tracking-widest text-slate-600 uppercase">
                  {TAB_CONFIG[activeTab].icon} {TAB_CONFIG[activeTab].label.toUpperCase()} MODULE
                </span>
                <div className="flex-1 h-px bg-slate-800" />
                {input.length > 0 && (
                  <span className="text-[8px] font-mono text-slate-600">
                    {input.length} / 2000
                  </span>
                )}
                {messages.length > 0 && (
                  <button type="button" onClick={handleClearHistory}
                    className="text-[8px] font-mono text-slate-600 hover:text-crimson-300 transition-colors px-2 py-0.5 hover:bg-crimson-900/20 rounded-sm">
                    CLR SESSION
                  </button>
                )}
              </div>

              {/* Main input container */}
              <div
                className="rounded border transition-all duration-200"
                style={{
                  background: "rgba(15,19,24,0.95)",
                  border: input.length > 0 ? "1px solid rgba(74,111,168,0.6)" : "1px solid rgba(26,33,48,0.8)",
                  boxShadow: input.length > 0 ? "0 0 0 3px rgba(36,54,96,0.15), inset 0 1px 0 rgba(255,255,255,0.02)" : "none",
                }}>
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask about ${TAB_CONFIG[activeTab].label.toLowerCase()}...`}
                  rows={2}
                  style={{
                    minHeight: "52px",
                    maxHeight: "160px",
                    height: "auto",
                    resize: "none",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "12px 14px 8px",
                    fontSize: "14px",
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    color: "#d1d5db",
                    lineHeight: "1.6",
                    caretColor: "#4a6fa8",
                  }}
                  className="placeholder-slate-600"
                />

                {/* Bottom toolbar */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono text-slate-700">
                      SHIFT+ENTER for newline
                    </span>
                    {isStreaming && (
                      <span className="flex items-center gap-1.5 text-[9px] font-mono text-navy-400 animate-pulse-amber">
                        <span className="w-1.5 h-1.5 rounded-full bg-navy-400" />
                        PROCESSING
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {input.trim() && (
                      <button type="button" onClick={() => { setInput(""); if (inputRef.current) { inputRef.current.style.height = "auto"; } }}
                        className="text-[9px] font-mono text-slate-600 hover:text-zinc-400 transition-colors px-1.5">
                        ✕
                      </button>
                    )}
                    <button
                      onClick={handleSubmit}
                      disabled={!input.trim() || isStreaming}
                      className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-mono tracking-wider transition-all rounded-sm disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: input.trim() && !isStreaming ? "rgba(26,40,72,0.9)" : "rgba(15,19,24,0.6)",
                        border: input.trim() && !isStreaming ? "1px solid rgba(74,111,168,0.5)" : "1px solid rgba(26,33,48,0.6)",
                        borderBottom: input.trim() && !isStreaming ? "2px solid rgba(124,24,48,0.8)" : "2px solid rgba(26,33,48,0.4)",
                        color: input.trim() && !isStreaming ? "#93b5d8" : "#4b5563",
                      }}
                    >
                      SEND
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[8px] font-mono text-slate-800 mt-2 text-center">
                ALL DATA STAYS LOCAL · NOT LEGAL ADVICE
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
