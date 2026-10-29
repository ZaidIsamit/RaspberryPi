# Informe de evaluación de uso y capacidad

## 1. Escenario de uso
| Variable | Valor |
|---|---|
| Dispositivos | 1 Raspberry Pi 4 Model B (Sala 101) |
| Operación | **Continua, 24 h × 7 días** (sin horario de apagado): 1.440 minutos/día, 10.080 minutos/semana |
| Sensores | DHT (temp./humedad) cada 10 s · PIR muestreado 10 veces/s, resumido 1/s |
| Agregación | 1 documento por minuto en el dispositivo |
| Envío a la nube | 1 lote cada 60 s (configurable) |
| Consulta de configuración | cada 30 s |
| Tamaño por documento de lectura | ≈ 0,3 KB de datos (+ índices ≈ 0,6 KB total estimado) |
| Usuarios del dashboard | 3 (≈ 1 h/día de panel abierto cada uno + 2 consultas de histórico de 24 h al día) |

## 2. Estimación diaria y mensual (diseño actual)

| Recurso | Cálculo | Por día | Por mes (30 d) | % límite diario Spark |
|---|---|---|---|---|
| Escrituras: lecturas | 1 por minuto | 1.440 | 43.200 | |
| Escrituras: actualización del dispositivo | 1 por lote (60 s) | 1.440 | 43.200 | |
| Escrituras: alertas | solo cambios de estado | ~10 | ~300 | |
| **Total escrituras** | | **≈ 2.890** | **≈ 86.700** | **14,5 % de 20.000** |
| Lecturas: autenticación de ingest | 1 por lote | 1.440 | | |
| Lecturas: consulta de config | 1 cada 30 s | 2.880 | | |
| Lecturas: dashboard en vivo | 3 usuarios × 1 h × (20 iniciales + 60 lecturas + 60 updates del dispositivo) | ~420 | | |
| Lecturas: histórico 24 h | 3 usuarios × 2 × 1.440 | 8.640 | | |
| **Total lecturas** | | **≈ 13.400** | **≈ 401.000** | **27 % de 50.000** |
| Almacenamiento | 1.440 × 0,6 KB | ≈ 0,86 MB | ≈ 26 MB | 1 GiB se alcanza en ≈ 3,3 años |
| Invocaciones Vercel | 1.440 ingest + 2.880 config + ~20 web | ≈ 4.340 | ≈ 130.000 | 13 % de 1.000.000/mes del plan Hobby ([fuente](https://vercel.com/docs/limits/fair-use-guidelines)) |

## 3. Medición real (21 al 28 de octubre de 2026)
Valores de la consola de uso de Firebase (contador del día al momento de cada captura) y del panel Usage de Vercel (acumulado). Capturas en `Evidencias/`.

| Día | Escrituras | Lecturas | Invocaciones Vercel |
|---|---|---|---|
| 21-oct (parcial, desde 12:40) | 134 | 1.100 | 257 acumuladas |
| 22-oct | 1.100 | 4.100 | 3.600 acumuladas |
| 23-oct | 1.400 | 2.100 | — |
| 24-oct | 650 | 967 | — |
| 25-oct | 653 | 974 | — |
| 26-oct | 1.700 | 2.500 | 19.000 acumuladas |
| 27-oct | 1.800 | 2.700 | 27.000 acumuladas |
| **Promedio (22 al 27-oct)** | **1.217** | **2.224** | **3.857 por día** |
| **Estimado** | 2.890 | 13.400 | 4.340 |
| **Diferencia** | −58 % | −83 % | −11 % |

Las escrituras y lecturas fueron menores porque la Raspberry Pi no estuvo encendida las 24 horas todos los días y porque el histórico se consultó menos de lo supuesto. El día de mayor actividad alcanzó 2.900 escrituras, prácticamente lo estimado para un día completo (2.890). Vercel quedó a un 11 % de lo estimado.

## 4. Límites
Fuentes (consultadas el 21-oct-2026): [cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas) (1 GiB, 50.000 lecturas, 20.000 escrituras y 20.000 eliminaciones por día; al superarlas en Spark las operaciones se rechazan hasta el reinicio diario, sin cobro) y [uso justo de Vercel](https://vercel.com/docs/limits/fair-use-guidelines) (Hobby: 1.000.000 invocaciones, 4 h de CPU activa y 100 GB de transferencia al mes; solo uso personal no comercial).

- Escrituras: 20.000 / 2.890 ≈ **6 dispositivos** con el diseño actual.
- Lecturas: con el dashboard actual (9.060 lecturas fijas al día), (50.000 − 9.060) / 4.320 ≈ **9 dispositivos**. Sin usuarios: 50.000 / 4.320 ≈ 11; el histórico de 24 h cuesta 1.440 lecturas → ≈ 34 consultas diarias por dispositivo agotan el límite.
- Invocaciones de Vercel Hobby: 1.000.000 / 129.600 ≈ **7 dispositivos**.
- Almacenamiento: ≈ 3,3 años para 1 dispositivo; ≈ 4 meses con 10.
- **Primer cuello de botella:** escrituras diarias (por la actualización del dispositivo en cada lote), luego lecturas si se consulta mucho el histórico.

## 5. Optimizaciones (antes / después)
| # | Decisión | Antes | Después | Ahorro |
|---|---|---|---|---|
| 1 | Agregar por minuto en la Raspberry (servicio `procesamiento`) | 8.640 (clima) + 86.400 (PIR) ≈ 95.000 escrituras/día — imposible en Spark | 1.440 | ≈ 98 % |
| 2 | Alertas solo en cambio de estado (no cada minuto mientras dure) | hasta 1.440 × 4 tipos | ~10 | ≈ 99 % |
| 3 | `ultimaLectura` en el documento del dispositivo | tarjetas "ahora" consultando la colección | 1 lectura | |
| 4 | Lote cada 5 min y config cada 2 min (propuesta, configurable desde la web) | 2.880 escrituras + 4.320 lecturas de dispositivo | 1.728 escrituras + 1.008 lecturas | 40 % / 77 % → **11 dispositivos** dentro del límite de escrituras |
| 5 | Desactivar índices de campos no consultados (desplegado el 21-oct-2026) | índice por cada campo | 5 campos menos indexados | no cuantificado en el periodo |

> Para la #4 midan 1-2 días con `intervaloEnvioSeg=60` y luego con `300` (y `CONFIG_POLL_SEG=120` en `.env`) y muestren la diferencia en la consola.

## 6. Proyección de crecimiento (fuera de la capa gratuita, Firestore plan Blaze)
Fórmula por mes: `costo = (escrituras − gratis)/100.000 × precio_escritura + (lecturas − gratis)/100.000 × precio_lectura + (GiB − 1) × precio_GiB`.
Precios oficiales de la región de la base de datos, **Santiago (`southamerica-west1`)**, consultados el 21-oct-2026 en [cloud.google.com/firestore/pricing](https://cloud.google.com/firestore/pricing): USD 0,043 por 100.000 lecturas, USD 0,129 por 100.000 escrituras y USD 0,215 por GiB/mes. Vercel Pro ([vercel.com/pricing](https://vercel.com/pricing)): USD 20/mes por integrante con USD 20 de crédito de uso, y USD 0,60 por millón de invocaciones. La cuota gratuita diaria de Firestore se mantiene en Blaze. Se suman a las lecturas de dispositivos las 9.060 diarias del dashboard (3 usuarios).

| Dispositivos | Escrituras/mes | Lecturas/mes | Almacen. acumulado 1 año | Firestore USD/mes | Vercel USD/mes | Total USD/mes |
|---|---|---|---|---|---|---|
| 10 | 867.000 | 1.567.800 | ≈ 3,1 GB | 0,83 | 20,00 | 20,83 |
| 100 | 8.670.000 | 13.231.800 | ≈ 31,4 GB | 21,99 | 20,00 | 41,99 |
| 1.000 | 86.700.000 | 129.871.800 | ≈ 313,9 GB | 233,54 | 77,76 | 311,30 |

Sin incluir CPU activa ni memoria de Vercel (en 7 días se usaron 9 min 19 s de CPU activa, de 4 h incluidas). Con 1.000 dispositivos las escrituras son el 48 % del costo de Firestore.

A 100+ dispositivos también deben revisar límites de invocaciones y ejecución de funciones de Vercel; con 1.000 dispositivos enviando cada 60 s son ≈ 43 millones de invocaciones/mes → conviene subir el intervalo de envío o pasar a un broker MQTT gestionado.

## 7. Costos de migración (escenario actual y 100 dispositivos)
| Alternativa | Componentes | Costo actual | Costo 100 disp. | Responsabilidades del grupo |
|---|---|---|---|---|
| **PaaS**: Vercel Pro + Firebase Blaze | igual que hoy, sin límites diarios | USD 20,00 | USD 41,99 (Vercel 20,00 + Firestore 21,99) | Solo código y reglas; el proveedor gestiona parches, respaldos (opcional), escalamiento |
| **PaaS**: Azure App Service Linux + Firestore | web y API como app gestionada | USD 12,41 (B1: USD 0,017/h) | USD 46,81 (B2: USD 0,034/h = 24,82 + Firestore 21,99) | Código, configuración de escalado |
| **IaaS**: AWS EC2 + PostgreSQL administrado por el grupo | 1 VM (API + web + BD), disco gp3, snapshots | USD 16,16 (t4g.small USD 0,0168/h = 12,26 + 30 GB × 0,08 + snapshots 30 GB × 0,05) | USD 32,33 (t4g.medium USD 0,0336/h = 24,53 + 60 GB × 0,08 + snapshots 60 GB × 0,05) | Parches del SO, TLS, firewall, respaldos, monitoreo, escalamiento manual, alta disponibilidad |

Supuestos: 730 h/mes, pago por uso sin descuentos; Azure East US ([API de precios minoristas](https://prices.azure.com/api/retail/prices)); AWS US East N. Virginia ([EC2](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS](https://aws.amazon.com/ebs/pricing/)); precios consultados el 21-oct-2026. Agregar al informe capturas de las calculadoras con estas configuraciones.

Calculadoras: AWS https://calculator.aws · Azure https://azure.microsoft.com/pricing/calculator · Google Cloud https://cloud.google.com/products/calculator · Vercel https://vercel.com/pricing

**Conclusión:** para el escenario actual la PaaS gratuita es suficiente. Con 100 dispositivos la IaaS es ≈ USD 10/mes más barata que la PaaS A, pero traslada al grupo la operación completa (parches, respaldos, seguridad, escalamiento); la PaaS con Vercel Pro y Firebase Blaze es la recomendada porque no cambia el código y el costo crece solo con el uso.
