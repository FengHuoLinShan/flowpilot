import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function asList<T = Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items)
  )
    return (value as { items: T[] }).items;
  return [];
}
export const shortId = (value?: string) =>
  value ? value.slice(0, 8).toUpperCase() : "—";
export function display(value: unknown, fallback = "—"): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
export function dateTime(value: unknown, lang: "zh" | "en", short = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(
    lang === "zh" ? "zh-CN" : "en-GB",
    short
      ? { timeZone: "Asia/Shanghai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        },
  ).format(date);
}
