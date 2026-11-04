/** The Vercel actor route only runs with a private Rivet endpoint (https://namespace:token@host).
 *  RivetKit uses it to check that /start requests really come from Rivet Cloud. */
export function rivetRouteEnabled(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && u.username.length > 0 && u.password.length > 0;
  } catch {
    return false;
  }
}
