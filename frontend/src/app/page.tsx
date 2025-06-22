"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

  // Speaking / listening state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false); // whether microphone is active
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Ref to the currently playing audio element so we can stop it
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // AudioContext for volume analyzer
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Rolling chat + captions
  const captionIdRef = useRef(0);
  const [chat, setChat] = useState<
    { id: number; role: "assistant" | "user"; text: string }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastAssistantTextRef = useRef<string>("");

  // Auto-scroll to bottom when chat updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

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

  // Speak text using LMNT TTS (fetches audio bytes and plays in browser)
  const speakText = async (text: string) => {
    if (!text) return;

    // Stop any previous playback
    try {
      audioRef.current?.pause();
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
    } catch (_) {}

    const lmntKey = process.env.NEXT_PUBLIC_LMNT_API_KEY;
    if (!lmntKey) {
      console.error("Missing NEXT_PUBLIC_LMNT_API_KEY env var – cannot use LMNT TTS");
      return;
    }

    const voiceId = process.env.NEXT_PUBLIC_LMNT_VOICE_ID || "lily";

    try {
      const res = await fetch("https://api.lmnt.com/v1/ai/speech/bytes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": lmntKey,
        },
        body: JSON.stringify({ voice: voiceId, text, format: "mp3" }),
      });

      if (!res.ok) {
        console.error("LMNT synth error", await res.text());
        return;
      }

      const buffer = await res.arrayBuffer();
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      // Flag speaking BEFORE playback to pause speech recognition immediately
      setIsSpeaking(true);

      // Abort recognition proactively (in case onplay delay)
      try {
        recognitionRef.current?.abort();
      } catch (_) {}

      // Setup volume analyser
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current!;
        const sourceNode = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        sourceNode.connect(analyser);
        analyser.connect(ctx.destination);

        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const tick = () => {
          if (!isSpeaking) return; // stop updates when done
          analyser.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / bufferLength);
          setVolumeLevel(rms); // 0..1
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch (_) {
        /* analyser might fail in insecure contexts */
      }

      audio.onplay = () => {}; // already flagged
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        setVolumeLevel(0);
      };
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
    } catch (err) {
      console.error("LMNT playback error", err);
    }
  };

  const interruptSpeech = () => {
    try {
      audioRef.current?.pause();
    } catch (_) {}
    setIsSpeaking(false);
  };

  const recognitionRef = useRef<any>(null);
  // Track last utterance to avoid duplicate sends
  const lastUtteranceRef = useRef<string>("");

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
      lastAssistantTextRef.current = accumulated;

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
    rec.continuous = false;
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
        // If the final text is essentially the same as what the assistant just said, skip (likely echo)
        if (
          lastAssistantTextRef.current &&
          finalText.trim().toLowerCase().startsWith(lastAssistantTextRef.current.trim().slice(0, 20).toLowerCase())
        ) {
          // reset for next user utterance
          currentMsgId = null;
          return;
        }
        // Avoid sending duplicates
        if (finalText.trim().toLowerCase() !== lastUtteranceRef.current.trim().toLowerCase()) {
          sendToClaude(finalText, currentMsgId!);
          lastUtteranceRef.current = finalText;
        }

        // Stop recognition – onend handler will update `isListening`.
        try {
          rec.stop();
        } catch (_) {}

        currentMsgId = null;
      }
    };

    rec.onerror = (err: any) => {
      console.error("Speech recog error", err);
      setIsListening(false);
      if (err?.error === "not-allowed" || err?.name === "NotAllowedError") {
        setError(
          "Microphone access was blocked. Please click the padlock icon in your browser's address bar, allow microphone permissions for this site, then click 'Start Mic' again."
        );
      }
    };

    rec.onstart = () => setIsListening(true);
    rec.onend = () => {
      // Recognition has fully stopped (either naturally after the utterance
      // or via rec.stop/abort). Just update UI state; user must press the
      // mic button again to start a new request.
      setIsListening(false);
    };

    // Do not auto-start listening; the user will press the mic button when ready.

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
        rec.abort();
      }
    } catch (_) {}
  }, [isSpeaking]);

  const toggleListening = () => {
    const rec: any = recognitionRef.current;
    if (!rec) return;
    try {
      if (isListening) {
        rec.abort();
        setIsListening(false);
      } else {
        rec.start();
        // onstart handler will update state, but set a fallback
        setIsListening(true);
      }
    } catch (err) {
      console.error("Speech recog start error", err);
      setError(
        "Unable to access microphone – please allow permissions and use a supported browser (e.g. Chrome on desktop)."
      );
    }
  };

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
                <Button
                  variant="outline"
                  onClick={toggleListening}
                  disabled={isSpeaking}
                >
                  {isListening ? "Stop Mic" : "Start Mic"}
                </Button>
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
