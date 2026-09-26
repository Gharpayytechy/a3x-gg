import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { ClosingBoard } from "@/components/commitments/ClosingBoard";
import { ClosingDesk } from "@/bf100x/ClosingDesk";
import { HowButton } from "@/components/common/HowButton";
import { RoleGuaranteePanel } from "@/components/workflow/RoleGuaranteePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Target } from "lucide-react";

export const Route = createFileRoute("/closing")({
  head: () => ({
    meta: [
      { title: "Closing Mission & AI Desk — Workflow Guarantee | Gharpayy" },
      { name: "description", content: "Paid-booking mission, autonomous AI deal negotiation, auto-generated rental agreements, and deposit processing in one operating screen." },
      { property: "og:title", content: "Closing Mission & AI Desk — Workflow Guarantee" },
      { property: "og:description", content: "Autonomous AI deal analysis, instant rental agreement generator, UPI deposit links, and promise accuracy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClosingPage,
});

function ClosingPage() {
  const navigate = useNavigate();

  const handleOpenLead = (id: string) => {
    navigate({ to: "/tower/leads/$id", params: { id } });
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Closing Mission & AI Desk</h1>
            <HowButton
              withText
              title="What this board is for"
              why="Closing exists to create paid bookings. Promises and calls are execution instruments, not the final result."
              howToExecute={[
                "Start from the paid-booking gap and required closing opportunity supply.",
                "Use the AI Deal Assistant to negotiate discount tokens, generate rental agreements, and share UPI deposit links in 1 click.",
                "Work payment intent, high-intent post-tour customers, room-hold expiry and decision blockers before generic follow-ups.",
                "Every quote must have a dated next action and every promise must be settled or moved with a reason.",
              ]}
              whatNotToDo={["Never use raw call volume as the primary definition of Closing success.", "Never let a payment-ready customer sit behind routine nurture work.", "Never move a close date without writing why."]}
              problemsThatCanOccur={["Closing can be blamed when post-tour opportunity supply is insufficient.", "Optimistic promises can inflate the apparent forecast without payment movement."]}
              branches={[{ condition: "Closing opportunities are below the required input", then: "Raise the upstream shortage: unresolved post-tour outcomes → quote-ready tours → tour-ready customers → supply blockers." }]}
              doneWhen="Paid-booking outcome is achieved or the remaining gap is explicitly classified as upstream, conversion, dependency or execution failure."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Paid-booking outcome first. Autonomous AI deal analysis & deposit desk with commitment-control underneath.
          </p>
        </header>

        <RoleGuaranteePanel role="closing" />

        <ClientOnly fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading closing mission…</p>}>
          <Tabs defaultValue="desk" className="space-y-3">
            <TabsList className="h-8">
              <TabsTrigger value="desk" className="h-7 text-xs gap-1.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
                AI Closing & Deposit Desk
              </TabsTrigger>
              <TabsTrigger value="board" className="h-7 text-xs gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Commitment & Promise Board
              </TabsTrigger>
            </TabsList>

            <TabsContent value="desk" className="mt-3">
              <ClosingDesk onOpenLead={handleOpenLead} />
            </TabsContent>

            <TabsContent value="board" className="mt-3">
              <ClosingBoard />
            </TabsContent>
          </Tabs>
        </ClientOnly>
      </div>
    </AppShell>
  );
}
