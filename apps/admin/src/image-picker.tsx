import { IMAGE_TYPES, type ImageAttrs } from "@aiiman/shared";
import { useState } from "react";
import { uploadImage } from "./images";

const NO_FILE = "Choose an image first.";
export const NO_ALT =
  "Add alt text: describe the image for readers who can't see it.";

/**
 * Choose an image, describe it, upload it. Alt text is required before the
 * upload starts, so no image enters a post without one. Not a <form>: it
 * sits inside the post form.
 */
export function ImagePicker({
  id,
  title,
  submitLabel,
  onPicked,
  onCancel,
}: {
  id: string;
  title: string;
  submitLabel: string;
  onPicked: (image: ImageAttrs) => void;
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (file === null) return setError(NO_FILE);
    if (alt.trim() === "") return setError(NO_ALT);
    setError(null);
    setBusy(true);
    const result = await uploadImage(file);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onPicked({ ...result.image, alt: alt.trim() });
  }

  return (
    <div className="image-picker" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`}>
        <strong>{title}</strong>
      </p>
      <p>
        <label htmlFor={`${id}-file`}>Image file</label>
        <br />
        <input
          type="file"
          id={`${id}-file`}
          accept={IMAGE_TYPES.join(",")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-describedby={`${id}-file-hint`}
        />
        <br />
        <small id={`${id}-file-hint`}>
          JPEG, PNG or WebP. Large photos are resized before uploading.
        </small>
      </p>
      <p>
        <label htmlFor={`${id}-alt`}>Alt text</label>
        <br />
        <textarea
          id={`${id}-alt`}
          rows={2}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          aria-describedby={`${id}-alt-hint`}
          required
        />
        <br />
        <small id={`${id}-alt-hint`}>
          What the image shows, e.g. &quot;Kano city walls at dusk&quot;.
        </small>
      </p>
      {error === null ? null : <p role="alert">{error}</p>}
      <p>
        <button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Uploading…" : submitLabel}
        </button>{" "}
        {onCancel === undefined ? null : (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </p>
    </div>
  );
}
