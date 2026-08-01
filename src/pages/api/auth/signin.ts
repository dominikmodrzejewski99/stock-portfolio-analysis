import type { APIRoute } from "astro";
import { isOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

const SIGN_IN_ERROR_URL = "/auth/signin?error=login_failed";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !isOwner(data.user)) {
    if (data.user) {
      await supabase.auth.signOut();
    }
    return context.redirect(SIGN_IN_ERROR_URL);
  }

  return context.redirect("/dashboard");
};
