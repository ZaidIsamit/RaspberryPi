// GET  /api/v1/devices        — lista los dispositivos de la organización del usuario
// POST /api/v1/devices        — (admin) crea un dispositivo y devuelve su token UNA vez
import { autenticarUsuario, validarId } from "@/lib/services/auth";
import { crearDispositivo, listar } from "@/lib/services/devices";
import { handle, json, readJson } from "@/lib/services/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { orgId } = await autenticarUsuario(req);
  return json({ dispositivos: await listar(orgId) });
});

export const POST = handle(async (req) => {
  const usuario = await autenticarUsuario(req, { soloAdmin: true });
  const { id, nombre } = await readJson(req);
  return json(await crearDispositivo(usuario.orgId, validarId(id), nombre, usuario), 201);
});
