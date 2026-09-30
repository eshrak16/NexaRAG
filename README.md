NexaRAG

A multi-tenant RAG knowledge platform for uploading documents,
generating embeddings, searching knowledge bases, and asking
AI-powered questions with citations.

NexaRAG is a full-stack Retrieval-Augmented Generation (RAG) application
designed around isolated organizations and knowledge bases. It combines
document ingestion, semantic search, local embeddings,
PostgreSQL/pgvector, and an LLM answer layer into one developer-focused
platform.

✨ Features

Knowledge Management

Create and manage knowledge bases

Organize documents by knowledge base

Multi-tenant organization structure

Document status tracking

PDF, DOCX, and TXT document upload

Upload size validation

Document ingestion and chunking

RAG Pipeline

Document → text extraction → chunking → embeddings → vector storage

Local embedding generation using BAAI/bge-small-en-v1.5

384-dimensional normalized embeddings

PostgreSQL with pgvector

Cosine-similarity semantic search

Knowledge-base scoped retrieval

Retrieval results used as context for AI answers

Source citations returned with answers

AI

LLM-powered answers through an OpenAI-compatible provider

Groq provider support

Configurable model/provider through environment variables

Answers grounded in retrieved knowledge-base content

Security & Multi-tenancy

JWT-based authentication

Organization memberships

Knowledge-base access control

Role-based architecture with:

OWNER

ADMIN

MEMBER

VIEWER

Tenant isolation at the service/API layer

Authorized knowledge-base and document access

Frontend

React + TypeScript + Vite

Dark developer-focused UI

Knowledge-base dashboard

Document management

Upload interface

Ask AI interface

Citation display

Responsive layout

Authentication UI

🏗️ Architecture

                         ┌──────────────────────┐
                         │      React UI        │
                         │ React + TypeScript   │
                         │       + Vite         │
                         └──────────┬───────────┘
                                    │
                              REST API / JWT
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Fastify Backend    │
                         │      Node.js         │
                         │     TypeScript       │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
          Authentication      Knowledge Base      Documents
          & RBAC              Management          & Ingestion
                 │                  │                  │
                 └──────────────────┼──────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │   RAG Pipeline       │
                         │                      │
                         │ Extract              │
                         │   ↓                  │
                         │ Chunk                │
                         │   ↓                  │
                         │ Embed                │
                         │   ↓                  │
                         │ Store                │
                         │   ↓                  │
                         │ Search               │
                         │   ↓                  │
                         │ Retrieve Context     │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ PostgreSQL + pgvector│
                         │                      │
                         │ Documents            │
                         │ Chunks               │
                         │ Embeddings           │
                         │ Organizations        │
                         │ Memberships          │
                         │ Knowledge Bases      │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   LLM Answer Layer   │
                         │      Groq / LLM      │
                         └──────────────────────┘

🧰 Tech Stack

Backend

Technology                  Purpose

Node.js                     Runtime
TypeScript                  Backend language
Fastify                     HTTP API
PostgreSQL                  Relational database
pgvector                    Vector similarity search
Prisma                      ORM/database access
Zod                         Validation
JWT                         Authentication
Pino                        Logging
Vitest / Node test runner   Testing

AI / RAG

Technology                 Purpose

Transformers.js            Local embedding generation
BAAI/bge-small-en-v1.5   Embedding model
pgvector                   Vector storage/search
Groq                       LLM provider
OpenAI-compatible API      LLM integration interface

Frontend

Technology   Purpose

React        UI
TypeScript   Frontend language
Vite         Development/build tooling
CSS          Styling

📁 Project Structure

NexaRAG/
│
├── contextcore/
│   │
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── organizations/
│   │   │   ├── knowledgebase/
│   │   │   ├── document/
│   │   │   ├── ingestion/
│   │   │   ├── embedding/
│   │   │   ├── search/
│   │   │   └── ask/
│   │   │
│   │   ├── routes/
│   │   ├── config/
│   │   └── app.ts
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── scripts/
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── components/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── styles.css
│   │   ├── package.json
│   │   └── .env.example
│   │
│   ├── package.json
│   ├── .env.example
│   └── README.md

🔄 RAG Workflow

NexaRAG follows a retrieval-first architecture:

Upload Document
      │
      ▼
Validate File
      │
      ▼
Extract Text
      │
      ▼
Chunk Document
      │
      ▼
Generate Embeddings
      │
      ▼
Store Chunks + Vectors
      │
      ▼
User Question
      │
      ▼
