import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, emotion, stream } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing CLAUDE_API_KEY env var." }, { status: 500 });
    }

    // Build system prompt
    const systemPrompt = `You are \"Milo\", an empathetic, trauma-informed therapy assistant.

Guidelines:
• Listen actively and respond with warmth and validation.
• Acknowledge the user's feelings when emotion context is available (e.g. "It sounds like you're feeling anxious.").
• Do NOT repeat or quote the user's own words.
• Keep replies concise – about 2-4 sentences.
• Ask at most one gentle, open-ended follow-up question that invites reflection.
• Avoid medical jargon, diagnoses, or prescriptive advice.
• Speak in first-person as the assistant and never mention being an AI or language model.

If an emotion snippet is provided, subtly incorporate it. Otherwise, rely solely on the user's text.`;

    const emotionSnippet = emotion ? `\nDetected emotion context: ${JSON.stringify(emotion)}` : "";
    const userContent = `${text}${emotionSnippet}`;

    const modelName = process.env.CLAUDE_MODEL || "claude-3-haiku-20240307";

    const payload: Record<string, any> = {
      model: modelName,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      stream: !!stream,
    };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return NextResponse.json({ error: err }, { status: anthropicRes.status });
    }

    // If streaming requested, proxy Anthropics SSE -> plain text stream
    if (stream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const proxyStream = new ReadableStream({
        async start(controller) {
          if (!anthropicRes.body) {
            controller.close();
            return;
          }
          const reader = anthropicRes.body.getReader();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // keep incomplete line
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const dataStr = line.replace(/^data:\s*/, "").trim();
              if (dataStr === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(dataStr);
                const deltaText = json?.delta?.text ?? json?.content?.[0]?.text ?? "";
                if (deltaText) {
                  controller.enqueue(encoder.encode(deltaText));
                }
              } catch (_) {
                // skip malformed
              }
            }
          }
          controller.close();
        },
      });

      return new Response(proxyStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // Non-streaming fallback
    const data = await anthropicRes.json();
    const completion = data?.content?.[0]?.text ?? "";

    return NextResponse.json({ completion });
  } catch (err: any) {
    console.error("Claude route error", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
} 