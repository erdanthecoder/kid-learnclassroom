-- MoneyMap: every row belongs to exactly one signed-in user, and row-level
-- security makes that ownership the only way in. There is deliberately no
-- column anywhere for a card number, PIN, CVV or bank password.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles: one row per user, holds settings ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  base_currency text not null default 'USD',
  theme text not null default 'dark',
  categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- currencies: the user's own exchange rates ----------
create table if not exists public.currencies (
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  name text not null default '',
  rate numeric not null check (rate > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- ---------- wallets: cash pockets and card money ----------
create table if not exists public.wallets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default 'Wallet',
  kind text not null default 'cash' check (kind in ('cash', 'card')),
  currency text not null default 'USD',
  opening numeric not null default 0,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- transactions: what was spent, earned or moved ----------
create table if not exists public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  wallet_id text not null default '',
  to_wallet_id text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  received numeric not null default 0 check (received >= 0),
  category text not null default '',
  place text not null default '',
  date date not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);
create index if not exists wallets_user_idx
  on public.wallets (user_id);

-- ---------- keep updated_at honest ----------
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists currencies_touch on public.currencies;
create trigger currencies_touch before update on public.currencies
  for each row execute function public.touch_updated_at();

drop trigger if exists wallets_touch on public.wallets;
create trigger wallets_touch before update on public.wallets
  for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.currencies enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;

-- profiles are keyed by the user id itself
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);
