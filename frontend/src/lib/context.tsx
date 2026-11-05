import { createContext, useContext } from "react";
import type { Dashboard, Locale, Notify, Translate, View } from "./types";

export interface ConsoleContextValue {
  lang: Locale;
  t: Translate;
  notify: Notify;
  refresh: () => void;
  nonce: number;
  dashboard?: Dashboard;
  navigate: (view: View) => void;
  openEvent: (id: string) => void;
}
export const ConsoleContext = createContext<ConsoleContextValue | null>(null);
export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("Console context unavailable");
  return value;
}
