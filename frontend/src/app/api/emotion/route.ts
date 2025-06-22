import { NextResponse } from "next/server";
// @ts-ignore -- no types for ws in edge runtime

// POST /api/emotion
// Expects JSON: { image: <base64 jpeg string without data url prefix>, topK?: number }
// Returns: { emotions: Array<{ name: string; score: number }> }
export async function POST(req: Request) {
  try {
    const { image, topK = 3 } = await req.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Missing 'image' field.'" }, { status: 400 });
    }

    const apiKey = process.env.HUME_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing HUME_API_KEY env var." }, { status: 500 });
    }

    // Hume's streaming API is WebSocket-only. We open a short-lived socket,
    // send the image for facial analysis, read the first prediction message,
    // then close the connection.

    const WebSocket = (await import("ws")).default as any;

    const emotions: { name: string; score: number }[] | null = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`);

      const cleanup = () => {
        try {
          ws.close();
        } catch (_) {}
      };

      ws.on("open", () => {
        const msg = { data: image, models: { face: {} } };
        ws.send(JSON.stringify(msg));
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const evt = JSON.parse(raw.toString());
          const preds = evt?.face?.predictions?.[0]?.emotions;
          if (Array.isArray(preds)) {
            cleanup();
            resolve(preds as any);
          }
        } catch (_) {
          /* ignore non-json */
        }
      });

      ws.on("error", (err: any) => {
        cleanup();
        reject(err);
      });

      // Fail safe: timeout after 4 s
      setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4000);
    });

    if (!emotions) {
      return NextResponse.json({ emotions: [] });
    }

    const top = [...emotions].sort((a, b) => b.score - a.score).slice(0, topK);
    return NextResponse.json({ emotions: top });
  } catch (err) {
    console.error("Hume emotion route error", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
} 