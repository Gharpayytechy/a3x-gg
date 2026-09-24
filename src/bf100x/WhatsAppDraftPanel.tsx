import { useEffect, useState } from "react";
import { Copy, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FlowLead } from "@/bookingflow/types";
import { copyText, waLink, WaMark } from "@/components/common/ContactActions";

export type DraftProfile =
  | "Tour Confirmation"
  | "Price & Amenities Sharing"
  | "Follow-up Reminder"
  | "Location Shared"
  | "Booking Token";

export const DRAFT_PROFILES: { id: DraftProfile; label: string; icon: string }[] = [
  { id: "Tour Confirmation", label: "Tour Confirmation", icon: "🗓️" },
  { id: "Price & Amenities Sharing", label: "Price & Amenities Sharing", icon: "💰" },
  { id: "Follow-up Reminder", label: "Follow-up Reminder", icon: "⏰" },
  { id: "Location Shared", label: "Location Shared", icon: "📍" },
  { id: "Booking Token", label: "Booking Token", icon: "🔑" },
];

export function buildDraftMessage(lead: FlowLead | null | undefined, profile: DraftProfile): string {
  if (!lead) {
    return "Please select a customer from the booking flow queue to generate an automated WhatsApp message draft.";
  }

  const name = lead.name?.trim() || "Customer";
  const f = lead.f ?? {};
  const property = f["property"] || f["area"] || "Gharpayy Stay";
  const room = f["lockedRoom"] || f["propertyRoom"] || f["roomType"] || "sharing room";
  const moveIn = f["bookingMoveIn"] || f["moveIn"] || "this week";
  const budgetVal = f["rent"] || f["budget"];
  const budget = budgetVal ? `₹${Number(budgetVal).toLocaleString("en-IN")}` : "affordable monthly rent";
  const tourTime = f["tourAt"] ? new Date(f["tourAt"]).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "scheduled time";
  const tourHost = f["tourHost"] || lead.owner || "our property manager";

  switch (profile) {
    case "Tour Confirmation":
      return `Hi ${name}! 🏡\n\nYour property visit for ${property} (${room}) is scheduled for ${tourTime} with ${tourHost}.\n\nPlease let us know if you need location guidance or wish to adjust the schedule!\n\nBest regards,\nGharpayy Team`;

    case "Price & Amenities Sharing":
      return `Hi ${name}! 👋\n\nHere are the details for your stay at ${property} (${room}):\n💰 Rent: ${budget}/month\n✨ Amenities: High-speed Wi-Fi, 3 daily meals, housekeeping, laundry & 24/7 security.\n📅 Available Move-in: ${moveIn}.\n\nLet us know if you'd like to visit the property today!`;

    case "Follow-up Reminder":
      return `Hi ${name}, following up regarding your accommodation requirement around ${property}.\n\nWe currently have a few premium ${room} slots available for move-in on ${moveIn}. Would you be free for a quick 2-minute call or property visit today?`;

    case "Location Shared":
      return `Hi ${name}! 📍\n\nHere is the location details for ${property} (${room}):\nLocality: ${property}.\nSituated close to major corporate offices, transit points, and dining hubs.\n\nPlease drop us a message when you arrive or if you need directions!`;

    case "Booking Token":
      return `Hi ${name}! 🎉\n\nWe are ready to reserve your ${room} at ${property} for move-in on ${moveIn}.\n\nRent Details: ${budget}/month.\nKindly confirm your interest so we can issue your official booking link and token receipt.`;

    default:
      return `Hi ${name}, thank you for contacting Gharpayy! Let us know how we can assist your move-in at ${property}.`;
  }
}

