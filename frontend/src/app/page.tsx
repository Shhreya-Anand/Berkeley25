"use client";

import { useEffect, useRef, useState } from "react";

interface EmotionScore {
  name: string;
  score: number;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [topEmotions, setTopEmotions] = useState<EmotionScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ask for webcam on mount
  useEffect(() => {
    let localStream: MediaStream;

    const enableCamera = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
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

  // Connect to Hume when API key exists and camera ready
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_HUME_API_KEY;
    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_HUME_API_KEY env var.");
      return;
    }

    // Only run in browser after canvas/video refs available
    if (!videoRef.current || !canvasRef.current) return;

    const socket = new WebSocket(
      `wss://api.hume.ai/v0/stream/models?api_key=${apiKey}`
    );

    socket.onopen = () => {
      // Tell Hume we want facial expression predictions
      socket.send(JSON.stringify({ models: { face: {} } }));
    };

    socket.onerror = () => setError("WebSocket connection error.");

    socket.onmessage = (event) => {
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
        socket.send(
          JSON.stringify({ data: jpegBase64, raw_image: true })
        );
      }
    }, 800);

    return () => {
      clearInterval(captureInterval);
      socket.close();
    };
  }, []);

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
    </main>
  );
}
