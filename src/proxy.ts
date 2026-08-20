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
  const isChoosePlanPage = pathname === "/choose-plan";
  const isResetPasswordPage = pathname === "/reset-password";
  const isApiRoute = pathname.startsWith("/api/");
  const isStripeApiRoute = pathname.startsWith("/api/stripe/");

  // Password-recovery links land here without a session cookie yet — the
  // client-side Supabase JS still needs to process the URL (hash tokens or
  // a ?code= param) to establish one. The server never sees that until
  // after the client mounts, so this page must be reachable while
  // "unauthenticated" from the middleware's point of view.
  if (!user && !isLoginPage && !isResetPasswordPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Gate every protected page behind company setup until the profile's
  // required fields are filled in. Exempt the setup wizard itself (or the
  // gate would redirect-loop), the reset-password page (a user recovering
  // their password shouldn't get bounced mid-flow), and API routes (they
  // return JSON, not pages, so redirecting them would break the fetch calls
  // that hit them). The settings page at /company-profile is intentionally
  // NOT exempt — an incomplete user landing there directly gets sent
  // through the wizard instead, since that's now the only path for initial
  // setup.
  if (user && !isApiRoute && !isCompanySetupPage && !isResetPasswordPage) {
    const { data: companyProfile } = await supabase
      .from("company_profile")
      .select("company_setup_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyProfile?.company_setup_completed) {
      return NextResponse.redirect(new URL("/company-setup", request.url));
    }
  }

  // Subscription hard-lock: replaces the old per-user trial-expiry check
  // (is_trial_expired() — left in the database, unused, not deleted) with
  // an organization-level one. Runs after company-setup so an org exists
  // to check by the time this fires. has_active_subscription() treats
  // 'trialing'/'active'/'grandfathered' as passing (see migration 054).
  // Exempts /choose-plan itself (or this would redirect-loop) and the
  // Stripe API routes themselves — create-checkout-session in particular
  // has to be callable by a user who does NOT have a subscription yet, or
  // nobody could ever start checkout in the first place. The webhook route
  // is separately exempt in effect: Stripe calls it directly with no user
  // session, so `user` is null and this whole block is skipped for it.
  // Other API routes get a 403 instead of a redirect, same reasoning as
  // the gate above.
  if (user && !isCompanySetupPage && !isChoosePlanPage && !isResetPasswordPage && !isStripeApiRoute) {
    const { data: hasSubscription } = await supabase.rpc("has_active_subscription");
    if (!hasSubscription) {
      if (isApiRoute) {
        return NextResponse.json({ error: "No active subscription." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/choose-plan", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
