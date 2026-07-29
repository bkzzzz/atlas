# Atlas

Creative software for directing original 2D game assets.

The creation flow is intentionally focused: add an optional reference image,
choose an asset type, visual style, and view, then generate. A short creative
prompt is optional.

## Features

- Optional PNG, JPEG, or WebP reference image
- Character, item, icon, and scenery presets
- Pixel, 2D fantasy, and storybook art directions
- Front, side, isometric, and top-down views
- One-step generation and PNG download
- Product-led workbench with interactive style, camera, and output previews
- Responsive interface with keyboard and reduced-motion support

The current build returns generated images directly to the browser. Download
anything you want to keep before refreshing the page.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- SQLite
- OpenAI API

## Architecture

```text
Optional reference + required presets + optional prompt
                         ↓
             Server-side validation
                         ↓
          Deterministic prompt compiler
                         ↓
       OpenAI image generation or editing
                         ↓
            Browser preview + download
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

   Set `DATABASE_URL`, `OPENAI_API_KEY`, and `OPENAI_IMAGE_MODEL` in
   `.env.local`. Never commit this file.

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
