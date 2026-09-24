// ExpertAIFullScreen.tsx
// Full-screen AI analysis overlay powered by Google Gemini.
// Shows: lead profile, timeline, charts, WhatsApp draft, future potential, recommended actions.

import { useState, useEffect, useCallback } from "react";
import {
  X, Bot, RefreshCw, Copy, Check, ExternalLink,
  TrendingUp, Phone, Calendar, Home, DollarSign,
  Clock, User, Zap, Star, AlertTriangle, CheckCircle,
  MessageCircle, BarChart3, Activity, Target
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell
} from "recharts";
import type { FlowLead } from "@/bookingflow/types";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface GeminiAnalysis {
  summary: string;
  intentScore: number;           // 0-100
  urgencyScore: number;          // 0-100
  budgetFit: number;             // 0-100
  conversionLikelihood: number;  // 0-100
  engagementScore: number;       // 0-100
  futureValue: number;           // 0-100
  profileType: string;           // e.g. "Budget-Conscious Professional"
  keySignals: string[];
  redFlags: string[];
  positiveIndicators: string[];
  recommendedNextSteps: { priority: "HIGH" | "MEDIUM" | "LOW"; action: string; timing: string }[];
  whatsappDraft: string;
  closingScript: string;
  futurePotential: string;
  riskAssessment: string;
  estimatedTimeToClose: string;
  preferredCommunication: string;
  objections: string[];
  objectionHandlers: string[];
}

// â”€â”€â”€ Gemini caller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";

async function runGeminiAnalysis(lead: FlowLead): Promise<GeminiAnalysis> {
  const f = lead.f ?? {};

  // Build rich context for Gemini
  const events = (lead.events ?? []).slice(-20).map(e =>
    `[${new Date(e.at).toLocaleString()}] ${e.actor}: ${e.label}${e.detail ? ` â€” ${e.detail}` : ""}`
  ).join("\n");

  const prompt = `You are an expert real estate CRM analyst for Gharpayy, a co-living property company in India. Analyze this lead and return ONLY valid JSON (no markdown, no explanation).

LEAD DATA:
Name: ${lead.name}
Phone: ${lead.phone}
Stage: ${lead.stage}
Owner: ${lead.owner ?? "unassigned"}
Last Message: "${lead.lastMessage}"
Last Activity: ${lead.lastActivityAt}
Labels: ${lead.labels?.join(", ") || "none"}

CAPTURED FIELDS:
Budget: ${f["budget"] ?? lead.q?.budget ?? "not captured"}
Move-in Date: ${f["moveInDate"] ?? lead.q?.moveIn ?? "not captured"}
Area Preference: ${f["area"] ?? lead.q?.area ?? "not captured"}
Room Type: ${f["roomType"] ?? lead.q?.roomType ?? "not captured"}
Property Selected: ${f["propertyName"] ?? "not selected"}
Bed/Room: ${f["bedNumber"] ?? f["bedRoom"] ?? "not selected"}
Check-in Status: ${f["checkinDay"] ?? "not checked in"}
Channel: ${lead.q?.channel ?? "unknown"}
On WhatsApp: ${lead.q?.onWhatsapp ?? "unknown"}
Tour Readiness: ${f["tourReadiness"] ?? "unknown"}
Customer Response: ${f["customerResponse"] ?? "unknown"}

NEXT STEP: ${lead.nextAction ?? "none set"}
DEADLINE: ${lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString() : "none"}
SLA STATUS: ${lead.nextActionAt && new Date(lead.nextActionAt) < new Date() ? "OVERDUE" : "on time"}

RECENT ACTIVITY LOG (last 20 events):
${events || "No events recorded"}

Return this exact JSON structure:
{
  "summary": "2-3 sentence executive summary of this lead",
  "intentScore": 75,
  "urgencyScore": 60,
  "budgetFit": 80,
  "conversionLikelihood": 65,
  "engagementScore": 70,
  "futureValue": 55,
  "profileType": "Budget-Conscious Working Professional",
  "keySignals": ["signal 1", "signal 2", "signal 3"],
  "redFlags": ["flag 1", "flag 2"],
  "positiveIndicators": ["indicator 1", "indicator 2", "indicator 3"],
  "recommendedNextSteps": [
    {"priority": "HIGH", "action": "specific action", "timing": "Today by 3 PM"},
    {"priority": "MEDIUM", "action": "specific action", "timing": "Within 48 hours"},
    {"priority": "LOW", "action": "specific action", "timing": "This week"}
  ],
  "whatsappDraft": "Hi [Name]! ðŸ‘‹ Full WhatsApp message here...",
  "closingScript": "Phone script to use when calling this lead",
  "futurePotential": "Assessment of long-term value, referrals, repeat business",
  "riskAssessment": "What could cause this lead to drop off",
  "estimatedTimeToClose": "X days",
  "preferredCommunication": "WhatsApp / Call / Email",
  "objections": ["likely objection 1", "likely objection 2"],
  "objectionHandlers": ["how to handle objection 1", "how to handle objection 2"]
}`;

  if (!GEMINI_KEY) {
    // Fallback: return smart local analysis
    return buildLocalAnalysis(lead);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      }
    );
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Strip markdown fences if present
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean) as GeminiAnalysis;
  } catch {
    return buildLocalAnalysis(lead);
  }
}

