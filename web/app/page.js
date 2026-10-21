"use client";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import Dispositivos from "@/components/Dispositivos";
import EnVivo from "@/components/EnVivo";
import Historico from "@/components/Historico";
import Login from "@/components/Login";
import { fb } from "@/lib/firebaseClient";

export default function Home() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState("vivo");
  const [dispositivos, setDispositivos] = useState([]);
  const [sel, setSel] = useState("");

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

  if (sesion === undefined) return <p className="contenedor muted">Cargando…</p>;
  if (sesion === null) return <Login />;
  if (!sesion.orgId)
    return (
      <div className="contenedor">
        <p className="error">Tu usuario no tiene organización asignada. Pide al administrador que ejecute el seed.</p>
        <button onClick={() => signOut(fb().auth)}>Salir</button>
      </div>
    );

  const dispositivo = dispositivos.find((d) => d.id === sel);
  return (
    <>
      <header className="barra">
        <div>
          <h1>Smart Campus · Monitoreo de salas</h1>
          <span className="muted">
            Org: <b>{sesion.orgId}</b> · {sesion.email} · rol <b>{sesion.role}</b>
          </span>
        </div>
        <div className="fila">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {dispositivos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre || d.id}</option>
            ))}
          </select>
          <button onClick={() => signOut(fb().auth)}>Salir</button>
        </div>
      </header>
      <main className="contenedor">
        <nav className="tabs">
          {[["vivo", "En vivo"], ["historico", "Histórico"], ["dispositivos", "Dispositivos"]].map(([k, t]) => (
            <button key={k} className={tab === k ? "activo" : ""} onClick={() => setTab(k)}>{t}</button>
          ))}
        </nav>
        {!dispositivo && tab !== "dispositivos" && (
          <p className="muted">No hay dispositivos todavía. {sesion.role === "admin" ? "Créalo en la pestaña Dispositivos." : ""}</p>
        )}
        {dispositivo && tab === "vivo" && <EnVivo orgId={sesion.orgId} dispositivo={dispositivo} />}
        {dispositivo && tab === "historico" && <Historico dispositivo={dispositivo} />}
        {tab === "dispositivos" && <Dispositivos dispositivos={dispositivos} esAdmin={sesion.role === "admin"} />}
      </main>
    </>
  );
}
