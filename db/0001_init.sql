create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null
);
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  sku text not null,
  name text not null,
  description text not null default '',
  price_cents int not null check (price_cents >= 0),
  emoji text not null default '🥖',
  available boolean not null default true,
  unique (store_id, sku)
);
create table if not exists taught_tools (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  name text not null,
  description text not null,
  input_schema jsonb not null,
  steps jsonb not null,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) not null,
  items jsonb not null,            -- [{sku, name, qty, price_cents}]
  delivery_date date,
  note text,
  total_cents int not null default 0,
  channel text not null default 'human' check (channel in ('human','agent')),
  tool_name text,
  created_at timestamptz not null default now()
);

insert into stores (slug, name) values ('aurora', 'Padaria Aurora') on conflict (slug) do nothing;
insert into catalog_items (store_id, sku, name, description, price_cents, emoji)
select id, v.sku, v.name, v.descr, v.price::int, v.emoji from stores, (values
  ('pao-queijo-forma','Pao de Queijo (slice tray)','12 pieces, baked fresh','1800','🧀'),
  ('pao-queijo-duzia','Pao de Queijo (dozen)','A dozen warm minas cheese rolls','1500','🧀'),
  ('bolo-rolo','Bolo de Rolo','Pernambuco rolled cake with guava','4500','🍰'),
  ('sonho','Sonho (2-pack)','Two cream-filled dreams','1200','🍩'),
  ('coxinha','Coxinha (6-pack)','Six crispy chicken teardrops','2400','🍗'),
  ('cuscuz','Cuscuz Nordestino','Cornmeal couscous, butter on top','900','🌽'),
  ('tapioca','Tapioca da Aurora','Your choice filling, made to order','1100','🥥'),
  ('brigadeiro','Brigadeiro (box of 12)','Twelve fudge bonbons','2200','🍫'),
  ('pao-frances','Pao Frances (10 units)','The daily French bread','800','🥖'),
  ('cafe-colado','Cafe Colado','Coffee with milk, Aurora style','600','☕'),
  ('suco-graviola','Suco de Graviola','Fresh soursop juice, 500ml','1000','🥤'),
  ('torta-limao','Torta de Limao (slice)','Lime meringue pie slice','1400','🍋')
) as v(sku,name,descr,price,emoji) where stores.slug='aurora'
on conflict (store_id, sku) do nothing;
