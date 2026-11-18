-- XS Salon — business logic (RPC). All writes that touch money or bookings go through these.

-- appointment services are soft-replaced on reschedule (history kept)
alter table public.appointment_services add column if not exists active boolean not null default true;
alter policy appt_svc_read on public.appointment_services using (is_salon_member(salon_id) and active);

-- ───────────── Onboarding / membership ─────────────
create or replace function public.create_salon(p_name text, p_phone text default null, p_city text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text; v_base text; v_n int := 0; v_email text; v_cat uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if (select count(*) from salon_staff where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Salon limit reached for this account';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name,'salon')), '[^a-z0-9]+', '-', 'g'));
  if length(v_base) < 3 then v_base := 'salon-' || v_base; end if;
  v_base := left(v_base, 34);
  v_slug := v_base;
  while exists (select 1 from salons where slug = v_slug) loop
    v_n := v_n + 1; v_slug := v_base || '-' || v_n;
  end loop;

  insert into salons(name, slug, phone, city, email, created_by)
  values (trim(p_name), v_slug, nullif(trim(p_phone),''), nullif(trim(p_city),''), v_email, auth.uid())
  returning id into v_id;
  insert into salon_subscriptions(salon_id) values (v_id);
  insert into salon_staff(salon_id, user_id, role, display_name, email, bookable, color)
  values (v_id, auth.uid(), 'owner', coalesce(split_part(v_email,'@',1),'Owner'), v_email, false, '#d4a373');

  -- starter catalogue (editable)
  insert into service_categories(salon_id, name, sort) values (v_id,'Hair',1) returning id into v_cat;
  insert into services(salon_id, category_id, name, duration_min, price_paise, gender, sort) values
    (v_id, v_cat, 'Haircut', 30, 30000, 'unisex', 1),
    (v_id, v_cat, 'Hair Wash & Blow Dry', 30, 40000, 'unisex', 2),
    (v_id, v_cat, 'Global Hair Colour', 120, 250000, 'unisex', 3);
  insert into service_categories(salon_id, name, sort) values (v_id,'Skin',2) returning id into v_cat;
  insert into services(salon_id, category_id, name, duration_min, price_paise, gender, sort) values
    (v_id, v_cat, 'Clean-up', 45, 80000, 'unisex', 1),
    (v_id, v_cat, 'Facial', 60, 150000, 'unisex', 2);
  insert into service_categories(salon_id, name, sort) values (v_id,'Grooming',3) returning id into v_cat;
  insert into services(salon_id, category_id, name, duration_min, price_paise, gender, sort) values
    (v_id, v_cat, 'Beard Trim', 15, 15000, 'men', 1),
    (v_id, v_cat, 'Eyebrow Threading', 15, 5000, 'women', 2);

  perform log_audit(v_id, 'create', 'salon', v_id, jsonb_build_object('name', p_name));
  return v_id;
end $$;

-- Link staff rows that were added by email to the signed-in user.
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_n int;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  update salon_staff s set user_id = auth.uid()
   where s.user_id is null and lower(s.email) = v_email and s.status = 'active'
     and not exists (select 1 from salon_staff x where x.salon_id = s.salon_id and x.user_id = auth.uid());
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.my_salons()
returns table(salon_id uuid, name text, slug text, role text, city text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.slug, st.role, s.city
  from salon_staff st join salons s on s.id = st.salon_id
  where st.user_id = auth.uid() and st.status = 'active' and s.status = 'active'
  order by s.created_at;
$$;

create or replace function public.complete_onboarding(p_salon uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_perm(p_salon, 'settings.manage');
  update salons set onboarded_at = coalesce(onboarded_at, now()) where id = p_salon;
end $$;

-- ───────────── Staff ─────────────
create or replace function public.save_staff(
  p_salon uuid, p_staff uuid, p_display_name text, p_role text, p_title text default null,
  p_phone text default null, p_email text default null, p_color text default '#8b8b93',
  p_commission_bp int default 0, p_product_commission_bp int default 0, p_bookable boolean default true,
  p_work_days smallint[] default '{1,2,3,4,5,6}', p_work_start time default null, p_work_end time default null,
  p_status text default 'active')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old salon_staff;
begin
  perform require_perm(p_salon, 'staff.manage');
  if p_role not in ('owner','manager','receptionist','stylist') then raise exception 'Invalid role'; end if;
  if p_staff is not null then
    select * into v_old from salon_staff where id = p_staff and salon_id = p_salon for update;
    if not found then raise exception 'Staff not found'; end if;
    if v_old.role = 'owner' and (p_role <> 'owner' or p_status <> 'active')
       and (select count(*) from salon_staff where salon_id = p_salon and role = 'owner' and status = 'active') <= 1 then
      raise exception 'A salon must keep at least one active owner';
    end if;
    if v_old.user_id = auth.uid() and p_status <> 'active' then raise exception 'You cannot deactivate yourself'; end if;
    update salon_staff set display_name = trim(p_display_name), role = p_role, title = nullif(trim(p_title),''),
      phone = nullif(trim(p_phone),''),
      email = case when v_old.user_id is null then nullif(lower(trim(p_email)),'') else email end,
      color = coalesce(p_color,'#8b8b93'), commission_bp = coalesce(p_commission_bp,0),
      product_commission_bp = coalesce(p_product_commission_bp,0), bookable = coalesce(p_bookable,true),
      work_days = coalesce(p_work_days,'{1,2,3,4,5,6}'), work_start = p_work_start, work_end = p_work_end,
      status = p_status
    where id = p_staff;
    v_id := p_staff;
    perform log_audit(p_salon, 'update', 'staff', v_id, to_jsonb(v_old));
  else
    insert into salon_staff(salon_id, display_name, role, title, phone, email, color, commission_bp, product_commission_bp,
      bookable, work_days, work_start, work_end, status,
      sort)
    values (p_salon, trim(p_display_name), p_role, nullif(trim(p_title),''), nullif(trim(p_phone),''),
      nullif(lower(trim(p_email)),''), coalesce(p_color,'#8b8b93'), coalesce(p_commission_bp,0), coalesce(p_product_commission_bp,0),
      coalesce(p_bookable,true), coalesce(p_work_days,'{1,2,3,4,5,6}'), p_work_start, p_work_end, coalesce(p_status,'active'),
      (select coalesce(max(sort),0)+1 from salon_staff where salon_id = p_salon))
    returning id into v_id;
    -- link immediately if that email already has an account
    update salon_staff set user_id = u.id from auth.users u
     where salon_staff.id = v_id and salon_staff.email is not null and lower(u.email) = salon_staff.email
       and not exists (select 1 from salon_staff x where x.salon_id = p_salon and x.user_id = u.id);
    perform log_audit(p_salon, 'create', 'staff', v_id, jsonb_build_object('name', p_display_name, 'role', p_role));
  end if;
  return v_id;
end $$;

-- ───────────── Clients ─────────────
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p,'[^0-9]','','g') ~ '^[6-9][0-9]{9}$' then '+91' || regexp_replace(p,'[^0-9]','','g')
    when regexp_replace(p,'[^0-9]','','g') ~ '^91[6-9][0-9]{9}$' then '+' || regexp_replace(p,'[^0-9]','','g')
    when p ~ '^\s*\+' then '+' || regexp_replace(p,'[^0-9]','','g')
    else regexp_replace(p,'[^0-9]','','g') end;
$$;

create or replace function public.save_client(
  p_salon uuid, p_client uuid, p_full_name text, p_phone text, p_email text default null,
  p_gender text default null, p_date_of_birth date default null, p_anniversary date default null,
  p_notes text default null, p_tags text[] default '{}', p_source text default 'walk_in', p_marketing_opt_in boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text := normalize_phone(p_phone); v_no int;
begin
  perform require_perm(p_salon, 'clients.manage');
  if v_phone is null or v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Enter a valid phone number'; end if;
  if exists (select 1 from clients where salon_id = p_salon and phone = v_phone and id is distinct from p_client) then
    raise exception 'A client with this phone number already exists';
  end if;
  if p_client is null then
    update salons set client_seq = client_seq + 1 where id = p_salon returning client_seq into v_no;
    insert into clients(salon_id, client_no, full_name, phone, email, gender, date_of_birth, anniversary, notes, tags, source, marketing_opt_in)
    values (p_salon, v_no, trim(p_full_name), v_phone, nullif(trim(p_email),''), p_gender, p_date_of_birth, p_anniversary,
            nullif(trim(p_notes),''), coalesce(p_tags,'{}'), coalesce(p_source,'walk_in'), coalesce(p_marketing_opt_in,true))
    returning id into v_id;
    perform log_audit(p_salon, 'create', 'client', v_id, null);
  else
    update clients set full_name = trim(p_full_name), phone = v_phone, email = nullif(trim(p_email),''), gender = p_gender,
      date_of_birth = p_date_of_birth, anniversary = p_anniversary, notes = nullif(trim(p_notes),''),
      tags = coalesce(p_tags,'{}'), source = coalesce(p_source, source), marketing_opt_in = coalesce(p_marketing_opt_in,true)
    where id = p_client and salon_id = p_salon returning id into v_id;
    if v_id is null then raise exception 'Client not found'; end if;
  end if;
  return v_id;
end $$;

-- internal: find or create a client by phone (no permission check — callers check)
create or replace function public._client_by_phone(p_salon uuid, p_name text, p_phone text, p_source text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text := normalize_phone(p_phone); v_no int;
begin
  if v_phone is null or v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Enter a valid phone number'; end if;
  select id into v_id from clients where salon_id = p_salon and phone = v_phone;
  if v_id is not null then return v_id; end if;
  update salons set client_seq = client_seq + 1 where id = p_salon returning client_seq into v_no;
  insert into clients(salon_id, client_no, full_name, phone, source)
  values (p_salon, v_no, coalesce(nullif(trim(p_name),''),'Guest'), v_phone, p_source) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public._client_by_phone(uuid,text,text,text) from public, anon, authenticated;

-- ───────────── Scheduling ─────────────
-- Is a staff member free (and working) for [p_start, p_end)?
create or replace function public._staff_free(p_staff uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare st salon_staff; sa salons; v_local_start timestamp; v_local_end timestamp; v_open time; v_close time;
begin
  select * into st from salon_staff where id = p_staff;
  if not found or st.status <> 'active' or not st.bookable then return false; end if;
  select * into sa from salons where id = st.salon_id;
  v_local_start := p_start at time zone sa.timezone;
  v_local_end := p_end at time zone sa.timezone;
  if v_local_start::date <> (v_local_end - interval '1 second')::date then return false; end if;
  if not (extract(dow from v_local_start)::smallint = any(st.work_days)) then return false; end if;
  v_open := greatest(sa.open_time, coalesce(st.work_start, sa.open_time));
  v_close := least(sa.close_time, coalesce(st.work_end, sa.close_time));
  if v_local_start::time < v_open or (v_local_end - interval '1 second')::time >= v_close then return false; end if;
  return not exists (
    select 1 from appointments a
    where a.staff_id = p_staff and a.id is distinct from p_ignore
      and a.status not in ('cancelled','no_show')
      and a.start_at < p_end and a.end_at > p_start);
end $$;
revoke execute on function public._staff_free(uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;

create or replace function public.book_appointment(
  p_salon uuid, p_client uuid, p_staff uuid, p_start timestamptz, p_service_ids uuid[],
  p_source text default 'walk_in', p_notes text default null, p_appointment uuid default null,
  p_force boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_minutes int; v_end timestamptz; v_conflict boolean; v_old appointments;
begin
  perform require_perm(p_salon, 'calendar.manage');
  if coalesce(array_length(p_service_ids,1),0) = 0 then raise exception 'Pick at least one service'; end if;
  if not exists (select 1 from clients where id = p_client and salon_id = p_salon) then raise exception 'Client not found'; end if;
  if not exists (select 1 from salon_staff where id = p_staff and salon_id = p_salon and status = 'active') then raise exception 'Staff not found'; end if;

  select sum(s.duration_min) into v_minutes
  from unnest(p_service_ids) with ordinality u(sid, ord) join services s on s.id = u.sid and s.salon_id = p_salon;
  if v_minutes is null or (select count(*) from unnest(p_service_ids) u join services s on s.id = u and s.salon_id = p_salon) <> array_length(p_service_ids,1) then
    raise exception 'One of the services was not found';
  end if;
  v_end := p_start + make_interval(mins => v_minutes);

  select exists (select 1 from appointments a where a.staff_id = p_staff and a.id is distinct from p_appointment
     and a.status not in ('cancelled','no_show') and a.start_at < v_end and a.end_at > p_start) into v_conflict;
  if v_conflict and not p_force then raise exception 'This stylist already has an appointment at that time'; end if;

  if p_appointment is null then
    insert into appointments(salon_id, client_id, staff_id, start_at, end_at, source, notes, created_by)
    values (p_salon, p_client, p_staff, p_start, v_end, coalesce(p_source,'walk_in'), nullif(trim(p_notes),''), auth.uid())
    returning id into v_id;
  else
    select * into v_old from appointments where id = p_appointment and salon_id = p_salon for update;
    if not found then raise exception 'Appointment not found'; end if;
    if v_old.status in ('completed','cancelled','no_show') then raise exception 'This appointment can no longer be changed'; end if;
    update appointments set client_id = p_client, staff_id = p_staff, start_at = p_start, end_at = v_end,
      notes = nullif(trim(p_notes),'') where id = p_appointment;
    update appointment_services set active = false where appointment_id = p_appointment and active;
    v_id := p_appointment;
    perform log_audit(p_salon, 'reschedule', 'appointment', v_id, jsonb_build_object('from', v_old.start_at, 'to', p_start));
  end if;

  insert into appointment_services(appointment_id, salon_id, service_id, name, duration_min, price_paise, sort)
  select v_id, p_salon, s.id, s.name, s.duration_min, s.price_paise, u.ord
  from unnest(p_service_ids) with ordinality u(sid, ord) join services s on s.id = u.sid;
  return v_id;
end $$;

create or replace function public.set_appointment_status(p_salon uuid, p_appointment uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old appointments;
begin
  perform require_perm(p_salon, 'calendar.manage');
  if p_status not in ('booked','confirmed','arrived','in_service','cancelled','no_show') then raise exception 'Invalid status'; end if;
  select * into v_old from appointments where id = p_appointment and salon_id = p_salon for update;
  if not found then raise exception 'Appointment not found'; end if;
  if v_old.status = 'completed' then raise exception 'This appointment is already billed'; end if;
  update appointments set status = p_status,
    cancel_reason = case when p_status in ('cancelled','no_show') then nullif(trim(p_reason),'') else cancel_reason end
  where id = p_appointment;
  perform log_audit(p_salon, 'status', 'appointment', p_appointment, jsonb_build_object('from', v_old.status, 'to', p_status), p_reason);
end $$;

-- ───────────── Billing ─────────────
create or replace function public.checkout(
  p_salon uuid, p_client uuid, p_appointment uuid, p_items jsonb, p_discount_paise bigint default 0,
  p_tip_paise bigint default 0, p_payments jsonb default '[]', p_notes text default null, p_idempotency_key uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sa salons; v_inv uuid; v_no text; v_seq int; v_sub bigint := 0; v_disc bigint := greatest(coalesce(p_discount_paise,0),0);
  v_tip bigint := greatest(coalesce(p_tip_paise,0),0); v_net bigint; v_tax bigint := 0; v_taxable bigint; v_total bigint;
  v_paid bigint := 0; v_rate int := 0; it jsonb; pay jsonb; v_line bigint; v_qty numeric; v_price bigint; v_ldisc bigint;
  v_staff salon_staff; v_comm bigint; v_existing invoices; v_status text; v_prod products;
begin
  perform require_perm(p_salon, 'billing.create');
  if p_idempotency_key is not null then
    select * into v_existing from invoices where salon_id = p_salon and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('invoice_id', v_existing.id, 'invoice_no', v_existing.invoice_no, 'total_paise', v_existing.total_paise, 'duplicate', true); end if;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item to the bill'; end if;
  if p_client is not null and not exists (select 1 from clients where id = p_client and salon_id = p_salon) then raise exception 'Client not found'; end if;
  if p_appointment is not null and not exists (select 1 from appointments where id = p_appointment and salon_id = p_salon and status not in ('completed','cancelled')) then
    raise exception 'Appointment is not open for billing';
  end if;

  select * into sa from salons where id = p_salon for update;
  v_seq := sa.invoice_seq + 1;
  update salons set invoice_seq = v_seq where id = p_salon;
  v_no := sa.invoice_prefix || '-' || to_char(now() at time zone sa.timezone, 'YYMM') || '-' || lpad(v_seq::text, 4, '0');

  insert into invoices(salon_id, invoice_no, client_id, appointment_id, notes, idempotency_key, created_by)
  values (p_salon, v_no, p_client, p_appointment, nullif(trim(p_notes),''), p_idempotency_key, auth.uid())
  returning id into v_inv;

  -- lines
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::numeric, 1);
    v_price := coalesce((it->>'unit_price_paise')::bigint, 0);
    v_ldisc := greatest(coalesce((it->>'discount_paise')::bigint, 0), 0);
    if v_qty <= 0 or v_price < 0 then raise exception 'Invalid quantity or price'; end if;
    v_line := round(v_qty * v_price)::bigint - v_ldisc;
    if v_line < 0 then raise exception 'Line discount is larger than the line amount'; end if;
    if (it->>'kind') = 'product' then
      select * into v_prod from products where id = (it->>'ref_id')::uuid and salon_id = p_salon for update;
      if not found then raise exception 'Product not found'; end if;
      update products set stock_qty = stock_qty - v_qty where id = v_prod.id;
      insert into stock_moves(salon_id, product_id, qty, reason, ref_id, created_by) values (p_salon, v_prod.id, -v_qty, 'sale', v_inv, auth.uid());
    end if;
    insert into invoice_items(invoice_id, salon_id, kind, ref_id, name, staff_id, qty, unit_price_paise, discount_paise, total_paise)
    values (v_inv, p_salon, coalesce(it->>'kind','custom'), nullif(it->>'ref_id','')::uuid, coalesce(nullif(trim(it->>'name'),''),'Item'),
            nullif(it->>'staff_id','')::uuid, v_qty, v_price, v_ldisc, v_line);
    v_sub := v_sub + v_line;
  end loop;

  if v_disc > v_sub then raise exception 'Discount is larger than the bill'; end if;
  v_net := v_sub - v_disc;
  if sa.gst_enabled then
    v_rate := sa.gst_rate_bp;
    if sa.prices_include_tax then
      v_total := v_net; v_tax := round(v_net::numeric * v_rate / (10000 + v_rate))::bigint; v_taxable := v_net - v_tax;
    else
      v_taxable := v_net; v_tax := round(v_net::numeric * v_rate / 10000)::bigint; v_total := v_net + v_tax;
    end if;
  else
    v_taxable := v_net; v_total := v_net;
  end if;

  -- commission on each line's share after bill discount (pre-tax)
  update invoice_items ii set commission_paise = round(
      (ii.total_paise::numeric * (case when v_sub = 0 then 0 else v_net::numeric / v_sub end))
      * (case when sa.gst_enabled and sa.prices_include_tax then 10000.0/(10000+v_rate) else 1 end)
      * (case ii.kind when 'product' then st.product_commission_bp else st.commission_bp end) / 10000)::bigint
  from salon_staff st where ii.invoice_id = v_inv and st.id = ii.staff_id;

  -- payments
  for pay in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if coalesce((pay->>'amount_paise')::bigint,0) > 0 then
      insert into payments(salon_id, invoice_id, method, amount_paise, reference, created_by)
      values (p_salon, v_inv, coalesce(pay->>'method','cash'), (pay->>'amount_paise')::bigint, nullif(trim(pay->>'reference'),''), auth.uid());
      v_paid := v_paid + (pay->>'amount_paise')::bigint;
    end if;
  end loop;
  if v_paid > v_total + v_tip then raise exception 'Payment is more than the bill amount'; end if;
  v_status := case when v_paid >= v_total + v_tip then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end;

  update invoices set subtotal_paise = v_sub, discount_paise = v_disc, taxable_paise = v_taxable, tax_paise = v_tax,
    total_paise = v_total, tip_paise = v_tip, paid_paise = v_paid, gst_rate_bp = v_rate, status = v_status
  where id = v_inv;

  if p_appointment is not null then
    update appointments set status = 'completed', invoice_id = v_inv where id = p_appointment;
  end if;
  if p_client is not null then
    update clients set visit_count = visit_count + 1, total_spent_paise = total_spent_paise + v_total, last_visit_at = now()
    where id = p_client;
  end if;
  perform log_audit(p_salon, 'create', 'invoice', v_inv, jsonb_build_object('no', v_no, 'total', v_total));
  return jsonb_build_object('invoice_id', v_inv, 'invoice_no', v_no, 'total_paise', v_total, 'paid_paise', v_paid, 'status', v_status);
end $$;

create or replace function public.add_payment(p_salon uuid, p_invoice uuid, p_method text, p_amount_paise bigint, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v invoices;
begin
  perform require_perm(p_salon, 'billing.create');
  select * into v from invoices where id = p_invoice and salon_id = p_salon for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v.status = 'void' then raise exception 'Invoice is void'; end if;
  if p_amount_paise <= 0 or v.paid_paise + p_amount_paise > v.total_paise + v.tip_paise then raise exception 'Amount is more than the balance due'; end if;
  insert into payments(salon_id, invoice_id, method, amount_paise, reference, created_by)
  values (p_salon, p_invoice, p_method, p_amount_paise, nullif(trim(p_reference),''), auth.uid());
  update invoices set paid_paise = paid_paise + p_amount_paise,
    status = case when paid_paise + p_amount_paise >= total_paise + tip_paise then 'paid' else 'partial' end
  where id = p_invoice;
  perform log_audit(p_salon, 'payment', 'invoice', p_invoice, jsonb_build_object('amount', p_amount_paise, 'method', p_method));
end $$;

create or replace function public.void_invoice(p_salon uuid, p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v invoices; it invoice_items;
begin
  perform require_perm(p_salon, 'billing.void');
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into v from invoices where id = p_invoice and salon_id = p_salon for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v.status = 'void' then return; end if;
  for it in select * from invoice_items where invoice_id = p_invoice and kind = 'product' loop
    update products set stock_qty = stock_qty + it.qty where id = it.ref_id;
    insert into stock_moves(salon_id, product_id, qty, reason, ref_id, created_by) values (p_salon, it.ref_id, it.qty, 'void', p_invoice, auth.uid());
  end loop;
  update payments set status = 'void' where invoice_id = p_invoice;
  update invoices set status = 'void', void_reason = trim(p_reason), voided_at = now() where id = p_invoice;
  if v.appointment_id is not null then update appointments set status = 'arrived', invoice_id = null where id = v.appointment_id; end if;
  if v.client_id is not null then
    update clients set visit_count = greatest(visit_count - 1, 0), total_spent_paise = greatest(total_spent_paise - v.total_paise, 0) where id = v.client_id;
  end if;
  perform log_audit(p_salon, 'void', 'invoice', p_invoice, jsonb_build_object('no', v.invoice_no, 'total', v.total_paise), p_reason);
end $$;

-- ───────────── Inventory & expenses ─────────────
create or replace function public.adjust_stock(p_salon uuid, p_product uuid, p_qty numeric, p_reason text, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_new numeric;
begin
  perform require_perm(p_salon, 'inventory.manage');
  if p_reason not in ('purchase','use','adjust','return') then raise exception 'Invalid reason'; end if;
  if p_qty = 0 then raise exception 'Quantity cannot be zero'; end if;
  update products set stock_qty = stock_qty + p_qty where id = p_product and salon_id = p_salon returning stock_qty into v_new;
  if v_new is null then raise exception 'Product not found'; end if;
  insert into stock_moves(salon_id, product_id, qty, reason, note, created_by) values (p_salon, p_product, p_qty, p_reason, nullif(trim(p_note),''), auth.uid());
  return v_new;
end $$;

create or replace function public.record_expense(p_salon uuid, p_category text, p_amount_paise bigint, p_expense_date date, p_method text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform require_perm(p_salon, 'expenses.manage');
  insert into expenses(salon_id, category, amount_paise, expense_date, method, description, created_by)
  values (p_salon, trim(p_category), p_amount_paise, coalesce(p_expense_date, current_date), coalesce(p_method,'cash'), nullif(trim(p_description),''), auth.uid())
  returning id into v_id;
  perform log_audit(p_salon, 'create', 'expense', v_id, jsonb_build_object('amount', p_amount_paise, 'category', p_category));
  return v_id;
end $$;

create or replace function public.void_expense(p_salon uuid, p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_perm(p_salon, 'expenses.manage');
  update expenses set status = 'void' where id = p_expense and salon_id = p_salon;
  perform log_audit(p_salon, 'void', 'expense', p_expense, null, p_reason);
end $$;

-- ───────────── Dashboard & reports ─────────────
create or replace function public.dashboard_summary(p_salon uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sa salons; v_today date; v_start timestamptz; v_end timestamptz; v_month timestamptz; r jsonb;
begin
  if not is_salon_member(p_salon) then raise exception 'Not allowed'; end if;
  select * into sa from salons where id = p_salon;
  v_today := (now() at time zone sa.timezone)::date;
  v_start := v_today::timestamp at time zone sa.timezone;
  v_end := v_start + interval '1 day';
  v_month := date_trunc('month', v_today)::timestamp at time zone sa.timezone;
  select jsonb_build_object(
    'today', v_today,
    'revenue_today', (select coalesce(sum(total_paise),0) from invoices where salon_id = p_salon and status <> 'void' and created_at >= v_start and created_at < v_end),
    'collected_today', (select coalesce(sum(amount_paise),0) from payments where salon_id = p_salon and status = 'ok' and created_at >= v_start and created_at < v_end),
    'bills_today', (select count(*) from invoices where salon_id = p_salon and status <> 'void' and created_at >= v_start and created_at < v_end),
    'revenue_month', (select coalesce(sum(total_paise),0) from invoices where salon_id = p_salon and status <> 'void' and created_at >= v_month),
    'expenses_month', (select coalesce(sum(amount_paise),0) from expenses where salon_id = p_salon and status = 'ok' and expense_date >= date_trunc('month', v_today)::date),
    'appts_today', (select count(*) from appointments where salon_id = p_salon and start_at >= v_start and start_at < v_end and status not in ('cancelled')),
    'appts_by_status', (select coalesce(jsonb_object_agg(status, n),'{}') from (select status, count(*) n from appointments where salon_id = p_salon and start_at >= v_start and start_at < v_end group by status) x),
    'online_today', (select count(*) from appointments where salon_id = p_salon and source = 'online' and created_at >= v_start and created_at < v_end),
    'new_clients_month', (select count(*) from clients where salon_id = p_salon and created_at >= v_month),
    'clients_total', (select count(*) from clients where salon_id = p_salon and status = 'active'),
    'dues_paise', (select coalesce(sum(total_paise + tip_paise - paid_paise),0) from invoices where salon_id = p_salon and status in ('partial','unpaid')),
    'low_stock', (select count(*) from products where salon_id = p_salon and status = 'active' and stock_qty <= reorder_level),
    'birthdays_week', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'phone',phone,'date',date_of_birth)),'[]') from clients
        where salon_id = p_salon and date_of_birth is not null and status = 'active'
          and ((extract(doy from date_of_birth)::int - extract(doy from v_today)::int + 366) % 366) between 0 and 6),
    'last7', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', v) order by d),'[]') from (
        select g::date d, coalesce((select sum(total_paise) from invoices i where i.salon_id = p_salon and i.status <> 'void'
          and (i.created_at at time zone sa.timezone)::date = g::date),0) v
        from generate_series(v_today - 6, v_today, interval '1 day') g) x)
  ) into r;
  return r;
end $$;

create or replace function public.sales_report(p_salon uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sa salons; v_s timestamptz; v_e timestamptz; r jsonb;
begin
  perform require_perm(p_salon, 'reports.view');
  select * into sa from salons where id = p_salon;
  v_s := p_from::timestamp at time zone sa.timezone;
  v_e := (p_to + 1)::timestamp at time zone sa.timezone;
  with inv as (select * from invoices where salon_id = p_salon and status <> 'void' and created_at >= v_s and created_at < v_e),
       items as (select ii.* from invoice_items ii join inv on inv.id = ii.invoice_id)
  select jsonb_build_object(
    'totals', (select jsonb_build_object('bills', count(*), 'gross', coalesce(sum(subtotal_paise),0), 'discount', coalesce(sum(discount_paise),0),
        'tax', coalesce(sum(tax_paise),0), 'net', coalesce(sum(total_paise),0), 'tips', coalesce(sum(tip_paise),0),
        'avg_bill', coalesce(round(avg(total_paise)),0), 'due', coalesce(sum(total_paise + tip_paise - paid_paise),0)) from inv),
    'service_revenue', (select coalesce(sum(total_paise),0) from items where kind <> 'product'),
    'product_revenue', (select coalesce(sum(total_paise),0) from items where kind = 'product'),
    'expenses', (select coalesce(sum(amount_paise),0) from expenses where salon_id = p_salon and status = 'ok' and expense_date between p_from and p_to),
    'expenses_by_category', (select coalesce(jsonb_agg(x order by x.amount desc),'[]') from (select category, sum(amount_paise) amount from expenses where salon_id = p_salon and status='ok' and expense_date between p_from and p_to group by category) x),
    'by_day', (select coalesce(jsonb_agg(x order by x.d),'[]') from (select (created_at at time zone sa.timezone)::date d, sum(total_paise) v, count(*) n from inv group by 1) x),
    'by_method', (select coalesce(jsonb_agg(x order by x.amount desc),'[]') from (select method, sum(amount_paise) amount from payments where salon_id = p_salon and status='ok' and created_at >= v_s and created_at < v_e group by method) x),
    'by_staff', (select coalesce(jsonb_agg(x order by x.revenue desc),'[]') from (
        select st.id, st.display_name name, st.color, sum(i.total_paise) revenue,
          sum(i.total_paise) filter (where i.kind <> 'product') services, sum(i.total_paise) filter (where i.kind = 'product') products,
          sum(i.commission_paise) commission, count(distinct i.invoice_id) bills
        from items i join salon_staff st on st.id = i.staff_id group by st.id, st.display_name, st.color) x),
    'top_services', (select coalesce(jsonb_agg(x order by x.revenue desc),'[]') from (
        select name, sum(qty) qty, sum(total_paise) revenue from items where kind = 'service' group by name order by sum(total_paise) desc limit 10) x),
    'top_products', (select coalesce(jsonb_agg(x order by x.revenue desc),'[]') from (
        select name, sum(qty) qty, sum(total_paise) revenue from items where kind = 'product' group by name order by sum(total_paise) desc limit 10) x),
    'new_clients', (select count(*) from clients where salon_id = p_salon and created_at >= v_s and created_at < v_e),
    'appointments', (select coalesce(jsonb_object_agg(status, n),'{}') from (select status, count(*) n from appointments where salon_id = p_salon and start_at >= v_s and start_at < v_e group by status) x)
  ) into r;
  return r;
end $$;

-- ───────────── Public online booking (anon) ─────────────
create or replace function public.public_salon(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sa salons;
begin
  select * into sa from salons where slug = lower(p_slug) and status = 'active' and booking_enabled;
  if not found then return null; end if;
  return jsonb_build_object(
    'name', sa.name, 'slug', sa.slug, 'phone', sa.phone, 'address', sa.address, 'city', sa.city, 'note', sa.booking_note,
    'open_time', sa.open_time, 'close_time', sa.close_time, 'timezone', sa.timezone,
    'today', (now() at time zone sa.timezone)::date,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name),'[]') from service_categories c where c.salon_id = sa.id),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category_id', s.category_id, 'description', s.description,
        'duration_min', s.duration_min, 'price_paise', s.price_paise, 'gender', s.gender) order by s.sort, s.name),'[]')
        from services s where s.salon_id = sa.id and s.status = 'active' and s.online_bookable),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.display_name, 'title', st.title, 'color', st.color) order by st.sort, st.display_name),'[]')
        from salon_staff st where st.salon_id = sa.id and st.status = 'active' and st.bookable)
  );
