import type { Project } from "#velite";

/** Outbound links for a Project; renders nothing when it has none. */
export function ProjectLinks({
  project,
  className = "",
}: {
  project: Project;
  className?: string;
}) {
  const links = [
    project.url === undefined ? null : { href: project.url, label: "Website" },
    project.playStoreUrl === undefined
      ? null
      : { href: project.playStoreUrl, label: "Google Play" },
    project.repoUrl === undefined
      ? null
      : { href: project.repoUrl, label: "Source code" },
  ].filter((link) => link !== null);

  if (links.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1 text-sm ${className}`}>
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-4"
          >
            {link.label}
            <span className="sr-only">: {project.name}</span>
            <span aria-hidden="true">&nbsp;↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
