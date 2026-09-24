# Smart Nursing Home — Fall Detection Monitoring System

**Project Summary**

## Overview

Smart Nursing Home is a privacy-preserving fall-monitoring prototype for residential care. A **patient-side web app** runs pose estimation and fall detection entirely on the device camera; a **caregiver-side native iOS app** receives only alarm state in real time. Video never leaves the patient device — only structured status (`alarm`, `timestamp`, `cameraId`) is synchronized via **Firebase Realtime Database**.

---

## Problem

Falls are a leading cause of injury and delayed medical response in nursing homes and assisted-living settings. Traditional monitoring often forces a tradeoff:

- **Continuous video streaming** raises privacy, consent, bandwidth, and storage concerns.
- **Wearables or bed sensors** can be forgotten, removed, or fail to cover common fall scenarios (e.g., in common areas).
- **Manual rounds** do not provide continuous, room-level coverage across many residents and cameras.

Caregivers need **timely, actionable alerts** without exposing raw video off-premises.

---

## Solution

A two-part system separates **local inference** from **remote alerting**:

| Component | Role |
|-----------|------|
| **Patient web app** (`patient-web`) | Browser camera + on-device pose detection; fall heuristic; writes alarm state to Firebase |
| **Caregiver iOS app** (SwiftUI) | Subscribes to patient status paths; dashboard, in-app alerts, local notifications; acknowledge/clear alarms |

**Data path:** Patient device → `/patients/{patientId}/status` → Caregiver device(s). No video upload.

**Multi-camera / multi-resident:** Each patient instance is configured with `patientId` and `cameraId` (URL params, UI, or env), so several browsers can monitor different rooms under distinct paths.

---

## Technical Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Patient device (browser)   │         │  Firebase Realtime Database  │
│  ┌───────────────────────┐  │  write  │  /patients/{id}/status       │
│  │ Camera (getUserMedia) │──┼────────►│    alarm: boolean            │
│  │ MoveNet Lightning     │  │  only   │    timestamp: number         │
│  │ Fall heuristic        │  │         │    cameraId: string          │
│  └───────────────────────┘  │         └──────────────┬───────────────┘
└─────────────────────────────┘                        │ observe
                                                       ▼
                                         ┌──────────────────────────────┐
                                         │  Caregiver iPhone (SwiftUI)  │
                                         │  Dashboard · alerts · notify │
                                         │  Acknowledge → alarm: false  │
                                         └──────────────────────────────┘
