// GET  /api/v1/audit?limite=200  — (admin) bitácora de auditoría de su organización, más reciente primero
// POST /api/v1/audit             — el usuario registra su inicio/cierre de sesión { accion: "LOGIN" | "LOGOUT" }
import { auditarDesdeCliente, listarAuditoria } from "@/lib/services/audit";
import { autenticarUsuario } from "@/lib/services/auth";
import { handle, json, readJson } from "@/lib/services/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { orgId } = await autenticarUsuario(req, { soloAdmin: true });
  const limite = Number(new URL(req.url).searchParams.get("limite")) || undefined;
  const entradas = await listarAuditoria(orgId, limite);
  return json({ total: entradas.length, entradas });
});

export const POST = handle(async (req) => {
  const usuario = await autenticarUsuario(req);
  const { accion } = await readJson(req, 1000);
  await auditarDesdeCliente(usuario, accion);
  return json({ ok: true }, 201);
});
