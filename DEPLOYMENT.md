# Deployment Guide

This project is a TanStack Start application built with Vite and deployed to Cloudflare through Nitro.

## Requirements

- Node.js 20 or newer
- npm
- A Cloudflare account with Wrangler access

## Local setup

From the repository root:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The project uses the `@` alias for `src`, and the existing Vite configuration already registers the TanStack Start, React, Tailwind, and Cloudflare plugins.

## Environment variables

Create a local `.env` file when the app needs Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

Only variables prefixed with `VITE_` are exposed to browser code. Never put a Supabase service-role key or another secret in a `VITE_` variable or commit a `.env` file.

Configure the same variables in the Cloudflare deployment environment before publishing. If a value is only needed by server code, keep it as a non-`VITE_` secret and read it from the server runtime rather than client code.

## Verify before deployment

Run the checks from the repository root:

```sh
npm run lint
npm run build
npm run preview
```

The build creates `.output/`. The preview command serves the generated application locally so routes and assets can be checked before deployment.

## Deploy to Cloudflare

Authenticate Wrangler once on the machine:

```sh
npx wrangler login
```

Then deploy the prebuilt Nitro output:

```sh
npm run deploy
```

For a deployment validation without publishing:

```sh
npm run deploy:dry-run
```

The generated Cloudflare configuration is written during `npm run build`. Do not add a separate `main` entry to `wrangler.jsonc`; the TanStack Start Cloudflare plugin supplies the deploy entry automatically.

## Common issues

### `Cannot find module 'sonner'`

Run `npm install` from this directory, not its parent directory. Confirm the package is installed with:

```sh
npm ls sonner --depth=0
```

### Build works but the browser has stale assets

Stop the dev server, remove the generated `.output/` directory, and run `npm run build` again. `.output/` is generated and should not be committed.

### Cloudflare authentication or permission errors

Run `npx wrangler whoami`, then confirm the logged-in account has access to the target Cloudflare project. The application name is `tanstack-start-app` in `wrangler.jsonc`.

## Important generated files

- `src/routeTree.gen.ts` is generated from the route files. Avoid hand-editing it.
- `.output/` and `.wrangler/` are generated deployment artifacts.
- `wrangler.jsonc` contains deployment metadata, not application secrets.