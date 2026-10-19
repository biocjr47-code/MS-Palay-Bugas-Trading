# MS Lami-ang Bugas — Product Context

> Written from the owners' brief plus four answered setup questions. Lines marked *(assumed)* are inferences — correct them freely.

## What it is
An internal management system for **MS Lami-ang Bugas**, a palay buying and rice trading business in the Philippines owned by **Marvie and Salome**. It records every peso and every kilo that moves through the mill: palay bought from farmers, milling runs, labor, sales, and overhead.

## Who uses it
- **Marvie and Salome (owners)** — check the day's numbers, cash position and stock, often on a phone, often at the mill in daylight.
- **A trusted encoder / bookkeeper** *(assumed)* — types in purchases, milling output, and payroll during the day.

## Jobs to be done
1. Know today's profit and cash on hand in under ten seconds.
2. Record a palay purchase at the weighing scale (paid on scale weight; the owners do not measure moisture).
3. Record each trip to the outside rice miller (sacks and kilos sent, miller's fee and transport fee per sack, bigas brought back the same day; no variety tracking) and see the recovery rate against the normal 60–65% range. Only bigas comes back; the miller keeps the by-products.
4. Pay laborers correctly — daily rate (*arawan*) or per output (*pakyaw*, per sack/kilo) — and know who is still unpaid.
5. See the month's P&L: sales, cost of rice sold, overhead, net income.

## Language
English UI, with the trade's own words kept: palay, bigas, kilo, sako, utang, arawan, pakyaw.

## Brand
- **Name read (SMILE/SCRATCH, Alexandra Watkins):** "Lami-ang Bugas" — *delicious rice* in Visayan. Suggestive, meaningful and emotional; it promises taste, not just tonnage. The "MS" mark is the owners' initials. Risk: the hyphen and the regional word can trip non-Visayan buyers, so the name always appears in full and is never abbreviated in the UI.
- **Personality (Jennifer Aaker):** *Sincerity* first (family-run, honest weights, fair farmer prices), *Competence* second (accurate books, reliable supply).
- **Voice:** plain, warm, matter-of-fact. Name the action ("Save purchase", "Mark as paid"). Errors say what is wrong and how to fix it. No hype words.

## Visual world — "Harvest field"
Rice-husk off-white surfaces, charcoal ink with a green undertone, one paddy-green accent for actions and selection. Grain-gold appears only as the "loss" color in charts and as the warning state. Light theme only: it is used at the mill and in the field in daylight.

## Register
Operate. The tool disappears into the task; brand lives in the details (the 3D sack, the type, the color of the husk).

## Constraints
- Philippine Peso shown everywhere as `₱12,345.00`.
- Must work on a phone on mobile data. No heavy assets beyond one small 3D scene.
- Data lives in Supabase; the service key stays server-side in Streamlit secrets.
