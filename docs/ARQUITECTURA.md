# Documento técnico — Smart Campus IoT

## 1. Descripción del sistema
Problema: saber, por sala, **si está ocupada y en qué condiciones** para gestionar climatización, ventilación y uso fuera de horario. La Raspberry Pi combina presencia (PIR) y clima (DHT) en información útil por minuto:

- **Ocupación**: % del minuto con presencia + número de detecciones → `ocup` (sí/no).
- **Índice de confort (0-100)**: 100 dentro de 20-24 °C y 40-60 % HR; resta 12 pts por °C y 1,5 pts por punto de humedad fuera de rango.
- **Estado combinado**: `Vacía`, `Ocupada - confortable`, `Ocupada - calurosa`, `Ocupada - fría`, `Ocupada - húmeda (ventilar)`.
- **Alertas**: temperatura alta/baja, humedad alta y **presencia fuera de horario** (combina PIR + reloj).

## 2. Diagrama de arquitectura

```mermaid
flowchart LR
  subgraph RPI["Raspberry Pi 3 · Docker Compose"]
    DHT["DHT (GPIO17)"] -->|driver kernel IIO| SC[sensor-clima]
    PIR["PIR (GPIO18)"] -->|/dev/gpiochip0| SM[sensor-movimiento]
    SC -->|sensores/clima| MQ[(Mosquitto)]
    SM -->|sensores/movimiento| MQ
    MQ --> PR[procesamiento]
    PR -->|procesado/minuto · alertas/nueva| MQ
    MQ --> SY[sincronizacion]
    SY --- DB[(SQLite buffer)]
    SY -->|config/dispositivo retenido| MQ
    MQ -->|salud/*| SA[salud :8080]
    SA -->|salud/resumen| MQ
  end
  SY -- "HTTPS saliente\nBearer token dispositivo" --> API
  subgraph VERCEL["Vercel (Next.js)"]
    API["API REST /api/v1\n(lógica de negocio)"]
    WEB["Dashboard\n(presentación)"]
  end
  API -- "Admin SDK\n(credenciales solo en Vercel)" --> FS[(Cloud Firestore)]
  WEB -- "onSnapshot tiempo real\n(Security Rules por org)" --> FS
  WEB -- "ID token Firebase Auth" --> API
  U((Usuarios admin / consulta)) --> WEB
```

## 3. Microservicios (responsabilidad única)

| Servicio | Responsabilidad | Entrada | Salida |
|---|---|---|---|
| `mosquitto` | Broker: desacopla productores y consumidores | — | — |
| `sensor-clima` | Leer DHT (driver del kernel), reintentar lecturas fallidas | GPIO17, `config/dispositivo` | `sensores/clima` (cada N s) |
| `sensor-movimiento` | Muestrear el PIR 10 veces/s y resumir cada segundo | GPIO18, `config/dispositivo` | `sensores/movimiento` (1/s) |
| `procesamiento` | Validar, filtrar, agregar por minuto, combinar sensores, detectar umbrales | `sensores/*`, `config/dispositivo` | `procesado/minuto`, `alertas/nueva` |
| `sincronizacion` | Buffer SQLite, envío por lotes HTTPS, obtener configuración | `procesado/minuto`, `alertas/nueva`, `salud/resumen` | API Vercel, `config/dispositivo` |
| `salud` | Estado de servicios (latidos), CPU, RAM, temp. placa | `salud/*` | `GET :8080/health`, `salud/resumen` |

**Por qué esta división:** cada sensor puede fallar o cambiar de modelo sin tocar el resto; la lógica (umbrales, confort) se prueba sin hardware; la red puede caerse sin perder datos (solo `sincronizacion` conoce Internet). Nadie lee archivos ni bases de otro servicio: todo pasa por MQTT.

**Requisitos de contenedores:** `restart: unless-stopped`, `healthcheck` en todos, Docker habilitado en systemd (arranque automático), imágenes `python:3.11-slim` multi-arquitectura (ARM64), `sensor-movimiento` compilado en etapa separada para no dejar gcc en la imagen, acceso al GPIO por mapeo de dispositivo (`/dev/gpiochip0`) y el DHT por el driver del kernel (`dtoverlay=dht11`) → **ningún contenedor privilegiado**. Secretos en `.env` (fuera del repositorio).

**Resiliencia sin duplicados:** cada resumen tiene id = minuto epoch (ej. `29857331`). SQLite usa `INSERT OR IGNORE` sobre ese id; solo se borra lo que la API confirmó; la API escribe con `set()` sobre el mismo id → reenviar un lote sobrescribe, no duplica.

## 4. Modelo de datos (Cloud Firestore)

```
orgs/{orgId}                                   { nombre }
  devices/{deviceId}                           { nombre, tokenHash, config{...}, ultimaConexion,
                                                 ultimaLectura{...}, salud{...}, creado }
    lecturas/{minutoEpoch}                     { ts, t, tMin, tMax, h, nClima, pres, mov, ocup, conf, estado }
    alertas/{minutoEpoch-TIPO[-fin]}           { ts, tipo, estado, mensaje, valor }
```

