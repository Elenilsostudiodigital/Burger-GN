import { useEffect } from "react";
import { refreshSystemMode } from "../lib/systemModeClient";

/** Loads system mode once and arms the next schedule transition. Renders nothing. */
export function SystemModeBoot() {
  useEffect(() => {
    void refreshSystemMode();
  }, []);
  return null;
}
