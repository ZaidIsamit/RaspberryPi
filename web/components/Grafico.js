"use client";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/** datos: [{ ts(ms), t, h, pres }] */
export default function Grafico({ datos, conFecha = false }) {
  const fmt = (ms) =>
    new Date(ms).toLocaleString("es-CL", conFecha
      ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" });
  const filas = datos.map((d) => ({ ...d, presPct: d.pres == null ? null : Math.round(d.pres * 100) }));
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={filas} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="ts" tickFormatter={fmt} stroke="var(--muted)" fontSize={12} minTickGap={30} />
          <YAxis yAxisId="t" stroke="var(--muted)" fontSize={12} unit="°" domain={["auto", "auto"]} />
          <YAxis yAxisId="p" orientation="right" stroke="var(--muted)" fontSize={12} unit="%" domain={[0, 100]} />
          <Tooltip
            labelFormatter={fmt}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
          />
          <Legend />
          <Bar yAxisId="p" dataKey="presPct" name="Presencia %" fill="#8fb8de" opacity={0.6} />
          <Line yAxisId="t" dataKey="t" name="Temp °C" stroke="#e8590c" dot={false} strokeWidth={2} connectNulls />
          <Line yAxisId="p" dataKey="h" name="Humedad %" stroke="#1c7ed6" dot={false} strokeWidth={2} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
