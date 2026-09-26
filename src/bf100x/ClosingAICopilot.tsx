/**
 * ClosingAICopilot.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * AI Intelligence layer for /closing.
 *
 * Exports:
 *  - <ClosingAIBar />          — global AI header bar with deal counts & 1-click batch nudge
 *  - <DealAIPanel />           — per-lead AI analysis drawer (offer, agreement, deposit link, sequence)
 *  - <ClosingAIDealCard />     — enhanced card row with inline AI tier badge & 1-click AI actions
 */

import { useMemo, useState } from "react";
import {
  Bot, ChevronDown, ChevronUp, Copy, Download,
  ExternalLink, FileText, MessageSquare, Sparkles,
  TrendingUp, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBookingFlow } from "@/bookingflow/store";
import { useMovement } from "@/movement/store";
import {
  analyzeClosingLeads,
  type DealTier,
  type ScoredClosingLead,
} from "./ClosingAIEngine";
import type { FlowLead } from "@/bookingflow/types";

// ─── Tier display config ──────────────────────────────────────────────────────

const TIER_CFG: Record<DealTier, { icon: string; label: string; cls: string; badgeCls: string }> = {
  CLOSE_NOW: {
    icon: "🔥",
    label: "Close Now",
    cls: "bg-success/10 border-success/30 text-success",
    badgeCls: "bg-success/20 text-success",
  },
  HIGH_INTENT: {
    icon: "✅",
    label: "High Intent",
    cls: "bg-primary/10 border-primary/30 text-primary",
    badgeCls: "bg-primary/20 text-primary",
  },
  NEGOTIATION: {
    icon: "💬",
    label: "Negotiation",
    cls: "bg-warning/10 border-warning/30 text-warning",
    badgeCls: "bg-warning/20 text-warning",
  },
  GHOST_RISK: {
    icon: "👻",
    label: "Ghost Risk",
    cls: "bg-destructive/10 border-destructive/30 text-destructive",
    badgeCls: "bg-destructive/20 text-destructive",
  },
  WARM_PIPELINE: {
    icon: "🌤️",
    label: "Pipeline",
    cls: "bg-muted border-border text-muted-foreground",
    badgeCls: "bg-muted text-muted-foreground",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyAndToast(text: string, msg: string) {
  navigator.clipboard.writeText(text).catch(() => {});
  toast.success(msg);
}

function buildScoredLeads(leads: FlowLead[]): ScoredClosingLead[] {
  const closingLeads = leads
    .filter((l) => {
      const f = l.f ?? {};
      return Boolean(f.tourFeedback) || Boolean(f.bookingAmount) || Boolean(f.quotation);
    })
    .map((l) => ({
      leadId: l.id,
      leadName: l.name,
      leadPhone: l.phone ?? "",
      fields: l.f ?? {},
      updatedAt: l.lastActivityAt,
    }));
  return analyzeClosingLeads(closingLeads);
}

// ─── AI Global Bar ────────────────────────────────────────────────────────────

export function ClosingAIBar({ leads }: { leads: FlowLead[] }) {
  const mv = useMovement();
  const [expanded, setExpanded] = useState(false);
  const [activeTier, setActiveTier] = useState<DealTier | null>(null);

  const scored = useMemo(() => buildScoredLeads(leads), [leads]);

  const counts = useMemo(() => {
    const c: Record<DealTier, number> = {
      CLOSE_NOW: 0, HIGH_INTENT: 0, NEGOTIATION: 0, GHOST_RISK: 0, WARM_PIPELINE: 0,
    };
    for (const s of scored) c[s.tier]++;
    return c;
  }, [scored]);

  const urgentCount = counts.CLOSE_NOW + counts.GHOST_RISK;
  const tiers: DealTier[] = ["CLOSE_NOW", "HIGH_INTENT", "NEGOTIATION", "GHOST_RISK", "WARM_PIPELINE"];

  const filtered = useMemo(
    () => (activeTier ? scored.filter((s) => s.tier === activeTier) : scored),
    [scored, activeTier],
  );

  const handleBatchNudge = () => {
    const ghosts = scored.filter((s) => s.tier === "GHOST_RISK");
    if (!ghosts.length) { toast.info("No ghost-risk leads right now."); return; }
    const first = ghosts[0];
    const phone = first.leadPhone.replace(/\D/g, "");
    const msg = first.followUpSequence[0] ?? first.recommendedOffer.waMessage;
    copyAndToast(msg, `Nudge copied for ${first.leadName}`);
    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    for (const g of ghosts.slice(0, 5)) {
      mv.log(g.leadId, "message-sent", `AI Closing Nudge (ghost recovery) · ${g.leadName}`, {
        actorId: "ai-engine", actorName: "AI Engine",
      });
    }
    toast.success(`🤖 Ghost recovery nudge sent to ${ghosts.slice(0, 5).length} leads`);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary leading-tight flex items-center gap-1.5">
            AI Deal Intelligence Engine
            {urgentCount > 0 && (
              <Badge className="text-[9px] h-4 bg-destructive text-destructive-foreground">
                {urgentCount} urgent
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Analysing {scored.length} closing leads · AI offer structures generated
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {counts.GHOST_RISK > 0 && (
            <Button size="sm" className="h-7 text-[10px]" onClick={handleBatchNudge}>
              <Zap className="h-3 w-3 mr-1" />
              Ghost Recovery Nudge
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

      {/* Tier cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
        {tiers.map((tier) => {
          const cfg = TIER_CFG[tier];
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setActiveTier(activeTier === tier ? null : tier)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition hover:opacity-90",
                cfg.cls,
                activeTier === tier && "ring-2 ring-primary",
              )}
            >
              <div className="text-lg font-bold tabular-nums leading-tight">
                {cfg.icon} {counts[tier]}
              </div>
              <div className="text-[9px] uppercase tracking-wider font-semibold mt-0.5 opacity-80">
                {cfg.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded AI Queue */}
      {expanded && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            <Bot className="h-3 w-3" />
            AI Deal Queue
            {activeTier && (
              <button type="button" onClick={() => setActiveTier(null)}
                className="ml-1 text-[9px] underline text-primary">clear filter</button>
            )}
            <span className="ml-auto">{filtered.length} leads</span>
          </div>
          <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-60 overflow-auto">
            {filtered.map((s) => (
              <AIQueueRow key={s.leadId} s={s} />
            ))}
            {!filtered.length && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                ✅ No deals in this tier right now.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AIQueueRow({ s }: { s: ScoredClosingLead }) {
  const mv = useMovement();
  const cfg = TIER_CFG[s.tier];

  const handleNudge = () => {
    const phone = s.leadPhone.replace(/\D/g, "");
    const msg = s.recommendedOffer.waMessage;
    copyAndToast(msg, `AI offer copied for ${s.leadName}`);
    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    mv.log(s.leadId, "message-sent", `AI Offer Nudge (${s.recommendedOffer.type}) · ${s.tier}`, {
      actorId: "ai-engine", actorName: "AI Engine",
    });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0", cfg.badgeCls)}>
        {cfg.icon} {cfg.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{s.leadName}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {s.signals.slice(0, 2).map((sg) => sg.label).join(" · ")}
        </div>
      </div>
      <div className={cn(
        "text-[10px] font-bold tabular-nums shrink-0",
        s.score >= 70 ? "text-success" : s.score >= 40 ? "text-warning" : "text-destructive",
      )}>
        {s.score}%
      </div>
      <button
        type="button"
        onClick={handleNudge}
        className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition"
      >
        <Bot className="h-3 w-3" />
        AI Offer
      </button>
    </div>
  );
}

// ─── Per-Lead AI Deal Panel ───────────────────────────────────────────────────

export function DealAIPanel({ lead }: { lead: FlowLead }) {
  const mv = useMovement();
  const { setNext, logActivity } = useBookingFlow();
  const [activeTab, setActiveTab] = useState<"offer" | "agreement" | "deposit" | "sequence">("offer");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const scored = useMemo(
    () =>
      analyzeClosingLeads([{
        leadId: lead.id,
        leadName: lead.name,
        leadPhone: lead.phone ?? "",
        fields: lead.f ?? {},
        updatedAt: lead.lastActivityAt,
      }])[0] ?? null,
    [lead],
  );

  if (!scored) return null;
  const cfg = TIER_CFG[scored.tier];

  const handleOfferNudge = () => {
    const phone = (lead.phone ?? "").replace(/\D/g, "");
    const msg = scored.recommendedOffer.waMessage;
    copyAndToast(msg, "AI offer message copied!");
    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    logActivity(lead.id, "AI Offer sent via WhatsApp", scored.recommendedOffer.type);
    mv.log(lead.id, "message-sent", `AI Offer (${scored.recommendedOffer.type}) sent — Conv. ${scored.score}%`, {
      actorId: "ai-engine", actorName: "AI Engine",
    });
    toast.success(`🤖 ${scored.recommendedOffer.label} sent to ${lead.name}`);
  };

  const handleAgreementCopy = () => {
    if (!scored.agreement) return;
    copyAndToast(scored.agreement.agreementText, "Agreement copied to clipboard!");
    logActivity(lead.id, "Agreement summary generated & copied");
    mv.log(lead.id, "note", "Rental agreement compiled and shared", { actorId: "ai-engine", actorName: "AI Engine" });
  };

  const handleAgreementWA = () => {
    if (!scored.agreement) return;
    const phone = (lead.phone ?? "").replace(/\D/g, "");
    const msg = scored.agreement.whatsappSummary;
    copyAndToast(msg, "WA agreement summary copied!");
    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    mv.log(lead.id, "message-sent", "Booking summary sent via WhatsApp", { actorId: "ai-engine", actorName: "AI Engine" });
  };

  const handleDepositLink = () => {
    copyAndToast(scored.depositLinkPayload, "Deposit UPI link copied!");
    mv.log(lead.id, "note", `Deposit link generated & copied · ${scored.depositLinkPayload.slice(0, 60)}`, {
      actorId: "ai-engine", actorName: "AI Engine",
    });
    toast.success("UPI deposit link ready to share 💳");
  };

  const handleSequenceNudge = (msg: string, idx: number) => {
    const phone = (lead.phone ?? "").replace(/\D/g, "");
    const cleanMsg = msg.replace(/^\[.*?\]\s*/, "");
    copyAndToast(cleanMsg, `Follow-up ${idx + 1} copied!`);
    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(cleanMsg)}`, "_blank");
    mv.log(lead.id, "message-sent", `Follow-up sequence message ${idx + 1} sent`, {
      actorId: "ai-engine", actorName: "AI Engine",
    });
  };

  const handle1ClickClose = () => {
    setNext(lead.id, "Confirm booking payment", new Date(Date.now() + 3 * 3600000).toISOString());
    logActivity(lead.id, "AI 1-Click Close initiated — next action set for 3h");
    mv.log(lead.id, "next-action-set", "AI 1-Click Close: payment follow-up in 3h", {
      actorId: "ai-engine", actorName: "AI Engine",
    });
    toast.success("⚡ 1-Click Close activated — next action set for 3h");
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-card overflow-hidden">
      {/* AI Panel Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-primary/5 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
            AI Deal Analysis
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", cfg.badgeCls)}>
              {cfg.icon} {cfg.label}
            </span>
            <span className={cn(
              "text-[9px] font-bold tabular-nums",
              scored.score >= 70 ? "text-success" : scored.score >= 40 ? "text-warning" : "text-destructive",
            )}>
              Conv. {scored.score}%
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground truncate">
            {scored.signals.slice(0, 3).map((s) => s.label).join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1-Click Close */}
          {(scored.tier === "CLOSE_NOW" || scored.tier === "HIGH_INTENT") && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handle1ClickClose(); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-success/10 text-success border border-success/30 hover:bg-success/20 transition"
            >
              <Zap className="h-3 w-3" />
              1-Click Close
            </button>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="p-3 space-y-3">
          {/* Tab strip */}
          <div className="flex gap-1 flex-wrap">
            {(["offer", "agreement", "deposit", "sequence"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-2.5 py-0.5 rounded text-[10px] font-semibold border transition",
                  activeTab === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {t === "offer" && "🎯 AI Offer"}
                {t === "agreement" && "📄 Agreement"}
                {t === "deposit" && "💳 Deposit Link"}
                {t === "sequence" && "📲 Follow-Up Sequence"}
              </button>
            ))}
          </div>

          {/* ── AI Offer Tab ── */}
          {activeTab === "offer" && (
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-semibold">{scored.recommendedOffer.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{scored.recommendedOffer.description}</p>
                <div className="text-[10px] bg-warning/10 text-warning border border-warning/20 rounded px-2 py-1 font-medium">
                  🔑 Urgency: {scored.recommendedOffer.urgencyLine}
                </div>
              </div>

              {/* Signals */}
              {scored.signals.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {scored.signals.map((s) => (
                    <span
                      key={s.kind}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                        s.severity === "blocker" ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : s.severity === "urgency" ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-success/30 bg-success/10 text-success",
                      )}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
              )}

              {/* WA message preview */}
              <div className="rounded border border-border bg-background p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  WhatsApp message preview
                </div>
                <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                  {scored.recommendedOffer.waMessage}
                </p>
              </div>

              <button
                type="button"
                onClick={handleOfferNudge}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                📋 Copy & Send AI Offer via WhatsApp
              </button>

              {/* Urgency meter */}
              <div className="rounded border border-border p-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Occupancy Urgency
                  </span>
                  <span className={cn(
                    "font-bold",
                    scored.urgencyScore >= 70 ? "text-destructive" : scored.urgencyScore >= 50 ? "text-warning" : "text-muted-foreground",
                  )}>
                    {scored.urgencyScore}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      scored.urgencyScore >= 70 ? "bg-destructive" : scored.urgencyScore >= 50 ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${scored.urgencyScore}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Agreement Tab ── */}
          {activeTab === "agreement" && (
            <div className="space-y-2">
              {scored.agreement ? (
                <>
                  <div className="rounded border border-border bg-background p-2.5 max-h-48 overflow-auto">
                    <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap leading-relaxed">
                      {scored.agreement.agreementText}
                    </pre>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAgreementCopy}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy Agreement
                    </button>
                    <button
                      type="button"
                      onClick={handleAgreementWA}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-success/10 text-success border border-success/30 hover:bg-success/20 transition"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Send via WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([scored.agreement!.agreementText], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `Agreement_${lead.name.replace(/\s+/g, "_")}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("Agreement downloaded!");
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .txt
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground rounded border border-border">
                  <FileText className="h-5 w-5 mx-auto mb-2 opacity-50" />
                  Fill in property, rent, and deposit to generate the agreement.
                </div>
              )}
            </div>
          )}

          {/* ── Deposit Link Tab ── */}
          {activeTab === "deposit" && (
            <div className="space-y-2">
              <div className="rounded border border-border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  UPI Payment Deep-Link
                </div>
                <code className="text-[10px] text-primary break-all leading-relaxed block">
                  {scored.depositLinkPayload}
                </code>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleDepositLink}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  💳 Copy & Share Deposit Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const msg = `Hi ${lead.name.split(" ")[0]}! 🏡 Here is your deposit payment link for *${(lead.f ?? {}).property ?? "Gharpayy PG"}*:\n\n${scored.depositLinkPayload}\n\nPlease pay at your earliest. Thank you! – Team Gharpayy`;
                    const phone = (lead.phone ?? "").replace(/\D/g, "");
                    copyAndToast(msg, "Payment link WA message copied!");
                    if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                    mv.log(lead.id, "message-sent", "Deposit UPI link sent via WhatsApp", { actorId: "ai-engine", actorName: "AI Engine" });
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-success/10 text-success border border-success/30 hover:bg-success/20 transition"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Send via WhatsApp
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                💡 Share this link with the customer to collect deposit/token directly via any UPI app.
              </p>
            </div>
          )}

          {/* ── Follow-Up Sequence Tab ── */}
          {activeTab === "sequence" && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">
                AI-generated 4-message follow-up sequence. Send each in order, at the timing shown.
              </p>
              {scored.followUpSequence.map((msg, idx) => {
                const timing = msg.match(/^\[(.+?)\]/)?.[1] ?? `Message ${idx + 1}`;
                const cleanMsg = msg.replace(/^\[.*?\]\s*/, "");
                return (
                  <div key={idx} className="rounded border border-border bg-muted/20 p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        {timing}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSequenceNudge(msg, idx)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Send
                      </button>
                    </div>
                    <p className="text-[11px] text-foreground leading-relaxed">{cleanMsg}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
