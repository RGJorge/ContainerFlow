# ContainerFlow

[![CI](https://github.com/RGJorge/containerflow/actions/workflows/ci.yml/badge.svg)](https://github.com/RGJorge/containerflow/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Release](https://img.shields.io/github/v/tag/RGJorge/containerflow?label=version&color=green)](https://github.com/RGJorge/containerflow/tags)
![Docker Required](https://img.shields.io/badge/Docker-required-blue?logo=docker)
![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)
[![Last Commit](https://img.shields.io/github/last-commit/RGJorge/containerflow)](https://github.com/RGJorge/containerflow/commits/main)

Real-time Docker architecture visualizer. Displays services, connections and metrics from all your Docker Compose projects in an interactive dashboard.

![ContainerFlow demo](docs/demo.gif)

## Por qué ContainerFlow

Las herramientas existentes te muestran números. ContainerFlow además:

- **Visualiza arquitectura** — grafo interactivo con conexiones (app→db, app→cache, proxy→app) detectadas automáticamente, no solo una lista plana
- **Detecta config sub-óptima** — banners cuando un container corre sin límite de memoria, sin límite de CPU, o sin `restart: unless-stopped`. Te enseña buenas prácticas mientras lo usas
- **Mide memoria real** — resta page cache (active + inactive), no solo inactive como `docker stats`. Tu DB con buffers Postgres no muestra 98% falso
- **Multi-usuario seguro** — variable `ALLOWED_PATHS` para servidores compartidos: ves todo, solo tocas lo tuyo
- **80 MB de RAM, startup en 500ms** — Bun + Hono. Pesa una fracción de Portainer y arranca antes que Grafana

## Quick start

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
cp .env.example .env
docker compose up -d
```

Abre `http://localhost:9470`. Listo.

Para desarrollo nativo (hot reload): `bun install && bun run dev`.

## Documentación

- **[docs/docker-guide.md](./docs/docker-guide.md)** — Guía rápida de Docker explicado para usar ContainerFlow: qué hace cada acción (Start, Stop, Restart, Recreate, Rebuild, Remove, Exec), restart policies, resource limits, volúmenes, healthchecks y preguntas frecuentes.
- **[docs/roadmap.md](./docs/roadmap.md)** — Roadmap del proyecto: qué está completo, qué viene, qué se descartó y por qué.

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- Docker corriendo con acceso al socket (`/var/run/docker.sock`)

## Instalacion

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
bun install
```

## Configuracion

Copiar el archivo de ejemplo y editar:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `9470` | Puerto del servidor |
| `AUTH_TOKEN` | _(vacio)_ | Token de autenticacion. Vacio = sin auth, solo localhost. Con valor = auth activado, acceso remoto |
| `DATA_DIR` | `./data` | Directorio para persistencia: SQLite de historial (`.dockerflow-stats.db`), config Discord (`.dockerflow-discord.json`), overrides por contenedor (`.dockerflow-container-settings.json`), posiciones de nodos y env file overrides. Se crea automaticamente al startup. En Docker se monta en `/app/data` via volumen `containerflow-data`. |
| `HOST_PROJECTS_DIR` | _(vacio)_ | Path adicional a montar para que `rebuild`/`remove` puedan leer compose files fuera de los defaults (`/home`, `/opt`, `/srv`, `/root`). Solo necesario para rutas no estandar (ej. `/data/apps`). |
| `ALLOWED_PATHS` | _(vacio)_ | **Vacio = todo accionable** (modo permisivo). Con valores = lista separada por `:` de prefijos; solo containers cuyo compose file este bajo alguno de estos paths pueden ejecutar acciones, el resto aparece con candado. Ver seccion [Seguridad](#seguridad). |
| `ALLOW_NON_COMPOSE` | `false` | **Solo aplica cuando `ALLOWED_PATHS` esta activo.** Si `ALLOWED_PATHS` esta vacio, esta variable no tiene efecto. Cuando aplica: `false` bloquea acciones sobre containers no-compose (corridos con `docker run` directo); `true` las permite. |

## Uso

### Desarrollo (hot reload)

```bash
bun run dev
```

Abre `http://localhost:9420` (Vite dev con hot reload, proxea API al backend en puerto 9470).

### Produccion (Docker)

```bash
docker compose up -d
```

Abre `http://localhost:9470`.

### Produccion (manual)

```bash
bun run build
bun run start
```

Abre `http://localhost:9470`.

### Modos de visualizacion

```bash
# Ver TODOS los containers Docker
bun run start -- --all

# Ver solo proyectos especificos
bun run start -- --projects=mi-proyecto,otro-proyecto

# Auto-detectar desde el directorio actual
bun run start
```

## Funcionalidades

- **Descubrimiento automatico** — detecta servicios via Docker socket, agrupa por proyecto o compose file
- **Conexiones inteligentes** — detecta relaciones app→database, app→cache, proxy→app, worker→broker
- **Metricas en tiempo real** — CPU y memoria por container, actualizado cada 3 segundos
- **Eventos Docker** — flash visual cuando un container inicia, para o reinicia
- **Panel de detalle** — click en un container para ver info, stats, variables de entorno y configuracion en tabs separados
- **Logs de containers** — logs en tiempo real con scroll automatico, filtro por stream (stdout/stderr) y opcion de copiar
- **Acciones sobre containers** — start, stop, restart, rebuild y remove directamente desde el panel
- **Ejecutar comandos** — terminal inline (`docker exec`) desde el DetailPanel con output, sin abrir SSH ni terminal externa
- **Toast de errores** — cuando una accion falla (rebuild que rompe, exec con exit code != 0, etc.) aparece un toast top-right con el error completo, copiable al clipboard
- **Control de acceso por path** — variable `ALLOWED_PATHS` permite restringir acciones a containers cuyo compose file este bajo rutas especificas. Ideal para servidores compartidos: ves todo, solo tocas lo tuyo. Los containers fuera de las rutas aparecen con candado
- **Recomendaciones de configuracion Docker** — banners de aviso en el DetailPanel cuando un container tiene config sub-optima: sin limite de memoria, sin limite de CPU, sin restart policy (`unless-stopped` recomendado). Ayuda al usuario a adoptar mejores practicas de Docker sin tener que recordarlas
- **Volumenes y mounts** — DetailPanel lista cada mount del container: tipo (bind / volume / tmpfs), source en el host, destination en el container, modo rw/ro. Util para debugging ("donde estan mis datos?", "es read-only?", "es persistente?")
- **Filtro de proyectos** — dropdown para mostrar/ocultar proyectos, persiste entre sesiones
- **Autenticacion** — pantalla de login con AUTH_TOKEN para acceso remoto seguro
- **Leyenda de conexiones** — colores por tipo: Database (azul), Cache (rojo), Broker (naranja), Proxy (verde)
- **Grupos visuales** — recuadros por proyecto/compose con titulo, archivo compose y conteo de containers
- **Menu contextual** — click derecho en un nodo para acciones rapidas
- **Pagina de monitoring** — historial de CPU/RAM por servicio (1h, 6h, 24h, 7d) persistido en SQLite, gráficas con sparkline, expand por contenedor, filtros por proyecto/servicio y feed de eventos Docker
- **Notificaciones Discord** — webhook configurable que avisa cambios de estado, alertas de recursos, acciones manuales y errores
- **Umbrales por contenedor** — overrides personalizados de CPU/MEM (con fallback a umbrales globales) y toggle de notificaciones por servicio
- **Pagina de settings** — configuracion de la aplicacion (auth, Discord, hosts Docker)

## Mejores prácticas

ContainerFlow no solo monitorea: detecta configuración sub-óptima de Docker y la marca con un banner ámbar en el DetailPanel del container afectado. La idea es ayudarte a adoptar buenas prácticas sin tener que recordarlas tú.

### Recomendaciones activas (warnings automáticos)

| Detección | Por qué importa | Cómo se ve en ContainerFlow |
|---|---|---|
| **Sin `memory_limit`** | Un container sin tope de RAM puede acaparar toda la memoria del host y tumbar a los demás (incluido el daemon). El kernel hace OOM kill aleatorio bajo presión. | Banner: "Sin límite de memoria configurado en Docker" |
| **Sin `cpu_quota`** | Similar al de memoria — un container puede saturar todos los núcleos. En multi-tenant esto es crítico, en single-tenant degrada la responsividad del host. | Banner: "Sin límite de CPU configurado en Docker" |
| **`restart: no` o vacío** | Si el proceso muere, el container queda muerto. En producción casi siempre quieres `unless-stopped` (reinicia si crashea, **NO** si lo paraste manualmente). | Banner: "Restart policy: none — el contenedor no se reiniciará automáticamente si se detiene" |

### Configuración recomendada (template)

```yaml
# docker-compose.yml — buenas prácticas
services:
  mi-app:
    image: mi-app:latest
    restart: unless-stopped              # ← reinicia tras crashes, respeta stops manuales
    deploy:
      resources:
        limits:
          cpus: "0.5"                    # ← máximo medio núcleo
          memory: 256M                   # ← tope absoluto, evita OOM del host
    healthcheck:                         # ← detecta apps "vivas pero rotas"
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

### Por qué ContainerFlow hace esto

La mayoría de tutoriales de Docker no mencionan estas configuraciones porque "funciona sin ellas". Pero en producción son la diferencia entre:

- **Sin límites**: un memory leak en un servicio tumba a TODO el servidor
- **Con límites**: el container se mata a sí mismo, el resto sigue vivo, las restart policies lo reviven

ContainerFlow te lo recuerda visualmente cada vez que abres el DetailPanel — no es spam, es contexto educativo solo donde aplica.

### En roadmap

- **Healthcheck recommendations**: detectar containers sin `HEALTHCHECK` y sugerir uno contextual según la imagen (postgres → `pg_isready`, redis → `redis-cli ping`, http app → `curl /health`, etc.)
- **Mounts no persistentes**: warning cuando una DB usa `tmpfs` o bind a directorio efímero
- **Versión latest**: warning cuando un container usa `image:latest` (no reproducible)

## Monitoreo e historial

ContainerFlow guarda un historial de métricas y notifica eventos importantes a Discord.

### Historial de métricas

- **Persistencia** — stats de CPU y memoria se almacenan en SQLite (`.dockerflow-stats.db`) cada vez que se hace polling de Docker (~3s)
- **Rangos** — `1h`, `6h`, `24h`, `7d` con buckets agregados (30s / 60s / 5min / 30min) para rendimiento
- **Retención** — auto-limpieza horaria descarta datos con más de 7 días y compacta la base con `VACUUM`
- **API** —
  - `GET /api/stats/history?range=1h` — historial de todos los servicios
  - `GET /api/stats/history/:uid?range=1h` — historial de un servicio específico
- **UI** — la página de monitoring (`MonitoringPage.tsx`) muestra una tarjeta por servicio con sparkline de CPU y MEM, valor actual, promedio y línea de umbral. Cada tarjeta puede expandirse para ver una gráfica más grande, y se filtra por proyecto y/o servicio (los filtros son acumulativos).

### Notificaciones Discord

Configurables desde **Settings → Discord Notifications**. Requiere un webhook URL que empiece por `https://discord.com/api/webhooks/`.

Eventos soportados (cada uno se puede activar/desactivar):

| Evento | Cuándo dispara |
|---|---|
| **Container State Changes** | `start`, `stop`, `die` (crash), `restart`, `health_status`. Los eventos `stop`/`die` se debouncean 15s para detectar reinicios y enviar un solo mensaje "Container Restarted" en lugar de stop+start separados |
| **Resource Alerts** | CPU o memoria de un contenedor supera el umbral (global o por-container) |
| **UI Actions** | Acción manual disparada desde el panel: start/stop/restart/rebuild/remove |
| **Action Errors** | Falló una acción ejecutada desde la UI (incluye el mensaje de error) |

Mecanismos anti-spam:

- **Cooldown global** — minutos mínimos entre alertas del mismo tipo+servicio (default `5 min`, configurable `1-60`)
- **Down reminder** — si un contenedor sigue caído, reenvía un recordatorio "Container Still Down" cada N minutos (default `5 min`)
- **Cola con rate limit** — 500ms mínimo entre webhooks; si Discord responde `429`, respeta el `Retry-After` y reintenta
- **Debounce de stop/die** — buffer de 15s para colapsar restart/redeploy en una sola notificación

Umbrales:

- **Globales** — CPU% y MEM% en Settings (default 50% / 60%)
- **Por contenedor** — desde la página de monitoring, click en el ícono ⚙️ de un servicio para abrir el panel inline. Permite:
  - Activar/desactivar notificaciones para ese contenedor
  - Override del umbral de CPU (drag del slider)
  - Override del umbral de memoria
  - Reset al valor global (X)
  - Los overrides se persisten en `.dockerflow-container-settings.json` y se auto-guardan con debounce de 400ms

Botón **Test** en Settings envía un embed de prueba al webhook para verificar que funciona antes de habilitarlo.

## Tests

El proyecto usa [Vitest](https://vitest.dev/) para tests unitarios.

```bash
# Correr todos los tests
bun run test

# Correr en modo watch (re-ejecuta al guardar)
bun run test:watch

# Verificar tipos TypeScript
bun run typecheck
```

Los tests cubren:

- **Logica de processing** (`src/client/hooks/processing.test.ts`) — sincronizacion de estados cuando se ejecutan acciones sobre containers (start/stop/restart), incluyendo manejo de estados crashed/dead, timeouts y minDuration
- **Deteccion de conexiones** (`src/server/docker.test.ts`) — descubrimiento de relaciones entre servicios por red compartida, clasificacion de servicios (infra, proxy, worker) y deduplicacion

## CI

GitHub Actions ejecuta automaticamente en cada push/PR a `main`:

1. Typecheck (errores de tipos)
2. Tests (Vitest)
3. Build (produccion)

Ver `.github/workflows/ci.yml`.

## Seguridad

### Red y autenticación

- **HTTPS obligatorio en produccion** — el token de autenticacion viaja en headers HTTP. Sin HTTPS, es texto plano visible en la red. Usa un reverse proxy con TLS (nginx, Caddy, Cloudflare Tunnel) delante de ContainerFlow.
- **Rate limiting** — incluido por defecto: 5 intentos fallidos por minuto por IP. Despues del limite, retorna `429 Too Many Requests`. Aplica tanto a la API REST como a la autenticacion WebSocket.
- **Acceso local por defecto** — sin `AUTH_TOKEN`, el servidor solo escucha en `127.0.0.1`. Con `AUTH_TOKEN`, escucha en `0.0.0.0` para acceso remoto.

### Privilegios del container

ContainerFlow es una herramienta privilegiada por diseño:

- **Docker socket** (`/var/run/docker.sock`) — acceso completo al daemon Docker. Equivalente a root en el host: puede crear containers privilegiados, montar cualquier path, leer/escribir el filesystem completo. Si ContainerFlow se compromete, el host está comprometido.
- **Mounts read-only del host** — el `docker-compose.yml` monta `/home`, `/opt`, `/srv` y `/root` como `:ro` para que las acciones `rebuild` y `exec` puedan leer compose files. Permite **lectura** de archivos en esos directorios (incluyendo SSH keys, git credentials, etc. de cualquier usuario en el sistema).

**Implicaciones en servidor multi-usuario:** si varios usuarios (`/home/jorge`, `/home/israel`, `/home/pedro`) tienen sus proyectos en el mismo host, ContainerFlow puede leer los archivos de todos ellos. El acceso al socket Docker hace que esto sea ruido relativo (cualquiera con el socket ya tiene acceso total al host), pero conviene estar consciente.

### Setup recomendado para single-user

Defaults actuales — convenientes y suficientes:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - containerflow-data:/app/data
  - /home:/home:ro
  - /opt:/opt:ro
  - /srv:/srv:ro
  - /root:/root:ro
```

### Setup recomendado para multi-user / producción

Limita los mounts a directorios específicos donde tienes proyectos:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - containerflow-data:/app/data
  # En vez de /home completo, solo tus proyectos
  - /home/jorge/git:/home/jorge/git:ro
  - /srv/apps:/srv/apps:ro
```

Esto reduce el blast radius si hay un bug que filtre paths.

### Setup recomendado para deploys compartidos: `ALLOWED_PATHS`

Si varios admins comparten un servidor y cada uno solo debe interactuar con sus propios containers, configura la variable `ALLOWED_PATHS` en `.env`:

```bash
# .env
ALLOWED_PATHS=/home/jorge:/srv/myapp    # rutas separadas por ":"
ALLOW_NON_COMPOSE=false                  # opcional, default false
```

**Comportamiento:**

- `ALLOWED_PATHS` vacío (default) → modo permisivo: todas las acciones disponibles para todos los containers
- `ALLOWED_PATHS` con valores → modo estricto:
  - **Visualización, stats y logs:** siempre disponibles para todos los containers (la visibilidad viene del Docker socket)
  - **Acciones** (start/stop/restart/rebuild/remove/exec): solo permitidas si el compose file del container está bajo una ruta permitida
  - Los containers fuera de las rutas aparecen con un **ícono de candado 🔒** y todas sus acciones quedan deshabilitadas
  - El menú contextual y el panel de detalle muestran un badge "View-only"

**`ALLOW_NON_COMPOSE`** controla qué pasa con containers corridos manualmente (`docker run` sin labels de compose):

- `false` (default): bloquea acciones — view-only para containers no-compose
- `true`: permite acciones sobre containers no-compose (útil si tienes containers utilitarios como Portainer agent, Watchtower, etc.)

**Ejemplo multi-usuario:**

```bash
# Servidor compartido con jorge, israel, pedro, nayeli
# Cada uno corre su propia instancia de ContainerFlow en puerto distinto
# El de jorge:
ALLOWED_PATHS=/home/jorge

# El de israel:
ALLOWED_PATHS=/home/israel
```

Cada uno ve **todos** los containers del servidor, pero solo puede hacer rebuild/restart/exec sobre los suyos.

**Endpoint relevante:** `GET /api/config` devuelve la config activa (consumido por el frontend para deshabilitar botones).

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Bun |
| Server | Hono |
| Frontend | React 19 + Vite 6 |
| Grafos | @xyflow/react 12 |
| Estilos | Tailwind CSS 4 |
| Iconos | Lucide React |
| Docker API | dockerode |
| Comunicacion | WebSocket nativo |
| Tests | Vitest |

## Estructura

```
src/
  server/
    index.ts             — servidor Hono + WebSocket + CLI args + REST API
    docker.ts            — descubrimiento de servicios y conexiones
    watcher.ts           — polling de stats + stream de eventos Docker
    stats-db.ts          — SQLite de historial de stats (insert, query por rango, cleanup 7d)
    discord.ts           — webhooks Discord (state changes, resource alerts, cooldown, debounce, queue)
    container-settings.ts — overrides por contenedor (umbrales y toggle de notificaciones)
  client/
    App.tsx          — dashboard principal + login screen
    main.tsx         — entry point React
    index.css        — Tailwind + animaciones custom
    nodes/
      ServiceNode.tsx — nodo visual por container
      GroupNode.tsx    — header de grupo (proyecto/compose)
    hooks/
      useDocker.ts        — hook WebSocket para datos en tiempo real + toast de errores de accion
      useServerConfig.ts  — fetch /api/config + helper canInteract() para ALLOWED_PATHS
      useStatsHistory.ts  — fetch del historial de stats por rango (1h/6h/24h/7d)
      useStatsStore.ts    — store en memoria para stats live
      processing.ts       — logica pura de estados processing
    engine/
      layout.ts      — layout de grupos + grid + edges
    components/
      HeaderBar.tsx        — barra superior con navegacion
      EdgeLegend.tsx       — leyenda de tipos de conexion
      LoginScreen.tsx      — pantalla de autenticacion
      NodeContextMenu.tsx  — menu contextual de nodos (con disable cuando locked)
      OffsetEdge.tsx       — edge custom con offset para evitar superposicion
      Sparkline.tsx        — gráfica de línea ligera para historial de stats
      StatsCard.tsx        — tarjeta de métrica con sparkline, hover, promedio y umbral
      ThresholdBar.tsx     — slider de umbral por contenedor con override/reset
      ActionErrorToast.tsx — stack de toasts top-right para errores de acciones
    panels/
      DetailPanel.tsx — panel lateral con info, stats, env, config y logs
      LogPanel.tsx    — panel de logs por container
    pages/
      MonitoringPage.tsx — historial de CPU/RAM, eventos Docker y umbrales por contenedor
      SettingsPage.tsx   — configuracion (auth, Discord webhook, eventos, umbrales globales)
  shared/
    types.ts         — tipos compartidos server/client
```

## Comunidad y contribuciones

ContainerFlow está en desarrollo activo (`v0.x`).

- 🐛 **Bug?** Abre un [issue](https://github.com/RGJorge/containerflow/issues/new?template=bug_report.md)
- 💡 **Idea?** Abre un [feature request](https://github.com/RGJorge/containerflow/issues/new?template=feature_request.md)
- 🔒 **Vulnerabilidad de seguridad?** Reporta privadamente — ver [SECURITY.md](SECURITY.md)
- 📜 **Code of Conduct** — ver [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 🛠 **Quiero contribuir código** — ver [CONTRIBUTING.md](CONTRIBUTING.md). Actualmente solo aceptamos issues; PRs se abrirán cuando el proyecto madure.

Si ContainerFlow te resulta útil, una ⭐ en GitHub ayuda a la visibilidad del proyecto.

## Licencia

Copyright (C) 2026 Jorge Gonzalez D. (RGJorge)

Este proyecto esta licenciado bajo **GNU Affero General Public License v3.0** (AGPL-3.0). Ver el archivo [LICENSE](LICENSE) para los terminos completos.

Para uso comercial con codigo cerrado, contactar para una licencia comercial: alteonx.servicios@gmail.com
