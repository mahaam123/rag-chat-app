# main.py — FastAPI server wrapping the RAG pipeline
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from rag import rag_answer, rag_answer_stream

app = FastAPI()

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