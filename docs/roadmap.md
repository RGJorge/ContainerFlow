# ContainerFlow — Roadmap de Monitoreo

> Actualizado tras integración de eventos persistentes, notificaciones in-app,
> control de acceso por path, cálculo de memoria real, volúmenes/mounts en
> DetailPanel y recomendaciones de configuración Docker.

## Fase 1: Acciones básicas ✅ COMPLETA
- [x] Stop / Start / Restart desde el DetailPanel
- [x] Confirmación antes de ejecutar acciones destructivas (stop/restart/remove/rebuild/recreate)
- [x] Feedback visual del estado de la acción (loading, success, error) — toast top-right con copy/expand
- [x] Rebuild (docker compose up --build) por servicio
- [x] **Bonus**: Recreate (docker compose up --force-recreate) para aplicar cambios de compose sin rebuild

## Fase 2: Notificaciones ✅ COMPLETA
- [x] Webhooks configurables — **Discord implementado**, Slack pendiente (mismo patrón aplicaría)
- [x] Push notifications cuando un contenedor cae o health check falla — vía Discord + in-app
- [x] Panel de configuración de notificaciones en la UI (SettingsPage → Discord section)
- [x] **Bonus**: Notificaciones in-app (SQLite persistente, bell del header con read/unread, tab dedicado en Monitoring)
- [x] **Bonus**: Debounce de 15s para detectar restart vs stop+start
- [x] **Bonus**: Cooldown configurable + "Still Down" reminder

> **Descartado**: PWA + Service Worker para web push notifications — requiere HTTPS y agrega complejidad de deploy. Las notificaciones in-app + Discord cubren los casos de uso.

## Fase 3: Historial y métricas ✅ COMPLETA
- [x] SQLite para persistir stats — CPU/RAM (network I/O pendiente)
- [x] Gráficas temporales de CPU/RAM por servicio (1h, 6h, 24h, 7d) con buckets agregados
- [x] Dashboard de métricas agregadas — MonitoringTotalsCard (CPU/MEM total por filtro)
- [x] Retención configurable — 7d default, auto-limpieza horaria + VACUUM
- [x] **Bonus**: Filtro per-servicio en monitoring (override del range global)
- [x] **Bonus**: Filtros por proyecto/servicio con botón reset
- [x] **Bonus**: Cálculo de memoria real (resta page cache active+inactive, no solo inactive como `docker stats`)

## Fase 4: Alertas ✅ MAYORMENTE COMPLETA
- [ ] Reglas de alertas con duración (ej: CPU > 80% **por 5 min**) — parcialmente: alertas inmediatas al cruzar threshold, no soporte de duración sostenida
- [x] Historial de alertas disparadas — notifications_log en SQLite, tab Notificaciones
- [x] Integración con notificaciones (Fase 2) — Discord + in-app
- [x] Alertas por health check fallido — vía `health_status` event
- [x] **Bonus**: Thresholds por contenedor con override del global (CPU% y MEM%)
- [x] **Bonus**: Color amber en progress bars cuando supera threshold (dashboard ServiceNode + DetailPanel)

## Fase 5: Info avanzada
- [x] Volumes/Mounts por contenedor en DetailPanel — tipo, source, destination, rw/ro, name del volumen
- [x] Terminal interactiva (docker exec) desde la UI — botón Exec en DetailPanel
- [ ] Network inspector (tráfico entre servicios) — parcial: conexiones visualizadas en grafo, no hay info de tráfico (rx/tx bytes)
- [ ] Image layers y tamaño (no implementado)

## Fase 6: Deployment (futuro)
- [ ] GitHub integration (webhook + clone + build)
- [ ] Build pipeline (docker build desde Dockerfile)
- [ ] Deploy management (docker-compose dinámico)
- [ ] Domain routing automático (Traefik/Caddy)
- [ ] Rollbacks (mantener imágenes anteriores)
- [ ] Env var editing + rebuild desde la UI — parcial: env vars visibles en DetailPanel, edición pendiente

---

## Fase nueva: Recomendaciones de configuración Docker

ContainerFlow no solo monitorea — detecta configuración sub-óptima y la marca con un banner ámbar en el DetailPanel. La idea es ayudar al usuario a adoptar buenas prácticas sin tener que recordarlas.

