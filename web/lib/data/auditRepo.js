// CAPA DE ACCESO A DATOS: bitácora de auditoría (solo se agregan entradas, nunca se editan).
// orgs/{orgId}/auditoria/{autoId}   { ts, uid, email, rol, ip, accion, deviceId, detalle }
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";

const col = (orgId) => adminDb().collection(`orgs/${orgId}/auditoria`);

export async function addAudit(orgId, entrada) {
  await col(orgId).add({ ...entrada, ts: FieldValue.serverTimestamp() }); // 1 escritura
}

export async function listAudit(orgId, limite) {
  const snap = await col(orgId).orderBy("ts", "desc").limit(limite).get(); // 1 lectura por entrada
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), ts: d.data().ts?.toMillis() ?? null }));
}
