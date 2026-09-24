import Foundation

struct PatientStatus: Identifiable, Equatable {
    var id: String { patientId }
    let patientId: String
    var cameraId: String
    var alarm: Bool
    var timestamp: TimeInterval

    static func placeholder(_ id: String) -> PatientStatus {
        PatientStatus(patientId: id, cameraId: "unknown", alarm: false, timestamp: 0)
    }
}
