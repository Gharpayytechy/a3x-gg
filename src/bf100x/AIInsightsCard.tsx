// AI Insights Card - Expert AI button integration.
// Produces a lead profile summary + recommended next step from captured lead data.
// 100% English only - no corrupted characters.

import { useState, useCallback } from "react";
import { Bot, X, ShieldAlert, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FlowLead } from "@/bookingflow/types";

// --- Weekly credit helpers ---

const CREDIT_KEY_PREFIX = "gharpayy_ai_credits";
const MAX_WEEKLY_CREDITS = 5;

function weekKey(userId: string) {
  const now = new Date();
  const yr = now.getFullYear();
  const jan1 = new Date(yr, 0, 1);
  const weekNo = Math.ceil(
    ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  return `${CREDIT_KEY_PREFIX}_${userId}_${yr}_w${weekNo}`;
}

export function getCreditsRemaining(userId: string): number {
  try {
    const used = Number(localStorage.getItem(weekKey(userId)) ?? "0");
    return Math.max(0, MAX_WEEKLY_CREDITS - used);
  } catch {
    return MAX_WEEKLY_CREDITS;
  }
}

export function consumeCredit(userId: string): boolean {
  try {
    const key = weekKey(userId);
    const used = Number(localStorage.getItem(key) ?? "0");
    if (used >= MAX_WEEKLY_CREDITS) return false;
    localStorage.setItem(key, String(used + 1));
    return true;
  } catch {
    return false;
  }
}

// --- Local analysis engine ---

interface AIInsight {
  profile: string;
  nextStep: string;
  urgencyLevel: "HIGH" | "MEDIUM" | "LOW";
  tags: string[];
}

function analyzeLeadLocally(lead: FlowLead): AIInsight {
  const f = lead.f ?? {};
  const budget = f["budget"] ?? lead.q?.budget ?? "";
  const moveIn = f["moveInDate"] ?? lead.q?.moveIn ?? "";
  const roomType = f["roomType"] ?? lead.q?.roomType ?? "";
  const area = f["area"] ?? lead.q?.area ?? "";
  const onWhatsapp = f["onWhatsapp"] ?? lead.q?.onWhatsapp ?? "";
  const channel = f["channel"] ?? lead.q?.channel ?? "";
  const property = f["propertyName"] ?? f["property"] ?? "";
  const bed = f["bedNumber"] ?? f["bedRoom"] ?? "";
  const checkinDay = f["checkinDay"] ?? "";
  const tours = lead.events?.filter((e) => /tour|visit/i.test(e.label)).length ?? 0;
  const callCount = lead.events?.filter((e) => /call|spoke|talk/i.test(e.label)).length ?? 0;
  const recentNote = [...(lead.events ?? [])].reverse().find((e) => e.detail)?.detail ?? "";

  const hasDeadline = !!lead.nextActionAt;
  const isLate = hasDeadline && new Date(lead.nextActionAt!) < new Date();
  const hasMoveIn = !!moveIn;
  const moveInSoon = hasMoveIn && new Date(moveIn) <= new Date(Date.now() + 7 * 86400000);
  const hasCheckin = checkinDay === "CHECKED_IN";

  const urgencyLevel: AIInsight["urgencyLevel"] =
    isLate || moveInSoon || hasCheckin ? "HIGH" : hasMoveIn || tours > 0 ? "MEDIUM" : "LOW";

  const profileParts: string[] = [];
  if (lead.name) profileParts.push(`**${lead.name}**`);
  if (area) profileParts.push(`looking in **${area}**`);
  if (roomType) profileParts.push(`for a **${roomType}**`);
  if (budget) profileParts.push(`budget **${budget}**`);
  if (moveIn) profileParts.push(`move-in around **${moveIn}**`);
  if (tours > 0) profileParts.push(`**${tours} tour(s)** done`);
  if (callCount > 0) profileParts.push(`**${callCount} call(s)** completed`);
  if (channel) profileParts.push(`via **${channel}**`);
  if (onWhatsapp) profileParts.push(`WhatsApp: ${onWhatsapp}`);
  if (recentNote) profileParts.push(`Note: "${recentNote.slice(0, 80)}"`);

  const profile =
    profileParts.length > 0
      ? profileParts.join(", ") + "."
      : "Insufficient data. Capture budget, area and move-in date first.";

  let nextStep: string;
  if (hasCheckin) {
    nextStep = "Lead is CHECKED IN. Confirm room key handover and collect feedback.";
  } else if (property && bed) {
    nextStep = `Property and bed locked (${property} - ${bed}). Proceed to tour scheduling or close commitment today.`;
  } else if (tours > 0 && !property) {
    nextStep = `Tour completed but no property locked. Follow up today: "Does ${area || "our property"} fit your requirement?" Present 2 options with prices.`;
  } else if (budget && area && !tours) {
    nextStep = `Budget (${budget}) and area (${area}) known. Share 2-3 matching properties${roomType ? ` with ${roomType}` : ""} via WhatsApp and book a site visit.`;
  } else if (budget && !area) {
    nextStep = `Budget captured (${budget}) but area unknown. Ask: "Which locality is most convenient for your office or college?"`;
  } else if (!budget && area) {
    nextStep = `Area (${area}) captured but no budget. Ask: "What monthly budget works for you?" Suggest reasonable ranges if they hesitate.`;
  } else if (callCount > 2) {
    nextStep = "Multiple calls without closure. Offer a time-limited token discount or escalate to senior closer.";
  } else if (isLate) {
    nextStep = `Action overdue since ${new Date(lead.nextActionAt!).toLocaleDateString()}. CALL NOW - establish intent and mark HOT or warm.`;
  } else if (moveInSoon) {
    nextStep = `Move-in within 7 days (${moveIn}). Treat as HOT. Confirm room availability and send agreement link today.`;
  } else {
    nextStep = "Capture budget, move-in date, and preferred area. These fields unlock full analysis.";
  }

  const tags: string[] = [];
  if (urgencyLevel === "HIGH") tags.push("High priority");
  if (urgencyLevel === "MEDIUM") tags.push("Medium priority");
  if (urgencyLevel === "LOW") tags.push("Low priority");
  if (tours > 0) tags.push(`${tours} tour(s)`);
  if (callCount > 0) tags.push(`${callCount} call(s)`);
  if (property) tags.push(`${property}`);
  if (budget) tags.push(`${budget}`);
  if (!lead.owner) tags.push("Unowned");
  if (isLate) tags.push("SLA breached");

  return { profile, nextStep, urgencyLevel, tags };
}

// --- AIInsightsCard ---

interface AIInsightsCardProps {
  lead: FlowLead;
  onDismiss: () => void;
}

export function AIInsightsCard({ lead, onDismiss }: AIInsightsCardProps) {
  const [insight] = useState<AIInsight>(() => analyzeLeadLocally(lead));

  const urgencyBorder =
    insight.urgencyLevel === "HIGH"
      ? "border-l-red-500"
      : insight.urgencyLevel === "MEDIUM"
      ? "border-l-yellow-500"
      : "border-l-green-500";

  return (
    <div className={`rounded-md border border-l-4 ${urgencyBorder} bg-muted/40 p-3 text-xs mb-2 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-primary">Expert AI Analysis</span>
          <Badge
            variant={insight.urgencyLevel === "HIGH" ? "destructive" : insight.urgencyLevel === "MEDIUM" ? "secondary" : "outline"}
            className="text-[9px]"
          >
            {insight.urgencyLevel}
          </Badge>
        </div>
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Profile Analysis</p>
        <p
          className="text-[11px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: insight.profile.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }}
        />
      </div>

      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recommended Next Step</p>
        <p className="text-[11px] leading-relaxed font-medium">{insight.nextStep}</p>
      </div>

      {insight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[9px]">{tag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// --- ExpertAIButton ---

interface ExpertAIButtonProps {
  userId: string;
  lead: FlowLead | undefined;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

export function ExpertAIButton({ userId, lead, isActive, onActivate, onDeactivate }: ExpertAIButtonProps) {
  const isDisqualified = !!lead && (lead.stage === "Closed / Disqualified" || !!lead.closedReason || !!lead.f?.["disqualifyReason"]);
  const disabled = isDisqualified || (!lead && !isActive);

  const handleClick = useCallback(() => {
    if (isDisqualified) return;
    if (isActive) { onDeactivate(); return; }
    if (disabled) return;
    onActivate();
  }, [isActive, disabled, isDisqualified, onActivate, onDeactivate]);

  let label: string;
  let title: string;

  if (isDisqualified) {
    label = "Expert AI (Disqualified)";
    title = "Lead is disqualified. Revoke and re-open to use Expert AI.";
  } else if (isActive) {
    label = "Expert AI (Active)";
    title = "Click to close AI analysis";
  } else {
    label = "Expert AI";
    title = "Open full-screen AI analysis for this lead";
  }

  return (
    <Button
      size="sm"
      variant={isActive ? "default" : isDisqualified ? "ghost" : "outline"}
      className={`h-6 px-2 text-[10px] ${isDisqualified ? "opacity-50 cursor-not-allowed text-muted-foreground" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      title={title}
    >
      {isDisqualified ? (
        <ShieldAlert className="mr-1 h-3 w-3 text-destructive" />
      ) : (
        <Bot className="mr-1 h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
