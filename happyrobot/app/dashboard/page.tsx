"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  QUESTIONS,
  STORE_KEY,
  ensureSeeded,
  loadParticipants,
  type Person,
  type Question,
  type Store,
} from "../lib/data";

const LIVE_SESSIONS_KEY = "konbini.liveSessions.v1";

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
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

export default function Dashboard() {
  const [store, setStore] = useState<Store>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [live, setLive] = useState<{ done: number; total: number } | null>(null);
  const liveTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStore(loadStore());
    ensureSeeded().then(({ list }) => {
      setPeople(list);
      setHydrated(true);
    });
    const onStorage = () => {
      setStore(loadStore());
      setPeople(loadParticipants());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      liveTimers.current.forEach((t) => clearTimeout(t));
      liveTimers.current = [];
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const isLive = new URLSearchParams(window.location.search).get("live") === "1";
    if (!isLive) return;

    let sessionMap: Record<string, string> = {};
    try {
      const raw = sessionStorage.getItem(LIVE_SESSIONS_KEY);
      if (raw) sessionMap = JSON.parse(raw);
    } catch {}
    sessionStorage.removeItem(LIVE_SESSIONS_KEY);

    if (Object.keys(sessionMap).length > 0) {
      startRealLive(sessionMap);
    } else {
      startLiveSimulation();
    }
    window.history.replaceState(null, "", "/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function startRealLive(sessionMap: Record<string, string>) {
    liveTimers.current.forEach((t) => clearTimeout(t));
    liveTimers.current = [];
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }

    localStorage.removeItem(STORE_KEY);
    setStore({});

    const entries = Object.entries(sessionMap);
    const totalSteps = entries.length * QUESTIONS.length;
    setLive({ done: 0, total: totalSteps });

    const processed = new Set<string>();

    const tick = async () => {
      const results = await Promise.allSettled(
        entries.map(async ([personId, sessionId]) => {
          const r = await fetch(
            `/api/answers?session=${encodeURIComponent(sessionId)}`,
            { cache: "no-store" }
          );
          if (!r.ok) return null;
          const data = (await r.json()) as {
            answers: { question_number: number; answer: string }[];
          };
          return { personId, answers: data.answers ?? [] };
        })
      );

      setStore((prev) => {
        const next: Store = { ...prev };
        let changed = false;
        for (const r of results) {
          if (r.status !== "fulfilled" || !r.value) continue;
          const { personId, answers } = r.value;
          for (const a of answers) {
            const key = `${personId}:${a.question_number}`;
            if (processed.has(key)) continue;
            processed.add(key);
            const q = QUESTIONS[a.question_number - 1];
            if (!q) continue;
            const choice = toChoice(String(a.answer ?? ""), q);
            if (!choice) continue;
            next[personId] = { ...(next[personId] || {}), [q.id]: choice };
            changed = true;
          }
        }
        if (changed) localStorage.setItem(STORE_KEY, JSON.stringify(next));
        return changed ? next : prev;
      });

      setLive({ done: processed.size, total: totalSteps });

      if (processed.size >= totalSteps && liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
        const stop = setTimeout(() => setLive(null), 2200);
        liveTimers.current.push(stop);
      }
    };

    tick();
    liveIntervalRef.current = setInterval(tick, 1500);
  }

  function startLiveSimulation() {
    liveTimers.current.forEach((t) => clearTimeout(t));
    liveTimers.current = [];

    const pool = people.filter((p) => p.phone);
    if (pool.length === 0) return;

    // Reset store for dramatic effect.
    localStorage.removeItem(STORE_KEY);
    setStore({});

    const totalSteps = pool.length * QUESTIONS.length;
    setLive({ done: 0, total: totalSteps });

    // Build all (person, question) slots with random delivery times.
    type Slot = { personId: string; qId: string; choice: "a" | "b"; at: number };
    const slots: Slot[] = [];
    const windowMs = 9000;
    for (const p of pool) {
      const offset = Math.random() * windowMs * 0.6;
      for (let i = 0; i < QUESTIONS.length; i++) {
        const jitter = Math.random() * 700;
        slots.push({
          personId: p.id,
          qId: QUESTIONS[i].id,
          choice: Math.random() > 0.5 ? "a" : "b",
          at: offset + i * (windowMs / QUESTIONS.length) * 0.9 + jitter,
        });
      }
    }
    slots.sort((a, b) => a.at - b.at);

    let done = 0;
    slots.forEach((slot) => {
      const t = setTimeout(() => {
        setStore((prev) => {
          const next: Store = {
            ...prev,
            [slot.personId]: {
              ...(prev[slot.personId] || {}),
              [slot.qId]: slot.choice,
            },
          };
          localStorage.setItem(STORE_KEY, JSON.stringify(next));
          return next;
        });
        done += 1;
        setLive({ done, total: totalSteps });
        if (done >= totalSteps) {
          const stop = setTimeout(() => setLive(null), 2200);
          liveTimers.current.push(stop);
        }
      }, slot.at);
      liveTimers.current.push(t);
    });
  }

  const stats = useMemo(() => {
    return QUESTIONS.map((q) => {
      let a = 0;
      let b = 0;
      for (const person of people) {
        const ans = store[person.id]?.[q.id];
        if (ans === "a") a++;
        else if (ans === "b") b++;
      }
      const total = a + b;
      const aPct = total ? Math.round((a / total) * 100) : 0;
      const bPct = total ? 100 - aPct : 0;
      return { q, a, b, total, aPct, bPct };
    });
  }, [store, people]);

  const totalCalls = Object.keys(store).length;
  const totalComplete = Object.values(store).filter(
    (a) => Object.keys(a).length === QUESTIONS.length
  ).length;
  const totalAnswers = Object.values(store).reduce(
    (sum, a) => sum + Object.keys(a).length,
    0
  );

  const mostDivisive = [...stats]
    .filter((s) => s.total > 0)
    .sort((x, y) => Math.abs(50 - x.aPct) - Math.abs(50 - y.aPct))[0];
  const mostConsensual = [...stats]
    .filter((s) => s.total > 0)
    .sort((x, y) => Math.abs(50 - y.aPct) - Math.abs(50 - x.aPct))[0];

  const maxVotes = Math.max(1, ...stats.map((s) => Math.max(s.a, s.b)));

  function seedAll() {
    const next: Store = {};
    for (const p of people) {
      const ans: Record<string, "a" | "b"> = {};
      for (const q of QUESTIONS) {
        ans[q.id] = Math.random() > 0.5 ? "a" : "b";
      }
      next[p.id] = ans;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    setStore(next);
  }

  function clearAll() {
    localStorage.removeItem(STORE_KEY);
    setStore({});
  }

  const livePct = live ? Math.round((live.done / Math.max(1, live.total)) * 100) : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      {/* Live banner */}
      {live && (
        <div className="border-2 border-ink bg-pink text-white p-4 mb-4 flex items-center gap-4">
          <span className="display text-xs bg-yellow text-ink px-2 py-1 animate-pulse">
            LIVE
          </span>
          <div className="flex-1">
            <div className="display text-sm">
              AI IS CALLING EVERYONE AT ONCE…
            </div>
            <div className="border-2 border-cream h-2 mt-2 overflow-hidden bg-ink/40">
              <div
                className="bg-yellow h-full transition-all duration-200"
                style={{ width: `${livePct}%` }}
              />
            </div>
          </div>
          <div className="display text-sm shrink-0">
            {live.done}/{live.total}
          </div>
        </div>
      )}

      {/* Title band */}
      <section className="border-2 border-ink bg-ink text-cream p-8 mb-6 relative overflow-hidden">
        <span className="display text-sm bg-yellow text-ink px-2 py-1 inline-block mb-3">
          THE VERDICT
        </span>
        <h1 className="display text-6xl md:text-8xl leading-[0.85]">
          TECH FRANCE
          <br />
          <span className="text-pink">HAS SPOKEN</span>
        </h1>
        <p className="mt-4 max-w-xl opacity-80">
          Consolidated stats from {hydrated ? people.length : "…"} AI calls.
          No filter, no mercy.
        </p>
      </section>

      {/* Top stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Calls started" value={hydrated ? totalCalls : 0} tone="bg-yellow text-ink" />
        <StatCard label="Calls completed" value={hydrated ? totalComplete : 0} tone="bg-pink text-white" />
        <StatCard
          label="Answers recorded"
          value={hydrated ? totalAnswers : 0}
          tone="bg-cream text-ink"
        />
        <StatCard
          label="Completion rate"
          value={`${hydrated && people.length ? Math.round((totalComplete / people.length) * 100) : 0}%`}
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
              <span className="w-3 h-3 border-2 border-ink bg-yellow inline-block" /> A
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-ink bg-pink inline-block" /> B
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

      {/* Highlights */}
      {hydrated && (mostDivisive || mostConsensual) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {mostDivisive && (
            <div className="border-2 border-ink bg-pink text-white p-5">
              <div className="display text-xs opacity-80">THE TOUCHY QUESTION</div>
              <div className="display text-3xl leading-tight mt-1">
                {mostDivisive.q.a} <span className="opacity-60">vs</span> {mostDivisive.q.b}
              </div>
              <div className="display text-sm mt-2">
                {mostDivisive.aPct}% / {mostDivisive.bPct}% — nearly tied.
              </div>
            </div>
          )}
          {mostConsensual && (
            <div className="border-2 border-ink bg-yellow text-ink p-5">
              <div className="display text-xs opacity-80">EVERYONE AGREES</div>
              <div className="display text-3xl leading-tight mt-1">
                {mostConsensual.q.a} <span className="opacity-60">vs</span>{" "}
                {mostConsensual.q.b}
              </div>
              <div className="display text-sm mt-2">
                {Math.max(mostConsensual.aPct, mostConsensual.bPct)}% one side.
              </div>
            </div>
          )}
        </section>
      )}

      {/* Question bars */}
      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">10 DUELS</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={seedAll}
            className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-yellow"
          >
            🎲 Seed demo
          </button>
          <button
            onClick={clearAll}
            className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-pink hover:text-white"
          >
            Clear all
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        {stats.map((s, i) => (
          <div key={s.q.id} className="border-2 border-ink bg-cream p-5">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="display text-4xl text-pink leading-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="display text-xs opacity-70">{s.q.label}</div>
                <div className="display text-2xl leading-tight">
                  {s.q.a} <span className="text-pink">vs</span> {s.q.b}
                </div>
              </div>
              <div className="display text-xs border-2 border-ink px-2 py-1">
                {s.total} vote{s.total > 1 ? "s" : ""}
              </div>
            </div>

            {s.total === 0 ? (
              <div className="display text-sm border-2 border-dashed border-ink/30 p-6 text-center opacity-60">
                No answers yet.
              </div>
            ) : (
              <>
                <div className="flex border-2 border-ink h-12 overflow-hidden">
                  <div
                    className="bg-yellow text-ink display flex items-center px-3 transition-all duration-500"
                    style={{ width: `${s.aPct}%` }}
                  >
                    {s.aPct >= 10 ? `${s.aPct}%` : ""}
                  </div>
                  <div
                    className="bg-pink text-white display flex items-center justify-end px-3 transition-all duration-500"
                    style={{ width: `${s.bPct}%` }}
                  >
                    {s.bPct >= 10 ? `${s.bPct}%` : ""}
                  </div>
                </div>
                <div className="flex justify-between text-xs mt-2 display">
                  <span>
                    A · {s.q.a} <span className="opacity-60">({s.a})</span>
                  </span>
                  <span>
                    <span className="opacity-60">({s.b})</span> {s.q.b} · B
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <div className="mt-8 flex justify-center">
        <Link
          href="/"
          className="display text-sm border-2 border-ink px-5 py-3 bg-pink text-white hover:bg-ink"
        >
          ← Back to cast
        </Link>
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
