import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react";

// ─── Types (match FRONTEND_API_SPEC.md) ──────────────────────────────────────

type Tab = "travel" | "leave" | "regulation" | "eval";
type AgentStatus = "idle" | "thinking" | "streaming" | "done" | "error";

interface FormOutput {
  form_name: string;
  pdf_available: boolean;
  pdf_url: string | null;
  txt_summary: string;
}

interface ChatResponse {
  response: string | null;
  tools_used: string[];
  reasoning_steps: string[];
  form_output: FormOutput | null;
  error: string | null;
}

interface HealthResponse {
  status: string;
  ollama: boolean;
  vector_store_chunks: number;
  gsa_cache_loaded: boolean;
  model: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tools_used?: string[];
  reasoning_steps?: string[];
  form_output?: FormOutput;
}

interface SoldierProfile {
  name_last_first: string;
  rank: string;
  grade: string;
  ssn_last4: string;
  unit: string;
  installation: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: "travel", label: "TDY Travel" },
  { key: "leave", label: "Leave / HR" },
  { key: "regulation", label: "Regulations" },
  { key: "eval", label: "Evaluations" },
];

const STARTERS: Record<Tab, string[]> = {
  travel: [
    "Send SPC Rivera TDY to Fort Moore, GA for 5 days starting July 10, driving POV from Fort Liberty",
    "What's the per diem for San Diego, CA?",
    "Do I need a GTC for a 2-day TDY?",
  ],
  leave: [
    "I need 10 days ordinary leave starting June 3 to visit family in Texas",
    "How many days of leave do I accrue per month?",
    "Can I take leave while on a temporary profile?",
  ],
  regulation: [
    "What does JTR say about POV mileage reimbursement?",
    "What's the receipt threshold for travel expenses?",
    "When must I file a travel voucher after returning from TDY?",
  ],
  eval: [
    "Help me write NCOER bullets for a squad leader",
    "What are the counseling requirements per AR 623-3?",
    "When is initial counseling due for a new soldier?",
  ],
};

