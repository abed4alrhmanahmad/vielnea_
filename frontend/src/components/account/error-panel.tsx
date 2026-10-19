import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared failure state for the account pages, with a retry. */
export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-destructive/30 bg-destructive/5 rounded p-6 text-center">
      <AlertCircle className="size-8 mx-auto text-destructive mb-3" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          className="mt-4 uppercase tracking-[0.2em] text-xs"
        >
          Try again
        </Button>
      )}
    </div>
  );
}
