"use client";
import { useState } from "react";
import { api } from "@/lib/firebaseClient";

const CAMPOS = [
  ["intervaloClimaSeg", "Intervalo lectura clima (s)", "number"],
  ["intervaloEnvioSeg", "Intervalo envío a la nube (s)", "number"],
  ["umbralTempMax", "Temp. máxima (°C)", "number"],
  ["umbralTempMin", "Temp. mínima (°C)", "number"],
  ["umbralHumMax", "Humedad máxima (%)", "number"],
  ["umbralOcupacion", "Umbral ocupación (0-1)", "number"],
  ["horaInicio", "Horario desde (h)", "number"],
  ["horaFin", "Horario hasta (h)", "number"],
  ["sensorClimaActivo", "Sensor clima activo", "checkbox"],
  ["sensorMovimientoActivo", "Sensor movimiento activo", "checkbox"],
];

export default function Dispositivos({ dispositivos, esAdmin }) {
  const [nuevoId, setNuevoId] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [token, setToken] = useState(null);
  const [error, setError] = useState("");

  async function crear(e) {
    e.preventDefault();
    setError("");
    try {
      setToken(await api("/api/v1/devices", { method: "POST", body: { id: nuevoId.trim(), nombre: nuevoNombre } }));
      setNuevoId("");
      setNuevoNombre("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function regenerar(id) {
    if (!confirm(`¿Revocar el token actual de ${id} y generar uno nuevo? La Raspberry dejará de enviar hasta actualizar su .env.`)) return;
    try {
      setToken(await api(`/api/v1/devices/${id}/token`, { method: "POST" }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      {token && (
        <div className="tarjeta seccion">
          <h3>Token de {token.id} (cópialo ahora: no se vuelve a mostrar)</h3>
          <div className="token">{token.token}</div>
          <p className="muted">Pégalo en <code>raspberry/.env</code> como <code>DEVICE_TOKEN=...</code> y ejecuta <code>docker compose up -d</code>.</p>
          <button onClick={() => setToken(null)}>Listo</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {esAdmin && (
        <form className="tarjeta form seccion" onSubmit={crear}>
          <label>Id (ej. sala-101)<input value={nuevoId} onChange={(e) => setNuevoId(e.target.value)} pattern="[a-z0-9-]{3,40}" required /></label>
          <label>Nombre<input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Sala 101" /></label>
          <button className="primario">Crear dispositivo</button>
        </form>
      )}

      {dispositivos.map((d) => (
        <TarjetaDispositivo key={d.id} d={d} esAdmin={esAdmin} onRegenerar={() => regenerar(d.id)} />
      ))}
    </>
  );
}

function TarjetaDispositivo({ d, esAdmin, onRegenerar }) {
  const [cfg, setCfg] = useState(d.config || {});
  const [msg, setMsg] = useState("");

  async function guardar(e) {
    e.preventDefault();
    setMsg("Guardando…");
    try {
      const body = {};
      for (const [k, , tipo] of CAMPOS) body[k] = tipo === "checkbox" ? !!cfg[k] : Number(cfg[k]);
      await api(`/api/v1/devices/${d.id}/config`, { method: "PUT", body });
      setMsg("Guardado. La Raspberry lo aplicará en ≤30 s sin reiniciarse.");
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <form className="tarjeta seccion" onSubmit={guardar}>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{d.nombre} <span className="muted">({d.id})</span></h3>
        {esAdmin && <button type="button" onClick={onRegenerar}>Regenerar / revocar token</button>}
      </div>
      <div className="form" style={{ marginTop: 10 }}>
        {CAMPOS.map(([k, etiqueta, tipo]) => (
          <label key={k}>
            {etiqueta}
            {tipo === "checkbox" ? (
              <input type="checkbox" checked={!!cfg[k]} disabled={!esAdmin}
                onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} />
            ) : (
              <input type="number" step="any" value={cfg[k] ?? ""} disabled={!esAdmin}
                onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
            )}
          </label>
        ))}
        {esAdmin && <button className="primario">Guardar configuración</button>}
      </div>
      {!esAdmin && <p className="muted">Rol de consulta: solo lectura.</p>}
      {msg && <p className="muted">{msg}</p>}
    </form>
  );
}
