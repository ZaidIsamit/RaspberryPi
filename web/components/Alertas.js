"use client";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Icono from "@/components/Iconos";
import Kpi from "@/components/Kpi";
import { fb } from "@/lib/firebaseClient";
import { descargarCsv, fechaHora } from "@/lib/formato";

const LIMITE = 200; // una carga = hasta 200 lecturas de Firestore
export const TIPOS_ALERTA = {
  TEMP_ALTA: "Temperatura alta",
  TEMP_BAJA: "Temperatura baja",
  HUM_ALTA: "Humedad alta",
  FUERA_HORARIO: "Presencia fuera de horario",
};

export default function Alertas({ orgId, dispositivo }) {
  const [alertas, setAlertas] = useState(null);
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setError("");
    setCargando(true);
    try {
      const q = query(collection(fb().db, "orgs", orgId, "devices", dispositivo.id, "alertas"),
        orderBy("ts", "desc"), limit(LIMITE));
      const snap = await getDocs(q);
      setAlertas(snap.docs.map((d) => ({ id: d.id, ...d.data(), ts: d.data().ts?.toMillis?.() ?? null })));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setAlertas(null);
    cargar();
  }, [orgId, dispositivo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filas = useMemo(
    () => (alertas || []).filter((a) => (!tipo || a.tipo === tipo) && (!estado || a.estado === estado)),
    [alertas, tipo, estado]);
  const cuenta = (f) => (alertas || []).filter(f).length;
  const masFrecuente = Object.keys(TIPOS_ALERTA)
    .map((t) => [t, cuenta((a) => a.tipo === t && a.estado === "activa")])
    .sort((a, b) => b[1] - a[1])[0];

  function exportar() {
    descargarCsv(`alertas-${dispositivo.id}.csv`, ["fecha", "tipo", "estado", "mensaje", "valor"],
      filas.map((a) => [fechaHora(a.ts), TIPOS_ALERTA[a.tipo] || a.tipo, a.estado, a.mensaje, a.valor]));
  }

  return (
    <>
      <div className="kpis">
        <Kpi icono="alertas" titulo="Eventos cargados" valor={alertas ? alertas.length : "—"} sub={`Últimos ${LIMITE} como máximo`} />
        <Kpi icono="alertas" tono="warn" titulo="Alertas disparadas" valor={alertas ? cuenta((a) => a.estado === "activa") : "—"} />
        <Kpi icono="auditoria" tono="ok" titulo="Resueltas" valor={alertas ? cuenta((a) => a.estado === "resuelta") : "—"} />
        <Kpi icono="filtro" tono="info" titulo="Tipo más frecuente"
          valor={masFrecuente?.[1] ? TIPOS_ALERTA[masFrecuente[0]] : "—"} sub={masFrecuente?.[1] ? `${masFrecuente[1]} veces` : ""} />
      </div>

      <div className="tarjeta filtros seccion">
        <label>Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_ALERTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="activa">Activa (se disparó)</option>
            <option value="resuelta">Resuelta (volvió a la normalidad)</option>
          </select>
        </label>
        <button className="primario" onClick={cargar} disabled={cargando}><Icono nombre="recargar" size={16} />{cargando ? "Cargando…" : "Actualizar"}</button>
        <button onClick={exportar} disabled={!filas.length}><Icono nombre="descargar" size={16} />Exportar CSV</button>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="tarjeta seccion sin-padding">
        <div className="tabla-cabecera"><h2><Icono nombre="alertas" />{filas.length} eventos</h2></div>
        {!alertas ? (
          <div className="vacio">{cargando ? <><span className="spinner" /> Cargando alertas…</> : "Sin datos."}</div>
        ) : !filas.length ? (
          <div className="vacio">No hay alertas con esos filtros.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Estado</th><th>Mensaje</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {filas.map((a) => (
                  <tr key={a.id}>
                    <td>{fechaHora(a.ts)}</td>
                    <td>{TIPOS_ALERTA[a.tipo] || a.tipo}</td>
                    <td><span className={`pill ${a.estado === "activa" ? "warn" : "ok"}`}>{a.estado === "activa" ? "Activa" : "Resuelta"}</span></td>
                    <td className="ajustar">{a.mensaje}</td>
                    <td className="num">{a.valor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
