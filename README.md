# MS Lami-ang Bugas Management System

Records and reports for MS Lami-ang Bugas (Marvie & Salome), a palay buying and rice trading business that has its palay milled by an outside rice miller: palay buying, milling, payroll, sales, expenses and profit. Built with Streamlit, with all data stored in Supabase.

## Modules

| Page | What you do there |
|---|---|
| **Dashboard** | Today's profit, cash on hand, receivables (utang), stock on hand, 30-day profit chart, latest entries |
| **Palay & Inventory** | Buy palay (weight × price computed for you), palay stock per variety, balances owed to farmers |
| **Milling & Production** | Record each trip to the rice miller: sacks and kilos of palay sent (subtracted from the warehouse), the miller's fee and transportation fee per sack, and the bigas brought back. Shows the recovery % against the normal 60–65% |
| **Labor & Payroll** | Crew list with daily (arawan) or per-sack / per-kg (pakyaw) rates, daily work log, weekly payroll and "mark as paid" |
| **Sales, Expenses & P&L** | Record bigas sales, collect utang, record overhead, owners' capital and drawings, P&L for any period |

## First-time setup

1. **Install Python packages** (Python 3.10 or newer):
   ```
   pip install -r requirements.txt
   ```
2. **Create the tables in Supabase.** Open your project, go to **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and click **Run**. After an app update, run it again: it only adds what is missing and never deletes data.
3. **Add your keys.** Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and fill in:
   - `url`: Project Settings → API → Project URL
   - `key`: Project Settings → API → **service_role** key. It stays on the server and is never sent to the browser. Row Level Security is switched on, so the public anon key can't read anything.
   - `password`: the password people type to open the app.
4. **Run it:**
   ```
   streamlit run app.py
   ```
   Open http://localhost:8501. On a phone on the same Wi-Fi, use the "Network URL" Streamlit prints.

Until step 3 is done, the app runs in **demo mode** with sample data, and nothing is saved.

## Logins

Everyone logs in with their own **username and password**. Nobody can sign themselves up.

- **First time:** the app shows *Create the first owner account*. Enter the `setup_code` from `.streamlit/secrets.toml`, then a name, username and password. That owner is logged in right away.
- **Adding people:** owners open **Users** in the menu → *Add a user*. Hand over the username and password in person.
- **Forgot password / someone leaves:** on the Users page, owners can set a new password, turn an account off (it can no longer log in; its past entries stay), or switch someone between Owner and Staff.

| | Owner | Staff |
|---|---|---|
| Record palay, milling, work logs, sales, expenses | Yes | Yes |
| See profit, cash on hand, P&L, owners' capital | Yes | No |
| Mark wages as paid, change pay rates, manage laborers | Yes | No |
| Delete entries | Yes | No |
| Manage users | Yes | No |

Every new entry records who entered it ("Entered by" on the Dashboard). Accounts are stored in Supabase under **Authentication → Users**.

Recommended in Supabase: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**. The app already rejects accounts it didn't create, but this closes the door completely.

## How the numbers are calculated

- **Palay cost:** scale weight × price per kg.
- **Milling recovery:** `bigas brought back ÷ palay sent`.
- **Miller's fee:** `sacks sent × fee per sack`. **Transportation:** `sacks sent × transport fee per sack`. Both are paid on the day of milling.
- **Palay in warehouse:** sacks and kilos bought − sacks and kilos sent to the miller.
- **Cost of rice sold:** `(average palay cost per kg + miller's fee and transport per kg of palay) ÷ average recovery`, applied to each kilo of bigas sold.
- **Net profit:** sales − cost of rice sold − overhead − wages logged.
- **Cash on hand:** owners' capital + money collected − palay paid − miller's and transport fees − expenses − wages paid − drawings.

## Putting it online

Push the folder to a private GitHub repo **without** `secrets.toml` (it is in `.gitignore`), deploy it on [Streamlit Community Cloud](https://streamlit.io/cloud), and paste the contents of your `secrets.toml` into the app's **Settings → Secrets**.

## Files

```
app.py                 entry point, sidebar navigation, password lock
views/                 the five pages
lib/calc.py            business rules (recovery, P&L, cash)
lib/db.py              Supabase access, plus the demo-mode store
lib/ui.py              colors, fonts, ₱ formatting, charts
assets/sack.html       the 3D rice sack on the dashboard (three.js, built in code)
supabase/schema.sql    database tables
PRODUCT.md             brand and product notes
```
