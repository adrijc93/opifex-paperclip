import { useState, type CSSProperties } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import type { Briefing, BriefingType } from "../worker.js";

// ---------------------------------------------------------------------------
// Theme-aware colors using CSS variables from Paperclip host (Radix)
// These adapt automatically to dark/light mode
// ---------------------------------------------------------------------------

const t = {
  bg: "var(--color-background, var(--slate-1, #fcfcfd))",
  bgCard: "var(--color-surface, var(--slate-2, #f9f9fb))",
  bgHover: "var(--slate-3, #f0f0f3)",
  border: "var(--slate-6, #d9d9e0)",
  borderSubtle: "var(--slate-4, #e8e8ec)",
  text: "var(--slate-12, #1c2024)",
  textSecondary: "var(--slate-11, #60646c)",
  textMuted: "var(--slate-9, #8b8d98)",
  inputBg: "var(--slate-2, #f9f9fb)",
  inputBorder: "var(--slate-6, #d9d9e0)",
  errorBg: "var(--red-3, #fef2f2)",
  errorBorder: "var(--red-6, #fca5a5)",
  errorText: "var(--red-11, #dc2626)",
  accentBg: "var(--blue-3, #eff6ff)",
  accentBorder: "var(--blue-9, #3b82f6)",
  accentText: "var(--blue-11, #0d74ce)",
  tagBg: "var(--slate-3, #f3f4f6)",
};

const COLORS: Record<BriefingType, string> = {
  daily: "var(--blue-9, #3b82f6)",
  weekly: "var(--violet-9, #8b5cf6)",
  sprint: "var(--green-9, #10b981)",
};

const LABELS: Record<BriefingType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  sprint: "Sprint",
};

// ---------------------------------------------------------------------------
// BriefingCard
// ---------------------------------------------------------------------------

