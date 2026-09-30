# NexaRAG

### Private knowledge. Semantic retrieval. Grounded AI.

NexaRAG is a **multi-tenant Retrieval-Augmented Generation (RAG) platform** that allows organizations to upload documents, index their content, search it semantically, and ask AI questions with source citations.

Built with **React, TypeScript, Fastify, PostgreSQL, pgvector, local embeddings, and LLMs**.

---

## 🚀 What is NexaRAG?

NexaRAG lets you build an AI assistant around your own documents.

Instead of sending an entire document collection to an LLM, NexaRAG first retrieves the most relevant information and provides that context to the model.

```text
Documents
    ↓
Text Extraction
    ↓
Chunking
    ↓
Embeddings
    ↓
PostgreSQL + pgvector
    ↓
Semantic Search
    ↓
Relevant Context
    ↓
LLM
    ↓
Answer + Citations
