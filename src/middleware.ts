import { defineMiddleware } from "astro:middleware";
import { isOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    const user = context.locals.user;

    if (!user) {
      return context.redirect("/auth/signin");
    }

    if (!isOwner(user)) {
      await supabase?.auth.signOut();
      context.locals.user = null;
      return context.redirect("/auth/signin?error=access_denied");
    }
  }

  return next();
});
