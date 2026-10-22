import { JsonLd } from "@/components/layout/json-ld";
import { MdxPage, mdxPageMetadata } from "@/components/layout/mdx-page";
import { siteUrl } from "@/env";
import { getPage } from "@/lib/content";
import { profilePageJsonLd } from "@/lib/seo/jsonld";

export const metadata = mdxPageMetadata("about");

export default function Page() {
  const page = getPage("about");
  return (
    <MdxPage
      slug="about"
      after={
        page === undefined ? null : (
          <JsonLd data={profilePageJsonLd(siteUrl, page)} />
        )
      }
    />
  );
}
