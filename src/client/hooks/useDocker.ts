import { useState, useEffect, useRef, useCallback } from "react";
import type { Service, Connection, Stats, DockerEvent, LogLine, WSMessage, GraphDiff, ActionError, EventLogEntry, NotificationLogEntry } from "../../shared/types";
import type { StatsStore } from "./useStatsStore";
import { arraysEqual, applyProcessing as applyProcessingPure } from "./processing";

function connKey(c: Connection): string {
  return `${c.from}|${c.to}|${c.network}`;
}

function applyServicesDiff(current: Service[], diff: GraphDiff): Service[] {
  let result = [...current];
  if (diff.servicesRemoved?.length) {
    const removed = new Set(diff.servicesRemoved);
    result = result.filter((s) => !removed.has(s.uid));
  }
  if (diff.servicesUpdated?.length) {
    const updated = new Map(diff.servicesUpdated.map((s) => [s.uid, s]));
    result = result.map((s) => updated.get(s.uid) ?? s);
  }
  if (diff.servicesAdded?.length) {
    const existing = new Set(result.map((s) => s.uid));
    for (const s of diff.servicesAdded) {
      if (!existing.has(s.uid)) result.push(s);
    }
  }
  return result;
}

function applyConnectionsDiff(current: Connection[], diff: GraphDiff): Connection[] {
  let result = [...current];
  if (diff.connectionsRemoved?.length) {
    const removed = new Set(diff.connectionsRemoved);
    result = result.filter((c) => !removed.has(connKey(c)));
  }
  if (diff.connectionsAdded?.length) {
    const existing = new Set(result.map(connKey));
    for (const c of diff.connectionsAdded) {
      if (!existing.has(connKey(c))) result.push(c);
    }
  }
  return result;
}

