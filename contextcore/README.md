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

## Roadmap

- Phase 1: backend foundation and health checks
- Phase 2: PostgreSQL and Redis configuration scaffolding, readiness checks, and service boundaries
- Phase 3: application modules and domain services
- Phase 4: RAG ingestion and retrieval workflows
- Phase 5: LLM and external AI integrations

## Notes

This phase intentionally excludes authentication, database implementations, embeddings, vector search, and AI orchestration until those systems are scoped and implemented in later milestones.
