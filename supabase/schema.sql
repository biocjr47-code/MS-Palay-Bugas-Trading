-- MS Lami-ang Bugas Management System — Supabase schema
-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to run again after an update: it only adds what is missing.
-- Weights are in kilograms, money in Philippine pesos.

create table if not exists palay_purchases (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    farmer        text        not null,
    barangay      text,
    variety       text,                             -- unused: palay is not tracked by variety
    sacks         integer     not null default 0,
    gross_kg      numeric(12,2) not null check (gross_kg > 0),
    moisture_pct  numeric(5,2)  not null default 14,
    net_kg        numeric(12,2) not null,           -- after moisture deduction
    price_per_kg  numeric(10,2) not null check (price_per_kg >= 0),
    total_cost    numeric(14,2) not null,
    amount_paid   numeric(14,2) not null default 0,
    notes         text,
    created_at    timestamptz not null default now()
);

-- Palay sent to an outside rice miller, and the bigas brought back the same day.
create table if not exists milling_runs (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    miller        text,                              -- rice miller company
    variety       text,                              -- unused: trips are not split by variety
    sacks         integer     not null default 0,    -- palay sacks sent
    palay_kg      numeric(12,2) not null check (palay_kg > 0),
    rice_kg       numeric(12,2) not null default 0,  -- bigas received
    binlid_kg     numeric(12,2) not null default 0,  -- unused: the miller keeps by-products
    darak_kg      numeric(12,2) not null default 0,
    ipa_kg        numeric(12,2) not null default 0,
    recovery_pct  numeric(5,2)  not null default 0,  -- bigas / palay
    fee_per_kg    numeric(10,2) not null default 0,  -- unused (older version)
    fee_per_sack  numeric(10,2) not null default 0,  -- miller's fee per sack of palay
    milling_fee   numeric(14,2) not null default 0,  -- sacks x fee_per_sack
    transport_per_sack numeric(10,2) not null default 0,  -- hauling to the miller, per sack
    transport_fee numeric(14,2) not null default 0,  -- sacks x transport_per_sack
    operator      text,
    notes         text,
    created_at    timestamptz not null default now()
);
-- If the table already existed before this change, these add the new columns. Safe to re-run.
alter table milling_runs add column if not exists miller      text;
alter table milling_runs add column if not exists sacks       integer       not null default 0;
alter table milling_runs add column if not exists fee_per_kg  numeric(10,2) not null default 0;
alter table milling_runs add column if not exists milling_fee numeric(14,2) not null default 0;
alter table milling_runs add column if not exists fee_per_sack       numeric(10,2) not null default 0;
alter table milling_runs add column if not exists transport_per_sack numeric(10,2) not null default 0;
alter table milling_runs add column if not exists transport_fee      numeric(14,2) not null default 0;
alter table milling_runs alter column variety drop not null;
alter table palay_purchases alter column variety drop not null;

create table if not exists sales (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    customer      text        not null,
    product       text        not null check (product in ('Bigas','Binlid','Darak','Ipa','Toll milling')),
    qty_kg        numeric(12,2) not null check (qty_kg > 0),
    price_per_kg  numeric(10,2) not null check (price_per_kg >= 0),
    total         numeric(14,2) not null,
    amount_paid   numeric(14,2) not null default 0,
    notes         text,
    created_at    timestamptz not null default now()
);

create table if not exists laborers (
    id            bigint generated always as identity primary key,
    name          text        not null,
    role          text,
    pay_basis     text        not null check (pay_basis in ('Daily','Per sack','Per kg')),
    rate          numeric(10,2) not null check (rate >= 0),
    active        boolean     not null default true,
    created_at    timestamptz not null default now()
);

create table if not exists labor_logs (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    laborer_id    bigint      references laborers(id) on delete set null,
    laborer_name  text        not null,
    pay_basis     text        not null,
    quantity      numeric(12,2) not null check (quantity > 0),  -- days, sacks or kilos
    rate          numeric(10,2) not null,
    amount        numeric(14,2) not null,
    task          text,
    paid          boolean     not null default false,
    paid_date     date,
    created_at    timestamptz not null default now()
);

