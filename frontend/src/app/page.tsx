"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

  // Track Vapi speaking state & volume for visualizer
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false); // whether microphone is active
  const [volumeLevel, setVolumeLevel] = useState(0); // 0-1 range

  // Vapi reference
  const vapiRef = useRef<any>(null);

  // Rolling chat + captions
  const captionIdRef = useRef(0);
  const [chat, setChat] = useState<
    { id: number; role: "assistant" | "user"; text: string }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when chat updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Init Vapi once in browser
  useEffect(() => {
    const pubKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!pubKey) return; // skip if env var missing

    const v = new Vapi(pubKey);
    vapiRef.current = v;

    // Wire speech events & volume for visualizer
    v.on("speech-start", () => setIsSpeaking(true));
    v.on("speech-end", () => setIsSpeaking(false));
    v.on("volume-level", (vol: number) => {
      setVolumeLevel(Math.min(Math.max(vol, 0), 1));
    });

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

    const startEmotionPolling = () => {
      if (!videoRef.current || !canvasRef.current) return;

      // Capture frames every second
      const captureInterval = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const jpegBase64 = canvasRef.current
          .toDataURL("image/jpeg", 0.7)
          .replace(/^data:image\/jpeg;base64,/, "");

        try {
          const res = await fetch("/api/emotion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: jpegBase64 }),
          });
          if (res.ok) {
            const { emotions } = await res.json();
            if (Array.isArray(emotions) && emotions.length) {
              setTopEmotions(emotions);
            }
          }
        } catch (_) {
          /* network errors ignored */
        }
      }, 1000);

      return () => clearInterval(captureInterval);
    };

    const enableCamera = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;

          const maybeStart = () => {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              startEmotionPolling();
            }
          };

          maybeStart();
          videoRef.current.onloadedmetadata = maybeStart;

          try {
            await videoRef.current.play();
          } catch (_) {}
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

  const speakText = async (text: string) => {
    if (!vapiRef.current || !text) return;

    // Ensure any previous call is stopped
    try {
      await vapiRef.current.stop()?.catch(() => {});
    } catch (_) {}

    const voiceProvider = process.env.NEXT_PUBLIC_VAPI_VOICE_PROVIDER || "11labs";
    const voiceId = process.env.NEXT_PUBLIC_VAPI_VOICE_ID;

    try {
      await vapiRef.current.start({
        voice: {
          provider: voiceProvider,
          ...(voiceId ? { voiceId } : {}),
        },
        microphone: { disabled: true },
      });

      // speak and end call when done
      vapiRef.current.say(text, true);
    } catch (err) {
      console.error("Vapi speak error", err);
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

  const recognitionRef = useRef<any>(null);

  const sendToClaude = async (inputText: string, existingMessageId?: number) => {
    if (!inputText.trim()) return;

    // push user message into chat
    let userId = existingMessageId;
    if (userId == null) {
      userId = captionIdRef.current++;
      setChat((prev) => [
        ...prev,
        { id: userId!, role: "user" as const, text: inputText.trim() },
      ]);
    } else {
      const text = inputText.trim();
      setChat((prev) => prev.map((m) => (m.id === userId ? { ...m, text } : m)));
    }

    setUserText("");
    setLoadingClaude(true);
    setClaudeReply(null);
    setError(null);

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: inputText, emotion: topEmotions, stream: true }),
      });

      if (!res.ok || !res.body) {
        const errMsg = await res.text();
        setError(errMsg);
        return;
      }

      // prepare assistant entry
      const assistantId = captionIdRef.current++;
      setChat((prev) => [...prev, { id: assistantId, role: "assistant" as const, text: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        // update assistant text in chat
        setChat((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m))
        );
      }

      // Speak via transient voice-only call
      await speakText(accumulated);

      // Completed
      setClaudeReply(accumulated);

    } catch (err) {
      console.error(err);
      setError("Failed to contact Claude API.");
    } finally {
      setLoadingClaude(false);
    }
  };

  // Preserve original function for manual text input
  const askClaude = () => sendToClaude(userText);

  // SpeechRecognition setup (auto-start/stop)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    let currentMsgId: number | null = null;

    rec.onresult = (e: any) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }

      if (currentMsgId === null) {
        currentMsgId = captionIdRef.current++;
        setChat((prev) => [...prev, { id: currentMsgId!, role: "user", text: "" }]);
      }

      const textToShow = finalText || interim;
      setChat((prev) => prev.map((m) => (m.id === currentMsgId ? { ...m, text: textToShow } : m)));

      if (finalText) {
        // Send to Claude and reset msg id for next utterance
        sendToClaude(finalText, currentMsgId!);
        currentMsgId = null;
      }
    };

    rec.onerror = (err: any) => {
      console.error("Speech recog error", err);
      setIsListening(false);
    };

    rec.onstart = () => setIsListening(true);
    rec.onend = () => {
      setIsListening(false);
      // Auto-restart if assistant is not speaking
      if (!isSpeaking) {
        try {
          rec.start();
        } catch (_) {}
      }
    };

    // Start listening initially (after permission prompt)
    try {
      rec.start();
    } catch (_) {}

    return () => {
      rec.abort();
    };
  }, []); // run once

  // Pause listening when assistant speaks to avoid feedback
  useEffect(() => {
    const rec: any = recognitionRef.current;
    if (!rec) return;
    try {
      if (isSpeaking) {
        if (rec) rec.abort();
      } else if (!isListening) {
        rec.start();
      }
    } catch (_) {}
  }, [isSpeaking]);

  return (
    <main className="container mx-auto max-w-5xl py-10 space-y-10 relative">
      <h1 className="text-3xl font-bold text-center">Empathic Sign-Language Therapy Assistant</h1>

      {error && <p className="text-red-600 text-center">{error}</p>}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Camera + emotion card */}
        <Card>
          <CardHeader>
            <CardTitle>Live Emotion Detection</CardTitle>
            <CardDescription>Webcam video analysed by Hume AI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                width={320}
                height={240}
                className="rounded bg-black shadow" />
              {/* Hidden canvas for captures */}
              <canvas ref={canvasRef} width={320} height={240} className="hidden" />
            </div>

            <div className="text-center">
              <h3 className="font-medium">Top emotions</h3>
              {topEmotions ? (
                <ul className="mt-2 space-y-1">
                  {topEmotions.map((e) => (
                    <li key={e.name} className="text-sm">
                      {e.name}: {(e.score * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Looking for faces…</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat card */}
        <Card>
          <CardHeader>
            <CardTitle>Chat with Claude</CardTitle>
            <CardDescription>Craft empathetic responses to your intent</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Chat message stream */}
            <div className="h-80 overflow-y-auto mb-4 space-y-2">
              {chat.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap break-words text-sm shadow
                    ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-900"}`}
                  >
                    {msg.text || (msg.role === "assistant" ? "…" : "")}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-2">
              <Textarea
                rows={3}
                placeholder="Optional: Type a message..."
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
              />

              <div className="flex justify-end gap-3">
                {isSpeaking && (
                  <Button className="bg-red-600 hover:bg-red-600/90" onClick={interruptSpeech}>
                    Interrupt
                  </Button>
                )}
                {isListening && (
                  <span className="text-sm text-gray-500 self-center mr-2">Listening…</span>
                )}
                <Button onClick={askClaude} disabled={loadingClaude}>
                  {loadingClaude ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Speaking indicator */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50">
        <div
          className={`rounded-full bg-blue-600/80 shadow-lg transition-all duration-150 ${
            isSpeaking ? "w-16 h-16 opacity-100 animate-pulse" : "w-8 h-8 opacity-0"
          }`}
          style={{
            transform: `scale(${isSpeaking ? 1 + volumeLevel : 1})`,
          }}
        />
      </div>
    </main>
  );
}