function buildLocalAnalysis(lead: FlowLead): GeminiAnalysis {
  const f = lead.f ?? {};
  const budget = f["budget"] ?? lead.q?.budget ?? "";
  const area = f["area"] ?? lead.q?.area ?? "";
  const moveIn = f["moveInDate"] ?? lead.q?.moveIn ?? "";
  const roomType = f["roomType"] ?? lead.q?.roomType ?? "";
  const property = f["propertyName"] ?? "";
  const tours = lead.events?.filter(e => /tour|visit/i.test(e.label)).length ?? 0;
  const calls = lead.events?.filter(e => /call|spoke|talk/i.test(e.label)).length ?? 0;
  const isLate = lead.nextActionAt ? new Date(lead.nextActionAt) < new Date() : false;
  const moveInSoon = moveIn ? new Date(moveIn) <= new Date(Date.now() + 7 * 86400000) : false;

  const intentScore = Math.min(100, (budget ? 20 : 0) + (area ? 15 : 0) + (moveIn ? 20 : 0) + (tours * 15) + (calls * 10));
  const urgencyScore = moveInSoon ? 90 : isLate ? 80 : moveIn ? 50 : 30;
  const budgetFit = budget ? 75 : 40;
  const conversionLikelihood = Math.min(100, (intentScore * 0.5) + (tours * 15) + (property ? 20 : 0));
  const engagementScore = Math.min(100, ((lead.events?.length ?? 0) * 5) + (calls * 10));
  const futureValue = lead.labels?.includes("referral") ? 80 : 55;

  return {
    summary: `${lead.name} is a ${budget ? `budget-constrained (${budget})` : "budget-unknown"} lead${area ? ` looking in ${area}` : ""}${moveIn ? ` with a move-in target of ${moveIn}` : ""}. ${tours > 0 ? `${tours} tour(s) completed.` : "No tours yet."} ${isLate ? "âš ï¸ SLA is breached." : "Follow-up is on track."}`,
    intentScore,
    urgencyScore,
    budgetFit,
    conversionLikelihood,
    engagementScore,
    futureValue,
    profileType: budget && area ? "Qualified Prospect" : !budget ? "Warm Interest" : "High-Intent Seeker",
    keySignals: [
      budget ? `Budget declared: ${budget}` : "Budget not captured",
      tours > 0 ? `${tours} tour(s) conducted` : "No tours conducted",
      moveIn ? `Move-in: ${moveIn}` : "Move-in date unknown",
    ].filter(Boolean),
    redFlags: [
      !budget ? "No budget captured" : "",
      isLate ? "SLA is overdue" : "",
      !lead.owner ? "Lead is unowned" : "",
      calls > 3 && !property ? "Multiple calls, no property locked" : "",
    ].filter(Boolean),
    positiveIndicators: [
      tours > 0 ? "Tour completed â€” high intent" : "",
      budget ? "Budget shared â€” qualified lead" : "",
      property ? `Property locked: ${property}` : "",
      lead.owner ? `Assigned to ${lead.owner}` : "",
    ].filter(Boolean),
    recommendedNextSteps: [
      { priority: "HIGH", action: budget && area ? `Share 2-3 matching ${roomType || "rooms"} in ${area} with prices via WhatsApp` : "Capture budget and area preference", timing: "Today" },
      { priority: "MEDIUM", action: tours > 0 ? "Send post-tour follow-up and ask for decision" : "Schedule a site visit", timing: "Within 48 hours" },
      { priority: "LOW", action: "Add to drip follow-up sequence", timing: "This week" },
    ],
    whatsappDraft: `Hi ${lead.name}! ðŸ‘‹\n\nThank you for your interest in Gharpayy co-living spaces${area ? ` in ${area}` : ""}.\n\n${budget ? `We have some great options within ${budget} that I'd love to share with you.` : "I'd love to understand your budget so I can share the best options for you."}\n\n${moveIn ? `Since you're looking at moving in around ${moveIn}, we should act quickly to secure your spot! ðŸ ` : "When are you planning to move in?"}\n\nCan we schedule a quick call or visit today? ðŸ˜Š\n\nBest,\nGharpayy Team`,
    closingScript: `"Hi ${lead.name}, this is [Name] from Gharpayy. I'm calling about your room inquiry${area ? ` in ${area}` : ""}. ${tours > 0 ? "Since you visited us earlier, I wanted to check if you had any questions or concerns I can help with?" : "I wanted to understand your requirements better so I can find you the perfect room."} [Listen] Great! Based on what you've shared, I think [PROPERTY] would be perfect for you. Can I reserve it for you today with just a token amount?"`,
    futurePotential: `${lead.name} has ${lead.labels?.includes("referral") ? "referral potential" : "moderate referral potential"}. ${tours > 0 ? "High engagement suggests satisfied experience." : "If converted, can become a referral source."} Estimated LTV: â‚¹${budget ? parseInt(budget.replace(/\D/g, "")) * 12 || 150000 : 150000}+ (1 year rent).`,
    riskAssessment: `Key risks: ${[!budget ? "Budget unknown" : "", calls > 2 && !property ? "Stalling without property selection" : "", isLate ? "SLA breach may indicate lost interest" : ""].filter(Boolean).join(", ") || "Low risk â€” lead is on track"}.`,
    estimatedTimeToClose: tours > 0 ? "3-5 days" : budget && area ? "7-10 days" : "14-21 days",
    preferredCommunication: lead.q?.onWhatsapp === "Yes" ? "WhatsApp" : "Call",
    objections: ["Price too high", "Location not ideal", "Still exploring options"],
    objectionHandlers: [
      "Offer a â‚¹1,000 discount token valid for 48 hours to create urgency",
      "Share location map and highlight nearby transit/offices",
      "Create FOMO: 'This room has 2 other inquiries this week'"
    ]
  };
}

