"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { subscribeAction } from "@/app/actions/newsletter";
import { FIELD, initialSubscribeState } from "@/lib/newsletter/fields";

/** Works without JavaScript (plain form POST to the Server Action); JS adds pending state and inline status. */
export function NewsletterForm() {
  const [state, formAction, pending] = useActionState(
    subscribeAction,
    initialSubscribeState,
  );
  const startedAt = useRef<HTMLInputElement>(null);
  const id = useId();
  const emailId = `${id}-email`;
  const statusId = `${id}-status`;
  const invalid = state.status === "invalid";

  useEffect(() => {
    if (startedAt.current) startedAt.current.value = String(Date.now());
  }, []);

  return (
    <form action={formAction} className="mt-4">
      <label htmlFor={emailId} className="block text-sm font-medium">
        Email address
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name={FIELD.email}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={statusId}
          className="min-h-11 w-full rounded-md border border-muted bg-background px-3 text-foreground sm:max-w-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-accent px-5 font-medium text-background hover:opacity-90 disabled:opacity-70"
        >
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {/* Honeypot: off-screen and out of the tab order; people never fill it. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name={FIELD.honeypot}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input
        ref={startedAt}
        type="hidden"
        name={FIELD.startedAt}
        defaultValue=""
      />
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-6 text-sm ${invalid || state.status === "error" || state.status === "rate_limited" ? "font-medium text-foreground" : "text-muted"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
