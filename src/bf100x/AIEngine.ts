// AIEngine.ts - Client-side Autonomous AI Agent & Rule Engine for Gharpayy Booking Flow.
// Analyzes conversation history, extracts entities (area, budget, move-in, room type, intent),
// calculates live conversion probability, surfaces 1-Click Next Best Actions (NBA), and executes Auto-Pilot filling.

import type { FlowLead } from "@/bookingflow/types";
import { matchesFor, type MatchRow } from "./match";

export interface AIAnalysisResult {
  conversionScore: number;
  temperature: "HOT" | "WARM" | "COLD";
  temperatureLabel: string;
  intentRank: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "CHURN_RISK";
  urgencyText: string;
  inferredFields: Record<string, string>;
  inferredCount: number;
  topPropertyMatch: MatchRow | null;
  nextBestActions: NextBestAction[];
  objectionBattlecards: ObjectionBattlecard[];
  baselineClicks: number;
  optimizedClicks: number;
  clicksSaved: number;
  timeSavedSeconds: number;
}

export interface NextBestAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  priority: "CRITICAL" | "HIGH" | "RECOMMENDED";
  actionType: "AUTO_PILOT" | "PITCH_TOP_MATCH" | "SCHEDULE_TOUR" | "LOCK_FOLLOWUP" | "FAST_DQ";
  payload?: Record<string, string>;
  buttonText: string;
}

export interface ObjectionBattlecard {
  id: string;
  title: string;
  icon: string;
  rebuttalScript: string;
  concessionTip: string;
  suggestedAction: string;
}

// Locality dictionary for Bangalore & Pune
const KNOWN_AREAS = [
  "Koramangala", "HSR Layout", "HSR", "Bellandur", "Whitefield", "Indiranagar",
  "Electronic City", "BTM Layout", "BTM", "Marathahalli", "Sarjapur Road", "Sarjapur",
  "Kharadi", "Baner", "Hinjewadi", "Hadapsar", "Viman Nagar", "Wagholi", "Kalyani Nagar"
];

/**
 * Extracts structured entities from customer chat messages & notes using NLP regex patterns.
 */
export function extractLeadInferences(lead: FlowLead): Record<string, string> {
  const f = lead.f ?? {};
  const text = [
    lead.name || "",
    lead.lastMessage || "",
    ...(lead.events?.map((e) => `${e.label} ${e.detail ?? ""}`) ?? [])
  ].join(" ").toLowerCase();

  const inferred: Record<string, string> = {};

  // 1. Where / Channel / Ownership presets if missing
  if (!f["where"]) inferred["where"] = "ACTIVE_CHAT";
  if (!f["channel"]) inferred["channel"] = "WHATSAPP";
  if (!f["when"]) inferred["when"] = "NOW";
  if (!f["ownership"]) inferred["ownership"] = "OWN";
  if (!f["recon"]) inferred["recon"] = lead.events?.length ? "PART_QUALIFIED" : "CONTACTED";

  // 2. Area extraction
  if (!f["area"]) {
    for (const area of KNOWN_AREAS) {
      if (text.includes(area.toLowerCase())) {
        inferred["area"] = area;
        inferred["feasible"] = "YES";
        break;
      }
    }
  } else if (!f["feasible"]) {
    inferred["feasible"] = "YES";
  }

  // 3. Room Type extraction
  if (!f["roomType"]) {
    if (/single|private|1\s?rk|1\s?bhk|individual/i.test(text)) {
      inferred["roomType"] = "SINGLE";
    } else if (/triple|3\s?sharing|3\s?bed|three/i.test(text)) {
      inferred["roomType"] = "TRIPLE";
    } else if (/double|2\s?sharing|2\s?bed|twin|sharing/i.test(text)) {
      inferred["roomType"] = "DOUBLE";
    } else {
      inferred["roomType"] = "DOUBLE"; // Standard default
    }
  }

  // 4. Budget extraction
  if (!f["budget"]) {
    const budgetMatch = text.match(/(?:budget|rent|under|around|upto|within|₹|rs\.?)\s*[:\-]?\s*(\d{1,2})[,\s]?(\d{3})|\b(\d{2})k\b|\b(8000|9000|10000|11000|12000|13000|14000|15000|16000|18000|20000|22000|25000)\b/i);
    if (budgetMatch) {
      if (budgetMatch[3]) {
        inferred["budget"] = `${parseInt(budgetMatch[3], 10) * 1000}`;
      } else if (budgetMatch[4]) {
        inferred["budget"] = budgetMatch[4];
      } else if (budgetMatch[1] && budgetMatch[2]) {
        inferred["budget"] = `${budgetMatch[1]}${budgetMatch[2]}`;
      }
    } else {
      // Default based on room type
      inferred["budget"] = inferred["roomType"] === "SINGLE" ? "18000" : "12000";
    }
  }

  // 5. Move-in date extraction
  if (!f["moveIn"]) {
    const now = new Date();
    if (/today|immediately|asap|urgent|now/i.test(text)) {
      inferred["moveIn"] = now.toISOString().slice(0, 10);
    } else if (/tomorrow/i.test(text)) {
      const tmrw = new Date(now.getTime() + 86400000);
      inferred["moveIn"] = tmrw.toISOString().slice(0, 10);
    } else if (/next week|1 week|weekend/i.test(text)) {
      const nextWk = new Date(now.getTime() + 7 * 86400000);
      inferred["moveIn"] = nextWk.toISOString().slice(0, 10);
    } else if (/1st|first|month end|next month/i.test(text)) {
      const nextMo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      inferred["moveIn"] = nextMo.toISOString().slice(0, 10);
    } else {
      // Default to 5 days out
      const soon = new Date(now.getTime() + 5 * 86400000);
      inferred["moveIn"] = soon.toISOString().slice(0, 10);
    }
  }

  // 6. Intent extraction
  if (!f["intent"]) {
    if (/book|token|pay|confirm|advance|urgent|immediate/i.test(text)) {
      inferred["intent"] = "VERY_HIGH";
    } else if (/visit|tour|come|see|show|location|address|timing/i.test(text)) {
      inferred["intent"] = "HIGH";
    } else if (/photo|pic|price|sharing|detail|amenities/i.test(text)) {
      inferred["intent"] = "MEDIUM";
    } else {
      inferred["intent"] = "HIGH"; // Default positive sales posture
    }
  }

  // 7. Call status if missing
  if (!f["call"]) {
    inferred["call"] = "CONNECTED";
  }

  return inferred;
}

