// CAPA DE ACCESO A DATOS: lecturas (1 documento por minuto) y alertas.
// orgs/{orgId}/devices/{deviceId}/lecturas/{minutoEpoch}
// orgs/{orgId}/devices/{deviceId}/alertas/{minutoEpoch-TIPO[-fin]}
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { deviceRef } from "./devicesRepo";

/**
 * Escribe un lote en UNA operación atómica. Los ids son determinísticos, así que
 * si el dispositivo reenvía un lote, set() sobrescribe el mismo documento: no hay duplicados.
 */
export async function writeBatch(orgId, deviceId, lecturas, alertas, deviceUpdate) {
  const db = adminDb();
  const batch = db.batch();
  const base = deviceRef(orgId, deviceId);
  for (const l of lecturas) {
    const { id, ts, ...campos } = l;
    batch.set(base.collection("lecturas").doc(id), { ...campos, ts: Timestamp.fromMillis(ts * 1000) });
  }
  for (const a of alertas) {
    const { id, ts, ...campos } = a;
    batch.set(base.collection("alertas").doc(id), { ...campos, ts: Timestamp.fromMillis(ts * 1000) });
  }
  batch.update(base, { ...deviceUpdate, ultimaConexion: FieldValue.serverTimestamp() });
  await batch.commit();
}

export async function queryReadings(orgId, deviceId, desde, hasta, limite = 2000) {
  const snap = await deviceRef(orgId, deviceId)
    .collection("lecturas")
    .where("ts", ">=", Timestamp.fromDate(desde))
    .where("ts", "<=", Timestamp.fromDate(hasta))
    .orderBy("ts", "asc")
    .limit(limite)
    .get(); // 1 lectura por documento devuelto
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), ts: d.data().ts.toMillis() }));
}