// â”€â”€â”€ Score Gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ScoreGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-16">
        <svg className="rotate-[-90deg]" width="64" height="64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ - filled} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{value}</span>
      </div>
      <span className="text-center text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ExpertAIFullScreenProps {
  lead: FlowLead;
  onClose: () => void;
}

export function ExpertAIFullScreen({ lead, onClose }: ExpertAIFullScreenProps) {
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "actions" | "whatsapp" | "closing" | "risk">("overview");

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await runGeminiAnalysis(lead);
      setAnalysis(result);
    } catch (e) {
      setError("Analysis failed. Check your Gemini API key.");
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const copyWA = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.whatsappDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openWA = () => {
    if (!analysis || !lead.phone) return;
    const clean = lead.phone.replace(/\D/g, "");
    const url = `https://wa.me/${clean.startsWith("91") ? clean : "91" + clean}?text=${encodeURIComponent(analysis.whatsappDraft)}`;
    window.open(url, "_blank");
  };

  // Chart data
  const radarData = analysis ? [
    { metric: "Intent", value: analysis.intentScore },
    { metric: "Urgency", value: analysis.urgencyScore },
    { metric: "Budget Fit", value: analysis.budgetFit },
    { metric: "Conversion", value: analysis.conversionLikelihood },
    { metric: "Engagement", value: analysis.engagementScore },
    { metric: "Future Val.", value: analysis.futureValue },
  ] : [];

  const timelineData = (lead.events ?? []).slice(-10).map((e, i) => ({
    name: `${i + 1}`,
    label: e.label.slice(0, 20),
    value: 1,
    at: new Date(e.at).toLocaleDateString(),
  }));

  const pieData = analysis ? [
    { name: "Conversion", value: analysis.conversionLikelihood, color: "#22c55e" },
    { name: "Gap", value: 100 - analysis.conversionLikelihood, color: "#e5e7eb" },
  ] : [];

  const TABS = [
    { id: "overview", label: "ðŸ“Š Overview" },
    { id: "actions", label: "âš¡ Actions" },
    { id: "whatsapp", label: "ðŸ’¬ WhatsApp" },
    { id: "closing", label: "ðŸ“ž Call Script" },
    { id: "risk", label: "ðŸŽ¯ Risk & Future" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold">Expert AI Analysis</h1>
            <p className="text-[10px] text-muted-foreground">Powered by Gemini Â· {lead.name} Â· {lead.phone}</p>
          </div>
          {analysis && (
            <Badge
              variant={analysis.conversionLikelihood >= 70 ? "default" : analysis.conversionLikelihood >= 40 ? "secondary" : "destructive"}
              className="text-xs"
            >
              {analysis.profileType}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetch_} className="h-7 gap-1.5 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Re-analyse
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex gap-1 border-b px-6 py-1.5 bg-muted/30">
        {TABS.map(t => (
          <button key={t.id} type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${activeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <Bot className="absolute inset-0 m-auto h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-medium">Gemini is analysing {lead.name}â€¦</p>
            <p className="text-xs text-muted-foreground">Reading lead history, signals, budget & intent</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button size="sm" onClick={fetch_}>Retry</Button>
          </div>
        ) : analysis ? (
          <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">

            {/* â”€â”€â”€ OVERVIEW TAB â”€â”€â”€ */}
            {activeTab === "overview" && (
              <>
                {/* Summary banner */}
                <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
                  <div className="flex items-start gap-3">
                    <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">AI Summary</p>
                      <p className="text-sm leading-relaxed">{analysis.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Score gauges */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead Score Dashboard</p>
                  <div className="grid grid-cols-6 gap-4">
                    <ScoreGauge label="Intent" value={analysis.intentScore} color="#6366f1" />
                    <ScoreGauge label="Urgency" value={analysis.urgencyScore} color="#f59e0b" />
                    <ScoreGauge label="Budget Fit" value={analysis.budgetFit} color="#22c55e" />
                    <ScoreGauge label="Conversion" value={analysis.conversionLikelihood} color="#3b82f6" />
                    <ScoreGauge label="Engagement" value={analysis.engagementScore} color="#8b5cf6" />
                    <ScoreGauge label="Future Val." value={analysis.futureValue} color="#ec4899" />
                  </div>
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Radar */}
                  <div className="col-span-2 rounded-xl border p-4">
                    <p className="mb-2 text-xs font-semibold">Lead Radar</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                        <Radar name="Score" dataKey="value" fill="#6366f1" fillOpacity={0.3} stroke="#6366f1" strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Conversion pie + info */}
                  <div className="rounded-xl border p-4 space-y-3">
                    <p className="text-xs font-semibold">Conversion Likelihood</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" startAngle={90} endAngle={-270}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{analysis.conversionLikelihood}%</p>
                      <p className="text-[10px] text-muted-foreground">likelihood to convert</p>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Time to close</span>
                        <span className="font-medium">{analysis.estimatedTimeToClose}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Best channel</span>
                        <span className="font-medium">{analysis.preferredCommunication}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity timeline bar chart */}
                {timelineData.length > 0 && (
                  <div className="rounded-xl border p-4">
                    <p className="mb-2 text-xs font-semibold">Engagement Timeline ({timelineData.length} recent events)</p>
                    <ResponsiveContainer width="100%" height={80}>
                      <BarChart data={timelineData} barSize={12}>
                        <XAxis dataKey="at" tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(_, __, p) => [p.payload.label, "Event"]} />
                        <Bar dataKey="value" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Signals grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border p-4 space-y-2">
                    <p className="text-xs font-semibold text-green-600 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Positive Signals</p>
                    {analysis.positiveIndicators.filter(Boolean).map((s, i) => (
                      <p key={i} className="text-[11px] flex items-start gap-1.5"><span className="mt-0.5 text-green-500">âœ“</span>{s}</p>
                    ))}
                    {analysis.positiveIndicators.filter(Boolean).length === 0 && <p className="text-[11px] text-muted-foreground">No strong signals yet</p>}
                  </div>
                  <div className="rounded-xl border p-4 space-y-2">
                    <p className="text-xs font-semibold text-blue-600 flex items-center gap-1"><Star className="h-3.5 w-3.5" />Key Signals</p>
                    {analysis.keySignals.filter(Boolean).map((s, i) => (
                      <p key={i} className="text-[11px] flex items-start gap-1.5"><span className="mt-0.5 text-blue-500">â€¢</span>{s}</p>
                    ))}
                  </div>
                  <div className="rounded-xl border p-4 space-y-2">
                    <p className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Red Flags</p>
                    {analysis.redFlags.filter(Boolean).map((s, i) => (
                      <p key={i} className="text-[11px] flex items-start gap-1.5"><span className="mt-0.5 text-red-500">!</span>{s}</p>
                    ))}
                    {analysis.redFlags.filter(Boolean).length === 0 && <p className="text-[11px] text-muted-foreground">No red flags detected</p>}
                  </div>
                </div>
              </>
            )}

            {/* â”€â”€â”€ ACTIONS TAB â”€â”€â”€ */}
            {activeTab === "actions" && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-transparent p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Recommended Next Steps â€” Gemini Prioritised</p>
                  <div className="space-y-3">
                    {analysis.recommendedNextSteps.map((step, i) => (
                      <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${step.priority === "HIGH" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : step.priority === "MEDIUM" ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30" : "border-border bg-muted/30"}`}>
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${step.priority === "HIGH" ? "bg-red-500 text-white" : step.priority === "MEDIUM" ? "bg-yellow-500 text-white" : "bg-muted-foreground text-background"}`}>{i + 1}</div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Badge variant={step.priority === "HIGH" ? "destructive" : step.priority === "MEDIUM" ? "secondary" : "outline"} className="text-[9px]">{step.priority}</Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{step.timing}</span>
                          </div>
                          <p className="text-sm">{step.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Objections */}
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Likely Objections & How to Handle</p>
                  <div className="space-y-3">
                    {analysis.objections.map((obj, i) => (
                      <div key={i} className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-semibold text-destructive mb-1">âŒ "{obj}"</p>
                        <p className="text-xs text-muted-foreground">âœ… <span className="text-foreground">{analysis.objectionHandlers[i] ?? "Handle with empathy and redirect to value."}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* â”€â”€â”€ WHATSAPP TAB â”€â”€â”€ */}
            {activeTab === "whatsapp" && (
              <div className="space-y-4">
                <div className="rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-500" />AI-Drafted WhatsApp Message</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={copyWA}>
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                      <Button size="sm" className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700" onClick={openWA}>
                        <ExternalLink className="h-3 w-3" />Open in WhatsApp
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#dcf8c6] dark:bg-green-950/40 p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground border border-green-200 dark:border-green-900">
                    {analysis.whatsappDraft}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">âœ¨ Message personalised using lead's budget, area, move-in date and engagement history</p>
                </div>
              </div>
            )}

            {/* â”€â”€â”€ CALL SCRIPT TAB â”€â”€â”€ */}
            {activeTab === "closing" && (
              <div className="space-y-4">
                <div className="rounded-xl border p-5">
                  <p className="text-sm font-semibold flex items-center gap-2 mb-3"><Phone className="h-4 w-4 text-blue-500" />AI-Generated Call Script</p>
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm leading-relaxed border border-blue-200 dark:border-blue-900">
                    {analysis.closingScript}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">ðŸ“ž Tailored to this lead's stage, engagement history and likely objections</p>
                </div>
              </div>
            )}

            {/* â”€â”€â”€ RISK & FUTURE TAB â”€â”€â”€ */}
            {activeTab === "risk" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4 space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Risk Assessment</p>
                    <p className="text-sm leading-relaxed">{analysis.riskAssessment}</p>
                  </div>
                  <div className="rounded-xl border p-4 space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5 text-green-600"><TrendingUp className="h-3.5 w-3.5" />Future Potential</p>
                    <p className="text-sm leading-relaxed">{analysis.futurePotential}</p>
                  </div>
                </div>

                {/* Score bar chart */}
                <div className="rounded-xl border p-4">
                  <p className="mb-3 text-xs font-semibold">Comparative Score Breakdown</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart layout="vertical" data={radarData} margin={{ left: 60 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="metric" tick={{ fontSize: 11 }} width={70} />
                      <Tooltip />
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {radarData.map((_, i) => (
                          <Cell key={i} fill={["#6366f1","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899"][i % 6]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </div>
        ) : null}
      </div>

      {/* Bottom bar */}
      {analysis && (
        <div className="shrink-0 border-t bg-muted/20 px-6 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Analysis generated by Gemini 2.0 Flash Â· {new Date().toLocaleTimeString()}</span>
          <span className="flex items-center gap-3">
            <span>Conversion: <strong className="text-foreground">{analysis.conversionLikelihood}%</strong></span>
            <span>Close in: <strong className="text-foreground">{analysis.estimatedTimeToClose}</strong></span>
            <span>Profile: <strong className="text-foreground">{analysis.profileType}</strong></span>
          </span>
        </div>
      )}
    </div>
  );
}
