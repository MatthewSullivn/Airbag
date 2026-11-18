// A demo button was pressed: say so on the big number at once, because the answer takes a few seconds.
import { useEffect, useState } from "react";
import type { Status } from "@/lib/api";

interface Pressed { kind: "push" | "reset"; at: number; line: number | null; move: number | null }

/**
 * `lastMove` is the time of Airbag's latest move for this loan. The note clears when the loan's line has moved,
 * when the bot has answered (its save can put the line right back where it was), or after 15 s.
 */
export function usePressed(status: Status | null, lastMove: number | null) {
  const [pressed, setPressed] = useState<Pressed | null>(null);
  const lineNow = status?.reading?.line ?? null;
  useEffect(() => {
    if (!pressed) return;
    if ((lineNow != null && pressed.line != null && Math.abs(lineNow - pressed.line) > 1) || lastMove !== pressed.move) { setPressed(null); return; }
    const t = setTimeout(() => setPressed(null), Math.max(0, 15_000 - (Date.now() - pressed.at)));
    return () => clearTimeout(t);
  }, [pressed, lineNow, lastMove]);
  return {
    /** What to show on the number while waiting, e.g. "Pushing the loan…" */
    pending: pressed ? (pressed.kind === "push" ? "Pushing the loan…" : "Resetting…") : null,
    press: (kind: "push" | "reset") => setPressed({ kind, at: Date.now(), line: lineNow, move: lastMove }),
    clear: () => setPressed(null),
  };
}
