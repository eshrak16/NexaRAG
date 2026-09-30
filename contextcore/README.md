# ContextCore

ContextCore is a production-oriented backend foundation for a RAG knowledge base engine. The project currently focuses on a clean, extensible Node.js + TypeScript API foundation for future phases such as data persistence, caching, and AI integrations.

## Architecture

The backend is organized around a small, modular Fastify application:

- `src/server.ts` starts the HTTP server and manages lifecycle events.
- `src/app.ts` builds the Fastify instance and registers shared plugins, routes, and error handling.
- `src/config/env.ts` validates environment configuration with Zod.
- `src/routes/health.route.ts` exposes health and readiness endpoints.

## Current Technology Stack

- Node.js
- TypeScript
- Fastify
- Zod
- dotenv
- CORS support

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Update values as needed.
4. Start the server in development mode:
   ```bash
   npm run dev
   ```

## Environment Variables

The application validates the following values:

- `NODE_ENV` — `development`, `test`, or `production`
- `PORT` — HTTP port for the API
- `DATABASE_URL` — PostgreSQL connection string, currently optional until integration is implemented
- `REDIS_URL` — Redis connection string, currently optional until integration is implemented
- `DATABASE_HOST` — placeholder host for future database wiring
- `DATABASE_PORT` — placeholder port for future database wiring
- `REDIS_HOST` — placeholder host for future Redis wiring
- `REDIS_PORT` — placeholder port for future Redis wiring
- `JWT_SECRET` — placeholder for future auth work
- `OPENROUTER_API_KEY` — placeholder for future AI integration
- `CORS_ORIGIN` — allowed origin for browser clients

See `.env.example` for the template values.

## Available Commands

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Health Endpoints

- `GET /api/v1/health`
- `GET /api/v1/health/ready`

### Example Response

```json
{
  "status": "ok",
  "service": "contextcore-api",
  "timestamp": "2026-09-03T00:00:00.000Z"
}
```

## Semantic Search and RAG Answers

Semantic search uses the local BGE embedding model:

- `POST /api/v1/knowledge-bases/:knowledgeBaseId/search`

RAG answer generation retrieves authorized chunks through the same semantic-search service, then asks the configured LLM to answer only from that context:

- `POST /api/v1/knowledge-bases/:knowledgeBaseId/ask`
- Requires `Authorization: Bearer <access-token>`.
- The caller must be a member of the knowledge base's organization. Authorization is checked before query embedding or document retrieval.
- `topK` is optional (default `5`, maximum `20`).
- Set `LLM_PROVIDER=groq`, `LLM_API_KEY`, and `LLM_MODEL` to enable answer generation. Leave `LLM_PROVIDER` unset to disable it; `/ask` then returns a safe configuration error without calling an LLM.
- Retrieved text is treated as untrusted context. Returned citations are assembled from retrieved source references; unknown model references are rejected.

Example request:

```http
POST /api/v1/knowledge-bases/kb-id/ask
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "query": "What does the document explain?",
  "topK": 5
}
```

The response includes `knowledgeBaseId`, `query`, `answer`, citations with document and chunk identifiers, retrieval provider/model/count metadata, and LLM provider/model metadata. With no retrieved chunks or no valid source references, the answer states that the available documents do not provide enough information.

Example response shape:

```json
{
  "knowledgeBaseId": "kb-id",
  "query": "What does the document explain?",
  "answer": "It explains ...",
  "citations": [
    {
      "sourceRef": "S1",
      "documentId": "document-id",
      "documentName": "guide.pdf",
      "chunkId": "chunk-id",
      "chunkIndex": 2
    }
  ],
  "retrieval": {
    "provider": "local",
    "model": "BAAI/bge-small-en-v1.5",
    "dimensions": 384,
    "topK": 5,
    "retrievedChunks": 1
  },
  "generation": {
    "provider": "groq",
    "model": "configured-model-id"
  }
}
```

The Groq provider uses the OpenAI-compatible Chat Completions endpoint. See [Groq's API reference](https://console.groq.com/docs/api-reference) and [OpenAI compatibility guide](https://console.groq.com/docs/openai).

## Document Upload and Ingestion

Authenticated users with OWNER, ADMIN, or MEMBER access to a knowledge base can upload `.pdf`, `.docx`, and `.txt` documents. PDF and DOCX files are parsed as text; TXT files must contain valid UTF-8. Uploaded content is stored under a server-generated filename outside any public asset directory, chunked with the existing ingestion service, and embedded with the configured local BGE provider before the document is returned as READY.

Endpoint:

```http
POST /api/v1/knowledge-bases/:knowledgeBaseId/documents/upload
Authorization: Bearer <access-token>
Content-Type: multipart/form-data
```

Send one multipart file part named `file`. The default maximum is 10 MB. Set `MAX_UPLOAD_SIZE_MB` to an integer from 1 through 50 to change it; Fastify rejects files exceeding that limit. A successful request returns the document ID and processing status. Extraction or embedding failures return the document with status `FAILED` and a safe processing message.

PowerShell example:

```powershell
$headers = @{ Authorization = "Bearer $accessToken" }
$form = @{ file = Get-Item ".\handbook.pdf" }
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/v1/knowledge-bases/$knowledgeBaseId/documents/upload" `
  -Headers $headers -Form $form
```

Common errors include `401` for a missing or invalid token, `403` for a user without OWNER/ADMIN/MEMBER access, `413 FILE_TOO_LARGE` for uploads over the configured maximum, and `400 UPLOAD_ERROR` for missing files, unsupported extensions, mismatched content types, or malformed request data. A file that is accepted but cannot be extracted or embedded is recorded as `FAILED`.

## Frontend Dashboard

The standalone React/Vite dashboard lives in `frontend/` and does not change the backend package. Set `VITE_API_BASE_URL` in `frontend/.env` if the API is not at `http://localhost:3000/api/v1`, then run:

```bash
cd frontend
npm install
npm run dev
```

The dashboard uses the existing login, organization, knowledge-base, document, upload, and `/ask` routes. Chunk counts, processing-job summaries, user directory, activity logs, bookmarks, and notifications are shown as unavailable because the current API does not expose those endpoints.

## Roadmap

- Phase 1: backend foundation and health checks
- Phase 2: PostgreSQL and Redis configuration scaffolding, readiness checks, and service boundaries
- Phase 3: application modules and domain services
- Phase 4: RAG ingestion and retrieval workflows
- Phase 5: LLM and external AI integrations

## Notes

This phase intentionally excludes authentication, database implementations, embeddings, vector search, and AI orchestration until those systems are scoped and implemented in later milestones.
