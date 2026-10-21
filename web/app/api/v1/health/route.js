// GET /api/v1/health — prueba de vida de la API (sin autenticación, no toca Firestore).
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, servicio: "smart-campus-api", hora: new Date().toISOString() });
}
