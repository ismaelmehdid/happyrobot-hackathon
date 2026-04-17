"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  QUESTIONS,
  STORE_KEY,
  ensureSeeded,
  type Answers,
  type Person,
  type Question,
  type Store,
} from "../../lib/data";

type Phase = "dialing" | "asking" | "answered" | "done";

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStore(store: Store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toChoice(raw: string, q: Question): "a" | "b" | null {
  const s = raw.trim().toLowerCase();
  if (!s || s === "skipped") return null;
  if (s === "a" || s === "option a") return "a";
  if (s === "b" || s === "option b") return "b";
  const aL = q.a.toLowerCase();
  const bL = q.b.toLowerCase();
  if (s === aL) return "a";
  if (s === bL) return "b";
  if (aL.includes(s) || s.includes(aL)) return "a";
  if (bL.includes(s) || s.includes(bL)) return "b";
  return null;
}

export default function CallPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = decodeURIComponent(params?.id || "");
  const sessionId = searchParams?.get("session") ?? null;

  const [people, setPeople] = useState<Person[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("dialing");
  const [answers, setAnswers] = useState<Answers>({});
  const [rawAnswers, setRawAnswers] = useState<Record<number, string>>({});
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    ensureSeeded().then(({ list }) => {
      setPeople(list);
      setHydrated(true);
    });
  }, []);

  const person = useMemo(
    () => people.find((p) => p.id === id) ?? null,
    [people, id]
  );

  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (dialTimerRef.current) clearTimeout(dialTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!person) return;

    esRef.current?.close();
    if (pollRef.current) clearInterval(pollRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (dialTimerRef.current) clearTimeout(dialTimerRef.current);
    processedRef.current = new Set();

    setPhase("dialing");
    setQIndex(0);
    setAnswers({});
    setRawAnswers({});

    const prevStore = loadStore();
    const nextStore = { ...prevStore };
    delete nextStore[person.id];
    saveStore(nextStore);

    // Assume the agent finishes dialing + greeting in ~4s, then starts asking Q1.
    dialTimerRef.current = setTimeout(() => {
      setPhase((p) => (p === "dialing" ? "asking" : p));
    }, 4000);

    if (!sessionId) return;

    const applyEvent = (qn: number, raw: string) => {
      if (processedRef.current.has(qn)) return;
      processedRef.current.add(qn);

      const q = QUESTIONS[qn - 1];
      if (!q) return;

      setRawAnswers((prev) => ({ ...prev, [qn]: raw }));
      const choice = toChoice(raw, q);

      setAnswers((prev) => {
        const next: Answers = { ...prev };
        if (choice) next[q.id] = choice;
        const store = loadStore();
        store[person.id] = next;
        saveStore(store);
        return next;
      });

      // Flash "answered" for the question that just came in, pinned to its index.
      setQIndex(qn - 1);
      setPhase("answered");

      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (qn >= QUESTIONS.length) {
        advanceTimerRef.current = setTimeout(() => setPhase("done"), 900);
      } else {
        // After the flash, jump to "asking" the NEXT question.
        advanceTimerRef.current = setTimeout(() => {
          setQIndex(qn);
          setPhase("asking");
        }, 900);
      }
    };

    const es = new EventSource(
      `/api/stream?session=${encodeURIComponent(sessionId)}`
    );
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload?.type === "answer" && typeof payload.question_number === "number") {
          applyEvent(payload.question_number, String(payload.answer ?? ""));
        }
      } catch {}
    };

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/answers?session=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const { answers: evs } = (await r.json()) as {
          answers: { question_number: number; answer: string }[];
        };
        for (const a of evs) applyEvent(a.question_number, String(a.answer ?? ""));
      } catch {}
    }, 1500);

    return () => {
      es.close();
      if (pollRef.current) clearInterval(pollRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (dialTimerRef.current) clearTimeout(dialTimerRef.current);
    };
  }, [person?.id, sessionId]);

  if (hydrated && !person) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-24 text-center">
        <div className="display text-5xl mb-4">PERSON NOT FOUND</div>
        <p className="opacity-70 mb-6">
          This ID doesn&apos;t match any loaded participant.
        </p>
        <Link
          href="/admin"
          className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink"
        >
          Back to admin
        </Link>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-24 text-center opacity-60">
        <div className="display text-3xl animate-pulse">LOADING…</div>
      </div>
    );
  }

  const q = QUESTIONS[qIndex];
  const total = QUESTIONS.length;
  const answeredCount = Object.keys(answers).length;
  const pct = Math.round((answeredCount / total) * 100);
  const currentChoice = q ? answers[q.id] : undefined;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Header strip */}
      <section className="border-2 border-ink bg-ink text-cream p-5 mb-5 flex items-center gap-4">
        {person.profilePicture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.profilePicture}
            alt={person.name}
            className="w-16 h-16 object-cover border-2 border-yellow shrink-0"
          />
        ) : (
          <div className="w-16 h-16 bg-pink text-white border-2 border-yellow display text-2xl flex items-center justify-center shrink-0">
            {initials(person.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="display text-xs text-yellow flex items-center gap-2">
            <span className={phase === "dialing" ? "animate-pulse" : ""}>
              ☎ LIVE CALL
            </span>
            {person.phone && (
              <span className="opacity-60 font-mono">— {person.phone}</span>
            )}
          </div>
          <div className="display text-3xl leading-none mt-1 truncate">
            {person.name}
          </div>
          {person.title && (
            <div className="text-xs opacity-70 truncate">
              {person.title}
              {person.company ? ` @ ${person.company}` : ""}
            </div>
          )}
        </div>
        <div className="display text-xs border-2 border-yellow px-2 py-1 shrink-0">
          {String(Math.min(qIndex + (phase === "dialing" ? 0 : 1), total)).padStart(2, "0")}/
          {String(total).padStart(2, "0")}
        </div>
      </section>

      {/* Progress bar */}
      <div className="border-2 border-ink h-3 bg-cream mb-6 overflow-hidden">
        <div
          className="bg-pink h-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stage */}
      <section className="border-2 border-ink bg-cream min-h-[420px] p-8 md:p-12 flex flex-col justify-center relative overflow-hidden">
        {phase === "dialing" && (
          <div className="text-center">
            <div className="display text-sm text-pink mb-3 animate-pulse">
              CONNECTING…
            </div>
            <div className="display text-5xl md:text-7xl leading-[0.9]">
              DIALING THE
              <br />
              NUMBER.
            </div>
          </div>
        )}

        {phase !== "dialing" && q && (
          <>
            <div className="flex items-baseline gap-4 mb-6">
              <span className="display text-6xl md:text-8xl text-pink leading-none">
                {String(qIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="display text-xs opacity-70">{q.label}</div>
                <div className="display text-3xl md:text-5xl leading-tight">
                  {q.a} <span className="text-pink">vs</span> {q.b}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                className={`border-2 border-ink p-6 min-h-[120px] flex items-center justify-center text-center display text-2xl md:text-3xl leading-tight transition-all duration-500 ${
                  phase === "answered" && currentChoice === "a"
                    ? "bg-ink text-yellow scale-[1.02]"
                    : phase === "answered" && currentChoice === "b"
                    ? "bg-cream opacity-30"
                    : "bg-cream"
                }`}
              >
                <div>
                  <div className="display text-xs opacity-60 mb-1">A</div>
                  {q.a}
                </div>
              </div>
              <div
                className={`border-2 border-ink p-6 min-h-[120px] flex items-center justify-center text-center display text-2xl md:text-3xl leading-tight transition-all duration-500 ${
                  phase === "answered" && currentChoice === "b"
                    ? "bg-pink text-white scale-[1.02]"
                    : phase === "answered" && currentChoice === "a"
                    ? "bg-cream opacity-30"
                    : "bg-cream"
                }`}
              >
                <div>
                  <div className="display text-xs opacity-60 mb-1">B</div>
                  {q.b}
                </div>
              </div>
            </div>

            <div className="mt-6 display text-sm text-center">
              {phase === "asking" ? (
                <span className="animate-pulse">
                  AI IS ASKING…
                </span>
              ) : (
                <span className="text-pink">
                  ANSWER: {currentChoice === "a" ? "A" : "B"}
                </span>
              )}
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 bg-yellow flex flex-col items-center justify-center p-8 text-center">
            <div className="display text-sm mb-2">CALL COMPLETE</div>
            <div className="display text-6xl md:text-8xl leading-[0.9]">
              {total} ANSWERS
              <br />
              IN THE BAG.
            </div>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => router.push("/dashboard")}
                className="display text-sm border-2 border-ink px-5 py-3 bg-ink text-yellow hover:bg-pink hover:text-white"
              >
                View dashboard →
              </button>
              <Link
                href="/admin"
                className="display text-sm border-2 border-ink px-5 py-3 bg-cream hover:bg-pink hover:text-white"
              >
                Back to admin
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Answers recap */}
      <section className="mt-6 grid grid-cols-5 md:grid-cols-10 gap-2">
        {QUESTIONS.map((question, i) => {
          const a = answers[question.id];
          const active = i === qIndex && phase !== "done";
          return (
            <div
              key={question.id}
              className={`border-2 border-ink p-2 text-center display text-xs min-h-[56px] flex flex-col justify-center ${
                a === "a"
                  ? "bg-ink text-yellow"
                  : a === "b"
                  ? "bg-pink text-white"
                  : active
                  ? "bg-yellow"
                  : "bg-cream opacity-60"
              }`}
            >
              <div className="opacity-70">{String(i + 1).padStart(2, "0")}</div>
              <div>{a ? a.toUpperCase() : active ? "…" : "—"}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
