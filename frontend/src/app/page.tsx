"use client";

import { useEffect, useRef, useState } from "react";
// @ts-ignore -- Vapi has no TS types yet
import Vapi from "@vapi-ai/web";

interface EmotionScore {
  name: string;
  score: number;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [topEmotions, setTopEmotions] = useState<EmotionScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Claude interaction state
  const [userText, setUserText] = useState("");
  const [claudeReply, setClaudeReply] = useState<string | null>(null);
  const [loadingClaude, setLoadingClaude] = useState(false);

  // Track Vapi speaking state for interrupt button
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Vapi reference
  const vapiRef = useRef<any>(null);

  // Init Vapi once in browser
  useEffect(() => {
    const pubKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

    if (!pubKey || !assistantId) return; // skip if env vars missing

    const v = new Vapi(pubKey);
    vapiRef.current = v;

    // Start persistent call so we can stream "say" later
    v.start(assistantId);

    // Wire speech events to toggle isSpeaking
    v.on("speech-start", () => setIsSpeaking(true));
    v.on("speech-end", () => setIsSpeaking(false));

    return () => {
      try {
        v.stop();
        setIsSpeaking(false);
      } catch (_) {
        /* no-op */
      }
    };
  }, []);

  // Ask for webcam on mount
  useEffect(() => {
    let localStream: MediaStream;

    const apiKey = process.env.NEXT_PUBLIC_HUME_API_KEY;

    const startStreaming = () => {
      if (!apiKey) {
        setError("Missing NEXT_PUBLIC_HUME_API_KEY env var.");
        return;
      }

      if (!videoRef.current || !canvasRef.current) return;

      const socket = new WebSocket(
        `wss://api.hume.ai/v0/stream/models?apikey=${apiKey}`
      );

      socket.onopen = () => {
        console.debug("Hume socket opened");
      };

      socket.onerror = (ev) => {
        console.error("WS errored", ev);
        setError("WebSocket connection error.");
      };

      socket.onmessage = (event) => {
        console.debug("WS message", event.data);
        try {
          const data = JSON.parse(event.data);
          const emotions: EmotionScore[] | undefined = data?.face?.predictions?.[0]?.emotions;
          if (emotions) {
            const top = [...emotions]
              .sort((a, b) => b.score - a.score)
              .slice(0, 3);
            setTopEmotions(top);
          }
        } catch (_) {
          /* swallow parse errors */
        }
      };

      // Capture frames every 800 ms (≈1.25 fps)
      const captureInterval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        // Draw current frame onto canvas (scale down for bandwidth)
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const jpegBase64 = canvasRef.current
          .toDataURL("image/jpeg", 0.7)
          .replace(/^data:image\/jpeg;base64,/, "");

        if (socket.readyState === WebSocket.OPEN) {
          const payload = {
            data: jpegBase64,
            models: { face: {} },
          };
          socket.send(JSON.stringify(payload));
        } else {
          console.debug("Socket not open, state", socket.readyState);
        }
      }, 800);

      return () => {
        clearInterval(captureInterval);
        socket.close();
      };
    };

    const enableCamera = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;

          const maybeStart = () => {
            // HAVE_CURRENT_DATA == 2
            if (videoRef.current && videoRef.current.readyState >= 2) {
              startStreaming();
            }
          };

          // If metadata already loaded (rare), start immediately, else wait.
          maybeStart();
          videoRef.current.onloadedmetadata = maybeStart;

          // Start playing (required in some browsers to emit frames)
          try {
            await videoRef.current.play();
          } catch (_err) {
            /* autoplay blocked, user will need to interact */
          }
        }
      } catch (err) {
        setError("Could not access webcam. Please allow camera permissions.");
      }
    };

    enableCamera();

    return () => {
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // helper to lazily start vapi once
  const ensureVapiStarted = async () => {
    if (!vapiRef.current) return;
    if (vapiRef.current.__started) return;
    const pubKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
    if (!pubKey || !assistantId) return;
    try {
      await vapiRef.current.start(assistantId, { microphone: { disabled: true } });
      vapiRef.current.__started = true;
      // attach again in case instance recreated
      setIsSpeaking(false);
    } catch (err) {
      console.error("Vapi start error", err);
    }
  };

  const interruptSpeech = () => {
    try {
      vapiRef.current?.stop();
    } catch (_) {}
    setIsSpeaking(false);
    if (vapiRef.current) {
      vapiRef.current.__started = false; // so next call will restart
    }
  };

  const askClaude = async () => {
    if (!userText.trim()) return;
    setLoadingClaude(true);
    setClaudeReply(null);
    setError(null);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: userText, emotion: topEmotions }),
      });

      const data = await res.json();
      if (data.completion) {
        setClaudeReply(data.completion);
        try {
          await ensureVapiStarted();
          vapiRef.current?.say?.(data.completion);
        } catch (_) {}
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to contact Claude API.");
    } finally {
      setLoadingClaude(false);
    }
  };

  return (
    <main className="flex flex-col items-center gap-6 py-10">
      <h1 className="text-2xl font-semibold">Hume Face Emotion Demo</h1>

      {error && (
        <p className="text-red-600 max-w-md text-center">{error}</p>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        width={320}
        height={240}
        className="rounded shadow-md bg-black"
      />

      {/* Hidden canvas used for frame captures */}
      <canvas ref={canvasRef} width={320} height={240} className="hidden" />

      <section className="mt-4 text-center">
        <h2 className="font-medium mb-2">Top emotions</h2>
        {topEmotions ? (
          <ul className="space-y-1">
            {topEmotions.map((e) => (
              <li key={e.name} className="text-lg">
                {e.name}: {(e.score * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Looking for faces…</p>
        )}
      </section>

      {/* Claude text box */}
      <section className="mt-10 w-full max-w-xl">
        <h2 className="font-medium mb-2 text-center">Chat with Claude</h2>
        <textarea
          className="w-full border rounded p-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
          rows={4}
          placeholder="Type a message for Claude..."
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={askClaude}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={loadingClaude}
          >
            {loadingClaude ? "Sending..." : "Send"}
          </button>

          {isSpeaking && (
            <button
              onClick={interruptSpeech}
              className="ml-4 px-4 py-2 rounded bg-red-600 text-white"
            >
              Interrupt
            </button>
          )}
        </div>

        {claudeReply && (
          <div className="mt-4 p-4 border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-700 whitespace-pre-wrap">
            {claudeReply}
          </div>
        )}
      </section>
    </main>
  );
}