```

**Stack (minimal dependencies):**

- **Patient:** Vite, TensorFlow.js (WebGL backend, explicitly initialized via `tf.setBackend("webgl")` + `tf.ready()`), `@tensorflow-models/pose-detection`, Firebase JS SDK (Realtime Database).
- **Caregiver:** SwiftUI, Firebase iOS SDK (`FirebaseCore`, `FirebaseDatabase`), `UserNotifications` for local alerts.
- **Sync layer:** Firebase Realtime Database (chosen for low-latency boolean/state sync, not Firestore).

Prototype database rules allow open read/write on `/patients/{patientId}/status` with schema validation; production would use Firebase Auth–scoped rules.

---

## AI Models and Fall Detection Approach

**Model:** **MoveNet SinglePose Lightning** via TensorFlow.js pose-detection API. Lightning is optimized for speed on consumer hardware in the browser, suitable for near–real-time loops on a live video stream. The WebGL backend is explicitly initialized before model load to prevent runtime backend conflicts.

**Pipeline per frame:**

1. Capture frames from `getUserMedia`.
2. `estimatePoses()` → 17 body keypoints with confidence scores.
3. Pass pose + frame dimensions into an isolated **`createFallDetector()`** state machine (`patient-web/src/fallDetector.js`).
4. If a fall is detected, write alarm state to Firebase. No skeleton overlay is drawn — camera shows a clean feed.

**Heuristic (not an end-to-end "fall classifier"):** Temporal rules on torso keypoints only (shoulders + hips):

1. **Rapid drop** — Torso center (average of available shoulder/hip keypoints) drops below a slowly adapting baseline, or downward velocity spikes. Either condition alone is enough to start a fall candidate.
2. **Sustained low posture** — Torso remains below baseline for `holdSeconds` (0.5 s). Only two confirmation conditions are required — no horizontal posture check.
3. **Cooldown** — After one alarm, suppress repeats for 8 seconds to avoid alarm storms.

**Keypoint flexibility:** Only **2 of the 4** torso keypoints (left/right shoulder, left/right hip) need to be visible with confidence ≥ 0.25. This means detection still works when the person is partially out of frame. The debug panel reports `usedKeypoints` so the operator can see which points are active.

**Tunable parameters (all in `DEFAULTS` at the top of `fallDetector.js`):**

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `dropThreshold` | 0.04 | Minimum torso drop below baseline to start candidate |
| `velocityThreshold` | 0.08 | Minimum downward velocity to start candidate |
| `lowTorsoOffset` | 0.05 | How far below baseline torso must stay during hold |
| `holdSeconds` | 0.5 | How long low posture must hold before alarm fires |
| `cooldownSeconds` | 8 | Pause between alarms |
| `minTorsoPoints` | 2 | Minimum visible torso keypoints required |

This design supports field tuning without retraining a model.

**Alarm payload:** `{ alarm: true, timestamp, cameraId }` written to `/patients/{patientId}/status`. Development supports **fake Firebase mode** (console logging) when Firebase credentials are not configured.

---

## Caregiver App Implementation

- **Subscription:** `DatabaseReference.observe(.value)` on one or more patient IDs (comma-separated list). Subscription errors surface to the UI via an `onError` callback.
- **UI:** Per-patient row with `OK` / `ALARM`, camera ID, connection status message, and **Acknowledge** button when alarm is active.
- **Alerting:** On transition `alarm: false → true`, show SwiftUI alert and post a **local notification with sound** (works when app is backgrounded with permissions granted).
- **Clear path:** Acknowledge writes `alarm: false` with updated timestamp back to the same Firebase path.
- **Extensibility:** Services are split (`FirebaseStatusService`, `NotificationManager`) so **Firebase Cloud Messaging** can be added later for alerts when the app is fully terminated.

---

## Expected Impact

| Area | Expected benefit |
|------|------------------|
| **Resident privacy** | Video processed locally; only alarm metadata leaves the room device. |
| **Response time** | Realtime DB + local notifications aim for sub-second caregiver awareness vs. periodic checks. |
| **Scalability (prototype)** | Multiple `patientId` / `cameraId` instances map to distinct DB paths; one caregiver app can monitor several patients simultaneously. |
| **Cost / ops** | Browser-based patient client avoids per-room dedicated hardware beyond a camera-capable device; minimal cloud surface (boolean state, not video). |
| **Iteration** | Heuristic thresholds can be tuned from real facility footage without full model retraining. |

**Realistic limits (prototype):** Heuristic detection tuned for sensitivity will produce false positives (sitting down quickly, bending over, leaving frame). Production would require threshold calibration on real fall data, auth-hardened Firebase rules, audit logging, and FCM/APNs for killed-app push notifications. Clinical validation and regulatory requirements are out of scope for this build but should be planned before deployment.

---

## Repository Structure

- `patient-web/` — Vite + TensorFlow.js patient monitor
- `SmartNursingHome/` — Xcode project containing the SwiftUI caregiver app
- `caregiver-ios/` — Notes on the caregiver app's Firebase data contract
- `README.md` — Firebase setup, run instructions, database rules
- `PROJECT_SUMMARY.md` — This document

---

## Summary

Smart Nursing Home demonstrates a **privacy-first fall-monitoring architecture**: MoveNet Lightning pose estimation runs entirely on the patient device with no video egress. A simplified torso-based heuristic detects rapid drops with a short confirmation hold, tolerating partial keypoint visibility. Firebase Realtime Database acts as a thin alarm bus to a native SwiftUI caregiver dashboard with real-time subscription, in-app alerts, local notifications, and an acknowledge workflow. The design prioritizes **no video egress**, **fast boolean sync**, and a clear path to production hardening.
