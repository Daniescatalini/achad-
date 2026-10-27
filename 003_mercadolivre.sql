-- Conexão Mercado Livre: tokens cifrados pelo servidor, isolados por usuário.
begin;
create table if not exists public.marketplace_connections (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider='mercadolivre'),
 credentials text not null,
 expires_at timestamptz not null,
 refresh_lock uuid,
 refresh_until timestamptz,
 primary key(user_id,provider)
);
alter table public.marketplace_connections enable row level security;
revoke all on public.marketplace_connections from anon,authenticated;
grant select,insert,update on public.marketplace_connections to authenticated;
drop policy if exists connection_owner on public.marketplace_connections;
create policy connection_owner on public.marketplace_connections to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create or replace function public.claim_marketplace_refresh(p_lock uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.marketplace_connections set refresh_lock=p_lock,refresh_until=now()+interval '2 minutes'
 where user_id=auth.uid() and provider='mercadolivre' and (refresh_until is null or refresh_until<now());
 return found;
end $$;
create or replace function public.finish_marketplace_refresh(p_lock uuid,p_credentials text,p_expires_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.marketplace_connections set credentials=p_credentials,expires_at=p_expires_at,refresh_lock=null,refresh_until=null
 where user_id=auth.uid() and provider='mercadolivre' and refresh_lock=p_lock;
 if not found then raise exception 'Atualização da conexão não confirmada'; end if;
 return true;
end $$;
revoke all on function public.claim_marketplace_refresh(uuid) from public,anon;
revoke all on function public.finish_marketplace_refresh(uuid,text,timestamptz) from public,anon;
grant execute on function public.claim_marketplace_refresh(uuid) to authenticated;
grant execute on function public.finish_marketplace_refresh(uuid,text,timestamptz) to authenticated;
commit;
