import { NextRequest } from "next/server";
import { getDb, ensureSchema } from "@/server/db";
import crypto from "node:crypto";

export const runtime = "nodejs";

type HistoryItem = {
  id: string;
  collectionId: string;
  createdAt: number;
  prompt: string;
  style: string | null;
  modelId: string;
  aspect: string;
  seed: number;
  width: number;
  height: number;
  imageUrl: string;
};

export async function GET(req: NextRequest) {
  const collectionId = req.nextUrl.searchParams.get("collectionId");
  if (!collectionId) {
    return new Response(JSON.stringify({ error: "Missing collectionId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const db = getDb();
  if (!db) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  await ensureSchema(db);
  const rs = await db.execute({
    sql: `SELECT id, collection_id, created_at, prompt, style, model_id, aspect, seed, width, height, image_url
          FROM history_items WHERE collection_id = ?
          ORDER BY created_at DESC LIMIT 200`,
    args: [collectionId],
  });
  const items = rs.rows.map((r) => ({
    id: r.id as string,
    collectionId: r.collection_id as string,
    createdAt: Number(r.created_at),
    prompt: (r.prompt as string) ?? "",
    style: (r.style as string) ?? null,
    modelId: (r.model_id as string) ?? "",
    aspect: (r.aspect as string) ?? "1:1",
    seed: Number(r.seed ?? 0),
    width: Number(r.width ?? 0),
    height: Number(r.height ?? 0),
    imageUrl: (r.image_url as string) ?? "",
  } satisfies HistoryItem));
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return new Response(JSON.stringify({ error: "Database not configured" }), {
      status: 501,
      headers: { "content-type": "application/json" },
    });
  }
  await ensureSchema(db);

  const body = (await req.json()) as {
    collectionId: string;
    items: Array<{
      prompt: string;
      style: string | null;
      modelId: string;
      aspect: string;
      seed: number;
      width: number;
      height: number;
      imageUrl: string;
      createdAt?: number;
    }>;
  };
  const { collectionId, items } = body;
  if (!collectionId || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const now = Date.now();
  // Optional: mirror images to UploadThing if configured
  const rows = await Promise.all(
    items.map(async (it) => {
      let imageUrl = it.imageUrl;
      try {
        const utSecret = process.env.UPLOADTHING_SECRET;
        if (utSecret && imageUrl && !imageUrl.includes("utfs.io")) {
          const { UTApi } = await import("uploadthing/server");
          const utapi = new UTApi();
          const resp = await fetch(imageUrl);
          const arrayBuf = await resp.arrayBuffer();
          const type = resp.headers.get("content-type") || "image/png";
          const ext = type.split("/")[1] || "png";
          const name = `gen-${crypto.randomUUID()}.${ext}`;
          // Node may not have File in older versions; create a polyfill
          const globalWithFile = globalThis as typeof globalThis & {
            File?: typeof File;
          };
          const _File =
            globalWithFile.File ??
            class NodeFile extends Blob {
              name: string;
              lastModified: number;
              constructor(parts: BlobPart[], name: string, opts?: BlobPropertyBag) {
                super(parts, opts);
                this.name = name;
                this.lastModified = Date.now();
              }
            };
          const file = new _File([arrayBuf], name, { type }) as File;
          const up = await utapi.uploadFiles([file]);
          const first = Array.isArray(up)
            ? up[0]
            : Array.isArray(up.data)
            ? up.data[0]
            : up.data;
          const url = first?.url || first?.ufsUrl;
          if (url) imageUrl = url;
        }
      } catch (e) {
        console.error("UploadThing mirror failed", e);
      }
      return {
        id: crypto.randomUUID(),
        collection_id: collectionId,
        created_at: it.createdAt ?? now,
        prompt: it.prompt,
        style: it.style,
        model_id: it.modelId,
        aspect: it.aspect,
        seed: it.seed,
        width: it.width,
        height: it.height,
        image_url: imageUrl,
      };
    })
  );

  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
  const flatArgs = rows.flatMap((r) => [
    r.id,
    r.collection_id,
    r.created_at,
    r.prompt,
    r.style,
    r.model_id,
    r.aspect,
    r.seed,
    r.width,
    r.height,
    r.image_url,
  ]);

  await db.execute({
    sql: `INSERT INTO history_items (id, collection_id, created_at, prompt, style, model_id, aspect, seed, width, height, image_url)
          VALUES ${placeholders}`,
    args: flatArgs,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
