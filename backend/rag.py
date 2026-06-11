# rag.py
import json
import pickle
import weaviate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_weaviate import WeaviateVectorStore
from langchain_ollama import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from sentence_transformers import CrossEncoder

print("Loading RAG pipeline...")

embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-small-en-v1.5",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

client = weaviate.connect_to_local()
print("Weaviate ready:", client.is_ready())

# Auto-load data if the collection is missing or empty
needs_load = True
if client.collections.exists("CIS_Controls"):
    count = client.collections.get("CIS_Controls").aggregate.over_all(total_count=True).total_count
    if count > 0:
        needs_load = False
        print(f"Collection already has {count} chunks.")

if needs_load:
    print("Collection empty — loading chunks from pickle...")
    chunks = pickle.load(open("chunks.pkl", "rb"))
    if client.collections.exists("CIS_Controls"):
        client.collections.delete("CIS_Controls")
    vectorstore = WeaviateVectorStore.from_documents(
        documents=chunks, embedding=embeddings, client=client, index_name="CIS_Controls"
    )
    print(f"Loaded and stored {len(chunks)} chunks.")
else:
    vectorstore = WeaviateVectorStore(
        client=client,
        index_name="CIS_Controls",
        text_key="text",
        embedding=embeddings,
    )

llm = OllamaLLM(model="qwen3:4b", temperature=0.7)

prompt = ChatPromptTemplate.from_template(
    """You are a knowledgeable assistant answering questions about the CIS Controls v8 framework.

Answer the question using ONLY the numbered context sources below.

Guidelines for your answer:
- Be clear, direct, and concise. Do not start with filler like "Based on the provided context" — just answer.
- Use Markdown formatting: **bold** for key terms, bullet or numbered lists for multiple items, and short paragraphs.
- When you use information from a source, cite it inline with its number in square brackets, like [1] or [2], placed right after the relevant statement.
- Only cite sources you actually used.
- If the context does not contain the answer, clearly say that the provided material does not cover it — do not make anything up.

Context sources:
{context}

Question: {question}

Answer:"""
)
print("RAG pipeline ready.")

def rag_answer(question, k_retrieve=20, k_rerank=5):
    candidates = vectorstore.similarity_search(question, k=k_retrieve)
    pairs = [(question, doc.page_content) for doc in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
    top = [doc for score, doc in ranked[:k_rerank]]
    context_text = "\n\n---\n\n".join(doc.page_content for doc in top)
    answer = llm.invoke(prompt.format(context=context_text, question=question))
    sources = [{"page": doc.metadata.get("page_number"), "text": doc.page_content} for doc in top]
    return answer, sources

def rag_answer_stream(question, k_retrieve=20, k_rerank=5):
    candidates = vectorstore.similarity_search(question, k=k_retrieve)
    pairs = [(question, doc.page_content) for doc in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
    top = [doc for score, doc in ranked[:k_rerank]]

    # number the sources so the model can cite [1], [2], ...
    context_text = "\n\n".join(
        f"[{i+1}] {doc.page_content}" for i, doc in enumerate(top)
    )
    final_prompt = prompt.format(context=context_text, question=question)

    for chunk in llm.stream(final_prompt):
        yield chunk

    sources = [
        {"page": doc.metadata.get("page_number"), "text": doc.page_content}
        for doc in top
    ]
    yield "\n␞SOURCES␞\n" + json.dumps(sources)

def generate_title(question, answer):
    prompt_text = (
        "Generate a very short title (3-6 words, no quotes) summarizing this conversation:\n\n"
        f"User: {question}\n"
        f"Assistant: {answer[:300]}\n\n"
        "Title:"
    )
    title = llm.invoke(prompt_text).strip()
    # safety: keep it short, strip quotes
    return title.replace('"', "").strip()[:60]