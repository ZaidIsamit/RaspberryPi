"use client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { fb } from "@/lib/firebaseClient";

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
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login tarjeta">
      <h2>Smart Campus IoT</h2>
      <p className="muted">Ingresa con tu cuenta de la organización.</p>
      <form onSubmit={entrar}>
        <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
        {error && <span className="error">{error}</span>}
        <button className="primario" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </div>
  );
}
