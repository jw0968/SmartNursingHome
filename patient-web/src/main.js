import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "./style.css";
import { appConfig } from "./config";
import { createStatusWriter } from "./firebase";
import { createFallDetector } from "./fallDetector";

const videoEl = document.getElementById("video");
const patientIdInput = document.getElementById("patientIdInput");
const cameraIdInput = document.getElementById("cameraIdInput");
const applyConfigBtn = document.getElementById("applyConfigBtn");
const statusBadge = document.getElementById("statusBadge");
const debugText = document.getElementById("debugText");
const firebaseMode = document.getElementById("firebaseMode");

const url = new URL(window.location.href);
let patientId = url.searchParams.get("patientId") || appConfig.patientId;
let cameraId = url.searchParams.get("cameraId") || appConfig.cameraId;

patientIdInput.value = patientId;
cameraIdInput.value = cameraId;

const writer = createStatusWriter(appConfig.firebaseConfig);
firebaseMode.textContent = writer.mode === "live" ? "LIVE" : "FAKE (console)";

const detector = createFallDetector();
let lastAlarmAt = 0;

function setStatus(alarm) {
  statusBadge.textContent = alarm ? "ALARM" : "OK";
  statusBadge.className = `badge ${alarm ? "alarm" : "ok"}`;
}

async function sendAlarm(alarm) {
  const payload = {
    alarm,
    timestamp: Date.now(),
    cameraId
  };
  await writer.writeStatus(patientId, payload);
}

function syncUrlParams() {
  const next = new URL(window.location.href);
  next.searchParams.set("patientId", patientId);
  next.searchParams.set("cameraId", cameraId);
  window.history.replaceState({}, "", next);
}

applyConfigBtn.addEventListener("click", () => {
  patientId = patientIdInput.value.trim() || appConfig.patientId;
  cameraId = cameraIdInput.value.trim() || appConfig.cameraId;
  syncUrlParams();
});

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

async function initTensorFlow() {
  await tf.setBackend("webgl");
  await tf.ready();
}

async function main() {
  await initTensorFlow();
  await setupCamera();

  const model = poseDetection.SupportedModels.MoveNet;
  const detectorModel = await poseDetection.createDetector(model, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  });

  debugText.textContent = "Camera + MoveNet running. Monitoring...";
  setStatus(false);

  async function renderLoop() {
    const poses = await detectorModel.estimatePoses(videoEl, { maxPoses: 1, flipHorizontal: false });
    const pose = poses[0];

    if (pose) {
      const result = detector(
        pose,
        videoEl.videoWidth,
        videoEl.videoHeight,
        performance.now()
      );
      debugText.textContent = JSON.stringify(
        {
          patientId,
          cameraId,
          mode: writer.mode,
          detector: result
        },
        null,
        2
      );

      const now = Date.now();
      if (result.isFall && now - lastAlarmAt > 8000) {
        lastAlarmAt = now;
        setStatus(true);
        await sendAlarm(true);
      } else if (!result.isFall) {
        setStatus(false);
      }
    }

    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}

main().catch((err) => {
  console.error(err);
  debugText.textContent = `Failed to start: ${err.message}`;
});
