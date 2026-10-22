# Smart Campus IoT — Monitoreo de salas

Solemne 1 · Infraestructura TI · Universidad Andrés Bello

Sistema que mide en tiempo real la **temperatura, la humedad y la presencia de personas** en una sala usando una Raspberry Pi 4, y muestra esa información en una página web.

- **Plataforma web:** <https://raspberry-pi-y1p2.vercel.app>
- **Repositorio:** <https://github.com/ZaidIsamit/RaspberryPi>

## Credenciales de acceso

| Correo | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| admin.norte@unab.cl | Admin2026.A | Administrador | Ve la Sala 101 y puede cambiar la configuración del dispositivo |
| consulta.norte@unab.cl | Admin2026.A | Consulta | Ve la Sala 101, pero no puede modificar nada |
| admin.sur@unab.cl | Admin2026.A | Administrador de otra organización | No ve la Sala 101: demuestra que los datos de cada organización están aislados |

## Qué hicimos

1. **Conectamos dos sensores a la Raspberry Pi 4:** un DHT (temperatura y humedad) y un PIR (movimiento).
2. **Dividimos el software de la Raspberry en 6 microservicios con Docker:** uno lee el clima, otro el movimiento, otro procesa los datos, otro los envía a la nube, otro vigila la salud del equipo, y un broker MQTT los comunica entre sí.
3. **Combinamos las lecturas para generar información útil:** cada minuto se calcula si la sala está ocupada, un índice de confort (0 a 100) y se generan alertas (temperatura alta o baja, humedad alta, presencia fuera de horario).
4. **Guardamos los datos en la nube:** la Raspberry envía un resumen por minuto a nuestra API en Vercel, que lo valida y lo guarda en Cloud Firestore. Si se corta internet, las lecturas quedan guardadas en la Raspberry y se reenvían al volver la conexión, sin duplicados.
5. **Construimos la página web**, con inicio de sesión y dos roles:
   - **Panel en vivo:** valores actuales, gráfico de los últimos 20 registros y estado de los microservicios.
   - **Histórico:** promedios y gráfico por rango de fechas.
   - **Todos los registros:** tabla con cada lectura por minuto, exportable a CSV.
   - **Alertas:** historial de alertas con filtros.
   - **Dispositivos:** alta de dispositivos, token de acceso y cambio de configuración a distancia (la Raspberry lo aplica sin reiniciarse).
6. **Medimos el consumo:** evaluamos cuántas lecturas y escrituras genera el sistema operando 24 horas los 7 días, y si cabe en la capa gratuita de Firebase y Vercel.

Todo funciona **sin costo**, con los planes gratuitos de Vercel (Hobby) y Firebase (Spark).

## Cómo funciona

```
Sensores ─► Raspberry Pi (6 contenedores Docker) ─HTTPS─► API en Vercel ─► Cloud Firestore ─► Página web
```

## Estructura del repositorio

```
raspberry/   microservicios que corren en la Raspberry Pi (docker-compose.yml)
web/         página web y API (Next.js), desplegada en Vercel
docs/        documentación técnica
```

## Documentación

| Documento | Contenido |
|---|---|
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Instrucciones para desplegar todo desde cero, conexión de los sensores y guion de la demostración |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diagrama, microservicios, modelo de datos, API y seguridad |
| [docs/EVALUACION_USO.md](docs/EVALUACION_USO.md) | Evaluación de uso, capacidad y costos |
