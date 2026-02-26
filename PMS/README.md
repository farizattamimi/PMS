# PMS (Property Management System)

Multi-family property management platform built with Next.js App Router, Prisma, and NextAuth.

## Stack

- Next.js 13 (App Router)
- React 18 + TypeScript
- Prisma + PostgreSQL
- NextAuth (credentials provider)
- Tailwind CSS

## Requirements

- Node.js 18+
- npm 9+
- PostgreSQL

## Setup

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env.local
```

If `.env.example` does not exist, create `.env.local` with the variables below.

3. Configure environment variables

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"

# Required in production for cron endpoints
CRON_SECRET="replace-with-a-long-random-secret"

# Optional: AI features
ANTHROPIC_API_KEY=""

# Optional: SMTP notifications
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@pms.app"
```

4. Generate Prisma client and run migrations

```bash
npm run db:generate
npm run db:migrate
```

5. Seed development data (optional)

```bash
npm run db:seed
```

6. Start dev server

```bash
npm run dev
```

## Scripts

- `npm run dev` - start local server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint checks
- `npm run db:migrate` - run Prisma migrations
- `npm run db:generate` - generate Prisma client
- `npm run db:seed` - seed database
- `npm run db:studio` - open Prisma Studio

## Auth and Access Model

- `ADMIN`: global access across properties
- `MANAGER`: scoped access to managed properties
- `TENANT`: access to tenant-owned records and tenant dashboard routes

Authorization is enforced in middleware and API route-level checks.

## Cron Endpoints

- `GET /api/cron/lease-expiry`
- `GET /api/cron/pm-due`

Provide secret via either:

- Query: `?secret=<CRON_SECRET>`
- Header: `Authorization: Bearer <CRON_SECRET>`

In production, `CRON_SECRET` is required and requests fail if missing.

## Notes

- Build may need network access because `app/layout.tsx` uses `next/font/google` for Inter.
- Uploaded documents are stored under `public/uploads/documents`.
