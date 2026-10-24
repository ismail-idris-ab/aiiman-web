import { useState, type FormEvent } from "react";
import { login, type User } from "./auth";

export function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (user: User) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await login(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? ""),
    );
    setPending(false);
    if (result.ok) onSignedIn(result.user);
    else setError(result.error);
  }

  return (
    <main>
      <h1>Sign in to Aiiman</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </p>
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
