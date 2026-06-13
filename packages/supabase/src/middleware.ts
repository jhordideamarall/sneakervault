import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const AUTH_USER_ID_HEADER = "x-sneakervault-user-id";

export async function updateSession(request: NextRequest) {
  // Propagate the pathname as a custom header so server components (e.g. layouts)
  // can apply role-based route protection without redundant auth calls.
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.delete(AUTH_USER_ID_HEADER);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
  let refreshedCookies: Array<{
    name: string;
    value: string;
    options: Parameters<typeof supabaseResponse.cookies.set>[2];
  }> = [];

  const responseWithCookies = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    refreshedCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  const redirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url);
    refreshedCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  // "/" immediately redirects to /workspace. Avoid doing auth work here; the
  // next request is protected and will refresh/validate the session.
  if (pathname === "/") {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          refreshedCookies = cookiesToSet.map(({ name, value, options }) => ({
            name,
            value,
            options,
          }));
          supabaseResponse = responseWithCookies();
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isLoginPage = pathname.startsWith("/login");
  const isPublicPage = isLoginPage;
  let isActiveUser = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    isActiveUser = profile?.is_active === true;
    if (isActiveUser) requestHeaders.set(AUTH_USER_ID_HEADER, user.id);
  }

  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (user && !isActiveUser && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("inactive", "1");
    return redirectWithCookies(url);
  }

  if (user && isActiveUser && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    return redirectWithCookies(url);
  }

  return responseWithCookies();
}
