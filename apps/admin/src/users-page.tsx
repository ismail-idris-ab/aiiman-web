import { ROLE_LABELS, ROLES, type Role } from "@aiiman/shared";
import { useEffect, useState, type FormEvent } from "react";
import { passwordLinkUrl, type User } from "./auth";
import { savedTime } from "./history-panel";
import {
  addUser,
  changeAccess,
  listUsers,
  makePasswordLink,
  type PasswordLink,
} from "./users";

/** A link to pass on by WhatsApp or email, with a copy button. */
function LinkBox({
  id,
  name,
  link,
}: {
  id: string;
  name: string;
  link: PasswordLink;
}) {
  const url = passwordLinkUrl(window.location.origin, link.token);
  const [copied, setCopied] = useState(false);
  return (
    <div className="link-box" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`}>
        <strong>
          {link.kind === "setup" ? "Setup link" : "Password reset link"} for{" "}
          {name}
        </strong>
      </p>
      <p>
        <label htmlFor={`${id}-url`}>Link</label>
        <br />
        <input
          id={`${id}-url`}
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          aria-describedby={`${id}-hint`}
        />
        <br />
        <small id={`${id}-hint`}>
          Send it to {name} yourself. It works once, until{" "}
          {savedTime(link.expiresAt)}, and is shown only now.
        </small>
      </p>
      <p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          Copy link
        </button>{" "}
        <span role="status">{copied ? "Copied." : ""}</span>
      </p>
    </div>
  );
}

function AddUserForm({
  onAdded,
}: {
  onAdded: (user: User, link: PasswordLink) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    setFields({});
    const result = await addUser({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "author") as Role,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields);
      return;
    }
    formElement.reset();
    onAdded(result.user, result.link);
  }

  const field = (name: string) => ({
    id: `new-${name}`,
    name,
    "aria-invalid": fields[name] === undefined ? undefined : true,
    "aria-describedby":
      fields[name] === undefined ? undefined : `new-${name}-error`,
  });
  const fieldError = (name: string) =>
    fields[name] === undefined ? null : (
      <>
        <br />
        <small id={`new-${name}-error`}>{fields[name]}</small>
      </>
    );

  return (
    <form onSubmit={handleSubmit} aria-labelledby="add-user-heading">
      <h3 id="add-user-heading">Add a user</h3>
      <p>
        <label htmlFor="new-name">Name</label>
        <br />
        <input type="text" autoComplete="off" required {...field("name")} />
        {fieldError("name")}
      </p>
      <p>
        <label htmlFor="new-email">Email</label>
        <br />
        <input type="email" autoComplete="off" required {...field("email")} />
        {fieldError("email")}
      </p>
      <p>
        <label htmlFor="new-role">Role</label>
        <br />
        <select defaultValue="author" {...field("role")}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        {fieldError("role")}
        <br />
        <small>
          Authors write and submit; editors also publish and edit any post;
          admins also manage users.
        </small>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add user"}
      </button>
    </form>
  );
}

function UserRow({
  user,
  self,
  onChanged,
}: {
  user: User;
  self: boolean;
  onChanged: (user: User) => void;
}) {
  const [link, setLink] = useState<PasswordLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = user.status === "active";

  async function run<T>(
    action: () => Promise<({ ok: true } & T) | { ok: false; error: string }>,
    done: (value: T) => void,
  ) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.ok) done(result);
    else setError(result.error);
  }

  return (
    <li>
      <p>
        <strong>{user.name}</strong>
        {self ? " (you)" : ""} · {user.email}
        <br />
        {ROLE_LABELS[user.role]}
        {active ? "" : " · Deactivated"}
        {user.passwordSet ? "" : " · Hasn't set a password yet"}
      </p>
      {self ? null : (
        <p>
          <label htmlFor={`role-${user.id}`}>Role for {user.name}</label>{" "}
          <select
            id={`role-${user.id}`}
            value={user.role}
            disabled={pending}
            onChange={(event) => {
              const role = event.target.value as Role;
              void run(
                () => changeAccess(user.id, { role }),
                (result) => onChanged(result.user),
              );
            }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>{" "}
          {active && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void run(
                  () => makePasswordLink(user.id),
                  (result) => setLink(result.link),
                )
              }
            >
              {user.passwordSet ? "Make reset link" : "Make new setup link"}
            </button>
          )}{" "}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                active &&
                !window.confirm(
                  `Deactivate ${user.name}? They're signed out everywhere at once.`,
                )
              )
                return;
              void run(
                () =>
                  changeAccess(user.id, {
                    status: active ? "deactivated" : "active",
                  }),
                (result) => {
                  setLink(null);
                  onChanged(result.user);
                },
              );
            }}
          >
            {active ? "Deactivate" : "Reactivate"}
          </button>
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {link === null ? null : (
        <LinkBox id={`link-${user.id}`} name={user.name} link={link} />
      )}
    </li>
  );
}

/** Admins add writers, change roles, deactivate and make password links. */
export function UsersPage({ me }: { me: User }) {
  const [users, setUsers] = useState<User[] | null | undefined>(undefined);
  const [added, setAdded] = useState<{
    user: User;
    link: PasswordLink;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void listUsers().then((result) => {
      if (active) setUsers(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const replace = (user: User) =>
    setUsers((current) =>
      current?.map((existing) => (existing.id === user.id ? user : existing)),
    );

  return (
    <section aria-labelledby="users-heading">
      <h2 id="users-heading">Users</h2>
      <AddUserForm
        onAdded={(user, link) => {
          setAdded({ user, link });
          setUsers((current) => (current ? [...current, user] : current));
        }}
      />
      {added === null ? null : (
        <LinkBox id="link-new" name={added.user.name} link={added.link} />
      )}
      <h3>Everyone</h3>
      {users === undefined ? (
        <p role="status">Loading users…</p>
      ) : users === null ? (
        <p role="alert">Couldn't load users. Reload to try again.</p>
      ) : (
        <ul className="user-list">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              self={user.id === me.id}
              onChanged={replace}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
