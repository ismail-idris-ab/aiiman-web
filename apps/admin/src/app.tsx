import { can } from "@aiiman/shared";
import { useEffect, useState } from "react";
import { currentUser, linkToken, logout, type User } from "./auth";
import { HealthPanel } from "./health-panel";
import { LoginPage } from "./login-page";
import { PostEditor } from "./post-editor";
import { PostsPage } from "./posts-page";
import { ProfilePage } from "./profile-page";
import { SetPasswordPage } from "./set-password-page";
import { UsersPage } from "./users-page";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  /** Opened from a setup or reset link; the token was taken out of the address. */
  | { status: "password-link"; token: string }
  | { status: "signed-in"; user: User };

/** Which screen a signed-in user sees; an editor without an id is a new post. */
type View =
  | { name: "posts" }
  | { name: "editor"; id: string | undefined }
  | { name: "users" }
  | { name: "profile" };

/** Read once: the link's token shouldn't stay in the address bar or history. */
function takeLinkToken(): string | null {
  const token = linkToken(window.location);
  if (token !== null) window.history.replaceState(null, "", "/");
  return token;
}

export function App() {
  const [state, setState] = useState<State>(() => {
    const token = takeLinkToken();
    return token === null
      ? { status: "loading" }
      : { status: "password-link", token };
  });
  const [view, setView] = useState<View>({ name: "posts" });

  useEffect(() => {
    if (state.status !== "loading") return;
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
  }, [state.status]);

  const signIn = (user: User) => {
    setView({ name: "posts" });
    setState({ status: "signed-in", user });
  };

  if (state.status === "loading") {
    return (
      <main>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (state.status === "password-link") {
    return <SetPasswordPage token={state.token} onSignedIn={signIn} />;
  }

  if (state.status === "signed-out") {
    return <LoginPage onSignedIn={signIn} />;
  }

  const { user } = state;
  const tabs: {
    view: Exclude<View, { name: "editor" }>;
    label: string;
    shown: boolean;
  }[] = [
    { view: { name: "posts" }, label: "Posts", shown: true },
    {
      view: { name: "users" },
      label: "Users",
      shown: can(user, "user.manage"),
    },
    { view: { name: "profile" }, label: "Your account", shown: true },
  ];
  return (
    <main>
      <h1>Aiiman admin</h1>
      {/* The editor leaves through its own Back button, which saves first. */}
      {view.name === "editor" ? null : (
        <nav aria-label="Admin">
          <ul className="admin-nav">
            {tabs
              .filter((tab) => tab.shown)
              .map((tab) => (
                <li key={tab.view.name}>
                  <button
                    type="button"
                    aria-current={
                      view.name === tab.view.name ? "page" : undefined
                    }
                    onClick={() => setView(tab.view)}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
          </ul>
        </nav>
      )}
      <p>
        Signed in as {user.name} ({user.role}).{" "}
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
      ) : view.name === "editor" ? (
        <PostEditor
          // A fresh editor per post, so no state leaks between them.
          key={view.id ?? "new"}
          id={view.id}
          user={user}
          onBack={() => setView({ name: "posts" })}
        />
      ) : view.name === "users" ? (
        <UsersPage me={user} />
      ) : (
        <ProfilePage
          user={user}
          onSaved={(saved) => setState({ status: "signed-in", user: saved })}
        />
      )}
      <HealthPanel />
    </main>
  );
}
