create extension if not exists pgcrypto;

create schema if not exists app_private;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'payment_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.payment_status as enum ('pending', 'paid', 'free', 'failed', 'refunded');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'log_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.log_status as enum ('success', 'error', 'pending');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'hero_gender'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.hero_gender as enum ('male', 'female');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.jsonb_contains_forbidden_keys(payload jsonb, forbidden_keys text[])
returns boolean
language plpgsql
immutable
as $$
declare
  object_entry record;
  array_entry record;
begin
  if payload is null then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for object_entry in
      select key, value
      from jsonb_each(payload)
    loop
      if object_entry.key = any(forbidden_keys) then
        return true;
      end if;

      if app_private.jsonb_contains_forbidden_keys(object_entry.value, forbidden_keys) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for array_entry in
      select value
      from jsonb_array_elements(payload)
    loop
      if app_private.jsonb_contains_forbidden_keys(array_entry.value, forbidden_keys) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

create or replace function app_private.jsonb_size_bytes(payload jsonb)
returns integer
language sql
immutable
as $$
  select octet_length(convert_to(coalesce(payload::text, ''), 'utf8'))
$$;

create or replace function app_private.jsonb_is_text_array(payload jsonb, expected_length integer)
returns boolean
language plpgsql
immutable
as $$
declare
  array_entry record;
begin
  if jsonb_typeof(payload) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(payload) <> expected_length then
    return false;
  end if;

  for array_entry in
    select value
    from jsonb_array_elements(payload)
  loop
    if jsonb_typeof(array_entry.value) <> 'string' then
      return false;
    end if;

    if length(trim(both '"' from array_entry.value::text)) = 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app_private.is_storage_path(path text)
returns boolean
language sql
immutable
as $$
  select
    path is null
    or (
      path ~ '^[A-Za-z0-9][A-Za-z0-9/_\-.]+$'
      and path !~* '^(https?|data|blob):'
      and path !~ '^/'
      and path !~ '\.\.'
      and path !~ '//'
    )
$$;

grant usage on schema app_private to postgres, service_role;
grant execute on function app_private.jsonb_contains_forbidden_keys(jsonb, text[]) to postgres, service_role;
grant execute on function app_private.jsonb_size_bytes(jsonb) to postgres, service_role;
grant execute on function app_private.jsonb_is_text_array(jsonb, integer) to postgres, service_role;
grant execute on function app_private.is_storage_path(text) to postgres, service_role;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  session_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  hero_name text not null,
  hero_age smallint,
  hero_gender public.hero_gender,
  topic text not null,
  art_style text not null,
  parent_character text,
  parent_name text,
  source_image_path text not null,
  display_image_path text not null,
  thumb_image_path text not null,
  story_segments jsonb not null,
  preview_excerpt text,
  is_unlocked boolean not null default false,
  payment_status public.payment_status not null default 'pending',
  email text,
  user_id uuid references auth.users(id) on delete set null,
  access_token_hash text not null,
  latest_pdf_path text,
  latest_pdf_file_name text,
  latest_pdf_size_bytes bigint,
  latest_pdf_exported_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint books_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint books_story_segments_shape check (app_private.jsonb_is_text_array(story_segments, 10)),
  constraint books_email_lowercase check (email is null or email = lower(email)),
  constraint books_source_path_format check (app_private.is_storage_path(source_image_path)),
  constraint books_display_path_format check (app_private.is_storage_path(display_image_path)),
  constraint books_thumb_path_format check (app_private.is_storage_path(thumb_image_path)),
  constraint books_pdf_path_format check (app_private.is_storage_path(latest_pdf_path)),
  constraint books_source_path_scope check (source_image_path like slug || '/source/%'),
  constraint books_display_path_scope check (display_image_path like slug || '/display/%'),
  constraint books_thumb_path_scope check (thumb_image_path like slug || '/thumb/%'),
  constraint books_pdf_path_scope check (latest_pdf_path is null or latest_pdf_path like slug || '/pdf/%'),
  constraint books_preview_excerpt_size check (preview_excerpt is null or char_length(preview_excerpt) <= 400),
  constraint books_access_token_hash_size check (char_length(access_token_hash) >= 32),
  constraint books_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint books_metadata_size check (app_private.jsonb_size_bytes(metadata) <= 8192),
  constraint books_metadata_forbidden_keys check (
    not app_private.jsonb_contains_forbidden_keys(
      metadata,
      array[
        'source_image_url',
        'display_image_url',
        'thumb_image_url',
        'latest_url',
        'source_image_path',
        'display_image_path',
        'thumb_image_path',
        'latest_pdf_path',
        'story_segments',
        'request_json',
        'response_json',
        'prompt',
        'html'
      ]
    )
  ),
  constraint books_latest_pdf_size_nonnegative check (latest_pdf_size_bytes is null or latest_pdf_size_bytes >= 0),
  constraint books_hero_age_range check (hero_age is null or hero_age between 0 and 120)
);

