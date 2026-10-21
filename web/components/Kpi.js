/** Celda de la franja de indicadores. `tono` solo colorea el valor cuando hay que llamar la atención. */
export default function Kpi({ titulo, valor, unidad, sub, tono }) {
  return (
    <div className="kpi" style={tono ? { "--tono": `var(--${tono})` } : undefined}>
      <div className="kpi-titulo">{titulo}</div>
      <div className="kpi-valor">{valor}{unidad && <span className="kpi-unidad"> {unidad}</span>}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
