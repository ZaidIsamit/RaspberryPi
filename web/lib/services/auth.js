// CAPA DE LÓGICA DE NEGOCIO: autenticación de dispositivos y de usuarios.
import crypto from "node:crypto";
import { adminAuth } from "../data/firebaseAdmin";
import { getDevice } from "../data/devicesRepo";
import { HttpError } from "./http";

const ID_RE = /^[a-z0-9-]{3,40}$/;

// ---------- Tokens de dispositivo: "<orgId>.<deviceId>.<secreto>"
// En Firestore solo se guarda el SHA-256 del secreto: si se filtra la BD, el token no se puede reconstruir.
export function generarToken(orgId, deviceId) {
  const secreto = crypto.randomBytes(24).toString("base64url");
  return { token: `${orgId}.${deviceId}.${secreto}`, tokenHash: hash(secreto) };
}

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function autenticarDispositivo(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [orgId, deviceId, secreto] = token.split(".");
  if (!secreto || !ID_RE.test(orgId) || !ID_RE.test(deviceId)) throw new HttpError(401, "Token inválido");

  const device = await getDevice(orgId, deviceId);
  if (!device || !device.tokenHash) throw new HttpError(401, "Token inválido");
  const a = Buffer.from(hash(secreto), "hex");
  const b = Buffer.from(device.tokenHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Token inválido o revocado");
  return { orgId, deviceId, device };
}

// ---------- Usuarios: ID token de Firebase Auth con custom claims { orgId, role }
export async function autenticarUsuario(req, { soloAdmin = false } = {}) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) throw new HttpError(401, "Falta el token de sesión");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(h.slice(7));
  } catch {
    throw new HttpError(401, "Sesión inválida o expirada");
  }
  const { orgId, role } = decoded;
  if (!orgId || !role) throw new HttpError(403, "Usuario sin organización asignada");
  if (soloAdmin && role !== "admin") throw new HttpError(403, "Requiere rol administrador");
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null; // para la auditoría
  return { uid: decoded.uid, email: decoded.email, orgId, role, ip };
}

export const validarId = (id) => {
  if (!ID_RE.test(id || "")) throw new HttpError(400, "Id inválido (usar minúsculas, números y guiones, 3-40)");
  return id;
};
