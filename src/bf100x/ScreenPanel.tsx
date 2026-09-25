// Four or five questions on one screen. Same options, same rules, fewer clicks:
// picking an option saves itself, auto-advances to the next question, and hotkeys 1-5 enable zero-mouse operation.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, History, Lock, RotateCcw, Sparkles, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isExtraRequired, isStepDone, missingOn } from "@/bookingflow/journey";
import type { JStep } from "@/bookingflow/journey";
import type { FlowLead } from "@/bookingflow/types";
import { useBookingFlow } from "@/bookingflow/store";
import { SCREENS, currentScreen, screenIndex, screenProgress } from "./screens";
import type { Screen } from "./screens";
import { extractLeadInferences } from "./AIEngine";

const inputType = (kind: JStep["kind"] | "TEXT" | "NUMBER" | "DATE" | "DATETIME") =>
  kind === "DATE" ? "date" : kind === "DATETIME" ? "datetime-local" : kind === "NUMBER" ? "number" : "text";

const fieldsOf = (st: JStep) => [st.field, ...(st.extra ?? []).map((x) => x.field)];

const DISQUALIFY_PRESETS = [
  { label: "Cut Call on Face", icon: "📞", desc: "Customer disconnected call abruptly" },
  { label: "Wrong Number", icon: "❌", desc: "Invalid / wrong contact person" },
  { label: "Budget Too Low", icon: "💸", desc: "Budget significantly below minimum PG pricing" },
  { label: "Not Interested", icon: "🚫", desc: "No longer looking or already booked elsewhere" },
];

