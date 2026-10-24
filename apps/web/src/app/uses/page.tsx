import { MdxPage, mdxPageMetadata } from "@/components/layout/mdx-page";

export const generateMetadata = () => mdxPageMetadata("uses");

export default function Page() {
  return <MdxPage slug="uses" />;
}
