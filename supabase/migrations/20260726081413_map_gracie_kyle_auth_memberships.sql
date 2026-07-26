do $$
declare
  gracie_auth_user_id uuid;
  kyle_auth_user_id uuid;
begin
  select id
    into strict gracie_auth_user_id
  from auth.users
  where lower(email) = 'grant@handymangrant.com';

  select id
    into strict kyle_auth_user_id
  from auth.users
  where lower(email) = 'kyleaamundson@gmail.com';

  if gracie_auth_user_id = kyle_auth_user_id then
    raise exception 'Gracie and Kyle must map to distinct Auth users';
  end if;

  if exists (
    select 1
    from lab.memberships
    where person_id = 1
      and auth_user_id <> gracie_auth_user_id
  ) then
    raise exception 'Gracie/person 1 is already mapped to a different Auth user';
  end if;

  if exists (
    select 1
    from lab.memberships
    where person_id = 2
      and auth_user_id <> kyle_auth_user_id
  ) then
    raise exception 'Kyle/person 2 is already mapped to a different Auth user';
  end if;

  insert into lab.memberships (
    auth_user_id,
    household_id,
    person_id,
    role,
    active
  )
  values
    (gracie_auth_user_id, 1, 1, 'owner', true),
    (kyle_auth_user_id, 1, 2, 'editor', true)
  on conflict (auth_user_id) do update
  set household_id = excluded.household_id,
      person_id = excluded.person_id,
      role = excluded.role,
      active = excluded.active,
      updated_at = now();
end
$$;
