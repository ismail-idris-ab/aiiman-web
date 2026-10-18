import Link from "next/link";

import { NewsletterBox } from "@/components/newsletter/newsletter-box";
import { ItemList } from "@/components/ui/item-list";
import { ProjectLinks } from "@/components/ui/project-links";
import { getFeatured, getFeaturedProjects, getLatest } from "@/lib/content";
import { siteConfig } from "@/site.config";

const LATEST_COUNT = 6;

export default function HomePage() {
  const featured = getFeatured();
  const projects = getFeaturedProjects();
  const latest = getLatest(LATEST_COUNT);

  return (
    <div className="max-w-[68ch]">
      <section aria-labelledby="intro">
        <h1
          id="intro"
          className="font-serif text-4xl font-bold tracking-tight text-balance sm:text-5xl"
        >
          {siteConfig.author.name}
        </h1>
        <p className="mt-4 font-serif text-xl leading-relaxed text-pretty">
          {siteConfig.author.bio} Based in {siteConfig.author.location}. This is
          my public notebook: essays, notes, tutorials and talks in one place.
        </p>
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href="/about"
            className="text-accent underline underline-offset-4"
          >
            More about me
          </Link>
          <Link
            href="/writing"
            className="text-accent underline underline-offset-4"
          >
            Browse everything
          </Link>
          <a
            href={siteConfig.socials.x ?? undefined}
            rel="noopener noreferrer me"
            className="text-accent underline underline-offset-4"
          >
            {siteConfig.twitterHandle} on X
          </a>
        </p>
      </section>

      {featured.length > 0 ? (
        <section aria-labelledby="start-here" className="mt-16">
          <h2 id="start-here" className="font-serif text-2xl font-bold">
            Start here
          </h2>
          <p className="mt-1 text-muted">
            A few pieces that explain how I think and work.
          </p>
          <div className="mt-4">
            <ItemList items={featured} showSummary />
          </div>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section aria-labelledby="building" className="mt-16">
          <h2 id="building" className="font-serif text-2xl font-bold">
            Currently building
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {projects.map((project) => (
              <li key={project.slug} className="py-3">
                <p className="font-serif text-lg font-bold">{project.name}</p>
                <p className="mt-1 text-muted">{project.summary}</p>
                <ProjectLinks project={project} className="mt-1" />
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <Link
              href="/projects"
              className="text-accent underline underline-offset-4"
            >
              All projects
            </Link>
          </p>
        </section>
      ) : null}

      <section aria-labelledby="latest" className="mt-16">
        <h2 id="latest" className="font-serif text-2xl font-bold">
          Latest
        </h2>
        {latest.length > 0 ? (
          <>
            <div className="mt-4">
              <ItemList items={latest} />
            </div>
            <p className="mt-3">
              <Link
                href="/writing"
                className="text-accent underline underline-offset-4"
              >
                See all writing
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-3 text-muted">
            The first posts are on their way. Subscribe below to get them by
            email.
          </p>
        )}
      </section>

      <div className="mt-16">
        <NewsletterBox />
      </div>
    </div>
  );
}
