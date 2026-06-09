import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Bot, User } from "lucide-react"

// Dummy mock messages to verify the design (static, no real functionality yet)
const mockMessages = [
  { id: 1, role: "assistant", text: "Hi! I'm your RAG assistant. Ask me anything about the CIS Controls." },
  { id: 2, role: "user", text: "How should an enterprise manage data access control?" },
  { id: 3, role: "assistant", text: "Configure data access control lists based on a user's need to know, apply them to file systems, databases, and applications, and centralize access control through a directory service where supported." },
  { id: 4, role: "user", text: "How often should access reviews happen?" },
  { id: 5, role: "assistant", text: "Access control reviews should be performed on a recurring schedule, at a minimum annually or more frequently." },
]

function App() {
  const [input, setInput] = useState("")

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold">RAG Assistant</h1>
          <p className="text-xs text-indigo-100">CIS Controls knowledge base</p>
        </div>
      </header>

      {/* Message viewport */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {mockMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarFallback
                  className={
                    msg.role === "user"
                      ? "bg-purple-600 text-white"
                      : "bg-indigo-600 text-white"
                  }
                >
                  {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </AvatarFallback>
              </Avatar>
              <div
                className={`rounded-2xl px-4 py-3 max-w-[75%] shadow-sm ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white rounded-tr-sm"
                    : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Input bar */}
      <footer className="px-4 py-4 bg-white/80 backdrop-blur border-t border-gray-200">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 rounded-full"
          />
          <Button
            size="icon"
            className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </footer>
    </div>
  )
}

export default App