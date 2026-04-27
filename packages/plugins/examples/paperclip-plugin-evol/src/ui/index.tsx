import type { CSSProperties } from "react";
import { useHostContext, usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

const t = {
  bg: "var(--color-surface, var(--slate-2, #f9f9fb))",
  border: "var(--slate-6, #d9d9e0)",
  text: "var(--slate-12, #1c2024)",
  textSecondary: "var(--slate-11, #60646c)",
  textMuted: "var(--slate-9, #8b8d98)",
  accentBg: "var(--green-3, #f0fdf4)",
  accentBorder: "var(--green-9, #16a34a)",
  accentText: "var(--green-11, #15803d)",
  warnBg: "var(--amber-3, #fffbeb)",
  warnBorder: "var(--amber-9, #d97706)",
  warnText: "var(--amber-11, #b45309)",
};

// ---------------------------------------------------------------------------
// EvolPendingWidget — dashboardWidget slot
// ---------------------------------------------------------------------------

export function EvolPendingWidget({ context }: PluginWidgetProps) {
  const { companyId } = context;
  const { data, loading, error } = usePluginData<{ count: number }>("pending-count", {
    companyId: companyId ?? "",
  });

  const count = data?.count ?? 0;
  const hasCount = !loading && !error;

  const containerStyle: CSSProperties = {
    padding: "12px 14px",
    borderRadius: "6px",
    border: `1px solid ${count > 0 ? t.warnBorder : t.border}`,
    background: count > 0 ? t.warnBg : t.bg,
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: "160px",
  };

  const countStyle: CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: 1,
    color: count > 0 ? t.warnText : t.accentText,
  };

  const labelStyle: CSSProperties = {
    fontSize: "12px",
    color: count > 0 ? t.warnText : t.textSecondary,
    lineHeight: 1.4,
  };

  if (loading) {
    return (
      <div style={{ ...containerStyle, color: t.textMuted, fontSize: "13px" }}>
        Cargando…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, color: t.textMuted, fontSize: "12px" }}>
        Error al cargar
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={countStyle}>{hasCount ? count : "—"}</div>
      <div>
        <div style={labelStyle}>
          {count === 1 ? "review EVOL pendiente" : "reviews EVOL pendientes"}
        </div>
        <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "2px" }}>
          runs sin revisar
        </div>
      </div>
    </div>
  );
}
