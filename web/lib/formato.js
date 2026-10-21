// Utilidades de presentación compartidas por los componentes.

/** Date → valor para <input type="datetime-local"> en hora local. */
export const aLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const fechaHora = (ms) =>
  ms == null ? "—" : new Date(ms).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "medium" });

export const ultimaConexionMs = (d) => d?.ultimaConexion?.toMillis?.() ?? null;

/** En línea = envió datos hace menos de 3 intervalos de envío + 1 minuto de margen. */
export function enLinea(d) {
  const ms = ultimaConexionMs(d);
  const envio = d?.config?.intervaloEnvioSeg ?? 60;
  return !!ms && Date.now() - ms < (envio * 3 + 60) * 1000;
}

/** Descarga filas como CSV (separador ";" y coma decimal, para Excel en español). */
export function descargarCsv(nombre, cabecera, filas) {
  const celda = (v) => {
    if (v == null) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [cabecera, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
