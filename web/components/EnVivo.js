"use client";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import Grafico from "@/components/Grafico";
import Icono from "@/components/Iconos";
import Kpi from "@/components/Kpi";
import { fb } from "@/lib/firebaseClient";
import { enLinea, ultimaConexionMs } from "@/lib/formato";

export default function EnVivo({ orgId, dispositivo }) {
  const [lecturas, setLecturas] = useState([]);
  const [alertas, setAlertas] = useState([]);

  // Tiempo real: últimos 60 minutos (60 lecturas al abrir, luego 1 lectura por minuto nuevo)
  useEffect(() => {
    const base = ["orgs", orgId, "devices", dispositivo.id];
    const q1 = query(collection(fb().db, ...base, "lecturas"), orderBy("ts", "desc"), limit(60));
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
        <Kpi icono="conexion" tono={online ? "ok" : "bad"} titulo="Conexión"
          valor={online ? "En línea" : "Desconectado"}
          sub={ultimaConexion ? `Último envío ${new Date(ultimaConexion).toLocaleTimeString("es-CL")}` : "Nunca"} />
        <Kpi icono="temperatura" tono={tempFuera ? "bad" : "warn"} titulo="Temperatura" valor={fmt(u?.t)} unidad="°C"
          sub={cfg.umbralTempMin != null ? `Rango ${cfg.umbralTempMin}–${cfg.umbralTempMax} °C` : ""} />
        <Kpi icono="humedad" tono="info" titulo="Humedad" valor={fmt(u?.h)} unidad="%"
          sub={cfg.umbralHumMax != null ? `Máx. ${cfg.umbralHumMax} %` : ""} />
        <Kpi icono="presencia" tono="accent" titulo="Estado de la sala" valor={u?.estado ?? "—"}
          sub={`Presencia ${u?.pres == null ? "—" : `${Math.round(u.pres * 100)} % del minuto`}`} />
        <Kpi icono="confort" tono="ok" titulo="Índice de confort" valor={u?.conf ?? "—"} unidad="/100" />
      </div>

      <section className="tarjeta seccion">
        <div className="tarjeta-titulo">
          <h2><Icono nombre="historico" />Última hora</h2>
          <span className="pill ok"><span className="punto pulso" />Tiempo real</span>
        </div>
        {lecturas.length ? <Grafico datos={lecturas} /> : <div className="vacio">Esperando datos del dispositivo…</div>}
      </section>

      <div className="grid-2 seccion">
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h2><Icono nombre="servidor" />Microservicios en la Raspberry Pi</h2></div>
          {salud?.servicios ? (
            <>
              <div className="tabla-wrap">
                <table>
                  <tbody>
                    {Object.entries(salud.servicios).map(([nombre, s]) => (
                      <tr key={nombre}>
                        <td><code>{nombre}</code></td>
                        <td><span className={`pill ${s.ok ? "ok" : "bad"}`}><span className="punto" />{s.ok ? "OK" : "Falla"}</span></td>
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
          <div className="tarjeta-titulo"><h2><Icono nombre="alertas" />Alertas recientes</h2></div>
          {alertas.length ? (
            <ul className="lista-alertas">
              {alertas.map((a) => (
                <li key={a.id}>
                  <span className={`pill ${a.estado === "activa" ? "warn" : "ok"}`}>{a.estado === "activa" ? "Activa" : "Resuelta"}</span>
                  <div>
                    <div>{a.mensaje}</div>
                    <div className="muted">{a.ts?.toDate?.().toLocaleString("es-CL")}</div>
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
