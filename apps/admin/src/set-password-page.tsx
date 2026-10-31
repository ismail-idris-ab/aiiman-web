import { MIN_PASSWORD_LENGTH } from "@aiiman/shared";
import { useEffect, useState, type FormEvent } from "react";
import {
  checkPasswordLink,
  redeemPasswordLink,
  type LinkKind,
  type User,
} from "./auth";

const INVALID =
  "This link has expired or was already used. Ask an admin for a new one.";
const MISMATCH = "The two passwords don't match";

type State =
  | { status: "checking" }
  | { status: "invalid"; error: string }
  | { status: "ready"; kind: LinkKind; name: string };

/** Choosing a password from a setup or reset link. */
export function SetPasswordPage({
  token,
  onSignedIn,
}: {
  /** Empty when the link was cut short or mistyped. */
  token: string;
  onSignedIn: (user: User) => void;
}) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    if (token === "") {
      setState({ status: "invalid", error: INVALID });
      return;
    }
    void checkPasswordLink(token).then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { status: "ready", kind: result.kind, name: result.name }
          : { status: "invalid", error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("repeat") ?? "")) {
      setFields({ repeat: MISMATCH });
      setError(MISMATCH);
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    const result = await redeemPasswordLink(token, password);
    setPending(false);
    if (result.ok) return onSignedIn(result.user);
    setError(result.error);
    setFields(result.fields);
  }

  if (state.status === "checking") {
    return (
      <main>
        <p role="status">Checking your link…</p>
      </main>
    );
  }

  if (state.status === "invalid") {
    return (
      <main>
        <h1>Choose a password</h1>
        <p role="alert">{state.error}</p>
        <p>
          <a href="/">Go to sign in</a>
        </p>
      </main>
    );
  }

  const passwordError = fields.password;
  const repeatError = fields.repeat;
  return (
    <main>
      <h1>
        {state.kind === "setup"
          ? `Welcome, ${state.name}`
          : `Reset the password for ${state.name}`}
      </h1>
      <p>
        Choose a password. This link works once, so keep the password somewhere
        safe.
      </p>
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="password">New password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            aria-invalid={passwordError === undefined ? undefined : true}
            aria-describedby={
              passwordError === undefined
                ? "password-hint"
                : "password-hint password-error"
            }
          />
          <br />
          <small id="password-hint">
            At least {MIN_PASSWORD_LENGTH} characters. A few unrelated words
            work well.
          </small>
          {passwordError === undefined ? null : (
            <>
              <br />
              <small id="password-error">{passwordError}</small>
            </>
          )}
        </p>
        <p>
          <label htmlFor="repeat">Repeat the password</label>
          <br />
          <input
            id="repeat"
            name="repeat"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={repeatError === undefined ? undefined : true}
            aria-describedby={
              repeatError === undefined ? undefined : "repeat-error"
            }
          />
          {repeatError === undefined ? null : (
            <>
              <br />
              <small id="repeat-error">{repeatError}</small>
            </>
          )}
        </p>
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save password and sign in"}
        </button>
      </form>
    </main>
  );
}
