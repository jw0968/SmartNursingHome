import Foundation
import Combine

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var statuses: [PatientStatus] = []
    @Published var activeAlert: PatientStatus?
    @Published var patientIdsInput: String = "patient-001"
    @Published var connectionMessage: String = "Not monitoring"

    private var seenAlarmState: [String: Bool] = [:]

    func startMonitoring() {
        let patientIds = patientIdsInput
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !patientIds.isEmpty else {
            connectionMessage = "Enter at least one patient ID"
            return
        }

        statuses = patientIds.map(PatientStatus.placeholder)
        connectionMessage = "Listening to \(patientIds.joined(separator: ", "))..."

        FirebaseStatusService.shared.subscribe(
            patientIds: patientIds,
            onUpdate: { [weak self] status in
                Task { @MainActor in
                    self?.applyStatusUpdate(status)
                }
            },
            onError: { [weak self] message in
                Task { @MainActor in
                    self?.connectionMessage = message
                }
            }
        )
    }

    func acknowledge(_ status: PatientStatus) {
        FirebaseStatusService.shared.clearAlarm(
            patientId: status.patientId,
            cameraId: status.cameraId
        )
        activeAlert = nil
    }

    private func applyStatusUpdate(_ status: PatientStatus) {
        if let idx = statuses.firstIndex(where: { $0.patientId == status.patientId }) {
            statuses[idx] = status
        } else {
            statuses.append(status)
        }

        connectionMessage = "Last update: \(status.patientId) alarm=\(status.alarm ? "ON" : "OFF")"

        let previous = seenAlarmState[status.patientId] ?? false
        seenAlarmState[status.patientId] = status.alarm

        if status.alarm && !previous {
            activeAlert = status
            NotificationManager.shared.postAlarmNotification(
                patientId: status.patientId,
                cameraId: status.cameraId
            )
        }
    }
}
