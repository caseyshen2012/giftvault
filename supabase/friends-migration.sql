create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create unique index if not exists friendships_unique_active_pair_idx
  on public.friendships (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');
create index if not exists friendships_requester_status_idx on public.friendships (requester_id, status);
create index if not exists friendships_recipient_status_idx on public.friendships (recipient_id, status);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users update their username" on public.profiles;
create policy "Users update their username"
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users read their own friend requests" on public.friendships;
create policy "Users read their own friend requests"
on public.friendships for select to authenticated
using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

revoke all on public.profiles, public.friendships from anon, authenticated;
grant select on public.profiles, public.friendships to authenticated;
grant update (username) on public.profiles to authenticated;
revoke all on public.reservations from anon, authenticated;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username, display_name)
  values (
    new.id,
    'member_' || pg_catalog.substr(pg_catalog.replace(new.id::text, '-', ''), 1, 16),
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 80)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

insert into public.profiles (user_id, username, display_name)
select
  u.id,
  'member_' || pg_catalog.substr(pg_catalog.replace(u.id::text, '-', ''), 1, 16),
  pg_catalog.left(coalesce(nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''), ''), 80)
from auth.users u
on conflict (user_id) do nothing;

create or replace function public.get_my_profile()
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.username, p.display_name
  from public.profiles p
  where p.user_id = (select auth.uid());
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.search_profile_by_username(p_username text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.username, p.display_name
  from public.profiles p
  where p.username = pg_catalog.lower(pg_catalog.btrim(p_username))
    and p.user_id <> (select auth.uid())
    and (select auth.uid()) is not null;
$$;
revoke all on function public.search_profile_by_username(text) from public, anon;
grant execute on function public.search_profile_by_username(text) to authenticated;

create or replace function public.get_friend_relationships()
returns table (
  relationship_id uuid,
  requester_id uuid,
  recipient_id uuid,
  status text,
  created_at timestamptz,
  other_user_id uuid,
  username text,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    f.requester_id,
    f.recipient_id,
    f.status,
    f.created_at,
    p.user_id,
    p.username,
    p.display_name
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.requester_id = (select auth.uid()) then f.recipient_id else f.requester_id end
  where f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid())
  order by f.created_at desc;
$$;
revoke all on function public.get_friend_relationships() from public, anon;
grant execute on function public.get_friend_relationships() to authenticated;

create or replace function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_id uuid;
  request_id uuid;
begin
  if caller_id is null then
    raise exception 'Sign in to send a friend request';
  end if;

  select p.user_id into target_id
  from public.profiles p
  where p.username = pg_catalog.lower(pg_catalog.btrim(p_username));

  if target_id is null then
    raise exception 'Username not found';
  end if;
  if target_id = caller_id then
    raise exception 'You cannot send a friend request to yourself';
  end if;
  if exists (
    select 1 from public.friendships f
    where ((f.requester_id = caller_id and f.recipient_id = target_id)
      or (f.requester_id = target_id and f.recipient_id = caller_id))
      and f.status in ('pending', 'accepted')
  ) then
    raise exception 'A request or friendship already exists for this username';
  end if;

  insert into public.friendships (requester_id, recipient_id, status)
  values (caller_id, target_id, 'pending')
  returning id into request_id;
  return request_id;
exception
  when unique_violation then
    raise exception 'A request or friendship already exists for this username';
end;
$$;
revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to friend requests';
  end if;
  if p_accept is null then
    raise exception 'Choose whether to accept the friend request';
  end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = pg_catalog.now()
  where id = p_request_id
    and recipient_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found or already handled';
  end if;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

create or replace function public.get_friend_wishlist(p_friend_id uuid)
returns table (
  friend_id uuid,
  username text,
  display_name text,
  wishlist_id uuid,
  wishlist_title text,
  item_id uuid,
  item_title text,
  item_url text,
  category text,
  note text,
  sort_order integer,
  created_at timestamptz,
  is_claimed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_friend_id = auth.uid() or not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.recipient_id = p_friend_id)
        or (f.requester_id = p_friend_id and f.recipient_id = auth.uid()))
  ) then
    raise exception 'You can only view the wishlist of an accepted friend';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.display_name,
    w.id,
    w.title,
    i.id,
    i.title,
    i.url,
    i.category,
    i.note,
    i.sort_order,
    i.created_at,
    case when i.id is null then false else exists (
      select 1 from public.reservations r where r.item_id = i.id
    ) end
  from public.profiles p
  join public.wishlists w on w.owner_id = p.user_id
  left join public.wishlist_items i on i.wishlist_id = w.id
  where p.user_id = p_friend_id
  order by i.sort_order, i.created_at;
end;
$$;
revoke all on function public.get_friend_wishlist(uuid) from public, anon;
grant execute on function public.get_friend_wishlist(uuid) to authenticated;

create or replace function public.reserve_friend_wishlist_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  list_owner uuid;
  reserver_label text;
begin
  if caller_id is null then
    raise exception 'Sign in to reserve gifts from friends';
  end if;

  select w.owner_id into list_owner
  from public.wishlist_items i
  join public.wishlists w on w.id = i.wishlist_id
  where i.id = p_item_id;

  if list_owner is null or list_owner = caller_id or not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = caller_id and f.recipient_id = list_owner)
        or (f.requester_id = list_owner and f.recipient_id = caller_id))
  ) then
    raise exception 'You can only reserve an item on an accepted friend wishlist';
  end if;

  select coalesce(nullif(pg_catalog.btrim(p.display_name), ''), p.username)
  into reserver_label
  from public.profiles p
  where p.user_id = caller_id;

  insert into public.reservations (item_id, reserver_name)
  values (p_item_id, coalesce(reserver_label, 'GiftVault friend'))
  on conflict (item_id) do nothing;
end;
$$;
revoke all on function public.reserve_friend_wishlist_item(uuid) from public, anon;
grant execute on function public.reserve_friend_wishlist_item(uuid) to authenticated;
