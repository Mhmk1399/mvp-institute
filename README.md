# newinstitute

A minimal, clean starting point: **Next.js + MongoDB (Mongoose)** with a
**self-contained authentication system** (no third-party auth library).

Scope is intentionally tiny — a home page, sign-up / sign-in / sign-out, and a
single `User` model. Nothing else.

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind CSS v4
- MongoDB via **Mongoose**
- Auth: email + password, **scrypt** hashing, **HMAC-SHA256 JWT** in an httpOnly
  cookie — built only on Node's `crypto`.

## Getting started

```bash
# 1. Start MongoDB (or point MONGODB_URI at MongoDB Atlas)
docker compose up -d

# 2. Configure env
cp .env.example .env
#   then set AUTH_SECRET, e.g.:  openssl rand -base64 32

# 3. Run
npm run dev
```

Open http://localhost:3000 — create an account, and you'll land back on the
home page signed in.

## Where things are

| Path | What it does |
| --- | --- |
| `lib/env.ts` | Validates `MONGODB_URI` and `AUTH_SECRET`. |
| `lib/db/mongoose.ts` | Cached Mongoose connection. |
| `lib/models/user.ts` | The only model. |
| `lib/auth/crypto.ts` | scrypt password hashing + JWT sign/verify (pure). |
| `lib/auth/session.ts` | Cookie set/clear + `getCurrentUser()`. |
| `lib/validation/auth.ts` | Zod schemas for the forms. |
| `actions/auth.ts` | `signUpAction` / `signInAction` / `signOutAction`. |
| `app/page.tsx` | Home — shows the signed-in user or sign-in / sign-up links. |
| `app/(auth)/*` | Sign-in and sign-up screens. |
| `components/auth-form.tsx` | The shared client form. |
