/** Design tokens referenced by the approved component registry. */

export type DesignToken = {
  name: string;
  cssVar: string;
  role: "color" | "radius" | "font" | "space";
};

export const DESIGN_TOKENS: DesignToken[] = [
  { name: "background", cssVar: "--background", role: "color" },
  { name: "foreground", cssVar: "--foreground", role: "color" },
  { name: "primary", cssVar: "--primary", role: "color" },
  { name: "primary-foreground", cssVar: "--primary-foreground", role: "color" },
  { name: "secondary", cssVar: "--secondary", role: "color" },
  { name: "secondary-foreground", cssVar: "--secondary-foreground", role: "color" },
  { name: "destructive", cssVar: "--destructive", role: "color" },
  { name: "card", cssVar: "--card", role: "color" },
  { name: "card-foreground", cssVar: "--card-foreground", role: "color" },
  { name: "border", cssVar: "--border", role: "color" },
  { name: "radius", cssVar: "--radius", role: "radius" },
  { name: "font-sans", cssVar: "--font-sans", role: "font" },
];

export function assertTokensExist(names: string[]): void {
  const known = new Set(DESIGN_TOKENS.map((t) => t.cssVar));
  for (const name of names) {
    if (!known.has(name)) {
      throw new Error(`unknown design token: ${name}`);
    }
  }
}
