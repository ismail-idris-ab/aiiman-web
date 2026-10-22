import { useEffect, useState } from "react";
import { currentUser, logout, type User } from "./auth";
import { HealthPanel } from "./health-panel";
import { LoginPage } from "./login-page";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void currentUser().then((user) => {
      if (!active) return;
      setState(
        user === null
          ? { status: "signed-out" }
          : { status: "signed-in", user },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (state.status === "signed-out") {
    return (
      <LoginPage
        onSignedIn={(user) => setState({ status: "signed-in", user })}
      />
    );
  }

  return (
    <main>
      <h1>Aiiman admin</h1>
      <p>
        Signed in as {state.user.name} ({state.user.role}).{" "}
        <button
          type="button"
          onClick={async () => {
            await logout();
            setState({ status: "signed-out" });
          }}
        >
          Sign out
        </button>
      </p>
      <HealthPanel />
    </main>
  );
}
