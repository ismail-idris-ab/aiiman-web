/** Form contract shared by the client form and the server logic. No dependencies, so the client bundle stays small. */

export const FIELD = {
  email: "email",
  /** Honeypot: visually hidden, people leave it empty. */
  honeypot: "website",
  /** Epoch ms when the form became interactive (set client-side). */
  startedAt: "started_at",
} as const;

export type SubscribeStatus =
  "idle" | "success" | "invalid" | "rate_limited" | "error";

export interface SubscribeState {
  status: SubscribeStatus;
  message: string;
}

export const initialSubscribeState: SubscribeState = {
  status: "idle",
  message: "",
};
