import { useEffect, useState } from "react";
import { listRevisions, type RevisionSummary } from "./posts";

const KIND_LABELS: Record<RevisionSummary["kind"], string> = {
  autosave: "Autosaved",
  save: "Saved",
  restore: "Restored",
};

/** "26 Oct, 14:05" in the writer's own time zone. */
export function savedTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The post's last saved versions, newest first. The newest is what's saved
 * now; any other can be restored, and restoring keeps the replaced one here.
 */
export function HistoryPanel({
  postId,
  version,
  published,
  disabled,
  onRestore,
}: {
  postId: string;
  /** Reloads the list when the post is saved again. */
  version: number;
  published: boolean;
  disabled: boolean;
  onRestore: (revision: RevisionSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void listRevisions(postId).then((list) => {
      if (!active) return;
      setFailed(list === null);
      if (list !== null) setRevisions(list);
    });
    return () => {
      active = false;
    };
  }, [open, postId, version]);

  return (
    <section aria-labelledby="history-heading" className="history-panel">
      <h3 id="history-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="history-list"
          onClick={() => setOpen((current) => !current)}
        >
          Version history
        </button>
      </h3>
      {open && (
        <div id="history-list">
          {failed ? (
            <p role="alert">
              Couldn&apos;t load the history. Check your connection.
            </p>
          ) : revisions === null ? (
            <p>Loading…</p>
          ) : (
            <ol>
              {revisions.map((revision, index) => (
                <li key={revision.id}>
                  <p>
                    <strong>{savedTime(revision.savedAt)}</strong>{" "}
                    {KIND_LABELS[revision.kind]} by {revision.savedBy}
                    {index === 0 ? " (what's saved now)" : ""}
                  </p>
                  <p>
                    {revision.title === "" ? "Untitled" : revision.title},{" "}
                    {revision.words === 1
                      ? "1 word"
                      : `${revision.words} words`}
                  </p>
                  {revision.excerpt === "" ? null : (
                    <p className="history-excerpt">{revision.excerpt}</p>
                  )}
                  {index === 0 ? null : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRestore(revision)}
                    >
                      {published
                        ? `Restore and publish the ${savedTime(revision.savedAt)} version`
                        : `Restore the ${savedTime(revision.savedAt)} version`}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p>
            <small>
              The last 10 versions are kept. Autosaves within five minutes of
              each other count as one version.
            </small>
          </p>
        </div>
      )}
    </section>
  );
}
