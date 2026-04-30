import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely, deduplicating conflicting utilities.
 * The `cn()` helper is shadcn/ui's standard className merger.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
