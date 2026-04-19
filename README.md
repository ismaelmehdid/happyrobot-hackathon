# Konbini Happy Robot

AI-powered phone survey booth. The AI calls people, asks 10 questions, and streams their answers back into a live dashboard.

Built with [Next.js 16](https://nextjs.org), [Supabase Auth](https://supabase.com) (SMS OTP via Twilio), and [HappyRobot](https://platform.happyrobot.ai) for the calls.

## Quick start

```bash
pnpm install
cp ../.env.template .env.local   # fill in the 4 values below
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/sign-in` — enter a phone number, receive an SMS, verify, and land on the dashboard.

## Environment variables

You need **4 values** in `happyrobot/.env.local`:

```bash
HAPPYROBOT_API_KEY=
PUBLIC_BASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

### `PUBLIC_BASE_URL` — get this with ngrok

HappyRobot needs to reach your local machine via a public URL to POST call results to `/api/hr-webhook`. [ngrok](https://ngrok.com) gives you one for free.

```bash
# 1. Install ngrok
brew install ngrok          # macOS
# or: https://ngrok.com/download

# 2. Authenticate (one-time, grab the token from https://dashboard.ngrok.com)
ngrok config add-authtoken <YOUR_NGROK_TOKEN>

# 3. Tunnel to your dev server
ngrok http 3000
```

ngrok prints a line like:

```
Forwarding   https://pitiful-unspanked-ching.ngrok-free.dev -> http://localhost:3000
```

Paste that `https://...ngrok-free.dev` URL as `PUBLIC_BASE_URL` in `.env.local`.

> **Tip:** get a [free static ngrok domain](https://dashboard.ngrok.com/domains) so the URL doesn't change every restart.

### `HAPPYROBOT_API_KEY`

Get your own from [platform.happyrobot.ai](https://platform.happyrobot.ai) → Settings → API keys (format: `sk_live_...`).

### `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard), then:

- **URL**: Project Settings → Data API → Project URL
- **Publishable key**: Project Settings → API keys → Publishable key (`sb_publishable_...`)

To enable phone login, also go to **Authentication → Providers → Phone**, enable it, and paste your Twilio Account SID, Auth Token, and Message Service SID.

## Participants list

The cast of people the AI can dial lives in [`public/participants.json`](public/participants.json). The frontend fetches it at runtime. Replace it with your own roster — each entry needs at minimum an `id`, `name`, `handle`, and `city`; add `phone` to make someone callable, plus optional `linkedinUrl`, `headline`, `profilePicture`, `company`, `title`.

### 🤝 Don't want to set it all up?

If you'd rather skip provisioning your own HappyRobot + Supabase projects and just run the demo, [message me](mailto:ismaelmehdidwork@gmail.com) — I can share working credentials, and the `participants.json` content too if you want the original cast.

## Useful scripts

```bash
pnpm dev      # start dev server on :3000
pnpm build    # production build
pnpm start    # run production build
pnpm lint     # eslint
```

## Project layout

```
app/
  api/              route handlers (call, stream, answers, hr-webhook)
  lib/supabase/     client + server helpers
  lib/data.ts       question list, participant types
  sign-in/          phone + OTP flow (2 steps)
  actions/auth.ts   sign-out server action
proxy.ts            Supabase session refresh + auth gating
```
