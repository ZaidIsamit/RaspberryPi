"use client";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import Grafico from "@/components/Grafico";
import Kpi from "@/components/Kpi";
import { fb } from "@/lib/firebaseClient";
import { enLinea, fechaHora, hora, ultimaConexionMs } from "@/lib/formato";

// El panel solo muestra lo más reciente; para más datos están Histórico y Todos los registros.
const MAX_REGISTROS = 20;

export default function EnVivo({ orgId, dispositivo, onIr }) {
  const [lecturas, setLecturas] = useState([]);
  const [alertas, setAlertas] = useState([]);

  // Tiempo real: últimos 20 minutos (20 lecturas al abrir, luego 1 lectura por minuto nuevo)
  useEffect(() => {
    const base = ["orgs", orgId, "devices", dispositivo.id];
    const q1 = query(collection(fb().db, ...base, "lecturas"), orderBy("ts", "desc"), limit(MAX_REGISTROS));
    const q2 = query(collection(fb().db, ...base, "alertas"), orderBy("ts", "desc"), limit(8));
    const u1 = onSnapshot(q1, (s) =>
      setLecturas(s.docs.map((d) => ({ id: d.id, ...d.data(), ts: d.data().ts.toMillis() })).reverse()));
    const u2 = onSnapshot(q2, (s) => setAlertas(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, [orgId, dispositivo.id]);

  const u = dispositivo.ultimaLectura;
  const ultimaConexion = ultimaConexionMs(dispositivo);
  const online = enLinea(dispositivo);
  const salud = dispositivo.salud;
  const cfg = dispositivo.config || {};
  const tempFuera = u?.t != null && (u.t > cfg.umbralTempMax || u.t < cfg.umbralTempMin);

  return (
    <>
      <div className="kpis">
        <Kpi titulo="Conexión" tono={online ? "ok" : "bad"}
          valor={online ? "En línea" : "Desconectado"}
          sub={ultimaConexion ? `Último envío ${hora(ultimaConexion)}` : "Nunca"} />
        <Kpi titulo="Temperatura" tono={tempFuera ? "bad" : undefined} valor={fmt(u?.t)} unidad="°C"
          sub={cfg.umbralTempMin != null ? `Rango ${cfg.umbralTempMin}–${cfg.umbralTempMax} °C` : ""} />
        <Kpi titulo="Humedad" valor={fmt(u?.h)} unidad="%"
          sub={cfg.umbralHumMax != null ? `Máx. ${cfg.umbralHumMax} %` : ""} />
        <Kpi titulo="Estado de la sala" valor={u?.estado ?? "—"}
          sub={`Presencia ${u?.pres == null ? "—" : `${Math.round(u.pres * 100)} % del minuto`}`} />
        <Kpi titulo="Índice de confort" valor={u?.conf ?? "—"} unidad="/100" />
      </div>

      <section className="tarjeta seccion">
        <div className="tarjeta-titulo">
          <h2>Últimos {MAX_REGISTROS} registros</h2>
          <span className="muted">Se actualiza en tiempo real · 1 registro por minuto</span>
        </div>
        {lecturas.length ? <Grafico datos={lecturas} /> : <div className="vacio">Esperando datos del dispositivo…</div>}
        <div className="fila" style={{ marginTop: 12 }}>
          <span className="muted">¿Necesitas más datos?</span>
          <button type="button" onClick={() => onIr("historico")}>Ver histórico</button>
          <button type="button" onClick={() => onIr("registros")}>Ver todos los registros</button>
        </div>
      </section>

      <div className="grid-2 seccion">
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h2>Microservicios en la Raspberry Pi</h2></div>
          {salud?.servicios ? (
            <>
              <div className="tabla-wrap">
                <table>
                  <tbody>
                    {Object.entries(salud.servicios).map(([nombre, s]) => (
                      <tr key={nombre}>
                        <td><code>{nombre}</code></td>
                        <td><span className={`estado ${s.ok ? "ok" : "bad"}`}>{s.ok ? "OK" : "Falla"}</span></td>
                        <td className="muted">{s.error || (s.pendientes != null ? `${s.pendientes} en buffer` : "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="metricas">
                <Metrica t="CPU" v={salud.cpu} u="%" />
                <Metrica t="RAM" v={salud.ram} u="%" />
                <Metrica t="Placa" v={salud.tempPlaca} u="°C" />
                <Metrica t="Buffer" v={salud.pendientesBuffer ?? 0} u="lotes" />
              </div>
            </>
          ) : <div className="vacio">Sin reporte de salud aún.</div>}
        </section>
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h2>Alertas recientes</h2></div>
          {alertas.length ? (
            <ul className="lista-alertas">
              {alertas.map((a) => (
                <li key={a.id}>
                  <span className={`estado ${a.estado === "activa" ? "warn" : "ok"}`}>{a.estado === "activa" ? "Activa" : "Resuelta"}</span>
                  <div>
                    <div>{a.mensaje}</div>
                    <div className="muted">{fechaHora(a.ts)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="vacio">Sin alertas.</div>}
        </section>
      </div>
    </>
  );
}

const fmt = (v) => (v == null ? "—" : v);
const Metrica = ({ t, v, u }) => (
  <div className="metrica"><span className="muted">{t}</span><b>{v ?? "—"}</b><span className="muted">{u}</span></div>
);
