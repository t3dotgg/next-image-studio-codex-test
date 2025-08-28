"use client";

import { useEffect, useMemo, useState } from "react";

type Aspect = "1:1" | "3:4" | "4:3" | "16:9";

type Model = {
  id: string;
  name: string;
  tags: string[];
};

const MODELS: Model[] = [
  { id: "flux-pro", name: "FLUX.1 Pro", tags: ["quality", "photoreal"] },
  { id: "flux-dev", name: "FLUX.1 Dev", tags: ["balanced", "general"] },
  { id: "flux-schnell", name: "FLUX.1 Schnell", tags: ["fast", "iterative"] },
];

const STYLE_PRESETS = [
  "Cinematic",
  "Analog film",
  "Neon noir",
  "Watercolor",
  "Studio lighting",
  "Isometric",
  "3D render",
  "Fantasy art",
];

type Render = {
  id: string;
  prompt: string;
  style: string | null;
  seed: number;
  aspect: Aspect;
  url: string;
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [model, setModel] = useState<Model>(MODELS[0]);
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [resolution, setResolution] = useState(768);
  const [cfg, setCfg] = useState(7);
  const [steps, setSteps] = useState(30);
  const [seed, setSeed] = useState<number>(() =>
    Math.floor(Math.random() * 1_000_000)
  );
  const [generating, setGenerating] = useState(false);
  const [renders, setRenders] = useState<Render[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const canGenerate = prompt.trim().length > 0 && !generating;

  const aspectPadding = useMemo(() => {
    switch (aspect) {
      case "1:1":
        return "100%";
      case "3:4":
        return "133.333%";
      case "4:3":
        return "75%";
      case "16:9":
        return "56.25%";
    }
  }, [aspect]);

  // Initialize or read collection id from URL (?c=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let c = url.searchParams.get("c");
    if (!c) {
      c = crypto.randomUUID().slice(0, 8);
      url.searchParams.set("c", c);
      window.history.replaceState({}, "", url.toString());
    }
    setCollectionId(c);
  }, []);

  // Load history for collection
  useEffect(() => {
    if (!collectionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/history?collectionId=${collectionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const items = (data?.items ?? []) as Array<{
          prompt: string;
          style: string | null;
          modelId: string;
          aspect: string;
          seed: number;
          width: number;
          height: number;
          imageUrl: string;
          id: string;
        }>;
        const mapped: Render[] = items.map((it) => ({
          id: it.id,
          prompt: it.prompt,
          style: it.style,
          seed: it.seed,
          aspect: (it.aspect as Aspect) ?? "1:1",
          url: it.imageUrl,
        }));
        setRenders(mapped);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [collectionId]);

  function mockImage(seedLocal: number) {
    // Fallback gradient (kept for visual continuity if needed)
    const h1 = seedLocal % 360 | 0;
    const h2 = (seedLocal * 3) % 360 | 0;
    const s = 75;
    const l1 = 52;
    const l2 = 42;
    const grad = `linear-gradient(135deg, hsl(${h1} ${s}% ${l1}%), hsl(${h2} ${s}% ${l2}%))`;
    return grad;
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style,
          modelId: model.id,
          aspect,
          resolution,
          cfg,
          steps,
          seed,
          numImages: 4,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      const urls: string[] = (data?.images ?? []).map((i: any) => i?.url).filter(Boolean);
      const baseSeed = data?.seed ?? seed;
      const w = data?.width ?? undefined;
      const h = data?.height ?? undefined;

      const batch: Render[] = urls.map((u, i) => ({
        id: `${Date.now()}-${i}`,
        prompt: prompt.trim(),
        style,
        seed: baseSeed + i,
        aspect,
        url: u,
      }));

      // If for any reason no URLs came back, keep a graceful fallback
      const finalBatch = batch.length > 0
        ? batch
        : Array.from({ length: 4 }).map((_, i) => {
            const sd = seed + i;
            return {
              id: `${Date.now()}-${i}`,
              prompt: prompt.trim(),
              style,
              seed: sd,
              aspect,
              url: mockImage(sd),
            } satisfies Render;
          });

      setRenders((prev) => [...finalBatch, ...prev].slice(0, 100));

      // Persist to cloud history (if DB configured)
      if (collectionId) {
        try {
          await fetch("/api/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              collectionId,
              items: finalBatch.map((r) => ({
                prompt: r.prompt,
                style: r.style,
                modelId: model.id,
                aspect: r.aspect,
                seed: r.seed,
                width: w ?? 0,
                height: h ?? 0,
                imageUrl: r.url,
              })),
            }),
          });
        } catch (e) {
          console.error("Failed to persist history", e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  function resetSeed() {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/70 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400" />
            <div className="font-semibold tracking-tight">AI Image Studio</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => setShowHistory((s) => !s)} className="chip">
              <HistoryIcon /> History
            </button>
            <a className="chip" href="#" onClick={(e) => e.preventDefault()}>
              <SparklesIcon /> Explore
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="card glass p-4">
            <h3 className="mb-3 text-sm font-medium text-neutral-300">Model</h3>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    model.id === m.id
                      ? "border-violet-400/30 bg-violet-500/10"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.name}</div>
                    <div className="flex items-center gap-1">
                      {m.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md text-xs bg-white/5 border border-white/10 text-neutral-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="card glass p-4">
            <h3 className="mb-3 text-sm font-medium text-neutral-300">
              Settings
            </h3>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs text-neutral-400">
                  Aspect ratio
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {["1:1", "3:4", "4:3", "16:9"].map((a) => (
                    <button
                      key={a}
                      onClick={() => setAspect(a as Aspect)}
                      className={`px-2 py-1.5 rounded-md text-sm border ${
                        aspect === a
                          ? "border-violet-400/40 bg-violet-500/10"
                          : "border-white/10 hover:bg-white/5"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
                  <span>Resolution</span>
                  <span className="text-neutral-300">{resolution}px</span>
                </div>
                <input
                  type="range"
                  min={512}
                  max={1024}
                  step={64}
                  value={resolution}
                  onChange={(e) => setResolution(parseInt(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
                  <span>Guidance (CFG)</span>
                  <span className="text-neutral-300">{cfg}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={cfg}
                  onChange={(e) => setCfg(parseInt(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
                  <span>Steps</span>
                  <span className="text-neutral-300">{steps}</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={60}
                  value={steps}
                  onChange={(e) => setSteps(parseInt(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
                  <span>Seed</span>
                  <span className="text-neutral-300">{seed}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500/40"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value || "0"))}
                  />
                  <button onClick={resetSeed} className="chip">
                    <ShuffleIcon /> Random
                  </button>
                </div>
              </div>
            </div>
          </section>
        </aside>

        {/* Main panel */}
        <section className="space-y-6">
          {/* Prompt */}
          <div className="card glass p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-neutral-300">Prompt</div>
              <div className="text-xs text-neutral-400 flex items-center gap-3">
                <span>{model.name}</span>
                {collectionId && (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                      } catch {}
                    }}
                    className="chip"
                    title="Copy shareable link"
                  >
                    Share
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your image: a cozy cyberpunk alley, neon reflections, cinematic lighting..."
              className="min-h-28 w-full resize-none rounded-lg bg-white/5 px-4 py-3 outline-none border border-white/10 focus:border-violet-400/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {STYLE_PRESETS.map((s) => {
                const active = style === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStyle(active ? null : s)}
                    className={`chip ${active ? "chip-active" : ""}`}
                  >
                    <PaletteIcon /> {s}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-neutral-400">
                Output: {aspect} • {resolution} px
                {style ? ` • ${style}` : ""}
              </div>
              <button
                disabled={!canGenerate}
                onClick={handleGenerate}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  {generating ? <Spinner /> : <SparklesIcon />}
                  {generating ? "Generating" : "Generate"}
                </span>
              </button>
            </div>
          </div>

          {/* Gallery */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {generating &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/5`}
                >
                  <div style={{ paddingTop: aspectPadding }} />
                  <div className="absolute inset-0 shimmer" />
                </div>
              ))}

            {renders.map((r) => (
              <div
                key={r.id}
                className={`relative overflow-hidden rounded-xl border border-white/10`}
              >
                <div style={{ paddingTop: aspectPadding }} />
                <div className="absolute inset-0 grain" />
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${r.url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="absolute inset-x-2 bottom-2 glass px-3 py-2 text-xs text-neutral-200 flex items-center justify-between">
                  <span className="truncate" title={r.prompt}>
                    {r.prompt || "Untitled"}
                  </span>
                  <span className="opacity-70">#{r.seed}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* History Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-[380px] max-w-[calc(100%-3rem)] transform transition-transform duration-300 ${showHistory ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="h-full glass backdrop-blur-xl border-l border-white/10 bg-neutral-950/70 p-4 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium">History</div>
            <button className="chip" onClick={() => setShowHistory(false)}>
              Close
            </button>
          </div>
          <div
            className="grid gap-3 overflow-auto pr-1"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            {renders.length === 0 && (
              <div className="col-span-2 text-sm text-neutral-400">
                No generations yet. Try a prompt!
              </div>
            )}
            {renders.map((r) => (
              <div
                key={`h-${r.id}`}
                className="relative rounded-lg overflow-hidden border border-white/10 aspect-square"
              >
                <div className="absolute inset-0 grain" />
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${r.url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="size-5 animate-spin text-violet-300"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 12l-3 2 3 2 2 3 2-3 3-2-3-2-2-3-2 3z"
        fill="currentColor"
        opacity=".6"
      />
      <path d="M16 3l-2 3-3 2 3 2 2 3 2-3 3-2-3-2-2-3z" fill="currentColor" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 7h3.5l12 10H21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M21 7h-2.5L4.5 17H3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M18 5l3 2-3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 15l3 2-3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3a9 9 0 1 0 0 18h2.5a2.5 2.5 0 0 0 0-5H14a2 2 0 0 1-2-2V9a6 6 0 0 0-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="16" cy="7" r="1.2" fill="currentColor" />
      <circle cx="17" cy="13" r="1.2" fill="currentColor" />
      <circle cx="7" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 4v5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3.3 13a9 9 0 1 0 2.2-7.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
