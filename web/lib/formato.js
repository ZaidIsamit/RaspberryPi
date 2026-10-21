// Utilidades de presentación compartidas por los componentes.

/** Date → valor para <input type="datetime-local"> en hora local. */
export const aLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Siempre formato de 24 horas (hourCycle h23), independiente de la configuración del navegador
const F_FECHA_HORA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const F_HORA = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const F_EJE = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const F_EJE_FECHA = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const ms = (x) => (x?.toMillis ? x.toMillis() : x instanceof Date ? x.getTime() : x);
/** 21-10-2026 14:05:09 — acepta milisegundos, Date o Timestamp de Firestore. */
export const fechaHora = (x) => (x == null ? "—" : F_FECHA_HORA.format(ms(x)));
/** 14:05:09 */
export const hora = (x) => (x == null ? "—" : F_HORA.format(ms(x)));
/** Etiquetas del eje del gráfico: 14:05 o 21-10 14:05 */
export const ejeTiempo = (x, conFecha) => (conFecha ? F_EJE_FECHA : F_EJE).format(ms(x));

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
