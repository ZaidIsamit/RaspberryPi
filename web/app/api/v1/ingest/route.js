// POST /api/v1/ingest  — usado por la Raspberry (token de dispositivo).
// Recibe un lote { lecturas[], alertas[], salud{} }, lo valida y lo escribe en Firestore.
import { autenticarDispositivo } from "@/lib/services/auth";
import { ingerir } from "@/lib/services/devices";
import { handle, json, readJson } from "@/lib/services/http";

export const POST = handle(async (req) => {
  const { orgId, deviceId } = await autenticarDispositivo(req);
  const cuerpo = await readJson(req);
  return json(await ingerir(orgId, deviceId, cuerpo));
});