| Decisión | Justificación (consultas / volumen) |
|---|---|
| Subcolecciones bajo `orgs/{orgId}` | Las Security Rules aíslan con una sola condición por ruta; no hace falta filtrar por `orgId` en cada consulta. |
| 1 documento **por minuto** (no por lectura) | 1.440 escrituras/día por dispositivo en vez de ~95.000 (8.640 de clima + 86.400 de PIR). |
| id = minuto epoch | Idempotencia (sin duplicados) y orden natural. |
| `ultimaLectura` copiada en el documento del dispositivo | Las tarjetas "ahora" del dashboard leen **1 documento**, no consultan la colección. |
| Nombres de campo cortos (`t`, `h`, `pres`) | Menor tamaño por documento (≈ 0,3 KB). |
| `config` dentro del dispositivo | La API autentica y entrega la configuración con **una sola lectura**. |

**Índices:** todas las consultas son de un solo campo dentro de una subcolección (`orderBy ts`, rango por `ts`), cubiertas por los índices automáticos; no se requieren índices compuestos. `firestore.indexes.json` **desactiva** la indexación de campos que nunca se consultan (`estado`, `tMin`, `tMax`, `nClima`, `mensaje`) para reducir el almacenamiento de índices.

## 5. API REST (`https://TU-PROYECTO.vercel.app/api/v1`)

| Método | Ruta | Autenticación | Descripción |
|---|---|---|---|
| GET | `/health` | — | Prueba de vida |
| POST | `/ingest` | Token dispositivo | Lote de lecturas, alertas y salud |
| GET | `/device/config` | Token dispositivo | Configuración vigente |
| GET | `/devices` | Usuario | Dispositivos de su organización |
| POST | `/devices` | Usuario **admin** | Crear dispositivo (devuelve token una vez) |
| POST | `/devices/{id}/token` | Usuario **admin** | Regenerar token (revoca el anterior) |
| PUT | `/devices/{id}/config` | Usuario **admin** | Cambiar intervalos, umbrales, activar sensores |
| GET | `/readings?deviceId=&desde=&hasta=` | Usuario | Histórico por rango (máx. 31 días) |

Ejemplos:
```bash
# Envío desde el dispositivo
curl -X POST $API/api/v1/ingest -H "Authorization: Bearer campus-norte.sala-101.XXXX" \
  -H "Content-Type: application/json" \
  -d '{"lecturas":[{"id":"29857331","ts":1791439860,"t":22.4,"tMin":22.3,"tMax":22.5,"h":48.1,"nClima":6,
       "pres":0.35,"mov":4,"ocup":true,"conf":100,"estado":"Ocupada - confortable"}],"alertas":[],"salud":{}}'
# → {"aceptados":["29857331"],"rechazados":[]}

# Cambiar umbral (admin) — ID_TOKEN = await auth.currentUser.getIdToken()
curl -X PUT $API/api/v1/devices/sala-101/config -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" -d '{"umbralTempMax":24}'

# Histórico
curl "$API/api/v1/readings?deviceId=sala-101&desde=2026-10-21T00:00:00Z&hasta=2026-10-22T00:00:00Z" \
  -H "Authorization: Bearer $ID_TOKEN"
```
Códigos: `400` datos inválidos, `401` token inválido/revocado, `403` rol insuficiente, `404` no existe, `409` id repetido, `413` cuerpo muy grande.

**Arquitectura en capas (web/):**
- Presentación: `app/page.js`, `components/*`, `app/api/**/route.js` (solo traducen HTTP).
- Lógica de negocio: `lib/services/*` (autenticación, validación, reglas de configuración, ingesta).
- Acceso a datos: `lib/data/*` (único lugar que usa el Admin SDK de Firestore).

## 6. Seguridad
- El dispositivo **solo inicia conexiones HTTPS salientes** (el servicio se niega a arrancar si `API_URL` no es `https://`); no hay puertos expuestos: el broker no publica puertos y la salud solo escucha en `127.0.0.1`.
- **Token propio y revocable por dispositivo** (`org.device.secreto`, 192 bits aleatorios). En Firestore solo se guarda su SHA-256; la comparación es en tiempo constante. Regenerarlo revoca el anterior al instante.
- La Raspberry **nunca** tiene credenciales de Firebase: la cuenta de servicio solo existe como variables de entorno en Vercel.
- Usuarios con Firebase Auth (correo/contraseña) y **custom claims** `{orgId, role}`; la API verifica el ID token y el rol en cada petición de escritura.
- **Security Rules**: el cliente solo puede leer documentos de su organización y no puede escribir nada.
- Validación de rango, tipo y tamaño de todo lo que llega a la API (lotes ≤400 lecturas, cuerpos ≤200 KB, fechas ≤30 días atrás).
- Secretos fuera del repositorio: `.env`, `.env.local` y JSON de cuenta de servicio en `.gitignore`.

## 7. Hardware
Ver tabla de conexión en el README. El HC-SR501 se alimenta con 5 V pero su salida es 3,3 V (compatible con GPIO). El DHT se alimenta con 3,3 V, así su señal es de 3,3 V. No se usan sensores analógicos (no se requiere ADS1115).
