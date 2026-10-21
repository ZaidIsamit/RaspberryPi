// GET /api/v1/readings?deviceId=sala-101&desde=ISO&hasta=ISO — histórico por rango de fechas
import { autenticarUsuario, validarId } from "@/lib/services/auth";
import { historico } from "@/lib/services/devices";
import { handle, json } from "@/lib/services/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { orgId } = await autenticarUsuario(req);
  const p = new URL(req.url).searchParams;
  const lecturas = await historico(orgId, validarId(p.get("deviceId")), new Date(p.get("desde")), new Date(p.get("hasta")));
  return json({ total: lecturas.length, lecturas });
});
