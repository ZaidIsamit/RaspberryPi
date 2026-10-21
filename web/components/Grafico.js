"use client";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ejeTiempo, fechaHora } from "@/lib/formato";

/** datos: [{ ts(ms), t, h, pres }] */
export default function Grafico({ datos, conFecha = false }) {
  const fmt = (ms) => ejeTiempo(ms, conFecha);
  const filas = datos.map((d) => ({ ...d, presPct: d.pres == null ? null : Math.round(d.pres * 100) }));
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={filas} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="ts" tickFormatter={fmt} stroke="var(--muted)" fontSize={12} minTickGap={30} />
          <YAxis yAxisId="t" stroke="var(--muted)" fontSize={12} unit="°" domain={["auto", "auto"]} />
          <YAxis yAxisId="p" orientation="right" stroke="var(--muted)" fontSize={12} unit="%" domain={[0, 100]} />
          <Tooltip
            labelFormatter={fechaHora}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border-fuerte)", borderRadius: 3, fontSize: 13 }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />
          <Bar yAxisId="p" dataKey="presPct" name="Presencia %" fill="var(--serie-pres)" />
          <Line yAxisId="t" dataKey="t" name="Temp °C" stroke="var(--serie-temp)" dot={false} strokeWidth={2} connectNulls />
          <Line yAxisId="p" dataKey="h" name="Humedad %" stroke="var(--serie-hum)" dot={false} strokeWidth={1.5} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
