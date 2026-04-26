import { useState, useRef, useEffect, useCallback } from "react";

type Tab = "travel" | "leave" | "regulation" | "eval";
type Status = "idle" | "thinking" | "searching" | "calculating" | "done" | "error";

interface FormOutput {
  form_name: string;
  pdf_available: boolean;
  pdf_url: string;
  txt_summary: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tools_used?: string[];
  reasoning_steps?: string[];
  form_output?: FormOutput | null;
}

// Matches POST /api/profile spec exactly
interface SoldierProfile {
  name_last_first: string;
  rank: string;
  grade: string;
  ssn_last4: string;
  unit: string;
  installation: string;
}

// Health response shape
interface HealthStatus {
  status: "ok" | "error";
  ollama: boolean;
  vector_store_chunks: number;
  gsa_cache_loaded: boolean;
  model: string;
}

const RANKS_WITH_GRADES: { rank: string; grade: string }[] = [
  { rank: "PVT",  grade: "E-1" }, { rank: "PV2",  grade: "E-2" },
  { rank: "PFC",  grade: "E-3" }, { rank: "SPC",  grade: "E-4" },
  { rank: "CPL",  grade: "E-4" }, { rank: "SGT",  grade: "E-5" },
  { rank: "SSG",  grade: "E-6" }, { rank: "SFC",  grade: "E-7" },
  { rank: "MSG",  grade: "E-8" }, { rank: "1SG",  grade: "E-8" },
  { rank: "SGM",  grade: "E-9" }, { rank: "CSM",  grade: "E-9" },
  { rank: "2LT",  grade: "O-1" }, { rank: "1LT",  grade: "O-2" },
  { rank: "CPT",  grade: "O-3" }, { rank: "MAJ",  grade: "O-4" },
  { rank: "LTC",  grade: "O-5" }, { rank: "COL",  grade: "O-6" },
  { rank: "WO1",  grade: "W-1" }, { rank: "CW2",  grade: "W-2" },
  { rank: "CW3",  grade: "W-3" }, { rank: "CW4",  grade: "W-4" },
  { rank: "CW5",  grade: "W-5" },
];

const INSTALLATIONS = [
  "Fort Liberty", "Fort Moore", "Fort Bragg", "Fort Hood",
  "Fort Campbell", "Fort Bliss", "Fort Drum", "Fort Stewart",
  "Fort Wainwright", "Fort Irwin", "Fort Carson", "Fort Riley",
  "Joint Base Lewis-McChord", "Fort Benning", "Fort Gordon",
];

const DEFAULT_PROFILE: SoldierProfile = {
  name_last_first: "Rivera, Maria J.",
  rank: "SPC",
  grade: "E-4",
  ssn_last4: "",
  unit: "1-503 INF, 82nd ABN",
  installation: "Fort Liberty",
};

