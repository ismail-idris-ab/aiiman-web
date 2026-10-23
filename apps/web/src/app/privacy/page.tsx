import { MdxPage, mdxPageMetadata } from "@/components/layout/mdx-page";

export const generateMetadata = () => mdxPageMetadata("privacy");

export default function Page() {
  return <MdxPage slug="privacy" />;
}
