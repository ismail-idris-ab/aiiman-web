import { embedUrl, resolveEmbed } from "@aiiman/shared";
import { useState } from "react";

/** Paste a link, check it can be embedded, insert it. Not a <form>: it sits inside the post form. */
export function EmbedPicker({
  id,
  onPicked,
  onCancel,
}: {
  id: string;
  onPicked: (attrs: { url: string; title?: string }) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const resolved = resolveEmbed(url);
    if (!resolved.ok) return setError(resolved.error);
    const trimmed = title.trim();
    onPicked({
      url: embedUrl(resolved.embed),
      ...(trimmed === "" ? {} : { title: trimmed }),
    });
  }

  return (
    <div className="image-picker" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`}>
        <strong>Embed a post or video</strong>
      </p>
      <p>
        <label htmlFor={`${id}-url`}>Link</label>
        <br />
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-describedby={`${id}-url-hint`}
          aria-invalid={error === null ? undefined : true}
          required
        />
        <br />
        <small id={`${id}-url-hint`}>
          YouTube, X, TikTok, Instagram or GitHub Gist. Readers tap to load it.
        </small>
      </p>
      <p>
        <label htmlFor={`${id}-label`}>Description (optional)</label>
        <br />
        <input
          id={`${id}-label`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-describedby={`${id}-label-hint`}
          maxLength={120}
        />
        <br />
        <small id={`${id}-label-hint`}>
          Shown on the load button, e.g. &quot;Talk on payments in
          Nigeria&quot;. Leave empty to name the site and author.
        </small>
      </p>
      {error === null ? null : <p role="alert">{error}</p>}
      <p>
        <button type="button" onClick={submit}>
          Insert embed
        </button>{" "}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </p>
    </div>
  );
}