end $$;

create or replace function public.public_slots(p_slug text, p_date date, p_service_ids uuid[], p_staff uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sa salons; v_minutes int; v_t timestamp; v_start timestamptz; v_end timestamptz; v_now timestamptz := now() + interval '30 minutes';
        v_slots jsonb := '[]'; v_free uuid;
begin
  select * into sa from salons where slug = lower(p_slug) and status = 'active' and booking_enabled;
  if not found then raise exception 'Salon not found'; end if;
  if p_date < (now() at time zone sa.timezone)::date or p_date > (now() at time zone sa.timezone)::date + 60 then return '[]'; end if;
  select sum(duration_min) into v_minutes from services where salon_id = sa.id and id = any(p_service_ids) and status = 'active' and online_bookable;
  if v_minutes is null then return '[]'; end if;
  v_t := p_date + sa.open_time;
  while v_t + make_interval(mins => v_minutes) <= p_date + sa.close_time loop
    v_start := v_t at time zone sa.timezone;
    v_end := v_start + make_interval(mins => v_minutes);
    if v_start >= v_now then
      select st.id into v_free from salon_staff st
      where st.salon_id = sa.id and st.status = 'active' and st.bookable and (p_staff is null or st.id = p_staff)
        and _staff_free(st.id, v_start, v_end)
      limit 1;
      if v_free is not null then v_slots := v_slots || to_jsonb(to_char(v_t, 'HH24:MI')); end if;
    end if;
    v_t := v_t + make_interval(mins => sa.slot_minutes);
  end loop;
  return v_slots;
end $$;

create or replace function public.public_book(p_slug text, p_name text, p_phone text, p_date date, p_time text,
  p_service_ids uuid[], p_staff uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sa salons; v_minutes int; v_start timestamptz; v_end timestamptz; v_staff uuid; v_client uuid; v_id uuid; v_phone text := normalize_phone(p_phone);
begin
  select * into sa from salons where slug = lower(p_slug) and status = 'active' and booking_enabled for update;
  if not found then raise exception 'Salon not found'; end if;
  if coalesce(length(trim(p_name)),0) < 2 then raise exception 'Please enter your name'; end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Please enter a valid phone number'; end if;
  if coalesce(array_length(p_service_ids,1),0) = 0 or array_length(p_service_ids,1) > 6 then raise exception 'Pick between 1 and 6 services'; end if;
  -- abuse guard: max 3 upcoming online bookings per phone
  if (select count(*) from appointments a join clients c on c.id = a.client_id
      where a.salon_id = sa.id and c.phone = v_phone and a.source = 'online' and a.start_at > now() and a.status in ('booked','confirmed')) >= 3 then
    raise exception 'You already have upcoming bookings. Please call the salon to book more.';
  end if;
  select sum(duration_min) into v_minutes from services where salon_id = sa.id and id = any(p_service_ids) and status = 'active' and online_bookable;
  if v_minutes is null then raise exception 'Service not available'; end if;
  v_start := (p_date + p_time::time) at time zone sa.timezone;
  v_end := v_start + make_interval(mins => v_minutes);
  if v_start < now() then raise exception 'That time has passed'; end if;

  select st.id into v_staff from salon_staff st
  where st.salon_id = sa.id and st.status = 'active' and st.bookable and (p_staff is null or st.id = p_staff)
    and _staff_free(st.id, v_start, v_end)
  order by st.sort limit 1;
  if v_staff is null then raise exception 'Sorry, that slot was just taken. Please pick another time.'; end if;

  v_client := _client_by_phone(sa.id, p_name, v_phone, 'online');
  insert into appointments(salon_id, client_id, staff_id, start_at, end_at, source, notes)
  values (sa.id, v_client, v_staff, v_start, v_end, 'online', left(nullif(trim(p_notes),''), 500)) returning id into v_id;
  insert into appointment_services(appointment_id, salon_id, service_id, name, duration_min, price_paise, sort)
  select v_id, sa.id, s.id, s.name, s.duration_min, s.price_paise, row_number() over (order by s.sort)
  from services s where s.salon_id = sa.id and s.id = any(p_service_ids);
  return jsonb_build_object('ref', upper(left(replace(v_id::text,'-',''), 6)), 'salon', sa.name, 'phone', sa.phone,
    'start', to_char(v_start at time zone sa.timezone, 'YYYY-MM-DD"T"HH24:MI'),
    'staff', (select display_name from salon_staff where id = v_staff),
    'total_paise', (select sum(price_paise) from services where id = any(p_service_ids)));
end $$;

-- ───────────── Grants ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.public_salon(text) to anon, authenticated;
grant execute on function public.public_slots(text,date,uuid[],uuid) to anon, authenticated;
grant execute on function public.public_book(text,text,text,date,text,uuid[],uuid,text) to anon, authenticated;
grant execute on function
  public.create_salon(text,text,text), public.claim_invites(), public.my_salons(), public.complete_onboarding(uuid),
  public.save_staff(uuid,uuid,text,text,text,text,text,text,int,int,boolean,smallint[],time,time,text),
  public.save_client(uuid,uuid,text,text,text,text,date,date,text,text[],text,boolean),
  public.book_appointment(uuid,uuid,uuid,timestamptz,uuid[],text,text,uuid,boolean),
  public.set_appointment_status(uuid,uuid,text,text),
  public.checkout(uuid,uuid,uuid,jsonb,bigint,bigint,jsonb,text,uuid),
  public.add_payment(uuid,uuid,text,bigint,text), public.void_invoice(uuid,uuid,text),
  public.adjust_stock(uuid,uuid,numeric,text,text), public.record_expense(uuid,text,bigint,date,text,text),
  public.void_expense(uuid,uuid,text), public.dashboard_summary(uuid), public.sales_report(uuid,date,date),
  public.is_salon_member(uuid), public.has_perm(uuid,text), public.normalize_phone(text)
to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
