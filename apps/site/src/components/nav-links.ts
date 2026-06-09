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
  { id: "docs", label: "Docs", href: "/getting-started/", icon: "book" },
  { id: "wellness", label: "Wellness", href: "/wellness/", icon: "heart" },
  { id: "api", label: "API", href: "/wellness/reference", icon: "braces" },
  { id: "registry", label: "Registry", href: "/registry/", icon: "code" },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/IEvangelist/devngn.ai",
    icon: "github",
    external: true,
  },
];
