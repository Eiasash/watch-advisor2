create table if not exists watches (
  id text primary key,
  brand text not null,
  model text not null,
  ref text,
  dial text,
  strap text,
  style text,
  formality integer default 5,
  size numeric,
  lug integer,
  created_at timestamptz default now()
);

create table if not exists garments (
  id text primary key,
  name text not null,
  type text not null,
  color text,
  formality integer default 5,
  photo_url text,
  thumbnail_url text,
  hash text,
  created_at timestamptz default now()
);

create table if not exists history (
  id text primary key,
  watch_id text not null references watches(id) on delete cascade,
  date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
