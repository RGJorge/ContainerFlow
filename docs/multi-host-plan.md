# Plan: Monitoreo Multi-Host Docker

## Objetivo

Permitir que una sola instancia de DockerFlow se conecte a múltiples Docker daemons (local + remotos) y visualice todos los contenedores en un solo dashboard, agrupados por host.

## Enfoque

Usar la API TCP de Docker con TLS. No se instala nada adicional en los servidores remotos — solo se configura el Docker daemon para aceptar conexiones TCP.

---

## Fase 1: Configuración de hosts

### 1.1 Variable de entorno `DOCKER_HOSTS`

```bash
# Formato: nombre=tipo://dirección, separados por coma
# El host local usa socket, los remotos usan tcp+tls
DOCKER_HOSTS="local=unix:///var/run/docker.sock,server-a=tcp://192.168.1.10:2376,server-b=tcp://192.168.1.20:2376"
```

Si `DOCKER_HOSTS` no está definido, comportamiento actual (solo socket local). Retrocompatible.

### 1.2 Certificados TLS

```bash
# Directorio de certs por host
DOCKER_CERTS_DIR=./certs
# Estructura:
# certs/
#   server-a/
#     ca.pem
#     cert.pem
#     key.pem
#   server-b/
#     ca.pem
#     cert.pem
#     key.pem
```

---

## Fase 2: Cambios en Backend

### 2.1 `src/server/docker.ts` — Multi-host connections

**Actual:** Una sola instancia de `dockerode` hardcodeada.

```ts
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
```

**Nuevo:** Map de instancias `dockerode` por host.

```ts
interface DockerHost {
  name: string;
  client: Docker;
}

function createHosts(): DockerHost[] {
  const hostsEnv = process.env.DOCKER_HOSTS;
  if (!hostsEnv) {
    return [{ name: "local", client: new Docker({ socketPath: "/var/run/docker.sock" }) }];
  }

  const certsDir = process.env.DOCKER_CERTS_DIR || "./certs";

  return hostsEnv.split(",").map((entry) => {
    const [name, url] = entry.split("=");
    if (url.startsWith("unix://")) {
      return { name, client: new Docker({ socketPath: url.replace("unix://", "") }) };
    }
    // tcp://host:port
    const { hostname, port } = new URL(url.replace("tcp://", "https://"));
    return {
      name,
      client: new Docker({
        host: hostname,
        port: parseInt(port),
        ca: fs.readFileSync(`${certsDir}/${name}/ca.pem`),
        cert: fs.readFileSync(`${certsDir}/${name}/cert.pem`),
        key: fs.readFileSync(`${certsDir}/${name}/key.pem`),
      }),
    };
  });
}

export const dockerHosts = createHosts();
```

### 2.2 `src/shared/types.ts` — Agregar campo `host`

```ts
export interface Service {
  // ... campos existentes ...
  host: string; // nombre del host (ej: "local", "server-a")
}
```

### 2.3 `discoverServices()` — Iterar sobre todos los hosts

```ts
export async function discoverServices(all, projects): Promise<Service[]> {
  const allServices: Service[] = [];

  for (const { name, client } of dockerHosts) {
    const containers = await client.listContainers({ all: true });
    const services = containers.map((c) => ({
      // ... mapeo actual ...
      host: name,
      uid: `${name}/${project}/${serviceName}`, // incluir host en uid
    }));
    allServices.push(...services);
  }

  // filtrar por projects...
  return allServices;
}
```

### 2.4 `discoverConnections()` — Conexiones solo dentro del mismo host

Las conexiones por red compartida solo aplican entre contenedores del mismo host. Agregar filtro:

```ts
// Solo conectar servicios del mismo host
if (app.host !== infra.host) continue;
```

### 2.5 `getContainerLogs()` y `streamContainerLogs()` — Resolver host

Actualmente usan `docker.getContainer(id)`. Cambiar para recibir el host y usar el client correcto:

```ts
export async function getContainerLogs(hostName: string, id: string, tail = 200) {
  const host = dockerHosts.find(h => h.name === hostName);
  const container = host.client.getContainer(id);
  // ... resto igual ...
}
```

### 2.6 `src/server/watcher.ts` — Stats y eventos multi-host

`pollStats` y `watchDockerEvents` deben iterar sobre todos los hosts. Cada host tiene su propio stream de eventos.

---

## Fase 3: Cambios en Frontend

### 3.1 Agrupación visual por host

- Usar un **borde/fondo coloreado** alrededor de los nodos de cada host
- Mostrar label del host sobre cada grupo
- Colores distintos por host (auto-asignados)

### 3.2 Sidebar/filtro por host

- Agregar selector de host en la UI para filtrar la vista
- Opción "Todos" para ver todo junto

### 3.3 Panel de stats

- Mostrar en qué host está cada contenedor
- Badge con el nombre del host en cada nodo del grafo

---

## Fase 4: Documentación de setup remoto

### Guía para configurar un Docker daemon remoto

En el servidor remoto:

```bash
# 1. Generar certificados (una vez)
# Usar el script que incluiremos en tools/generate-certs.sh

# 2. Editar /etc/docker/daemon.json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
  "tls": true,
  "tlscacert": "/etc/docker/ssl/ca.pem",
  "tlscert": "/etc/docker/ssl/server-cert.pem",
  "tlskey": "/etc/docker/ssl/server-key.pem",
  "tlsverify": true
}

# 3. Reiniciar Docker
sudo systemctl restart docker
```

### Script de generación de certs

Incluir `tools/generate-certs.sh` que genere CA + server cert + client cert.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/server/docker.ts` | Multi-host connections, refactor todas las funciones |
| `src/server/watcher.ts` | Stats y eventos por host |
| `src/server/index.ts` | Pasar host en log subscribe/unsubscribe |
| `src/shared/types.ts` | Campo `host` en Service, WSMessage updates |
| `src/client/App.tsx` | Agrupación visual, filtros, badges |
| `src/client/components/*` | Nodos con indicador de host |

## Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `tools/generate-certs.sh` | Script para generar certificados TLS |

---

## Orden de implementación

1. Types (`host` field) — 5 min
2. `docker.ts` multi-host — core del cambio
3. `watcher.ts` multi-host
4. `index.ts` ajustes WebSocket
5. Frontend: badges y agrupación
6. Script de certs + docs
7. Testing con host local (simular con socket duplicado)

## Consideraciones

- **Retrocompatible**: sin `DOCKER_HOSTS`, funciona exactamente igual que ahora
- **Seguridad**: nunca TCP sin TLS, los certs son obligatorios para hosts remotos
- **Performance**: cada host se consulta en paralelo con `Promise.all`
- **Errores**: si un host remoto no responde, mostrar el host como "offline" sin afectar los demás
