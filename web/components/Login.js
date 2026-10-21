"use client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { api, fb } from "@/lib/firebaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await signInWithEmailAndPassword(fb().auth, email, clave);
    } catch {
      setError("Correo o contraseña incorrectos");
      setCargando(false);
      return;
    }
    // Queda registrado en la auditoría de la organización (si falla, no impide entrar)
    await api("/api/v1/audit", { method: "POST", body: { accion: "LOGIN" } }).catch(() => {});
  }

  return (
    <div className="login-fondo">
      <div className="login tarjeta">
        <div className="login-marca">
          <div className="migas">Infraestructura TI</div>
          <h2>Smart Campus</h2>
          <p className="muted">Monitoreo ambiental y de ocupación de salas</p>
        </div>
        <form onSubmit={entrar}>
          <label>Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>Contraseña
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <span className="error">{error}</span>}
          <button className="primario ancho" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
        </form>
        <p className="login-pie muted">Ingresa con la cuenta asignada a tu organización.</p>
      </div>
    </div>
  );
}
