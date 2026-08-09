import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/";
  const isCompanySetupPage = pathname === "/company-setup";
  const isApiRoute = pathname.startsWith("/api/");

  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Gate every protected page behind company setup until the profile's
  // required fields are filled in. Exempt the setup wizard itself (or the
  // gate would redirect-loop) and API routes (they return JSON, not pages,
  // so redirecting them would break the fetch calls that hit them). The
  // settings page at /company-profile is intentionally NOT exempt — an
  // incomplete user landing there directly gets sent through the wizard
  // instead, since that's now the only path for initial setup.
  if (user && !isApiRoute && !isCompanySetupPage) {
    const { data: companyProfile } = await supabase
      .from("company_profile")
      .select("company_setup_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyProfile?.company_setup_completed) {
      return NextResponse.redirect(new URL("/company-setup", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
