# Smart Nursing Home

**Privacy-first fall detection for care facilities.** A browser app on the patient side runs pose estimation on-device and only ever sends a boolean alarm; a native iOS app on the caregiver side gets that alarm in real time. Raw video never leaves the room.

```
Patient device (browser)                 Firebase Realtime DB              Caregiver iPhone (SwiftUI)
┌──────────────────────────┐             ┌────────────────────────┐        ┌──────────────────────────┐
│ Camera → MoveNet (TF.js) │  alarm only │ /patients/{id}/status  │ observe│ Dashboard · alert ·      │
│ → fall heuristic         │────────────►│   alarm: bool          │───────►│ local notification       │
│ (no video upload)        │             │   timestamp: number    │◄───────│ Acknowledge → alarm=false│
└──────────────────────────┘             │   cameraId: string     │        └──────────────────────────┘
                                         └────────────────────────┘
```

## Contents

- [Why](#why)
- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Setup](#setup)
  - [1. Firebase project](#1-firebase-project)
  - [2. Patient web app](#2-patient-web-app)
  - [3. Caregiver iOS app](#3-caregiver-ios-app)
- [Fall detection heuristic](#fall-detection-heuristic)
- [Security notes](#security-notes)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why

Falls are a leading cause of injury in nursing homes, and existing monitoring forces a bad tradeoff: continuous video streaming is a privacy and consent problem, wearables get forgotten or removed, and manual rounds leave long gaps. This project explores a middle path where inference happens entirely on a cheap camera-capable device in the room and the only thing that crosses the network is `{ alarm, timestamp, cameraId }`.

## How it works

| Component | Stack | Role |
|-----------|-------|------|
| **Patient web app** (`patient-web/`) | Vite, TensorFlow.js (WebGL), MoveNet SinglePose Lightning, Firebase JS SDK | Reads the webcam, estimates 17 body keypoints per frame, runs a tunable fall heuristic, writes alarm state to Firebase |
| **Caregiver iOS app** (`SmartNursingHome/`) | SwiftUI, Firebase iOS SDK (`FirebaseCore`, `FirebaseDatabase`), `UserNotifications` | Subscribes to one or more patient status paths, shows a live dashboard, raises an in-app alert and a local notification with sound, and lets the caregiver acknowledge (clear) an alarm |
| **Sync layer** | Firebase Realtime Database | Thin, low-latency alarm bus. Chosen over Firestore for fast boolean sync |

Several patient devices can run at once. Each is configured with a `patientId` and `cameraId` (via URL params, the in-app fields, or `.env`), and each writes to its own `/patients/{patientId}/status` path. One caregiver app can monitor any number of patients.

## Repository layout

```
.
├── patient-web/                  Vite + TensorFlow.js patient monitor
│   ├── index.html
│   ├── .env.example              Copy to .env and fill in your Firebase web config
│   └── src/
│       ├── main.js               Camera, MoveNet loop, alarm dispatch
│       ├── fallDetector.js       Isolated, tunable fall heuristic
│       ├── firebase.js           Live vs. fake status writer
│       ├── config.js             Env-driven config
│       └── style.css
├── SmartNursingHome/             Xcode project for the caregiver iOS app
│   └── SmartNursingHome/
│       ├── CaregiverAppApp.swift             App entry, Firebase configure, notification permission
│       ├── GoogleService-Info.plist          PLACEHOLDER. Replace with your own from Firebase
│       ├── Models/PatientStatus.swift
│       ├── Services/FirebaseStatusService.swift   Subscribe + clear-alarm writes
│       ├── Services/NotificationManager.swift     Local notifications
│       ├── ViewModels/DashboardViewModel.swift    Alarm flip detection
│       └── Views/                            ContentView, PatientRowView
├── caregiver-ios/README.md       Notes on the iOS app's Firebase contract
├── PROJECT_SUMMARY.md            Longer design write-up
├── LICENSE                       MIT
└── README.md
```

## Setup

### 1. Firebase project

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. **Build → Realtime Database → Create database.** Start in test mode for local development.
3. **Project settings → General → Your apps:**
   - Add a **Web app**. Copy its config values into `patient-web/.env` (step 2 below).
   - Add an **iOS app** with bundle ID `com.jixinwang.SmartNursingHome` (or change `PRODUCT_BUNDLE_IDENTIFIER` in Xcode to whatever you register). Download its `GoogleService-Info.plist` (step 3 below).
4. Set database rules. For a prototype, this allows open read/write on the status path while validating the payload shape:

```json
{
  "rules": {
    "patients": {
      "$patientId": {
        "status": {
          ".read": true,
          ".write": true,
          ".validate": "newData.hasChildren(['alarm','timestamp','cameraId']) && newData.child('alarm').isBoolean() && newData.child('timestamp').isNumber() && newData.child('cameraId').isString()"
        }
      }
    }
  }
}
```

   Open rules mean anyone with your database URL can write alarms. See [Security notes](#security-notes) before exposing this to anyone but yourself.

### 2. Patient web app

Requires Node 18+ and a browser with webcam access (Chrome or Edge recommended for WebGL performance).

```bash
cd patient-web
cp .env.example .env     # then fill in the VITE_FIREBASE_* values
npm install
npm run dev
```

Open the URL Vite prints and allow camera access. The page shows the live feed, a status badge, and a debug panel with the detector's current state.

- **Fake mode.** If the `VITE_FIREBASE_*` values are left blank, the app runs in `FAKE` mode and logs writes to the browser console (`FAKE FIREBASE WRITE`) instead of hitting Firebase. Useful for testing detection before wiring up a backend.
- **Live mode.** With a full config, a detected fall logs `FIREBASE WRITE OK` and updates `/patients/{patientId}/status` in the console.
- **Multiple cameras.** Pass IDs as URL params, e.g. `http://localhost:5173/?patientId=patient-002&cameraId=cam-hallway`, or edit them in the page and click **Apply IDs**.

To build a static bundle: `npm run build` (output in `patient-web/dist/`, which is gitignored because it embeds your Firebase config).

### 3. Caregiver iOS app

Requires Xcode 15+ and iOS 16+.

1. Open `SmartNursingHome/SmartNursingHome.xcodeproj`.
2. Replace `SmartNursingHome/SmartNursingHome/GoogleService-Info.plist` with the one you downloaded from Firebase. The committed file is a placeholder and the app will not connect until you swap it.
3. Xcode resolves the Firebase iOS SDK via Swift Package Manager on first open. If it does not, add `https://github.com/firebase/firebase-ios-sdk` with the `FirebaseCore` and `FirebaseDatabase` products.
4. Build and run on a simulator or device.
5. Enter one or more patient IDs, comma-separated (`patient-001,patient-002`), and tap **Start Monitoring**.
6. Trigger a fall in front of the patient app. The row flips to **ALARM**, an alert appears, and a local notification fires. Tap **Acknowledge** to write `alarm: false` back to Firebase.

Local notifications work while the app is backgrounded. Alerts when the app is fully terminated require Firebase Cloud Messaging and APNs, which are not yet wired up.

## Fall detection heuristic

Detection lives entirely in [`patient-web/src/fallDetector.js`](patient-web/src/fallDetector.js) as a small state machine with no dependency on the UI or Firebase, so it can be unit-tested and tuned in isolation.

It uses only the four torso keypoints (left/right shoulder, left/right hip) and needs just **two of the four** visible with confidence ≥ 0.25, so it keeps working when the person is partially out of frame.

Per frame:

1. **Torso center** is the mean Y of the visible torso keypoints, normalized by frame height.
2. **Baseline** is an exponential moving average of torso center (`0.98 * prev + 0.02 * current`), so it slowly adapts as the person moves around the room.
3. **Rapid drop** starts a fall candidate when the torso is more than `dropThreshold` below baseline **or** downward velocity exceeds `velocityThreshold`.
4. **Sustained low posture** confirms the candidate if the torso stays at least `lowTorsoOffset` below baseline for `holdSeconds`. If it recovers first, the candidate is dropped.
5. **Cooldown** suppresses further alarms for `cooldownSeconds` after one fires.

All thresholds are in the `DEFAULTS` object at the top of the file:

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `dropThreshold` | 0.04 | Torso drop below baseline (fraction of frame height) that starts a candidate |
| `velocityThreshold` | 0.08 | Downward velocity (frame heights / second) that starts a candidate |
| `lowTorsoOffset` | 0.05 | How far below baseline the torso must stay during the hold |
| `holdSeconds` | 0.5 | How long low posture must persist before an alarm fires |
| `cooldownSeconds` | 8 | Minimum gap between alarms |
| `minTorsoPoints` | 2 | Minimum visible torso keypoints required to evaluate a frame |

The defaults are deliberately sensitive for demo purposes and will false-positive on things like sitting down fast or bending to pick something up. Tune them on real footage from your environment before relying on the output.

## Security notes

This is a prototype. Before deploying anywhere real:

- **Never commit real credentials.** `patient-web/.env` and `patient-web/dist/` are gitignored. The committed `GoogleService-Info.plist` and `.env.example` contain placeholders only. If you ever push a real key by accident, rotate it in the Firebase Console and rewrite history.
- **Lock down database rules.** The test-mode rules above let anyone read every patient's status and write fake alarms. Replace them with Firebase Auth-scoped rules so only the patient device for a given ID can write, and only authorized caregivers can read.
- **Firebase web API keys are not secrets in the usual sense** (they identify your project, and access is controlled by rules and App Check), but they still should not be published alongside open rules. Enable [App Check](https://firebase.google.com/docs/app-check) for both apps.
- **Add audit logging** for alarms and acknowledgements. A care setting will need to know who cleared what and when.

## Limitations and roadmap

- Heuristic, not learned. A trained temporal classifier on real fall data would cut false positives substantially.
- Single person per frame (MoveNet SinglePose). Shared rooms need multi-pose handling.
- No push when the caregiver app is killed. Needs FCM + APNs.
- No authentication on either side.
- No clinical validation. This is not a medical device and has not been evaluated as one.

## Contributing

Issues and pull requests are welcome, especially:

- Recorded fall / non-fall clips (with consent) for threshold tuning
- Unit tests for `fallDetector.js`
- Firebase Auth rules and App Check integration
- FCM push for the caregiver app

Please do not include real Firebase credentials in any contribution.

## License

[MIT](LICENSE). Not a medical device; see [Limitations and roadmap](#limitations-and-roadmap).
