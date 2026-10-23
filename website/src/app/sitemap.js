import { SITE_URL } from "@/lib/site";

export default function sitemap() {
  return ["/", "/privacy", "/delete-account"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
