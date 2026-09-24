import Foundation
import FirebaseDatabase

final class FirebaseStatusService {
    static let shared = FirebaseStatusService()
    private init() {}

    private var handles: [String: DatabaseHandle] = [:]
    private var refs: [String: DatabaseReference] = [:]

    private var database: Database {
        if let url = Bundle.main.object(forInfoDictionaryKey: "DATABASE_URL") as? String, !url.isEmpty {
            return Database.database(url: url)
        }

        if
            let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
            let plist = NSDictionary(contentsOfFile: plistPath),
            let url = plist["DATABASE_URL"] as? String,
            !url.isEmpty
        {
            return Database.database(url: url)
        }

        return Database.database()
    }

    func subscribe(
        patientIds: [String],
        onUpdate: @escaping (PatientStatus) -> Void,
        onError: ((String) -> Void)? = nil
    ) {
        unsubscribeAll()

        for patientId in patientIds {
            let ref = database.reference(withPath: "patients/\(patientId)/status")
            refs[patientId] = ref

            let handle = ref.observe(.value, with: { snapshot in
                let status = Self.parseStatus(patientId: patientId, snapshot: snapshot)
                print("Firebase update for \(patientId): alarm=\(status.alarm), camera=\(status.cameraId)")
                onUpdate(status)
            }, withCancel: { error in
                let message = "Firebase listen failed for \(patientId): \(error.localizedDescription)"
                print(message)
                onError?(message)
            })

            handles[patientId] = handle
        }
    }

    func clearAlarm(patientId: String, cameraId: String) {
        let ref = database.reference(withPath: "patients/\(patientId)/status")
        let payload: [String: Any] = [
            "alarm": false,
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "cameraId": cameraId
        ]
        ref.setValue(payload)
    }

    func unsubscribeAll() {
        for (patientId, handle) in handles {
            refs[patientId]?.removeObserver(withHandle: handle)
        }
        handles.removeAll()
        refs.removeAll()
    }

    private static func parseStatus(patientId: String, snapshot: DataSnapshot) -> PatientStatus {
        guard let dict = snapshot.value as? [String: Any] else {
            return PatientStatus.placeholder(patientId)
        }

        return PatientStatus(
            patientId: patientId,
            cameraId: dict["cameraId"] as? String ?? "unknown",
            alarm: parseBool(dict["alarm"]),
            timestamp: parseTimestamp(dict["timestamp"])
        )
    }

    private static func parseBool(_ value: Any?) -> Bool {
        if let boolValue = value as? Bool {
            return boolValue
        }
        if let numberValue = value as? NSNumber {
            return numberValue.boolValue
        }
        return false
    }

    private static func parseTimestamp(_ value: Any?) -> TimeInterval {
        if let timestamp = value as? TimeInterval {
            return timestamp
        }
        if let timestamp = value as? Int {
            return TimeInterval(timestamp)
        }
        if let timestamp = value as? Int64 {
            return TimeInterval(timestamp)
        }
        if let timestamp = value as? NSNumber {
            return timestamp.doubleValue
        }
        return 0
    }
}
