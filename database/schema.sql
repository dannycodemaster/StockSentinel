-- StockSentinel Supabase schema
-- Run this in the Supabase SQL editor before enabling supabase-config.js.

create table if not exists public.suppliers (
  "SupplierID" text primary key,
  "SupplierName" text not null,
  "ContactName" text not null,
  "Email" text not null,
  "PhoneNumber" text,
  "PaymentTerms" text,
  "AvgLeadTime" integer not null default 5,
  "MaxLeadTime" integer not null default 8
);

create table if not exists public.locations (
  "LocationID" text primary key,
  "LocationName" text not null,
  "LocationType" text,
  "IsActive" boolean not null default true
);

create table if not exists public.users (
  "UserID" text primary key,
  "FullName" text not null,
  "Email" text not null,
  "Role" text not null check ("Role" in ('Admin', 'Worker')),
  "PasswordHash" text
);

create table if not exists public.products (
  "ProductID" text primary key,
  "SKU" text not null unique,
  "ProductName" text not null,
  "Category" text,
  "UnitCost" numeric(12, 2) not null default 0,
  "RetailPrice" numeric(12, 2) not null default 0,
  "ReorderThreshold" integer not null default 0,
  "SupplierID" text references public.suppliers("SupplierID") on update cascade on delete set null,
  "LocationID" text references public.locations("LocationID") on update cascade on delete set null,
  "IsActive" boolean not null default true
);

create table if not exists public.transactions (
  "TransactionID" text primary key,
  "TransactionDate" timestamptz not null default now(),
  "ProductID" text not null references public.products("ProductID") on update cascade on delete cascade,
  "LocationID" text references public.locations("LocationID") on update cascade on delete set null,
  "UserID" text references public.users("UserID") on update cascade on delete set null,
  "TransactionType" text not null check ("TransactionType" in ('Inbound', 'Outbound', 'Adjustment')),
  "Quantity" integer not null check ("Quantity" <> 0),
  "ReferenceNumber" text,
  "Notes" text
);

create index if not exists idx_products_sku on public.products("SKU");
create index if not exists idx_transactions_product on public.transactions("ProductID");
create index if not exists idx_transactions_date on public.transactions("TransactionDate" desc);

alter table public.suppliers enable row level security;
alter table public.locations enable row level security;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;

-- Development policy for the browser-only MVP.
-- Tighten this once real Supabase Auth is added.
drop policy if exists "Allow anonymous read/write for MVP" on public.suppliers;
drop policy if exists "Allow anonymous read/write for MVP" on public.locations;
drop policy if exists "Allow anonymous read/write for MVP" on public.users;
drop policy if exists "Allow anonymous read/write for MVP" on public.products;
drop policy if exists "Allow anonymous read/write for MVP" on public.transactions;

create policy "Allow anonymous read/write for MVP" on public.suppliers for all using (true) with check (true);
create policy "Allow anonymous read/write for MVP" on public.locations for all using (true) with check (true);
create policy "Allow anonymous read/write for MVP" on public.users for all using (true) with check (true);
create policy "Allow anonymous read/write for MVP" on public.products for all using (true) with check (true);
create policy "Allow anonymous read/write for MVP" on public.transactions for all using (true) with check (true);
