// Utilidades HTTP compartidas por las API routes.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200) => Response.json(data, { status });

/** Envuelve un handler: traduce errores de negocio a códigos HTTP y oculta errores internos. */
export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Error interno" }, 500);
    }
  };
}

export async function readJson(req, maxBytes = 200_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Cuerpo demasiado grande");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}
