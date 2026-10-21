// CAPA DE LÓGICA DE NEGOCIO: auditoría de las acciones de los usuarios.
import { addAudit, listAudit } from "../data/auditRepo";
import { HttpError } from "./http";

// El navegador solo puede declarar su propio inicio/cierre de sesión; el resto lo registra la API.
const DESDE_CLIENTE = ["LOGIN", "LOGOUT"];

export async function auditar(usuario, accion, { deviceId = null, detalle = null } = {}) {
  try {
    await addAudit(usuario.orgId, {
      uid: usuario.uid,
      email: usuario.email ?? null,
      rol: usuario.role,
      ip: usuario.ip ?? null,
      accion,
      deviceId,
      detalle,
    });
  } catch (e) {
    // La acción ya se aplicó: no se revierte, pero queda constancia en los logs de Vercel.
    console.error("No se pudo registrar la auditoría", accion, e);
  }
}

export async function auditarDesdeCliente(usuario, accion) {
  if (!DESDE_CLIENTE.includes(accion)) throw new HttpError(400, "Acción no permitida");
  await auditar(usuario, accion);
}

export function listarAuditoria(orgId, limite) {
  const n = Number.isInteger(limite) ? Math.min(Math.max(limite, 1), 500) : 200;
  return listAudit(orgId, n);
}
