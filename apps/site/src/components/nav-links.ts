// Canonical primary navigation, shared by the marketing shell (SiteHeader)
// and the Starlight docs header override (SocialIcons) so every page in the
// site exposes the exact same set of links in the same order.
export interface NavLink {
  id: string;
  label: string;
  href: string;
  icon: string;
  external?: boolean;
}

export const navLinks: NavLink[] = [
  { id: "features", label: "Features", href: "/features/", icon: "bolt" },
  { id: "pricing", label: "Pricing", href: "/pricing/", icon: "tag" },
  { id: "download", label: "Download", href: "/download/", icon: "download" },
  { id: "docs", label: "Docs", href: "/getting-started/", icon: "book" },
  { id: "wellness", label: "Wellness", href: "/wellness/", icon: "heart" },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/IEvangelist/devngn.ai",
    icon: "github",
    external: true,
  },
];
