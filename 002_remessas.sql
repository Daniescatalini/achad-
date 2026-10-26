-- Executar APÓS schema.sql. Migração adicional, sem apagar dados existentes.
begin;
create table if not exists public.collection_batches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 status text not null default 'collecting' check(status in ('collecting','review','released')),
 created_at timestamptz not null default now(),
 released_at timestamptz,
 unique(id,user_id)
);
alter table public.offers add column if not exists batch_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='offers_batch_owner_fk') then
 alter table public.offers add constraint offers_batch_owner_fk foreign key(batch_id,user_id) references public.collection_batches(id,user_id);
 end if;
end $$;
create table if not exists public.batch_release_items (
 batch_id uuid not null,
 user_id uuid not null,
 offer_id uuid not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 primary key(batch_id,offer_id),
 foreign key(batch_id,user_id) references public.collection_batches(id,user_id),
 foreign key(offer_id,user_id) references public.offers(id,user_id)
);
alter table public.collection_batches enable row level security;
alter table public.batch_release_items enable row level security;
revoke all on public.collection_batches,public.batch_release_items from anon,authenticated;
grant select on public.collection_batches,public.batch_release_items to authenticated;
drop policy if exists batches_read on public.collection_batches;
create policy batches_read on public.collection_batches for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists release_items_read on public.batch_release_items;
create policy release_items_read on public.batch_release_items for select to authenticated using ((select auth.uid())=user_id);
create index if not exists offers_batch_idx on public.offers(batch_id,user_id);
create index if not exists batch_owner_idx on public.collection_batches(user_id);
-- Serialize review writes against final release. The row lock also prevents a
-- concurrent approval from slipping past the complete-remessa check.
create or replace function public.guard_released_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid; state text;
begin
 select batch_id into bid from public.offers where id=NEW.offer_id and user_id=NEW.user_id;
 if bid is not null then
  select status into state from public.collection_batches where id=bid for update;
  if state<>'review' then raise exception 'Esta remessa não está aberta para revisão.'; end if;
 end if;
 return NEW;
end $$;
drop trigger if exists guard_released_review on public.reviews;
create trigger guard_released_review before insert or update on public.reviews for each row execute function public.guard_released_review();
revoke all on function public.guard_released_review() from public,anon,authenticated;
-- Freeze batch membership when collection closes. Collectors must finish writing
-- offers before setting status=review. Updates to existing offers require a new
-- collection/revalidation path; the released snapshot is immutable to clients.
create or replace function public.guard_batch_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid; state text;
begin
 if TG_OP='DELETE' then bid:=OLD.batch_id; else bid:=NEW.batch_id; end if;
 if TG_OP='UPDATE' and OLD.batch_id is distinct from NEW.batch_id and OLD.batch_id is not null then
  select status into state from public.collection_batches where id=OLD.batch_id for update;
  if state<>'collecting' then raise exception 'A remessa já foi fechada para coleta.'; end if;
 end if;
 if bid is not null then
  select status into state from public.collection_batches where id=bid for update;
  if state<>'collecting' then raise exception 'A remessa já foi fechada para coleta.'; end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists guard_batch_membership on public.offers;
create trigger guard_batch_membership before insert or update or delete on public.offers for each row execute function public.guard_batch_membership();
revoke all on function public.guard_batch_membership() from public,anon,authenticated;
create or replace function public.release_collection_batch(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); state text; approved_count integer;
begin
 if uid is null then raise exception 'Faça login.'; end if;
 select status into state from public.collection_batches where id=p_batch_id and user_id=uid for update;
 if not found then raise exception 'Remessa não encontrada.'; end if;
 if state='released' then return jsonb_build_object('status','released'); end if;
 if state<>'review' then raise exception 'A coleta ainda não terminou.'; end if;
 if exists(select 1 from public.offers o left join public.reviews r on r.offer_id=o.id and r.user_id=uid where o.batch_id=p_batch_id and o.user_id=uid and (r.status is null or r.status not in ('approved','rejected'))) then
  raise exception 'Revise todos os produtos antes de liberar a remessa.';
 end if;
 select count(*) into approved_count from public.offers o join public.reviews r on r.offer_id=o.id and r.user_id=uid where o.batch_id=p_batch_id and o.user_id=uid and r.status='approved' and length(trim(r.message))>0;
 if approved_count=0 then raise exception 'Nenhum produto aprovado nesta remessa.'; end if;
 insert into public.batch_release_items(batch_id,user_id,offer_id,snapshot)
 select p_batch_id,uid,o.id,jsonb_build_object('offer',to_jsonb(o),'message',r.message,'reviewed_at',r.updated_at)
 from public.offers o join public.reviews r on r.offer_id=o.id and r.user_id=uid
 where o.batch_id=p_batch_id and o.user_id=uid and r.status='approved';
 update public.collection_batches set status='released',released_at=now() where id=p_batch_id and user_id=uid;
 return jsonb_build_object('status','released','approved',approved_count);
end $$;
revoke all on function public.release_collection_batch(uuid) from public,anon;
grant execute on function public.release_collection_batch(uuid) to authenticated;
commit;
