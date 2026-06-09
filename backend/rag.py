# rag.py
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

llm = OllamaLLM(model="qwen3:4b", temperature=0)

prompt = ChatPromptTemplate.from_template(
    """You are a helpful assistant answering questions about the CIS Controls.
Answer the question using ONLY the context below. If the context does not
contain the answer, say so — do not make anything up.

Context:
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
    # retrieve + rerank (same as before)
    candidates = vectorstore.similarity_search(question, k=k_retrieve)
    pairs = [(question, doc.page_content) for doc in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
    top = [doc for score, doc in ranked[:k_rerank]]
    context_text = "\n\n---\n\n".join(doc.page_content for doc in top)
    final_prompt = prompt.format(context=context_text, question=question)

    # stream the answer token by token
    for chunk in llm.stream(final_prompt):
        yield chunk
