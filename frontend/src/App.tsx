import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, ShieldCheck, Plus, MessageSquare, Trash2, ThumbsUp, ThumbsDown, RotateCcw, Menu, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Joyride } from "react-joyride"

type Source = { page: number | null; text: string }
type Version = { text: string; sources: Source[] }
type Message = {
  id?: number
  role: "user" | "assistant"
  text: string
  sources?: Source[]
  versions?: Version[]
  activeVersion?: number
  question?: string
}
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
  const [feedbackModal, setFeedbackModal] = useState<{ messageText: string; msgIndex: number } | null>(null)
  const [feedbackReason, setFeedbackReason] = useState("")
  const [feedbackComment, setFeedbackComment] = useState("")
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, string>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        sources: m.sources || [],
        versions: m.versions || undefined,
        activeVersion: m.versions ? (m.versions.length - 1) : undefined,
      })))
    } catch {}
  }

  function newChat() {
    setCurrentId(null)
    setMessages([])
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation() // don't trigger loadConversation
    if (!window.confirm("Are you sure you want to delete this conversation?")) return
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
        updated[updated.length - 1] = {
          role: "assistant",
          text: finalAnswer,
          sources,
          question,
          versions: [{ text: finalAnswer, sources }],
          activeVersion: 0,
        }
        return updated
      })

      // save the assistant message with its sources and versions and capture its DB id
      fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          role: "assistant",
          text: finalAnswer,
          sources,
          versions: [{ text: finalAnswer, sources }],
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          setMessages((prev) => {
            const updated = [...prev]
            // attach the id to the last assistant message
            for (let k = updated.length - 1; k >= 0; k--) {
              if (updated[k].role === "assistant" && !updated[k].id) {
                updated[k] = { ...updated[k], id: data.id }
                break
              }
            }
            return updated
          })
        })
        .catch(() => {})

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
  async function regenerate(msgIndex: number) {
    const msg = messages[msgIndex]
    if (!msg.question || loading || streaming) return

    setLoading(true)
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg.question }),
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
          firstChunk = false
        }

        const answerPart = accumulated.includes(DELIM) ? accumulated.split(DELIM)[0] : accumulated
        // show the regenerating answer live in this message
        setMessages((prev) => {
          const updated = [...prev]
          updated[msgIndex] = { ...updated[msgIndex], text: answerPart }
          return updated
        })
      }

      // parse final answer + sources
      let finalAnswer = accumulated
      let newSources: Source[] = []
      if (accumulated.includes(DELIM)) {
        const [ans, srcJson] = accumulated.split(DELIM)
        finalAnswer = ans.trim()
        try { newSources = JSON.parse(srcJson) } catch {}
      }

      // append as a new version, make it active, AND persist to DB
      setMessages((prev) => {
        const updated = [...prev]
        const m = updated[msgIndex]
        const newVersions = [...(m.versions || [{ text: m.text, sources: m.sources || [] }]), { text: finalAnswer, sources: newSources }]
        updated[msgIndex] = {
          ...m,
          text: finalAnswer,
          sources: newSources,
          versions: newVersions,
          activeVersion: newVersions.length - 1,
        }
        if (m.id) {
          fetch(`${API}/messages/${m.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: finalAnswer, sources: newSources, versions: newVersions }),
          }).catch(() => {})
        }
        return updated
      })
    } catch {
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  const reasonOptions = ["Inaccurate", "Incomplete", "Off-topic", "Hard to understand", "Other"]

  async function submitFeedback(messageText: string, rating: string, reason?: string, comment?: string, msgIndex?: number) {
    try {
      await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: currentId, message_text: messageText, rating, reason, comment }),
      })
      if (msgIndex !== undefined) setFeedbackGiven((prev) => ({ ...prev, [msgIndex]: rating }))
    } catch {}
  }

  function switchVersion(msgIndex: number, direction: number) {
    setMessages((prev) => {
      const updated = [...prev]
      const m = updated[msgIndex]
      if (!m.versions || m.versions.length < 2) return prev
      const current = m.activeVersion ?? 0
      const next = Math.max(0, Math.min(m.versions.length - 1, current + direction))
      updated[msgIndex] = {
        ...m,
        activeVersion: next,
        text: m.versions[next].text,
        sources: m.versions[next].sources,
      }
      return updated
    })
  }

  function handleThumbsUp(messageText: string, msgIndex: number) {
    submitFeedback(messageText, "up", undefined, undefined, msgIndex)
  }

  function handleThumbsDown(messageText: string, msgIndex: number) {
    setFeedbackModal({ messageText, msgIndex })
    setFeedbackReason("")
    setFeedbackComment("")
  }

  function submitThumbsDown() {
    if (!feedbackReason || !feedbackModal) return
    submitFeedback(feedbackModal.messageText, "down", feedbackReason, feedbackComment, feedbackModal.msgIndex)
    setFeedbackModal(null)
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
      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFeedbackModal(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-slate-100 mb-1">What went wrong?</h3>
            <p className="text-xs text-slate-400 mb-4">Please select a reason (required).</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {reasonOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setFeedbackReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    feedbackReason === r
                      ? "bg-cyan-500 border-cyan-500 text-slate-900"
                      : "border-slate-600 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Additional comments (optional)…"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-sm text-slate-100 placeholder:text-slate-500 mb-4 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setFeedbackModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button
                onClick={submitThumbsDown}
                disabled={!feedbackReason}
                className="px-4 py-2 text-sm rounded-md bg-cyan-500 text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-400"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "flex" : "hidden"} md:flex w-64 shrink-0 border-r border-slate-700/60 flex-col tour-sidebar fixed md:relative z-40 h-full bg-slate-900`}>
        <div className="p-3 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
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
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1 text-slate-400 hover:text-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
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
                    {msg.text && !(streaming && i === displayMessages.length - 1) && messages.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleThumbsUp(msg.text, i)}
                          className={`p-1.5 rounded hover:bg-slate-800 ${feedbackGiven[i] === "up" ? "text-cyan-400" : "text-slate-500"}`}
                          title="Helpful"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleThumbsDown(msg.text, i)}
                          className={`p-1.5 rounded hover:bg-slate-800 ${feedbackGiven[i] === "down" ? "text-red-400" : "text-slate-500"}`}
                          title="Not helpful"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => regenerate(i)}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-cyan-400"
                          title="Regenerate response"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {msg.versions && msg.versions.length > 1 && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 ml-1">
                            <button
                              onClick={() => switchVersion(i, -1)}
                              disabled={(msg.activeVersion ?? 0) === 0}
                              className="px-1 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ‹
                            </button>
                            <span className="font-mono">
                              {(msg.activeVersion ?? 0) + 1}/{msg.versions.length}
                            </span>
                            <button
                              onClick={() => switchVersion(i, 1)}
                              disabled={(msg.activeVersion ?? 0) === msg.versions.length - 1}
                              className="px-1 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ›
                            </button>
                          </div>
                        )}
                        {feedbackGiven[i] && <span className="text-xs text-slate-500">Thanks for your feedback</span>}
                      </div>
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