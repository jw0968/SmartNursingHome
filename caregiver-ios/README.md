# Caregiver iOS App

The runnable SwiftUI app lives in the Xcode project at [`../SmartNursingHome/`](../SmartNursingHome/). See the top-level [README](../README.md#3-caregiver-ios-app) for setup steps.

This folder documents the app's data contract with Firebase.

## Source files (in `SmartNursingHome/SmartNursingHome/`)

- `CaregiverAppApp.swift`: app entry point, Firebase configure, notification permission request.
- `Models/PatientStatus.swift`: patient status model.
- `Services/FirebaseStatusService.swift`: Realtime DB subscribe + clear-alarm writes.
- `Services/NotificationManager.swift`: local notification helper.
- `ViewModels/DashboardViewModel.swift`: dashboard state and alarm flip handling.
- `Views/ContentView.swift`: patient dashboard.
- `Views/PatientRowView.swift`: row UI and acknowledge action.
- `GoogleService-Info.plist`: **placeholder**. Replace with your own from the Firebase Console.

## Firebase path

The app listens and writes at:

```
/patients/{patientId}/status
```

Expected payload:

```json
{
  "alarm": true,
  "timestamp": 1716840000000,
  "cameraId": "cam-01"
}
```

- `alarm`: `true` when the patient app detected a fall; the caregiver's **Acknowledge** button writes `false`.
- `timestamp`: Unix epoch milliseconds of the last write.
- `cameraId`: which camera produced the state, echoed back on acknowledge.

The database URL is read from `DATABASE_URL` in `GoogleService-Info.plist`, falling back to the default database for the configured project.
