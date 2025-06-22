import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Hands } from "@mediapipe/hands";
import * as cam from "@mediapipe/camera_utils";

export default function ASLRecognizer() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [recognized, setRecognized] = useState("...");

  useEffect(() => {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || results.multiHandLandmarks.length === 0) return;

      const landmarks = results.multiHandLandmarks[0];

      // Basic gesture rule: open palm vs fist
      const isFist = landmarks.every((lm, i) => i > 4 && lm.y > landmarks[0].y + 0.1);
      const isPalmOpen =
        landmarks[8].y < landmarks[6].y &&
        landmarks[12].y < landmarks[10].y &&
        landmarks[16].y < landmarks[14].y;

      let detected = "...";
      if (isFist) detected = "Tired";
      else if (isPalmOpen) detected = "Hello";

      if (detected !== recognized) {
        setRecognized(detected);
      }

      // Draw image to canvas
      ctx.clearRect(0, 0, 640, 480);
      ctx.drawImage(results.image, 0, 0, 640, 480);
    });

    if (webcamRef.current?.video) {
      const camera = new cam.Camera(webcamRef.current.video!, {
        onFrame: async () => {
          await hands.send({ image: webcamRef.current!.video! });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }
  }, []);

  return (
    <div className="mt-8">
      <div className="flex flex-col items-center">
        <Webcam ref={webcamRef} width={640} height={480} className="rounded" />
        <canvas ref={canvasRef} width={640} height={480} className="hidden" />
        <p className="text-xl font-semibold mt-4">
          Detected Sign: <span className="text-indigo-600">{recognized}</span>
        </p>
      </div>
    </div>
  );
}
