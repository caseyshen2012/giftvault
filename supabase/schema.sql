create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  title text not null default 'My wishlist',
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (url ~ '^https?://'),
  category text not null default 'Other',
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  birthday date,
  location text not null default '',
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.wishlist_items(id) on delete cascade,
  reserver_name text,
  reserver_email text,
  created_at timestamptz not null default now(),
  check (nullif(trim(reserver_name), '') is not null or nullif(trim(reserver_email), '') is not null)
);

create index wishlist_items_wishlist_sort_idx
  on public.wishlist_items(wishlist_id, sort_order, created_at);
create index contacts_owner_name_idx on public.contacts(owner_id, name);

alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.contacts enable row level security;
alter table public.reservations enable row level security;

create policy "Owners manage their wishlist"
on public.wishlists for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners manage their wishlist items"
on public.wishlist_items for all to authenticated
using (exists (
  select 1 from public.wishlists w
  where w.id = wishlist_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.wishlists w
  where w.id = wishlist_id and w.owner_id = (select auth.uid())
));

create policy "Users manage their own contacts"
on public.contacts for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on public.wishlists, public.wishlist_items, public.contacts, public.reservations from anon, authenticated;
grant select, insert, update, delete on public.wishlists, public.wishlist_items, public.contacts to authenticated;

create or replace function public.create_wishlist_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wishlists (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_create_wishlist
after insert on auth.users
for each row execute function public.create_wishlist_for_new_user();

create or replace function public.get_public_wishlist(p_share_token uuid)
returns table (
  wishlist_id uuid,
  wishlist_title text,
  item_id uuid,
  item_title text,
  item_url text,
  category text,
  note text,
  sort_order integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.title, i.id, i.title, i.url, i.category, i.note, i.sort_order, i.created_at
  from public.wishlists w
  left join public.wishlist_items i on i.wishlist_id = w.id
  where w.share_token = p_share_token
  order by i.sort_order, i.created_at;
$$;
revoke all on function public.get_public_wishlist(uuid) from public;
grant execute on function public.get_public_wishlist(uuid) to anon, authenticated;

create or replace function public.reserve_wishlist_item(
  p_share_token uuid,
  p_item_id uuid,
  p_name text default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  list_owner uuid;
begin
  if nullif(trim(p_name), '') is null and nullif(trim(p_email), '') is null then
    raise exception 'Enter a name or email to reserve this gift';
  end if;

  select w.owner_id into list_owner
  from public.wishlists w
  join public.wishlist_items i on i.wishlist_id = w.id
  where w.share_token = p_share_token and i.id = p_item_id;

  if list_owner is null then
    raise exception 'Wishlist item not found';
  end if;
  if auth.uid() is not null and auth.uid() = list_owner then
    raise exception 'You cannot reserve a gift from your own wishlist';
  end if;

  insert into public.reservations (item_id, reserver_name, reserver_email)
  values (p_item_id, nullif(trim(p_name), ''), nullif(trim(p_email), ''))
  on conflict (item_id) do nothing;
end;
$$;
revoke all on function public.reserve_wishlist_item(uuid, uuid, text, text) from public;
grant execute on function public.reserve_wishlist_item(uuid, uuid, text, text) to anon, authenticated;
