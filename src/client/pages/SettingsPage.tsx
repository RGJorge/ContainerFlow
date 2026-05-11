import { useState, useEffect, useCallback } from "react";
import { Settings, Server, Bell, Info, Send, Save, Check, X } from "lucide-react";
import type { DiscordConfig } from "../../shared/types";
import { useT } from "../i18n";
import { Tooltip } from "../components/Tooltip";

interface SettingsPageProps {
  projects: string[];
  servicesCount: number;
  token: string;
}

const DEFAULT_CONFIG: DiscordConfig = {
  enabled: false,
  webhookUrl: "",
  events: {
    containerStateChanges: true,
    resourceAlerts: true,
    uiActions: true,
    actionErrors: true,
  },
  thresholds: {
    cpuPercent: 50,
    memPercent: 60,
  },
  cooldownMinutes: 5,
  downReminderMinutes: 5,
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-cyan-500" : "bg-slate-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? "translate-x-4.5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SettingsPage({ projects, servicesCount, token }: SettingsPageProps) {
  const { t } = useT();
  const [config, setConfig] = useState<DiscordConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  useEffect(() => {
    fetch("/api/discord-config", { headers: headers() })
      .then((r) => r.ok ? r.json() : DEFAULT_CONFIG)
      .then((data: DiscordConfig) => {
        setConfig({ ...DEFAULT_CONFIG, ...data, events: { ...DEFAULT_CONFIG.events, ...data.events }, thresholds: { ...DEFAULT_CONFIG.thresholds, ...data.thresholds } });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [headers]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/discord-config", { method: "PUT", headers: headers(), body: JSON.stringify(config) });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {}
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/discord-config/test", { method: "POST", headers: headers(), body: JSON.stringify({ webhookUrl: config.webhookUrl }) });
      const result = await res.json();
      setTestResult(result);
      setTimeout(() => setTestResult(null), 5000);
    } catch {
      setTestResult({ ok: false, error: t("settings.requestFailed") });
    }
    setTesting(false);
  };

  const updateEvents = (key: keyof DiscordConfig["events"], value: boolean) => {
    setConfig((prev) => ({ ...prev, events: { ...prev.events, [key]: value } }));
  };

  const updateThresholds = (key: keyof DiscordConfig["thresholds"], value: number) => {
    setConfig((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: value } }));
  };

  return (
    <div className="flex-1 min-h-0 mx-2 mt-1 mb-1 rounded-xl overflow-auto ring-1 ring-slate-700/60 p-6">
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Settings size={24} className="text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold text-white">{t("settings.title")}</h1>
            <p className="text-sm text-slate-500">{t("settings.subtitle")}</p>
          </div>
        </div>

        {/* General */}
        <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Info size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{t("settings.general")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">{t("settings.version")}</span>
              <span className="text-slate-200 font-mono">v{__APP_VERSION__}</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">{t("settings.mode")}</span>
              <span className="text-slate-200 font-mono">{t("settings.singleHost")}</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">{t("settings.projects")}</span>
              <span className="text-slate-200 font-mono">{projects.length}</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">{t("settings.containers")}</span>
              <span className="text-slate-200 font-mono">{servicesCount}</span>
            </div>
          </div>
        </section>

        {/* Docker Hosts */}
        <section className="bg-slate-800/30 border border-dashed border-slate-700/60 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t("settings.dockerHosts")}</h2>
          </div>
          <p className="text-sm text-slate-500">{t("settings.dockerHostsDesc")}</p>
          <p className="text-xs text-slate-600 mt-1">{t("settings.dockerHostsDetail")}</p>
        </section>

        {/* Discord Notifications */}
        <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{t("settings.discord")}</h2>
            </div>
            <Toggle checked={config.enabled} onChange={(v) => setConfig((prev) => ({ ...prev, enabled: v }))} />
          </div>

          {loaded && (
            <div className={config.enabled ? "" : "opacity-50 pointer-events-none"}>
              {/* Webhook URL */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 block mb-1.5">{t("settings.webhookUrl")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.webhookUrl}
                    onChange={(e) => setConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="flex-1 bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                  />
                  <button
                    onClick={handleTest}
                    disabled={testing || !config.webhookUrl}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={14} />
                    {testing ? t("settings.sending") : t("settings.test")}
                  </button>
                </div>
                {testResult && (
                  <div className={`flex items-center gap-1.5 mt-2 text-xs ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {testResult.ok ? <Check size={12} /> : <X size={12} />}
                    {testResult.ok ? t("settings.webhookSuccess") : testResult.error}
                  </div>
                )}
              </div>

              {/* Event Toggles */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 block mb-2">{t("settings.events")}</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-slate-300 flex items-center gap-1.5">
                      {t("settings.containerStateChanges")}
                      <Tooltip text={t("settings.containerStateChangesTooltip")} />
                    </span>
                    <Toggle checked={config.events.containerStateChanges} onChange={(v) => updateEvents("containerStateChanges", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-slate-300 flex items-center gap-1.5">
                      {t("settings.resourceAlerts")}
                      <Tooltip text={t("settings.resourceAlertsTooltip")} />
                    </span>
                    <Toggle checked={config.events.resourceAlerts} onChange={(v) => updateEvents("resourceAlerts", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-slate-300 flex items-center gap-1.5">
                      {t("settings.uiActions")}
                      <Tooltip text={t("settings.uiActionsTooltip")} />
                    </span>
                    <Toggle checked={config.events.uiActions} onChange={(v) => updateEvents("uiActions", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-slate-300 flex items-center gap-1.5">
                      {t("settings.actionErrors")}
                      <Tooltip text={t("settings.actionErrorsTooltip")} />
                    </span>
                    <Toggle checked={config.events.actionErrors} onChange={(v) => updateEvents("actionErrors", v)} />
                  </div>
                </div>
              </div>

              {/* Thresholds (only visible when resourceAlerts is on) */}
              {config.events.resourceAlerts && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
                    {t("settings.resourceThresholds")}
                    <Tooltip text={t("settings.resourceThresholdsTooltip")} />
                  </label>
                  <div className="space-y-3">
                    <div className="bg-slate-900/50 rounded-lg px-3 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-300">{t("settings.cpu")}</span>
                        <span className="text-sm text-cyan-400 font-mono">{config.thresholds.cpuPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={config.thresholds.cpuPercent}
                        onChange={(e) => updateThresholds("cpuPercent", parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                    <div className="bg-slate-900/50 rounded-lg px-3 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-300">{t("settings.memory")}</span>
                        <span className="text-sm text-cyan-400 font-mono">{config.thresholds.memPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={config.thresholds.memPercent}
                        onChange={(e) => updateThresholds("memPercent", parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Cooldown + Down reminder */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-1.5">
                    {t("settings.cooldown")}
                    <Tooltip text={t("settings.cooldownTooltip")} />
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={config.cooldownMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (v >= 1 && v <= 60) setConfig((prev) => ({ ...prev, cooldownMinutes: v }));
                    }}
                    className="w-24 bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 flex items-center gap-1.5 mb-1.5">
                    {t("settings.downReminder")}
                    <Tooltip text={t("settings.downReminderTooltip")} />
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={config.downReminderMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (v >= 1 && v <= 60) setConfig((prev) => ({ ...prev, downReminderMinutes: v }));
                    }}
                    className="w-24 bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700/40">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? t("settings.saving") : saved ? t("settings.saved") : t("settings.save")}
            </button>
            {saved && <span className="text-xs text-emerald-400">{t("settings.configSaved")}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
