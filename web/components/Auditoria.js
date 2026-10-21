"use client";
import { useEffect, useMemo, useState } from "react";
import { CAMPOS } from "@/components/Dispositivos";
import Icono from "@/components/Iconos";
import Kpi from "@/components/Kpi";
import { api } from "@/lib/firebaseClient";
import { descargarCsv, fechaHora } from "@/lib/formato";

const ACCIONES = {
  LOGIN: { t: "Inicio de sesión", tono: "info", icono: "usuario" },
  LOGOUT: { t: "Cierre de sesión", tono: "neutro", icono: "salir" },
  DISPOSITIVO_CREADO: { t: "Dispositivo creado", tono: "ok", icono: "mas" },
  TOKEN_REGENERADO: { t: "Token regenerado", tono: "warn", icono: "llave" },
  CONFIG_CAMBIADA: { t: "Configuración cambiada", tono: "accent", icono: "dispositivos" },
};
const ETIQUETAS = Object.fromEntries(CAMPOS.map(([k, etiqueta]) => [k, etiqueta]));
const valor = (x) => (typeof x === "boolean" ? (x ? "Sí" : "No") : String(x));

/** Texto legible del detalle de una entrada (también se usa en el CSV). */
function describir(a) {
  if (a.detalle?.cambios)
    return Object.entries(a.detalle.cambios)
      .map(([k, c]) => `${ETIQUETAS[k] || k}: ${valor(c.antes)} → ${valor(c.despues)}`).join(" · ");
  if (a.detalle?.nombre) return `Nombre: ${a.detalle.nombre}`;
  if (a.accion === "TOKEN_REGENERADO") return "Token anterior revocado";
  return "";
}

export default function Auditoria() {
  const [entradas, setEntradas] = useState(null);
  const [accion, setAccion] = useState("");
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setError("");
    setCargando(true);
    try {
      setEntradas((await api("/api/v1/audit?limite=300")).entradas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return (entradas || []).filter((a) => (!accion || a.accion === accion) &&
      (!b || [a.email, a.deviceId, describir(a)].some((x) => x?.toLowerCase().includes(b))));
  }, [entradas, accion, buscar]);
  const cuenta = (f) => (entradas || []).filter(f).length;
  const hoy = new Date().setHours(0, 0, 0, 0);

  function exportar() {
    descargarCsv("auditoria.csv", ["fecha", "usuario", "rol", "ip", "accion", "dispositivo", "detalle"],
      filas.map((a) => [fechaHora(a.ts), a.email, a.rol, a.ip, ACCIONES[a.accion]?.t || a.accion, a.deviceId, describir(a)]));
  }

  return (
    <>
      <div className="kpis">
        <Kpi icono="auditoria" titulo="Eventos registrados" valor={entradas ? entradas.length : "—"} sub="Últimos 300 como máximo" />
        <Kpi icono="reloj" tono="info" titulo="Eventos hoy" valor={entradas ? cuenta((a) => a.ts >= hoy) : "—"} />
        <Kpi icono="dispositivos" tono="accent" titulo="Cambios de configuración" valor={entradas ? cuenta((a) => a.accion === "CONFIG_CAMBIADA") : "—"} />
        <Kpi icono="llave" tono="warn" titulo="Tokens regenerados" valor={entradas ? cuenta((a) => a.accion === "TOKEN_REGENERADO") : "—"} />
      </div>

      <div className="tarjeta filtros seccion">
        <label>Acción
          <select value={accion} onChange={(e) => setAccion(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([k, a]) => <option key={k} value={k}>{a.t}</option>)}
          </select>
        </label>
        <label className="crece">Buscar
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Usuario, dispositivo o detalle" />
        </label>
        <button className="primario" onClick={cargar} disabled={cargando}><Icono nombre="recargar" size={16} />{cargando ? "Cargando…" : "Actualizar"}</button>
        <button onClick={exportar} disabled={!filas.length}><Icono nombre="descargar" size={16} />Exportar CSV</button>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="tarjeta seccion sin-padding">
        <div className="tabla-cabecera">
          <h2><Icono nombre="auditoria" />{filas.length} eventos</h2>
          <span className="muted">Registro inalterable: se escribe solo desde la API y el navegador no puede modificarlo.</span>
        </div>
        {!entradas ? (
          <div className="vacio">{cargando ? <><span className="spinner" /> Cargando auditoría…</> : "Sin datos."}</div>
        ) : !filas.length ? (
          <div className="vacio">No hay eventos con esos filtros.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Dispositivo</th><th>Detalle</th><th>IP</th></tr></thead>
              <tbody>
                {filas.map((a) => {
                  const info = ACCIONES[a.accion] || { t: a.accion, tono: "neutro", icono: "auditoria" };
                  return (
                    <tr key={a.id}>
                      <td>{fechaHora(a.ts)}</td>
                      <td>
                        <div>{a.email || a.uid}</div>
                        <div className="muted">{a.rol === "admin" ? "Administrador" : "Consulta"}</div>
                      </td>
                      <td><span className={`pill ${info.tono}`}><Icono nombre={info.icono} size={13} />{info.t}</span></td>
                      <td>{a.deviceId || <span className="muted">—</span>}</td>
                      <td className="ajustar">{describir(a) || <span className="muted">—</span>}</td>
                      <td className="muted">{a.ip || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
