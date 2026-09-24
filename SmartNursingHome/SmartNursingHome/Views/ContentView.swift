import SwiftUI

struct ContentView: View {
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TextField("patient-001,patient-002", text: $vm.patientIdsInput)
                    .textFieldStyle(.roundedBorder)
                Button("Start Monitoring") {
                    vm.startMonitoring()
                }
                .buttonStyle(.borderedProminent)

                Text(vm.connectionMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                List(vm.statuses) { status in
                    PatientRowView(status: status) { vm.acknowledge($0) }
                }
            }
            .padding()
            .navigationTitle("Caregiver Dashboard")
            .alert(item: $vm.activeAlert) { status in
                Alert(
                    title: Text("Fall Alarm"),
                    message: Text("Patient \(status.patientId) alarm is ON."),
                    dismissButton: .default(Text("OK"))
                )
            }
        }
    }
}
