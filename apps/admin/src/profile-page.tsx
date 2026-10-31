import {
  IMAGE_TYPES,
  MAX_BIO_LENGTH,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  type Photo,
} from "@aiiman/shared";
import { useState, type FormEvent } from "react";
import { changePassword, saveProfile, type User } from "./auth";
import { uploadImage } from "./images";

const MISMATCH = "The two passwords don't match";

function hint(id: string, text: string, error: string | undefined) {
  return (
    <>
      <br />
      <small id={`${id}-hint`}>{text}</small>
      {error === undefined ? null : (
        <>
          <br />
          <small id={`${id}-error`}>{error}</small>
        </>
      )}
    </>
  );
}

function described(id: string, error: string | undefined) {
  return {
    id,
    "aria-invalid": error === undefined ? undefined : true,
    "aria-describedby":
      error === undefined ? `${id}-hint` : `${id}-hint ${id}-error`,
  } as const;
}

function ProfileForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [photo, setPhoto] = useState<Photo | undefined>(user.photo);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{
    kind: "status" | "alert";
    text: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  async function handlePhoto(file: File | undefined) {
    if (file === undefined) return;
    setPending(true);
    setMessage({ kind: "status", text: "Uploading photo…" });
    const result = await uploadImage(file);
    setPending(false);
    if (!result.ok) {
      setMessage({ kind: "alert", text: result.error });
      return;
    }
    const { src, width, height, blurDataURL } = result.image;
    setPhoto({ src, width, height, blurDataURL });
    setMessage({ kind: "status", text: "Photo uploaded. Save to keep it." });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});
    const result = await saveProfile({
      name,
      ...(bio.trim() === "" ? {} : { bio }),
      ...(photo === undefined ? {} : { photo }),
    });
    setPending(false);
    if (!result.ok) {
      setFields(result.fields);
      setMessage({ kind: "alert", text: result.error });
      return;
    }
    onSaved(result.user);
    setMessage({ kind: "status", text: "Profile saved." });
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="profile-heading">
      <h3 id="profile-heading">Profile</h3>
      <p>
        Your name, bio and photo appear on your author page and next to your
        posts.
      </p>
      <p>
        <label htmlFor="profile-name">Name</label>
        <br />
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
          autoComplete="name"
          {...described("profile-name", fields.name)}
        />
        {hint("profile-name", "As readers will see it.", fields.name)}
      </p>
      <p>
        <label htmlFor="profile-bio">Short bio</label>
        <br />
        <textarea
          rows={3}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={MAX_BIO_LENGTH}
          {...described("profile-bio", fields.bio)}
        />
        {hint(
          "profile-bio",
          `${bio.length} of ${MAX_BIO_LENGTH} characters. Optional.`,
          fields.bio,
        )}
      </p>
      <fieldset>
        <legend>Photo</legend>
        {photo === undefined ? null : (
          <p>
            <img
              className="profile-photo"
              src={photo.src}
              alt={`Photo of ${name}`}
              width={photo.width}
              height={photo.height}
            />
            <br />
            <button
              type="button"
              disabled={pending}
              onClick={() => setPhoto(undefined)}
            >
              Remove photo
            </button>
          </p>
        )}
        <p>
          <label htmlFor="profile-photo">
            {photo === undefined ? "Choose a photo" : "Replace the photo"}
          </label>
          <br />
          <input
            type="file"
            accept={IMAGE_TYPES.join(",")}
            disabled={pending}
            onChange={(event) => void handlePhoto(event.target.files?.[0])}
            {...described("profile-photo", fields.photo)}
          />
          {hint(
            "profile-photo",
            "JPEG, PNG or WebP. A square photo of your face works best.",
            fields.photo,
          )}
        </p>
      </fieldset>
      {message !== null && <p role={message.kind}>{message.text}</p>}
      <button type="submit" disabled={pending}>
        Save profile
      </button>
    </form>
  );
}

function PasswordForm() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{
    kind: "status" | "alert";
    text: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("repeatPassword") ?? "")) {
      setFields({ repeatPassword: MISMATCH });
      setMessage({ kind: "alert", text: MISMATCH });
      return;
    }
    setPending(true);
    setMessage(null);
    setFields({});
    const result = await changePassword(
      String(form.get("currentPassword") ?? ""),
      newPassword,
    );
    setPending(false);
    if (!result.ok) {
      setFields(result.fields);
      setMessage({ kind: "alert", text: result.error });
      return;
    }
    formElement.reset();
    setMessage({
      kind: "status",
      text: "Password changed. Your other devices are signed out.",
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="password-heading">
      <h3 id="password-heading">Change password</h3>
      <p>
        <label htmlFor="currentPassword">Current password</label>
        <br />
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          {...described("currentPassword", fields.currentPassword)}
        />
        {hint(
          "currentPassword",
          "The one you signed in with.",
          fields.currentPassword,
        )}
      </p>
      <p>
        <label htmlFor="newPassword">New password</label>
        <br />
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          {...described("newPassword", fields.newPassword)}
        />
        {hint(
          "newPassword",
          `At least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words work well.`,
          fields.newPassword,
        )}
      </p>
      <p>
        <label htmlFor="repeatPassword">Repeat the new password</label>
        <br />
        <input
          type="password"
          name="repeatPassword"
          autoComplete="new-password"
          required
          {...described("repeatPassword", fields.repeatPassword)}
        />
        {hint("repeatPassword", "To catch a typo.", fields.repeatPassword)}
      </p>
      {message !== null && <p role={message.kind}>{message.text}</p>}
      <button type="submit" disabled={pending}>
        Change password
      </button>
    </form>
  );
}

export function ProfilePage({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  return (
    <section aria-labelledby="account-heading">
      <h2 id="account-heading">Your account</h2>
      <p>Signed in as {user.email}. Ask an admin to change your role.</p>
      <ProfileForm user={user} onSaved={onSaved} />
      <PasswordForm />
    </section>
  );
}
