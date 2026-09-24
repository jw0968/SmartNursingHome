import SwiftUI

struct PatientRowView: View {
    let status: PatientStatus
    let onAcknowledge: (PatientStatus) -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(status.patientId).font(.headline)
                Text("Camera: \(status.cameraId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(status.alarm ? "ALARM" : "OK")
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(status.alarm ? Color.red : Color.green)
                .foregroundStyle(.white)
                .clipShape(Capsule())
            if status.alarm {
                Button("Acknowledge") {
                    onAcknowledge(status)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}
