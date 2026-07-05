-- ================
-- RESTAURANT TAXES
-- ================
-- Each restaurant can have multiple taxes (GST, VAT, Service Charge, etc.)
-- Never store taxes inside the restaurants table.

create table if not exists public.restaurant_taxes (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  tax_percentage numeric(5,2) not null default 0,
  tax_type text not null default 'percentage',
  is_enabled boolean not null default true,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint restaurant_taxes_pkey primary key (id),
  constraint restaurant_taxes_restaurant_id_fkey foreign key (restaurant_id) references restaurants (id) on delete cascade,
  constraint restaurant_taxes_tax_percentage_check check (tax_percentage >= 0 and tax_percentage <= 100),
  constraint restaurant_taxes_tax_type_check check (tax_type in ('percentage', 'fixed'))
) TABLESPACE pg_default;

create index if not exists idx_restaurant_taxes_restaurant_id on public.restaurant_taxes using btree (restaurant_id) TABLESPACE pg_default;

-- Enable RLS
alter table public.restaurant_taxes enable row level security;

-- Policies
create policy "Users can view their restaurant taxes"
  on public.restaurant_taxes for select
  using (
    restaurant_id in (
      select restaurant_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can insert taxes for their restaurant"
  on public.restaurant_taxes for insert
  with check (
    restaurant_id in (
      select restaurant_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can update taxes for their restaurant"
  on public.restaurant_taxes for update
  using (
    restaurant_id in (
      select restaurant_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can delete taxes for their restaurant"
  on public.restaurant_taxes for delete
  using (
    restaurant_id in (
      select restaurant_id from public.profiles where id = auth.uid()
    )
  );

-- Trigger for updated_at
create trigger set_restaurant_taxes_updated_at
  before update on public.restaurant_taxes
  for each row
  execute function update_restaurant_tables_updated_at();