### Recomendaciones activas (✅ implementadas)
- [x] **Sin `memory_limit`** → banner "Sin límite de memoria configurado en Docker"
- [x] **Sin `cpu_quota`** → banner "Sin límite de CPU configurado en Docker"
- [x] **`restart: no` o vacío** → banner "Restart policy: none — el contenedor no se reiniciará automáticamente si se detiene"

### Recomendaciones planeadas
- [ ] **Sin `HEALTHCHECK`** → detectar `service.health_status === ""` y sugerir healthcheck contextual:
  - postgres → `pg_isready -U $POSTGRES_USER`
  - redis → `redis-cli ping`
  - mysql/mariadb → `mysqladmin ping -h localhost`
  - mongo → `mongosh --eval "db.adminCommand('ping')"`
  - http app → `curl -f http://localhost:PORT/health`
  - Banner copiable con el snippet del compose
- [ ] **`image:latest`** → warning "Imagen sin tag específico — no reproducible. Considera fijar versión."
- [ ] **DBs sin named volume** → warning "Container de DB (postgres/mysql/mongo/redis) sin named volume para datos persistentes. `docker-compose down` puede borrar datos."
- [ ] **Containers sin labels de compose** → info "Container manual (docker run). Acciones de rebuild no disponibles."

### Resumen del enfoque

```
docker stats:           solo muestra números
otros dashboards:       muestran números + gráficas
ContainerFlow:          muestra + grafica + DETECTA config rota y enseña a arreglarla
```

Este eje diferenciador agrega valor educativo, no solo observabilidad.

---

## Features adicionales no contempladas en el roadmap original

### Seguridad / Multi-usuario
- [x] `ALLOWED_PATHS` env var para limitar acciones a paths específicos
- [x] `ALLOW_NON_COMPOSE` para containers `docker run` directo
- [x] Lock icon visual en nodos sin acceso de acción
- [x] Sección "Seguridad" expandida en README (privilegios del container, multi-user, ALLOWED_PATHS)

### UX / DX
- [x] Tooltips descriptivos en acciones (DetailPanel + NodeContextMenu)
- [x] Confirmación dialogs con (?) que muestra detalle del comando
- [x] Acción labels siempre en inglés (Restart/Stop/Recreate — match docker commands)
- [x] Hot stats al cargar página (`/api/init` devuelve último snapshot cacheado)
- [x] Polling paralelo (Promise.all) — primera ronda en ~3s vs ~90s antes
- [x] Tabs en Monitoring (Historial / Eventos / Notificaciones)
- [x] Click en notificación/evento → abre DetailPanel del container en tab Stats
- [x] DATA_DIR auto-creado en `./data/` (en vez de raíz del proyecto)
- [x] Bell del header con read/unread persistente (localStorage)
- [x] Card totales en Monitoring con color verde diferenciado

### Documentación
- [x] `docker-containerflow.md` — guía Docker explicada para usuarios
- [x] `.env.example` con secciones documentadas
- [x] README con sección Monitoreo e historial + Seguridad + Mejores prácticas

---

## Pendientes prioritarios (próxima iteración)

1. **Alertas con duración** ("CPU > 80% por 5 min") — Fase 4 pendiente
   - Requiere ventana deslizante de samples + state machine por threshold
   - Resuelve falsos positivos por spikes momentáneos
2. **Recomendaciones de healthcheck** — Fase nueva
   - Detectar containers sin healthcheck y sugerir uno contextual según la imagen
   - Banner/widget en dashboard, tooltip con ejemplo copiable
3. **Network I/O en stats history** — extiende `pollStats` con `networks.eth0.rx_bytes/tx_bytes`
4. **Image layers y tamaño** — vía `docker image inspect` + UI en DetailPanel
5. **Slack webhook** — clonar el patrón de Discord para Slack

## Cosas que cambiaron sustancialmente desde el roadmap original

- **"Notificaciones"** evolucionó de "solo Discord" a "Discord + in-app persistente + bell con read/unread + tab dedicado"
- **"Historial"** evolucionó de "CPU/RAM por servicio" a "+ totales agregados + per-service override + reset filtros + memoria real"
- **Acciones** evolucionó de "stop/start/restart/rebuild" a "+ recreate + exec + remove con confirmación"
- **Seguridad** se volvió un eje propio (ALLOWED_PATHS) que no estaba en el roadmap
- **Recomendaciones de config Docker** es un eje nuevo que no estaba contemplado — diferenciador del producto vs "solo otro dashboard"
