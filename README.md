# XS Salon

Salon management by Xelorsoft — appointments, billing, clients, team commissions, inventory, reports and public online booking.
Built on the same design system and stack as XS Gym and XS Connect (React + TypeScript + Vite, TanStack Query, Supabase).

- **App:** https://salon.xelorsoft.com
- **Online booking:** `https://salon.xelorsoft.com/book/<salon-slug>`
- **Database:** Supabase project `xs-salon` (org *XS Ecosystem 2*, Mumbai). Schema and business logic in `supabase/migrations/`.
- **Hosting:** Cloudflare Worker `xs-salon` (`worker/index.js`) serves the `deploy` branch, which `.github/workflows/deploy.yml` builds on every push to `main`.

## Develop

```sh
npm ci
cp .env.example .env.local   # or use .env.production values
npm run dev
```

`npm run typecheck`, `npm run lint` and `npm run build` must pass before merging.

## Security model

All money and booking writes go through permission-checked database functions (`checkout`, `book_appointment`, `void_invoice`, …).
Tables are protected by row level security; staff roles (owner, manager, receptionist, stylist) map to permissions in `role_permissions`.
The public booking page can only call `public_salon`, `public_slots` and `public_book`.
