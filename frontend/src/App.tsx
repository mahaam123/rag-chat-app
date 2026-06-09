import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, ShieldCheck } from "lucide-react"
import ReactMarkdown from "react-markdown"

type Message = { role: "user" | "assistant"; text: string }

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Ask a question about the CIS Controls v8 framework." },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)     // waiting for first token
  const [streaming, setStreaming] = useState(false) // tokens are arriving

  async function sendMessage() {
    const question = input.trim()
    if (!question || loading || streaming) return

    setMessages((prev) => [...prev, { role: "user", text: question }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("http://localhost:8000/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let firstChunk = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        if (firstChunk) {
          // first token arrived — switch from "retrieving" to streaming
          setLoading(false)
          setStreaming(true)
          setMessages((prev) => [...prev, { role: "assistant", text: "" }])
          firstChunk = false
        }

        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            text: updated[updated.length - 1].text + chunk,
          }
          return updated
        })
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Couldn't reach the backend. Check that the server is running on port 8000." }])
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/60 bg-slate-900">
        <ShieldCheck className="w-5 h-5 text-cyan-400" />
        <div className="flex flex-col">
          <span className="font-mono text-xs uppercase tracking-widest text-cyan-400">CIS Controls</span>
          <span className="text-sm text-slate-400">Knowledge Assistant</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="rounded-lg bg-slate-700 px-4 py-2.5 max-w-[80%] text-sm leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="border-l-2 border-cyan-400/70 pl-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/80 mb-1.5">
                    Assistant
                  </div>
                  <div className="text-sm leading-relaxed text-slate-200 prose-chat">
                    <ReactMarkdown>
                      {msg.text + (streaming && i === messages.length - 1 ? " ▋" : "")}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="border-l-2 border-cyan-400/30 pl-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/50 mb-1.5">
                Assistant
              </div>
              <div className="text-sm text-slate-500 font-mono animate-pulse">retrieving…</div>
            </div>
          )}
        </div>
      </main>

      <footer className="px-4 py-4 border-t border-slate-700/60 bg-slate-900">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about a control, safeguard, or implementation group…"
            disabled={loading || streaming}
            className="flex-1 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400/40"
          />
          <Button
            onClick={sendMessage}
            disabled={loading || streaming}
            size="icon"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </footer>
    </div>
  )
}

export default App