import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface AveniaKybHostedStepProps {
  description: string;
  isOpened: boolean;
  onBack: () => void;
  onDone: () => void;
  onOpen: () => void;
  title: string;
  url: string;
}

export function AveniaKybHostedStep({ description, isOpened, onBack, onDone, onOpen, title, url }: AveniaKybHostedStepProps) {
  function openVerification() {
    window.open(url, "_blank", "noopener,noreferrer");
    onOpen();
  }

  return (
    <>
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-6" />
        </div>
        <div className="max-w-sm space-y-2">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Button onClick={openVerification} type="button" variant={isOpened ? "outline" : "default"}>
          <ExternalLink />
          {isOpened ? "Reopen Avenia" : "Continue to Avenia"}
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onBack} type="button" variant="ghost">
          Back
        </Button>
        <Button disabled={!isOpened} onClick={onDone} type="button">
          I completed this step
        </Button>
      </DialogFooter>
    </>
  );
}