export function useDocker(token = "", statsStore?: StatsStore, onPositions?: (pos: Record<string, { x: number; y: number }>) => void) {
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const statsRef = useRef<Map<string, Stats>>(new Map());
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [actionErrors, setActionErrors] = useState<ActionError[]>([]);
  const [eventLogStream, setEventLogStream] = useState<EventLogEntry[]>([]);
  const [notificationStream, setNotificationStream] = useState<NotificationLogEntry[]>([]);
  // Processing state: uid → { expected state, start time, min duration before clearing }
  const processingRef = useRef<Map<string, { expected: Service["state"]; startedAt: number; minDuration: number }>>(new Map());
  const processingIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const lastRawServicesRef = useRef<Service[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Apply processing overlay to raw services data
  const applyProcessing = useCallback((raw: Service[]): Service[] => {
    return applyProcessingPure(raw, processingRef.current);
  }, []);

  // Single init call: services + connections + positions
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch("/api/init", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setServices((prev) => prev.length === 0 ? data.services : prev);
        setConnections((prev) => prev.length === 0 ? data.connections : prev);
        if (onPositions) onPositions(data.positions || {});
        // Hydrate stats immediately so charts/cards don't wait for next WS poll
        if (Array.isArray(data.stats) && data.stats.length > 0) {
          for (const s of data.stats as Stats[]) statsRef.current.set(s.service, s);
          if (statsStore) statsStore.update(statsRef.current);
        }
      })
      .catch(() => {});
  }, [token]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      } else {
        setConnected(true);
      }
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3_000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "auth_ok") {
          setConnected(true);
          return;
        }
        if (msg.type === "auth_error") {
          ws.close();
          return;
        }

        switch (msg.type as WSMessage["type"]) {
          case "snapshot": {
            lastRawServicesRef.current = msg.data.services as Service[];
            const incoming = applyProcessing(msg.data.services as Service[]);
            setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
            setConnections(msg.data.connections as Connection[]);
            break;
          }
          case "diff": {
            const diff = msg.data as GraphDiff;
            const nextRaw = applyServicesDiff(lastRawServicesRef.current, diff);
            lastRawServicesRef.current = nextRaw;
            const incoming = applyProcessing(nextRaw);
            setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
            if (diff.connectionsAdded?.length || diff.connectionsRemoved?.length) {
              setConnections((prev) => applyConnectionsDiff(prev, diff));
            }
            break;
          }
          case "stats": {
            for (const s of msg.data) {
              statsRef.current.set(s.service, s);
            }
            if (statsStore) {
              statsStore.update(statsRef.current);
            }
            break;
          }
          case "docker_event":
            setEvents((prev) => {
              if (prev.length >= 10) return [...prev.slice(-9), msg.data];
              return [...prev, msg.data];
            });
            break;
          case "log_line":
            setLogLines((prev) => {
              const next = [...prev, msg.data];
              return next.length > 2000 ? next.slice(-1500) : next;
            });
            break;
          case "action_error": {
            processingRef.current.delete(msg.data.uid);
            const clearInterval_ = processingIntervalsRef.current.get(msg.data.uid);
            if (clearInterval_) { clearInterval(clearInterval_); processingIntervalsRef.current.delete(msg.data.uid); }
            const raw = lastRawServicesRef.current;
            if (raw.length > 0) {
              const incoming = applyProcessing(raw);
              setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
            } else {
              setServices((prev) => prev.map((s) => s.uid === msg.data.uid ? { ...s, state: "exited" as any } : s));
            }
            const errorId = `${msg.data.uid}:${msg.data.action}:${Date.now()}`;
            setActionErrors((prev) => [
              ...prev.slice(-4), // keep at most 5 errors
              { id: errorId, uid: msg.data.uid, action: msg.data.action, error: msg.data.error, timestamp: Date.now() },
            ]);
            break;
          }
          case "event_log":
            setEventLogStream((prev) => [msg.data, ...prev].slice(0, 50));
            break;
          case "notification_log":
            setNotificationStream((prev) => [msg.data, ...prev].slice(0, 50));
            break;
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };
  }, [token]);

  useEffect(() => {
    connect();

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(reconnectTimer.current);
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
        }
        setConnected(false);
      } else if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      // Clean up all processing intervals
      for (const interval of processingIntervalsRef.current.values()) {
        clearInterval(interval);
      }
      processingIntervalsRef.current.clear();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearLogLines = useCallback(() => setLogLines([]), []);

  const actionTimestamps = useRef<Map<string, number>>(new Map());

  const setProcessing = useCallback((uid: string, expectedState: Service["state"], minDuration = 0) => {
    const startedAt = Date.now();
    processingRef.current.set(uid, { expected: expectedState, startedAt, minDuration });
    actionTimestamps.current.set(uid, Math.floor(startedAt / 1000));
    setServices((prev) => prev.map((s) => s.uid === uid ? { ...s, state: "processing" as any, _processingStartedAt: startedAt } as any : s));
    // Clear any existing interval for this uid (e.g. rapid re-clicks)
    const prevInterval = processingIntervalsRef.current.get(uid);
    if (prevInterval) clearInterval(prevInterval);

    // Re-evaluate every 1s until processing clears.
    // Always create interval — even for minDuration=0 — so the 15s timeout safety net works
    // when the server stops broadcasting (hash unchanged).
    const interval = setInterval(() => {
      if (!processingRef.current.has(uid)) {
        clearInterval(interval);
        processingIntervalsRef.current.delete(uid);
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < minDuration) return;
      const raw = lastRawServicesRef.current;
      if (raw.length === 0) return;
      const incoming = applyProcessing(raw);
      setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
      if (!processingRef.current.has(uid)) {
        clearInterval(interval);
        processingIntervalsRef.current.delete(uid);
      }
    }, 1000);
    processingIntervalsRef.current.set(uid, interval);
  }, [applyProcessing]);

  const clearProcessing = useCallback((uid: string) => {
    processingRef.current.delete(uid);
    const interval = processingIntervalsRef.current.get(uid);
    if (interval) { clearInterval(interval); processingIntervalsRef.current.delete(uid); }
    const raw = lastRawServicesRef.current;
    if (raw.length > 0) {
      const incoming = applyProcessing(raw);
      setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
    }
  }, [applyProcessing]);

  const getLogsSince = useCallback((uid: string): number | undefined => {
    return actionTimestamps.current.get(uid);
  }, []);

  const dismissActionError = useCallback((id: string) => {
    setActionErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearActionErrors = useCallback(() => setActionErrors([]), []);

  const pushActionError = useCallback((uid: string, action: string, error: string) => {
    const errorId = `${uid}:${action}:${Date.now()}`;
    setActionErrors((prev) => [
      ...prev.slice(-4),
      { id: errorId, uid, action, error, timestamp: Date.now() },
    ]);
  }, []);

  return { services, connections, stats: statsRef.current, events, connected, logLines, sendMessage, clearLogLines, setProcessing, clearProcessing, getLogsSince, actionErrors, dismissActionError, clearActionErrors, pushActionError, eventLogStream, notificationStream };
}
