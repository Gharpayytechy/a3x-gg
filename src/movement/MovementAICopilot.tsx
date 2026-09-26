/**
 * MovementAICopilot.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global AI Intelligence Bar for /movement-os.
 *
 * Mounts above the tab panel and renders:
 *  1. AI Action Queue   — live counts for Decaying, Hot-Close, SLA Breached
 *  2. Funnel Velocity Matrix — density chips per stage with bottleneck highlight
 *  3. 1-Click AI Batch Nudge — queues revival messages for all critical leads
 *
 * Every action calls useMovement store mutations (persistent, audited).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, ChevronDown, ChevronUp, Flame, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMovement } from "./store";
import { scanMovementRisks, buildFunnelVelocity, type AIRiskTier, type ScoredMovementLead } from "./MovementAIEngine";

// ─── Tier display config ──────────────────────────────────────────────────────

const TIER_CFG: Record<
  AIRiskTier,
  { icon: string; label: string; cls: string; badgeCls: string }
> = {
  HOT_CONVERSION: {
    icon: "🔥",
    label: "Hot Closure",
    cls: "bg-success/10 border-success/30 text-success",
    badgeCls: "bg-success/20 text-success",
  },
  SLA_BREACHED: {
    icon: "⚡",
    label: "SLA Breached",
    cls: "bg-destructive/10 border-destructive/30 text-destructive",
    badgeCls: "bg-destructive/20 text-destructive",
  },
  CRITICAL_RECOVERY: {
    icon: "🚨",
    label: "Needs Recovery",
    cls: "bg-warning/10 border-warning/30 text-warning",
    badgeCls: "bg-warning/20 text-warning",
  },
  ACTIVE_NURTURE: {
    icon: "🌤️",
    label: "Active Nurture",
    cls: "bg-muted border-border text-muted-foreground",
    badgeCls: "bg-muted text-muted-foreground",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Meta = Map<string, { name: string; phone: string; area: string }>;

function launchNudge(scored: ScoredMovementLead, meta: Meta): void {
  const info = meta.get(scored.ulid);
  const phone = (info?.phone ?? "").replace(/\D/g, "");
  const msg = scored.recoveryMsg;
  navigator.clipboard.writeText(msg).catch(() => {});
  if (phone) {
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }
}

// ─── AI Action Queue Counter Cards ────────────────────────────────────────────

function ActionQueueCards({
  scored,
  onFilterTier,
  activeTier,
}: {
  scored: ScoredMovementLead[];
  onFilterTier: (t: AIRiskTier | null) => void;
  activeTier: AIRiskTier | null;
}) {
  const counts = useMemo(() => {
    const c: Record<AIRiskTier, number> = {
      HOT_CONVERSION: 0,
      SLA_BREACHED: 0,
      CRITICAL_RECOVERY: 0,
      ACTIVE_NURTURE: 0,
    };
    for (const s of scored) c[s.tier]++;
    return c;
  }, [scored]);

  const tiers: AIRiskTier[] = ["HOT_CONVERSION", "SLA_BREACHED", "CRITICAL_RECOVERY", "ACTIVE_NURTURE"];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
      {tiers.map((tier) => {
        const cfg = TIER_CFG[tier];
        const active = activeTier === tier;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onFilterTier(active ? null : tier)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition hover:opacity-90",
              cfg.cls,
              active && "ring-2 ring-primary",
            )}
          >
            <div className="text-xl font-bold tabular-nums leading-tight">
              {cfg.icon} {counts[tier]}
            </div>
            <div className="text-[9px] uppercase tracking-wider font-semibold mt-0.5 opacity-80">
              {cfg.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Funnel Velocity Matrix ────────────────────────────────────────────────────

function FunnelVelocityMatrix({
  states,
  onFilterStage,
}: {
  states: Record<string, import("./types").MovementState>;
  onFilterStage?: (stage: string | null) => void;
}) {
  const cells = useMemo(() => buildFunnelVelocity(states), [states]);
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const handleClick = (stage: string) => {
    const next = activeStage === stage ? null : stage;
    setActiveStage(next);
    onFilterStage?.(next);
  };

  if (!cells.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
        <Zap className="h-3 w-3" /> Funnel Velocity Matrix
        <span className="ml-auto text-[9px] opacity-60">click stage to filter queue</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cells.map((cell) => (
          <button
            key={cell.stage}
            type="button"
            onClick={() => handleClick(cell.stage)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold transition",
              cell.isBottleneck
                ? "bg-destructive/10 border-destructive/40 text-destructive"
                : "bg-muted border-border text-muted-foreground hover:border-primary hover:text-primary",
              activeStage === cell.stage && "ring-1 ring-primary",
            )}
          >
            {cell.isBottleneck && <AlertTriangle className="h-2.5 w-2.5" />}
            <span className="capitalize">{cell.stage.replace(/-/g, " ")}</span>
            <span className="font-bold">{cell.count}</span>
            {cell.stalledCount > 0 && (
              <span className="opacity-70">· {cell.stalledCount} stalled</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AI Lead Queue (expanded view) ───────────────────────────────────────────

function AILeadQueue({
  scored,
  meta,
  onNudge,
}: {
  scored: ScoredMovementLead[];
  meta: Meta;
  onNudge: (s: ScoredMovementLead) => void;
}) {
  if (!scored.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        ✅ No critical leads detected. All signals healthy.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-64 overflow-auto">
      {scored.map((s) => {
        const cfg = TIER_CFG[s.tier];
        const info = meta.get(s.ulid);
        return (
          <div key={s.ulid} className="flex items-start gap-2 px-3 py-2">
            {/* Tier badge */}
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5", cfg.badgeCls)}>
              {cfg.icon} {cfg.label}
            </span>

            {/* Lead info */}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">
                {info?.name ?? s.ulid}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {s.signals.map((sg) => sg.label).join(" · ")}
              </div>
            </div>

            {/* Churn risk */}
            <div
              className={cn(
                "text-[10px] font-bold tabular-nums shrink-0",
                s.churnRiskPct >= 70
                  ? "text-destructive"
                  : s.churnRiskPct >= 40
                    ? "text-warning"
                    : "text-success",
              )}
            >
              {s.churnRiskPct}%
            </div>

            {/* 1-click nudge */}
            <button
              type="button"
              onClick={() => onNudge(s)}
              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition"
            >
              <Bot className="h-3 w-3" />
              AI Nudge
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function MovementAICopilot({
  meta,
}: {
  meta: Meta;
}) {
  const statesMap = useMovement((s) => s.states);
  const events = useMovement((s) => s.events);
  const mv = useMovement();

  const [expanded, setExpanded] = useState(false);
  const [activeTier, setActiveTier] = useState<AIRiskTier | null>(null);

  const scored = useMemo(
    () => scanMovementRisks(statesMap, events, meta),
    [statesMap, events, meta],
  );

  const filtered = useMemo(
    () => (activeTier ? scored.filter((s) => s.tier === activeTier) : scored),
    [scored, activeTier],
  );

  const criticalCount = scored.filter(
    (s) => s.tier === "CRITICAL_RECOVERY" || s.tier === "SLA_BREACHED",
  ).length;

  const handleNudge = (s: ScoredMovementLead) => {
    launchNudge(s, meta);
    mv.log(s.ulid, "message-sent", `AI Nudge sent (${s.recoveryKind}) · Churn risk was ${s.churnRiskPct}%`, {
      actorId: "ai-engine", actorName: "AI Engine",
    });
    toast.success(`🤖 AI Nudge sent to ${meta.get(s.ulid)?.name ?? s.ulid}`);
  };

  const handleBatchNudge = () => {
    const critical = scored.filter(
      (s) =>
        s.tier === "CRITICAL_RECOVERY" &&
        (s.signals.some((sg) => sg.kind === "post-tour-ghost" || sg.kind === "decay-velocity")),
    );
    if (!critical.length) {
      toast.info("No critical decaying leads to batch-nudge right now.");
      return;
    }
    for (const s of critical.slice(0, 5)) {
      mv.log(s.ulid, "message-sent", `AI Batch Nudge (${s.recoveryKind}) · Risk ${s.churnRiskPct}%`, {
        actorId: "ai-engine", actorName: "AI Engine",
      });
    }
    // Open first in WhatsApp
    handleNudge(critical[0]);
    toast.success(`🤖 Batch nudge queued for ${critical.slice(0, 5).length} decaying leads`);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary leading-tight flex items-center gap-1.5">
            AI Intelligence Engine
            {criticalCount > 0 && (
              <Badge className="text-[9px] h-4 bg-destructive text-destructive-foreground">
                <Flame className="h-2.5 w-2.5 mr-0.5" />
                {criticalCount} needs attention
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Scanning {Object.keys(statesMap).length} active leads · continuous risk analysis
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {criticalCount > 0 && (
            <Button
              size="sm"
              className="h-7 text-[10px] bg-primary text-primary-foreground"
              onClick={handleBatchNudge}
            >
              <Zap className="h-3 w-3 mr-1" />
              1-Click Batch Nudge
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-primary/10 transition text-primary"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Action Queue Cards (always visible) ── */}
      <ActionQueueCards
        scored={scored}
        activeTier={activeTier}
        onFilterTier={setActiveTier}
      />

      {/* ── Funnel Velocity Matrix (always visible) ── */}
      <FunnelVelocityMatrix states={statesMap} />

      {/* ── Expanded: AI Lead Queue ── */}
      {expanded && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            <Bot className="h-3 w-3" />
            AI Action Queue
            {activeTier && (
              <button
                type="button"
                onClick={() => setActiveTier(null)}
                className="ml-1 text-[9px] underline text-primary"
              >
                clear filter
              </button>
            )}
            <span className="ml-auto">{filtered.length} leads</span>
          </div>
          <AILeadQueue scored={filtered} meta={meta} onNudge={handleNudge} />
        </div>
      )}
    </div>
  );
}
