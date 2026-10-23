import { docToText, textToDoc, type PostInput } from "@aiiman/shared";
import { useEffect, useState, type FormEvent } from "react";
import type { User } from "./auth";
import {
  createPost,
  getPost,
  publishPost,
  slugify,
  updatePost,
  type Post,
  type PostResult,
} from "./posts";

interface Fields {
  title: string;
  slug: string;
  summary: string;
  body: string;
}

const EMPTY: Fields = { title: "", slug: "", summary: "", body: "" };

const fieldsOf = (post: Post): Fields => ({
  title: post.title,
  slug: post.slug,
  summary: post.summary,
  body: docToText(post.body),
});

const inputOf = (fields: Fields): PostInput => ({
  title: fields.title,
  slug: fields.slug,
  summary: fields.summary,
  body: textToDoc(fields.body),
});

type Message = { kind: "status" | "alert"; text: string } | null;

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
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);
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

  function update(name: keyof Fields, value: string) {
    setFields((current) => ({
      ...current,
      [name]: value,
      ...(name === "title" && !slugTouched ? { slug: slugify(value) } : {}),
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
      setMessage({
        kind: "status",
        text: result.revalidated
          ? `Published at /${result.post.slug}.`
          : `Published at /${result.post.slug}. The site couldn't be refreshed, so it shows up after the next deploy.`,
      });
    });
  }

  const field = (name: keyof Fields) => ({
    id: name,
    name,
    value: fields[name],
    onChange: (event: { target: { value: string } }) =>
      update(name, event.target.value),
    "aria-invalid": errors[name] === undefined ? undefined : true,
    "aria-describedby":
      errors[name] === undefined ? undefined : `${name}-error`,
  });

  const error = (name: string) =>
    errors[name] === undefined ? null : (
      <span id={`${name}-error`}>{errors[name]}</span>
    );

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
      <form onSubmit={handleSave}>
        <p>
          <label htmlFor="title">Title</label> ({fields.title.length}/70)
          <br />
          <input {...field("title")} required maxLength={70} />
          <br />
          {error("title")}
        </p>
        <p>
          <label htmlFor="slug">Slug</label>
          <br />
          <input
            {...field("slug")}
            onChange={(event) => {
              setSlugTouched(true);
              update("slug", event.target.value);
            }}
            readOnly={published}
            required
          />
          <br />
          {error("slug")}
        </p>
        <p>
          <label htmlFor="summary">Summary</label> ({fields.summary.length}/160)
          <br />
          <textarea {...field("summary")} required maxLength={160} rows={3} />
          <br />
          {error("summary")}
        </p>
        <p>
          <label htmlFor="body">Body</label> (leave a blank line between
          paragraphs)
          <br />
          <textarea {...field("body")} rows={16} cols={60} />
          <br />
          {error("body")}
        </p>
        {message !== null && <p role={message.kind}>{message.text}</p>}
        <p>
          <button type="submit" disabled={pending}>
            {published ? "Save changes" : "Save draft"}
          </button>{" "}
          {canPublish && !published && (
            <button type="button" disabled={pending} onClick={handlePublish}>
              Publish
            </button>
          )}
        </p>
      </form>
    </section>
  );
}
