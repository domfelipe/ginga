/**
 * Canonical public origin of the Ginga deployment.
 *
 * Single source of truth for every surface that prints or links the production
 * URL: the ExportDialog snippet (`<script src=".../sdk.js">`), the curl line,
 * and the layout's OpenGraph metadata. Set NEXT_PUBLIC_SITE_URL in the
 * environment (inlined at build time — see .env.example); when unset this
 * falls back to the current production deployment (Vercel project `ginga`).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ginga-theta.vercel.app'
).replace(/\/+$/, '');
