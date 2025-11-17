-- Create a trigger that ensures a `profiles` row exists for every auth.users entry
-- This migration is idempotent: it replaces the function and recreates the trigger.

/*
  Behavior:
  - When a new user is created in `auth.users` (e.g. via signUp or email confirmation),
    insert a corresponding row into `public.profiles` with `auth_uid`, `email`, and
    optional metadata fields (`username`, `role_id`, `school_id`) when available.
  - If a profile with the same `auth_uid` already exists, do nothing.

  Notes:
  - This is useful for client-side signUp flows where the frontend uses `supabase.auth.signUp`
    and there is no separate server-side call to create the profile.
*/

create or replace function public.create_profile_from_auth()
returns trigger
language plpgsql
security definer
as $$
declare
  meta_username text;
  meta_role text;
  meta_school text;
begin
  -- Safely extract common metadata locations
  meta_username := coalesce(
    nullif(new.user_metadata->> 'username', ''),
    nullif(new.raw_user_meta_data->> 'username', ''),
    nullif(new.user_metadata->> 'name', ''),
    nullif(new.raw_user_meta_data->> 'name', '')
  );

  meta_role := coalesce(
    nullif(new.user_metadata->> 'role_id', ''),
    nullif(new.raw_user_meta_data->> 'role_id', ''),
    nullif(new.user_metadata->> 'role', ''),
    nullif(new.raw_user_meta_data->> 'role', '')
  );

  meta_school := coalesce(
    nullif(new.user_metadata->> 'school_id', ''),
    nullif(new.raw_user_meta_data->> 'school_id', ''),
    nullif(new.user_metadata->> 'school', ''),
    nullif(new.raw_user_meta_data->> 'school', '')
  );

  -- Insert the profile if it does not already exist
  insert into public.profiles (
    auth_uid,
    email,
    username,
    role_id,
    school_id,
    created_at
  ) values (
    new.id,
    new.email,
    meta_username,
    case when meta_role ~ '^\\d+$' then meta_role::int else null end,
    case when meta_school ~ '^\\d+$' then meta_school::int else null end,
    now()
  ) on conflict (auth_uid) do nothing;

  return new;
end;
$$;

-- Recreate trigger: drop if exists then create
drop trigger if exists create_profile_on_auth on auth.users;

create trigger create_profile_on_auth
after insert on auth.users
for each row
execute function public.create_profile_from_auth();