export function ScreenPanel({
  lead,
  screen,
  expert,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  lead: FlowLead;
  screen: Screen;
  expert: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const { answerStep, editFields, disqualifyLead, reopenLead, me } = useBookingFlow();
  const f = lead.f ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isDisqualifying, setIsDisqualifying] = useState(false);
  const [customReason, setCustomReason] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [activeStepKey, setActiveStepKey] = useState<string>("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft({});
    setIsDisqualifying(false);
    setCustomReason("");
    setShowCustomInput(false);
  }, [screen.id, lead.id]);

  const isDisqualified = lead.stage === "Closed / Disqualified" || lead.f?.fastDisqualified === "YES" || Boolean(lead.closedReason);

  const now = currentScreen(f);
  const idx = screenIndex(screen.id);
  const nowIdx = screenIndex(now.id);
  const locked = idx > nowIdx && !expert;
  const p = screenProgress(f, screen);
  const val = (k: string) => draft[k] ?? f[k] ?? "";
  const put = (k: string, v: string) => setDraft((s) => ({ ...s, [k]: v }));

  const merged = useMemo(() => ({ ...f, ...draft }), [f, draft]);

  // Set default active step to the first unanswered step on the screen
  useEffect(() => {
    const firstUnanswered = screen.steps.find((st) => !isStepDone(f, st)) ?? screen.steps[0];
    if (firstUnanswered) setActiveStepKey(firstUnanswered.key);
  }, [screen.id, f]);

  /** Writes one step's answers to the timeline. Returns false if it is half-filled. */
  function commit(st: JStep, source: Record<string, string>, quiet = false) {
    const full = { ...f, ...source };
    if (!full[st.field]) {
      if (!quiet) toast.error(`${st.title} still needs an answer`);
      return false;
    }
    const missingExtra = (st.extra ?? []).filter((x) => !full[x.field] && isExtraRequired(full, st, x.field));
    if (missingExtra.length) {
      if (!quiet) toast.error(`${st.title}: also fill ${missingExtra.map((m) => m.label).join(", ")}`);
      return false;
    }
    const payload: Record<string, string> = {};
    fieldsOf(st).forEach((k) => {
      if (source[k] !== undefined && source[k] !== f[k]) payload[k] = source[k]!;
    });
    if (Object.keys(payload).length === 0) return true;
    if (isStepDone(f, st)) editFields(lead.id, payload, "corrected on the 100x screen", st.key);
    else answerStep(lead.id, st.key, payload);
    return true;
  }

  /** Typed answers save themselves — on Enter, or the moment focus leaves the box. */
  function commitTyped(st: JStep) {
    if (!fieldsOf(st).some((k) => draft[k] !== undefined && draft[k] !== f[k])) return;
    if (!commit(st, draft, true)) return;
    setDraft((s) => {
      const copy = { ...s };
      fieldsOf(st).forEach((k) => delete copy[k]);
      return copy;
    });
    toast.success(`${st.title} saved`);
  }

  /** One click on an option is the answer — saves it and auto-advances to the next question */
  function chooseOption(st: JStep, value: string) {
    const nextDraft = { ...draft, [st.field]: value };
    const full = { ...f, ...nextDraft };
    const stillNeeded = (st.extra ?? []).filter((x) => !full[x.field] && isExtraRequired(full, st, x.field));
    
    if (stillNeeded.length === 0 && commit(st, nextDraft, true)) {
      setDraft((s) => {
        const copy = { ...s };
        fieldsOf(st).forEach((k) => delete copy[k]);
        return copy;
      });
      toast.success(`${st.title} saved`);

      // Auto-advance to the next question or screen
      const currentStepIdx = screen.steps.findIndex((s) => s.key === st.key);
      const remainingSteps = screen.steps.slice(currentStepIdx + 1);
      const nextStep = remainingSteps.find((s) => !isStepDone({ ...full, [st.field]: value }, s));

      if (nextStep) {
        setActiveStepKey(nextStep.key);
        const el = document.getElementById(`step-box-${nextStep.key}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        // Check if any other step on screen is incomplete
        const anyUnanswered = screen.steps.find((s) => !isStepDone({ ...full, [st.field]: value }, s));
        if (anyUnanswered) {
          setActiveStepKey(anyUnanswered.key);
          const el = document.getElementById(`step-box-${anyUnanswered.key}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (canNext) {
          onNext?.();
        }
      }
      return;
    }
    setDraft(nextDraft);
  }

  function saveAll(silent = false) {
    const touched = screen.steps.filter((st) =>
      fieldsOf(st).some((k) => draft[k] !== undefined && draft[k] !== f[k]),
    );
    if (touched.length === 0) {
      if (!silent) toast.error("Answer at least one question on this screen first");
      return touched.length === 0;
    }
    for (const st of touched) if (!commit(st, draft)) return false;
    setDraft({});
    toast.success(`${touched.length} ${touched.length === 1 ? "answer" : "answers"} saved on one screen`);
    return true;
  }

  const saveAndNext = useCallback(() => {
    if (Object.keys(draft).length > 0 && !saveAll(true)) return;
    if (canNext) onNext?.();
    else toast.success("This is the last screen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, canNext, onNext]);

  /** 1-click Fast Disqualify Execution */
  function executeFastDisqualify(reason: string, custom?: string) {
    disqualifyLead(lead.id, reason, custom);
    setIsDisqualifying(false);
    setShowCustomInput(false);
    setCustomReason("");
    toast.success(`Disqualified: ${reason}`);
  }

  /** Enter moves to the next box, and from the last box to the next screen. */
  function focusNextField(from: HTMLElement) {
    const list = rootRef.current?.querySelectorAll("input:not([disabled])");
    const boxes: HTMLInputElement[] = list ? (Array.from(list) as HTMLInputElement[]) : [];
    const i = boxes.indexOf(from as HTMLInputElement);
    const next: HTMLInputElement | undefined = i >= 0 ? boxes[i + 1] : undefined;
    if (next) {
      next.focus();
      next.select?.();
      return;
    }
    saveAndNext();
  }

  const handleAutoPilot = useCallback(() => {
    const inferred = extractLeadInferences(lead);
    const count = Object.keys(inferred).length;
    editFields(lead.id, inferred, "AI Auto-Pilot Inferred from chat history");
    toast.success(`🤖 AI Auto-Pilot: Inferred ${count} fields automatically!`);
  }, [lead, editFields]);

  // Keyboard Hotkeys: 1-5 for options on active step, A for Auto-Pilot, D for DQ, Enter for Next, arrows for screens
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveAndNext();
        return;
      }
      if (e.key === "Enter" && !typing && el?.tagName !== "BUTTON") {
        e.preventDefault();
        saveAndNext();
        return;
      }
      if (!typing && (e.key === "ArrowRight" || e.key === "PageDown")) {
        e.preventDefault();
        saveAndNext();
        return;
      }
      if (!typing && (e.key === "ArrowLeft" || e.key === "PageUp")) {
        e.preventDefault();
        if (canPrev) onPrev?.();
        return;
      }

      // Hotkey 'a' or 'A' for Auto-Pilot
      if (!typing && !isDisqualified && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        handleAutoPilot();
        return;
      }

      // Hotkey 'd' or 'D' for Fast Disqualify Toggle
      if (!typing && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        setIsDisqualifying((v) => !v);
        return;
      }

      // Hotkeys 1-5 for choice options on active step
      if (!typing && !isDisqualified && !isDisqualifying && ["1", "2", "3", "4", "5"].includes(e.key)) {
        const activeStep = screen.steps.find((s) => s.key === activeStepKey) || screen.steps.find((s) => !isStepDone(f, s));
        if (activeStep && activeStep.kind === "CHOICE" && activeStep.options) {
          const optIdx = parseInt(e.key, 10) - 1;
          const targetOpt = activeStep.options[optIdx];
          if (targetOpt) {
            e.preventDefault();
            chooseOption(activeStep, targetOpt.value);
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAndNext, canPrev, onPrev, activeStepKey, screen.steps, f, isDisqualified, isDisqualifying, handleAutoPilot]);

  const nav = (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!canPrev} onClick={() => onPrev?.()}>
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />Previous
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!canNext} onClick={saveAndNext}>
        Save &amp; Next<ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Card className="p-3.5 space-y-3" ref={rootRef}>
      {/* Header bar with Efficiency Badge, Auto-Pilot & Fast Disqualify Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] font-medium">Screen {idx + 1}/{SCREENS.length}</Badge>
          <Badge variant="secondary" className="text-[10px] font-semibold">{screen.title}</Badge>
          <Badge variant="outline" className="text-[10px]">{p.done}/{p.total} answered</Badge>
          {locked && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />Opens after “{now.title}”</Badge>}
          {idx === nowIdx && <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/20">Active Step</Badge>}
        </div>

        <div className="flex items-center gap-1.5">
          {!isDisqualified && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] font-semibold text-primary border-primary/40 bg-primary/5 hover:bg-primary/15 gap-1"
              onClick={handleAutoPilot}
              title="Shortcut: Press 'A'"
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>🤖 Auto-Pilot (A)</span>
            </Button>
          )}

          <Button
            size="sm"
            variant={isDisqualified ? "destructive" : isDisqualifying ? "secondary" : "outline"}
            className={cn(
              "h-7 px-2 text-[11px] font-semibold transition border-destructive/40",
              (isDisqualifying || isDisqualified)
                ? "border-destructive text-destructive bg-destructive/10 hover:bg-destructive/20"
                : "text-destructive hover:bg-destructive/10"
            )}
            onClick={() => setIsDisqualifying((v) => !v)}
            title="Shortcut: Press 'D'"
          >
            <Zap className="mr-1 h-3 w-3 text-destructive" />
            ⚡ Fast DQ (D)
          </Button>

          {nav}
        </div>
      </div>

      {/* ── 1. Disqualified Lead Card (with 1-Click Revoke & Reopen) ── */}
      {isDisqualified ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive" className="text-xs font-semibold px-2 py-0.5">Closed / Disqualified</Badge>
              <span className="text-xs font-semibold text-destructive">
                Reason: {lead.closedReason || lead.f?.disqualifyReason || "Disqualified"}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs border-primary/40 text-primary hover:bg-primary/10 font-semibold"
              onClick={() => {
                reopenLead(lead.id);
                setIsDisqualifying(false);
                setCustomReason("");
                toast.success("Lead re-opened — full question form restored");
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              🔄 Revoke &amp; Re-open
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Disqualified at {lead.disqualifiedAt ? new Date(lead.disqualifiedAt).toLocaleString() : lead.lastActionAt ? new Date(lead.lastActionAt).toLocaleString() : "just now"} · Operator: {lead.disqualifiedBy || lead.owner || me}
          </p>
          <p className="text-[11px] text-muted-foreground bg-background/50 p-2 rounded border border-border/50">
            ℹ️ All question steps are collapsed to keep your workspace clean. If this customer responds or requests a tour, click <b>"🔄 Revoke &amp; Re-open"</b> to immediately restore all questionnaire fields.
          </p>
        </div>
      ) : isDisqualifying ? (
        /* ── 2. Fast Disqualify Preset Chips (1-Click Instant Dismissal) ── */
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> 1-Click Fast Disqualify / Call Drop
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click any preset chip to instantly disqualify and record timestamped event trail.
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:bg-destructive/10" onClick={() => setIsDisqualifying(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DISQUALIFY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => executeFastDisqualify(p.label)}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-destructive/25 bg-background text-left hover:border-destructive hover:bg-destructive/10 transition group"
              >
                <span className="text-base leading-none pt-0.5">{p.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-destructive group-hover:underline">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{p.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Custom Reason Toggle */}
          <div className="pt-2 border-t border-destructive/20 flex flex-wrap items-center justify-between gap-2">
            {!showCustomInput ? (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Need custom / other reason?
              </button>
            ) : (
              <div className="flex w-full items-center gap-2">
                <Input
                  type="text"
                  autoFocus
                  placeholder="Specify custom disqualification reason…"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="h-8 text-xs bg-background flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customReason.trim()) {
                      executeFastDisqualify("Other", customReason.trim());
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 px-3 text-xs"
                  disabled={!customReason.trim()}
                  onClick={() => executeFastDisqualify("Other", customReason.trim())}
                >
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setShowCustomInput(false)}>
                  Cancel
                </Button>
              </div>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground ml-auto" onClick={() => setIsDisqualifying(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : locked ? (
        <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          Finish “{now.title}” first. Still needed there: {now.steps.flatMap((s) => missingOn(f, s)).join(", ") || "an answer"}.
        </p>
      ) : (
        /* ── 3. Question Steps with Auto-Advance & Hotkey Badges [1] [2] [3] ── */
        <div className="space-y-3">
          {screen.steps.map((st, i) => {
            const done = isStepDone(f, st);
            const isActive = activeStepKey === st.key;

            return (
              <div
                key={st.key}
                id={`step-box-${st.key}`}
                onClick={() => setActiveStepKey(st.key)}
                className={cn(
                  "rounded-lg border p-3 transition",
                  isActive ? "border-primary ring-1 ring-primary/20 bg-card" : "border-border",
                  done && "bg-muted/20",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                  <p className="text-sm font-semibold">{st.question}</p>
                  {done && (
                    <Badge className="bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 font-medium">
                      <Check className="mr-1 h-3 w-3" />done
                    </Badge>
                  )}
                  {isActive && <Badge variant="outline" className="text-[9px] border-primary text-primary">Focused [1-5 to answer]</Badge>}
                  <span className="ml-auto text-[10px] text-muted-foreground">waiting on {st.waitingOn}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{st.help}</p>

                {st.kind === "CHOICE" ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {st.options?.map((o, optIdx) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => chooseOption(st, o.value)}
                        title={o.hint}
                        className={cn(
                          "group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition font-medium",
                          val(st.field) === o.value
                            ? "border-primary bg-primary/15 text-primary shadow-xs"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          o.effect && "border-destructive/40",
                        )}
                      >
                        {isActive && optIdx < 5 && (
                          <span className="text-[9px] font-mono opacity-60 bg-muted px-1 rounded-sm border border-border">
                            {optIdx + 1}
                          </span>
                        )}
                        <span>{o.label}</span>
                        {o.effect === "ESCALATE" && <span className="text-destructive text-[10px]">→ Tower</span>}
                        {o.effect === "CLOSE" && <span className="text-destructive text-[10px]">→ closes</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    className="mt-2 h-8 max-w-xs text-xs bg-background"
                    type={inputType(st.kind)}
                    placeholder={st.placeholder}
                    value={val(st.field)}
                    onChange={(e) => put(st.field, e.target.value)}
                    onBlur={() => commitTyped(st)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      commitTyped(st);
                      if (e.ctrlKey || e.metaKey) saveAndNext();
                      else focusNextField(e.currentTarget);
                    }}
                  />
                )}

                <div className="mt-2 flex flex-wrap gap-3">
                  {(st.extra ?? []).map((x) => (
                    <label key={x.field} className="text-[11px]">
                      <span className="text-muted-foreground">{x.label}{isExtraRequired(merged, st, x.field) ? " *" : ""}</span>
                      <Input
                        className="mt-1 h-8 w-[13rem] text-xs bg-background"
                        type={inputType(x.kind)}
                        placeholder={x.placeholder}
                        value={val(x.field)}
                        onChange={(e) => put(x.field, e.target.value)}
                        onBlur={() => commitTyped(st)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          commitTyped(st);
                          if (e.ctrlKey || e.metaKey) saveAndNext();
                          else focusNextField(e.currentTarget);
                        }}
                      />
                    </label>
                  ))}
                </div>

                <StepHistory lead={lead} stepKey={st.key} />

                {!done && missingOn(merged, st).length > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3" />Still missing: {missingOn(merged, st).join(", ")}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => saveAll()}>Save this screen</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}>
                Clear edits
              </Button>
              {nav}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Hotkeys: <b>1-5</b> selects option &amp; auto-advances · <b>Enter / Ctrl+Enter</b> saves &amp; moves on
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Who changed this answer, when, and what it was before. */
function StepHistory({ lead, stepKey }: { lead: FlowLead; stepKey: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const rows = (lead.events ?? []).filter((e) => e.stepKey === stepKey);
  if (rows.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline">
        <History className="h-3 w-3" />{rows.length} change{rows.length === 1 ? "" : "s"} · last by {rows[rows.length - 1]!.actor}
      </button>
      {open && (
        <ol className="mt-1 space-y-0.5 rounded-md border bg-muted/30 p-2 text-[10px]">
          {[...rows].reverse().map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.actor}</span> · {mounted ? new Date(e.at).toLocaleString() : ""}
              {e.changes?.length
                ? ` — ${e.changes.map((c) => `${c.field}: ${c.from || "empty"} → ${c.to}`).join(", ")}`
                : e.detail ? ` — ${e.detail}` : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

