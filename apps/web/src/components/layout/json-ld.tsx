import { serializeJsonLd, type JsonLdDocument } from "@/lib/seo/jsonld";

/** The only sanctioned `dangerouslySetInnerHTML`: built from typed data, `<` escaped. */
export function JsonLd({ data }: { data: JsonLdDocument }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
