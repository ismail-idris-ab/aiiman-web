import type { Previews } from "./posts";

/**
 * Search result, share card and reader link, all rendered by the site itself
 * from the saved post, so they match what readers will see.
 */
export function PreviewsPanel({ previews }: { previews: Previews }) {
  const { search, shareImageUrl, readerUrl } = previews;
  return (
    <section aria-labelledby="previews-heading">
      <h3 id="previews-heading">Previews</h3>

      <h4>Search result</h4>
      {search.indexed ? (
        <figure>
          <p>{search.url}</p>
          <p>
            <strong>{search.title}</strong>
          </p>
          <p>{search.description}</p>
        </figure>
      ) : (
        <p>
          Hidden from search engines (noindex). Readers can still open{" "}
          {search.url}.
        </p>
      )}

      <h4>Share card</h4>
      <p>WhatsApp, X and other apps show this image when the link is shared.</p>
      <img
        src={shareImageUrl}
        alt={`Share card: ${search.title}`}
        width={600}
        height={315}
      />

      <h4>Reader view</h4>
      <p>
        <a href={readerUrl} target="_blank" rel="noopener noreferrer">
          Open the post as readers will see it
        </a>{" "}
        (opens the site in a new tab; the link works for 15 minutes)
      </p>
    </section>
  );
}
