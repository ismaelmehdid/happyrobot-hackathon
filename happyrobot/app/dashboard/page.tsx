"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  QUESTIONS,
  STORE_KEY,
  ensureSeeded,
  loadParticipants,
  type Person,
  type Store,
} from "../lib/data";

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function Dashboard() {
  const [store, setStore] = useState<Store>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [live, setLive] = useState<{ done: number; total: number } | null>(null);
  const liveTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const isLive = new URLSearchParams(window.location.search).get("live") === "1";
    if (!isLive) return;
    startLiveSimulation();
    // Clean the query so reload doesn't restart the sim.
    window.history.replaceState(null, "", "/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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
              L&apos;IA APPELLE TOUT LE MONDE EN MÊME TEMPS…
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
          LE VERDICT
        </span>
        <h1 className="display text-6xl md:text-8xl leading-[0.85]">
          LES FRANÇAIS DE LA TECH
          <br />
          <span className="text-pink">ONT TRANCHÉ</span>
        </h1>
        <p className="mt-4 max-w-xl opacity-80">
          Les stats consolidées sur {hydrated ? people.length : "…"} appels de
          l&apos;IA. Pas de filtre, pas de pitié.
        </p>
      </section>

      {/* Top stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Appels lancés" value={hydrated ? totalCalls : 0} tone="bg-yellow text-ink" />
        <StatCard label="Appels terminés" value={hydrated ? totalComplete : 0} tone="bg-pink text-white" />
        <StatCard
          label="Réponses enregistrées"
          value={hydrated ? totalAnswers : 0}
          tone="bg-cream text-ink"
        />
        <StatCard
          label="Taux de complétion"
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
              <div className="display text-xs opacity-80">LA QUESTION QUI FÂCHE</div>
              <div className="display text-3xl leading-tight mt-1">
                {mostDivisive.q.a} <span className="opacity-60">vs</span> {mostDivisive.q.b}
              </div>
              <div className="display text-sm mt-2">
                {mostDivisive.aPct}% / {mostDivisive.bPct}% — quasi ex-aequo.
              </div>
            </div>
          )}
          {mostConsensual && (
            <div className="border-2 border-ink bg-yellow text-ink p-5">
              <div className="display text-xs opacity-80">TOUT LE MONDE EST D&apos;ACCORD</div>
              <div className="display text-3xl leading-tight mt-1">
                {mostConsensual.q.a} <span className="opacity-60">vs</span>{" "}
                {mostConsensual.q.b}
              </div>
              <div className="display text-sm mt-2">
                {Math.max(mostConsensual.aPct, mostConsensual.bPct)}% d&apos;un
                côté.
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
            🎲 Seed démo
          </button>
          <button
            onClick={clearAll}
            className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-pink hover:text-white"
          >
            Tout effacer
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
                Aucune réponse pour l&apos;instant.
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
          ← Retour au casting
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
