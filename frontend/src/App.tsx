import { useState, useRef, useEffect } from "react";

type Tab = "travel" | "leave" | "regulation" | "eval";
type Status = "idle" | "thinking" | "searching" | "calculating" | "done" | "error";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tools_used?: string[];
}

interface SoldierProfile {
  name: string;
  rank: string;
  unit: string;
  installation: string;
}

const TAB_CONFIG: Record<Tab, { label: string; icon: string; description: string }> = {
  travel: { label: "TDY Travel", icon: "\u2708", description: "Plan trips, per diem, DD 1610" },
  leave: { label: "Leave / HR", icon: "\uD83D\uDCC4", description: "DA 31, personnel actions" },
  regulation: { label: "Regulations", icon: "\uD83D\uDCD6", description: "JTR, ARs, AFIs lookup" },
  eval: { label: "Evaluations", icon: "\u2B50", description: "Counseling, NCOERs, OERs" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Ready", color: "bg-zinc-600 text-zinc-300", pulse: false },
  thinking: { label: "Thinking...", color: "bg-amber-500/20 text-amber-400 border border-amber-500/30", pulse: true },
  searching: { label: "Searching Regs", color: "bg-blue-500/20 text-blue-400 border border-blue-500/30", pulse: true },
  calculating: { label: "Calculating", color: "bg-amber-500/20 text-amber-400 border border-amber-500/30", pulse: true },
  done: { label: "Complete", color: "bg-green-500/20 text-green-400 border border-green-500/30", pulse: false },
  error: { label: "Error", color: "bg-red-500/20 text-red-400 border border-red-500/30", pulse: false },
};

const EXAMPLE_QUERIES: Record<Tab, string[]> = {
  travel: [
    "Send SPC Rivera to Fort Moore, GA for 5 days starting July 10, driving POV from Fort Liberty",
    "What's the per diem for San Diego, CA?",
    "Do I need a GTC for a 2-day TDY?",
  ],
  leave: [
    "I need 10 days ordinary leave starting June 3 to visit family in Texas",
    "Can I take leave while on a temporary profile?",
    "How many days of leave do I accrue per month?",
  ],
  regulation: [
    "What does JTR say about POV mileage reimbursement?",
    "What's the receipt threshold for travel expenses?",
    "Can I use a rental car instead of POV for TDY?",
  ],
  eval: [
    "Help me write NCOER bullets for a squad leader",
    "When is my counseling due?",
    "What are the rating scales for DA 4856?",
  ],
};

function StatusChip({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.pulse ? "animate-pulse-amber" : ""}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? "bg-current" : "bg-current opacity-60"}`} />
      {cfg.label}
    </span>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-olive-700 text-zinc-100 rounded-br-sm"
            : "bg-slate-800 text-zinc-200 border border-slate-700 rounded-bl-sm"
        }`}
      >
        {!isUser && msg.tools_used && msg.tools_used.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {msg.tools_used.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
        <div className={`text-[10px] mt-1.5 ${isUser ? "text-olive-500" : "text-zinc-500"}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("travel");
  const [status, setStatus] = useState<Status>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [profile] = useState<SoldierProfile>({
    name: "Rivera, Maria J.",
    rank: "SPC",
    unit: "1-503 INF, 82nd ABN",
    installation: "Fort Liberty",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tab: activeTab }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setStatus("done");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "No response received.",
          timestamp: new Date(),
          tools_used: data.tools_used || [],
        },
      ]);
    } catch {
      setStatus("error");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connection error. Make sure the backend is running on port 8000.",
          timestamp: new Date(),
        },
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

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400 font-bold text-sm">DL</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 tracking-wide">DUTY LINE</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">GenAI.mil</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatusChip status={status} />
          <div className="h-4 w-px bg-slate-700" />
          <div className="text-right">
            <p className="text-xs text-zinc-300 font-medium">{profile.rank} {profile.name}</p>
            <p className="text-[10px] text-zinc-500">{profile.unit} | {profile.installation}</p>
          </div>
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
                      ? "bg-olive-700/60 text-amber-400 border border-olive-600/50"
                      : "text-zinc-400 hover:bg-slate-700/50 hover:text-zinc-200"
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

          <div className="mt-auto p-3 border-t border-slate-700">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-zinc-400">Ollama Connected</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-zinc-400">Vector Store Loaded</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-zinc-400">GSA Rates Cached</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
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
                    ? "bg-olive-700 text-amber-400"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-slate-700/30"
                }`}
              >
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>

          {/* Response Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-xl bg-olive-800/50 border border-olive-700/50 flex items-center justify-center mb-4">
                  <span className="text-3xl text-amber-400/80">{TAB_CONFIG[activeTab].icon}</span>
                </div>
                <h2 className="text-lg font-semibold text-zinc-200 mb-1">{TAB_CONFIG[activeTab].label}</h2>
                <p className="text-sm text-zinc-500 mb-6">{TAB_CONFIG[activeTab].description}</p>
                <div className="w-full max-w-lg space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">Try asking</p>
                  {EXAMPLE_QUERIES[activeTab].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleExampleClick(q)}
                      className="w-full text-left px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-zinc-400 hover:text-zinc-200 hover:border-olive-600/50 hover:bg-slate-800 transition-all"
                    >
                      {q}
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
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="px-6 py-3 bg-slate-800/30 border-t border-slate-700/50">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask about ${TAB_CONFIG[activeTab].label.toLowerCase()}...`}
                    rows={1}
                    className="w-full resize-none rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-olive-600 focus:ring-1 focus:ring-olive-600/50 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="px-4 py-2.5 rounded-lg bg-olive-700 text-amber-400 font-medium text-sm hover:bg-olive-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-olive-600/50"
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
