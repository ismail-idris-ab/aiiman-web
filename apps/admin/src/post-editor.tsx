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
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "./auth";
import { EMPTY_FIELDS, fieldsOf, inputOf, type Fields } from "./post-form";
import {
  createPost,
  getPost,
  previewPost,
  publishPost,
  slugify,
  updatePost,
  type Post,
  type Previews,
  type PostResult,
} from "./posts";
import { PreviewsPanel } from "./previews-panel";
import { RichEditor } from "./rich-editor";

type Message = { kind: "status" | "alert"; text: string } | null;
type TextField = Exclude<keyof Fields, "noindex" | "body">;

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
  // The slug follows the title until the writer edits it or the post is saved.
  const [slugTouched, setSlugTouched] = useState(id !== undefined);

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    void getPost(id).then((result) => {
      if (!active) return;
      setPending(false);
      if (result.ok) {
        setPost(result.post);
        setFields(fieldsOf(result.post));
      } else {
        setMessage({ kind: "alert", text: result.error });
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  const canPublish = user.role === "admin" || user.role === "editor";
  const published = post?.status === "published";

  function update<K extends keyof Fields>(name: K, value: Fields[K]) {
    setPreviews(null);
    setFields((current) => ({
      ...current,
      [name]: value,
      ...(name === "title" && !slugTouched
        ? { slug: slugify(String(value)) }
        : {}),
    }));
  }

  /** Saves the form; resolves to the saved post, or null after showing errors. */
  async function save(): Promise<Post | null> {
    const input = inputOf(fields);
    const result: PostResult =
      post === null
        ? await createPost(input)
        : await updatePost(post.id, input);
    if (!result.ok) {
      setErrors(result.fields);
      setMessage({ kind: "alert", text: result.error });
      return null;
    }
    setErrors({});
    setPost(result.post);
    setFields(fieldsOf(result.post));
    setSlugTouched(true);
    return result.post;
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
            : "Draft saved.",
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
      setPost(result.post);
      setFields(fieldsOf(result.post));
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
      if (result.ok) setPreviews(result.previews);
      else setMessage({ kind: "alert", text: result.error });
    });
  }

  /** The API's message for a field; tag errors arrive per tag ("tags.0"). */
  const errorFor = (name: string): string | undefined =>
    errors[name] ??
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

  const titleHint =
    fields.title.length > TITLE_WARN_LENGTH
      ? `${fields.title.length}/70. Search engines may cut titles past ${TITLE_WARN_LENGTH} characters.`
      : `${fields.title.length}/70`;

  return (
    <section aria-labelledby="editor-heading">
      <p>
        <button type="button" onClick={onBack}>
          Back to posts
        </button>
      </p>
      <h2 id="editor-heading">
        {post === null ? "New post" : published ? "Published post" : "Draft"}
      </h2>
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
    </section>
  );
}
