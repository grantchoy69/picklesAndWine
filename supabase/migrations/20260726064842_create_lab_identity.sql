create schema if not exists lab;
create schema if not exists wine;
create schema if not exists private;

comment on schema lab is 'Shared household identity and authentication mappings.';
comment on schema wine is 'Private wine laboratory operational and research records.';
comment on schema private is 'Non-API helper functions used by policies and triggers.';

revoke all on schema lab from public, anon;
revoke all on schema wine from public, anon;
revoke all on schema private from public, anon, authenticated;

create table lab.households (
  id smallint primary key,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table lab.people (
  id smallint primary key,
  household_id smallint not null references lab.households(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create table lab.memberships (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  household_id smallint not null references lab.households(id) on delete restrict,
  person_id smallint not null unique,
  role text not null check (role in ('owner', 'editor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create index memberships_household_active_idx
  on lab.memberships (household_id, active);

create or replace function private.set_updated_at()
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

create trigger people_set_updated_at
before update on lab.people
for each row execute function private.set_updated_at();

create trigger memberships_set_updated_at
before update on lab.memberships
for each row execute function private.set_updated_at();

create or replace function private.has_active_membership(requested_household_id smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from lab.memberships as membership
    where membership.auth_user_id = (select auth.uid())
      and membership.household_id = requested_household_id
      and membership.active
  );
$$;

create or replace function private.can_edit_household(requested_household_id smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from lab.memberships as membership
    where membership.auth_user_id = (select auth.uid())
      and membership.household_id = requested_household_id
      and membership.active
      and membership.role in ('owner', 'editor')
  );
$$;

create or replace function private.current_person_id()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select membership.person_id
  from lab.memberships as membership
  where membership.auth_user_id = (select auth.uid())
    and membership.active
  limit 1;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.has_active_membership(smallint) from public, anon, authenticated;
revoke all on function private.can_edit_household(smallint) from public, anon, authenticated;
revoke all on function private.current_person_id() from public, anon, authenticated;

insert into lab.households (id, name)
values (1, 'This House')
on conflict (id) do update
set name = excluded.name;

insert into lab.people (id, household_id, display_name)
values
  (1, 1, 'Gracie'),
  (2, 1, 'Kyle')
on conflict (id) do update
set household_id = excluded.household_id,
    display_name = excluded.display_name,
    active = true,
    updated_at = now();
