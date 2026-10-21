// CAPA DE LÓGICA DE NEGOCIO: gestión de dispositivos e ingesta de datos.
import { createDevice, getDevice, listDevices, updateDevice } from "../data/devicesRepo";
import { queryReadings, writeBatch } from "../data/readingsRepo";
import { auditar } from "./audit";
import { generarToken } from "./auth";
import { HttpError } from "./http";
import {
  CONFIG_DEFECTO, limpiarAlerta, limpiarLectura, limpiarSalud, validarAlerta, validarConfig, validarLectura,
} from "./validation";

const MAX_LECTURAS = 400; // límite de 500 operaciones por batch de Firestore
const MAX_ALERTAS = 90;

export async function crearDispositivo(orgId, deviceId, nombre, actor) {
  if (await getDevice(orgId, deviceId)) throw new HttpError(409, "Ya existe un dispositivo con ese id");
  const { token, tokenHash } = generarToken(orgId, deviceId);
  await createDevice(orgId, deviceId, {
    nombre: String(nombre || deviceId).slice(0, 60),
    tokenHash,
    config: CONFIG_DEFECTO,
    ultimaConexion: null,
    ultimaLectura: null,
    salud: null,
  });
  await auditar(actor, "DISPOSITIVO_CREADO", { deviceId, detalle: { nombre: String(nombre || deviceId).slice(0, 60) } });
  return { id: deviceId, token }; // el token se muestra UNA vez; en la BD queda solo su hash
}

export async function regenerarToken(orgId, deviceId, actor) {
  if (!(await getDevice(orgId, deviceId))) throw new HttpError(404, "Dispositivo no encontrado");
  const { token, tokenHash } = generarToken(orgId, deviceId);
  await updateDevice(orgId, deviceId, { tokenHash }); // el token anterior queda revocado al instante
  await auditar(actor, "TOKEN_REGENERADO", { deviceId });
  return { id: deviceId, token };
}

export async function actualizarConfig(orgId, deviceId, cambios, actor) {
  const device = await getDevice(orgId, deviceId);
  if (!device) throw new HttpError(404, "Dispositivo no encontrado");
  const antes = { ...CONFIG_DEFECTO, ...device.config };
  const config = { ...antes, ...validarConfig(cambios) };
  if (config.umbralTempMin >= config.umbralTempMax) throw new HttpError(400, "Temp. mínima debe ser menor que la máxima");
  await updateDevice(orgId, deviceId, { config });
  // Solo se audita lo que realmente cambió, con su valor anterior y el nuevo
  const diff = Object.fromEntries(
    Object.keys(config).filter((k) => config[k] !== antes[k]).map((k) => [k, { antes: antes[k], despues: config[k] }]));
  if (Object.keys(diff).length) await auditar(actor, "CONFIG_CAMBIADA", { deviceId, detalle: { cambios: diff } });
  return config;
}

export const listar = (orgId) => listDevices(orgId);

export const configDeDispositivo = (device) => ({ ...CONFIG_DEFECTO, ...(device.config || {}) });

export async function ingerir(orgId, deviceId, cuerpo) {
  const lecturas = Array.isArray(cuerpo.lecturas) ? cuerpo.lecturas.slice(0, MAX_LECTURAS) : [];
  const alertas = Array.isArray(cuerpo.alertas) ? cuerpo.alertas.slice(0, MAX_ALERTAS) : [];

  const okL = [], okA = [], rechazados = [];
  for (const l of lecturas) (validarLectura(l) ? okL.push(limpiarLectura(l)) : rechazados.push(String(l?.id)));
  for (const a of alertas) (validarAlerta(a) ? okA.push(limpiarAlerta(a)) : rechazados.push(String(a?.id)));

  const update = { salud: limpiarSalud(cuerpo.salud) };
  const ultima = okL.reduce((m, l) => (!m || l.ts > m.ts ? l : m), null);
  if (ultima) update.ultimaLectura = ultima; // permite mostrar el "ahora" leyendo un solo documento

  await writeBatch(orgId, deviceId, okL, okA, update);
  return { aceptados: [...okL.map((l) => l.id), ...okA.map((a) => a.id)], rechazados };
}

export async function historico(orgId, deviceId, desde, hasta) {
  if (isNaN(desde) || isNaN(hasta) || desde >= hasta) throw new HttpError(400, "Rango de fechas inválido");
  if (hasta - desde > 31 * 86400_000) throw new HttpError(400, "El rango máximo es de 31 días");
  if (!(await getDevice(orgId, deviceId))) throw new HttpError(404, "Dispositivo no encontrado");
  return queryReadings(orgId, deviceId, desde, hasta);
}
