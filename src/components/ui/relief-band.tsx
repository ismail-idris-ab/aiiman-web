import { useId } from "react";

/**
 * Decorative band after Kano and Zaria wall reliefs (zanen bango): a zigzag
 * ridge with alternating hollow and solid lozenges. Used sparingly as a rule.
 */
export function ReliefBand({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`block h-3 w-full text-accent ${className}`}
    >
      <defs>
        <pattern id={id} width="24" height="12" patternUnits="userSpaceOnUse">
          <path
            d="M0 11 6 1l6 10 6-10 6 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <path
            d="M6 7.5 8 10 6 12.5 4 10Z"
            fill="currentColor"
            transform="translate(0 -1.5)"
          />
          <path
            d="M18 3.5 20 6 18 8.5 16 6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            transform="translate(0 1.5)"
          />
        </pattern>
      </defs>
      <rect width="100%" height="12" fill={`url(#${id})`} />
    </svg>
  );
}
