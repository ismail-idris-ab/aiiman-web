import {
  EMBED_PROVIDER_NAMES,
  embedFrameSrc,
  embedLabel,
  embedUrl,
  type Embed,
} from "@aiiman/shared/embed";

import { YouTubeFacade } from "@/components/mdx/youtube-facade";

import { EmbedFacade } from "./embed-facade";

/** An embed in a post body (admin or MDX): a tap-to-load facade for its provider. */
export function EmbedBlock({
  embed,
  title,
}: {
  embed: Embed;
  /** The writer's description; defaults to the provider and author. */
  title?: string | undefined;
}) {
  const label = title ?? embedLabel(embed);
  if (embed.provider === "youtube") {
    return <YouTubeFacade id={embed.id} title={label} />;
  }
  return (
    <EmbedFacade
      provider={embed.provider}
      providerName={EMBED_PROVIDER_NAMES[embed.provider]}
      title={label}
      url={embedUrl(embed)}
      frameSrc={embedFrameSrc(embed)}
    />
  );
}
