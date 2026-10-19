# MS Lami-ang Bugas Management System

Records and reports for MS Lami-ang Bugas (Marvie & Salome), a palay buying and rice trading business that has its palay milled by an outside rice miller. A web app hosted on **Vercel**, with all data and logins in **Supabase**.

## Pages

| Page | What you do there |
|---|---|
| **Dashboard** | Today's profit, cash on hand, utang, money owed to farmers, palay and bigas in stock, 30-day profit chart, latest entries |
| **Palay & Inventory** | Buy palay (weight × price), palay in the warehouse (sacks and kilos), balances owed to farmers |
| **Milling & Production** | Each trip to the rice miller: sacks and kilos sent, miller's fee and transport fee per sack, bigas brought back, recovery % |
| **Labor & Payroll** | Crew with daily (arawan) or per-sack / per-kg (pakyaw) rates, daily work log, weekly payroll, mark as paid |
| **Sales, Expenses & P&L** | Bigas sales, collecting utang, overhead (add your own categories), owners' capital and drawings, P&L for any period |
| **Users** | Owners create logins, reset passwords, turn accounts off |

## Logins and access

Everyone logs in with their own **username and password**. Nobody can sign themselves up; owners create accounts on the **Users** page.

| | Owner | Staff |
|---|---|---|
| Record palay, milling, work logs, sales, expenses, payments | Yes | Yes |
| See profit, cash on hand, P&L, owners' capital | Yes | No |
| Mark wages as paid, change pay rates, manage laborers | Yes | No |
| Delete entries | Yes | No |
| Manage users | Yes | No |

These rules are enforced by the database itself (Row Level Security in `supabase/schema.sql`), not just hidden in the screens. Every entry records who entered it.

## How it's put together

```
Browser (Vercel)  ──login / records──▶  Supabase (database + logins)
      │
      └──/api/users──▶  Vercel function (holds the secret key) ──▶  Supabase admin
```

- `src/` — the web app (React). Uses the Supabase **publishable** key, which is safe to be public.
- `api/users.js` — server function for managing logins. Uses the Supabase **secret** key, which never reaches the browser. Only owners can call it.
- `supabase/schema.sql` — tables and access rules. Safe to run again after an update.
- `public/` — logo and the 3D rice sack.

## Deploy on Vercel

1. In Supabase, run `supabase/schema.sql` in **SQL Editor** (again after any update).
2. On [vercel.com/new](https://vercel.com/new), import the GitHub repo. Vercel detects **Vite**; keep its settings.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key |
   | `SUPABASE_URL` | Supabase Project URL (same as above) |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` key |

4. Deploy. Every push to `main` on GitHub redeploys automatically.

Recommended in Supabase: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**.

## Run on your own computer

```
npm install
copy .env.example .env.local   (then fill in the four values)
npm run dev
```

Open http://localhost:5173. User management works locally too.

## How the numbers are calculated

- **Palay cost:** scale weight × price per kg.
- **Miller's fee:** sacks sent × fee per sack. **Transportation:** sacks sent × transport fee per sack.
- **Palay in warehouse:** sacks and kilos bought − sacks and kilos sent to the miller.
- **Recovery:** bigas brought back ÷ palay sent (healthy: 60–65%).
- **Cost of rice sold:** (average palay cost per kg + miller's fee and transport per kg of palay) ÷ average recovery, for each kilo of bigas sold.
- **Net profit:** sales − cost of rice sold − overhead − wages logged.
- **Cash on hand:** owners' capital + money collected − palay paid − miller's and transport fees − expenses − wages paid − drawings.