create table if not exists expenses (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    category      text        not null,
    description   text,
    payee         text,
    amount        numeric(14,2) not null check (amount > 0),
    created_at    timestamptz not null default now()
);

create table if not exists owner_transactions (
    id            bigint generated always as identity primary key,
    date          date        not null default current_date,
    owner         text        not null check (owner in ('Marvie','Salome')),
    kind          text        not null check (kind in ('Capital in','Drawing')),
    amount        numeric(14,2) not null check (amount > 0),
    notes         text,
    created_at    timestamptz not null default now()
);

create index if not exists palay_purchases_date_idx on palay_purchases (date);
create index if not exists milling_runs_date_idx    on milling_runs (date);
create index if not exists sales_date_idx           on sales (date);
create index if not exists labor_logs_date_idx      on labor_logs (date);
create index if not exists expenses_date_idx        on expenses (date);

-- Who entered each record: filled in by the database from the login, so it can't be faked.
alter table palay_purchases    add column if not exists created_by text;
alter table milling_runs       add column if not exists created_by text;
alter table sales              add column if not exists created_by text;
alter table laborers           add column if not exists created_by text;
alter table labor_logs         add column if not exists created_by text;
alter table expenses           add column if not exists created_by text;
alter table owner_transactions add column if not exists created_by text;

-- The logged-in person's role and username, from their login token.
-- Both live in app_metadata, which only the server's secret key can change.
create or replace function public.app_role() returns text
language sql stable as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') $$;
create or replace function public.app_username() returns text
language sql stable as $$ select auth.jwt() -> 'app_metadata' ->> 'username' $$;

alter table palay_purchases    alter column created_by set default public.app_username();
alter table milling_runs       alter column created_by set default public.app_username();
alter table sales              alter column created_by set default public.app_username();
alter table laborers           alter column created_by set default public.app_username();
alter table labor_logs         alter column created_by set default public.app_username();
alter table expenses           alter column created_by set default public.app_username();
alter table owner_transactions alter column created_by set default public.app_username();

-- Row Level Security: nobody without a login can read or change anything.
-- Owners can do everything. Staff can read and add records, record payments on
-- palay and sales, but cannot delete, edit other records, or touch owners' capital.
alter table palay_purchases    enable row level security;
alter table milling_runs       enable row level security;
alter table sales              enable row level security;
alter table laborers           enable row level security;
alter table labor_logs         enable row level security;
alter table expenses           enable row level security;
alter table owner_transactions enable row level security;

do $$
declare
  t text;
  p record;
begin
  -- start clean so re-running this file never duplicates policies
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('palay_purchases','milling_runs','sales','laborers','labor_logs','expenses','owner_transactions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  -- owners: full access everywhere
  foreach t in array array['palay_purchases','milling_runs','sales','laborers','labor_logs','expenses','owner_transactions'] loop
    execute format($f$create policy owner_all on public.%I for all to authenticated
                      using (public.app_role() = 'owner') with check (public.app_role() = 'owner')$f$, t);
  end loop;

  -- staff: read and add the day-to-day records
  foreach t in array array['palay_purchases','milling_runs','sales','laborers','labor_logs','expenses'] loop
    execute format($f$create policy staff_read on public.%I for select to authenticated
                      using (public.app_role() = 'staff')$f$, t);
  end loop;
  foreach t in array array['palay_purchases','milling_runs','sales','labor_logs','expenses'] loop
    execute format($f$create policy staff_add on public.%I for insert to authenticated
                      with check (public.app_role() = 'staff')$f$, t);
  end loop;
end $$;

-- staff may record payments (farmer payments, collecting utang): only the amount_paid column
create policy staff_pay on public.palay_purchases for update to authenticated
  using (public.app_role() = 'staff') with check (public.app_role() = 'staff');
create policy staff_pay on public.sales for update to authenticated
  using (public.app_role() = 'staff') with check (public.app_role() = 'staff');
revoke update on public.palay_purchases, public.sales from authenticated;
grant  update (amount_paid) on public.palay_purchases, public.sales to authenticated;
