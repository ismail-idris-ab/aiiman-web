import type { Metadata } from "next";

import { ProjectLinks } from "@/components/ui/project-links";
import { getProjects } from "@/lib/content";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/content/model";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/site.config";

export const metadata: Metadata = pageMetadata({
  title: "Projects",
  description: `Products ${siteConfig.author.name} has built and is building for Nigerian and African users, from live apps to experiments.`,
  path: "/projects",
});

const STATUS_HEADINGS: Record<ProjectStatus, string> = {
  live: "Live",
  building: "Building now",
  paused: "Paused",
  archived: "Archived",
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  const groups = PROJECT_STATUSES.map((status) => ({
    status,
    projects: projects.filter((project) => project.status === status),
  })).filter((group) => group.projects.length > 0);

  return (
    <div className="max-w-measure">
      <h1 className="font-serif text-4xl font-bold tracking-tight">Projects</h1>
      <p className="mt-3 font-serif text-xl text-muted">
        Things I&apos;ve shipped and things I&apos;m working on.
      </p>

      {groups.length === 0 ? (
        <p className="mt-10 text-muted">Project write-ups are on their way.</p>
      ) : (
        groups.map(({ status, projects: group }) => (
          <section
            key={status}
            aria-labelledby={`status-${status}`}
            className="mt-12"
          >
            <h2
              id={`status-${status}`}
              className="font-serif text-2xl font-bold"
            >
              {STATUS_HEADINGS[status]}
            </h2>
            <ul className="mt-3 divide-y divide-border">
              {group.map((project) => (
                <li key={project.slug} className="py-4">
                  <h3 className="font-serif text-lg font-bold">
                    {project.name}
                  </h3>
                  <p className="mt-1 text-muted">{project.summary}</p>
                  <ProjectLinks project={project} className="mt-2" />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
