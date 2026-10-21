// PUT /api/v1/devices/{id}/config — (admin) cambia intervalos, umbrales o activa/desactiva sensores.
// La Raspberry la recoge en su siguiente consulta (≤30 s) y la aplica sin reiniciarse.
import { autenticarUsuario, validarId } from "@/lib/services/auth";
import { actualizarConfig } from "@/lib/services/devices";
import { handle, json, readJson } from "@/lib/services/http";

export const PUT = handle(async (req, ctx) => {
  const { orgId } = await autenticarUsuario(req, { soloAdmin: true });
  const { id } = await ctx.params;
  return json({ config: await actualizarConfig(orgId, validarId(id), await readJson(req)) });
});
