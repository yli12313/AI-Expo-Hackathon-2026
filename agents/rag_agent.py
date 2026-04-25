"""
RAG Agent — retrieves relevant regulation chunks from ChromaDB,
then calls the LLM (via OpenRouter) to generate a cited answer.

Usage:
    from agents.rag_agent import RAGAgent
    agent = RAGAgent()
    result = agent.query("Is GTC mandatory for TDY travel?", domain="travel")
    print(result["answer"])
    print(result["citations"])
"""

import os
import logging
import warnings
import chromadb
from chromadb.config import Settings
from pathlib import Path
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

os.environ["ANONYMIZED_TELEMETRY"] = "false"
logging.getLogger("chromadb").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*existing embedding ID.*")

VECTORSTORE  = Path("vectorstore")
COLLECTION   = "dutyline"
EMBED_MODEL  = "BAAI/bge-small-en-v1.5"
TOP_K        = 4   # chunks to retrieve per query

# OpenRouter config — swap LLM_BASE_URL + LLM_MODEL env vars for local inference
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL    = os.getenv("LLM_MODEL",    "gemma4:latest")
LLM_API_KEY  = os.getenv("LLM_API_KEY",  "ollama")

SYSTEM_PROMPT = """You are Duty Line, an AI assistant for US military personnel.
You answer questions about military regulations, travel entitlements, leave policies, and administrative procedures.

Rules:
- Answer ONLY from the provided regulation excerpts below.
- Always cite the source document and section for every claim.
- If the excerpts do not contain enough information, say so clearly — do not guess.
- Be concise and direct. Soldiers need quick, actionable answers.
- Use plain English, not bureaucratic language.
"""


class RAGAgent:
    def __init__(self):
        self._embed_model = None
        self._collection  = None
        self._llm         = None

    def _load(self):
        if self._collection is not None:
            return
        self._embed_model = SentenceTransformer(EMBED_MODEL)
        client = chromadb.PersistentClient(
            path=str(VECTORSTORE),
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        self._llm = OpenAI(
            base_url=LLM_BASE_URL,
            api_key=LLM_API_KEY,
        )

    def _retrieve(self, query: str, domain: str | None = None) -> list[dict]:
        embedding = self._embed_model.encode([query], normalize_embeddings=True).tolist()
        kwargs = dict(query_embeddings=embedding, n_results=TOP_K)
        if domain:
            kwargs["where"] = {"domain": domain}
        results = self._collection.query(**kwargs)

        chunks = []
        if results["documents"] and results["documents"][0]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                chunks.append({
                    "text":     doc,
                    "source":   meta.get("source_file", ""),
                    "section":  meta.get("section_title", ""),
                    "domain":   meta.get("domain", ""),
                    "score":    round(1 - dist, 3),
                })
        return chunks

    def _build_context(self, chunks: list[dict]) -> str:
        parts = []
        for i, c in enumerate(chunks, 1):
            parts.append(
                f"[Excerpt {i}] Source: {c['source']} | Section: {c['section']}\n{c['text']}"
            )
        return "\n\n---\n\n".join(parts)

    def query(self, question: str, domain: str | None = None) -> dict:
        """
        Ask a regulation question.

        Args:
            question: Natural language question from the user
            domain:   Optional filter — "travel", "leave", "regs", "eval"

        Returns:
            {
                "answer":    str,        # LLM-generated answer with citations
                "citations": list[dict], # retrieved chunks with scores
                "question":  str,
            }
        """
        self._load()

        chunks = self._retrieve(question, domain)
        if not chunks:
            return {
                "answer":    "I could not find relevant regulation text for that question. Please check that the relevant documents have been ingested.",
                "citations": [],
                "question":  question,
            }

        context = self._build_context(chunks)
        user_message = f"""Regulation excerpts:
{context}

Question: {question}

Answer based only on the excerpts above. Cite the source and section for each point."""

        response = self._llm.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            temperature=0.1,
            max_tokens=512,
        )
        answer = response.choices[0].message.content.strip()

        return {
            "answer":    answer,
            "citations": chunks,
            "question":  question,
        }


# ---------------------------------------------------------------------------
# Quick test — run directly: python3 agents/rag_agent.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    agent = RAGAgent()

    test_questions = [
        ("Is the GTC mandatory for TDY travel?",              "travel"),
        ("How many days of leave do soldiers accrue monthly?", "leave"),
        ("What is the per diem rate policy for TDY trips?",   "travel"),
    ]

    for question, domain in test_questions:
        print(f"\n{'='*60}")
        print(f"Q: {question}")
        result = agent.query(question, domain=domain)
        print(f"\nA: {result['answer']}")
        print(f"\nSources used:")
        for c in result["citations"]:
            print(f"  [{c['score']}] {c['source']} — {c['section'][:60]}")
