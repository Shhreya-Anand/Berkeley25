import React, { useEffect, useRef, useState } from "react";

const ASLRecognizer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function enableCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("getUserMedia error", err);
        setError("Could not access webcam. Please allow camera permission.");
      }
    }

    enableCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="my-8 flex flex-col items-center">
      {error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : (
        <video
          ref={videoRef}
          className="w-full max-w-md rounded-lg shadow-md bg-black"
          playsInline
          muted
        />
      )}
    </div>
  );
};

export default ASLRecognizer; 