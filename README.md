# Order System

An order processing portal with three roles.

| | Admin | Client | Team |
|---|---|---|---|
| Create orders | Any client, with reference and assignee | Own orders | No |
| See orders | All, with client switcher | Own | Assigned only |
| Rate per order | Sets and sees | Sees | Hidden |
| Processing price | Sees | Hidden | Enters, then hidden |
| Account name, status, tracking | Sees | Sees | Sees and enters |
| Payments | Records Amount In | Sees balance and history | Hidden |
| Analytics | All or per client, plus team | Own | Own |

## Workflow

1. A client or admin pastes the customer details, product link, variant, and card info. The client's current rate is locked on the order.
2. Admin assigns it, individually or in bulk, to a team member.
3. The team member can reveal the masked card info, then enters **Account Name** and **Price** to set it to **Processing**. This permanently deletes the card info.
4. The team member adds **tracking**. The order becomes **Completed** and **Payment pending**.
5. Admin records **Amount In**, applied oldest-first or to selected orders. Paid orders move to **Archive**, and any remainder stays as client credit that pays future orders automatically.

## Local setup

```bash
npm install
cp .env.example .env   # fill in the values
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Sign in with the seeded admin, then add clients and team members under **Clients & Team**. There is no public sign-up.

## Production

```bash
npm ci
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.js
```

Use a new, empty database. This schema replaces the earlier etsyship schema and does not migrate its data.
