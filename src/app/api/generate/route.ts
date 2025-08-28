import * as fal from "@fal-ai/serverless-client";

export const runtime = "edge";

fal.config({
  // FAL_KEY is provided via environment variables
  credentials: process.env.FAL_KEY,
});

type Body = {
  prompt: string;
  style?: string | null;
  modelId: string; // one of our supported IDs
  aspect: "1:1" | "3:4" | "4:3" | "16:9";
  resolution: number; // longer side in px
  cfg: number;
  steps: number;
  seed: number;
  numImages?: number;
};

const MODEL_ROUTE: Record<string, string> = {
  "flux-pro": "fal-ai/flux-pro",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux-schnell",
};

function dimsFromAspect(aspect: Body["aspect"], resolution: number) {
  // Interpret resolution as the longer side
  const map: Record<Body["aspect"], [number, number]> = {
    "1:1": [1, 1],
    "3:4": [3, 4],
    "4:3": [4, 3],
    "16:9": [16, 9],
  };
  const [wR, hR] = map[aspect];
  const longIsWidth = wR >= hR;
  const long = resolution;
  const short = Math.round((resolution * Math.min(wR, hR)) / Math.max(wR, hR));
  const width = longIsWidth ? long : short;
  const height = longIsWidth ? short : long;
  // Many backends like multiples of 8
  const round8 = (n: number) => Math.max(64, Math.round(n / 8) * 8);
  return { width: round8(width), height: round8(height) };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const {
      prompt,
      style,
      modelId,
      aspect,
      resolution,
      cfg,
      steps,
      seed,
      numImages = 4,
    } = body;

    const route = MODEL_ROUTE[modelId];
    if (!route) {
      return new Response(
        JSON.stringify({ error: `Unsupported modelId: ${modelId}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { width, height } = dimsFromAspect(aspect, resolution);

    const styleSuffix = style ? `, ${style.toLowerCase()}` : "";
    const fullPrompt = `${prompt?.trim() ?? ""}${styleSuffix}`.trim();

    const result = await fal.run(route, {
      input: {
        prompt: fullPrompt,
        seed,
        num_inference_steps: steps,
        guidance_scale: cfg,
        width,
        height,
        num_images: numImages,
        // Safety optional flags guarded by backend; harmless if ignored
        enable_safety_checker: true,
      },
    });

    // Normalize output to an array of URLs
    let urls: string[] = [];
    // Common fal output shape
    const anyResult = result as any;
    if (Array.isArray(anyResult?.images)) {
      urls = anyResult.images
        .map((img: any) => (typeof img === "string" ? img : img?.url))
        .filter(Boolean);
    } else if (anyResult?.image) {
      const img = anyResult.image;
      const u = typeof img === "string" ? img : img?.url;
      if (u) urls = [u];
    }

    return new Response(
      JSON.stringify({
        images: urls.map((u: string) => ({ url: u })),
        seed: anyResult?.seed ?? seed,
        width,
        height,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
