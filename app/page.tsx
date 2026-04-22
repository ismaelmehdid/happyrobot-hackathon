"use client";

import { useEffect, useMemo, useState } from "react";
import {
  QUESTIONS,
  ensureSeeded,
  type Person,
} from "./lib/data";
import { createClient } from "./lib/supabase/client";
import posthog from "posthog-js";

const ACCENTS = [
  "bg-pink text-white",
  "bg-yellow text-ink",
  "bg-ink text-yellow",
] as const;

type LiveStatus = "idle" | "calling" | "live" | "error";
type Me = {
  id: string;
  phone: string;
  name: string;
  realName?: string;
  profilePicture?: string;
};

type AnswerRow = {
  user_id: string;
  question_id: string;
  choice: "A" | "B";
};

function questionsForAgent(): string {
  return QUESTIONS.map((q) => {
    const aliasesA = q.aliasesA?.length
      ? ` (accept as A: ${q.aliasesA.map((s) => `"${s}"`).join(", ")})`
      : "";
    const aliasesB = q.aliasesB?.length
      ? ` (accept as B: ${q.aliasesB.map((s) => `"${s}"`).join(", ")})`
      : "";
    return `[${q.id}] ${q.label}: Option A « ${q.a} »${aliasesA} — Option B « ${q.b} »${aliasesB}`;
  }).join("\n");
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.602 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.777 13.019H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export default function Home() {
  const [people, setPeople] = useState<Person[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Gate Realtime on the auth session — the websocket must send the user's
    // access_token, otherwise RLS evaluates the subscription as anon and
    // silently drops every change event. subscribe() MUST run after setAuth()
    // or the race leaves the channel joined as anon (SUBSCRIBED, but filtered).
    (async () => {
      ensureSeeded().then(({ list }) => {
        if (cancelled) return;
        setPeople(list);
        setHydrated(true);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = sessionData.session;
      if (session) {
        const u = session.user;
        const phone = normalizePhone(u.phone ?? "");
        const meta = u.user_metadata as
          | {
              display_name?: string;
              full_name?: string;
              profile_picture_url?: string;
            }
          | null;
        const metaName = meta?.display_name || meta?.full_name;
        const realName = metaName || u.email || undefined;
        const name = realName || phone || "You";
        if (phone)
          setMe({
            id: u.id,
            phone,
            name,
            realName,
            profilePicture: meta?.profile_picture_url,
          });
        await supabase.realtime.setAuth(session.access_token);
      }

      const { data: initial, error } = await supabase
        .from("answers")
        .select("user_id, question_id, choice");
      if (cancelled) return;
      if (error) {
        console.error("[answers] fetch failed", error);
      } else {
        setAnswers((initial as AnswerRow[]) ?? []);
      }

      channel = supabase
        .channel("answers-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "answers" },
          async () => {
            const { data } = await supabase
              .from("answers")
              .select("user_id, question_id, choice");
            if (cancelled) return;
            setAnswers((data as AnswerRow[]) ?? []);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function startLiveCall() {
    if (!me) return;
    if (liveStatus === "calling" || liveStatus === "live") return;
    setLiveError(null);
    setLiveStatus("calling");
    posthog.capture("call_requested", { phone: me.phone });
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: me.phone,
          ...(me.realName ? { contact_name: me.realName } : {}),
          questions: questionsForAgent(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        posthog.capture("call_failed", {
          phone: me.phone,
          error: typeof data?.error === "string" ? data.error : "unknown",
          status: res.status,
        });
        setLiveStatus("error");
        setLiveError(
          typeof data?.error === "string"
            ? data.error
            : "Couldn't start the call. Please try again.",
        );
        return;
      }
      if (data?.allAnswered) {
        posthog.capture("call_all_answered", { phone: me.phone });
        setLiveStatus("idle");
        setLiveError("You've already answered every question. Thanks!");
        return;
      }
      setLiveStatus("live");
    } catch (err) {
      console.error("[call] start failed", err);
      posthog.capture("call_failed", {
        phone: me.phone,
        error: err instanceof Error ? err.message : "unknown",
        status: null,
      });
      posthog.captureException(err);
      setLiveStatus("error");
      setLiveError("Couldn't start the call. Please try again.");
    }
  }

  function stopLiveCall() {
    setLiveStatus("idle");
  }

  const stats = useMemo(() => {
    const byQuestion = new Map<string, { a: number; b: number }>();
    for (const row of answers) {
      const bucket = byQuestion.get(row.question_id) ?? { a: 0, b: 0 };
      if (row.choice === "A") bucket.a += 1;
      else if (row.choice === "B") bucket.b += 1;
      byQuestion.set(row.question_id, bucket);
    }
    return QUESTIONS.map((q) => {
      const bucket = byQuestion.get(q.id) ?? { a: 0, b: 0 };
      const total = bucket.a + bucket.b;
      const aPct = total ? Math.round((bucket.a / total) * 100) : 0;
      const bPct = total ? 100 - aPct : 0;
      return { q, a: bucket.a, b: bucket.b, total, aPct, bPct };
    });
  }, [answers]);

  const myAnswers = useMemo(() => {
    if (!me) return new Map<string, "A" | "B">();
    const map = new Map<string, "A" | "B">();
    for (const row of answers) {
      if (row.user_id === me.id) map.set(row.question_id, row.choice);
    }
    return map;
  }, [answers, me]);

  const totalAnswers = answers.length;
  const respondents = new Set(answers.map((a) => a.user_id)).size;
  const completeRespondents = Array.from(
    answers.reduce((map, row) => {
      map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).values(),
  ).filter((count) => count === QUESTIONS.length).length;
  const maxVotes = Math.max(1, ...stats.map((s) => Math.max(s.a, s.b)));

  const isCalling = liveStatus === "calling" || liveStatus === "live";

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Hero */}
      <section className="border-2 border-ink bg-ink text-cream p-5 sm:p-8 mb-6 relative overflow-hidden">
        <span className="display text-sm bg-yellow text-ink px-2 py-1 inline-block mb-3">
          THE VERDICT
        </span>
        <h1 className="display text-4xl sm:text-5xl md:text-7xl leading-[0.9] break-words">
          THE FRENCH TECH
          <br />
          <span className="text-pink">HAS SPOKEN</span>
        </h1>
        <p className="mt-4 max-w-xl opacity-80">
          AI calls people, asks 10 dumb questions, spits out stats. Hit CALL ME
          to take the survey yourself.
        </p>
      </section>

      {/* Call me */}
      <section className="border-2 border-ink bg-cream p-5 mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="display text-3xl leading-none">
              <span className="bg-pink text-white px-2">CALL ME</span>
            </h2>
            <p className="text-xs opacity-70 mt-2">
              We dial your number and ask the 10 questions. Your answers feed
              the stats below, live.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-xs border-2 border-ink px-2 py-1 bg-cream">
              {me ? me.phone : "No phone on file"}
            </span>
            <span
              className={`display text-xs border-2 border-ink px-2 py-1 ${
                liveStatus === "live"
                  ? "bg-pink text-white"
                  : liveStatus === "calling"
                    ? "bg-yellow text-ink"
                    : liveStatus === "error"
                      ? "bg-ink text-cream"
                      : "bg-cream"
              }`}
            >
              {liveStatus === "idle" && "Ready"}
              {liveStatus === "calling" && "Dialing…"}
              {liveStatus === "live" && "On air"}
              {liveStatus === "error" && "Error"}
            </span>
            {isCalling ? (
              <button
                onClick={stopLiveCall}
                className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow"
              >
                Done
              </button>
            ) : (
              <button
                onClick={startLiveCall}
                disabled={!me}
                className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📞 Call me
              </button>
            )}
          </div>
        </div>

        {liveError && (
          <div className="border-2 border-ink bg-ink text-cream p-3 mt-4 display text-sm">
            {liveError}
          </div>
        )}
      </section>

      {/* Top stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Respondents"
          value={hydrated ? respondents : 0}
          tone="bg-yellow text-ink"
        />
        <StatCard
          label="Completed"
          value={hydrated ? completeRespondents : 0}
          tone="bg-pink text-white"
        />
        <StatCard
          label="Answers"
          value={hydrated ? totalAnswers : 0}
          tone="bg-cream text-ink"
        />
        <StatCard
          label="Questions"
          value={QUESTIONS.length}
          tone="bg-ink text-yellow"
        />
      </section>

      {/* Bar chart */}
      <section className="border-2 border-ink bg-cream p-5 mb-6">
        <div className="flex items-end justify-between mb-5">
          <h2 className="display text-3xl">
            <span className="bg-pink text-white px-2">BARCHART</span>
          </h2>
          <div className="flex items-center gap-3 text-xs display">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-ink bg-yellow inline-block" />{" "}
              A
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-ink bg-pink inline-block" />{" "}
              B
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2 md:gap-3 h-56 border-b-2 border-ink">
          {stats.map((s, i) => {
            const aH = Math.round((s.a / maxVotes) * 100);
            const bH = Math.round((s.b / maxVotes) * 100);
            return (
              <div
                key={s.q.id}
                className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0"
                title={`${s.q.a} vs ${s.q.b} — ${s.a}/${s.b}`}
              >
                <div className="flex items-end gap-0.5 md:gap-1 w-full h-full justify-center">
                  <div
                    className="bg-yellow border-2 border-ink w-1/2 transition-all duration-500 flex items-start justify-center text-[10px] display pt-1"
                    style={{ height: `${aH}%` }}
                  >
                    {s.a > 0 && aH > 18 ? s.a : ""}
                  </div>
                  <div
                    className="bg-pink border-2 border-ink w-1/2 transition-all duration-500 flex items-start justify-center text-[10px] display pt-1 text-white"
                    style={{ height: `${bH}%` }}
                  >
                    {s.b > 0 && bH > 18 ? s.b : ""}
                  </div>
                </div>
                <div className="display text-[10px] opacity-70">
                  {String(i + 1).padStart(2, "0")}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 10 duels */}
      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">10 DUELS</span>
        </h2>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        {stats.map((s, i) => (
          <div key={s.q.id} className="border-2 border-ink overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b-2 border-ink bg-cream">
              <span className="display text-2xl text-pink leading-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="display text-xs opacity-70 flex-1">{s.q.label}</span>
              <span className="display text-xs border-2 border-ink px-2 py-1">
                {s.total} vote{s.total > 1 ? "s" : ""}
              </span>
            </div>

            {/* Option A — white background */}
            <div className="bg-white p-6 border-b-2 border-ink flex flex-col items-center justify-center min-h-[120px] text-center">
              {s.total > 0 && <div className="display text-[10px] opacity-40 mb-1">{s.aPct}%</div>}
              <div className="display text-4xl sm:text-5xl leading-none uppercase font-black text-ink break-words">
                {s.q.a}
              </div>
            </div>

            {/* Option B — black background */}
            <div className="bg-ink p-6 flex flex-col items-center justify-center min-h-[120px] text-center">
              {s.total > 0 && <div className="display text-[10px] opacity-40 mb-1 text-cream">{s.bPct}%</div>}
              <div className="display text-4xl sm:text-5xl leading-none uppercase font-black text-cream break-words">
                {s.q.b}
              </div>
            </div>

            {/* Colorful stripe */}
            <div className="flex h-2">
              <div className="flex-1 bg-yellow" />
              <div className="flex-1 bg-[#2563EB]" />
              <div className="flex-1 bg-pink" />
              <div className="flex-1 bg-[#2563EB]" />
              <div className="flex-1 bg-yellow" />
              <div className="flex-1 bg-pink" />
            </div>
          </div>
        ))}
      </section>

      {/* Cast */}
      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">THE CAST</span>
        </h2>
        <p className="text-sm opacity-70">The roster.</p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {people.map((p, i) => {
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <div
              key={p.id}
              className="text-left border-2 border-ink bg-cream p-3"
            >
              <div
                className={`aspect-square ${accent} display text-4xl flex items-center justify-center border-2 border-ink mb-2 overflow-hidden relative`}
              >
                {p.profilePicture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.profilePicture}
                    alt={p.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  initials(p.name)
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="display text-base leading-tight truncate">
                    {p.name}
                  </div>
                  <div className="text-xs opacity-60 truncate">
                    {p.title ? p.title : p.city}
                  </div>
                </div>
                {p.linkedinUrl && (
                  <a
                    href={p.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.name} on LinkedIn`}
                    title={`${p.name} on LinkedIn`}
                    className="shrink-0 border-2 border-ink bg-[#0A66C2] text-white p-1 hover:bg-ink transition-colors"
                  >
                    <LinkedInIcon className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Live call popup — visible while dialing / on air */}
      {isCalling && <LiveCallPopup me={me} myAnswers={myAnswers} liveStatus={liveStatus} onClose={stopLiveCall} />}
    </div>
  );
}

function LiveCallPopup({
  me,
  myAnswers,
  liveStatus,
  onClose,
}: {
  me: Me | null;
  myAnswers: Map<string, "A" | "B">;
  liveStatus: LiveStatus;
  onClose: () => void;
}) {
  const total = QUESTIONS.length;
  const answeredCount = myAnswers.size;
  const pct = Math.round((answeredCount / total) * 100);
  const isDialing = liveStatus === "calling";
  const isDone = answeredCount >= total;

  // Active question = first one without an answer (null when done).
  const activeIndex = QUESTIONS.findIndex((q) => !myAnswers.has(q.id));
  const q = activeIndex === -1 ? null : QUESTIONS[activeIndex];
  const qIndex = activeIndex === -1 ? total - 1 : activeIndex;

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl border-2 border-ink bg-cream max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Header strip */}
        <section className="bg-ink text-cream p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="display text-xs text-yellow flex items-center gap-2 flex-wrap">
              <span className={isDialing ? "animate-pulse" : ""}>☎ LIVE CALL</span>
              {me?.phone && (
                <span className="opacity-60 font-mono truncate">— {me.phone}</span>
              )}
            </div>
            <div className="display text-2xl sm:text-3xl leading-none mt-1 truncate">
              {me?.name ?? "YOU"}
            </div>
          </div>
          <div className="display text-xs border-2 border-yellow px-2 py-1 shrink-0">
            {String(answeredCount).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </div>
          <button
            onClick={onClose}
            className="display text-sm border-2 border-yellow px-3 py-2 bg-ink text-yellow hover:bg-pink hover:text-white hover:border-pink shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </section>

        {/* Progress bar */}
        <div className="border-b-2 border-ink h-3 bg-cream overflow-hidden">
          <div
            className="bg-pink h-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stage */}
        <section className="min-h-[420px] p-5 sm:p-8 md:p-12 flex flex-col justify-center relative overflow-hidden">
          {isDialing && answeredCount === 0 ? (
            <div className="text-center">
              <div className="display text-sm text-pink mb-3 animate-pulse">
                CONNECTING…
              </div>
              <div className="display text-4xl sm:text-5xl md:text-7xl leading-[0.9] break-words">
                DIALING THE
                <br />
                NUMBER.
              </div>
            </div>
          ) : !isDone && q ? (
            <>
              <div className="flex items-baseline gap-3 sm:gap-4 mb-6 min-w-0">
                <span className="display text-5xl sm:text-6xl md:text-8xl text-pink leading-none shrink-0">
                  {String(qIndex + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="display text-xs opacity-70">{q.label}</div>
                  <div className="display text-2xl sm:text-3xl md:text-5xl leading-tight break-words">
                    {q.a} <span className="text-pink">vs</span> {q.b}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border-2 border-ink bg-cream p-5 sm:p-6 min-h-[120px] flex items-center justify-center text-center display text-xl sm:text-2xl md:text-3xl leading-tight break-words">
                  <div>
                    <div className="display text-xs opacity-60 mb-1">A</div>
                    {q.a}
                  </div>
                </div>
                <div className="border-2 border-ink bg-cream p-5 sm:p-6 min-h-[120px] flex items-center justify-center text-center display text-xl sm:text-2xl md:text-3xl leading-tight break-words">
                  <div>
                    <div className="display text-xs opacity-60 mb-1">B</div>
                    {q.b}
                  </div>
                </div>
              </div>

              <div className="mt-6 display text-sm text-center animate-pulse">
                AI IS ASKING…
              </div>
            </>
          ) : (
            <div className="absolute inset-0 bg-yellow flex flex-col items-center justify-center p-5 sm:p-8 text-center">
              <div className="display text-sm mb-2">CALL COMPLETE</div>
              <div className="display text-4xl sm:text-6xl md:text-8xl leading-[0.9] break-words">
                {total} ANSWERS
                <br />
                IN THE BAG.
              </div>
              <button
                onClick={onClose}
                className="mt-6 display text-sm border-2 border-ink px-5 py-3 bg-ink text-yellow hover:bg-pink hover:text-white"
              >
                See the stats →
              </button>
            </div>
          )}
        </section>

        {/* Answers recap */}
        <section className="border-t-2 border-ink p-5 grid grid-cols-5 md:grid-cols-10 gap-2">
          {QUESTIONS.map((question, i) => {
            const a = myAnswers.get(question.id);
            const active = i === qIndex && !isDone;
            // Swapping the React key when the state flips ("waiting" → "A"/"B")
            // forces a remount so the `answer-pop` animation fires exactly once.
            const slotKey = `${question.id}-${a ?? "waiting"}`;
            return (
              <div
                key={slotKey}
                className={`border-2 border-ink p-2 text-center display text-xs min-h-[56px] flex flex-col justify-center ${
                  a === "A"
                    ? "bg-ink text-yellow answer-pop"
                    : a === "B"
                      ? "bg-pink text-white answer-pop"
                      : active
                        ? "bg-yellow"
                        : "bg-cream opacity-60"
                }`}
              >
                <div className="opacity-70">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div>{a ? a : active ? "…" : "—"}</div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className={`border-2 border-ink p-5 ${tone}`}>
      <div className="display text-xs opacity-80">{label}</div>
      <div className="display text-5xl leading-none mt-1">{value}</div>
    </div>
  );
}
