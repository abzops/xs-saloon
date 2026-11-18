-- XS Salon — core schema
-- Money is stored in paise (bigint). Times are timestamptz; business logic uses the salon's timezone.

create extension if not exists pgcrypto;

-- ───────────────────────── Tenancy ─────────────────────────
create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  phone text,
  email text,
  address text,
  city text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  gstin text,
  gst_enabled boolean not null default false,
  gst_rate_bp integer not null default 1800 check (gst_rate_bp between 0 and 2800),
  prices_include_tax boolean not null default true,
  open_time time not null default '09:00',
  close_time time not null default '21:00',
  slot_minutes integer not null default 15 check (slot_minutes in (5,10,15,20,30,60)),
  booking_enabled boolean not null default true,
  booking_note text,
  invoice_prefix text not null default 'INV',
  invoice_seq integer not null default 0,
  client_seq integer not null default 0,
  status text not null default 'active' check (status in ('active','suspended')),
  onboarded_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.salon_subscriptions (
  salon_id uuid primary key references public.salons(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  paid_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.salon_staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null default 'stylist' check (role in ('owner','manager','receptionist','stylist')),
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  title text,
  phone text,
  email text,
  color text not null default '#8b8b93',
  commission_bp integer not null default 0 check (commission_bp between 0 and 10000),
  product_commission_bp integer not null default 0 check (product_commission_bp between 0 and 10000),
  bookable boolean not null default true,
  work_days smallint[] not null default '{1,2,3,4,5,6}', -- 0=Sun … 6=Sat
  work_start time,
  work_end time,
  sort integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create unique index salon_staff_user_uq on public.salon_staff(salon_id, user_id) where user_id is not null;
create unique index salon_staff_email_uq on public.salon_staff(salon_id, lower(email)) where email is not null;
create index salon_staff_user_idx on public.salon_staff(user_id);

create table public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);
insert into public.role_permissions(role, permission)
select r, p from
  (values ('owner'),('manager')) roles(r),
  (values ('calendar.manage'),('billing.create'),('billing.void'),('clients.manage'),('services.manage'),
          ('staff.manage'),('inventory.manage'),('reports.view'),('expenses.manage'),('settings.manage')) perms(p)
where not (r = 'manager' and p in ('settings.manage','staff.manage'))
union all
select 'receptionist', p from (values ('calendar.manage'),('billing.create'),('clients.manage'),('inventory.manage')) x(p)
union all
select 'stylist', p from (values ('calendar.manage')) x(p);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb,
  reason text
);
create index audit_logs_salon_idx on public.audit_logs(salon_id, occurred_at desc);

-- ───────────────────────── Catalogue ─────────────────────────
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index service_categories_salon_idx on public.service_categories(salon_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  duration_min integer not null default 30 check (duration_min between 5 and 600),
  price_paise bigint not null default 0 check (price_paise >= 0),
  gender text not null default 'unisex' check (gender in ('unisex','women','men')),
  online_bookable boolean not null default true,
  sort integer not null default 0,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);
create index services_salon_idx on public.services(salon_id, status);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  brand text,
  sku text,
  kind text not null default 'retail' check (kind in ('retail','consumable')),
  price_paise bigint not null default 0 check (price_paise >= 0),
  cost_paise bigint not null default 0 check (cost_paise >= 0),
  stock_qty numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  unit text not null default 'pc',
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);
create index products_salon_idx on public.products(salon_id, status);

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty numeric(12,2) not null,
  reason text not null check (reason in ('purchase','sale','use','adjust','return','void')),
  note text,
  ref_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index stock_moves_product_idx on public.stock_moves(product_id, created_at desc);

-- ───────────────────────── Clients ─────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_no integer not null,
  full_name text not null check (length(trim(full_name)) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text,
  gender text check (gender in ('female','male','other')),
  date_of_birth date,
  anniversary date,
  notes text,
  tags text[] not null default '{}',
  source text not null default 'walk_in' check (source in ('walk_in','phone','online','whatsapp','instagram','referral','other')),
  marketing_opt_in boolean not null default true,
  visit_count integer not null default 0,
  total_spent_paise bigint not null default 0,
  last_visit_at timestamptz,
  status text not null default 'active' check (status in ('active','blocked','archived')),
  created_at timestamptz not null default now(),
  unique (salon_id, phone),
  unique (salon_id, client_no)
);
create index clients_salon_name_idx on public.clients(salon_id, lower(full_name));

-- ───────────────────────── Appointments ─────────────────────────
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  staff_id uuid not null references public.salon_staff(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','arrived','in_service','completed','cancelled','no_show')),
  source text not null default 'walk_in' check (source in ('walk_in','phone','online','whatsapp','instagram','other')),
  notes text,
  cancel_reason text,
  invoice_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index appointments_salon_time_idx on public.appointments(salon_id, start_at);
create index appointments_staff_time_idx on public.appointments(staff_id, start_at);
create index appointments_client_idx on public.appointments(client_id, start_at desc);

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  service_id uuid references public.services(id),
  name text not null,
  duration_min integer not null,
  price_paise bigint not null,
  sort integer not null default 0
);
create index appointment_services_appt_idx on public.appointment_services(appointment_id);

