/**
 * MovementAIEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous client-side AI risk scanner for /movement-os.
 *
 * Runs continuously via `useMovementAI` hook and:
 *  • Scores every active lead for churn decay, SLA breach, post-tour ghost, and
 *    hot-closure signals
 *  • Ranks into four priority tiers: CRITICAL_RECOVERY | HOT_CONVERSION |
 *    SLA_BREACHED | ACTIVE_NURTURE
 *  • Generates 1-click recovery payloads (pre-filled WhatsApp nudge text)
 *
 * Zero server calls — all inference is deterministic rule-based AI.
 */

import type { MovementEvent, MovementState } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIRiskTier =
  | "CRITICAL_RECOVERY"   // 🚨 Decaying, 2–4h window before full churn
  | "HOT_CONVERSION"      // 🔥 High intent, tour done / payment ready
  | "SLA_BREACHED"        // ⚡ Action deadline passed
  | "ACTIVE_NURTURE";     // 🌤️ Healthy, monitor

export interface AIRiskSignal {
  kind:
    | "post-tour-ghost"      // >4h since tourDone, no follow-up sent
    | "sla-breach"           // nextAction overdue
    | "deposit-hesitation"   // stage payment/negotiation, idle >3h
    | "decay-velocity"       // customer not responded >6h since last outbound
    | "tour-unconfirmed"     // tour in <24h, not confirmed
    | "new-lead-idle"        // new lead, no outbound in >90m
    | "hot-close";           // payment intent / prebook interested
  label: string;
  silentMins: number;        // minutes since last relevant activity
}

