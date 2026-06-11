# CIS Controls Knowledge Assistant

A full-stack Retrieval-Augmented Generation (RAG) chat application that answers questions about the **CIS Controls v8** cybersecurity framework. It runs entirely locally — a local vector database, a local embedding/reranking pipeline, and a local LLM — with a streaming chat interface.

## Features

- **Streaming chat** — answers stream in token-by-token, rendered as Markdown
- **Inline citations** — clickable citation markers with hover tooltips, plus a collapsible sources panel showing the top 5 chunks used as context for the answer, each with its document page and snippet
- **Conversation history** — conversations and messages are saved to a database; resume any past chat from the sidebar
- **Smart titles** — each conversation is automatically given a short, descriptive title
- **User feedback** — thumbs up/down on every answer; thumbs-down requires a reason, and all feedback is stored for later review
- **Response regeneration** — regenerate any answer; every version is stored and you can switch between them, with history persisted to the database
- **Guided tour** — a first-visit walkthrough of the interface
- **Conversation export** — download any conversation as Markdown or PDF
- **Responsive layout** — adapts to small screens with a collapsible sidebar
- **Delete history** - trash option to delete past conversations

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Vector database | Weaviate (via Docker) |
| Embeddings | BAAI/bge-small-en-v1.5 (local) |
| Reranker | BAAI/bge-reranker-v2-m3 (local) |
| LLM | qwen3:4b (via Ollama, local) |
| Conversation/feedback storage | SQLite |

When a question is asked, the backend retrieves candidate chunks from Weaviate, reranks them with a cross-encoder, and passes the top results as grounded context to the LLM, which streams back an answer with inline citations.

## Prerequisites

Install these before running:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — runs the Weaviate vector database
- **[Ollama](https://ollama.com/download)** — runs the local LLM
- **[uv](https://docs.astral.sh/uv/getting-started/installation/)** — Python package/environment manager
- **[Node.js](https://nodejs.org/)** (v18+) — runs the frontend

## Setup & Run

> First-time setup takes a few minutes (downloading the LLM and Python/Node dependencies). After that, startup is quick.

### 1. Clone the repository

```bash
git clone https://github.com/mahaam123/rag-chat-app.git
cd rag-chat-app
```

### 2. Pull the LLM model

```bash
ollama pull qwen3:4b
```

Make sure the Ollama app is running (you should see its icon in your menu bar).

### 3. Start Weaviate

```bash
docker run -d --name weaviate -p 8080:8080 -p 50051:50051 \
  -v weaviate_data:/var/lib/weaviate \
  -e PERSISTENCE_DATA_PATH=/var/lib/weaviate \
  cr.weaviate.io/semitechnologies/weaviate:1.27.0
```

Wait ~30 seconds, then confirm it's ready:

```bash
curl http://localhost:8080/v1/.well-known/ready
```

### 4. Start the backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

On the **first run**, the backend automatically loads the CIS Controls data into Weaviate from the included `chunks.pkl` file (no manual ingestion needed). Watch for `RAG pipeline ready.` and `Uvicorn running on http://127.0.0.1:8000`.

### 5. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

### 6. Open the app

Visit **http://localhost:5173** in your browser.

## Project Structure

```
rag-chat-app/
├── backend/
│   ├── main.py          # FastAPI app: chat, conversations, feedback endpoints
│   ├── rag.py           # RAG pipeline (retrieve → rerank → generate, streaming)
│   ├── db.py            # SQLite layer (conversations, messages, feedback)
│   └── chunks.pkl       # Pre-processed CIS Controls document chunks
└── frontend/
    └── src/
        └── App.tsx      # The chat interface
```

## Notes

- The app runs **fully locally** — no external API keys required.
- Conversation history and feedback are stored in `backend/chat.db` (created automatically on first run).
- To stop Weaviate cleanly between sessions: `docker stop weaviate`. To resume: `docker start weaviate` (your data persists in the `weaviate_data` volume).
