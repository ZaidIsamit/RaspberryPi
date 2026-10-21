"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/firebaseClient";
import { aLocal, descargarCsv, fechaHora } from "@/lib/formato";

const POR_PAGINA = 50;
const LIMITE_API = 2000; // el mismo tope que aplica queryReadings en la API

export default function Registros({ dispositivo }) {
  const [desde, setDesde] = useState(() => aLocal(new Date(Date.now() - 24 * 3600_000)));
  const [hasta, setHasta] = useState(() => aLocal(new Date()));
  const [filtro, setFiltro] = useState("todos");
  const [datos, setDatos] = useState(null);
  const [pagina, setPagina] = useState(0);
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
      const { lecturas } = await api(`/api/v1/readings?${qs}`);
      setDatos(lecturas.reverse()); // más reciente primero
      setPagina(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setDatos(null);
    consultar();
  }, [dispositivo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filas = useMemo(
    () => (datos || []).filter((d) => filtro === "todos" || (filtro === "ocupada" ? d.ocup : !d.ocup)),
    [datos, filtro]);
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const visibles = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  function exportar() {
    descargarCsv(`registros-${dispositivo.id}-${desde.slice(0, 10)}.csv`,
      ["fecha", "temp_c", "temp_min", "temp_max", "humedad_pct", "presencia_pct", "movimientos", "ocupada", "confort", "estado"],
      filas.map((d) => [fechaHora(d.ts), d.t, d.tMin, d.tMax, d.h, d.pres == null ? null : Math.round(d.pres * 100),
        d.mov ?? 0, d.ocup ? "sí" : "no", d.conf, d.estado]));
  }

  return (
    <>
      <div className="tarjeta filtros">
        <label>Desde<input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <label>Estado de la sala
          <select value={filtro} onChange={(e) => { setFiltro(e.target.value); setPagina(0); }}>
            <option value="todos">Todos</option>
            <option value="ocupada">Solo ocupada</option>
            <option value="libre">Solo libre</option>
          </select>
        </label>
        <button className="primario" onClick={consultar} disabled={cargando}>
          {cargando ? "Consultando…" : "Consultar"}
        </button>
        <button onClick={exportar} disabled={!filas.length}>Exportar CSV</button>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="tarjeta seccion sin-padding">
        <div className="tabla-cabecera">
          <h2>{datos ? `${filas.length} registros` : "Registros"}</h2>
          {datos && (
            <span className="muted">
              Consulta de {datos.length} documentos de Firestore{datos.length >= LIMITE_API && " (tope alcanzado: acorta el rango)"}
            </span>
          )}
        </div>
        {!datos ? (
          <div className="vacio">{cargando ? <>Cargando registros…</> : "Sin datos."}</div>
        ) : !filas.length ? (
          <div className="vacio">No hay registros en ese rango.</div>
        ) : (
          <>
            <div className="tabla-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha y hora</th><th className="num">Temp.</th><th className="num">Mín / máx</th>
                    <th className="num">Humedad</th><th className="num">Presencia</th><th className="num">Movim.</th>
                    <th>Sala</th><th className="num">Confort</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((d) => (
                    <tr key={d.id}>
                      <td>{fechaHora(d.ts)}</td>
                      <td className="num">{v(d.t, " °C")}</td>
                      <td className="num muted">{v(d.tMin)} / {v(d.tMax)}</td>
                      <td className="num">{v(d.h, " %")}</td>
                      <td className="num">{d.pres == null ? "—" : `${Math.round(d.pres * 100)} %`}</td>
                      <td className="num">{d.mov ?? 0}</td>
                      <td><span className={`estado ${d.ocup ? "accent" : "neutro"}`}>{d.ocup ? "Ocupada" : "Libre"}</span></td>
                      <td className="num">{v(d.conf)}</td>
                      <td className="muted">{d.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paginacion">
              <span className="muted">
                {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, filas.length)} de {filas.length}
              </span>
              <div className="fila">
                <button onClick={() => setPagina(pagina - 1)} disabled={pagina === 0}>Anterior</button>
                <span className="muted">Página {pagina + 1} de {paginas}</span>
                <button onClick={() => setPagina(pagina + 1)} disabled={pagina + 1 >= paginas}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}

const v = (x, u = "") => (x == null ? "—" : `${x}${u}`);
