# Atlas Character Studio

AI-native character production workspace.

Atlas helps teams build, iterate on, and trace character-generation work as a durable production workflow—not a one-off chat experience.

## Features

- Persistent Character Memory
- Asset Versioning
- Generation History
- Feedback-driven Regeneration
- Generation Trace
- Provider Abstraction

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- OpenAI API

## Architecture

```text
Character
    ↓
Memory
    ↓
Context Compiler
    ↓
Provider
    ↓
Generation
    ↓
Validation
    ↓
History
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file from the safe template:

   ```bash
   cp .env.example .env.local
   ```

   Set `DATABASE_URL` and `OPENAI_API_KEY` in `.env.local`. Never commit this file.

3. Create the database schema:

   ```bash
   npx prisma migrate dev
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Repository Safety

Credentials and local database files are intentionally excluded from version control. Commit `prisma/schema.prisma` and migration files—not a database file—so each contributor can create their own database with Prisma.