export function WhatsAppDraftPanel({ lead }: { lead?: FlowLead | null }) {
  const [profile, setProfile] = useState<DraftProfile>("Tour Confirmation");
  const [customDraft, setCustomDraft] = useState<string>("");
  const [isEdited, setIsEdited] = useState(false);

  useEffect(() => {
    if (lead) {
      setCustomDraft(buildDraftMessage(lead, profile));
      setIsEdited(false);
    } else {
      setCustomDraft("Please select a customer from the left panel to auto-generate a WhatsApp message.");
      setIsEdited(false);
    }
  }, [lead?.id, profile]);

  const handleProfileChange = (p: DraftProfile) => {
    setProfile(p);
    if (lead) {
      setCustomDraft(buildDraftMessage(lead, p));
      setIsEdited(false);
    }
  };

  const handleReset = () => {
    if (lead) {
      setCustomDraft(buildDraftMessage(lead, profile));
      setIsEdited(false);
      toast.info("Draft reset to default template");
    }
  };

  const handleCopyAndSend = async () => {
    if (!lead || !lead.phone) {
      toast.error("No active lead selected with a valid phone number");
      return;
    }

    const textToSend = customDraft.trim();
    if (!textToSend) {
      toast.error("Drafted message is empty");
      return;
    }

    // 1. Copy text to clipboard
    await copyText(textToSend, "Drafted WhatsApp message");

    // 2. Open wa.me link in new browser tab
    const url = waLink(lead.phone, textToSend);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.error("Invalid phone number for WhatsApp");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-muted/20 p-3 sm:p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <WaMark className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold">Automated WhatsApp Drafter</h2>
            <p className="text-[10px] text-muted-foreground">
              {lead ? `Auto-compiling for ${lead.name} (${lead.phone})` : "Select a customer to auto-draft"}
            </p>
          </div>
        </div>
        {lead && (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600 dark:text-emerald-400">
            Live Lead Data
          </Badge>
        )}
      </div>

      {/* Customer summary strip */}
      {lead && (
        <div className="mt-3 rounded-md border bg-background/60 p-2 text-[11px] grid grid-cols-2 gap-1.5">
          <div><span className="text-muted-foreground">Property:</span> <span className="font-medium">{lead.f?.["property"] || lead.f?.["area"] || "Gharpayy Stay"}</span></div>
          <div><span className="text-muted-foreground">Room/Bed:</span> <span className="font-medium">{lead.f?.["lockedRoom"] || lead.f?.["propertyRoom"] || lead.f?.["roomType"] || "Sharing room"}</span></div>
          <div><span className="text-muted-foreground">Move-in:</span> <span className="font-medium">{lead.f?.["bookingMoveIn"] || lead.f?.["moveIn"] || "this week"}</span></div>
          <div><span className="text-muted-foreground">Budget:</span> <span className="font-medium">{lead.f?.["rent"] || lead.f?.["budget"] ? `₹${lead.f?.["rent"] || lead.f?.["budget"]}` : "Standard"}</span></div>
        </div>
      )}

      {/* Profile Chips */}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Customer Profile / Message Template:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DRAFT_PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProfileChange(p.id)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition font-medium",
                profile === p.id
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Drafted Message Textarea */}
      <div className="mt-3 flex flex-1 flex-col space-y-1.5 min-h-[14rem]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Drafted Message (Auto-populated):
          </label>
          {isEdited && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Reset to original template"
            >
              <RefreshCw className="h-3 w-3" /> Reset template
            </button>
          )}
        </div>

        <Textarea
          value={customDraft}
          onChange={(e) => {
            setCustomDraft(e.target.value);
            setIsEdited(true);
          }}
          placeholder="Drafted message will appear here..."
          className="flex-1 min-h-[12rem] resize-none font-mono text-xs leading-relaxed bg-background"
        />
      </div>

      {/* Action Bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-xs font-medium gap-1.5 shadow-sm"
          disabled={!lead || !lead.phone}
          onClick={handleCopyAndSend}
        >
          <WaMark className="h-4 w-4" />
          <span>📋 Copy &amp; Send via WhatsApp</span>
          <ExternalLink className="ml-auto h-3 w-3 opacity-70" />
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs gap-1"
          disabled={!customDraft.trim()}
          onClick={() => copyText(customDraft, "Message draft")}
        >
          <Copy className="h-3 w-3" />
          <span>Copy text</span>
        </Button>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground text-center">
        Tip: Drag the vertical divider bar on the left to resize this panel.
      </p>
    </div>
  );
}
