**app\_versions**



create table public.app\_versions (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; app\_name text not null,

&#x20; version text not null,

&#x20; message text null,

&#x20; update\_url text null,

&#x20; force\_update boolean null default false,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; constraint app\_versions\_pkey primary key (id)

) TABLESPACE pg\_default;



**categories**



create table public.categories (

&#x20; id uuid not null default extensions.uuid\_generate\_v4 (),

&#x20; restaurant\_id uuid null,

&#x20; name text null,

&#x20; image text null,

&#x20; sort\_order integer null,

&#x20; constraint categories\_pkey primary key (id),

&#x20; constraint categories\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id)

) TABLESPACE pg\_default;



**featured\_items**


create table public.featured\_items (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; restaurant\_id uuid null,

&#x20; image\_url text not null,

&#x20; redirect\_url text null,

&#x20; display\_order integer null default 0,

&#x20; is\_active boolean null default true,

&#x20; constraint featured\_items\_pkey primary key (id),

&#x20; constraint featured\_items\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id) on delete CASCADE

) TABLESPACE pg\_default;


**live\_orders**


create table public.live\_orders (

&#x20; id uuid not null default extensions.uuid\_generate\_v4 (),

&#x20; restaurant\_id uuid null,

&#x20; items jsonb null,

&#x20; total\_price integer null,

&#x20; status text null default 'new'::text,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; order\_code text null default generate\_order\_code (),

&#x20; note text null,

&#x20; table\_id uuid null,

&#x20; constraint live\_orders\_pkey primary key (id),

&#x20; constraint live\_orders\_table\_id\_fkey foreign KEY (table\_id) references restaurant\_tables (id) on delete set null

) TABLESPACE pg\_default;


**menu\_items**


create table public.menu\_items (

&#x20; id uuid not null default extensions.uuid\_generate\_v4 (),

&#x20; restaurant\_id uuid null,

&#x20; category\_id uuid null,

&#x20; name text null,

&#x20; description text null,

&#x20; price integer null,

&#x20; image\_url text null,

&#x20; is\_veg boolean null default false,

&#x20; is\_available boolean null default true,

&#x20; constraint menu\_items\_pkey primary key (id),

&#x20; constraint menu\_items\_category\_id\_fkey foreign KEY (category\_id) references categories (id),

&#x20; constraint menu\_items\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id)

) TABLESPACE pg\_default;


**profiles**


create table public.profiles (

&#x20; id uuid not null,

&#x20; email text null,

&#x20; name text null,

&#x20; role text null,

&#x20; restaurant\_id uuid null,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; constraint profiles\_pkey primary key (id),

&#x20; constraint profiles\_email\_key unique (email),

&#x20; constraint profiles\_id\_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,

&#x20; constraint profiles\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id),

&#x20; constraint profiles\_role\_check check (

&#x20;   (

&#x20;     role = any (

&#x20;       array\[

&#x20;         'owner'::text,

&#x20;         'receptionist'::text,

&#x20;         'kitchen'::text

&#x20;       ]

&#x20;     )

&#x20;   )

&#x20; )

) TABLESPACE pg\_default;


**restaurant\_tables**


create table public.restaurant\_tables (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; restaurant\_id uuid null,

&#x20; table\_number integer null,

&#x20; table\_token uuid null default gen\_random\_uuid (),

&#x20; created\_at timestamp without time zone null default now(),

&#x20; is\_active boolean null default true,

&#x20; updated\_at timestamp with time zone null default now(),

&#x20; constraint restaurant\_tables\_pkey primary key (id),

&#x20; constraint unique\_table\_token unique (table\_token),

&#x20; constraint restaurant\_tables\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id)

) TABLESPACE pg\_default;



create trigger set\_updated\_at BEFORE

update on restaurant\_tables for EACH row

execute FUNCTION update\_restaurant\_tables\_updated\_at ();


**restaurants**


create table public.restaurants (

&#x20; id uuid not null default extensions.uuid\_generate\_v4 (),

&#x20; name text null,

&#x20; slug text null,

&#x20; logo text null,

&#x20; created\_at timestamp without time zone null default now(),

&#x20; payment\_id text null,

&#x20; contact\_number numeric null,

&#x20; user\_id uuid null,

&#x20; restaurant\_info text null,

&#x20; constraint restaurants\_pkey primary key (id),

&#x20; constraint restaurants\_slug\_key unique (slug),

&#x20; constraint restaurants\_user\_id\_fkey foreign KEY (user\_id) references auth.users (id) on delete CASCADE

) TABLESPACE pg\_default;


