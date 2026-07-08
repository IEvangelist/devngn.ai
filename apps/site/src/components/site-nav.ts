// Single source of truth for the site-wide left sidebar, consumed by the shared
// shell (SiteSidebar.astro) so every page (marketing, docs, legal, registry)
// shows the exact same grouped navigation with the current page highlighted.

export interface SidebarItem {
  label: string;
  href: string;
  external?: boolean;
  icon?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

// Grouped section navigation for the left rail. Top-level primary destinations
// live in the top nav (nav-links.ts); here we surface each content section's
// landing + its deep/reference pages, so the sidebar highlights where you are
// (e.g. Docs > Getting started, Wellness > Overview) on the pages that show it.
// Raw machine-readable endpoints (*.json) are marked `external` so they open in
// a new tab and get an external-link icon on the right.
export const siteSidebar: SidebarGroup[] = [
  {
    label: "Docs",
    items: [{ label: "Getting started", href: "/getting-started/", icon: "book" }],
  },
  {
    label: "Wellness",
    items: [
      { label: "Overview", href: "/wellness/", icon: "heart" },
      { label: "API reference", href: "/wellness/reference", icon: "braces" },
      { label: "OpenAPI document", href: "/wellness/openapi.json", icon: "file", external: true },
    ],
  },
  {
    label: "Developers",
    items: [
      { label: "Vendor registry", href: "/registry/", icon: "tag" },
      { label: "Registry JSON", href: "/registry/v1/vendors.json", icon: "braces", external: true },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Terms of Use", href: "/terms/", icon: "file" },
      { label: "Privacy", href: "/privacy/", icon: "shield" },
    ],
  },
];

/** Normalise a path for active-link comparison (ignore trailing slash). */
export function normalizePath(path: string): string {
  if (!path) return "/";
  const clean = path.split("#")[0].split("?")[0];
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean;
}