const TAB_CONFIG: Record<Tab, { label: string; icon: string; description: string }> = {
  travel:     { label: "TDY Travel",   icon: "\u2708",     description: "Plan trips, per diem, DD 1610" },
  leave:      { label: "Leave / HR",   icon: "\uD83D\uDCC4", description: "DA 31, personnel actions" },
  regulation: { label: "Regulations", icon: "\uD83D\uDCD6", description: "JTR, ARs, AFIs lookup" },
  eval:       { label: "Evaluations", icon: "\u2B50",       description: "Counseling, NCOERs, OERs" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle:        { label: "Ready",          color: "bg-zinc-600 text-zinc-300", pulse: false },
  thinking:    { label: "Thinking...",    color: "bg-crimson-700/30 text-crimson-300 border border-crimson-600/40", pulse: true },
  searching:   { label: "Searching Regs",color: "bg-navy-700/40 text-navy-300 border border-navy-500/40", pulse: true },
  calculating: { label: "Calculating",   color: "bg-crimson-700/30 text-crimson-300 border border-crimson-600/40", pulse: true },
  done:        { label: "Complete",      color: "bg-green-500/20 text-green-400 border border-green-500/30", pulse: false },
  error:       { label: "Error",         color: "bg-red-500/20 text-red-400 border border-red-500/30", pulse: false },
};

// Official Duty Line demo prompts — mapped to their primary tab
// Prompt 5 (cross-domain) appears in both travel + leave as a shared stress-test
const EXAMPLE_QUERIES: Record<Tab, { label: string; prompt: string }[]> = {
  travel: [
    {
      label: "TDY Planning",
      prompt: "I need to plan TDY travel from Fort Liberty to San Diego for 5 days next month. What's my per diem rate and what forms do I need?",
    },
    {
      label: "Form Generation",
      prompt: "Generate a completed DA Form 1610 for a 3-day TDY trip to Washington D.C. for a training conference.",
    },
    {
      label: "Cross-Domain / Stress Test",
      prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?",
    },
  ],
  leave: [
    {
      label: "Leave Workflow",
      prompt: "I want to request 10 days of annual leave starting June 15th. Walk me through the approval process and any blackout dates I should know about.",
    },
    {
      label: "Cross-Domain / Stress Test",
      prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?",
    },
  ],
  regulation: [
    {
      label: "Regulation Lookup",
      prompt: "What are the current Army regulations on unauthorized absence? I need citations.",
    },
    {
      label: "Cross-Domain / Stress Test",
      prompt: "My soldier is going on TDY but also needs to request leave the week before — what paperwork do they need and what regulations apply to both?",
    },
  ],
  eval: [
    {
      label: "Regulation Lookup",
      prompt: "What are the current Army regulations on unauthorized absence? I need citations.",
    },
    {
      label: "Leave Workflow",
      prompt: "I want to request 10 days of annual leave starting June 15th. Walk me through the approval process and any blackout dates I should know about.",
    },
  ],
};

/* ── Status Chip ─────────────────────────────────────────────────── */
function StatusChip({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.pulse ? "animate-pulse-amber" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? "bg-current" : "bg-current opacity-60"}`} />
      {cfg.label}
    </span>
  );
}

/* ── Reasoning Steps ─────────────────────────────────────────────── */
function ReasoningSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] text-navy-300 hover:text-navy-200 transition-colors font-mono"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {open ? "Hide" : "Show"} reasoning ({steps.length} steps)
      </button>
      {open && (
        <div className="mt-1.5 pl-3 border-l border-navy-700/50 space-y-0.5">
          {steps.map((s, i) => (
            <p key={i} className="text-[10px] font-mono text-zinc-500 leading-relaxed whitespace-pre-wrap">{s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Message Bubble ──────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
        isUser
          ? "bg-navy-700 text-zinc-100 rounded-br-sm"
          : "bg-slate-800 text-zinc-200 border border-slate-700 rounded-bl-sm"
      }`}>
        {!isUser && (
          <>
            {/* Tool badges */}
            {msg.tools_used && msg.tools_used.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {msg.tools_used.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-crimson-700/20 text-crimson-300 font-mono border border-crimson-700/30">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {/* Reasoning steps — collapsible */}
            {msg.reasoning_steps && msg.reasoning_steps.length > 0 && (
              <ReasoningSteps steps={msg.reasoning_steps} />
            )}
          </>
        )}

        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>

        {/* PDF download — reads form_output per spec */}
        {!isUser && msg.form_output?.pdf_available && msg.form_output.pdf_url && (
          <a
            href={msg.form_output.pdf_url}
            download
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-crimson-700/20 border border-crimson-600/40 text-crimson-300 text-xs font-medium hover:bg-crimson-700/30 hover:border-crimson-500/50 transition-all w-fit group"
          >
            <svg className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {msg.form_output.form_name} (PDF)
          </a>
        )}

        <div className={`text-[10px] mt-1.5 ${isUser ? "text-navy-400" : "text-zinc-500"}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

/* ── Profile Modal ───────────────────────────────────────────────── */
function ProfileModal({
  profile,
  onSave,
  onClose,
}: {
  profile: SoldierProfile;
  onSave: (p: SoldierProfile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SoldierProfile>({ ...profile });
  const [saving, setSaving] = useState(false);

  function handleRankChange(rank: string) {
    const grade = RANKS_WITH_GRADES.find((r) => r.rank === rank)?.grade ?? "";
    setDraft((d) => ({ ...d, rank, grade }));
  }

  async function handleSave() {
    if (!draft.name_last_first.trim()) return;
    setSaving(true);
    try {
      // POST /api/profile per spec
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch {
      // Non-fatal — profile is still saved locally
    } finally {
      setSaving(false);
      onSave(draft);
      onClose();
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={handleBackdrop}>
      <div className="w-full max-w-sm mx-4 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Edit Soldier Profile</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Saved to backend profile.json</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-slate-700 transition-all">&#x2715;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Name (Last, First MI.)</label>
            <input
              type="text"
              value={draft.name_last_first}
              onChange={(e) => setDraft((d) => ({ ...d, name_last_first: e.target.value }))}
              placeholder="Rivera, Maria J."
              className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
            />
          </div>

          {/* Rank + Grade row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Rank</label>
              <select
                value={draft.rank}
                onChange={(e) => handleRankChange(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
              >
                {RANKS_WITH_GRADES.map(({ rank }) => (
                  <option key={rank} value={rank}>{rank}</option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Grade</label>
              <input
                type="text"
                value={draft.grade}
                readOnly
                className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* SSN Last 4 */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">SSN Last 4</label>
            <input
              type="password"
              maxLength={4}
              value={draft.ssn_last4}
              onChange={(e) => setDraft((d) => ({ ...d, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="••••"
              className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Unit</label>
            <input
              type="text"
              value={draft.unit}
              onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
              placeholder="1-503 INF, 82nd ABN"
              className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
            />
          </div>

          {/* Installation */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">Installation</label>
            <select
              value={draft.installation}
              onChange={(e) => setDraft((d) => ({ ...d, installation: e.target.value }))}
              className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
            >
              {INSTALLATIONS.map((inst) => (
                <option key={inst} value={inst}>{inst}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-slate-700 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.name_last_first.trim()}
            className="px-4 py-2 rounded-md bg-navy-700 border border-navy-600/50 text-navy-200 text-xs font-medium hover:bg-navy-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar Health Dot ──────────────────────────────────────────── */
function HealthDot({ on }: { on: boolean | null }) {
  if (on === null) return <span className="w-2 h-2 rounded-full bg-zinc-600" />;
  return <span className={`w-2 h-2 rounded-full ${on ? "bg-green-400" : "bg-red-400"}`} />;
}

/* ── Main App ────────────────────────────────────────────────────── */
export default function App() {
  const [activeTab, setActiveTab]         = useState<Tab>("travel");
  const [status, setStatus]               = useState<Status>("idle");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState("");
  const [isStreaming, setIsStreaming]     = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profile, setProfile]             = useState<SoldierProfile>(DEFAULT_PROFILE);
  const [health, setHealth]               = useState<HealthStatus | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // GET /api/health on mount + every 30s
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) setHealth(await res.json());
      else setHealth(null);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  // GET /api/profile on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data: SoldierProfile = await res.json();
          if (data.name_last_first) setProfile(data);
        }
      } catch {
        // Keep default profile if backend unavailable
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStatus("thinking");
    setIsStreaming(true);

    try {
      // POST /api/chat — spec shape: {message, tab}
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tab: activeTab }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Check application-level error per spec: {response: null, error: "..."}
      if (data.error) {
        setStatus("error");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}`, timestamp: new Date(), tools_used: [] },
        ]);
        return;
      }

      setStatus("done");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "No response received.",
          timestamp: new Date(),
          tools_used: data.tools_used || [],
          reasoning_steps: data.reasoning_steps || [],
          form_output: data.form_output ?? null,
        },
      ]);
    } catch {
      setStatus("error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Make sure the backend is running on port 8000.", timestamp: new Date() },
      ]);
    } finally {
      setIsStreaming(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function handleExampleClick(query: string) {
    setInput(query);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // Derived sidebar health values
  const ollamaOk    = health?.ollama ?? null;
  const vectorOk    = health ? health.vector_store_chunks > 0 : null;
  const gsaOk       = health?.gsa_cache_loaded ?? null;
  const offlineMode = health ? !health.ollama : null;

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {showProfileModal && (
        <ProfileModal
          profile={profile}
          onSave={setProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-navy-700/40 flex items-center justify-center">
            <span className="text-crimson-300 font-bold text-sm">DL</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 tracking-wide">DUTY LINE</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">GenAI.mil</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatusChip status={status} />
          <div className="h-4 w-px bg-slate-700" />
          <button
            onClick={() => setShowProfileModal(true)}
            className="text-right group cursor-pointer"
            title="Edit soldier profile"
          >
            <p className="text-xs text-zinc-300 font-medium group-hover:text-navy-200 transition-colors">
              {profile.rank} {profile.name_last_first}
              <span className="ml-1.5 text-[10px] text-zinc-600 group-hover:text-crimson-300/60 transition-colors">&#x270E;</span>
            </p>
            <p className="text-[10px] text-zinc-500">{profile.unit} | {profile.installation}</p>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-slate-800/50 border-r border-slate-700 flex flex-col">
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2 px-2">Modules</p>
            <nav className="space-y-1">
              {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all ${
                    activeTab === key
                      ? "bg-navy-700/60 text-navy-200 border border-navy-600/50"
                      : "text-zinc-400 hover:bg-navy-800/40 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-base">{cfg.icon}</span>
                  <div>
                    <p className="text-xs font-medium">{cfg.label}</p>
                    <p className="text-[10px] text-zinc-500">{cfg.description}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Health status — wired to GET /api/health */}
          <div className="mt-auto p-3 border-t border-slate-700">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <HealthDot on={ollamaOk} />
                <span className="text-[10px] text-zinc-400">
                  Ollama {health?.model ? `(${health.model})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <HealthDot on={vectorOk} />
                <span className="text-[10px] text-zinc-400">
                  Vector Store {health ? `(${health.vector_store_chunks} chunks)` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <HealthDot on={gsaOk} />
                <span className="text-[10px] text-zinc-400">GSA Rates Cached</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <HealthDot on={offlineMode} />
                <span className="text-[10px] text-zinc-400">Offline Mode</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 px-4 py-2 bg-slate-800/30 border-b border-slate-700/50">
            {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === key
                    ? "bg-navy-700 text-navy-200"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-slate-700/30"
                }`}
              >
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-xl bg-navy-800/50 border border-navy-700/50 flex items-center justify-center mb-4">
                  <span className="text-3xl text-crimson-300/80">{TAB_CONFIG[activeTab].icon}</span>
                </div>
                <h2 className="text-lg font-semibold text-zinc-200 mb-1">{TAB_CONFIG[activeTab].label}</h2>
                <p className="text-sm text-zinc-500 mb-6">{TAB_CONFIG[activeTab].description}</p>
                <div className="w-full max-w-lg space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">Demo prompts</p>
                  {EXAMPLE_QUERIES[activeTab].map(({ label, prompt }) => (
                    <button
                      key={prompt}
                      onClick={() => handleExampleClick(prompt)}
                      className="w-full text-left px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-navy-600/50 hover:bg-slate-800 transition-all group"
                    >
                      <span className="inline-block text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded bg-crimson-700/20 text-crimson-300 border border-crimson-700/30 mb-1.5">
                        {label}
                      </span>
                      <p className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors leading-relaxed">{prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} />
                ))}
                {isStreaming && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 rounded-bl-sm">
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-crimson-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-crimson-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-crimson-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-6 py-3 bg-slate-800/30 border-t border-slate-700/50">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask about ${TAB_CONFIG[activeTab].label.toLowerCase()}...`}
                    rows={1}
                    className="w-full resize-none rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/40 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="px-4 py-2.5 rounded-lg bg-navy-700 text-navy-200 font-medium text-sm hover:bg-navy-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-navy-600/50"
                >
                  Send
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1.5 text-center">
                Shift+Enter for new line. All data stays local. Not legal advice.
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
