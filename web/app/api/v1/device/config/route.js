// GET /api/v1/device/config — la Raspberry obtiene su configuración vigente (token de dispositivo).
import { autenticarDispositivo } from "@/lib/services/auth";
import { configDeDispositivo } from "@/lib/services/devices";
import { handle, json } from "@/lib/services/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const { device } = await autenticarDispositivo(req);
  return json({ config: configDeDispositivo(device) });
});
