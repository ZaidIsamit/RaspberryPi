// CAPA DE LÓGICA DE NEGOCIO: validación de todo lo que envía el dispositivo o el usuario.
import { HttpError } from "./http";

const num = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const numONull = (v, min, max) => v === null || v === undefined || num(v, min, max);

export function validarLectura(l) {
  if (!l || typeof l !== "object") return false;
  const ahora = Date.now() / 1000;
  if (typeof l.id !== "string" || !/^\d{8,12}$/.test(l.id)) return false;
  if (!num(l.ts, ahora - 30 * 86400, ahora + 300)) return false;        // máx. 30 días atrás, 5 min adelante
  if (String(Math.floor(l.ts / 60)) !== l.id) return false;             // id = minuto epoch
  if (!numONull(l.t, -40, 80) || !numONull(l.tMin, -40, 80) || !numONull(l.tMax, -40, 80)) return false;
  if (!numONull(l.h, 0, 100) || !numONull(l.pres, 0, 1) || !numONull(l.conf, 0, 100)) return false;
  if (!num(l.mov ?? 0, 0, 100000) || !num(l.nClima ?? 0, 0, 1000)) return false;
  if (typeof l.ocup !== "boolean") return false;
  if (typeof l.estado !== "string" || l.estado.length > 40) return false;
  return true;
}

export function limpiarLectura(l) {
  const { id, ts, t, tMin, tMax, h, nClima, pres, mov, ocup, conf, estado } = l;
  return { id, ts, t: t ?? null, tMin: tMin ?? null, tMax: tMax ?? null, h: h ?? null,
    nClima: nClima ?? 0, pres: pres ?? null, mov: mov ?? 0, ocup, conf: conf ?? null, estado };
}

const TIPOS = ["TEMP_ALTA", "TEMP_BAJA", "HUM_ALTA", "FUERA_HORARIO"];

export function validarAlerta(a) {
  if (!a || typeof a !== "object") return false;
  if (typeof a.id !== "string" || !/^\d{8,12}-[A-Z_]+(-fin)?$/.test(a.id)) return false;
  if (!TIPOS.includes(a.tipo) || !["activa", "resuelta"].includes(a.estado)) return false;
  if (typeof a.mensaje !== "string" || a.mensaje.length > 200) return false;
  if (!num(a.ts, Date.now() / 1000 - 30 * 86400, Date.now() / 1000 + 300)) return false;
  return true;
}

export const limpiarAlerta = ({ id, tipo, estado, mensaje, valor, ts }) =>
  ({ id, tipo, estado, mensaje, valor: typeof valor === "number" ? valor : null, ts });

// ---------- Configuración remota del dispositivo
export const CONFIG_DEFECTO = {
  intervaloClimaSeg: 10,
  intervaloEnvioSeg: 60,
  sensorClimaActivo: true,
  sensorMovimientoActivo: true,
  umbralTempMax: 26,
  umbralTempMin: 16,
  umbralHumMax: 70,
  umbralOcupacion: 0.1,
  horaInicio: 8,
  horaFin: 22,
};

const REGLAS = {
  intervaloClimaSeg: (v) => num(v, 3, 3600),
  intervaloEnvioSeg: (v) => num(v, 10, 3600),
  sensorClimaActivo: (v) => typeof v === "boolean",
  sensorMovimientoActivo: (v) => typeof v === "boolean",
  umbralTempMax: (v) => num(v, -20, 60),
  umbralTempMin: (v) => num(v, -20, 60),
  umbralHumMax: (v) => num(v, 0, 100),
  umbralOcupacion: (v) => num(v, 0, 1),
  horaInicio: (v) => Number.isInteger(v) && v >= 0 && v <= 23,
  horaFin: (v) => Number.isInteger(v) && v >= 1 && v <= 24,
};

export function validarConfig(entrada) {
  const salida = {};
  for (const [k, v] of Object.entries(entrada || {})) {
    if (!REGLAS[k]) throw new HttpError(400, `Campo desconocido: ${k}`);
    if (!REGLAS[k](v)) throw new HttpError(400, `Valor inválido para ${k}`);
    salida[k] = v;
  }
  return salida;
}

/** Limita el resumen de salud a un tamaño razonable (es texto libre que viene del dispositivo). */
export function limpiarSalud(s) {
  if (!s || typeof s !== "object") return null;
  const texto = JSON.stringify(s);
  return texto.length <= 4000 ? JSON.parse(texto) : null;
}
