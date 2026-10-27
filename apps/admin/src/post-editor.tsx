import {
  ENTRY_TYPES,
  LANG_LABELS,
  LANGS,
  MAX_FEATURED,
  MAX_TAGS,
  TITLE_WARN_LENGTH,
  TYPE_LABELS,
  type EntryType,
  type Lang,
} from "@aiiman/shared";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { User } from "./auth";
import {
  createAutosave,
  type Autosave,
  type AutosaveStatus,
  type SaveOutcome,
} from "./autosave";
import { HistoryPanel, savedTime } from "./history-panel";
import { EMPTY_FIELDS, fieldsOf, inputOf, type Fields } from "./post-form";
import {
  createPost,
  getPost,
  previewPost,
  publishPost,
  restoreRevision,
  slugify,
  updatePost,
  type Post,
  type Previews,
  type RevisionSummary,
} from "./posts";
import { ImagePicker, NO_ALT } from "./image-picker";
import { PreviewsPanel } from "./previews-panel";
import { RichEditor } from "./rich-editor";

type Message = { kind: "status" | "alert"; text: string } | null;
type TextField = Exclude<keyof Fields, "noindex" | "body" | "cover">;

/** Whether the slug was set by hand rather than following the title. */
const ownSlug = (fields: Fields) => fields.slug !== slugify(fields.title);

/** Keeps the messages already shown, updated; autosaves don't add new ones mid-sentence. */
const stillShown = (
  shown: Record<string, string>,
  issues: Record<string, string>,
) => Object.fromEntries(Object.entries(issues).filter(([key]) => key in shown));

