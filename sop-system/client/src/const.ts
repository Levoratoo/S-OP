export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const appId = import.meta.env.VITE_APP_ID?.trim();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  if (!oauthPortalUrl || !appId) {
    console.error(
      "[Auth] Missing VITE_OAUTH_PORTAL_URL or VITE_APP_ID. Check .env."
    );
    return "/";
  }

  let url: URL;
  try {
    url = new URL("/app-auth", oauthPortalUrl);
  } catch (error) {
    console.error("[Auth] Invalid VITE_OAUTH_PORTAL_URL:", oauthPortalUrl, error);
    return "/";
  }

  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
