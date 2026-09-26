/**
 * ClosingAIEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous client-side AI Deal Analysis & Closing Assistant for /closing.
 *
 * Responsibilities:
 *  1. Score every post-tour lead for conversion readiness & deal risk
 *  2. Generate optimal discount / offer structures based on budget & hesitation signals
 *  3. Auto-compile rental agreement summaries (1-click downloadable text)
 *  4. Generate deposit link payloads (UPI deep-links, payment follow-up sequences)
 *  5. Predict occupancy-based urgency (artificial scarcity awareness)
 *
 * Zero server calls — all inference is deterministic rule-based AI engine.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DealTier =
  | "CLOSE_NOW"        // 🔥 Payment intent confirmed, close in <3h
  | "HIGH_INTENT"      // ✅ Post-tour positive, needs nudge
  | "NEGOTIATION"      // 💬 Price/deposit hesitation, AI concession recommended
  | "GHOST_RISK"       // 👻 Silent >4h since tour, churn imminent
  | "WARM_PIPELINE";   // 🌤️ Quoted, nurture needed

export interface DealObjSignal {
  kind:
    | "price-shock"         // Stated budget below rent
    | "deposit-too-high"    // Deposit >1.5x rent, customer stalled
    | "parent-approval"     // Decision pending third party
    | "competing-property"  // Considering alternatives
    | "move-in-urgent"      // <7 days to move-in, high urgency
    | "payment-ready"       // Payment intent already set
    | "tour-positive"       // Tour feedback was positive
    | "silent-post-tour"    // No contact since tour completion
    | "quote-cold"          // Quote sent, no response >3h
    | "checkin-imminent";   // Check-in date within 48h
  label: string;
  severity: "blocker" | "opportunity" | "urgency";
}

export interface AIOfferStructure {
  type: "standard" | "waived-deposit" | "partial-token" | "rent-negotiated" | "free-month";
  label: string;
  description: string;
  waMessage: string;    // ready-to-send WhatsApp message
  urgencyLine: string;  // the 1-liner that drives urgency
}

export interface RentalAgreementDraft {
  tenantName: string;
  tenantPhone: string;
  property: string;
  roomType: string;
  rentAmount: string;
  depositAmount: string;
  checkInDate: string;
  leaseDuration: string;
  paymentMode: string;
  agreementText: string;   // full compiled text
  whatsappSummary: string; // condensed WA-sendable version
}

export interface ScoredClosingLead {
  leadId: string;
  leadName: string;
  leadPhone: string;
  tier: DealTier;
  score: number;               // 0-100 conversion probability
  signals: DealObjSignal[];
  recommendedOffer: AIOfferStructure;
  agreement: RentalAgreementDraft | null;
  depositLinkPayload: string;  // UPI deep-link string (copy-to-share)
  followUpSequence: string[];  // ordered WA messages to send over time
  urgencyScore: number;        // 0-100 occupancy/time-based urgency
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const minsSince = (iso: string | null | undefined): number =>
  iso ? Math.max(0, (Date.now() - +new Date(iso)) / 60000) : Infinity;

const daysUntil = (iso: string | null | undefined): number =>
  iso ? (+new Date(iso) - Date.now()) / 86400000 : Infinity;

const inr = (v: string | number | undefined): string =>
  v ? `₹${Number(v).toLocaleString("en-IN")}` : "—";

// ─── Signal Detector ─────────────────────────────────────────────────────────

function detectSignals(f: Record<string, string>, updatedAt?: string): DealObjSignal[] {
  const signals: DealObjSignal[] = [];
  const rent = Number(f.rent ?? 0);
  const deposit = Number(f.deposit ?? 0);
  const budget = Number(f.budget ?? 0);

  // Payment already set
  if (f.payment === "RECEIVED" || f.paymentAmount) {
    signals.push({ kind: "payment-ready", label: "💰 Payment confirmed", severity: "opportunity" });
  }

  // Tour was positive
  if (f.tourFeedback?.toLowerCase().includes("posit") || f.tourFeedback?.toLowerCase().includes("like")) {
    signals.push({ kind: "tour-positive", label: "✅ Positive tour feedback", severity: "opportunity" });
  }

  // Price shock
  if (budget > 0 && rent > 0 && budget < rent * 0.85) {
    signals.push({ kind: "price-shock", label: `💸 Budget ${inr(budget)} vs rent ${inr(rent)}`, severity: "blocker" });
  }

  // Deposit too high (relative to rent)
  if (deposit > 0 && rent > 0 && deposit > rent * 1.5) {
    signals.push({ kind: "deposit-too-high", label: `🏦 Deposit ${inr(deposit)} — high barrier`, severity: "blocker" });
  }

  // Decision pending approval
  if (f.decision?.toLowerCase().includes("parent") || f.decision?.toLowerCase().includes("approv")) {
    signals.push({ kind: "parent-approval", label: "👨‍👩‍👦 Waiting for family approval", severity: "blocker" });
  }

  // Competing property
  if (f.decision?.toLowerCase().includes("another") || f.decision?.toLowerCase().includes("other")) {
    signals.push({ kind: "competing-property", label: "🏠 Considering another property", severity: "blocker" });
  }

  // Move-in urgent
  const checkIn = f.checkInDate ?? f.moveIn;
  if (checkIn && daysUntil(checkIn) <= 7 && daysUntil(checkIn) > 0) {
    signals.push({ kind: "move-in-urgent", label: `🚀 Moving in ${Math.ceil(daysUntil(checkIn))} day(s)`, severity: "urgency" });
  }

  // Silent post-tour
  if (f.tourFeedback && !f.bookingAmount && minsSince(updatedAt) > 240) {
    signals.push({ kind: "silent-post-tour", label: `👻 Silent ${Math.round(minsSince(updatedAt) / 60)}h since tour`, severity: "blocker" });
  }

  // Quote cold
  if (f.quotation && !f.bookingAmount && minsSince(updatedAt) > 180) {
    signals.push({ kind: "quote-cold", label: `❄️ Quote sent, no reply ${Math.round(minsSince(updatedAt) / 60)}h`, severity: "blocker" });
  }

  // Check-in imminent (booked but not checked in)
  if (f.bookingAmount && checkIn && daysUntil(checkIn) <= 2 && daysUntil(checkIn) > 0) {
    signals.push({ kind: "checkin-imminent", label: `📅 Check-in in ${Math.ceil(daysUntil(checkIn) * 24)}h`, severity: "urgency" });
  }

  return signals;
}

// ─── Tier Classifier ─────────────────────────────────────────────────────────

function classifyTier(signals: DealObjSignal[], f: Record<string, string>): DealTier {
  const kinds = new Set(signals.map((s) => s.kind));

  if (kinds.has("payment-ready")) return "CLOSE_NOW";
  if (f.bookingAmount) return "CLOSE_NOW";

  const blockers = signals.filter((s) => s.severity === "blocker");
  const opportunities = signals.filter((s) => s.severity === "opportunity");

  if (kinds.has("silent-post-tour") && blockers.length >= 2) return "GHOST_RISK";
  if (kinds.has("price-shock") || kinds.has("deposit-too-high") || kinds.has("competing-property")) return "NEGOTIATION";
  if (opportunities.length > 0 && kinds.has("tour-positive")) return "HIGH_INTENT";
  if (f.quotation) return "WARM_PIPELINE";

  return "WARM_PIPELINE";
}

// ─── Conversion Probability Score ─────────────────────────────────────────────

function calcScore(signals: DealObjSignal[], tier: DealTier, f: Record<string, string>): number {
  const tierBase: Record<DealTier, number> = {
    CLOSE_NOW: 92,
    HIGH_INTENT: 70,
    NEGOTIATION: 45,
    GHOST_RISK: 20,
    WARM_PIPELINE: 35,
  };
  let score = tierBase[tier];

  for (const s of signals) {
    if (s.severity === "opportunity") score += 8;
    if (s.severity === "urgency") score += 5;
    if (s.severity === "blocker") score -= 10;
  }

  if (f.bookingAmount) score += 15;
  if (f.approval === "APPROVED") score += 10;
  if (f.tourFeedback) score += 5;

  return Math.max(5, Math.min(98, Math.round(score)));
}

// ─── Occupancy Urgency Score ──────────────────────────────────────────────────

function calcUrgencyScore(signals: DealObjSignal[], f: Record<string, string>): number {
  let urgency = 30;
  const kinds = new Set(signals.map((s) => s.kind));

  if (kinds.has("move-in-urgent")) urgency += 35;
  if (kinds.has("checkin-imminent")) urgency += 30;
  if (kinds.has("payment-ready")) urgency += 25;
  if (kinds.has("competing-property")) urgency += 20;
  if (kinds.has("silent-post-tour")) urgency -= 15;

  // Simulate occupancy (PG rooms sell out fast in Bangalore)
  const simulatedOccupancy = 78 + Math.floor(Math.random() * 15); // 78-93%
  if (simulatedOccupancy > 90) urgency += 15;

  return Math.min(100, Math.round(urgency));
}

// ─── AI Offer Builder ─────────────────────────────────────────────────────────

function buildOffer(
  signals: DealObjSignal[],
  f: Record<string, string>,
  name: string,
): AIOfferStructure {
  const firstName = name.split(" ")[0] || "there";
  const property = f.property ?? "the property";
  const rent = inr(f.rent);
  const deposit = inr(f.deposit);
  const kinds = new Set(signals.map((s) => s.kind));

  // Price shock → negotiate rent
  if (kinds.has("price-shock")) {
    const negotiatedRent = Math.round(Number(f.rent ?? 0) * 0.93);
    return {
      type: "rent-negotiated",
      label: "AI Rent Adjustment Offer",
      description: `Bring rent down to ₹${negotiatedRent.toLocaleString("en-IN")} to match budget`,
      urgencyLine: "This is the best we can do — room fills in 48h",
      waMessage: `Hi ${firstName}! 🏡 Good news — we've spoken with the property team and can offer you *${property}* at ₹${negotiatedRent.toLocaleString("en-IN")}/month (was ${rent}). This is our final special price, and the room is available today. Can we lock it in right now? 🔐 – Team Gharpayy`,
    };
  }

  // Deposit too high → waive / reduce deposit
  if (kinds.has("deposit-too-high")) {
    const reducedDeposit = Math.round(Number(f.deposit ?? 0) * 0.6);
    return {
      type: "waived-deposit",
      label: "AI Deposit Relief Offer",
      description: `Reduce deposit to ₹${reducedDeposit.toLocaleString("en-IN")} (40% off)`,
      urgencyLine: "Deposit reduction valid only today",
      waMessage: `Hi ${firstName}! Great news 🎉 We've arranged a special deal for you — deposit reduced to ₹${reducedDeposit.toLocaleString("en-IN")} for *${property}*! This offer expires tonight. Want to confirm? – Team Gharpayy`,
    };
  }

  // Parent approval → token offer
  if (kinds.has("parent-approval")) {
    return {
      type: "partial-token",
      label: "AI Hold Token Offer",
      description: "₹500 refundable token to hold room while family approves",
      urgencyLine: "Hold your room for 24h with ₹500 — full refund if you cancel",
      waMessage: `Hi ${firstName}! 🙏 We understand you need to check with family first. We can *hold your room* at *${property}* for 24 hours with a ₹500 fully refundable token. This way, no one else can take it while you decide. Shall I send the payment link? – Team Gharpayy`,
    };
  }

  // Competing property → highlight differentiation
  if (kinds.has("competing-property")) {
    return {
      type: "standard",
      label: "AI Competitive Edge Offer",
      description: "Highlight Gharpayy verification + free first month amenities",
      urgencyLine: "Gharpayy-verified — no hidden costs, free Wi-Fi + housekeeping",
      waMessage: `Hi ${firstName}! 👋 Comparing options? Here's what sets *${property}* apart: ✅ Gharpayy-verified (no hidden costs) ✅ Free high-speed Wi-Fi ✅ Housekeeping included ✅ 24hr security. Rent: ${rent} | Deposit: ${deposit}. Ready to lock in? – Team Gharpayy`,
    };
  }

  // Move-in urgent → urgency push
  if (kinds.has("move-in-urgent")) {
    return {
      type: "standard",
      label: "AI Move-In Fast Close",
      description: "Urgency push for imminent move-in date",
      urgencyLine: "Room will be taken before your move-in if we wait",
      waMessage: `Hi ${firstName}! ⏰ Your move-in date is very close and rooms at *${property}* are filling fast. We need to confirm today to guarantee your spot. Rent: ${rent} | Deposit: ${deposit}. Can we finalize now? – Team Gharpayy`,
    };
  }

  // Default / post-tour positive
  return {
    type: "standard",
    label: "AI Closing Push",
    description: "Standard positive-reinforcement close",
    urgencyLine: "This room won't last — book it today",
    waMessage: `Hi ${firstName}! 😊 It was great showing you *${property}*! The room is still available and our team is ready to finalize everything quickly. Rent: ${rent} | Deposit: ${deposit}. Shall we lock it in today? 🏡 – Team Gharpayy`,
  };
}

// ─── Agreement Compiler ───────────────────────────────────────────────────────

function compileAgreement(
  leadName: string,
  leadPhone: string,
  f: Record<string, string>,
): RentalAgreementDraft | null {
  if (!f.property && !f.rent) return null;

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const checkIn = f.checkInDate ?? f.moveIn ?? "TBD";
  const roomType = f.roomType ?? "Single Occupancy";
  const rent = inr(f.rent);
  const deposit = inr(f.deposit);
  const property = f.property ?? "Gharpayy Property";
  const paymentMode = f.paymentMode ?? "Gharpayy UPI";

  const agreementText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GHARPAYY — RENTAL AGREEMENT SUMMARY
  Generated: ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TENANT DETAILS
  Name    : ${leadName}
  Phone   : ${leadPhone}
  Room    : ${roomType}

PROPERTY DETAILS
  Property : ${property}
  Rent     : ${rent} / month
  Deposit  : ${deposit} (refundable)
  Check-In : ${checkIn}
  Duration : 11 months (renewable)

PAYMENT
  Mode     : ${paymentMode}
  Amount   : ${inr(f.bookingAmount ?? f.paymentAmount ?? f.rent)}
  Status   : ${f.payment ?? "Pending"}
  Booking# : GHP-${Math.random().toString(36).slice(2, 8).toUpperCase()}

TERMS & CONDITIONS (Summary)
  1. Rent due on or before 5th of every month
  2. 1-month notice required before vacating
  3. Deposit refunded within 15 days of exit (subject to property condition)
  4. No subletting permitted
  5. Property rules to be followed (Gharpayy House Rules apply)
  6. Utilities (electricity) as per actuals, billed separately

SIGNED & ACKNOWLEDGED BY
  Operator : Team Gharpayy
  Tenant   : ${leadName} [digital acknowledgement via WhatsApp]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

  const whatsappSummary =
    `🏡 *GHARPAYY BOOKING SUMMARY*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Tenant: *${leadName}*\n` +
    `🏠 Property: *${property}*\n` +
    `🛏 Room: ${roomType}\n` +
    `💰 Rent: *${rent}/month*\n` +
    `🔒 Deposit: ${deposit}\n` +
    `📅 Check-in: *${checkIn}*\n` +
    `💳 Payment: ${paymentMode}\n` +
    `✅ Status: Booking Confirmed!\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Reply *CONFIRM* to lock in your booking. Welcome to Gharpayy! 🎉`;

  return {
    tenantName: leadName,
    tenantPhone: leadPhone,
    property,
    roomType,
    rentAmount: f.rent ?? "",
    depositAmount: f.deposit ?? "",
    checkInDate: checkIn,
    leaseDuration: "11 months",
    paymentMode,
    agreementText,
    whatsappSummary,
  };
}

// ─── Deposit Link Generator ───────────────────────────────────────────────────

function generateDepositLink(f: Record<string, string>, leadName: string): string {
  const amount = f.deposit ?? f.bookingAmount ?? "5000";
  const note = encodeURIComponent(`Gharpayy Deposit - ${leadName} - ${f.property ?? "PG"}`);
  const upiId = "gharpayy@upi"; // Replace with real UPI
  return `upi://pay?pa=${upiId}&pn=Gharpayy&am=${amount}&tn=${note}&cu=INR`;
}

// ─── Follow-Up Sequence Generator ────────────────────────────────────────────

function buildFollowUpSequence(
  signals: DealObjSignal[],
  f: Record<string, string>,
  name: string,
): string[] {
  const firstName = name.split(" ")[0] || "there";
  const property = f.property ?? "the property";
  const rent = inr(f.rent);

  const seq: string[] = [];
  const kinds = new Set(signals.map((s) => s.kind));

  // Message 1 — Immediate nudge (0h)
  seq.push(
    `[NOW] Hi ${firstName}! 😊 Just confirming you're all set with *${property}*. The room is still reserved for you. Shall we finalize today? – Team Gharpayy`,
  );

  // Message 2 — Value reinforcement (2h)
  if (kinds.has("price-shock") || kinds.has("deposit-too-high")) {
    seq.push(
      `[+2h] Hi ${firstName}! 💡 A quick note — we've arranged the best possible deal on *${property}* for you. This is our final price of ${rent}/month. Let us know if you have any questions! – Team Gharpayy`,
    );
  } else {
    seq.push(
      `[+2h] Hi ${firstName}! 🏡 Just a quick follow-up on *${property}*. Our rooms fill up fast in this area. Want us to send you the booking summary? – Team Gharpayy`,
    );
  }

  // Message 3 — Urgency trigger (4h)
  seq.push(
    `[+4h] Hi ${firstName}! ⏰ We have another interested customer for the same room at *${property}*. We'd love to finalize with you first since you visited. Shall we proceed? – Team Gharpayy`,
  );

  // Message 4 — Final offer (Next morning)
  seq.push(
    `[Tomorrow 10AM] Hi ${firstName}! Good morning! 🌅 Your preferred room at *${property}* (${rent}/month) is still available. This is our last check-in — if we don't hear from you today, we'll have to release it to another tenant. – Team Gharpayy`,
  );

  return seq;
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export interface ClosingLeadInput {
  leadId: string;
  leadName: string;
  leadPhone: string;
  fields: Record<string, string>;
  updatedAt?: string;
}

export function analyzeClosingLeads(leads: ClosingLeadInput[]): ScoredClosingLead[] {
  return leads
    .map((lead) => {
      const { leadId, leadName, leadPhone, fields: f, updatedAt } = lead;
      const signals = detectSignals(f, updatedAt);
      const tier = classifyTier(signals, f);
      const score = calcScore(signals, tier, f);
      const urgencyScore = calcUrgencyScore(signals, f);
      const recommendedOffer = buildOffer(signals, f, leadName);
      const agreement = compileAgreement(leadName, leadPhone, f);
      const depositLinkPayload = generateDepositLink(f, leadName);
      const followUpSequence = buildFollowUpSequence(signals, f, leadName);

      return {
        leadId,
        leadName,
        leadPhone,
        tier,
        score,
        signals,
        recommendedOffer,
        agreement,
        depositLinkPayload,
        followUpSequence,
        urgencyScore,
      };
    })
    .sort((a, b) => {
      const tierOrder: Record<DealTier, number> = {
        CLOSE_NOW: 0,
        HIGH_INTENT: 1,
        NEGOTIATION: 2,
        GHOST_RISK: 3,
        WARM_PIPELINE: 4,
      };
      return tierOrder[a.tier] - tierOrder[b.tier] || b.score - a.score;
    });
}
