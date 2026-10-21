# Smart Campus IoT — Monitoreo ambiental y de ocupación de salas

Solemne 1 · Infraestructura TI · Universidad Andrés Bello

Una Raspberry Pi 3 con un sensor de **temperatura/humedad (DHT en GPIO17)** y un **sensor de movimiento PIR (GPIO18)** detecta si una sala está ocupada y en qué condiciones (confortable, calurosa, húmeda, uso fuera de horario). Seis microservicios en Docker procesan las lecturas en el dispositivo y envían **un resumen por minuto** a una API en **Vercel**, que lo guarda en **Cloud Firestore**. La plataforma web muestra el estado en tiempo real, históricos, alertas y permite configurar el dispositivo a distancia.

```
raspberry/   microservicios (docker-compose.yml)   → corre en la Raspberry Pi
web/         Next.js: dashboard + API REST           → se despliega en Vercel
docs/        arquitectura, modelo de datos, API, seguridad y evaluación de uso
```

| Documento | Contenido |
|---|---|
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diagrama, microservicios, modelo de datos, API, seguridad, conexión del hardware |
| [docs/EVALUACION_USO.md](docs/EVALUACION_USO.md) | Escenario, estimación, plantilla de medición de 7 días, límites, optimizaciones, proyección y migración |

---

## Despliegue desde cero (≈ 40 minutos)

### 1. Firebase (plan Spark, sin tarjeta)
1. En <https://console.firebase.google.com> → **Agregar proyecto** (puedes desactivar Analytics).
2. **Authentication** → Comenzar → habilitar **Correo electrónico/contraseña**.
3. **Firestore Database** → Crear base de datos → modo **producción** → ubicación `southamerica-east1` (São Paulo) o la que prefieras.
4. **Firestore → Reglas**: pega el contenido de `web/firestore.rules` y **Publicar**.
5. **Configuración del proyecto → General → Tus apps → Web (`</>`)**: registra una app y copia `apiKey`, `authDomain`, `projectId`, `appId`.
6. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**: se descarga un JSON. **No lo subas a GitHub.** De ahí salen `project_id`, `client_email` y `private_key`.

### 2. Repositorio en GitHub
```bash
cd smart-campus-iot
git init && git add . && git commit -m "Proyecto base Smart Campus IoT"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/smart-campus-iot.git
git push -u origin main
```
> Requisito excluyente: **todos los integrantes deben tener commits**. Repartan partes (ver tabla al final) y que cada uno haga commit con su propia cuenta.

### 3. Vercel (plan Hobby, sin tarjeta)
1. <https://vercel.com> → **Add New → Project** → importa el repositorio.
2. **Root Directory: `web`** (importante). Framework: Next.js (se detecta solo).
3. **Environment Variables** — agrega las 7 de `web/.env.example`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (pega la clave **completa**, con `-----BEGIN…` y los `\n`)
4. **Deploy**. Cada `git push` a `main` vuelve a desplegar automáticamente.
5. Prueba: `https://TU-PROYECTO.vercel.app/api/v1/health` debe responder `{"ok":true,...}`.

### 4. Cuentas de prueba, organizaciones y token del dispositivo
En tu computador (Node 20+):
```bash
cd web
cp .env.example .env.local     # completa los mismos valores que pusiste en Vercel
npm install
npm run seed
```
Crea dos organizaciones aisladas, tres usuarios y un dispositivo por organización, e **imprime el `DEVICE_TOKEN`** de `campus-norte/sala-101` (cópialo).

| Usuario | Contraseña | Organización | Rol |
|---|---|---|---|
| admin@campus-norte.cl | Admin.2026! | campus-norte | admin |
| consulta@campus-norte.cl | Consulta.2026! | campus-norte | viewer (solo lectura) |
| admin@campus-sur.cl | Admin.2026! | campus-sur | admin (para demostrar aislamiento) |

> Cambien las contraseñas antes de publicar el informe si lo desean. Si pierden el token: pestaña **Dispositivos → Regenerar / revocar token**.

