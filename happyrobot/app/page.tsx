"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  QUESTIONS,
  STORE_KEY,
  ensureSeeded,
  type Answers,
  type Person,
  type Store,
} from "./lib/data";

const ACCENTS = ["bg-pink text-white", "bg-yellow text-ink", "bg-ink text-yellow"] as const;

const LIVE_CALL_NUMBER = "+33652634191";
const LIVE_CALL_NAME = "Greg";

type LiveStatus = "idle" | "calling" | "live" | "error";
type LiveAnswers = Record<number, string>;

function questionsForAgent(): string {
  return QUESTIONS.map(
    (q, i) =>
      `${i + 1}. [${q.label}] Option A: « ${q.a} » — Option B: « ${q.b} »`
  ).join("\n");
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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

export default function Home() {
  const router = useRouter();
  const [store, setStore] = useState<Store>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roulette, setRoulette] = useState<
    { name: string; picture?: string; locked: boolean } | null
  >(null);

  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [liveAnswers, setLiveAnswers] = useState<LiveAnswers>({});
  const [liveError, setLiveError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setStore(loadStore());
    ensureSeeded().then(({ list }) => {
      setPeople(list);
      setHydrated(true);
    });
  }, []);

  async function startLiveCall() {
    if (liveStatus === "calling" || liveStatus === "live") return;
    eventSourceRef.current?.close();
    setLiveAnswers({});
    setLiveError(null);
    setLiveStatus("calling");
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: LIVE_CALL_NUMBER,
          contact_name: LIVE_CALL_NAME,
          questions: questionsForAgent(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveStatus("error");
        setLiveError(data?.error || `Erreur ${res.status}`);
        return;
      }
      const sessionId: string = data.sessionId;
      const es = new EventSource(`/api/stream?session=${encodeURIComponent(sessionId)}`);
      eventSourceRef.current = es;
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload?.type === "answer" && typeof payload.question_number === "number") {
            setLiveAnswers((prev) => ({
              ...prev,
              [payload.question_number]: String(payload.answer ?? ""),
            }));
          }
        } catch {}
      };
      es.onerror = () => {
        // Keep the UI in "live" until user retries; browser auto-reconnects.
      };
      setLiveStatus("live");
    } catch (err) {
      setLiveStatus("error");
      setLiveError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function stopLiveCall() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setLiveStatus("idle");
  }

  const selected = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [selectedId, people]
  );
  const selectedAnswers: Answers = (selected && store[selected.id]) || {};

  const totalAnswered = Object.values(store).filter(
    (a) => Object.keys(a).length === QUESTIONS.length
  ).length;

  const withPhone = people.filter((p) => p.phone).length;

  function updateAnswer(personId: string, qId: string, choice: "a" | "b") {
    setStore((prev) => {
      const next: Store = {
        ...prev,
        [personId]: { ...(prev[personId] || {}), [qId]: choice },
      };
      saveStore(next);
      return next;
    });
  }

  function randomise(personId: string) {
    setStore((prev) => {
      const answers: Answers = {};
      for (const q of QUESTIONS) {
        answers[q.id] = Math.random() > 0.5 ? "a" : "b";
      }
      const next = { ...prev, [personId]: answers };
      saveStore(next);
      return next;
    });
  }

  function reset(personId: string) {
    setStore((prev) => {
      const next = { ...prev };
      delete next[personId];
      saveStore(next);
      return next;
    });
  }

  function statusOf(id: string) {
    const count = Object.keys(store[id] || {}).length;
    if (count === 0) return { label: "PENDING", tone: "bg-cream border-ink text-ink" };
    if (count === QUESTIONS.length)
      return { label: "DONE", tone: "bg-ink text-yellow border-ink" };
    return { label: `${count}/${QUESTIONS.length}`, tone: "bg-pink text-white border-ink" };
  }

  async function callRandom() {
    const pool = people.filter((p) => p.phone);
    if (pool.length === 0) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    setBusy(true);

    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setRoulette({ name: pick.name, picture: pick.profilePicture, locked: false });
      const t = i / steps;
      const delay = 40 + Math.pow(t, 2.4) * 420;
      await new Promise((r) => setTimeout(r, delay));
    }
    setRoulette({ name: target.name, picture: target.profilePicture, locked: true });
    await new Promise((r) => setTimeout(r, 700));

    setRoulette(null);
    setBusy(false);
    router.push(`/call/${encodeURIComponent(target.id)}`);
  }

  async function callAll() {
    const targets = people.filter((p) => p.phone);
    if (targets.length === 0) return;
    if (!confirm(`Start ${targets.length} calls simultaneously?`)) return;
    router.push("/dashboard?live=1");
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      {/* Hero */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-10">
        <div className="md:col-span-8 border-2 border-ink bg-cream p-8 relative overflow-hidden">
          <span className="display text-sm bg-pink text-white px-2 py-1 inline-block mb-4">
            EXCLUSIVE
          </span>
          <h1 className="display text-6xl md:text-8xl leading-[0.85] mb-4">
            AI CALLS
            <br />
            <span className="text-pink">{hydrated ? people.length : "…"}</span>{" "}
            PARTICIPANTS
            <br />
            AND ASKS <span className="bg-yellow px-2">10 QUESTIONS</span>
          </h1>
          <p className="max-w-xl text-lg mt-4">
            Ten sharp dilemmas, an AI on the line, zero filter. Head to the{" "}
            <Link href="/dashboard" className="underline font-semibold text-pink">
              dashboard
            </Link>{" "}
            to see who caved.
          </p>
          <div className="absolute right-6 bottom-6 display text-8xl text-pink/20 leading-none select-none">
            {hydrated ? String(totalAnswered).padStart(2, "0") : "00"}
          </div>
        </div>
        <div className="md:col-span-4 grid grid-rows-3 gap-6">
          <div className="border-2 border-ink bg-pink text-white p-5">
            <div className="display text-xs opacity-80">RESPONDENTS</div>
            <div className="display text-5xl leading-none mt-1">{people.length}</div>
          </div>
          <div className="border-2 border-ink bg-yellow text-ink p-5">
            <div className="display text-xs opacity-80">QUESTIONS</div>
            <div className="display text-5xl leading-none mt-1">{QUESTIONS.length}</div>
          </div>
          <div className="border-2 border-ink bg-ink text-cream p-5">
            <div className="display text-xs opacity-60">COMPLETED</div>
            <div className="display text-5xl leading-none mt-1">
              {hydrated ? totalAnswered : 0}
            </div>
          </div>
        </div>
      </section>

      {/* Call actions */}
      <section className="border-2 border-ink bg-cream p-5 mb-6 flex flex-wrap gap-2 items-center">
        <button
          onClick={callRandom}
          disabled={busy || withPhone === 0}
          className="display text-sm border-2 border-ink px-4 py-3 bg-yellow text-ink hover:bg-ink hover:text-yellow disabled:opacity-40"
        >
          ☎ CALL RANDOM
        </button>
        <button
          onClick={callAll}
          disabled={busy || withPhone === 0}
          className="display text-sm border-2 border-ink px-4 py-3 bg-ink text-yellow hover:bg-pink hover:text-white disabled:opacity-40"
        >
          ☎ CALL ALL ({withPhone})
        </button>
        <span className="ml-auto display text-xs opacity-60">
          Random triggers a live call. Call all launches the live dashboard.
        </span>
      </section>

      {/* Live call */}
      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
          <h2 className="display text-3xl">
            <span className="bg-pink text-white px-2">LIVE</span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-xs border-2 border-ink px-2 py-1 bg-cream">
              {LIVE_CALL_NAME} · {LIVE_CALL_NUMBER}
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
              {liveStatus === "live" && `On air · ${Object.keys(liveAnswers).length}/${QUESTIONS.length}`}
              {liveStatus === "error" && "Error"}
            </span>
            {liveStatus !== "live" && liveStatus !== "calling" ? (
              <button
                onClick={startLiveCall}
                className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink"
              >
                📞 Call {LIVE_CALL_NAME}
              </button>
            ) : (
              <button
                onClick={stopLiveCall}
                className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow"
              >
                Stop stream
              </button>
            )}
          </div>
        </div>

        {liveError && (
          <div className="border-2 border-ink bg-ink text-cream p-3 mb-4 display text-sm">
            {liveError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {QUESTIONS.map((q, i) => {
            const qn = i + 1;
            const answer = liveAnswers[qn];
            const isAnswered = typeof answer === "string" && answer.length > 0;
            return (
              <div
                key={q.id}
                className={`border-2 border-ink p-4 min-h-[140px] flex flex-col ${
                  isAnswered ? "bg-cream" : "bg-cream/60"
                }`}
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="display text-2xl text-pink leading-none">
                    {String(qn).padStart(2, "0")}
                  </span>
                  <div className="display text-[10px] opacity-70 uppercase tracking-wide">
                    {q.label}
                  </div>
                </div>
                <div className="display text-xs leading-tight mb-2 opacity-80">
                  {q.a} <span className="text-pink">vs</span> {q.b}
                </div>
                <div className="mt-auto">
                  {isAnswered ? (
                    <div className="display text-sm bg-ink text-yellow px-2 py-2 leading-snug break-words">
                      {answer}
                    </div>
                  ) : (
                    <div className="display text-[10px] border-2 border-dashed border-ink/30 px-2 py-2 text-center opacity-60">
                      {liveStatus === "live" || liveStatus === "calling"
                        ? "Waiting…"
                        : "—"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Grid */}
      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">THE CAST</span>
        </h2>
        <p className="text-sm opacity-70">
          Click to open the question sheet.
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {people.map((p, i) => {
          const status = statusOf(p.id);
          const accent = ACCENTS[i % ACCENTS.length];
          const isSelected = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`text-left border-2 border-ink bg-cream p-3 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#0a0a0a] transition-all ${
                isSelected ? "shadow-[4px_4px_0_#ff0066] -translate-y-0.5" : ""
              }`}
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
              <div className="display text-base leading-tight truncate">{p.name}</div>
              <div className="text-xs opacity-60 truncate">
                {p.title ? p.title : p.city}
              </div>
              <div
                className={`display text-[10px] mt-2 inline-block px-2 py-0.5 border-2 ${status.tone}`}
              >
                {hydrated ? status.label : "…"}
              </div>
            </button>
          );
        })}
      </section>

      {/* Slide-over panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-ink/60"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
          />
          <aside className="w-full max-w-xl bg-cream border-l-2 border-ink overflow-y-auto">
            <div className="sticky top-0 z-10 bg-yellow border-b-2 border-ink p-5 flex items-start gap-4">
              {selected.profilePicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.profilePicture}
                  alt={selected.name}
                  className="w-20 h-20 object-cover border-2 border-ink shrink-0"
                />
              ) : (
                <div className="w-20 h-20 bg-pink text-white border-2 border-ink display text-3xl flex items-center justify-center shrink-0">
                  {initials(selected.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="display text-xs text-pink">CALL SHEET</div>
                <div className="display text-3xl leading-none mt-1 truncate">
                  {selected.name}
                </div>
                {selected.title && (
                  <div className="text-xs mt-1">
                    {selected.title}
                    {selected.company ? ` @ ${selected.company}` : ""}
                  </div>
                )}
                <div className="text-xs opacity-70 mt-1 truncate">
                  {selected.handle}
                  {selected.city ? ` · ${selected.city}` : ""}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="display text-lg border-2 border-ink bg-cream w-10 h-10 flex items-center justify-center hover:bg-pink hover:text-white shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex gap-2 border-b-2 border-ink">
              <button
                onClick={() => randomise(selected.id)}
                className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-yellow"
              >
                🎲 Simulate call
              </button>
              <button
                onClick={() => reset(selected.id)}
                className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-pink hover:text-white"
              >
                Clear
              </button>
              <div className="ml-auto display text-xs border-2 border-ink px-3 py-2 bg-ink text-cream">
                {Object.keys(selectedAnswers).length}/{QUESTIONS.length}
              </div>
            </div>

            <ol className="divide-y-2 divide-ink">
              {QUESTIONS.map((q, i) => {
                const choice = selectedAnswers[q.id];
                return (
                  <li key={q.id} className="p-5">
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="display text-3xl text-pink leading-none">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="display text-xs opacity-70">{q.label}</div>
                        <div className="display text-lg leading-tight">
                          {q.a} <span className="text-pink">vs</span> {q.b}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateAnswer(selected.id, q.id, "a")}
                        className={`display text-sm border-2 border-ink px-3 py-3 text-left leading-tight transition-colors ${
                          choice === "a"
                            ? "bg-ink text-yellow"
                            : "bg-cream hover:bg-yellow"
                        }`}
                      >
                        A · {q.a}
                      </button>
                      <button
                        onClick={() => updateAnswer(selected.id, q.id, "b")}
                        className={`display text-sm border-2 border-ink px-3 py-3 text-left leading-tight transition-colors ${
                          choice === "b"
                            ? "bg-pink text-white"
                            : "bg-cream hover:bg-pink hover:text-white"
                        }`}
                      >
                        B · {q.b}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="p-5 flex gap-2 border-t-2 border-ink">
              <Link
                href="/dashboard"
                className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink flex-1 text-center"
              >
                View dashboard →
              </Link>
              <button
                onClick={() => setSelectedId(null)}
                className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow"
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Roulette overlay */}
      {roulette && (
        <div className="fixed inset-0 z-50 bg-ink/85 flex items-center justify-center p-6">
          <div
            className={`border-4 border-yellow bg-cream text-ink p-10 w-full max-w-2xl text-center transition-transform ${
              roulette.locked ? "scale-105" : "scale-100"
            }`}
          >
            <div className="display text-sm bg-pink text-white px-2 py-1 inline-block mb-4">
              {roulette.locked ? "🎯 WINNER" : "🎲 RUSSIAN ROULETTE"}
            </div>
            <div className="flex items-center justify-center gap-5">
              {roulette.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={roulette.picture}
                  alt={roulette.name}
                  className="w-20 h-20 object-cover border-4 border-ink"
                />
              ) : (
                <div className="w-20 h-20 bg-pink text-white display text-3xl flex items-center justify-center border-4 border-ink">
                  {initials(roulette.name)}
                </div>
              )}
              <div
                className={`display text-5xl md:text-6xl leading-none ${
                  roulette.locked ? "text-pink" : "blur-[1px] opacity-80"
                }`}
              >
                {roulette.name}
              </div>
            </div>
            <div className="mt-6 text-xs display opacity-60">
              {roulette.locked ? "Calling…" : "Spinning…"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
