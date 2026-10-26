-- Achadô: executar uma vez em um projeto Supabase novo.
-- Nenhum segredo ou token externo deve ser armazenado nestas tabelas públicas.
begin;
create table public.preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table public.offers (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 marketplace_id text not null,
 market text not null check(market in ('Shopee','Mercado Livre')),
 title text not null,
 niche text not null,
 price numeric(12,2) not null check(price>0),
 old_price numeric(12,2) check(old_price>=price),
 commission numeric(5,2) not null check(commission between 0 and 100),
 rating numeric(2,1) check(rating between 0 and 5),
 affiliate_url text,
 coupon text,
 status text not null default 'pending' check(status='pending'),
 checked_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,market,marketplace_id), unique(id,user_id)
);
create table public.reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 offer_id uuid not null,
 status text not null check(status in ('approved','rejected')),
 message text check(length(message)<=5000),
 updated_at timestamptz not null default now(),
 primary key(user_id,offer_id),
 foreign key(offer_id,user_id) references public.offers(id,user_id) on delete cascade,
 check(status<>'approved' or length(trim(message))>0)
);
create table public.deliveries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 offer_id uuid not null,
 destination_id text not null,
 scheduled_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','claimed','sent','failed','unknown','blocked')),
 idempotency_key text unique not null,
 provider_message_id text,
 confirmed_at timestamptz,
 failure_reason text,
 foreign key(offer_id,user_id) references public.offers(id,user_id) on delete cascade
);
create index offers_owner on public.offers(user_id);
create index deliveries_owner on public.deliveries(user_id);
alter table public.preferences enable row level security;
alter table public.offers enable row level security;
alter table public.reviews enable row level security;
alter table public.deliveries enable row level security;
revoke all on public.preferences,public.offers,public.reviews,public.deliveries from anon,authenticated;
grant select,insert,update on public.preferences,public.reviews to authenticated;
grant select on public.offers,public.deliveries to authenticated;
create policy preferences_read on public.preferences for select to authenticated using ((select auth.uid())=user_id);
create policy preferences_create on public.preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy preferences_update on public.preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy offers_read on public.offers for select to authenticated using ((select auth.uid())=user_id);
create policy reviews_read on public.reviews for select to authenticated using ((select auth.uid())=user_id);
create policy reviews_create on public.reviews for insert to authenticated with check ((select auth.uid())=user_id);
create policy reviews_update on public.reviews for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy deliveries_read on public.deliveries for select to authenticated using ((select auth.uid())=user_id);
commit;
