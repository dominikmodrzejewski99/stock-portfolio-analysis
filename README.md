# MyPortfelik

![](./public/template.png)

A private web application for analysing an XTB investment portfolio. The MVP supports one owner account created manually in Supabase; public registration is disabled.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase, create the owner account, and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create local environment files:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

2. Open Studio at `http://127.0.0.1:54323`, go to **Authentication → Users**, and create the owner manually. Copy the user's UUID — not their email address.

3. Copy the credentials printed by the CLI and the owner UUID into `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
OWNER_USER_ID=<UUID from Authentication → Users>
```

4. Run `npm run dev`, then open `http://localhost:4321/auth/signin`.

5. To stop the stack when done:

```bash
npx supabase stop
```

No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable        | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| `SUPABASE_URL`  | Project URL from Supabase dashboard → Settings → API            |
| `SUPABASE_KEY`  | Publishable or legacy `anon` key from Settings → API             |
| `OWNER_USER_ID` | UUID of the manually created owner from Authentication → Users   |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<publishable-or-anon-key>
OWNER_USER_ID=<owner-uuid>
```

Create the owner in **Authentication → Users**. Then disable **Allow new users to sign up** in the hosted project's **Authentication** settings. The repository's `supabase/config.toml` disables signup globally for the local stack while keeping the email provider enabled so the existing owner can still sign in.

### Owner access policy

- Only a valid Supabase session whose `user.id` equals `OWNER_USER_ID` can open private routes.
- A different authenticated account is signed out and denied access.
- Missing or incorrect `OWNER_USER_ID` fails closed and blocks all private access.
- Do not prefix `OWNER_USER_ID` with `PUBLIC_` or expose it to client code.

### Auth routes

| Route          | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `/auth/signin` | Owner email/password sign-in form                                  |
| `/dashboard`   | Private owner area; unauthenticated and non-owner access is denied |

Route protection is handled in `src/middleware.ts`. New portfolio pages must be covered by `PROTECTED_ROUTES` before they store or display private data.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `OWNER_USER_ID` separately for Preview and Production in the Cloudflare project settings. Do not commit their real values. Add the deployed application URLs to the Supabase authentication redirect allow-list before testing sign-in.

## CI

GitHub Actions runs lint + build on every push and PR. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and `OWNER_USER_ID` as repository secrets only if the workflow needs runtime secrets during its checks.

## License

MIT
