# Informe de evaluación de uso y capacidad

> Completar las celdas **[MEDIR]** con las consolas de uso de Firebase (Firestore → Uso) y Vercel (Usage) durante 7 días continuos (21 → 28 de octubre). Los límites gratuitos deben verificarse y **citarse con enlace** a la documentación oficial vigente.

## 1. Escenario de uso
| Variable | Valor |
|---|---|
| Dispositivos | 1 Raspberry Pi 3 (Sala 101) |
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
| Lecturas: dashboard en vivo | 3 usuarios × 1 h × (60 iniciales + 60 lecturas + 60 updates del dispositivo) | ~540 | | |
| Lecturas: histórico 24 h | 3 usuarios × 2 × 1.440 | 8.640 | | |
| **Total lecturas** | | **≈ 13.500** | **≈ 405.000** | **27 % de 50.000** |
| Almacenamiento | 1.440 × 0,6 KB | ≈ 0,86 MB | ≈ 26 MB | 1 GiB se alcanza en ≈ 3,3 años |
| Invocaciones Vercel | 1.440 ingest + 2.880 config + ~20 web | ≈ 4.340 | ≈ 130.000 | comparar con el límite mensual del plan Hobby [citar] |

## 3. Medición real (7 días)
| Día | Escrituras (Firebase) | Lecturas (Firebase) | Almacenamiento | Invocaciones (Vercel) |
|---|---|---|---|---|
| 21-oct | [MEDIR] | [MEDIR] | [MEDIR] | [MEDIR] |
| 22-oct | | | | |
| 23-oct | | | | |
| 24-oct | | | | |
| 25-oct | | | | |
| 26-oct | | | | |
| 27-oct | | | | |
| **Promedio** | | | | |
| **Estimado** | 2.890 | 13.500 | 0,86 MB/día | 4.340 |
| **Diferencia %** | | | | |

Causas típicas de diferencias a explicar: minutos sin datos (Raspberry apagada), más/menos uso del dashboard que el supuesto, lecturas extra de la consola de Firebase (abrir Firestore en la consola **también cuenta lecturas**), recargas de página, reintentos tras cortes de red, tamaño real de índices.

## 4. Límites
- Escrituras: 20.000 / 2.890 ≈ **6 dispositivos** con el diseño actual.
- Lecturas: depende sobre todo del dashboard. Sin usuarios: 50.000 / 4.320 ≈ 11 dispositivos; el histórico de 24 h cuesta 1.440 lecturas → ≈ 34 consultas diarias por dispositivo agotan el límite.
- Almacenamiento: ≈ 3,3 años para 1 dispositivo; ≈ 4 meses con 10.
- **Primer cuello de botella:** escrituras diarias (por la actualización del dispositivo en cada lote), luego lecturas si se consulta mucho el histórico.

## 5. Optimizaciones (antes / después)
| # | Decisión | Antes | Después | Ahorro |
|---|---|---|---|---|
| 1 | Agregar por minuto en la Raspberry (servicio `procesamiento`) | 8.640 (clima) + 86.400 (PIR) ≈ 95.000 escrituras/día — imposible en Spark | 1.440 | ≈ 98 % |
| 2 | Alertas solo en cambio de estado (no cada minuto mientras dure) | hasta 1.440 × 4 tipos | ~10 | ≈ 99 % |
| 3 | `ultimaLectura` en el documento del dispositivo | tarjetas "ahora" consultando la colección | 1 lectura | |
| 4 | Lote cada 5 min y config cada 2 min (propuesta, configurable desde la web) | 2.880 escrituras + 4.320 lecturas de dispositivo | 1.728 escrituras + 1.008 lecturas | 40 % / 77 % → **11 dispositivos** dentro del límite de escrituras |
| 5 | Desactivar índices de campos no consultados | índice por cada campo | 5 campos menos indexados | menor almacenamiento [MEDIR] |

> Para la #4 midan 1-2 días con `intervaloEnvioSeg=60` y luego con `300` (y `CONFIG_POLL_SEG=120` en `.env`) y muestren la diferencia en la consola.

## 6. Proyección de crecimiento (fuera de la capa gratuita, Firestore plan Blaze)
Fórmula por mes: `costo = (escrituras − gratis)/100.000 × precio_escritura + (lecturas − gratis)/100.000 × precio_lectura + (GiB − 1) × precio_GiB`.
Usen los **precios oficiales vigentes** de la región elegida (https://firebase.google.com/pricing y https://cloud.google.com/firestore/pricing) y citen la fecha de consulta.

| Dispositivos | Escrituras/mes | Lecturas/mes (dispositivos) | Almacen. acumulado 1 año | Costo mensual estimado |
|---|---|---|---|---|
| 10 | 867.000 | 1.296.000 | ≈ 3,1 GB | [calcular] |
| 100 | 8.670.000 | 12.960.000 | ≈ 31 GB | [calcular] |
| 1.000 | 86.700.000 | 129.600.000 | ≈ 310 GB | [calcular] |

A 100+ dispositivos también deben revisar límites de invocaciones y ejecución de funciones de Vercel; con 1.000 dispositivos enviando cada 60 s son ≈ 43 millones de invocaciones/mes → conviene subir el intervalo de envío o pasar a un broker MQTT gestionado.

## 7. Costos de migración (escenario actual y 100 dispositivos)
| Alternativa | Componentes | Costo actual | Costo 100 disp. | Responsabilidades del grupo |
|---|---|---|---|---|
| **PaaS**: Vercel Pro + Firebase Blaze | igual que hoy, sin límites diarios | [calculadora] | [calculadora] | Solo código y reglas; el proveedor gestiona parches, respaldos (opcional), escalamiento |
| **PaaS**: Google App Engine / Azure App Service + Firestore | API como app gestionada | [calculadora] | [calculadora] | Código, configuración de escalado |
| **IaaS**: AWS EC2 / Azure VM / Compute Engine + PostgreSQL o MongoDB administrado por el grupo | 1 VM pequeña (API + BD) | [calculadora] | [calculadora] (VM mayor o 2 VMs) | Parches del SO, TLS, firewall, respaldos, monitoreo, escalamiento manual, alta disponibilidad |

Calculadoras: AWS https://calculator.aws · Azure https://azure.microsoft.com/pricing/calculator · Google Cloud https://cloud.google.com/products/calculator · Vercel https://vercel.com/pricing

**Conclusión a desarrollar:** para el escenario actual la PaaS gratuita es suficiente; a 100 dispositivos el costo de Firestore crece con las operaciones (el costo variable domina), mientras que la IaaS tiene costo fijo más bajo por volumen pero traslada al grupo la operación (horas-persona de mantención, seguridad y respaldos).
