"use client";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import Alertas from "@/components/Alertas";
import Auditoria from "@/components/Auditoria";
import Dispositivos from "@/components/Dispositivos";
import EnVivo from "@/components/EnVivo";
import Historico from "@/components/Historico";
import Icono from "@/components/Iconos";
import Login from "@/components/Login";
import Registros from "@/components/Registros";
import { api, fb } from "@/lib/firebaseClient";
import { enLinea } from "@/lib/formato";

// Menú lateral. `disp`: la sección trabaja sobre el dispositivo seleccionado. `admin`: solo rol admin.
const MENU = [
  { grupo: "Monitoreo", items: [
    { k: "vivo", t: "Panel en vivo", icono: "vivo", desc: "Datos en tiempo real de la sala", disp: true },
    { k: "historico", t: "Histórico", icono: "historico", desc: "Tendencias por rango de fechas", disp: true },
  ] },
  { grupo: "Registros", items: [
    { k: "registros", t: "Todos los registros", icono: "registros", desc: "Cada lectura por minuto guardada en Firestore", disp: true },
    { k: "alertas", t: "Alertas", icono: "alertas", desc: "Umbrales superados y eventos fuera de horario", disp: true },
    { k: "auditoria", t: "Auditoría", icono: "auditoria", desc: "Quién hizo qué y cuándo en la organización", admin: true },
  ] },
  { grupo: "Administración", items: [
    { k: "dispositivos", t: "Dispositivos", icono: "dispositivos", desc: "Alta, token y configuración remota" },
  ] },
];
const SECCIONES = MENU.flatMap((g) => g.items);

export default function Home() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [seccion, setSeccion] = useState("vivo");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dispositivos, setDispositivos] = useState([]);
  const [sel, setSel] = useState("");
  const [, forzar] = useState(0);

  useEffect(() => {
    const { auth } = fb();
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return setSesion(null);
      const { claims } = await u.getIdTokenResult(true);
      setSesion({ email: u.email, orgId: claims.orgId, role: claims.role });
    });
  }, []);

  // Lista de dispositivos de MI organización en tiempo real (las reglas bloquean las demás)
  useEffect(() => {
    if (!sesion?.orgId) return;
    return onSnapshot(collection(fb().db, "orgs", sesion.orgId, "devices"), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDispositivos(lista);
      setSel((s) => s || lista[0]?.id || "");
    });
  }, [sesion?.orgId]);

  // La sección queda en la URL (#registros) para que recargar no te devuelva al inicio
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (SECCIONES.some((s) => s.k === h)) setSeccion(h);
    const reloj = setInterval(() => forzar((n) => n + 1), 15000); // refresca el indicador "en línea"
    return () => clearInterval(reloj);
  }, []);

  function ir(k) {
    setSeccion(k);
    setMenuAbierto(false);
    window.history.replaceState(null, "", `#${k}`);
  }

  async function salir() {
    await api("/api/v1/audit", { method: "POST", body: { accion: "LOGOUT" } }).catch(() => {});
    await signOut(fb().auth);
  }

  if (sesion === undefined) return <div className="cargando"><span className="spinner" /> Cargando…</div>;
  if (sesion === null) return <Login />;
  if (!sesion.orgId)
    return (
      <div className="login-fondo">
        <div className="login tarjeta">
          <p className="error">Tu usuario no tiene organización asignada. Pide al administrador que ejecute el seed.</p>
          <button onClick={salir}><Icono nombre="salir" /> Salir</button>
        </div>
      </div>
    );

  const esAdmin = sesion.role === "admin";
  const actual = SECCIONES.find((s) => s.k === seccion && (!s.admin || esAdmin)) || SECCIONES[0];
  const dispositivo = dispositivos.find((d) => d.id === sel);
  const online = dispositivo && enLinea(dispositivo);

  return (
    <div className="app">
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}
      <aside className={`sidebar ${menuAbierto ? "abierto" : ""}`}>
        <div className="marca">
          <div className="marca-logo"><Icono nombre="antena" size={20} /></div>
          <div><b>Smart Campus</b><small>Monitoreo IoT de salas</small></div>
          <button className="btn-icono solo-movil" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú">
            <Icono nombre="cerrar" />
          </button>
        </div>

        <nav>
          {MENU.map((g) => (
            <div key={g.grupo}>
              <div className="nav-grupo">{g.grupo}</div>
              {g.items.filter((s) => !s.admin || esAdmin).map((s) => (
                <button key={s.k} className={`nav-item ${actual.k === s.k ? "activo" : ""}`} onClick={() => ir(s.k)}>
                  <Icono nombre={s.icono} />
                  <span>{s.t}</span>
                  {s.k === "dispositivos" && <span className="nav-contador">{dispositivos.length}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-pie">
          <div className="usuario">
            <div className="avatar">{sesion.email?.[0]?.toUpperCase()}</div>
            <div className="usuario-datos">
              <div className="usuario-email" title={sesion.email}>{sesion.email}</div>
              <div className="usuario-meta">
                {sesion.orgId} · <span className={`rol ${esAdmin ? "admin" : ""}`}>{esAdmin ? "Administrador" : "Consulta"}</span>
              </div>
            </div>
          </div>
          <button className="nav-item" onClick={salir}><Icono nombre="salir" /><span>Cerrar sesión</span></button>
        </div>
      </aside>

      <div className="principal">
        <header className="topbar">
          <button className="btn-icono btn-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
            <Icono nombre="menu" />
          </button>
          <div className="topbar-titulo">
            <h1>{actual.t}</h1>
            <p>{actual.desc}</p>
          </div>
          {actual.disp && dispositivos.length > 0 && (
            <div className="topbar-acciones">
              <span className={`pill ${online ? "ok" : "bad"}`}><span className="punto" />{online ? "En línea" : "Desconectado"}</span>
              <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Dispositivo">
                {dispositivos.map((d) => <option key={d.id} value={d.id}>{d.nombre || d.id}</option>)}
              </select>
            </div>
          )}
        </header>

        <main className="contenido">
          {actual.disp && !dispositivo ? (
            <div className="tarjeta vacio">
              <Icono nombre="dispositivos" size={32} />
              <p>No hay dispositivos todavía.</p>
              {esAdmin && <button className="primario" onClick={() => ir("dispositivos")}>Crear un dispositivo</button>}
            </div>
          ) : (
            <>
              {actual.k === "vivo" && <EnVivo orgId={sesion.orgId} dispositivo={dispositivo} />}
              {actual.k === "historico" && <Historico dispositivo={dispositivo} />}
              {actual.k === "registros" && <Registros dispositivo={dispositivo} />}
              {actual.k === "alertas" && <Alertas orgId={sesion.orgId} dispositivo={dispositivo} />}
              {actual.k === "auditoria" && <Auditoria />}
              {actual.k === "dispositivos" && <Dispositivos dispositivos={dispositivos} esAdmin={esAdmin} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
