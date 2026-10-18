import { MdxPage, mdxPageMetadata } from "@/components/layout/mdx-page";

export const metadata = mdxPageMetadata("about");

export default function Page() {
  return <MdxPage slug="about" />;
}
