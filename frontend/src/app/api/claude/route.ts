import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, emotion } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing CLAUDE_API_KEY env var." }, { status: 500 });
    }

    // Build system prompt
    const systemPrompt = `You are an empathetic therapist. Craft supportive responses. Use the detected emotion as additional context when it is provided.`;

    const emotionSnippet = emotion ? `\nDetected emotion context: ${JSON.stringify(emotion)}` : "";
    const userContent = `${text}${emotionSnippet}`;

    const modelName = process.env.CLAUDE_MODEL || "claude-3-haiku-20240307";

    const payload = {
      model: modelName,
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        { role: "user", content: userContent },
      ],
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

    const data = await anthropicRes.json();
    const completion = data?.content?.[0]?.text ?? "";

    return NextResponse.json({ completion });
  } catch (err: any) {
    console.error("Claude route error", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
} 