### 5. Raspberry Pi
**Conexión (numeración BCM):**

| Sensor | Pin del sensor | Raspberry Pi 3 |
|---|---|---|
| DHT11/DHT22 | VCC | 3,3 V (pin físico 1) |
| | DATA | **GPIO17** (pin físico 11) — con resistencia pull-up 10 kΩ a 3,3 V si el módulo no la trae |
| | GND | GND (pin físico 6) |
| PIR HC-SR501 | VCC | **5 V** (pin físico 2) — el PIR necesita 5 V para alimentarse |
| | OUT | **GPIO18** (pin físico 12) — su salida es de 3,3 V, no necesita divisor |
| | GND | GND (pin físico 14) |

> Si conectaron a los **pines físicos** 17 y 18 en vez de GPIO17/GPIO18, ajusten `GPIO_PIR` en `.env` y `DHT_PIN` al correr el instalador.

```bash
# copia la carpeta raspberry/ a la Pi (o haz git clone del repo en la Pi)
cd smart-campus-iot/raspberry
chmod +x instalar.sh && ./instalar.sh       # Docker, overlay del DHT, swap, NTP, .env
sudo reboot                                  # solo la primera vez (activa el driver del DHT)

cd smart-campus-iot/raspberry
nano .env                                    # API_URL=https://TU-PROYECTO.vercel.app  y  DEVICE_TOKEN=...
docker compose up -d --build                 # la primera compilación tarda ~10-15 min en una Pi 3
```

**Verificar:**
```bash
docker compose ps                            # los 6 servicios "Up (healthy)"
docker compose logs -f sincronizacion        # "Lote enviado: N lecturas"
curl -s localhost:8080/health                # estado de microservicios, CPU, RAM, temperatura
cat /sys/bus/iio/devices/iio:device0/in_temp_input   # prueba directa del DHT (milésimas de °C)
```
El primer documento aparece en Firestore ~1-2 minutos después de arrancar (se agrega por minuto).

---

## Guion de la demostración en vivo (rúbrica criterio 7)
1. **Datos en tiempo real**: pestaña *En vivo*; pasar la mano frente al PIR → al cerrar el minuto cambia a "Ocupada".
2. **Cambio de configuración**: en *Dispositivos* bajar *Temp. máxima* a un valor menor a la actual → en ≤30 s `docker compose logs procesamiento` muestra "Umbrales aplicados en caliente" y aparece la alerta `TEMP_ALTA`. Sin reiniciar nada.
3. **Recuperación tras desconexión**: apagar el hotspot 3-4 minutos → el panel muestra "Desconectado" y la salud indica registros "en buffer"; al volver la red se envía todo y el gráfico se completa **sin huecos ni duplicados**.
4. **Estado de los microservicios**: tabla en *En vivo* y `curl localhost:8080/health`; `docker stop smart-campus-procesamiento-1` lo muestra como falla y Docker lo vuelve a levantar (o `docker compose start`).
5. **Aislamiento**: entrar como `admin@campus-sur.cl` → no ve la Sala 101 (las reglas de Firestore lo bloquean). Entrar como `consulta@` → no puede editar.

Graben esto mismo como **video de respaldo (3-5 min)**.

## Reparto sugerido (cada uno debe poder explicar la parte de otro)
| Integrante | Parte |
|---|---|
| 1 | Hardware + `sensor-clima` + `sensor-movimiento` |
| 2 | `procesamiento` + `salud` + docker-compose |
| 3 | `sincronizacion` + API (`web/app/api`, `web/lib`) + reglas |
| 4 | Dashboard (`web/components`) + evaluación de uso y costos |

## Fechas
- **Hoy, miércoles 21-oct**: el sistema debe quedar enviando a Firestore para tener 7 días de medición (21 → 28).
- **Miércoles 28-oct 23:59**: zip con informe + presentación en Canvas (el informe incluye link del repo y URL pública).