function BriefingCard({
  briefing,
  expanded,
  onToggle,
}: {
  briefing: Briefing;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = COLORS[briefing.type];
  const dateLabel = new Date(briefing.createdAt).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cardStyle: CSSProperties = {
    border: `1px solid ${t.border}`,
    borderLeft: `4px solid ${color}`,
    borderRadius: "6px",
    padding: "12px 16px",
    background: t.bgCard,
    cursor: "pointer",
    marginBottom: "10px",
    transition: "background 0.15s",
  };

  const badgeStyle: CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#fff",
    background: color,
    marginRight: "8px",
  };

  return (
    <div style={cardStyle} onClick={onToggle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={badgeStyle}>{LABELS[briefing.type]}</span>
          <strong style={{ fontSize: "14px", color: t.text }}>{briefing.title}</strong>
        </div>
        <span style={{ fontSize: "12px", color: t.textMuted }}>{dateLabel}</span>
      </div>

      {briefing.authorAgentName && (
        <div style={{ fontSize: "12px", color: t.textMuted, marginTop: "4px" }}>
          por {briefing.authorAgentName}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: "12px", borderTop: `1px solid ${t.borderSubtle}`, paddingTop: "12px" }}>
          <div
            style={{
              fontSize: "13px",
              color: t.textSecondary,
              whiteSpace: "pre-wrap",
              lineHeight: "1.6",
            }}
          >
            {briefing.summary}
          </div>

          {briefing.actionItems.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <strong style={{ fontSize: "12px", color: t.textMuted, textTransform: "uppercase" }}>
                Acciones
              </strong>
              <ul style={{ margin: "6px 0 0 0", paddingLeft: "18px" }}>
                {briefing.actionItems.map((item, i) => (
                  <li key={i} style={{ fontSize: "13px", color: t.textSecondary, marginBottom: "2px" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {briefing.linkedIssueIds.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <strong style={{ fontSize: "12px", color: t.textMuted, textTransform: "uppercase" }}>
                Issues
              </strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                {briefing.linkedIssueIds.map((id) => (
                  <span
                    key={id}
                    style={{
                      fontSize: "11px",
                      background: t.tagBg,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      color: t.textSecondary,
                      fontFamily: "monospace",
                    }}
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateBriefingForm
// ---------------------------------------------------------------------------

function CreateBriefingForm({ onClose }: { onClose: () => void }) {
  const createBriefing = usePluginAction("createBriefing");
  const { companyId } = useHostContext();
  const [type, setType] = useState<BriefingType>("daily");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [actionItemsText, setActionItemsText] = useState("");
  const [linkedIssuesText, setLinkedIssuesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      setError("Título y resumen son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const actionItems = actionItemsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const linkedIssueIds = linkedIssuesText
        .split(/[\n,\s]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      await createBriefing({ type, title: title.trim(), summary: summary.trim(), actionItems, linkedIssueIds, companyId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear briefing");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${t.inputBorder}`,
    borderRadius: "5px",
    fontSize: "13px",
    boxSizing: "border-box",
    background: t.inputBg,
    color: t.text,
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: t.textSecondary,
    marginBottom: "4px",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{
          background: t.bgCard,
          borderRadius: "8px",
          padding: "24px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          border: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px", color: t.text }}>Nuevo Briefing</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: t.textMuted,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BriefingType)}
              style={inputStyle}
            >
              <option value="daily">Daily Briefing</option>
              <option value="weekly">Weekly Review</option>
              <option value="sprint">Sprint Planning</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Daily 2026-04-08"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Resumen</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Estado, bloqueos, decisiones..."
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Acciones (una por línea)</label>
            <textarea
              value={actionItemsText}
              onChange={(e) => setActionItemsText(e.target.value)}
              placeholder={"- Revisar PR #123\n- Desplegar a staging"}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Issues relacionadas (IDs separados por coma o línea)</label>
            <input
              type="text"
              value={linkedIssuesText}
              onChange={(e) => setLinkedIssuesText(e.target.value)}
              placeholder="SEC-100, SEC-101"
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: "12px",
              padding: "8px 12px",
              background: t.errorBg,
              border: `1px solid ${t.errorBorder}`,
              borderRadius: "5px",
              fontSize: "13px",
              color: t.errorText,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              border: `1px solid ${t.border}`,
              borderRadius: "5px",
              background: t.bgCard,
              color: t.text,
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "5px",
              background: "var(--blue-9, #3b82f6)",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {saving ? "Guardando..." : "Crear Briefing"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BriefingsPage (main UI slot)
// ---------------------------------------------------------------------------

export function BriefingsPage(_props: PluginPageProps) {
  const [filter, setFilter] = useState<BriefingType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const params = filter !== "all" ? { type: filter } : {};
  const { data: briefings, loading, error, refresh } = usePluginData<Briefing[]>(
    "listBriefings",
    params
  );

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleFormClose = () => {
    setShowForm(false);
    refresh();
  };

  const filterBtnStyle = (active: boolean): CSSProperties => ({
    padding: "6px 14px",
    border: "1px solid",
    borderColor: active ? "var(--blue-9, #3b82f6)" : t.border,
    borderRadius: "999px",
    background: active ? t.accentBg : t.bgCard,
    color: active ? t.accentText : t.textMuted,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    fontSize: "13px",
  });

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "760px",
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
        color: t.text,
      }}
    >
      {showForm && <CreateBriefingForm onClose={handleFormClose} />}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: t.text }}>Reuniones</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: "6px",
            background: "var(--blue-9, #3b82f6)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          + Nuevo Briefing
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {(["all", "daily", "weekly", "sprint"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={filterBtnStyle(filter === f)}
          >
            {f === "all" ? "Todos" : LABELS[f]}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ color: t.textMuted, fontSize: "14px", padding: "24px 0", textAlign: "center" }}>
          Cargando briefings...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: t.errorBg,
            border: `1px solid ${t.errorBorder}`,
            borderRadius: "6px",
            color: t.errorText,
            fontSize: "13px",
          }}
        >
          Error: {error.message}
        </div>
      )}

      {!loading && !error && (!briefings || briefings.length === 0) && (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: t.textMuted,
            border: `1px dashed ${t.border}`,
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📋</div>
          <div style={{ fontSize: "14px" }}>
            Todavía no hay briefings.
            <br />
            APEX los crea automáticamente o puedes crear uno manualmente.
          </div>
        </div>
      )}

      {briefings?.map((b) => (
        <BriefingCard
          key={b.id}
          briefing={b}
          expanded={expandedId === b.id}
          onToggle={() => handleToggle(b.id)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BriefingsSidebar
// ---------------------------------------------------------------------------

export function BriefingsSidebar(_props: PluginSidebarProps) {
  const { data: briefings } = usePluginData<Briefing[]>("listBriefings", {});
  const count = briefings?.length ?? 0;
  const latest = briefings?.[0];

  return (
    <div
      style={{
        padding: "8px 12px",
        fontSize: "13px",
        fontFamily: "system-ui, sans-serif",
        color: t.text,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "4px" }}>Reuniones</div>
      {count === 0 ? (
        <div style={{ color: t.textMuted }}>Sin briefings aún</div>
      ) : (
        <>
          <div style={{ color: t.textSecondary }}>{count} briefing{count !== 1 ? "s" : ""}</div>
          {latest && (
            <div
              style={{
                marginTop: "4px",
                fontSize: "11px",
                color: t.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Último: {latest.title}
            </div>
          )}
        </>
      )}
    </div>
  );
}
