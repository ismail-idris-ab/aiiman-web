import { useEffect, useState } from "react";
import { currentUser, logout, type User } from "./auth";
import { HealthPanel } from "./health-panel";
import { LoginPage } from "./login-page";
import { PostEditor } from "./post-editor";
import { PostsPage } from "./posts-page";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

/** Which screen a signed-in user sees; an editor without an id is a new post. */
type View = { name: "posts" } | { name: "editor"; id: string | undefined };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [view, setView] = useState<View>({ name: "posts" });

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
      {view.name === "posts" ? (
        <PostsPage onOpen={(id) => setView({ name: "editor", id })} />
      ) : (
        <PostEditor
          // A fresh editor per post, so no state leaks between them.
          key={view.id ?? "new"}
          id={view.id}
          user={state.user}
          onBack={() => setView({ name: "posts" })}
        />
      )}
      <HealthPanel />
    </main>
  );
}
