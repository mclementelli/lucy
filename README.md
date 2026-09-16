# Lucy

Lucy is Orionix-AI's independent, mobile-first Personal Life Data Center. It is a Next.js PWA backed by Supabase Auth and Postgres with per-user Row Level Security.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set the public Supabase project URL and publishable key.
3. Run `pnpm install` and `pnpm dev`.

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never expose a Supabase secret key or service-role key in this application.

## Production

`main` is the production branch. Configure both public variables in Vercel for Production and Preview before deploying.
