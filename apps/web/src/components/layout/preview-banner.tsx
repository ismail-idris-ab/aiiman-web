import { contentMode } from "@/lib/content";

/** Shown on every page of dev and preview builds, where drafts and scheduled Items are visible. */
export function PreviewBanner() {
  if (contentMode !== "authoring") return null;
  return (
    <div
      role="note"
      className="bg-accent px-4 py-1.5 text-center text-sm text-background"
    >
      Preview build. Drafts and scheduled posts are visible here and nowhere
      else.
    </div>
  );
}