function AutosaveNote({
  status,
  published,
}: {
  status: AutosaveStatus;
  published: boolean;
}) {
  if (status.kind === "conflict") return null;
  if (status.kind === "failed") {
    return (
      <p className="autosave-note" role="alert">
        Not saved: {status.error}
        {status.retrying ? " Trying again shortly." : ""}
      </p>
    );
  }
  const text =
    status.kind === "saving"
      ? "Saving…"
      : status.kind === "saved"
        ? `Saved at ${status.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : status.kind === "pending"
          ? published
            ? "Unsaved changes. A published post's changes go live when you save them, so they aren't saved automatically."
            : "Unsaved changes"
          : published
            ? "A published post's changes go live when you save them, so they aren't saved automatically."
            : "Changes save automatically as you write.";
  return <p className="autosave-note">{text}</p>;
}

export function PostEditor({
  id,
  user,
  onBack,
}: {
  id: string | undefined;
  user: User;
  onBack: () => void;
}) {
  const [post, setPost] = useState<Post | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);
  const [previews, setPreviews] = useState<Previews | null>(null);
  const [pending, setPending] = useState(id !== undefined);
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "clean" });
  // The post as someone else saved it, when this tab's edit was refused.
  const [conflict, setConflict] = useState<Post | null>(null);
  // The slug follows the title until the writer edits it by hand.
  const [slugTouched, setSlugTouched] = useState(false);

  // Saves read the latest form and version, not the ones a render captured.
  const fieldsRef = useRef(fields);
  const postRef = useRef(post);
  const autosaveRef = useRef<Autosave | null>(null);
  // What the last save said the post needs before it can go live.
  const issuesRef = useRef<Record<string, string>>({});

  const replaceFields = (next: Fields) => {
    fieldsRef.current = next;
    setFields(next);
  };

  const adopt = (saved: Post) => {
    postRef.current = saved;
    setPost(saved);
  };

  /** Puts a whole post into the form: on load, after a restore or a conflict. */
  const load = (loaded: Post) => {
    adopt(loaded);
    const next = fieldsOf(loaded);
    replaceFields(next);
    setSlugTouched(ownSlug(next));
  };

  useEffect(() => {
    const autosave = createAutosave({
      enabled: () => postRef.current?.status !== "published",
      onStatus: setStatus,
      save: async ({ autosave: auto, keepalive }): Promise<SaveOutcome> => {
        const input = inputOf(fieldsRef.current);
        const current = postRef.current;
        const options = { autosave: auto, keepalive };
        const result =
          current === null
            ? await createPost(input, options)
            : await updatePost(current.id, current.version, input, options);
        if (result.ok) {
          adopt(result.post);
          issuesRef.current = result.issues;
          setErrors((shown) => ({
            ...(auto ? stillShown(shown, result.issues) : result.issues),
            ...result.unsaved,
          }));
          return { kind: "saved" };
        }
        if (result.conflict !== undefined) {
          setConflict(result.conflict);
          return { kind: "conflict" };
        }
        setErrors((shown) => ({ ...shown, ...result.fields }));
        if (!auto) setMessage({ kind: "alert", text: result.error });
        return {
          kind: "failed",
          error: result.error,
          retry: result.retry === true,
        };
      },
    });
    autosaveRef.current = autosave;
    return () => autosave.dispose();
  }, []);

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    void getPost(id).then((result) => {
      if (!active) return;
      setPending(false);
      if (result.ok) load(result.post);
      else setMessage({ kind: "alert", text: result.error });
    });
    return () => {
      active = false;
    };
    // `load` only uses refs and state setters.
  }, [id]);

  // Hiding or closing the tab saves at once; the request outlives the page.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") {
        void autosaveRef.current?.flush({ keepalive: true });
      }
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (autosaveRef.current?.hasUnsaved() === true) event.preventDefault();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);

  const canPublish = user.role === "admin" || user.role === "editor";
  const published = post?.status === "published";

  function update<K extends keyof Fields>(name: K, value: Fields[K]) {
    setPreviews(null);
    const current = fieldsRef.current;
    replaceFields({
      ...current,
      [name]: value,
      ...(name === "title" && !slugTouched && !published
        ? { slug: slugify(String(value)) }
        : {}),
    });
    autosaveRef.current?.changed();
  }

  /** Saves the form as the writer chose to; resolves to the saved post, or null. */
  async function save(): Promise<Post | null> {
    const outcome = await autosaveRef.current?.saveNow();
    return outcome?.kind === "saved" ? postRef.current : null;
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage(null);
    await action();
    setPending(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const saved = await save();
      if (saved === null) return;
      setMessage({
        kind: "status",
        text:
          saved.status === "published"
            ? "Saved. The site will show the changes shortly."
            : Object.keys(issuesRef.current).length > 0
              ? "Draft saved. Fix the highlighted fields before publishing."
              : "Draft saved.",
      });
    });
  }

  function handleBack() {
    void (async () => {
      await autosaveRef.current?.flush();
      if (
        autosaveRef.current?.hasUnsaved() === true &&
        !window.confirm("Your latest changes aren't saved. Leave anyway?")
      ) {
        return;
      }
      onBack();
    })();
  }

  /** Keeps this tab's version: saved over the one shown, which stays in the history. */
  function keepMine() {
    if (conflict === null) return;
    adopt(conflict);
    setConflict(null);
    void run(async () => {
      const saved = await save();
      if (saved === null) return;
      setMessage({
        kind: "status",
        text: "Saved your version. The other one is in Version history.",
      });
    });
  }

  /** Drops this tab's unsaved changes and shows the saved version. */
  function loadSaved() {
    if (conflict === null) return;
    load(conflict);
    setConflict(null);
    setErrors({});
    autosaveRef.current?.reset();
    setMessage({ kind: "status", text: "Showing the saved version." });
  }

  function handleRestore(revision: RevisionSummary) {
    void run(async () => {
      // What's on screen goes into the history first, so the restore can be undone.
      await autosaveRef.current?.flush();
      const current = postRef.current;
      if (current === null || conflict !== null || status.kind === "conflict")
        return;
      if (autosaveRef.current?.hasUnsaved() === true) {
        setMessage({
          kind: "alert",
          text: "Save your changes first, so they stay in the history.",
        });
        return;
      }
      const result = await restoreRevision(
        current.id,
        revision.id,
        current.version,
      );
      if (!result.ok) {
        if (result.conflict !== undefined) setConflict(result.conflict);
        else setMessage({ kind: "alert", text: result.error });
        return;
      }
      load(result.post);
      setErrors({});
      autosaveRef.current?.reset();
      const from = savedTime(result.restoredFrom ?? revision.savedAt);
      setMessage({
        kind: "status",
        text:
          result.post.status === "published"
            ? `Restored and published the ${from} version. The version it replaced is in the history.`
            : `Restored the ${from} version. The version it replaced is in the history.`,
      });
    });
  }

  function handlePublish() {
    void run(async () => {
      const saved = await save();
      if (saved === null) return;
      const result = await publishPost(saved.id);
      if (!result.ok) {
        setErrors(result.fields);
        setMessage({ kind: "alert", text: result.error });
        return;
      }
      adopt(result.post);
      // Publishing dates an undated post; the rest of the form is unchanged.
      replaceFields({ ...fieldsRef.current, date: result.post.date ?? "" });
      setMessage({
        kind: "status",
        text: result.revalidated
          ? `Published at /${result.post.slug}.`
          : `Published at /${result.post.slug}. The site couldn't be refreshed, so it shows up after the next deploy.`,
      });
    });
  }

  function handlePreview() {
    void run(async () => {
      // Previews render the saved version, so save first.
      const saved = await save();
      if (saved === null) return;
      const result = await previewPost(saved.id);
      if (result.ok) {
        setPreviews(result.previews);
      } else {
        setErrors(result.fields);
        setMessage({ kind: "alert", text: result.error });
      }
    });
  }

  /** The API's message for a field; tag errors arrive per tag ("tags.0"). */
  const errorFor = (name: string): string | undefined =>
    (name === "cover-alt" ? coverAltError : errors[name]) ??
    (name === "tags"
      ? Object.entries(errors).find(([key]) => key.startsWith("tags."))?.[1]
      : undefined);

  const described = (name: string, withHint = false) => {
    const ids = [
      withHint ? `${name}-hint` : undefined,
      errorFor(name) === undefined ? undefined : `${name}-error`,
    ].filter((value) => value !== undefined);
    return {
      "aria-invalid": errorFor(name) === undefined ? undefined : true,
      "aria-describedby": ids.length === 0 ? undefined : ids.join(" "),
    };
  };

  const text = (name: TextField) => ({
    id: name,
    name,
    value: fields[name],
    onChange: (event: { target: { value: string } }) =>
      update(name, event.target.value as Fields[typeof name]),
  });

  /** A labelled field with its hint and the API's message for it. */
  const row = (
    name: string,
    label: string,
    control: ReactNode,
    hint?: ReactNode,
  ) => (
    <p>
      <label htmlFor={name}>{label}</label>
      <br />
      {control}
      {hint === undefined ? null : (
        <>
          <br />
          <small id={`${name}-hint`}>{hint}</small>
        </>
      )}
      {errorFor(name) === undefined ? null : (
        <>
          <br />
          <span id={`${name}-error`}>{errorFor(name)}</span>
        </>
      )}
    </p>
  );

  // Shown as the writer types, before the API would say the same.
  const coverAltError =
    errorFor("cover.alt") ??
    (fields.cover !== null && fields.cover.alt.trim() === ""
      ? NO_ALT
      : undefined);

  const titleHint =
    fields.title.length > TITLE_WARN_LENGTH
      ? `${fields.title.length}/70. Search engines may cut titles past ${TITLE_WARN_LENGTH} characters.`
      : `${fields.title.length}/70`;

  return (
    <section aria-labelledby="editor-heading">
      <p>
        <button type="button" onClick={handleBack}>
          Back to posts
        </button>
      </p>
      <h2 id="editor-heading">
        {post === null ? "New post" : published ? "Published post" : "Draft"}
      </h2>
      <AutosaveNote status={status} published={published} />
      {conflict === null ? null : (
        <div role="alert" className="conflict">
          <p>
            This post was saved somewhere else (another tab, device or person)
            at {savedTime(conflict.updatedAt)}. Your changes here aren&apos;t
            saved yet.
          </p>
          <p>
            <button type="button" disabled={pending} onClick={keepMine}>
              Keep my version
            </button>{" "}
            <button type="button" disabled={pending} onClick={loadSaved}>
              Discard my changes and load the saved version
            </button>
          </p>
          <p>
            <small>
              Keeping yours saves it as a new version; the other one stays in
              Version history.
            </small>
          </p>
        </div>
      )}
      <form onSubmit={handleSave} noValidate>
        <fieldset>
          <legend>Post</legend>
          {row(
            "title",
            "Title",
            <input
              {...text("title")}
              {...described("title", true)}
              required
              maxLength={70}
            />,
            titleHint,
          )}
          {row(
            "summary",
            "Summary",
            <textarea
              {...text("summary")}
              {...described("summary", true)}
              required
              maxLength={160}
              rows={3}
            />,
            `${fields.summary.length}/160. Shown in search results and share previews.`,
          )}
          <div>
            {/* A contenteditable can't be the target of <label for>; it is named by aria-labelledby. */}
            <span id="body-label">Body</span>
            <RichEditor
              id="body"
              value={fields.body}
              onChange={(body) => update("body", body)}
              describedBy={described("body", true)["aria-describedby"]}
            />
            <small id="body-hint">
              Headings start at H2: the title above is the page&apos;s main
              heading.
            </small>
            {errorFor("body") === undefined ? null : (
              <p>
                <span id="body-error">{errorFor("body")}</span>
              </p>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Details</legend>
          {row(
            "slug",
            "Slug",
            <input
              {...text("slug")}
              {...described("slug", true)}
              onChange={(event) => {
                setSlugTouched(true);
                update("slug", event.target.value);
              }}
              readOnly={published}
              required
            />,
            published
              ? `The post lives at /${fields.slug}. Published posts keep their slug.`
              : `The post will live at /${fields.slug || "…"}`,
          )}
          {row(
            "type",
            "Type",
            <select
              id="type"
              name="type"
              value={fields.type}
              onChange={(event) =>
                update("type", event.target.value as EntryType)
              }
              {...described("type")}
            >
              {ENTRY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>,
          )}
          {row(
            "tags",
            "Tags",
            <input {...text("tags")} {...described("tags", true)} />,
            `1 to ${MAX_TAGS}, separated by commas, e.g. react-native, nigeria`,
          )}
          {row(
            "lang",
            "Language",
            <select
              id="lang"
              name="lang"
              value={fields.lang}
              onChange={(event) => update("lang", event.target.value as Lang)}
              {...described("lang")}
            >
              {LANGS.map((lang) => (
                <option key={lang} value={lang}>
                  {LANG_LABELS[lang]}
                </option>
              ))}
            </select>,
          )}
          {row(
            "date",
            "Publication date",
            <input
              type="date"
              {...text("date")}
              {...described("date", true)}
            />,
            "Leave empty to use the day you publish.",
          )}
          {row(
            "updated",
            "Updated date",
            <input
              type="date"
              {...text("updated")}
              {...described("updated", true)}
            />,
            "Optional. Set it when you change a published post meaningfully.",
          )}
          {row(
            "featured",
            "Featured position",
            <input
              type="number"
              min={1}
              max={MAX_FEATURED}
              step={1}
              {...text("featured")}
              {...described("featured", true)}
            />,
            `Optional. 1 to ${MAX_FEATURED}: its place in "Start here" on the home page.`,
          )}
        </fieldset>

        <fieldset>
          <legend>Cover image</legend>
          {fields.cover === null ? (
            <>
              <ImagePicker
                id="cover-picker"
                title="Shown under the post title"
                submitLabel="Upload cover"
                onPicked={(cover) => update("cover", cover)}
              />
              {errorFor("cover") === undefined ? null : (
                <p id="cover-error">{errorFor("cover")}</p>
              )}
            </>
          ) : (
            <>
              {/* Decorative here: its description is the field below. */}
              <img
                className="cover-preview"
                src={fields.cover.src}
                width={fields.cover.width}
                height={fields.cover.height}
                alt=""
              />
              {row(
                "cover-alt",
                "Cover alt text",
                <textarea
                  id="cover-alt"
                  rows={2}
                  value={fields.cover.alt}
                  onChange={(event) =>
                    fields.cover !== null &&
                    update("cover", {
                      ...fields.cover,
                      alt: event.target.value,
                    })
                  }
                  aria-invalid={coverAltError === undefined ? undefined : true}
                  aria-describedby={
                    coverAltError === undefined
                      ? "cover-alt-hint"
                      : "cover-alt-hint cover-alt-error"
                  }
                  required
                />,
                'What the image shows, e.g. "Kano city walls at dusk".',
              )}
              {errorFor("cover") === undefined ? null : (
                <p id="cover-error">{errorFor("cover")}</p>
              )}
              <p>
                <button type="button" onClick={() => update("cover", null)}>
                  Remove cover
                </button>
              </p>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Search engines</legend>
          {row(
            "canonical",
            "Canonical URL",
            <input
              type="url"
              {...text("canonical")}
              {...described("canonical", true)}
            />,
            "Only if this post first appeared elsewhere: the original https:// address.",
          )}
          <p>
            <input
              type="checkbox"
              id="noindex"
              name="noindex"
              checked={fields.noindex}
              onChange={(event) => update("noindex", event.target.checked)}
              aria-describedby="noindex-hint"
            />{" "}
            <label htmlFor="noindex">Hide from search engines</label>
            <br />
            <small id="noindex-hint">
              Readers can still open the post; it stays out of search results
              and the sitemap.
            </small>
          </p>
        </fieldset>

        {message !== null && <p role={message.kind}>{message.text}</p>}
        <p>
          <button type="submit" disabled={pending}>
            {published ? "Save changes" : "Save draft"}
          </button>{" "}
          <button type="button" disabled={pending} onClick={handlePreview}>
            Save and preview
          </button>{" "}
          {canPublish && !published && (
            <button type="button" disabled={pending} onClick={handlePublish}>
              Publish
            </button>
          )}
        </p>
      </form>
      {previews === null ? null : <PreviewsPanel previews={previews} />}
      {post === null ? null : (
        <HistoryPanel
          postId={post.id}
          version={post.version}
          published={published}
          disabled={pending || conflict !== null}
          onRestore={handleRestore}
        />
      )}
    </section>
  );
}