const EMPTY_PROFILE: SoldierProfile = {
  name_last_first: "", rank: "", grade: "", ssn_last4: "", unit: "", installation: "",
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>("travel");
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<SoldierProfile>(EMPTY_PROFILE);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showReasoning, setShowReasoning] = useState<Record<string, boolean>>({});
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<SoldierProfile>(EMPTY_PROFILE);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "thinking" || status === "streaming";

  // Load health + profile on mount
  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => {});
    fetch("/api/profile").then(r => r.json()).then((p) => {
      if (p && p.name_last_first) { setProfile(p); setProfileDraft(p); }
    }).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const toggleReasoning = useCallback((id: string) => {
    setShowReasoning(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  async function saveProfile() {
    setProfile(profileDraft);
    setEditingProfile(false);
    try { await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileDraft) }); } catch {}
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages(p => [...p, { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setStatus("thinking");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tab }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: ChatResponse = await res.json();

      if (data.error) {
        setMessages(p => [...p, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${data.error}`, timestamp: new Date() }]);
        setStatus("error");
      } else {
        setMessages(p => [...p, {
          id: crypto.randomUUID(), role: "assistant", content: data.response || "—", timestamp: new Date(),
          tools_used: data.tools_used, reasoning_steps: data.reasoning_steps, form_output: data.form_output ?? undefined,
        }]);
        setStatus("done");
      }
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setMessages(p => [...p, {
        id: crypto.randomUUID(), role: "assistant", timestamp: new Date(),
        content: "Backend not reachable. Run:\n  python -m uvicorn server:app --port 8000",
      }]);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); }
  }

  const hasProfile = !!profile.name_last_first;

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-zinc-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-amber-400 font-bold text-sm font-mono bg-olive-700 px-2 py-0.5 border border-olive-600/50">DL</span>
          <span className="text-xs font-semibold text-zinc-200 tracking-wider">DUTY LINE</span>
          <span className="text-[10px] text-zinc-600 font-mono">v0.1</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 text-[11px] font-mono transition-colors ${
                tab === t.key ? "bg-olive-700 text-amber-400 border border-olive-600/50" : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${status === "idle" || status === "done" ? "bg-zinc-600" : status === "error" ? "bg-red-400" : "bg-amber-400 animate-pulse"}`} />
          <span className="text-[10px] font-mono text-zinc-500">
            {status === "idle" ? "READY" : status === "thinking" ? "REASONING" : status === "streaming" ? "RESPONDING" : status === "done" ? "DONE" : "ERROR"}
          </span>
          {hasProfile && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="text-[11px] font-mono text-zinc-400">{profile.rank} {profile.name_last_first}</span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 bg-slate-800/30 border-r border-slate-700 flex flex-col shrink-0 text-[11px] font-mono">
          <div className="p-3 space-y-4 flex-1 overflow-y-auto">
            {/* Profile */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-zinc-500 text-[10px] tracking-wider">PROFILE</span>
                <button onClick={() => { setProfileDraft(profile); setEditingProfile(!editingProfile); }} className="text-zinc-600 hover:text-zinc-400 text-[10px]">
                  {editingProfile ? "[CANCEL]" : "[EDIT]"}
                </button>
              </div>
              {editingProfile ? (
                <div className="space-y-1">
                  {(Object.keys(EMPTY_PROFILE) as (keyof SoldierProfile)[]).map(f => (
                    <input
                      key={f}
                      placeholder={f.replace(/_/g, " ")}
                      className="w-full bg-slate-800 border border-slate-700 px-2 py-1 text-[11px] text-zinc-300 focus:border-olive-600 focus:outline-none"
                      value={profileDraft[f]}
                      onChange={e => setProfileDraft({ ...profileDraft, [f]: e.target.value })}
                    />
                  ))}
                  <button onClick={saveProfile} className="w-full py-1 bg-olive-700 text-amber-400 text-[10px] border border-olive-600/50 mt-1">SAVE</button>
                </div>
              ) : hasProfile ? (
                <div className="text-zinc-500 space-y-0.5">
                  <div className="text-zinc-400">{profile.rank} {profile.name_last_first}</div>
                  <div>{profile.grade} | {profile.unit}</div>
                  <div>{profile.installation}</div>
                </div>
              ) : (
                <div className="text-zinc-600">No profile set. <button onClick={() => setEditingProfile(true)} className="text-amber-400/60 hover:text-amber-400">[SET UP]</button></div>
              )}
            </div>

            {/* Tools */}
            <div>
              <span className="text-zinc-500 text-[10px] tracking-wider">TOOLS</span>
              <div className="mt-1 space-y-0.5 text-zinc-600">
                <div className="px-1">search_regulations</div>
                <div className="px-1">get_per_diem</div>
                <div className="px-1">calculate_travel_cost</div>
                <div className="px-1">fill_form</div>
              </div>
            </div>

            {/* Docs */}
            <div>
              <span className="text-zinc-500 text-[10px] tracking-wider">LOADED DOCS</span>
              <div className="mt-1 space-y-0.5 text-zinc-600">
                <div className="px-1">JTR.pdf</div>
                <div className="px-1">ar_600_8_10.pdf</div>
                <div className="px-1">gsa_cache.json</div>
                <div className="px-1">DD_1610 / DA_31 / DA_4856</div>
              </div>
            </div>
          </div>

          {/* System health — wired to /api/health */}
          <div className="p-3 border-t border-slate-700 text-[10px] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${health?.ollama ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-zinc-500">{health?.model || "qwen2.5:7b"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${health && health.vector_store_chunks > 0 ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-zinc-500">vectorstore {health ? `(${health.vector_store_chunks})` : ""}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${health?.gsa_cache_loaded ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-zinc-500">GSA cache</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-amber-400/60">OFFLINE</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center max-w-lg mx-auto">
                <p className="text-zinc-500 text-sm mb-1">Duty Line — {TABS.find(t => t.key === tab)?.label}</p>
                <p className="text-zinc-600 text-xs mb-4">Describe a task. The agent will search regulations, calculate costs, and fill forms.</p>
                <div className="space-y-1">
                  {STARTERS[tab].map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-zinc-500 border border-slate-700/50 hover:border-slate-600 hover:text-zinc-300 bg-transparent transition-colors"
                    >{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl mx-auto">
                {messages.map(msg => (
                  <div key={msg.id}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[75%] bg-olive-700/50 border border-olive-600/30 px-3 py-2 text-sm text-zinc-200">
                          {msg.content}
                          <div className="text-[10px] text-olive-500 mt-1 text-right">
                            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[90%] space-y-2">
                        {/* Tools used */}
                        {msg.tools_used && msg.tools_used.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {msg.tools_used.map(t => (
                              <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-zinc-500">{t}</span>
                            ))}
                          </div>
                        )}

                        {/* Reasoning trace — collapsible */}
                        {msg.reasoning_steps && msg.reasoning_steps.length > 0 && (
                          <div>
                            <button
                              onClick={() => toggleReasoning(msg.id)}
                              className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                            >
                              {showReasoning[msg.id] ? "[-] hide reasoning" : `[+] show reasoning (${msg.reasoning_steps.length} steps)`}
                            </button>
                            {showReasoning[msg.id] && (
                              <div className="mt-1 bg-slate-800/40 border border-slate-700/40 px-3 py-2 font-mono text-[11px] text-zinc-500 whitespace-pre-wrap leading-relaxed">
                                {msg.reasoning_steps.join("\n")}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Response text */}
                        <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                        {/* Form output with PDF download */}
                        {msg.form_output && (
                          <div className="border border-slate-700 font-mono text-xs">
                            <div className="bg-slate-800 px-3 py-1.5 border-b border-slate-700 flex justify-between items-center">
                              <span className="text-zinc-400">FORM: {msg.form_output.form_name}</span>
                              {msg.form_output.pdf_available && msg.form_output.pdf_url && (
                                <a
                                  href={msg.form_output.pdf_url}
                                  download
                                  className="text-amber-400 hover:text-amber-300 text-[10px]"
                                >[DOWNLOAD PDF]</a>
                              )}
                            </div>
                            <div className="px-3 py-2 text-zinc-500 whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {msg.form_output.txt_summary}
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-zinc-700">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {busy && (
                  <div className="text-xs font-mono text-zinc-600">
                    {status === "thinking" ? "> reasoning..." : "> streaming response..."}
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-5 py-2.5 border-t border-slate-700/50 shrink-0">
            <form onSubmit={send} className="max-w-2xl mx-auto flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Describe your task..."
                rows={1}
                disabled={busy}
                className="flex-1 resize-none bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-olive-600 disabled:opacity-30"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                className="px-4 py-2 bg-olive-700 text-amber-400 text-sm font-mono border border-olive-600/50 hover:bg-olive-600 disabled:opacity-20 disabled:cursor-not-allowed"
              >SEND</button>
            </form>
            <p className="text-[10px] text-zinc-700 mt-1 text-center font-mono">
              shift+enter newline | all data local | not legal advice
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