/**
 * Autonomous live lead analysis: Scores conversion likelihood, predicts next steps, and compiles battlecards.
 */
export function analyzeLeadLive(lead: FlowLead | null | undefined, meName = "Operator"): AIAnalysisResult {
  if (!lead) {
    return {
      conversionScore: 50,
      temperature: "WARM",
      temperatureLabel: "Warm Prospect",
      intentRank: "MEDIUM",
      urgencyText: "Select a customer to run live AI analysis",
      inferredFields: {},
      inferredCount: 0,
      topPropertyMatch: null,
      nextBestActions: [],
      objectionBattlecards: [],
      baselineClicks: 14,
      optimizedClicks: 2,
      clicksSaved: 12,
      timeSavedSeconds: 90,
    };
  }

  const f = lead.f ?? {};
  const inferred = extractLeadInferences(lead);
  const combined = { ...inferred, ...f };
  const matches = matchesFor(lead, 3);
  const topMatch = matches[0] ?? null;

  // Calculate Conversion Likelihood Score (0-100)
  let score = 55;
  const isLate = lead.nextActionAt && new Date(lead.nextActionAt) < new Date();
  const hasMoveIn = Boolean(combined["moveIn"]);
  const moveInDate = combined["moveIn"] ? new Date(combined["moveIn"]) : null;
  const isMoveInSoon = moveInDate ? (moveInDate.getTime() - Date.now()) <= 7 * 86400000 : false;
  const hasBudget = Boolean(combined["budget"]);
  const hasProperty = Boolean(combined["property"]);
  const tourScheduled = Boolean(combined["tourAt"]);

  if (combined["intent"] === "VERY_HIGH") score += 25;
  else if (combined["intent"] === "HIGH") score += 15;
  else if (combined["intent"] === "LOW") score -= 20;

  if (isMoveInSoon) score += 15;
  if (tourScheduled) score += 20;
  if (hasProperty && topMatch && topMatch.score >= 80) score += 10;
  if (hasBudget) score += 5;
  if (isLate) score -= 15;

  score = Math.max(10, Math.min(98, score));

  const temperature: "HOT" | "WARM" | "COLD" = score >= 75 ? "HOT" : score >= 45 ? "WARM" : "COLD";
  const temperatureLabel = temperature === "HOT" ? "Hot Conversion Deal 🔥" : temperature === "WARM" ? "Active High-Intent Prospect ⚡" : "Nurture / Retention Risk ⚠️";
  const intentRank: AIAnalysisResult["intentRank"] = (combined["intent"] as any) || "HIGH";

  const urgencyText = isLate
    ? `🚨 Action Overdue! Reach out now before customer books with a competitor.`
    : isMoveInSoon
    ? `⚡ Move-in is within 7 days. Immediate tour confirmation needed.`
    : tourScheduled
    ? `🗓️ Tour booked for ${new Date(combined["tourAt"]!).toLocaleDateString()}. Confirm host dispatch.`
    : `💬 High-fit property found (${topMatch?.name ?? "Gharpayy Stay"}). Pitch & lock tour today.`;

  // Construct Top Next Best Actions (NBA) with 1-click executable payloads
  const nextBestActions: NextBestAction[] = [];

  // NBA 1: AI Auto-Pilot Complete Qualification
  const missingKeys = Object.keys(inferred).filter((k) => !f[k]);
  if (missingKeys.length > 0) {
    nextBestActions.push({
      id: "nba-autopilot",
      title: "⚡ AI Auto-Pilot: Auto-Fill All Fields",
      description: `Infers ${missingKeys.length} missing fields (Area: ${inferred["area"] || "HSR"}, Budget: ₹${inferred["budget"] || "12k"}, Room: ${inferred["roomType"] || "Double"}) and qualifies lead in 1 click.`,
      icon: "🤖",
      priority: "CRITICAL",
      actionType: "AUTO_PILOT",
      payload: inferred,
      buttonText: `Auto-Fill ${missingKeys.length} Fields (Press 'A')`,
    });
  }

  // NBA 2: 1-Click Top Property Pitch & Tour Lock
  if (topMatch) {
    const tmrw = new Date(Date.now() + 24 * 3600000).toISOString();
    nextBestActions.push({
      id: "nba-top-property",
      title: `🏠 Pitch & Lock Tour: ${topMatch.name}`,
      description: `${topMatch.score}% Fit · ${topMatch.roomType} room @ ₹${topMatch.price.toLocaleString("en-IN")}/mo · ${topMatch.bedsFree} beds available.`,
      icon: "🔑",
      priority: "HIGH",
      actionType: "PITCH_TOP_MATCH",
      payload: {
        property: topMatch.name,
        propertyRoom: `${topMatch.roomType} · ${topMatch.roomId}`,
        tourAt: tmrw,
        tourHost: meName,
      },
      buttonText: `1-Click: Pitch ${topMatch.name}`,
    });
  }

  // NBA 3: Fast 2-Hour Smart Follow-up Lock
  nextBestActions.push({
    id: "nba-followup-lock",
    title: "⏱️ Smart SLA Callback Timer (2h)",
    description: "Locks next action 'Follow up on decision' with 2-hour deadline to prevent SLA breach.",
    icon: "⏰",
    priority: "RECOMMENDED",
    actionType: "LOCK_FOLLOWUP",
    payload: {
      nextAction: "Follow up on decision",
      nextActionAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    },
    buttonText: "Lock 2-Hour Follow-Up",
  });

  // Dynamic Objection Battlecards
  const objectionBattlecards: ObjectionBattlecard[] = [
    {
      id: "obj-price",
      title: "Rent / Deposit Too High",
      icon: "💸",
      rebuttalScript: `Hi ${lead.name || "there"}! For *${topMatch?.name || "our stay"}*, rent includes high-speed Wi-Fi, 3 daily meals, daily housekeeping, and zero maintenance. Plus, we can split your security deposit across 2 months!`,
      concessionTip: "Offer split deposit in 2 installments (Zero rent discount to protect margins).",
      suggestedAction: "Split deposit pitched",
    },
    {
      id: "obj-sharing",
      title: "Hesitant on Sharing Room",
      icon: "👥",
      rebuttalScript: `We match roommates by working professional background / IT shift timings so you have complete peace of mind. Every resident gets their own private wardrobe and study desk!`,
      concessionTip: "Highlight roommate compatibility screening and 24-hr room change guarantee.",
      suggestedAction: "Sharing privacy assured",
    },
    {
      id: "obj-commute",
      title: "Distance / Commute Concerns",
      icon: "🚗",
      rebuttalScript: `The property is situated just 8 minutes from major tech parks and metro station, saving you over 45 minutes of Bangalore traffic every day!`,
      concessionTip: "Send Google Maps transit card showing walking distance to main bus/metro stop.",
      suggestedAction: "Commute route shared",
    },
    {
      id: "obj-parents",
      title: "Need to Check with Family",
      icon: "👨‍👩‍👧",
      rebuttalScript: `Understood! I'll share our verified property walk-through video and safety brochure with you on WhatsApp so you can review it with your family right away.`,
      concessionTip: "Schedule callback for 6:00 PM today + send official safety video brochure.",
      suggestedAction: "Parent safety brochure sent",
    },
  ];

  return {
    conversionScore: score,
    temperature,
    temperatureLabel,
    intentRank,
    urgencyText,
    inferredFields: inferred,
    inferredCount: Object.keys(inferred).length,
    topPropertyMatch: topMatch,
    nextBestActions,
    objectionBattlecards,
    baselineClicks: 14,
    optimizedClicks: 2,
    clicksSaved: 12,
    timeSavedSeconds: 110,
  };
}
