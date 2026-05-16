import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const en = {
  // Header / Nav
  "header.dashboard": "Dashboard",
  "header.monitoring": "Monitoring",
  "header.settings": "Settings",
  "header.recentEvents": "Recent Events",
  "header.noEvents": "No events yet",
  "header.recentNotifications": "Recent Notifications",
  "header.noNotifications": "No notifications yet",

  // Footer
  "footer.live": "Live",
  "footer.offline": "Offline",
  "footer.containers": "containers",
  "footer.projects": "projects",

  // Filter
  "filter.projects": "Projects",
  "filter.all": "All",

  // Canvas controls
  "controls.exportPng": "Export graph as PNG",
  "controls.exportPng.empty": "No containers to export",
  "controls.exportPng.tooLarge": "Graph is too large to export at full quality",
  "controls.exportPng.failed": "Failed to export graph",

  // Group alias
  "group.rename": "Rename project",
  "group.resetAlias": "Reset to original name",
  "group.saveAlias": "Save",
  "group.cancelAlias": "Cancel",
  "group.changeColor": "Change color",
  "group.resetColor": "Reset color",

  // Login
  "login.connecting": "Connecting...",
  "login.connect": "Connect",
  "login.invalidToken": "Invalid token",
  "login.connectionFailed": "Connection failed",
  "login.establishingConnection": "Establishing secure connection...",
  "login.validatingToken": "Validating AUTH_TOKEN...",
  "login.tokenAccepted": "Token accepted",
  "login.loadingDocker": "Loading Docker socket...",
  "login.connectionEstablished": "Connection established!",
  "login.errorInvalidToken": "ERROR: Invalid token",
  "login.errorConnectionRefused": "Connection refused",
  "login.errorConnectionFailed": "ERROR: Connection failed",

  // Context menu — labels stay in English (match docker commands)
  "actions.restart": "Restart",
  "actions.stop": "Stop",
  "actions.start": "Start",
  "actions.remove": "Remove",
  "actions.rebuild": "Rebuild",
  "actions.recreate": "Recreate",
  "actions.openLogs": "Open Logs",
  "actions.open": "Open",
  "actions.retry": "Retry",

  // Action tooltips (hover descriptions)
  "actions.start.tooltip": "Starts the container (docker start)",
  "actions.stop.tooltip": "Stops the container with SIGTERM, then SIGKILL after timeout (docker stop)",
  "actions.restart.tooltip": "Stops and starts the same container (docker restart). Keeps image and config.",
  "actions.rebuild.tooltip": "Rebuilds the image from Dockerfile and creates a new container (docker compose up --build). Apply code changes.",
  "actions.recreate.tooltip": "Recreates the container with current compose config, reusing existing image (docker compose up --force-recreate). Apply compose changes without rebuilding.",
  "actions.remove.tooltip": "Stops and permanently removes the container (docker rm). For compose services, also cleans associated networks.",
  "actions.retry.tooltip": "Retries starting a crashed container",

  // Action error toast
  "toast.actionFailed": "{action} failed",
  "toast.dismiss": "Dismiss",
  "toast.dismissAll": "Dismiss all",
  "toast.copy": "Copy",
  "toast.copied": "Copied",
  "toast.expand": "Show more",
  "toast.collapse": "Show less",

  // Access control (ALLOWED_PATHS)
  "access.viewOnly": "View-only",
  "access.restricted": "Outside ALLOWED_PATHS — actions disabled",

  // Edge legend
  "legend.connections": "Connections",

  // Service node
  "node.noTag": "No Tag",
  "node.cpu": "CPU",
  "node.mem": "MEM",

  // Detail panel
  "detail.processing": "Processing...",
  "detail.logs": "Logs",
  "detail.info": "Info",
  "detail.stats": "Stats",
  "detail.env": "Env",
  "detail.config": "Config",
  "detail.exec": "Exec",
  "detail.collapse": "Collapse",
  "detail.expand": "Expand",
  "detail.close": "Close",
  "detail.cancel": "Cancel",
  "detail.loadingLogs": "Loading logs...",
  "detail.noLogs": "No logs available",
  "detail.linesHidden": "lines hidden",
  "detail.streaming": "streaming",

  // Detail panel - Info tab
  "detail.status": "Status",
  "detail.image": "Image",
  "detail.container": "Container",
  "detail.project": "Project",
  "detail.compose": "Compose",
  "detail.envFile": "Env File",
  "detail.envFileAutoDetect": "Auto (detect)",
  "detail.envFileAuto": "Auto",
  "detail.envFileTip": "Only files starting with .env are detected",
  "detail.ports": "Ports",
  "detail.networks": "Networks",
  "detail.connectedTo": "Connected to",

  // Detail panel - Config tab
  "detail.restartPolicy": "Restart Policy",
  "detail.resourceLimits": "Resource Limits",
  "detail.memoryLimit": "Memory Limit",
  "detail.cpuQuota": "CPU Quota",
  "detail.unlimited": "Unlimited",
  "detail.threshold": "Threshold",
  "detail.thresholdTooltip": "Alert threshold — sends a Discord notification when exceeded",
  "detail.memBreakdown": "Memory breakdown",
  "detail.memAnon": "Anon (process memory)",
  "detail.memCache": "Page cache (reclaimable)",
  "detail.memTotal": "Total reserved (incl. cache)",
  "detail.memLimit": "Limit",
  "detail.memTooltipHint": "ContainerFlow shows real usage (anon). Cache is reclaimable by the kernel under pressure — same logic as `docker stats` CLI.",
  "detail.limit": "Limit",
  "detail.limitTooltip": "Maximum resource allocated to this container in Docker",
  "detail.avg": "Avg",
  "detail.healthCheck": "Health Check",
  "detail.healthNotConfigured": "Not configured",
  "detail.recentChecks": "Recent checks",

  // Detail panel - Env tab
  "detail.variables": "variables",
  "detail.copyAll": "Copy all",
  "detail.copied": "Copied!",
  "detail.hideAll": "Hide all",
  "detail.showAll": "Show all",
  "detail.noEnvVars": "No environment variables available",

  // Detail panel - Stats tab
  "detail.cpuUsage": "CPU Usage",
  "detail.memoryUsage": "Memory Usage",
  "detail.memory": "Memory",
  "detail.noStats": "No stats available",
  "detail.cpuHistory": "Usage History",
  "detail.mounts": "Volumes & Mounts",
  "detail.memoryHistory": "Memory History",
  "detail.noHistory": "No historical data available",
  "detail.loadingHistory": "Loading history...",

  // Detail panel - Warning banners
  "detail.noMemoryLimit": "No memory limit configured in Docker",
  "detail.noCpuLimit": "No CPU limit configured in Docker",
  "detail.weakRestartPolicy": "Restart policy: none — container won't restart automatically if it stops",

  // Detail panel - Notification settings
  "detail.notifications": "Notifications",
  "detail.notificationsEnabled": "Enabled",
  "detail.cpuThreshold": "CPU threshold",
  "detail.memThreshold": "Memory threshold",
  "detail.global": "(global)",
  "detail.custom": "(custom)",
  "detail.saveSettings": "Save",
  "detail.settingsSaved": "Saved",
  "detail.savingSettings": "Saving...",
  "detail.thresholdHint": "Drag line to set alert threshold",

  // Detail panel - Actions / Confirmations
  "detail.actionSuccess": "successful",
  "detail.actionFailed": "Failed to",
  "detail.confirmStop": "Stop this container? This will interrupt the service.",
  "detail.confirmRestart": "Restart this container? This will briefly interrupt the service.",
  "detail.confirmRemove": "Remove this container? This will stop and delete it.",
  "detail.confirmRebuild": "Rebuild this container? This will rebuild the image and recreate the container.",
  "detail.confirmRecreate": "Recreate this container? Reuses the existing image and applies current compose config.",

  // Detail panel - Crash
  "detail.containerCrashed": "Container crashed",
  "detail.exitCode": "Exit code",
  "detail.oomKilled": "OOM Killed",
  "detail.restarted": "Restarted",
  "detail.times": "times",
  "detail.checkLogs": "Check the logs below for details",

  // Detail panel - Exec
  "detail.execPlaceholder": "e.g. python manage.py migrate",
  "detail.run": "Run",
  "detail.exitCodeLabel": "Exit code",
  "detail.noOutput": "(no output)",

  // Log panel
  "logPanel.streaming": "streaming",
  "logPanel.loadingLogs": "Loading logs...",
  "logPanel.noLogs": "No logs available",

  // Monitoring page
  "monitoring.title": "Monitoring",
  "monitoring.titleTooltip": "CPU/RAM history, events and notifications of your containers.",
  "monitoring.subtitle": "Docker container events in real-time",
  "monitoring.noEvents": "No events yet. Events will appear here as containers start, stop, or restart.",
  "monitoring.alertRules": "Alert Rules",
  "monitoring.alertRulesDesc": "Configure alerting rules for container events \u2014 coming soon",
  "monitoring.statsHistory": "Resource Usage History",
  "monitoring.totals": "Totals (all filtered containers)",
  "monitoring.totalCpu": "CPU (T)",
  "monitoring.totalMem": "MEM (T)",
  "monitoring.clearFilters": "Clear filters",
  "monitoring.tabHistory": "History",
  "monitoring.tabEvents": "Events",
  "monitoring.tabNotifications": "Notifications",
  "monitoring.noNotifications": "No notifications yet. They will appear here when containers change state, hit resource thresholds, or you run UI actions (mirrors Discord webhooks).",
  "monitoring.loadingHistory": "Loading historical data...",
  "monitoring.noHistoryData": "No historical data available yet",
  "monitoring.selectFilter": "Select a service or load all to view history",
  "monitoring.loadAll": "Load all",
  "monitoring.allServices": "All services",
  "monitoring.allProjects": "All projects",
  "monitoring.filterService": "Filter by service",
  "monitoring.filterProject": "Filter by project",

  // Settings page
  "settings.title": "Settings",
  "settings.subtitle": "Application configuration",
  "settings.general": "General",
  "settings.version": "Version",
  "settings.mode": "Mode",
  "settings.singleHost": "Single Host",
  "settings.projects": "Projects",
  "settings.containers": "Containers",
  "settings.dockerHosts": "Docker Hosts",
  "settings.dockerHostsDesc": "Multi-host management \u2014 coming soon",
  "settings.dockerHostsDetail": "Connect to remote Docker daemons and manage multiple hosts from a single dashboard.",
  "settings.discord": "Discord Notifications",
  "settings.webhookUrl": "Webhook URL",
  "settings.sending": "Sending...",
  "settings.test": "Test",
  "settings.webhookSuccess": "Webhook sent successfully!",
  "settings.events": "Events",
  "settings.containerStateChanges": "Container state changes",
  "settings.containerStateChangesTooltip": "Notifies when Docker detects automatic state changes: start, stop, die, restart, or health status changes (crashes, OOM, restart policies).",
  "settings.resourceAlerts": "Resource alerts",
  "settings.resourceAlertsTooltip": "Monitors CPU and memory usage every 5 seconds. Sends an alert when a container exceeds the configured thresholds.",
  "settings.uiActions": "UI actions",
  "settings.uiActionsTooltip": "Notifies when someone performs a manual action from the ContainerFlow UI: stop, start, restart, or rebuild.",
  "settings.actionErrors": "Action errors",
  "settings.actionErrorsTooltip": "Notifies when an action fails, such as a rebuild that exits with an error. Includes the error details in the message.",
  "settings.resourceThresholds": "Resource Thresholds",
  "settings.resourceThresholdsTooltip": "Set the percentage at which CPU or memory usage triggers a Discord alert. Checked every 5 seconds during stats polling.",
  "settings.cpu": "CPU",
  "settings.memory": "Memory",
  "settings.cooldown": "Cooldown (minutes)",
  "settings.cooldownTooltip": "Minimum time between duplicate notifications for the same container and event type. Applies to state changes, resource alerts, and UI actions.",
  "settings.downReminder": "Down service reminder (minutes)",
  "settings.downReminderTooltip": "How often to resend a notification while a container remains down. You will keep receiving alerts at this interval until the service recovers.",
  "settings.saving": "Saving...",
  "settings.saved": "Saved",
  "settings.save": "Save",
  "settings.configSaved": "Configuration saved",
  "settings.requestFailed": "Request failed",
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  // Header / Nav
  "header.dashboard": "Dashboard",
  "header.monitoring": "Monitoreo",
  "header.settings": "Configuraci\u00f3n",
  "header.recentEvents": "Eventos Recientes",
  "header.noEvents": "Sin eventos a\u00fan",
  "header.recentNotifications": "Notificaciones Recientes",
  "header.noNotifications": "Sin notificaciones a\u00fan",

  // Footer
  "footer.live": "En vivo",
  "footer.offline": "Desconectado",
  "footer.containers": "contenedores",
  "footer.projects": "proyectos",

  // Filter
  "filter.projects": "Proyectos",
  "filter.all": "Todos",

  // Canvas controls
  "controls.exportPng": "Exportar grafo como PNG",
  "controls.exportPng.empty": "No hay containers para exportar",
  "controls.exportPng.tooLarge": "El grafo es muy grande para exportar en alta calidad",
  "controls.exportPng.failed": "Error al exportar el grafo",

  // Group alias
  "group.rename": "Renombrar proyecto",
  "group.resetAlias": "Restaurar nombre original",
  "group.saveAlias": "Guardar",
  "group.changeColor": "Cambiar color",
  "group.resetColor": "Restaurar color",
  "group.cancelAlias": "Cancelar",

  // Login
  "login.connecting": "Conectando...",
  "login.connect": "Conectar",
  "login.invalidToken": "Token inv\u00e1lido",
  "login.connectionFailed": "No se pudo conectar",
  "login.establishingConnection": "Estableciendo conexi\u00f3n segura...",
  "login.validatingToken": "Validando AUTH_TOKEN...",
  "login.tokenAccepted": "Token aceptado",
  "login.loadingDocker": "Cargando socket de Docker...",
  "login.connectionEstablished": "\u00a1Conexi\u00f3n establecida!",
  "login.errorInvalidToken": "ERROR: Token inv\u00e1lido",
  "login.errorConnectionRefused": "Conexi\u00f3n rechazada",
  "login.errorConnectionFailed": "ERROR: Conexi\u00f3n fallida",

  // Context menu — labels stay in English (match docker commands, evita confusion)
  "actions.restart": "Restart",
  "actions.stop": "Stop",
  "actions.start": "Start",
  "actions.remove": "Remove",
  "actions.rebuild": "Rebuild",
  "actions.recreate": "Recreate",
  "actions.openLogs": "Ver Logs",
  "actions.open": "Abrir",
  "actions.retry": "Retry",

  // Action tooltips (hover descriptions)
  "actions.start.tooltip": "Inicia el contenedor (docker start)",
  "actions.stop.tooltip": "Detiene el contenedor con SIGTERM, luego SIGKILL tras el timeout (docker stop)",
  "actions.restart.tooltip": "Detiene y vuelve a iniciar el mismo contenedor (docker restart). Mantiene imagen y configuración.",
  "actions.rebuild.tooltip": "Reconstruye la imagen desde el Dockerfile y crea un contenedor nuevo (docker compose up --build). Para aplicar cambios de código.",
  "actions.recreate.tooltip": "Recrea el contenedor con la config actual del compose, reusando la imagen existente (docker compose up --force-recreate). Para aplicar cambios de compose sin rebuild.",
  "actions.remove.tooltip": "Detiene y elimina el contenedor permanentemente (docker rm). Para servicios compose, también limpia networks asociadas.",
  "actions.retry.tooltip": "Reintenta arrancar un contenedor que crasheó",

  // Action error toast
  "toast.actionFailed": "Error en {action}",
  "toast.dismiss": "Descartar",
  "toast.dismissAll": "Descartar todos",
  "toast.copy": "Copiar",
  "toast.copied": "Copiado",
  "toast.expand": "Ver más",
  "toast.collapse": "Ver menos",

  // Access control (ALLOWED_PATHS)
  "access.viewOnly": "Solo lectura",
  "access.restricted": "Fuera de ALLOWED_PATHS — acciones deshabilitadas",

  // Edge legend
  "legend.connections": "Conexiones",

  // Service node
  "node.noTag": "Sin Tag",
  "node.cpu": "CPU",
  "node.mem": "MEM",

  // Detail panel
  "detail.processing": "Procesando...",
  "detail.logs": "Logs",
  "detail.info": "Info",
  "detail.stats": "Stats",
  "detail.env": "Env",
  "detail.config": "Config",
  "detail.exec": "Exec",
  "detail.collapse": "Colapsar",
  "detail.expand": "Expandir",
  "detail.close": "Cerrar",
  "detail.cancel": "Cancelar",
  "detail.loadingLogs": "Cargando logs...",
  "detail.noLogs": "No hay logs disponibles",
  "detail.linesHidden": "l\u00edneas ocultas",
  "detail.streaming": "en vivo",

  // Detail panel - Info tab
  "detail.status": "Estado",
  "detail.image": "Imagen",
  "detail.container": "Contenedor",
  "detail.project": "Proyecto",
  "detail.compose": "Compose",
  "detail.envFile": "Env File",
  "detail.envFileAutoDetect": "Auto (detectar)",
  "detail.envFileAuto": "Auto",
  "detail.envFileTip": "Solo se detectan archivos que comienzan con .env",
  "detail.ports": "Puertos",
  "detail.networks": "Redes",
  "detail.connectedTo": "Conectado a",

  // Detail panel - Config tab
  "detail.restartPolicy": "Pol\u00edtica de Reinicio",
  "detail.resourceLimits": "L\u00edmites de Recursos",
  "detail.memoryLimit": "L\u00edmite de Memoria",
  "detail.cpuQuota": "Cuota de CPU",
  "detail.unlimited": "Sin l\u00edmite",
  "detail.threshold": "Umbral",
  "detail.thresholdTooltip": "Umbral de alerta \u2014 env\u00eda una notificaci\u00f3n a Discord cuando se supera",
  "detail.memBreakdown": "Desglose de memoria",
  "detail.memAnon": "Anon (memoria de procesos)",
  "detail.memCache": "Page cache (liberable)",
  "detail.memTotal": "Total reservado (incl. cache)",
  "detail.memLimit": "L\u00edmite",
  "detail.memTooltipHint": "ContainerFlow muestra uso real (anon). El cache es liberable por el kernel bajo presi\u00f3n \u2014 misma l\u00f3gica que `docker stats` CLI.",
  "detail.limit": "L\u00edmite",
  "detail.limitTooltip": "Recurso m\u00e1ximo asignado a este contenedor en Docker",
  "detail.avg": "Prom",
  "detail.healthCheck": "Health Check",
  "detail.healthNotConfigured": "No configurado",
  "detail.recentChecks": "Chequeos recientes",

  // Detail panel - Env tab
  "detail.variables": "variables",
  "detail.copyAll": "Copiar todo",
  "detail.copied": "\u00a1Copiado!",
  "detail.hideAll": "Ocultar todo",
  "detail.showAll": "Mostrar todo",
  "detail.noEnvVars": "No hay variables de entorno disponibles",

  // Detail panel - Stats tab
  "detail.cpuUsage": "Uso de CPU",
  "detail.memoryUsage": "Uso de Memoria",
  "detail.memory": "Memoria",
  "detail.noStats": "No hay estad\u00edsticas disponibles",
  "detail.cpuHistory": "Historial de Consumo",
  "detail.mounts": "Volúmenes y Mounts",
  "detail.memoryHistory": "Historial de Memoria",
  "detail.noHistory": "No hay datos hist\u00f3ricos disponibles",
  "detail.loadingHistory": "Cargando historial...",

  // Detail panel - Warning banners
  "detail.noMemoryLimit": "Sin l\u00edmite de memoria configurado en Docker",
  "detail.noCpuLimit": "Sin l\u00edmite de CPU configurado en Docker",
  "detail.weakRestartPolicy": "Restart policy: none \u2014 el contenedor no se reiniciar\u00e1 autom\u00e1ticamente si se detiene",

  // Detail panel - Notification settings
  "detail.notifications": "Notificaciones",
  "detail.notificationsEnabled": "Habilitadas",
  "detail.cpuThreshold": "Umbral de CPU",
  "detail.memThreshold": "Umbral de memoria",
  "detail.global": "(global)",
  "detail.custom": "(personalizado)",
  "detail.saveSettings": "Guardar",
  "detail.settingsSaved": "Guardado",
  "detail.savingSettings": "Guardando...",
  "detail.thresholdHint": "Arrastra la l\u00ednea para configurar el umbral de alerta",

  // Detail panel - Actions / Confirmations
  "detail.actionSuccess": "exitoso",
  "detail.actionFailed": "Error al",
  "detail.confirmStop": "\u00bfDetener este contenedor? Esto interrumpir\u00e1 el servicio.",
  "detail.confirmRestart": "\u00bfReiniciar este contenedor? Esto interrumpir\u00e1 brevemente el servicio.",
  "detail.confirmRemove": "\u00bfEliminar este contenedor? Esto lo detendr\u00e1 y eliminar\u00e1.",
  "detail.confirmRebuild": "\u00bfReconstruir este contenedor? Esto reconstruir\u00e1 la imagen y recrear\u00e1 el contenedor.",
  "detail.confirmRecreate": "\u00bfRecrear este contenedor? Reusa la imagen existente y aplica la config actual del compose.",

  // Detail panel - Crash
  "detail.containerCrashed": "Contenedor crash\u00f3",
  "detail.exitCode": "C\u00f3digo de salida",
  "detail.oomKilled": "OOM Killed",
  "detail.restarted": "Reiniciado",
  "detail.times": "veces",
  "detail.checkLogs": "Revisa los logs abajo para m\u00e1s detalles",

  // Detail panel - Exec
  "detail.execPlaceholder": "ej. python manage.py migrate",
  "detail.run": "Ejecutar",
  "detail.exitCodeLabel": "C\u00f3digo de salida",
  "detail.noOutput": "(sin salida)",

  // Log panel
  "logPanel.streaming": "en vivo",
  "logPanel.loadingLogs": "Cargando logs...",
  "logPanel.noLogs": "No hay logs disponibles",

  // Monitoring page
  "monitoring.title": "Monitoreo",
  "monitoring.titleTooltip": "Historial de consumo (CPU/RAM), eventos y notificaciones de tus containers.",
  "monitoring.subtitle": "Eventos de contenedores Docker en tiempo real",
  "monitoring.noEvents": "Sin eventos a\u00fan. Los eventos aparecer\u00e1n aqu\u00ed cuando los contenedores inicien, se detengan o reinicien.",
  "monitoring.alertRules": "Reglas de Alerta",
  "monitoring.alertRulesDesc": "Configurar reglas de alerta para eventos de contenedores \u2014 pr\u00f3ximamente",
  "monitoring.statsHistory": "Historial de Uso de Recursos",
  "monitoring.totals": "Totales (todos los containers filtrados)",
  "monitoring.totalCpu": "CPU (T)",
  "monitoring.totalMem": "MEM (T)",
  "monitoring.clearFilters": "Limpiar filtros",
  "monitoring.tabHistory": "Historial",
  "monitoring.tabEvents": "Eventos",
  "monitoring.tabNotifications": "Notificaciones",
  "monitoring.noNotifications": "Sin notificaciones todavía. Aparecerán aquí cuando los containers cambien de estado, superen umbrales de recursos o ejecutes acciones (espejo de Discord).",
  "monitoring.loadingHistory": "Cargando datos hist\u00f3ricos...",
  "monitoring.noHistoryData": "No hay datos hist\u00f3ricos disponibles a\u00fan",
  "monitoring.selectFilter": "Selecciona un servicio o carga todos para ver el historial",
  "monitoring.loadAll": "Cargar todos",
  "monitoring.allServices": "Todos los servicios",
  "monitoring.allProjects": "Todos los proyectos",
  "monitoring.filterService": "Filtrar por servicio",
  "monitoring.filterProject": "Filtrar por proyecto",

  // Settings page
  "settings.title": "Configuraci\u00f3n",
  "settings.subtitle": "Configuraci\u00f3n de la aplicaci\u00f3n",
  "settings.general": "General",
  "settings.version": "Versi\u00f3n",
  "settings.mode": "Modo",
  "settings.singleHost": "Host \u00danico",
  "settings.projects": "Proyectos",
  "settings.containers": "Contenedores",
  "settings.dockerHosts": "Hosts de Docker",
  "settings.dockerHostsDesc": "Gesti\u00f3n multi-host \u2014 pr\u00f3ximamente",
  "settings.dockerHostsDetail": "Conecta a daemons de Docker remotos y gestiona m\u00faltiples hosts desde un solo dashboard.",
  "settings.discord": "Notificaciones de Discord",
  "settings.webhookUrl": "URL del Webhook",
  "settings.sending": "Enviando...",
  "settings.test": "Probar",
  "settings.webhookSuccess": "\u00a1Webhook enviado exitosamente!",
  "settings.events": "Eventos",
  "settings.containerStateChanges": "Cambios de estado de contenedores",
  "settings.containerStateChangesTooltip": "Notifica cuando Docker detecta cambios de estado autom\u00e1ticos: inicio, parada, muerte, reinicio o cambios de salud (crashes, OOM, pol\u00edticas de reinicio).",
  "settings.resourceAlerts": "Alertas de recursos",
  "settings.resourceAlertsTooltip": "Monitorea el uso de CPU y memoria cada 5 segundos. Env\u00eda una alerta cuando un contenedor excede los umbrales configurados.",
  "settings.uiActions": "Acciones de UI",
  "settings.uiActionsTooltip": "Notifica cuando alguien realiza una acci\u00f3n manual desde la UI de ContainerFlow: detener, iniciar, reiniciar o reconstruir.",
  "settings.actionErrors": "Errores de acciones",
  "settings.actionErrorsTooltip": "Notifica cuando una acci\u00f3n falla, como un rebuild que termina con error. Incluye los detalles del error en el mensaje.",
  "settings.resourceThresholds": "Umbrales de Recursos",
  "settings.resourceThresholdsTooltip": "Configura el porcentaje en el que el uso de CPU o memoria dispara una alerta de Discord. Se revisa cada 5 segundos durante el polling de estad\u00edsticas.",
  "settings.cpu": "CPU",
  "settings.memory": "Memoria",
  "settings.cooldown": "Cooldown (minutos)",
  "settings.cooldownTooltip": "Tiempo m\u00ednimo entre notificaciones duplicadas para el mismo contenedor y tipo de evento. Aplica a cambios de estado, alertas de recursos y acciones de UI.",
  "settings.downReminder": "Recordatorio de servicio ca\u00eddo (minutos)",
  "settings.downReminderTooltip": "Cada cu\u00e1nto reenviar una notificaci\u00f3n mientras un contenedor siga ca\u00eddo. Seguir\u00e1s recibiendo alertas en este intervalo hasta que el servicio se recupere.",
  "settings.saving": "Guardando...",
  "settings.saved": "Guardado",
  "settings.save": "Guardar",
  "settings.configSaved": "Configuraci\u00f3n guardada",
  "settings.requestFailed": "Error en la solicitud",
};

export type Lang = "en" | "es";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const dictionaries = { en, es } as const;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("df:lang");
      if (saved === "es" || saved === "en") return saved;
    } catch {}
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("df:lang", l); } catch {}
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return dictionaries[lang][key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
