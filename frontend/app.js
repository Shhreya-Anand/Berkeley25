//Uses webcam + ONNX model

const video = document.querySelector("video");
const canvas = document.querySelector("canvas");
const resultDiv = document.getElementById("result");

async function setupWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadModel() {
  return await ort.InferenceSession.create("model.onnx");
}

async function predict(session) {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, 28, 28); // resize to match input shape
  const imageData = ctx.getImageData(0, 0, 28, 28);
  const gray = new Float32Array(1 * 1 * 28 * 28);
  for (let i = 0; i < 28 * 28; i++) {
    gray[i] = imageData.data[i * 4] / 255.0; // R only for grayscale
  }

  const tensor = new ort.Tensor("float32", gray, [1, 1, 28, 28]);
  const output = await session.run({ input: tensor });
  const preds = output.output.data;
  const maxIdx = preds.indexOf(Math.max(...preds));
  const ascii = String.fromCharCode(65 + maxIdx);
  resultDiv.textContent = ascii;
}

(async () => {
  await setupWebcam();
  const session = await loadModel();
  setInterval(() => predict(session), 1000); // predict every second
})();