create table if not exists public.system_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  book_slug text references public.books(slug) on delete set null,
  action_type text not null,
  stage text,
  status public.log_status not null,
  model_name text,
  provider_model text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12, 6),
  duration_ms integer,
  prompt_token text,
  hero_name text,
  topic text,
  art_style text,
  hero_gender public.hero_gender,
  hero_age smallint,
  book_title text,
  parent_character text,
  parent_name text,
  metadata jsonb not null default '{}'::jsonb,
  constraint system_logs_input_tokens_nonnegative check (input_tokens is null or input_tokens >= 0),
  constraint system_logs_output_tokens_nonnegative check (output_tokens is null or output_tokens >= 0),
  constraint system_logs_estimated_cost_nonnegative check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  constraint system_logs_duration_nonnegative check (duration_ms is null or duration_ms >= 0),
  constraint system_logs_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint system_logs_metadata_size check (app_private.jsonb_size_bytes(metadata) <= 262144),
  constraint system_logs_hero_age_range check (hero_age is null or hero_age between 0 and 120)
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  book_slug text references public.books(slug) on delete set null,
  event_name text not null,
  page text,
  device_type text,
  event_data jsonb not null default '{}'::jsonb,
  constraint analytics_events_payload_object check (jsonb_typeof(event_data) = 'object'),
  constraint analytics_events_payload_size check (app_private.jsonb_size_bytes(event_data) <= 4096),
  constraint analytics_events_payload_forbidden_keys check (
    not app_private.jsonb_contains_forbidden_keys(
      event_data,
      array[
        'story_segments',
        'request_json',
        'response_json',
        'source_image_url',
        'display_image_url',
        'thumb_image_url',
        'latest_pdf_path',
        'html'
      ]
    )
  )
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_percent integer not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  max_uses integer,
  current_uses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_discount_percent_range check (discount_percent between 1 and 100),
  constraint coupons_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint coupons_current_uses_nonnegative check (current_uses >= 0),
  constraint coupons_current_uses_vs_max_uses check (max_uses is null or current_uses <= max_uses)
);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
before update on public.books
for each row
execute function public.set_updated_at();

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
before update on public.coupons
for each row
execute function public.set_updated_at();

create index if not exists books_session_id_idx on public.books (session_id);
create index if not exists books_user_id_idx on public.books (user_id);
create index if not exists books_email_idx on public.books (email);
create index if not exists books_payment_status_updated_at_idx on public.books (payment_status, updated_at desc);
create index if not exists books_updated_at_desc_idx on public.books (updated_at desc);
create index if not exists books_latest_pdf_path_idx on public.books (latest_pdf_path) where latest_pdf_path is not null;

create index if not exists system_logs_session_created_at_idx on public.system_logs (session_id, created_at);
create index if not exists system_logs_book_slug_idx on public.system_logs (book_slug);
create index if not exists system_logs_action_type_idx on public.system_logs (action_type);
create index if not exists system_logs_status_idx on public.system_logs (status);
create index if not exists system_logs_created_at_desc_idx on public.system_logs (created_at desc);

create index if not exists analytics_events_session_created_at_idx on public.analytics_events (session_id, created_at);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_page_idx on public.analytics_events (page);
create index if not exists analytics_events_created_at_desc_idx on public.analytics_events (created_at desc);

alter table public.books enable row level security;
alter table public.system_logs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.coupons enable row level security;

revoke all on public.books from anon, authenticated;
revoke all on public.system_logs from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.coupons from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'book-public-assets',
    'book-public-assets',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'book-private-assets',
    'book-private-assets',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.purge_old_system_logs(retain_days integer default 60)
returns bigint
language plpgsql
security definer
as $$
declare
  deleted_count bigint;
begin
  delete from public.system_logs
  where created_at < now() - make_interval(days => retain_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.purge_old_analytics_events(retain_days integer default 90)
returns bigint
language plpgsql
security definer
as $$
declare
  deleted_count bigint;
begin
  delete from public.analytics_events
  where created_at < now() - make_interval(days => retain_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on table public.books is 'Product source of truth for Hakol BeSefer.';
comment on table public.system_logs is 'Deep debugging logs keyed by session_id.';
comment on table public.analytics_events is 'Lightweight telemetry events keyed by session_id.';
comment on table public.coupons is 'Operational coupon definitions.';
