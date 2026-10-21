// POST /api/v1/devices/{id}/token — (admin) genera un token nuevo y revoca el anterior
import { autenticarUsuario, validarId } from "@/lib/services/auth";
import { regenerarToken } from "@/lib/services/devices";
import { handle, json } from "@/lib/services/http";

export const POST = handle(async (req, ctx) => {
  const { orgId } = await autenticarUsuario(req, { soloAdmin: true });
  const { id } = await ctx.params;
  return json(await regenerarToken(orgId, validarId(id)));
});
