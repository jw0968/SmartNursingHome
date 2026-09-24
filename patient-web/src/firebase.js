import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

function hasFullFirebaseConfig(cfg) {
  return (
    cfg &&
    cfg.apiKey &&
    cfg.projectId &&
    cfg.databaseURL &&
    cfg.appId
  );
}

export function createStatusWriter(firebaseConfig) {
  if (!hasFullFirebaseConfig(firebaseConfig)) {
    return {
      mode: "fake",
      async writeStatus(patientId, payload) {
        console.log("FAKE FIREBASE WRITE", {
          path: `/patients/${patientId}/status`,
          payload
        });
      }
    };
  }

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  return {
    mode: "live",
    async writeStatus(patientId, payload) {
      const statusRef = ref(db, `/patients/${patientId}/status`);
      await set(statusRef, payload);
      console.log("FIREBASE WRITE OK", {
        path: `/patients/${patientId}/status`,
        payload
      });
    }
  };
}
