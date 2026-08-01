declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}

// `astro:env/server` types are generated from the schema in astro.config.mjs.
