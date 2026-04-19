<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the HappyRobot hackathon project.

## This pass

- **Session replay** enabled in `instrumentation-client.ts` with `disable_session_recording: false`, `maskAllInputs: true` (keeps phone / OTP / name inputs out of recordings), and `maskTextSelector: "[data-ph-mask]"` for any future elements you want redacted.
- **EU reverse proxy** confirmed in `next.config.ts` — `/ingest/*` → `eu.i.posthog.com`, `/ingest/static/*` → `eu-assets.i.posthog.com`, with `skipTrailingSlashRedirect: true`.
- **New funnel / churn / failure events** added:
  - `call_trigger_failed` (server) in `app/api/call/route.ts` — fires when HappyRobot returns non-2xx and the session row is rolled back.
  - `account_deleted` (server) in `app/actions/profile.ts` — churn event, captured after the Supabase user is deleted and before `signOut`.
  - `user_signed_out` (server) in `app/actions/auth.ts` — soft churn signal.
- **Error tracking** reinforced: `posthog.captureException(err)` added to the call-start catch in `app/page.tsx` to ensure handled errors still reach Error Tracking (unhandled ones are already auto-captured via `capture_exceptions: true`).

## Prior passes

- `instrumentation-client.ts` initialises `posthog-js` via the EU reverse proxy (`api_host: "/ingest"`, `ui_host: "https://eu.posthog.com"`), `defaults: "2026-01-30"`, `capture_exceptions: true`.
- `app/lib/posthog-server.ts` provides a singleton `posthog-node` client for Server Actions and API routes.
- `app/sign-in/page.tsx` — `sign_in_otp_requested`.
- `app/sign-in/verify/page.tsx` — `posthog.identify(userId, { phone })`, `otp_verified`, `otp_verification_failed`.
- `app/onboarding/page.tsx` — `onboarding_completed` (with `has_profile_picture`, `has_linkedin_url`).
- `app/page.tsx` — `call_requested`, `call_all_answered`, `call_failed`.
- `app/api/call/route.ts` — `call_initiated` (with `session_id`, `phone_number`, `remaining_questions`).
- `app/api/hr-webhook/route.ts` — `answer_recorded` (with `question_id`, `choice`, `raw_answer`, `session_id`).

## Event catalog

| Event | Description | File |
|---|---|---|
| `sign_in_otp_requested` | User submits phone number to receive OTP | `app/sign-in/page.tsx` |
| `otp_verified` | User successfully verifies OTP and signs in | `app/sign-in/verify/page.tsx` |
| `otp_verification_failed` | User's OTP verification attempt fails | `app/sign-in/verify/page.tsx` |
| `onboarding_completed` | User saves their profile for the first time | `app/onboarding/page.tsx` |
| `call_requested` | User clicks the Call Me button | `app/page.tsx` |
| `call_all_answered` | All questions already answered — call skipped | `app/page.tsx` |
| `call_failed` | The AI call failed to start (client-side) | `app/page.tsx` |
| `call_initiated` | Server successfully started an AI call via HappyRobot | `app/api/call/route.ts` |
| `call_trigger_failed` | HappyRobot API returned non-2xx (server-side) | `app/api/call/route.ts` |
| `answer_recorded` | Webhook received and persisted a survey answer | `app/api/hr-webhook/route.ts` |
| `user_signed_out` | Server signed the user out | `app/actions/auth.ts` |
| `account_deleted` | Server wiped answers, sessions, storage, and the auth user | `app/actions/profile.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://eu.posthog.com/project/162331/dashboard/630735
- **Sign-in to Call conversion funnel**: https://eu.posthog.com/project/162331/insights/KN8VBEn8
- **Daily call activity**: https://eu.posthog.com/project/162331/insights/o9N9ffL8
- **Answers recorded per day**: https://eu.posthog.com/project/162331/insights/WlhvF7gj
- **New users (onboarding completed)**: https://eu.posthog.com/project/162331/insights/TAU0PSYN
- **Answer distribution by question**: https://eu.posthog.com/project/162331/insights/mKy5zlWw

Suggested follow-up insights to build from the new events:

- **Failure-rate trend**: `call_trigger_failed` / `call_initiated` over time.
- **Churn counter**: daily count of `account_deleted` and `user_signed_out`.
- **Session replay filter**: recordings where `call_failed` or `call_trigger_failed` fired — useful for debugging bad call attempts end-to-end.

Mark any additional PII elements with `data-ph-mask` in the DOM and they'll be redacted in session replays alongside inputs.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
