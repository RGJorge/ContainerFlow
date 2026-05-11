# Docker explicado para usar ContainerFlow

Guía rápida: qué es Docker, conceptos clave, y qué hace cada acción de la app.

---

## ¿Qué es Docker?

Empaqueta tu app con todo lo que necesita (código, libs, configs) en una "caja" autocontenida que corre igual en cualquier máquina con Docker.

```
   IMAGEN (plantilla)         CONTAINERS (instancias)
   ┌──────────────┐            ┌──────────────┐
   │ nginx:alpine │ ─────────► │ web-1        │
   │              │ ─────────► │ web-2        │
   │              │ ─────────► │ web-3        │
   └──────────────┘            └──────────────┘
```

Una **imagen** es una plantilla congelada (receta + ingredientes). Un **container** es una instancia corriendo de esa imagen. Una imagen puede generar muchos containers.

---

## Conceptos clave

| Concepto | Qué es | Ejemplo |
|---|---|---|
| **Imagen** | Plantilla inmutable con código + deps | `nginx:alpine`, `postgres:15` |
| **Container** | Instancia corriendo de una imagen | `fidelizacion-prod-auth-1` |
| **Tag** | Etiqueta legible de la imagen | `:latest`, `:v1.2`, `:alpine` |
| **Image ID** | Hash sha256 (identidad real de la imagen) | `sha256:f4c41c...` |
| **Volumen** | Persiste datos fuera del container | `postgres-data`, bind mounts |
| **Red** | Conecta containers entre sí | Containers en la misma red se ven por nombre |
| **Compose** | YAML que describe múltiples servicios | `docker-compose.yml` |

---

## Acciones de ContainerFlow

Cada botón corresponde a un comando real de Docker. Lo que cambia es **qué destruye y qué reusa**:

```
Start:    [exited]  ─────►  [running]                                     (mismo container)
Stop:     [running] ─────►  [exited]                                      (mismo container)
Restart:  [running] ─────►  STOP → START → [running]                      (mismo container)
Recreate: [running] ─────►  REMOVE → CREATE → [running]                   (container NUEVO, misma imagen)
Rebuild:  [running] ─────►  BUILD IMAGE → REMOVE → CREATE → [running]     (container NUEVO, imagen NUEVA)
Remove:   [running] ─────►  STOP → DELETE → ∅
Exec:     [running] ─────►  ejecuta comando dentro, container sigue igual
```

| Acción | Comando CLI | Cuándo lo usas |
|---|---|---|
| **Start** | `docker start <c>` | Arrancar un container detenido |
| **Stop** | `docker stop <c>` | Apagar limpio (SIGTERM, luego SIGKILL tras 10s) |
| **Restart** | `docker restart <c>` | Reiniciar el proceso sin recrear nada (rápido) |
| **Recreate** | `docker compose up -d --force-recreate <s>` | Aplicar cambios de compose (env, volumes, ports) sin rebuild |
| **Rebuild** | `docker compose up -d --build <s>` | Aplicar cambios de código (reconstruye imagen) |
| **Remove** | `docker compose rm -sf <s>` | Eliminar el container permanentemente (imagen queda) |
| **Exec** | `docker exec <c> <cmd>` | Correr comando dentro (migrate, seed, redis-cli, etc.) |

### Restart vs Recreate vs Rebuild

| | Reinicia proceso | Recrea container | Reconstruye imagen | Aplica cambios compose | Aplica cambios código |
|---|---|---|---|---|---|
| Restart | sí | no | no | no | no |
| Recreate | sí | sí | no | **sí** | no |
| Rebuild | sí | sí | sí | sí | **sí** |

**Regla mental:**
- Restart → algo cuelga, dale un reboot rápido
- Recreate → cambié compose (env var, volume), no toqué código
- Rebuild → cambié código, necesito la versión nueva

---

## Identidad de un container

Hay **dos cosas distintas** y conviene no confundirlas:

```
Container Name:  fidelizacion-prod-auth-1            ← legible, derivado de compose
                                                       ESTABLE entre recreates
Container ID:    b0ab634b6eb2878677d85f8998ce1162...  ← hash sha256
                                                       CAMBIA con cada recreate/rebuild
```

Lo mismo con imágenes:

```
Image Tag:  fidelizacion-prod-auth:latest             ← "apodo" legible
                                                        ESTABLE como puntero
Image ID:   sha256:111aaa222bbb...                    ← hash de la imagen real
                                                        CAMBIA con cada rebuild
```

Cuando haces rebuild, el tag se "mueve" para apuntar al nuevo Image ID. La imagen vieja queda huérfana hasta que `docker image prune` la limpia.

---

## Configuraciones comunes del compose

### Restart policy

```yaml
restart: unless-stopped
```

| Valor | Comportamiento |
|---|---|
| `no` (default) | Si muere, queda muerto |
| `always` | Lo reinicia siempre, **incluso si tú lo detuviste** |
| `on-failure` | Solo si murió con error (exit code != 0) |
| `unless-stopped` | Lo reinicia, **excepto si lo detuviste manualmente** (recomendado para prod) |

### Resource limits

```yaml
deploy:
  resources:
    limits:
      cpus: "0.5"      # máximo medio núcleo
      memory: 256M     # tope absoluto, el kernel lo mata si excede (OOM)
```

ContainerFlow muestra estos límites en el DetailPanel y los gráficos indican si te acercas al tope.

### Volumes

```yaml
volumes:
  - postgres-data:/var/lib/postgresql/data    # named volume (persiste)
  - ./config.yml:/app/config.yml:ro           # bind mount read-only
```

- **Named volumes** (`postgres-data`) persisten entre recreate/rebuild — perfectos para DBs
- **Bind mounts** conectan un directorio del host con el container

### Healthcheck

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s
  retries: 3
```

Docker corre el `test` periódicamente. Si falla `retries` veces, marca el container como `unhealthy`. ContainerFlow muestra el estado en el nodo.

---

## Estados de un container

| Estado | Significado |
|---|---|
| `running` | Corriendo normal |
| `exited` | Terminó (limpio o crash) |
| `paused` | Congelado con `docker pause` |
| `restarting` | En medio de reinicio (por restart policy) |
| `dead` | Falló mal, Docker no pudo limpiarlo |
| `crashed` *(label de ContainerFlow)* | Exit code != 0 |

ContainerFlow colorea los nodos: verde (healthy), rojo (exited/dead), amarillo (restarting/processing), naranja (unhealthy).

---

## Preguntas frecuentes

**¿Pierdo datos al hacer Rebuild?**
No si están en volumes (named volumes persisten siempre, bind mounts no se tocan). Sí si están solo en el filesystem del container — por eso las DBs siempre van en named volume.

**¿Por qué Rebuild es lento?**
Ejecuta `docker build` (descarga base, instala deps, compila). Recreate es segundos porque reusa la imagen existente.

**¿Qué pasa si dos containers tienen el mismo nombre?**
Docker rechaza. Por eso compose deriva nombres únicos: `{project}-{service}-{replica}`.

**¿Qué es OOM Killed?**
El container intentó usar más RAM que su `memory` limit y el kernel lo mató (out-of-memory). Visible en `docker inspect`.

**¿Dónde viven físicamente los volúmenes?**
- Named volumes: `/var/lib/docker/volumes/<nombre>/_data/`
- Bind mounts: el directorio del host que pusiste en compose

**¿Por qué algunos containers no tienen Rebuild en ContainerFlow?**
Solo containers de compose. Los corridos con `docker run` directo no tienen compose file asociado.