**waiter\_calls**


create table public.waiter\_calls (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; restaurant\_id uuid not null,

&#x20; table\_id uuid null,

&#x20; order\_code text null,

&#x20; session\_order\_id text null,

&#x20; status text null default 'pending'::text,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; constraint waiter\_calls\_pkey primary key (id),

&#x20; constraint waiter\_calls\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id) on delete CASCADE,

&#x20; constraint waiter\_calls\_table\_id\_fkey foreign KEY (table\_id) references restaurant\_tables (id)

) TABLESPACE pg\_default;

**main\_categories**

create table public.main\_categories (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; restaurant\_id uuid not null,

&#x20; name text not null,

&#x20; sort\_order integer null default 0,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; constraint main\_categories\_pkey primary key (id),

&#x20; constraint main\_categories\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id) on delete CASCADE

) TABLESPACE pg\_default;



create index IF not exists idx\_main\_categories\_restaurant\_id on public.main\_categories using btree (restaurant\_id) TABLESPACE pg\_default;



create index IF not exists idx\_main\_categories\_restaurant on public.main\_categories using btree (restaurant\_id) TABLESPACE pg\_default;

**landing\_page\_settings**

create table public.landing\_page\_settings (

&#x20; id uuid not null default gen\_random\_uuid (),

&#x20; restaurant\_id uuid not null,

&#x20; background\_video\_url text null,

&#x20; is\_active boolean null default true,

&#x20; created\_at timestamp with time zone null default now(),

&#x20; updated\_at timestamp with time zone null default now(),

&#x20; constraint landing\_page\_settings\_pkey primary key (id),

&#x20; constraint landing\_page\_settings\_restaurant\_unique unique (restaurant\_id),

&#x20; constraint landing\_page\_settings\_restaurant\_id\_fkey foreign KEY (restaurant\_id) references restaurants (id) on delete CASCADE

) TABLESPACE pg\_default;



create trigger landing\_page\_settings\_updated\_at BEFORE

update on landing\_page\_settings for EACH row

execute FUNCTION update\_restaurant\_tables\_updated\_at ();

-- ================
-- PERFORMANCE INDEXES
-- ================

-- live\_orders: heavily filtered by restaurant\_id, status, created\_at
create index if not exists idx\_live\_orders\_restaurant\_id on public.live\_orders using btree (restaurant\_id) TABLESPACE pg\_default;
create index if not exists idx\_live\_orders\_status on public.live\_orders using btree (status) TABLESPACE pg\_default;
create index if not exists idx\_live\_orders\_created\_at on public.live\_orders using btree (created\_at desc) TABLESPACE pg\_default;
create index if not exists idx\_live\_orders\_restaurant\_status on public.live\_orders using btree (restaurant\_id, status) TABLESPACE pg\_default;

-- menu\_items: heavily filtered by restaurant\_id, category\_id
create index if not exists idx\_menu\_items\_restaurant\_id on public.menu\_items using btree (restaurant\_id) TABLESPACE pg\_default;
create index if not exists idx\_menu\_items\_category\_id on public.menu\_items using btree (category\_id) TABLESPACE pg\_default;

-- categories: filtered by restaurant\_id
create index if not exists idx\_categories\_restaurant\_id on public.categories using btree (restaurant\_id) TABLESPACE pg\_default;

-- waiter\_calls: filtered by restaurant\_id
create index if not exists idx\_waiter\_calls\_restaurant\_id on public.waiter\_calls using btree (restaurant\_id) TABLESPACE pg\_default;

-- restaurant\_tables: filtered by restaurant\_id
create index if not exists idx\_restaurant\_tables\_restaurant\_id on public.restaurant\_tables using btree (restaurant\_id) TABLESPACE pg\_default;

-- profiles: filtered by restaurant\_id for staff lookups
create index if not exists idx\_profiles\_restaurant\_id on public.profiles using btree (restaurant\_id) TABLESPACE pg\_default;

