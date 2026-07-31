import { createContext, useContext } from "react";
import type { TourStep } from "./sop-tour-content";

export type HelpTourApi = {
  startTour: (steps: TourStep[]) => void;
  openHelpModal: () => void;
  ensureMenuOpen: (menuLabel: string, sectionLabel?: string) => void;
};

export const HelpTourContext = createContext<HelpTourApi | null>(null);

export function useHelpTour(): HelpTourApi {
  const ctx = useContext(HelpTourContext);
  if (!ctx) {
    return {
      startTour: () => undefined,
      openHelpModal: () => undefined,
      ensureMenuOpen: () => undefined,
    };
  }
  return ctx;
}
