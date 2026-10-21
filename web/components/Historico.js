"use client";
import { useState } from "react";
import Grafico from "@/components/Grafico";
import Kpi from "@/components/Kpi";
import { api } from "@/lib/firebaseClient";
import { aLocal } from "@/lib/formato";

const RAPIDOS = [["Última hora", 1], ["24 horas", 24], ["7 días", 168]];

export default function Historico({ dispositivo }) {
  const ahora = new Date();
  const [desde, setDesde] = useState(aLocal(new Date(ahora.getTime() - 24 * 3600_000)));
  const [hasta, setHasta] = useState(aLocal(ahora));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function consultar(d = desde, h = hasta) {
    setError("");
    setCargando(true);
    try {
      const qs = new URLSearchParams({
        deviceId: dispositivo.id,
        desde: new Date(d).toISOString(),
        hasta: new Date(h).toISOString(),
      });
      setDatos((await api(`/api/v1/readings?${qs}`)).lecturas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  function rapido(horas) {
    const h = aLocal(new Date());
    const d = aLocal(new Date(Date.now() - horas * 3600_000));
    setDesde(d);
    setHasta(h);
    consultar(d, h);
  }

  const prom = (k) => {
    const v = (datos || []).map((d) => d[k]).filter((x) => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
  };
  const minOcupados = (datos || []).filter((d) => d.ocup).length;

  return (
    <>
      <div className="tarjeta filtros">
        <label>Desde<input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="primario" onClick={() => consultar()} disabled={cargando}>
          {cargando ? "Consultando…" : "Consultar"}
        </button>
        <div className="segmentos">
          {RAPIDOS.map(([t, h]) => <button key={h} onClick={() => rapido(h)} disabled={cargando}>{t}</button>)}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!datos && !error && (
        <div className="tarjeta vacio seccion">
          <p>Elige un rango y pulsa <b>Consultar</b>, o usa un atajo.</p>
        </div>
      )}
      {datos && (
        <>
          <div className="kpis seccion">
            <Kpi titulo="Minutos registrados" valor={datos.length} />
            <Kpi titulo="Temp. promedio" valor={prom("t")} unidad="°C" />
            <Kpi titulo="Humedad promedio" valor={prom("h")} unidad="%" />
            <Kpi titulo="Uso de la sala"
              valor={datos.length ? Math.round((100 * minOcupados) / datos.length) : 0} unidad="%" sub={`${minOcupados} min ocupada`} />
            <Kpi titulo="Confort promedio" valor={prom("conf")} unidad="/100" />
          </div>
          <section className="tarjeta seccion">
            <div className="tarjeta-titulo">
              <h2>Histórico</h2>
              <span className="muted">Esta consulta costó {datos.length} lecturas de Firestore</span>
            </div>
            {datos.length ? <Grafico datos={datos} conFecha /> : <div className="vacio">No hay datos en ese rango.</div>}
          </section>
        </>
      )}
    </>
  );
}