export interface ScoredMovementLead {
  ulid: string;
  state: MovementState;
  tier: AIRiskTier;
  score: number;             // 0–100 urgency score
  signals: AIRiskSignal[];
  churnRiskPct: number;      // 0–100 estimated churn probability
  recoveryMsg: string;       // pre-compiled 1-click WhatsApp nudge text
  recoveryKind: "nudge" | "concession" | "tour-confirm" | "payment-push";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const minsSince = (iso: string | null | undefined): number =>
  iso ? Math.max(0, (Date.now() - +new Date(iso)) / 60000) : Infinity;

const minsUntil = (iso: string | null | undefined): number =>
  iso ? (+new Date(iso) - Date.now()) / 60000 : Infinity;

// ─── Signal Detectors ─────────────────────────────────────────────────────────

function detectSignals(st: MovementState): AIRiskSignal[] {
  const signals: AIRiskSignal[] = [];

  // Hot-close signals (positive, not churn)
  if (
    st.prebook?.paymentIntent ||
    st.prebook?.interested ||
    st.stage === "payment"
  ) {
    signals.push({
      kind: "hot-close",
      label: "💰 Ready to pay — close now",
      silentMins: minsSince(st.lastOutboundAt),
    });
  }

  // Post-tour ghosting (>4h since tour done, no outbound)
  if (st.tourDoneAt) {
    const sinceOut = minsSince(st.lastOutboundAt ?? st.tourDoneAt);
    const sinceTour = minsSince(st.tourDoneAt);
    if (sinceTour > 240 && sinceOut > 180) {
      signals.push({
        kind: "post-tour-ghost",
        label: `🕳️ Post-tour ghost — silent ${Math.round(sinceOut)}m`,
        silentMins: sinceOut,
      });
    }
  }

  // SLA breach
  if (st.nextAction) {
    const overdue = -minsUntil(st.nextAction.dueAt);
    if (overdue > 0) {
      signals.push({
        kind: "sla-breach",
        label: `⚡ SLA breached — ${Math.round(overdue)}m overdue`,
        silentMins: overdue,
      });
    }
  }

  // Deposit / price hesitation
  if (
    (st.stage === "negotiation" || st.stage === "payment" || st.stage === "quotation") &&
    !st.prebook?.paid
  ) {
    const silentOut = minsSince(st.lastOutboundAt);
    if (silentOut > 180) {
      signals.push({
        kind: "deposit-hesitation",
        label: `💸 Quote cold — ${Math.round(silentOut)}m no contact`,
        silentMins: silentOut,
      });
    }
  }

  // Decay velocity — last outbound >6h, customer not replied
  const sinceOutbound = minsSince(st.lastOutboundAt);
  const sinceCustomer = minsSince(st.lastCustomerMsgAt);
  if (
    sinceOutbound > 360 &&
    sinceCustomer > 360 &&
    st.stage !== "booked" &&
    st.stage !== "lost" &&
    st.stage !== "check-in"
  ) {
    signals.push({
      kind: "decay-velocity",
      label: `📉 Decaying — ${Math.round(sinceCustomer / 60)}h of silence`,
      silentMins: sinceCustomer,
    });
  }

  // Tour unconfirmed within 24h
  if (st.tourAt && !st.tourConfirmed && minsUntil(st.tourAt) < 1440 && minsUntil(st.tourAt) > 0) {
    signals.push({
      kind: "tour-unconfirmed",
      label: `📅 Tour in ${Math.round(minsUntil(st.tourAt))}m — NOT confirmed`,
      silentMins: minsSince(st.updatedAt),
    });
  }

  // New lead idle
  if (st.stage === "new" && !st.lastOutboundAt && minsSince(st.createdAt) > 90) {
    signals.push({
      kind: "new-lead-idle",
      label: `🆕 New lead idle ${Math.round(minsSince(st.createdAt))}m`,
      silentMins: minsSince(st.createdAt),
    });
  }

  return signals;
}

// ─── Tier Classifier ──────────────────────────────────────────────────────────

function classifyTier(signals: AIRiskSignal[], st: MovementState): AIRiskTier {
  const kinds = new Set(signals.map((s) => s.kind));

  if (kinds.has("hot-close")) return "HOT_CONVERSION";
  if (kinds.has("sla-breach")) return "SLA_BREACHED";
  if (kinds.has("post-tour-ghost") || kinds.has("deposit-hesitation")) return "CRITICAL_RECOVERY";
  if (kinds.has("decay-velocity") || kinds.has("new-lead-idle") || kinds.has("tour-unconfirmed"))
    return "CRITICAL_RECOVERY";

  return "ACTIVE_NURTURE";
}

// ─── Churn Risk % ─────────────────────────────────────────────────────────────

function calcChurnRisk(signals: AIRiskSignal[], st: MovementState): number {
  if (st.stage === "booked" || st.stage === "check-in") return 0;
  if (st.stage === "lost") return 100;

  let risk = 10; // base

  for (const s of signals) {
    switch (s.kind) {
      case "post-tour-ghost":     risk += 30 + Math.min(s.silentMins / 60, 20); break;
      case "decay-velocity":      risk += 25 + Math.min(s.silentMins / 120, 15); break;
      case "deposit-hesitation":  risk += 20; break;
      case "sla-breach":          risk += 15 + Math.min(s.silentMins / 60, 20); break;
      case "tour-unconfirmed":    risk += 25; break;
      case "new-lead-idle":       risk += 10; break;
      case "hot-close":           risk -= 20; break;
    }
  }

  if (st.goodLead) risk -= 10;
  if (st.prebook?.interested) risk -= 15;
  if (st.q?.responding === false) risk += 20;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

// ─── Urgency Score (0-100) ────────────────────────────────────────────────────

function calcScore(signals: AIRiskSignal[], tier: AIRiskTier, st: MovementState): number {
  const tierBase: Record<AIRiskTier, number> = {
    HOT_CONVERSION: 95,
    CRITICAL_RECOVERY: 80,
    SLA_BREACHED: 85,
    ACTIVE_NURTURE: 30,
  };
  let score = tierBase[tier];

  // Boost for maxSilentMins
  const maxSilent = Math.max(0, ...signals.map((s) => s.silentMins));
  score += Math.min(maxSilent / 60, 10); // up to +10 for hours of silence

  if (st.goodLead) score += 5;
  if (st.checkInDate) {
    const daysUntil = minsUntil(st.checkInDate) / 1440;
    if (daysUntil < 3) score += 10;
    else if (daysUntil < 7) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Recovery Message Builder ─────────────────────────────────────────────────

function buildRecoveryMsg(
  signals: AIRiskSignal[],
  st: MovementState,
  name: string,
): { msg: string; kind: ScoredMovementLead["recoveryKind"] } {
  const firstName = name.split(" ")[0] || "there";
  const property = st.tourProperty ?? "our PG";

  const kinds = new Set(signals.map((s) => s.kind));

  if (kinds.has("hot-close")) {
    return {
      kind: "payment-push",
      msg: `Hi ${firstName}! 🏡 Just checking in — your token payment for *${property}* is all set for you. Should I send you the payment link now? This slot won't last long! 🔐 – Team Gharpayy`,
    };
  }

  if (kinds.has("post-tour-ghost")) {
    return {
      kind: "nudge",
      msg: `Hi ${firstName}! 😊 How did you feel about *${property}*? We'd love to help you finalize — any questions or concerns I can answer? – Team Gharpayy`,
    };
  }

  if (kinds.has("deposit-hesitation")) {
    return {
      kind: "concession",
      msg: `Hi ${firstName}! 👋 We understand choosing a PG is a big decision. We can hold your spot at *${property}* for 24 hours with just a ₹500 refundable token. Want me to arrange that? – Team Gharpayy`,
    };
  }

  if (kinds.has("tour-unconfirmed")) {
    const dt = st.tourAt ? new Date(st.tourAt).toLocaleString() : "your scheduled time";
    return {
      kind: "tour-confirm",
      msg: `Hi ${firstName}! ✅ Quick reminder — your visit to *${property}* is coming up at ${dt}. Please confirm so we can have everything ready for you! – Team Gharpayy`,
    };
  }

  if (kinds.has("sla-breach")) {
    return {
      kind: "nudge",
      msg: `Hi ${firstName}! 🙏 Sorry we missed our follow-up. We're still here to help you find the perfect PG in Bangalore. Any updates on your search? – Team Gharpayy`,
    };
  }

  if (kinds.has("new-lead-idle")) {
    return {
      kind: "nudge",
      msg: `Hi ${firstName}! 👋 Welcome to Gharpayy! We have verified PGs across Bangalore with all amenities. What area are you looking in? I'd love to find you the perfect fit! 🏡 – Team Gharpayy`,
    };
  }

  // Decay fallback
  return {
    kind: "nudge",
    msg: `Hi ${firstName}! 😊 Just checking in — are you still looking for a PG in Bangalore? We have some great options available and can arrange a visit at your convenience. – Team Gharpayy`,
  };
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export function scanMovementRisks(
  states: Record<string, MovementState>,
  _events: MovementEvent[],
  metaMap: Map<string, { name: string; phone: string; area: string }>,
): ScoredMovementLead[] {
  const terminal = new Set(["booked", "lost", "check-in"]);
  const results: ScoredMovementLead[] = [];

  for (const st of Object.values(states)) {
    if (terminal.has(st.stage)) continue;

    const signals = detectSignals(st);
    const tier = classifyTier(signals, st);
    const churnRiskPct = calcChurnRisk(signals, st);
    const score = calcScore(signals, tier, st);
    const name = metaMap.get(st.ulid)?.name ?? st.name ?? "Customer";
    const { msg, kind } = buildRecoveryMsg(signals, st, name);

    results.push({
      ulid: st.ulid,
      state: st,
      tier,
      score,
      signals,
      churnRiskPct,
      recoveryMsg: msg,
      recoveryKind: kind,
    });
  }

  // Sort: HOT first, then by score descending
  const tierOrder: Record<AIRiskTier, number> = {
    HOT_CONVERSION: 0,
    SLA_BREACHED: 1,
    CRITICAL_RECOVERY: 2,
    ACTIVE_NURTURE: 3,
  };

  return results.sort((a, b) => {
    const td = tierOrder[a.tier] - tierOrder[b.tier];
    return td !== 0 ? td : b.score - a.score;
  });
}

// ─── Funnel Velocity Matrix ───────────────────────────────────────────────────

export interface FunnelVelocityCell {
  stage: string;
  count: number;
  stalledCount: number;    // leads with no activity >4h
  avgSilentMins: number;
  isBottleneck: boolean;   // true if stalledCount >= 3
}

export function buildFunnelVelocity(states: Record<string, MovementState>): FunnelVelocityCell[] {
  const stageMap = new Map<string, { total: number; silentMins: number[]; stalled: number }>();
  const terminal = new Set(["booked", "lost", "check-in"]);

  for (const st of Object.values(states)) {
    if (terminal.has(st.stage)) continue;
    const key = st.stage;
    if (!stageMap.has(key)) stageMap.set(key, { total: 0, silentMins: [], stalled: 0 });
    const entry = stageMap.get(key)!;
    entry.total++;
    const silent = minsSince(st.lastOutboundAt ?? st.updatedAt);
    entry.silentMins.push(silent);
    if (silent > 240) entry.stalled++;
  }

  const stageOrder = ["new", "qualified", "matched", "tour-scheduled", "tour-done", "quotation", "negotiation", "payment"];
  const result: FunnelVelocityCell[] = [];

  for (const stage of stageOrder) {
    const entry = stageMap.get(stage);
    if (!entry || entry.total === 0) continue;
    const avg = entry.silentMins.reduce((a, b) => a + b, 0) / entry.silentMins.length;
    result.push({
      stage,
      count: entry.total,
      stalledCount: entry.stalled,
      avgSilentMins: Math.round(avg),
      isBottleneck: entry.stalled >= 3,
    });
  }

  return result;
}
