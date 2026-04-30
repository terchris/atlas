/**
 * Minimal classname joiner. Filters out falsy values; joins with spaces.
 *
 * Used by the Table primitives. Avoids the `clsx` + `tailwind-merge`
 * dependency that shadcn's default `cn()` pulls in — for the customer
 * app's small surface area, the basic version suffices and keeps the
 * dependency footprint forkable.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
