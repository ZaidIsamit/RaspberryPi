"use client";
import { useState } from "react";
import Grafico from "@/components/Grafico";
import { api } from "@/lib/firebaseClient";

const aLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Historico({ dispositivo }) {
  const ahora = new Date();
  const [desde, setDesde] = useState(aLocal(new Date(ahora.getTime() - 24 * 3600_000)));
  const [hasta, setHasta] = useState(aLocal(ahora));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function consultar() {
    setError("");
    setCargando(true);
    try {
      const qs = new URLSearchParams({
        deviceId: dispositivo.id,
        desde: new Date(desde).toISOString(),
        hasta: new Date(hasta).toISOString(),
      });
      setDatos((await api(`/api/v1/readings?${qs}`)).lecturas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const prom = (k) => {
    const v = (datos || []).map((d) => d[k]).filter((x) => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
  };
  const minOcupados = (datos || []).filter((d) => d.ocup).length;

  return (
    <>
      <div className="tarjeta form">
        <label>Desde<input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="primario" onClick={consultar} disabled={cargando}>{cargando ? "Consultando…" : "Consultar"}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {datos && (
        <>
          <div className="grid seccion">
            <div className="tarjeta"><h3>Minutos registrados</h3><div className="valor">{datos.length}</div></div>
            <div className="tarjeta"><h3>Temp. promedio</h3><div className="valor">{prom("t")} °C</div></div>
            <div className="tarjeta"><h3>Humedad promedio</h3><div className="valor">{prom("h")} %</div></div>
            <div className="tarjeta"><h3>Uso de la sala</h3>
              <div className="valor">{datos.length ? Math.round((100 * minOcupados) / datos.length) : 0}%</div>
              <div className="muted">{minOcupados} min ocupada</div>
            </div>
            <div className="tarjeta"><h3>Confort promedio</h3><div className="valor">{prom("conf")}</div></div>
          </div>
          <section className="tarjeta seccion">
            <h3>Histórico</h3>
            {datos.length ? <Grafico datos={datos} conFecha /> : <p className="muted">No hay datos en ese rango.</p>}
            <p className="muted">Esta consulta costó {datos.length} lecturas de Firestore.</p>
          </section>
        </>
      )}
    </>
  );
}
