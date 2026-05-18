# The Wolf Den Site

Conversion-focused Next.js MVP for a local trading card store in Montgomery, MN.

## Included Launch Sitemap

- Home
- Shop
- Events
- Sell Your Cards
- New Players / Parents
- Community
- Contact
- FAQ

## Local Development

```bash
npm install
npm run dev
```

## Consignment Portal

The consignment portal lives at `/consign/[slug]` and is intentionally read-only.

### Architecture

- **Database**: Neon PostgreSQL stores consignor identity, category IDs, payout rates, password hashes, and active status.
- **Secrets**: Only app-wide secrets stored in environment variables (Square token, database URL, session secret).
- **Security**: Square credentials stay server-side only inside `src/app/api/consignment/**`. The browser only receives filtered consignor-safe inventory and sales JSON.
- **Authentication**: Password-based login with bcrypt hashing. Supports password change requirement on first login.

### Environment Setup

#### Local Development

1. Pull environment variables from Vercel:
   ```bash
   vercel env pull .env.development.local
   ```
   This automatically includes `DATABASE_URL` and any other Vercel-configured secrets.

2. Add missing secrets (if not already in Vercel):
   ```bash
   SQUARE_ACCESS_TOKEN=
   SQUARE_LOCATION_ID=
   CONSIGNMENT_SESSION_SECRET=
   ADMIN_API_KEY=
   RESEND_API_KEY=
   NEXT_PUBLIC_BASE_URL=https://wolfdengamingmn.com
   ```

#### Production

`DATABASE_URL` is managed by the Vercel ↔ Neon integration.

Set these manually in Vercel for portal/admin features:
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `CONSIGNMENT_SESSION_SECRET`
- `ADMIN_API_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_BASE_URL` (optional override)

### Initial Database Setup

1. Create the consignors table and setup tokens table:
   ```bash
   node scripts/setup-consignors.js
   ```

2. Find Square Catalog Category IDs:
   - Log into your Square Dashboard
   - Navigate to **Catalog** → **Categories**
   - Note the category ID for each consignor

3. Create consignor records with email-based setup link:
   ```bash
   node scripts/seed-consignor.js \
     --slug pedro \
     --name "Pedro" \
     --email pedro@example.com \
     --category SQUARE_CATEGORY_ID \
     --rate 0.5
   ```

   This will:
   - Create the consignor in the database
   - Generate a secure setup token
   - Send a setup email via Resend to `pedro@example.com`
   - Consignor clicks the link to set their password

### Setup Flow

1. Admin seeds consignor without password
2. App generates a cryptographically secure setup token
3. App sends email with setup link via Resend
4. Consignor clicks `/consign/setup?token=...`
5. Consignor sets their password
6. Password hashed with bcrypt and stored
7. Setup token consumed (one-time use)
8. Consignor can now log in at `/consign/[slug]`

Setup tokens expire after 14 days.

### Portal Routes

- `GET /consign/[slug]` — Portal page (requires auth)
- `POST /api/consignment/auth` — Password login
- `GET /api/consignment/me` — Current authenticated consignor profile/status
- `GET /api/consignment/dashboard` — Authenticated inventory, sales, and summary
- `GET /api/consignment/inventory` — Authenticated inventory list (legacy)
- `GET /api/consignment/sales` — Authenticated sales history (legacy)
- `POST /api/consignment/change-password` — Password change (future)

### Internal Admin API (Temporary)

These endpoints are for the private sideloaded internal phone app during development.

- `GET /api/admin/consignors` — List consignors with onboarding status
- `GET /api/admin/consignors/:id` — Consignor profile/config + onboarding + summary totals
- `POST /api/admin/consignors/create` — Create consignor and send setup email
- `POST /api/admin/consignors/:id/invite` — Re-send onboarding invite and invalidate old unused tokens
- `PATCH /api/admin/consignors/:id` — Update profile/config fields
- `POST /api/admin/consignors/:id/revoke` — Set active false and invalidate unused setup tokens
- `POST /api/admin/consignors/:id/restore` — Set active true
- `GET /api/admin/consignors/:id/dashboard` — Same normalized dashboard payload used by consignor portal

Admin auth requirements:
- Header: `x-admin-key: <ADMIN_API_KEY>`
- Runtime: Node.js server runtime only

Error response format:
```json
{ "error": "slug_already_exists" }
```

## MVP Notes

- Homepage CTA hierarchy emphasizes Discord, Events, and opening updates/shop.
- "Sell Your Cards" is first-class in nav, homepage, and footer.
- Events include detail pages with fee, format, prize support, capacity, beginner notes, and refund policy.
- Shopify can be added as embedded/storefront integration in the `shop` route.
