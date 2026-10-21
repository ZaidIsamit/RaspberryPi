import Icono from "@/components/Iconos";

/** Tarjeta de indicador: icono de color + título + valor grande + texto secundario. */
export default function Kpi({ icono, titulo, valor, unidad, sub, tono = "accent" }) {
  return (
    <div className="tarjeta kpi" style={{ "--tono": `var(--${tono})` }}>
      <div className="kpi-icono"><Icono nombre={icono} size={20} /></div>
      <div>
        <div className="kpi-titulo">{titulo}</div>
        <div className="kpi-valor">{valor}{unidad && <span className="kpi-unidad"> {unidad}</span>}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}
