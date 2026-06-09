# main.py — FastAPI server wrapping the RAG pipeline
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag import rag_answer

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