import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, ShieldCheck, Plus, MessageSquare, Trash2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Joyride } from "react-joyride"

type Source = { page: number | null; text: string }
type Message = { role: "user" | "assistant"; text: string; sources?: Source[] }
type Conversation = { id: number; title: string; created_at: string }

const API = "http://localhost:8000"
const GREETING = "Ask a question about the CIS Controls v8 framework."

function renderWithCitations(text: string, sources?: Source[]) {
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((part, idx) => {
    const match = part.match(/^\[(\d+)\]$/)
    if (match) {
      const n = parseInt(match[1], 10)
      const src = sources?.[n - 1]
      if (src) {
        return (
          <span key={idx} className="citation-chip">
            {n}
            <span className="citation-tooltip">
              <span className="citation-page">
                {src.page != null ? `Page ${Math.round(src.page)}` : "Source"}
              </span>
              {src.text.slice(0, 220)}…
            </span>
          </span>
        )
      }
      return <span key={idx}>{part}</span>
    }
    return <span key={idx}>{part}</span>
  })
}

function CitedText({ text, sources }: { text: string; sources?: Source[] }) {
  return (
    <ReactMarkdown
      components={{
        // intercept text nodes and inject citation chips inline
        p: ({ children }) => <p>{processChildren(children, sources)}</p>,
        li: ({ children }) => <li>{processChildren(children, sources)}</li>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function processChildren(children: React.ReactNode, sources?: Source[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderWithCitations(child, sources)
    }
    return child
  })
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [runTour, setRunTour] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem("tourSeen")
    if (!seen) {
      setRunTour(true)
      localStorage.setItem("tourSeen", "true")
    }
  }, [])

  const tourSteps = [
    { target: ".tour-sidebar", content: "Your past conversations are saved here. Click any to resume it.", placement: "right" as const },
    { target: ".tour-newchat", content: "Start a fresh conversation anytime.", placement: "right" as const },
    { target: ".tour-input", content: "Type your question about the CIS Controls here and press Enter.", placement: "top" as const },
    { target: ".tour-send", content: "Send your message — the answer streams in live.", placement: "top" as const },
  ]

  useEffect(() => { fetchConversations() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  async function fetchConversations() {
    try {
      const res = await fetch(`${API}/conversations`)
      setConversations(await res.json())
    } catch {}
  }

  async function loadConversation(id: number) {
    setCurrentId(id)
    try {
      const res = await fetch(`${API}/conversations/${id}`)
      const msgs = await res.json()
      setMessages(msgs.map((m: any) => ({ role: m.role, text: m.text, sources: m.sources || [] })))
    } catch {}
  }

  function newChat() {
    setCurrentId(null)
    setMessages([])
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation() // don't trigger loadConversation
    try {
      await fetch(`${API}/conversations/${id}`, { method: "DELETE" })
      if (id === currentId) newChat()
      fetchConversations()
    } catch {}
  }

  async function sendMessage() {
    const question = input.trim()
    if (!question || loading || streaming) return

    let convId = currentId
    let isFirstMessage = false
    if (convId === null) {
      const res = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      })
      convId = (await res.json()).id
      setCurrentId(convId)
      isFirstMessage = true
      fetchConversations()
    }

    setMessages((prev) => [...prev, { role: "user", text: question }])
    setInput("")
    setLoading(true)

    fetch(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: convId, role: "user", text: question }),
    })

    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })
      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let firstChunk = true
      let accumulated = ""
      const DELIM = "␞SOURCES␞"

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })

        if (firstChunk) {
          setLoading(false)
          setStreaming(true)
          setMessages((prev) => [...prev, { role: "assistant", text: "" }])
          firstChunk = false
        }

        const answerPart = accumulated.includes(DELIM)
          ? accumulated.split(DELIM)[0]
          : accumulated

        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], role: "assistant", text: answerPart }
          return updated
        })
      }

      // after streaming, split answer from sources
      let finalAnswer = accumulated
      let sources: Source[] = []
      if (accumulated.includes(DELIM)) {
        const [ans, srcJson] = accumulated.split(DELIM)
        finalAnswer = ans.trim()
        try { sources = JSON.parse(srcJson) } catch {}
      }

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: "assistant", text: finalAnswer, sources }
        return updated
      })

      // save the assistant message (clean answer only)
      fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, role: "assistant", text: finalAnswer , sources }),
      })

      // generate a smart title in the background after the first exchange
      if (isFirstMessage) {
        fetch(`${API}/conversations/title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: convId, question, answer: finalAnswer }),
        }).then(() => fetchConversations())
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Couldn't reach the backend." }])
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  // messages to display: show greeting as an assistant bubble when empty
  const displayMessages: Message[] = messages.length === 0
    ? [{ role: "assistant", text: GREETING }]
    : messages

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        options={{
          buttons: ['back', 'primary', 'skip'],
          primaryColor: "#06b6d4",
          backgroundColor: "#1e293b",
          textColor: "#e2e8f0",
          arrowColor: "#1e293b",
        }}
        locale={{
          last: "Done",
        }}
      />
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-700/60 flex flex-col tour-sidebar">
        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-medium tour-newchat"
          >
            <Plus className="w-4 h-4" /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`group w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm cursor-pointer ${
                c.id === currentId ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={(e) => deleteConversation(c.id, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 shrink-0"
                title="Delete conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/60">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <div className="flex flex-col">
            <span className="font-mono text-xs uppercase tracking-widest text-cyan-400">CIS Controls</span>
            <span className="text-sm text-slate-400">Knowledge Assistant</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {displayMessages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="rounded-lg bg-slate-700 px-4 py-2.5 max-w-[80%] text-sm leading-relaxed">{msg.text}</div>
                  </div>
                ) : (
                  <div className="border-l-2 border-cyan-400/70 pl-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/80 mb-1.5">Assistant</div>
                    <div className="text-sm leading-relaxed text-slate-200 prose-chat">
                      <CitedText text={msg.text + (streaming && i === displayMessages.length - 1 ? " ▋" : "")} sources={msg.sources} />
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer text-xs font-mono uppercase tracking-wider text-slate-400 hover:text-cyan-400 select-none">
                          {msg.sources.length} sources
                        </summary>
                        <div className="mt-2 space-y-2">
                          {msg.sources.map((src, si) => (
                            <div key={si} className="text-xs bg-slate-800/60 border border-slate-700/60 rounded-md p-3">
                              <div className="font-mono text-cyan-400/70 mb-1">
                                {src.page != null ? `Page ${Math.round(src.page)}` : "Source"}
                              </div>
                              <div className="text-slate-400 leading-relaxed line-clamp-3">
                                {src.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="border-l-2 border-cyan-400/30 pl-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/50 mb-1.5">Assistant</div>
                <div className="text-sm text-slate-500 font-mono animate-pulse">retrieving…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="px-4 py-4 border-t border-slate-700/60">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask about a control, safeguard, or implementation group…"
              disabled={loading || streaming}
              className="flex-1 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400/40 tour-input"
            />
            <Button onClick={sendMessage} disabled={loading || streaming} size="icon" className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 tour-send">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App