"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ensureSeeded,
  enrichPerson,
  fetchSeedParticipants,
  saveParticipants,
  type Person,
} from "../lib/data";

type LogEntry = {
  id: string;
  name: string;
  url?: string;
  status: "pending" | "ok" | "error" | "skip";
  message?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Admin() {
  const [people, setPeople] = useState<Person[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);

  useEffect(() => {
    ensureSeeded().then(async ({ list, addedIds }) => {
      setPeople(list);
      setHydrated(true);
      for (const id of addedIds) {
        const person = list.find((p) => p.id === id);
        if (!person?.linkedinUrl) continue;
        try {
          const res = await fetch("/api/linkedin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: person.linkedinUrl }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const enriched = enrichPerson(person, data);
          setPeople((prev) => {
            const next = prev.map((p) => (p.id === id ? enriched : p));
            saveParticipants(next);
            return next;
          });
        } catch {}
      }
    });
  }, []);

  const counts = useMemo(() => {
    const total = people.length;
    const enriched = people.filter((p) => p.enriched).length;
    const withPhone = people.filter((p) => p.phone).length;
    return { total, enriched, withPhone, pending: total - enriched };
  }, [people]);

  function persist(next: Person[]) {
    setPeople(next);
    saveParticipants(next);
  }

  async function reloadCsv() {
    if (!confirm("Reloading the CSV will overwrite existing enrichments. OK?"))
      return;
    const list = await fetchSeedParticipants();
    persist(list);
    setLogs([]);
  }

  async function enrichOne(person: Person): Promise<LogEntry> {
    if (!person.linkedinUrl) {
      return { id: person.id, name: person.name, status: "skip", message: "No LinkedIn URL" };
    }
    try {
      const res = await fetch("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: person.linkedinUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          id: person.id,
          name: person.name,
          url: person.linkedinUrl,
          status: "error",
          message: data.error || `HTTP ${res.status}`,
        };
      }
      const enriched = enrichPerson(person, data);
      setPeople((prev) => {
        const next = prev.map((p) => (p.id === person.id ? enriched : p));
        saveParticipants(next);
        return next;
      });
      return {
        id: person.id,
        name: enriched.name,
        url: person.linkedinUrl,
        status: "ok",
        message: enriched.title
          ? `${enriched.title}${enriched.company ? ` @ ${enriched.company}` : ""}`
          : "",
      };
    } catch (e) {
      return {
        id: person.id,
        name: person.name,
        url: person.linkedinUrl,
        status: "error",
        message: e instanceof Error ? e.message : "Network error",
      };
    }
  }

  async function enrichAll(mode: "missing" | "all") {
    const targets = mode === "all" ? people : people.filter((p) => !p.enriched);
    if (targets.length === 0) return;
    cancelRef.current = false;
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    setLogs(
      targets.map((p) => ({ id: p.id, name: p.name, url: p.linkedinUrl, status: "pending" }))
    );

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const entry = await enrichOne(targets[i]);
      setLogs((prev) => prev.map((l) => (l.id === entry.id ? entry : l)));
      setProgress({ done: i + 1, total: targets.length });
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    setBusy(false);
  }

  function cancel() {
    cancelRef.current = true;
  }

  function removeOne(id: string) {
    persist(people.filter((p) => p.id !== id));
  }

  function clearAll() {
    if (!confirm("Really wipe everything? You'll lose Netrows enrichment.")) return;
    persist([]);
    setLogs([]);
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      <section className="border-2 border-ink bg-ink text-cream p-8 mb-6">
        <span className="display text-sm bg-pink text-white px-2 py-1 inline-block mb-3">
          ADMIN
        </span>
        <h1 className="display text-5xl md:text-7xl leading-[0.9]">
          CAST &amp; ENRICHMENT
          <br />
          <span className="text-yellow">LINKEDIN × NETROWS</span>
        </h1>
        <p className="mt-4 opacity-80 max-w-xl">
          The list comes from <code>participants.csv</code>. Click Enrich to
          pull photos, titles and cities from LinkedIn.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Participants" value={hydrated ? counts.total : "…"} tone="bg-cream text-ink" />
        <StatCard label="Enriched" value={hydrated ? counts.enriched : "…"} tone="bg-yellow text-ink" />
        <StatCard label="To enrich" value={hydrated ? counts.pending : "…"} tone="bg-pink text-white" />
        <StatCard label="With phone" value={hydrated ? counts.withPhone : "…"} tone="bg-ink text-yellow" />
      </section>

      <section className="border-2 border-ink bg-cream p-5 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => enrichAll("missing")}
            disabled={busy || counts.pending === 0}
            className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            → Enrich {counts.pending || 0} missing
          </button>
          <button
            onClick={() => enrichAll("all")}
            disabled={busy || counts.total === 0}
            className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow disabled:opacity-40"
          >
            Re-enrich all ({counts.total})
          </button>
          <button
            onClick={reloadCsv}
            disabled={busy}
            className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow disabled:opacity-40"
          >
            Reload CSV
          </button>
          <button
            onClick={clearAll}
            disabled={busy}
            className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-pink hover:text-white disabled:opacity-40 ml-auto"
          >
            Wipe
          </button>
          {busy && (
            <button
              onClick={cancel}
              className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink"
            >
              Stop
            </button>
          )}
        </div>

        {busy && (
          <div className="mt-4">
            <div className="flex justify-between text-xs display mb-1">
              <span>Enrichment in progress…</span>
              <span>
                {progress.done}/{progress.total} — {pct}%
              </span>
            </div>
            <div className="border-2 border-ink h-3 bg-cream overflow-hidden">
              <div className="bg-pink h-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </section>

      {logs.length > 0 && (
        <section className="border-2 border-ink bg-yellow p-5 mb-8">
          <div className="display text-sm mb-3">
            Log — {logs.filter((l) => l.status === "ok").length} OK ·{" "}
            {logs.filter((l) => l.status === "error").length} KO ·{" "}
            {logs.filter((l) => l.status === "skip").length} skip
          </div>
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <li
                key={log.id}
                className="border-2 border-ink bg-cream px-3 py-2 text-xs font-mono flex items-start gap-2"
              >
                <span
                  className={`display text-xs px-2 py-0.5 border-2 border-ink shrink-0 ${
                    log.status === "ok"
                      ? "bg-ink text-yellow"
                      : log.status === "error"
                      ? "bg-pink text-white"
                      : log.status === "skip"
                      ? "bg-cream opacity-60"
                      : "bg-cream"
                  }`}
                >
                  {log.status === "ok"
                    ? "OK"
                    : log.status === "error"
                    ? "KO"
                    : log.status === "skip"
                    ? "·"
                    : "…"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-sans font-semibold">{log.name}</span>
                    {log.url && <span className="opacity-50"> · {log.url}</span>}
                  </div>
                  {log.message && (
                    <div className={log.status === "error" ? "text-pink" : "opacity-70"}>
                      {log.message}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">CAST</span>{" "}
          <span className="text-sm opacity-60">({hydrated ? counts.total : 0})</span>
        </h2>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {people.map((p) => (
          <div
            key={p.id}
            className={`border-2 border-ink p-3 flex gap-3 items-start ${
              p.enriched ? "bg-cream" : "bg-cream/40"
            }`}
          >
            {p.profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.profilePicture}
                alt={p.name}
                className="w-16 h-16 object-cover border-2 border-ink shrink-0"
              />
            ) : (
              <div className="w-16 h-16 bg-pink text-white display text-2xl flex items-center justify-center border-2 border-ink shrink-0">
                {initials(p.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="display text-base leading-tight truncate">{p.name}</div>
              {p.title ? (
                <div className="text-xs truncate">
                  {p.title}
                  {p.company ? ` @ ${p.company}` : ""}
                </div>
              ) : (
                <div className="text-xs italic opacity-60">
                  {p.enriched ? "—" : "not enriched"}
                </div>
              )}
              <div className="text-xs opacity-60 truncate">
                {p.handle}
                {p.city ? ` · ${p.city}` : ""}
              </div>
              {p.phone && (
                <div className="text-xs font-mono opacity-60 truncate">{p.phone}</div>
              )}
              <div className="flex gap-1 mt-2 flex-wrap">
                {p.linkedinUrl && (
                  <a
                    href={p.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="display text-[10px] border-2 border-ink px-2 py-0.5 bg-cream hover:bg-yellow"
                  >
                    LinkedIn ↗
                  </a>
                )}
                <button
                  onClick={() => enrichOne(p).then((log) => setLogs((prev) => [log, ...prev]))}
                  disabled={busy || !p.linkedinUrl}
                  className="display text-[10px] border-2 border-ink px-2 py-0.5 bg-cream hover:bg-yellow disabled:opacity-40"
                >
                  {p.enriched ? "Re-fetch" : "Enrich"}
                </button>
                <button
                  onClick={() => removeOne(p.id)}
                  className="display text-[10px] border-2 border-ink px-2 py-0.5 bg-cream hover:bg-pink hover:text-white ml-auto"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 flex gap-3 justify-center">
        <Link
          href="/"
          className="display text-sm border-2 border-ink px-5 py-3 bg-cream hover:bg-yellow"
        >
          ← Cast
        </Link>
        <Link
          href="/dashboard"
          className="display text-sm border-2 border-ink px-5 py-3 bg-pink text-white hover:bg-ink"
        >
          Dashboard →
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