-- ───────────────────────── Billing ─────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_no text not null,
  client_id uuid references public.clients(id),
  appointment_id uuid references public.appointments(id),
  status text not null default 'paid' check (status in ('paid','partial','unpaid','void')),
  subtotal_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  taxable_paise bigint not null default 0,
  tax_paise bigint not null default 0,
  total_paise bigint not null default 0,
  paid_paise bigint not null default 0,
  tip_paise bigint not null default 0,
  gst_rate_bp integer not null default 0,
  notes text,
  idempotency_key uuid,
  void_reason text,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (salon_id, invoice_no),
  unique (salon_id, idempotency_key)
);
create index invoices_salon_time_idx on public.invoices(salon_id, created_at desc);
create index invoices_client_idx on public.invoices(client_id, created_at desc);
alter table public.appointments add constraint appointments_invoice_fk foreign key (invoice_id) references public.invoices(id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  kind text not null check (kind in ('service','product','custom')),
  ref_id uuid,
  name text not null,
  staff_id uuid references public.salon_staff(id),
  qty numeric(12,2) not null default 1 check (qty > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  total_paise bigint not null,
  commission_paise bigint not null default 0
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_staff_idx on public.invoice_items(staff_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method text not null check (method in ('cash','upi','card','bank','other')),
  amount_paise bigint not null check (amount_paise > 0),
  reference text,
  status text not null default 'ok' check (status in ('ok','void')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index payments_salon_time_idx on public.payments(salon_id, created_at desc);
create index payments_invoice_idx on public.payments(invoice_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  category text not null,
  amount_paise bigint not null check (amount_paise > 0),
  expense_date date not null default current_date,
  method text not null default 'cash' check (method in ('cash','upi','card','bank','other')),
  description text,
  status text not null default 'ok' check (status in ('ok','void')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index expenses_salon_date_idx on public.expenses(salon_id, expense_date desc);

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.is_salon_member(p_salon uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from salon_staff s where s.salon_id = p_salon and s.user_id = auth.uid() and s.status = 'active');
$$;

create or replace function public.has_perm(p_salon uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from salon_staff s join role_permissions rp on rp.role = s.role
    where s.salon_id = p_salon and s.user_id = auth.uid() and s.status = 'active' and rp.permission = p_perm);
$$;

create or replace function public.require_perm(p_salon uuid, p_perm text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '28000'; end if;
  if not has_perm(p_salon, p_perm) then raise exception 'You do not have permission for this action' using errcode = '42501'; end if;
end $$;

create or replace function public.log_audit(p_salon uuid, p_action text, p_entity text, p_entity_id uuid, p_data jsonb default null, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(salon_id, actor_user_id, action, entity, entity_id, data, reason)
  values (p_salon, auth.uid(), p_action, p_entity, p_entity_id, p_data, p_reason);
$$;

revoke execute on function public.log_audit(uuid,text,text,uuid,jsonb,text) from public, anon, authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.salons enable row level security;
alter table public.salon_subscriptions enable row level security;
alter table public.salon_staff enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.stock_moves enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

create policy salons_read on public.salons for select to authenticated using (is_salon_member(id));
create policy salons_update on public.salons for update to authenticated using (has_perm(id,'settings.manage')) with check (has_perm(id,'settings.manage'));
create policy subs_read on public.salon_subscriptions for select to authenticated using (is_salon_member(salon_id));
create policy staff_read on public.salon_staff for select to authenticated using (is_salon_member(salon_id) or user_id = auth.uid());
create policy perms_read on public.role_permissions for select to authenticated using (true);
create policy audit_read on public.audit_logs for select to authenticated using (has_perm(salon_id,'reports.view'));

-- master data: members read, permitted roles write
create policy cat_read on public.service_categories for select to authenticated using (is_salon_member(salon_id));
create policy cat_write on public.service_categories for all to authenticated using (has_perm(salon_id,'services.manage')) with check (has_perm(salon_id,'services.manage'));
create policy svc_read on public.services for select to authenticated using (is_salon_member(salon_id));
create policy svc_ins on public.services for insert to authenticated with check (has_perm(salon_id,'services.manage'));
create policy svc_upd on public.services for update to authenticated using (has_perm(salon_id,'services.manage')) with check (has_perm(salon_id,'services.manage'));
create policy prod_read on public.products for select to authenticated using (is_salon_member(salon_id));
create policy prod_ins on public.products for insert to authenticated with check (has_perm(salon_id,'inventory.manage'));
create policy prod_upd on public.products for update to authenticated using (has_perm(salon_id,'inventory.manage')) with check (has_perm(salon_id,'inventory.manage'));
create policy moves_read on public.stock_moves for select to authenticated using (is_salon_member(salon_id));
create policy clients_read on public.clients for select to authenticated using (is_salon_member(salon_id));
create policy clients_upd on public.clients for update to authenticated using (has_perm(salon_id,'clients.manage')) with check (has_perm(salon_id,'clients.manage'));
create policy appt_read on public.appointments for select to authenticated using (is_salon_member(salon_id));
create policy appt_svc_read on public.appointment_services for select to authenticated using (is_salon_member(salon_id));
create policy inv_read on public.invoices for select to authenticated using (is_salon_member(salon_id));
create policy inv_items_read on public.invoice_items for select to authenticated using (is_salon_member(salon_id));
create policy pay_read on public.payments for select to authenticated using (is_salon_member(salon_id));
create policy exp_read on public.expenses for select to authenticated using (has_perm(salon_id,'expenses.manage') or has_perm(salon_id,'reports.view'));

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.service_categories, public.services, public.products to authenticated;
-- salons/clients: only editable columns (counters, status etc. change via RPC only)
grant update (name, phone, email, address, city, gstin, gst_enabled, gst_rate_bp, prices_include_tax, open_time, close_time,
  slot_minutes, booking_enabled, booking_note, invoice_prefix, updated_at) on public.salons to authenticated;
grant update (full_name, email, gender, date_of_birth, anniversary, notes, tags, marketing_opt_in, status) on public.clients to authenticated;
grant delete on public.service_categories to authenticated;
revoke all on all tables in schema public from anon;
