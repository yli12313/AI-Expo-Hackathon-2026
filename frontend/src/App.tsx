import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "thinking" | "tool_call" | "streaming" | "done" | "error";
type ToolName = "search_regulations" | "get_per_diem" | "calculate_travel_cost" | "fill_form";

interface ToolTrace {
  tool: ToolName;
  label: string;
  result_summary: string;
  status: "running" | "done" | "error";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  traces?: ToolTrace[];
  cost_breakdown?: CostBreakdown;
  form_output?: FormOutput;
  citations?: Citation[];
}

interface CostBreakdown {
  destination: string;
  travel_days: number;
  lodging: { nights: number; rate: number; total: number };
  meals: { days: number; daily_rate: number; first_last_rate: number; total: number };
  mileage: { mode: string; one_way_miles: number; rate_per_mile: number; total: number; note: string };
  grand_total: number;
}

interface FormOutput {
  form_name: string;
  filled_fields: Record<string, string>;
  missing_fields: string[];
  pdf_path: string | null;
  summary: string;
}

interface Citation {
  source: string;
  section: string;
  text: string;
  score: number;
}

interface SoldierProfile {
  name_last_first: string;
  rank: string;
  grade: string;
  unit: string;
  installation: string;
  supervisor_name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOOL_DISPLAY: Record<ToolName, { icon: string; label: string; color: string }> = {
  search_regulations:    { icon: "\uD83D\uDD0D", label: "Searching Regs",  color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  get_per_diem:          { icon: "\uD83D\uDCB2", label: "Per Diem Lookup", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  calculate_travel_cost: { icon: "\uD83E\uDDEE", label: "Cost Calc",      color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  fill_form:             { icon: "\uD83D\uDCCB", label: "Filling Form",   color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
};

const STATUS_DISPLAY: Record<AgentStatus, { label: string; color: string; pulse: boolean }> = {
  idle:      { label: "Ready",        color: "bg-zinc-700/50 text-zinc-400",                              pulse: false },
  thinking:  { label: "Reasoning",    color: "bg-amber-500/15 text-amber-400 border border-amber-500/25", pulse: true },
  tool_call: { label: "Tool Active",  color: "bg-blue-500/15 text-blue-400 border border-blue-500/25",    pulse: true },
  streaming: { label: "Responding",   color: "bg-green-500/15 text-green-400 border border-green-500/25", pulse: true },
  done:      { label: "Complete",     color: "bg-green-500/15 text-green-400 border border-green-500/25", pulse: false },
  error:     { label: "Error",        color: "bg-red-500/15 text-red-400 border border-red-500/25",       pulse: false },
};

const EXAMPLE_QUERIES = [
  { text: "Send SPC Rivera to Fort Moore, GA for 5 days starting July 10, driving POV from Fort Liberty", icon: "\u2708" },
  { text: "I need 10 days ordinary leave starting June 3 to visit family in Texas",                       icon: "\uD83D\uDCC4" },
  { text: "What does the JTR say about POV mileage reimbursement?",                                       icon: "\uD83D\uDCD6" },
  { text: "Is the GTC mandatory for a 2-day TDY?",                                                        icon: "\u2753" },
];

const DEFAULT_PROFILE: SoldierProfile = {
  name_last_first: "Rivera, Maria J.",
  rank: "SPC",
  grade: "E-4",
  unit: "1-503 INF, 82nd ABN DIV",
  installation: "Fort Liberty",
  supervisor_name: "SGT Johnson",
};

// ─── Components ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: AgentStatus }) {
  const s = STATUS_DISPLAY[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ${s.color} ${s.pulse ? "animate-pulse-amber" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${s.pulse ? "" : "opacity-60"}`} />
      {s.label}
    </span>
  );
}

function ToolTraceItem({ trace }: { trace: ToolTrace }) {
  const display = TOOL_DISPLAY[trace.tool];
  return (
    <div className={`animate-slide-in flex items-start gap-2 px-3 py-2 rounded-md border text-xs font-mono ${display.color} ${trace.status === "running" ? "animate-thinking" : ""}`}>
      <span className="text-sm mt-0.5 shrink-0">{display.icon}</span>
      <div className="min-w-0">
        <span className="font-semibold">{trace.label}</span>
        {trace.result_summary && (
          <p className="text-[11px] opacity-75 mt-0.5 truncate">{trace.result_summary}</p>
        )}
      </div>
      {trace.status === "running" && (
        <div className="ml-auto flex gap-0.5 items-center shrink-0">
          <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      )}
      {trace.status === "done" && <span className="ml-auto text-green-400 shrink-0">OK</span>}
    </div>
  );
}

function CostTable({ cost }: { cost: CostBreakdown }) {
  return (
    <div className="animate-fade-in rounded-lg border border-slate-700 overflow-hidden mt-3">
      <div className="bg-olive-800/50 px-4 py-2 border-b border-slate-700">
        <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">TDY Cost Estimate - {cost.destination}</h3>
        <p className="text-[10px] text-zinc-500">{cost.travel_days} days | {cost.mileage.mode}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-zinc-500 tracking-wider">
            <th className="text-left px-4 py-2">Item</th>
            <th className="text-right px-4 py-2">Rate</th>
            <th className="text-right px-4 py-2">Qty</th>
            <th className="text-right px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          <tr className="border-t border-slate-700/50">
            <td className="px-4 py-1.5">Lodging</td>
            <td className="text-right px-4">${cost.lodging.rate}/night</td>
            <td className="text-right px-4">{cost.lodging.nights} nights</td>
            <td className="text-right px-4 font-mono">${cost.lodging.total.toFixed(2)}</td>
          </tr>
          <tr className="border-t border-slate-700/50">
            <td className="px-4 py-1.5">M&IE (full days)</td>
            <td className="text-right px-4">${cost.meals.daily_rate}/day</td>
            <td className="text-right px-4">{Math.max(0, cost.meals.days - 2)} days</td>
            <td className="text-right px-4 font-mono">${(cost.meals.total - cost.meals.first_last_rate * 2).toFixed(2)}</td>
          </tr>
          <tr className="border-t border-slate-700/50">
            <td className="px-4 py-1.5">
              M&IE (travel days)
              <span className="text-[10px] text-zinc-500 ml-1">75% per JTR</span>
            </td>
            <td className="text-right px-4">${cost.meals.first_last_rate}/day</td>
            <td className="text-right px-4">2 days</td>
            <td className="text-right px-4 font-mono">${(cost.meals.first_last_rate * 2).toFixed(2)}</td>
          </tr>
          {cost.mileage.total > 0 && (
            <tr className="border-t border-slate-700/50">
              <td className="px-4 py-1.5">Mileage (POV)</td>
              <td className="text-right px-4">${cost.mileage.rate_per_mile}/mi</td>
              <td className="text-right px-4">{cost.mileage.one_way_miles} mi x 2</td>
              <td className="text-right px-4 font-mono">${cost.mileage.total.toFixed(2)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-amber-500/30 bg-olive-800/30">
            <td colSpan={3} className="px-4 py-2 font-semibold text-amber-400">Total Estimate</td>
            <td className="text-right px-4 py-2 font-bold font-mono text-amber-400 text-base">${cost.grand_total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div className="animate-fade-in rounded border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-blue-400">{citation.source}</span>
        <span className="text-zinc-500 font-mono">{(citation.score * 100).toFixed(0)}% match</span>
      </div>
      <p className="text-[10px] text-amber-400/80 mb-1">{citation.section}</p>
      <p className="text-zinc-400 leading-relaxed">{citation.text.slice(0, 200)}...</p>
    </div>
  );
}

function FormPreview({ form }: { form: FormOutput }) {
  return (
    <div className="animate-fade-in rounded-lg border border-slate-700 overflow-hidden mt-3">
      <div className="bg-olive-800/50 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">{form.form_name}</h3>
          <p className="text-[10px] text-zinc-500">{Object.keys(form.filled_fields).length} fields filled</p>
        </div>
        {form.pdf_path && (
          <a
            href={form.pdf_path}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded bg-olive-700 text-amber-400 text-xs font-medium border border-olive-600/50 hover:bg-olive-600 transition-all"
          >
            Download PDF
          </a>
        )}
      </div>
      <div className="px-4 py-3 space-y-1 max-h-48 overflow-y-auto">
        {Object.entries(form.filled_fields).map(([field, value]) => (
          <div key={field} className="flex text-xs">
            <span className="text-zinc-500 w-40 shrink-0 font-mono">{field}</span>
            <span className="text-zinc-300">{value}</span>
          </div>
        ))}
      </div>
      {form.missing_fields.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/5 border-t border-amber-500/20">
          <p className="text-[10px] text-amber-400 font-semibold mb-1">MISSING FIELDS</p>
          <div className="flex flex-wrap gap-1">
            {form.missing_fields.map((f) => (
              <span key={f} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full max-w-2xl"}`}>
        <div className={`rounded-lg px-4 py-3 ${
          isUser
            ? "bg-olive-700/80 text-zinc-100 rounded-br-sm border border-olive-600/30"
            : "bg-slate-800/80 text-zinc-200 border border-slate-700/50 rounded-bl-sm"
        }`}>
          {/* Tool traces */}
          {!isUser && msg.traces && msg.traces.length > 0 && (
            <div className="space-y-1.5 mb-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Agent Reasoning</p>
              {msg.traces.map((t, i) => <ToolTraceItem key={i} trace={t} />)}
            </div>
          )}

          {/* Main content */}
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>

          {/* Cost breakdown */}
          {msg.cost_breakdown && <CostTable cost={msg.cost_breakdown} />}

          {/* Citations */}
          {msg.citations && msg.citations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Sources</p>
              {msg.citations.map((c, i) => <CitationCard key={i} citation={c} />)}
            </div>
          )}

          {/* Form output */}
          {msg.form_output && <FormPreview form={msg.form_output} />}
        </div>
        <div className={`text-[10px] mt-1 px-1 ${isUser ? "text-right text-olive-600" : "text-zinc-600"}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({ profile, onEdit }: { profile: SoldierProfile; onEdit: (p: SoldierProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);

  function save() {
    onEdit(draft);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Soldier Profile</p>
          <button onClick={() => setEditing(true)} className="text-[10px] text-amber-400 hover:text-amber-300">Edit</button>
        </div>
        <div className="bg-slate-800/50 rounded-md border border-slate-700/50 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-olive-700 flex items-center justify-center text-amber-400 text-[10px] font-bold">
              {profile.rank}
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-200">{profile.name_last_first}</p>
              <p className="text-[10px] text-zinc-500">{profile.grade} | {profile.rank}</p>
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 space-y-0.5 pl-9">
            <p>{profile.unit}</p>
            <p>{profile.installation}</p>
            <p>Supervisor: {profile.supervisor_name}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Edit Profile</p>
      {(["name_last_first", "rank", "grade", "unit", "installation", "supervisor_name"] as const).map((field) => (
        <div key={field}>
          <label className="text-[10px] text-zinc-500 block mb-0.5">{field.replace(/_/g, " ")}</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-olive-600 focus:outline-none"
            value={draft[field]}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={save} className="flex-1 py-1 rounded bg-olive-700 text-amber-400 text-xs font-medium border border-olive-600/50">Save</button>
        <button onClick={() => setEditing(false)} className="flex-1 py-1 rounded bg-slate-700 text-zinc-400 text-xs border border-slate-600">Cancel</button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<SoldierProfile>(DEFAULT_PROFILE);
  const [systemHealth, setSystemHealth] = useState({
    ollama: true,
    vectorstore: true,
    gsa_cache: true,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load real health status from backend on mount
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setSystemHealth({
        ollama:      !!d.ollama,
        vectorstore: !!d.vector_store_ready,
        gsa_cache:   !!d.gsa_cache_loaded,
      }))
      .catch(() => setSystemHealth({ ollama: false, vectorstore: false, gsa_cache: false }));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isActive = status !== "idle" && status !== "done" && status !== "error";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isActive) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStatus("thinking");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          profile,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const traces: ToolTrace[] = (data.tool_calls || []).map((tc: { tool: ToolName; label: string; result_summary: string }) => ({
        tool: tc.tool,
        label: tc.label,
        result_summary: tc.result_summary,
        status: "done" as const,
      }));

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "No response received.",
        timestamp: new Date(),
        traces,
        cost_breakdown: data.cost_breakdown || undefined,
        form_output: data.form_output || undefined,
        citations: data.citations || undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Connection error. Ensure the backend is running:\n\n  python3 -m uvicorn app:app --reload --port 8000",
          timestamp: new Date(),
        },
      ]);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-olive-700 flex items-center justify-center border border-olive-600/50">
            <span className="text-amber-400 font-bold text-sm tracking-tight">DL</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 tracking-wider">DUTY LINE</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em]">GenAI.mil | Offline Military Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatusChip status={status} />
          <div className="h-5 w-px bg-slate-700" />
          <div className="text-right">
            <p className="text-xs text-zinc-300 font-medium">{profile.rank} {profile.name_last_first}</p>
            <p className="text-[10px] text-zinc-500">{profile.unit}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ────────────────────────────────────────── */}
        <aside className="w-60 bg-slate-800/40 border-r border-slate-700 flex flex-col overflow-y-auto">
          <div className="p-3 space-y-4 flex-1">
            {/* Profile */}
            <ProfilePanel profile={profile} onEdit={setProfile} />

            {/* Tools */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Agent Tools</p>
              <div className="space-y-1">
                {(Object.entries(TOOL_DISPLAY) as [ToolName, typeof TOOL_DISPLAY[ToolName]][]).map(([key, cfg]) => (
                  <div key={key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${cfg.color.split(" ")[0]} opacity-60`}>
                    <span>{cfg.icon}</span>
                    <span className="text-zinc-400">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Sources */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">Data Sources</p>
              <div className="space-y-1 text-[10px]">
                {[
                  { label: "JTR (Travel Regs)", domain: "travel" },
                  { label: "AR 600-8-10 (Leave)", domain: "leave" },
                  { label: "GSA Per Diem FY2026", domain: "rates" },
                  { label: "DD 1610, DA 31, DA 4856", domain: "forms" },
                ].map((ds) => (
                  <div key={ds.domain} className="flex items-center gap-2 px-2.5 py-1 text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
                    {ds.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="p-3 border-t border-slate-700">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">System</p>
            <div className="space-y-1.5">
              {[
                { label: "Ollama (qwen2.5:7b)", ok: systemHealth.ollama },
                { label: "Vector Store", ok: systemHealth.vectorstore },
                { label: "GSA Cache (42K zips)", ok: systemHealth.gsa_cache },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 px-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? "bg-green-400" : "bg-red-400"}`} />
                  <span className="text-[10px] text-zinc-500">{s.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 px-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-400/80 font-medium">OFFLINE MODE</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main Content ───────────────────────────────────── */}
        <main className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-xl bg-olive-800/40 border border-olive-700/40 flex items-center justify-center mb-4">
                  <span className="text-2xl text-amber-400/70">{"\u2B50"}</span>
                </div>
                <h2 className="text-base font-semibold text-zinc-300 mb-1">Welcome to Duty Line</h2>
                <p className="text-sm text-zinc-500 mb-1">Military admin assistant - fully offline</p>
                <p className="text-xs text-zinc-600 mb-6">Travel planning | Leave requests | Regulation lookup | Form fill</p>
                <div className="w-full max-w-xl space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">Try asking</p>
                  {EXAMPLE_QUERIES.map((q) => (
                    <button
                      key={q.text}
                      onClick={() => { setInput(q.text); inputRef.current?.focus(); }}
                      className="w-full text-left px-4 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-sm text-zinc-400 hover:text-zinc-200 hover:border-olive-600/40 hover:bg-slate-800/70 transition-all group"
                    >
                      <span className="mr-2 opacity-50 group-hover:opacity-100 transition-opacity">{q.icon}</span>
                      {q.text}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-700 mt-8">
                  ReAct Agent | qwen2.5:7b | ChromaDB | 4 tools | All data local
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {isActive && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-4 py-3 rounded-bl-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-xs text-zinc-500">
                          {status === "thinking" && "Reasoning..."}
                          {status === "tool_call" && "Executing tool..."}
                          {status === "streaming" && "Generating response..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-6 py-3 bg-slate-800/20 border-t border-slate-700/50">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your task — TDY trip, leave request, regulation question..."
                    rows={1}
                    disabled={isActive}
                    className="w-full resize-none rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-olive-600 focus:ring-1 focus:ring-olive-600/30 disabled:opacity-40 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || isActive}
                  className="px-5 py-2.5 rounded-lg bg-olive-700 text-amber-400 font-semibold text-sm hover:bg-olive-600 disabled:opacity-25 disabled:cursor-not-allowed transition-all border border-olive-600/50 active:scale-95"
                >
                  Send
                </button>
              </div>
              <p className="text-[10px] text-zinc-700 mt-1.5 text-center">
                Shift+Enter for new line | All data stays on device | Not legal advice | JTR + AR 600-8-10 + GSA FY2026
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
