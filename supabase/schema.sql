create table if not exists watches (
  id text primary key,
  brand text,
  model text,
  style text,
  dial_color text,
  formality integer default 5,
  -- extended fields preserved from seed data
  ref text,
  dial text,
  strap text,
  size numeric,
  lug integer,
  created_at timestamptz default now()
);

create table if not exists garments (
  id text primary key,
  name text,
  category text,
  color text,
  formality integer default 5,
  image_url text,
  hash text,
  -- extended fields for app use
  photo_url text,
  thumbnail_url text,
  photo_type text,
  needs_review boolean default false,
  duplicate_of text,
  exclude_from_wardrobe boolean default false,
  photo_angles jsonb default '[]'::jsonb,
  brand text,
  subtype text,
  notes text,
  material text,
  pattern text,
  seasons jsonb default '[]'::jsonb,
  contexts jsonb default '[]'::jsonb,
  price numeric,
  accent_color text,
  type text,
  created_at timestamptz default now()
);

create table if not exists history (
  id uuid primary key default gen_random_uuid(),
  watch_id text,
  shirt_id text,
  pants_id text,
  shoes_id text,
  jacket_id text,
  created_at timestamptz default now(),
  -- legacy columns kept for backward compat
  date date,
  payload jsonb default '{}'::jsonb
);
