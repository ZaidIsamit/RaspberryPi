// CAPA DE ACCESO A DATOS: dispositivos.
// Ruta: orgs/{orgId}/devices/{deviceId}
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";

const ref = (orgId, deviceId) => adminDb().doc(`orgs/${orgId}/devices/${deviceId}`);

export async function getDevice(orgId, deviceId) {
  const snap = await ref(orgId, deviceId).get(); // 1 lectura
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function listDevices(orgId) {
  const snap = await adminDb().collection(`orgs/${orgId}/devices`).get();
  return snap.docs.map((d) => {
    const { tokenHash, ...rest } = d.data();
    return { id: d.id, ...rest };
  });
}

export async function createDevice(orgId, deviceId, data) {
  await ref(orgId, deviceId).create({ ...data, creado: FieldValue.serverTimestamp() });
}

export async function updateDevice(orgId, deviceId, data) {
  await ref(orgId, deviceId).update(data);
}

export const deviceRef = ref;
