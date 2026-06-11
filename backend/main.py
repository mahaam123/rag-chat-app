# main.py — FastAPI server wrapping the RAG pipeline
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from rag import rag_answer, rag_answer_stream, generate_title
from db import init_db, init_feedback, create_conversation, add_message, get_conversations, get_messages, update_title, delete_conversation, add_feedback

app = FastAPI()
init_db()
init_feedback()

# Allow the frontend (localhost:5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Defines the shape of the incoming request: {"message": "..."}
class ChatRequest(BaseModel):
    message: str

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/chat")
def chat(req: ChatRequest):
    answer, sources = rag_answer(req.message)
    return {"answer": answer, "sources": sources}

@app.post("/chat/stream")
def chat_stream(req: ChatRequest):
    def event_generator():
        for token in rag_answer_stream(req.message):
            yield token
    return StreamingResponse(event_generator(), media_type="text/plain")

# Conversation history endpoints
@app.get("/conversations")
def list_conversations():
    return get_conversations()

@app.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int):
    return get_messages(conversation_id)

class NewConversation(BaseModel):
    title: str = "New conversation"

@app.post("/conversations")
def new_conversation(req: NewConversation):
    conv_id = create_conversation(req.title)
    return {"id": conv_id}

class SaveMessage(BaseModel):
    conversation_id: int
    role: str
    text: str
    sources: list | None = None

@app.post("/messages")
def save_message(req: SaveMessage):
    add_message(req.conversation_id, req.role, req.text, req.sources)
    return {"status": "saved"}

class TitleRequest(BaseModel):
    conversation_id: int
    question: str
    answer: str

@app.post("/conversations/title")
def set_title(req: TitleRequest):
    title = generate_title(req.question, req.answer)
    update_title(req.conversation_id, title)
    return {"title": title}

@app.delete("/conversations/{conversation_id}")
def remove_conversation(conversation_id: int):
    delete_conversation(conversation_id)
    return {"status": "deleted"}

class FeedbackRequest(BaseModel):
    conversation_id: int | None = None
    message_text: str
    rating: str
    reason: str | None = None
    comment: str | None = None

@app.post("/feedback")
def save_feedback(req: FeedbackRequest):
    add_feedback(req.conversation_id, req.message_text, req.rating, req.reason, req.comment)
    return {"status": "saved"}