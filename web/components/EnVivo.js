"use client";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import Grafico from "@/components/Grafico";
import { fb } from "@/lib/firebaseClient";

export default function EnVivo({ orgId, dispositivo }) {
  const [lecturas, setLecturas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [, forzar] = useState(0);

  // Tiempo real: últimos 60 minutos (60 lecturas al abrir, luego 1 lectura por minuto nuevo)
  useEffect(() => {
    const base = ["orgs", orgId, "devices", dispositivo.id];
    const q1 = query(collection(fb().db, ...base, "lecturas"), orderBy("ts", "desc"), limit(60));
    const q2 = query(collection(fb().db, ...base, "alertas"), orderBy("ts", "desc"), limit(15));
    const u1 = onSnapshot(q1, (s) =>
      setLecturas(s.docs.map((d) => ({ id: d.id, ...d.data(), ts: d.data().ts.toMillis() })).reverse()));
    const u2 = onSnapshot(q2, (s) => setAlertas(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const reloj = setInterval(() => forzar((n) => n + 1), 15000); // refresca el estado "en línea"
    return () => { u1(); u2(); clearInterval(reloj); };
  }, [orgId, dispositivo.id]);

  const u = dispositivo.ultimaLectura;
  const ultimaConexion = dispositivo.ultimaConexion?.toMillis?.() ?? null;
  const envio = dispositivo.config?.intervaloEnvioSeg ?? 60;
  const enLinea = ultimaConexion && Date.now() - ultimaConexion < (envio * 3 + 60) * 1000;
  const salud = dispositivo.salud;

  return (
    <>
      <div className="grid">
        <Tarjeta titulo="Conexión">
          <span className={`pill ${enLinea ? "ok" : "bad"}`}>{enLinea ? "En línea" : "Desconectado"}</span>
          <div className="muted">{ultimaConexion ? `Último envío ${new Date(ultimaConexion).toLocaleTimeString("es-CL")}` : "Nunca"}</div>
        </Tarjeta>
        <Tarjeta titulo="Temperatura"><div className="valor">{fmt(u?.t, "°C")}</div></Tarjeta>
        <Tarjeta titulo="Humedad"><div className="valor">{fmt(u?.h, "%")}</div></Tarjeta>
        <Tarjeta titulo="Estado de la sala">
          <div style={{ fontWeight: 700, fontSize: 18 }}>{u?.estado ?? "—"}</div>
          <div className="muted">Presencia {u?.pres == null ? "—" : `${Math.round(u.pres * 100)}% del minuto`}</div>
        </Tarjeta>
        <Tarjeta titulo="Índice de confort">
          <div className="valor">{u?.conf ?? "—"}<span className="muted"> /100</span></div>
        </Tarjeta>
      </div>

      <section className="seccion tarjeta">
        <h3>Última hora (se actualiza solo)</h3>
        {lecturas.length ? <Grafico datos={lecturas} /> : <p className="muted">Esperando datos del dispositivo…</p>}
      </section>

      <div className="grid seccion" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="tarjeta">
          <h3>Microservicios en la Raspberry Pi</h3>
          {salud?.servicios ? (
            <>
              <table>
                <tbody>
                  {Object.entries(salud.servicios).map(([nombre, s]) => (
                    <tr key={nombre}>
                      <td>{nombre}</td>
                      <td><span className={`pill ${s.ok ? "ok" : "bad"}`}>{s.ok ? "OK" : "Falla"}</span></td>
                      <td className="muted">{s.error || (s.pendientes != null ? `${s.pendientes} en buffer` : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                CPU {salud.cpu}% · RAM {salud.ram}% · Placa {salud.tempPlaca ?? "—"} °C · Buffer {salud.pendientesBuffer ?? 0}
              </p>
            </>
          ) : <p className="muted">Sin reporte de salud aún.</p>}
        </section>
        <section className="tarjeta">
          <h3>Alertas recientes</h3>
          {alertas.length ? (
            <table>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`pill ${a.estado === "activa" ? "warn" : "ok"}`}>{a.estado}</span></td>
                    <td>{a.mensaje}</td>
                    <td className="muted">{a.ts?.toDate?.().toLocaleString("es-CL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Sin alertas.</p>}
        </section>
      </div>
    </>
  );
}

const fmt = (v, u) => (v == null ? "—" : `${v} ${u}`);
const Tarjeta = ({ titulo, children }) => (
  <div className="tarjeta"><h3>{titulo}</h3>{children}</div>
);