Generate Query Embedding
      │
      ▼
Semantic Search
      │
      ▼
Retrieve Relevant Chunks
      │
      ▼
Build LLM Context
      │
      ▼
Generate Answer
      │
      ▼
Return Answer + Citations

The search layer scopes retrieval to the requested knowledge base and
checks authorization before accessing tenant data.

🔌 API Overview

The backend exposes versioned REST endpoints under:

/api/v1

Important routes include:

Authentication

POST /api/v1/auth/login
GET  /api/v1/auth/me

Organizations

GET /api/v1/organizations

Knowledge Bases

GET    /api/v1/knowledge-bases
POST   /api/v1/knowledge-bases
GET    /api/v1/knowledge-bases/:knowledgeBaseId
PATCH  /api/v1/knowledge-bases/:knowledgeBaseId
DELETE /api/v1/knowledge-bases/:knowledgeBaseId

Documents

GET  /api/v1/knowledge-bases/:knowledgeBaseId/documents
POST /api/v1/knowledge-bases/:knowledgeBaseId/documents/upload

Semantic Search

POST /api/v1/knowledge-bases/:knowledgeBaseId/search

RAG Ask

POST /api/v1/knowledge-bases/:knowledgeBaseId/ask

API details can evolve as the project develops. Check the backend
route files for the current request/response schemas.

⚙️ Requirements

Recommended development environment:

Node.js 22+

npm

PostgreSQL 17

PostgreSQL pgvector extension

Git

If using Docker for PostgreSQL, make sure Docker Desktop is running.

🚀 Getting Started

1. Clone the repository

git clone <your-repository-url>
cd NexaRAG

Enter the backend project:

cd contextcore

2. Install backend dependencies

npm install

3. Configure environment variables

Create:

.env

from:

.env.example

Example structure:

DATABASE_URL=postgresql://<user>:<password>@localhost:<port>/<database>?schema=public

JWT_SECRET=<your-secret>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

CORS_ORIGIN=http://localhost:5173

GROQ_API_KEY=<your-api-key>
GROQ_MODEL=<your-model>

Never commit .env or API keys to GitHub.

4. Set up the database

Make sure PostgreSQL is running and the database is configured in
DATABASE_URL.

Then run:

npx prisma migrate dev

Generate the Prisma client:

npx prisma generate

5. Start the backend

npm run dev

The backend is configured to run on the project's configured API port.

🎨 Frontend Setup

Open a second terminal:

cd contextcore/frontend

Install dependencies:

npm install

Create:

frontend/.env

using:

frontend/.env.example

Example:

VITE_API_BASE_URL=http://localhost:3000/api/v1

Start the frontend:

npm run dev

Vite will normally expose the application at:

http://localhost:5173

🧪 Testing

Backend type checking:

npm run typecheck

Run backend tests:

npm test

Frontend production validation:

cd frontend
npm run build

🔐 Security

NexaRAG is designed around tenant-aware access control.

Important security principles include:

Authentication before protected operations

Organization membership checks

Knowledge-base authorization

Tenant isolation

Role-aware access

Parameterized database operations

Secrets stored through environment variables

No API keys committed to source control

Never commit:

.env
.env.local
API keys
JWT secrets
database passwords
private credentials

🗺️ Roadmap

Core RAG

Document ingestion

Text extraction

Chunking

Local embeddings

PostgreSQL + pgvector

Semantic search

RAG answer generation

Citation support

Platform

Organizations

Knowledge bases

Membership model

JWT authentication

Role model

React dashboard

Document upload

Planned / Improving

Polished authentication/session UX

Complete RBAC management UI

Admin approval workflow

Member management

Advanced document management

Better ingestion observability

Production deployment

Expanded test coverage

Improved AI response handling

Advanced search controls

🎯 Project Goals

NexaRAG aims to provide a developer-friendly foundation for building
private, tenant-isolated AI knowledge systems.

The core idea is simple:

Your documents → your knowledge base → your retrieval → grounded AI
answers.

Instead of sending an entire document collection to an LLM, NexaRAG
retrieves the most relevant information first and uses that context to
generate an answer.

👨‍💻 Author

Eshrak Solkar

Full Stack Developer
Mumbai, India

GitHub: @eshrak16

LinkedIn: Eshrak Solkar

Portfolio:
portfolio-eshrak16.vercel.app

📄 License

Add the project's chosen license here before publishing the repository
publicly.

<p align="center">

Built with React, TypeScript, Fastify, PostgreSQL, pgvector, and RAG.

</p>
