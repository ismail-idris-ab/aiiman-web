import { serverEnv } from "@/env.server";

/**
 * Newsletter sign-up. Until BUTTONDOWN_API_KEY is configured it renders a
 * disabled "coming soon" state instead of a form that would fail.
 */
export function NewsletterBox({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const enabled = serverEnv.BUTTONDOWN_API_KEY !== undefined;

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="rounded-lg bg-accent-soft px-5 py-6 sm:px-6"
    >
      <Heading id="newsletter-heading" className="font-serif text-xl font-bold">
        Get new posts by email
      </Heading>
      <p className="mt-1 text-muted">
        One email when something new is published. No spam, unsubscribe any
        time.
      </p>
      {enabled ? null : (
        <p className="mt-3 text-sm text-muted" role="status">
          Newsletter coming soon. Follow the{" "}
          <a href="/rss.xml" className="text-accent underline">
            RSS feed
          </a>{" "}
          in the meantime.
        </p>
      )}
    </section>
  );
}
