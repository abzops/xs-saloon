-- Fills a salon with realistic demo data (for pitching). Owner/settings permission only; refuses salons with >20 clients.
create or replace function public.seed_demo_data(p_salon uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sa salons; v_staff uuid[] := '{}'; v_cat uuid; v_svc uuid[]; v_prod uuid[]; v_clients uuid[] := '{}'; v_cid uuid;
  first_f text[] := array['Anjali','Lakshmi','Meera','Aparna','Divya','Fathima','Nimisha','Sreya','Gayathri','Ananya','Riya','Sneha','Aishwarya','Neha','Keerthana','Haritha','Shilpa','Nayana','Ameena','Parvathy'];
  first_m text[] := array['Arjun','Rahul','Vishnu','Akhil','Nikhil','Adarsh','Sreejith','Faisal','Jithin','Abhijith','Rohan','Midhun','Anand','Joel','Sanjay'];
  last_n text[] := array['Nair','Menon','Pillai','K','Thomas','Joseph','Varghese','Krishnan','Rajan','Mathew','Kurian','Das','Babu','S','Raj'];
  i int; j int; k int; v_day date; v_start timestamptz; v_inv uuid; v_no int; v_total bigint; v_appt uuid; v_n int; v_pick uuid; v_st uuid;
  v_svcrow services; v_today date; v_status text; v_method text; v_name text; v_gender text;
begin
  perform require_perm(p_salon, 'settings.manage');
  select * into sa from salons where id = p_salon for update;
  if (select count(*) from clients where salon_id = p_salon) > 20 then raise exception 'Demo data can only be added to a new salon'; end if;
  v_today := (now() at time zone sa.timezone)::date;

  update salons set address = coalesce(address, 'MG Road, Ravipuram'), city = coalesce(city, 'Kochi'), phone = coalesce(phone, '+919847000000'),
    booking_note = coalesce(booking_note, 'Please arrive 5 minutes early. Free parking available.') where id = p_salon;

  insert into salon_staff(salon_id, display_name, role, title, color, commission_bp, product_commission_bp, work_days, sort) values
    (p_salon, 'Anu Thomas', 'stylist', 'Senior Stylist', '#f9a8d4', 1500, 1000, '{1,2,3,4,5,6}', 1),
    (p_salon, 'Rinu Joseph', 'stylist', 'Hair Colour Expert', '#93c5fd', 1500, 1000, '{0,1,2,3,4,5}', 2),
    (p_salon, 'Sajith Kumar', 'stylist', 'Barber & Grooming', '#86efac', 1200, 1000, '{0,2,3,4,5,6}', 3),
    (p_salon, 'Meghna R', 'stylist', 'Skin & Bridal', '#c4b5fd', 1800, 1000, '{1,2,3,4,5,6}', 4);
  select array_agg(id order by sort) into v_staff from salon_staff where salon_id = p_salon and role = 'stylist' and bookable;

  select id into v_cat from service_categories where salon_id = p_salon and name = 'Hair' limit 1;
  if v_cat is not null then
    insert into services(salon_id, category_id, name, duration_min, price_paise, sort, description) values
      (p_salon, v_cat, 'Keratin Treatment', 150, 450000, 4, 'Smooth, frizz-free hair for months'),
      (p_salon, v_cat, 'Root Touch-up', 60, 120000, 5, null),
      (p_salon, v_cat, 'Hair Spa', 60, 150000, 6, 'Deep conditioning with head massage');
  end if;
  insert into service_categories(salon_id, name, sort) values (p_salon, 'Nails', 4) returning id into v_cat;
  insert into services(salon_id, category_id, name, duration_min, price_paise, sort) values
    (p_salon, v_cat, 'Classic Manicure', 30, 60000, 1), (p_salon, v_cat, 'Spa Pedicure', 45, 90000, 2), (p_salon, v_cat, 'Gel Polish', 45, 110000, 3);
  insert into service_categories(salon_id, name, sort) values (p_salon, 'Bridal', 5) returning id into v_cat;
  insert into services(salon_id, category_id, name, duration_min, price_paise, sort, description) values
    (p_salon, v_cat, 'Bridal Makeup (HD)', 180, 1800000, 1, 'Includes hairstyling and draping'),
    (p_salon, v_cat, 'Party Makeup', 90, 350000, 2, null);
  select array_agg(id) into v_svc from services where salon_id = p_salon and status = 'active' and price_paise < 1000000;

  insert into products(salon_id, name, brand, kind, price_paise, cost_paise, stock_qty, reorder_level, unit) values
    (p_salon, 'Argan Oil Shampoo 250ml', 'L''Oréal Professionnel', 'retail', 95000, 62000, 14, 4, 'bottle'),
    (p_salon, 'Keratin Conditioner 200ml', 'Matrix', 'retail', 78000, 50000, 9, 4, 'bottle'),
    (p_salon, 'Hair Serum 100ml', 'Streax Pro', 'retail', 45000, 26000, 3, 4, 'bottle'),
    (p_salon, 'Beard Oil 30ml', 'Beardo', 'retail', 39900, 22000, 11, 3, 'bottle'),
    (p_salon, 'Sunscreen SPF 50', 'Lotus Herbals', 'retail', 59500, 38000, 7, 3, 'tube'),
    (p_salon, 'Hair Colour Tube', 'Wella Koleston', 'consumable', 0, 32000, 26, 10, 'tube'),
    (p_salon, 'Developer 1L', 'Wella', 'consumable', 0, 54000, 4, 2, 'bottle');
  select array_agg(id) into v_prod from products where salon_id = p_salon and kind = 'retail';

  for i in 1..64 loop
    if random() < 0.68 then v_name := first_f[1 + floor(random()*array_length(first_f,1))::int] || ' ' || last_n[1 + floor(random()*array_length(last_n,1))::int]; v_gender := 'female';
    else v_name := first_m[1 + floor(random()*array_length(first_m,1))::int] || ' ' || last_n[1 + floor(random()*array_length(last_n,1))::int]; v_gender := 'male'; end if;
    update salons set client_seq = client_seq + 1 where id = p_salon returning client_seq into v_n;
    insert into clients(salon_id, client_no, full_name, phone, gender, date_of_birth, source, tags, created_at)
    values (p_salon, v_n, v_name, '+919' || lpad((floor(random()*1000000000))::bigint::text, 9, '0'), v_gender,
      case when random() < 0.6 then (v_today - (18 + floor(random()*30))::int * 365 - floor(random()*365)::int) end,
      (array['walk_in','walk_in','phone','instagram','whatsapp','referral','online'])[1 + floor(random()*7)::int],
      case when random() < 0.12 then '{VIP}'::text[] when random() < 0.08 then '{Bridal}'::text[] else '{}' end,
      now() - (floor(random()*120) || ' days')::interval)
    on conflict do nothing returning id into v_cid;
    if v_cid is not null then v_clients := v_clients || v_cid; end if;
  end loop;

  for k in reverse 45..1 loop
    v_day := v_today - k;
    v_n := 4 + floor(random()*7)::int + case when extract(dow from v_day) in (0,6) then 4 else 0 end;
    for i in 1..v_n loop
      v_st := v_staff[1 + floor(random()*array_length(v_staff,1))::int];
      v_start := (v_day + time '10:00' + ((floor(random()*20))*30 || ' minutes')::interval) at time zone sa.timezone;
      v_cid := v_clients[1 + floor(random()*array_length(v_clients,1))::int];
      v_pick := v_svc[1 + floor(random()*array_length(v_svc,1))::int]; select * into v_svcrow from services where id = v_pick;
      v_status := case when random() < 0.05 then 'no_show' when random() < 0.05 then 'cancelled' else 'completed' end;
      insert into appointments(salon_id, client_id, staff_id, start_at, end_at, status, source, created_at)
      values (p_salon, v_cid, v_st, v_start, v_start + make_interval(mins => v_svcrow.duration_min), v_status,
        (array['walk_in','phone','online','whatsapp','instagram'])[1 + floor(random()*5)::int], v_start - interval '1 day') returning id into v_appt;
      insert into appointment_services(appointment_id, salon_id, service_id, name, duration_min, price_paise)
      values (v_appt, p_salon, v_svcrow.id, v_svcrow.name, v_svcrow.duration_min, v_svcrow.price_paise);
      if v_status = 'completed' then
        update salons set invoice_seq = invoice_seq + 1 where id = p_salon returning invoice_seq into v_no;
        v_total := v_svcrow.price_paise;
        v_method := (array['upi','upi','upi','cash','cash','card'])[1 + floor(random()*6)::int];
        insert into invoices(salon_id, invoice_no, client_id, appointment_id, status, subtotal_paise, taxable_paise, total_paise, paid_paise, created_at)
        values (p_salon, sa.invoice_prefix || '-' || to_char(v_start + interval '1 hour', 'YYMM') || '-' || lpad(v_no::text, 4, '0'), v_cid, v_appt, 'paid', v_total, v_total, v_total, v_total, v_start + make_interval(mins => v_svcrow.duration_min))
        returning id into v_inv;
        insert into invoice_items(invoice_id, salon_id, kind, ref_id, name, staff_id, qty, unit_price_paise, total_paise, commission_paise)
        select v_inv, p_salon, 'service', v_svcrow.id, v_svcrow.name, v_st, 1, v_svcrow.price_paise, v_svcrow.price_paise, round(v_svcrow.price_paise * st.commission_bp / 10000.0) from salon_staff st where st.id = v_st;
        if random() < 0.18 then
          v_pick := v_prod[1 + floor(random()*array_length(v_prod,1))::int];
          insert into invoice_items(invoice_id, salon_id, kind, ref_id, name, staff_id, qty, unit_price_paise, total_paise, commission_paise)
          select v_inv, p_salon, 'product', p.id, p.name, v_st, 1, p.price_paise, p.price_paise, round(p.price_paise * 0.1) from products p where p.id = v_pick;
          select v_total + price_paise into v_total from products where id = v_pick;
          update invoices set subtotal_paise = v_total, taxable_paise = v_total, total_paise = v_total, paid_paise = v_total where id = v_inv;
        end if;
        insert into payments(salon_id, invoice_id, method, amount_paise, created_at) values (p_salon, v_inv, v_method, v_total, v_start + make_interval(mins => v_svcrow.duration_min));
        update appointments set invoice_id = v_inv where id = v_appt;
        update clients set visit_count = visit_count + 1, total_spent_paise = total_spent_paise + v_total,
          last_visit_at = greatest(coalesce(last_visit_at, v_start), v_start) where id = v_cid;
      end if;
    end loop;
  end loop;

  update invoices set paid_paise = paid_paise / 2, status = 'partial'
   where id = (select id from invoices where salon_id = p_salon order by created_at desc limit 1);
  update payments set amount_paise = amount_paise / 2
   where invoice_id = (select id from invoices where salon_id = p_salon order by created_at desc limit 1);

  for k in 0..3 loop
    v_day := v_today + k;
    for j in 1..array_length(v_staff,1) loop
      for i in 0..3 loop
        if random() < 0.7 then
          v_start := (v_day + time '10:00' + ((i * 150 + floor(random()*3)*30) || ' minutes')::interval) at time zone sa.timezone;
          v_pick := v_svc[1 + floor(random()*array_length(v_svc,1))::int]; select * into v_svcrow from services where id = v_pick;
          v_cid := v_clients[1 + floor(random()*array_length(v_clients,1))::int];
          v_status := case when v_start < now() - interval '1 hour' then 'arrived' when v_start < now() + interval '30 minutes' then 'in_service' when random() < 0.5 then 'confirmed' else 'booked' end;
          if not exists (select 1 from appointments a where a.staff_id = v_staff[j] and a.start_at < v_start + make_interval(mins => v_svcrow.duration_min) and a.end_at > v_start) then
            insert into appointments(salon_id, client_id, staff_id, start_at, end_at, status, source)
            values (p_salon, v_cid, v_staff[j], v_start, v_start + make_interval(mins => v_svcrow.duration_min), v_status,
              (array['walk_in','phone','online','whatsapp'])[1 + floor(random()*4)::int]) returning id into v_appt;
            insert into appointment_services(appointment_id, salon_id, service_id, name, duration_min, price_paise)
            values (v_appt, p_salon, v_svcrow.id, v_svcrow.name, v_svcrow.duration_min, v_svcrow.price_paise);
          end if;
        end if;
      end loop;
    end loop;
  end loop;

  insert into expenses(salon_id, category, amount_paise, expense_date, method, description) values
    (p_salon, 'Rent', 4500000, date_trunc('month', v_today)::date, 'bank', 'Monthly rent'),
    (p_salon, 'Electricity', 820000, v_today - 6, 'upi', 'KSEB bill'),
    (p_salon, 'Products & supplies', 1240000, v_today - 12, 'upi', 'Wella stock'),
    (p_salon, 'Marketing', 300000, v_today - 3, 'card', 'Instagram ads'),
    (p_salon, 'Internet & phone', 119900, v_today - 9, 'upi', null);

  perform log_audit(p_salon, 'seed', 'salon', p_salon, null);
  return jsonb_build_object('clients', array_length(v_clients,1), 'appointments', (select count(*) from appointments where salon_id = p_salon),
    'invoices', (select count(*) from invoices where salon_id = p_salon));
end $$;
revoke execute on function public.seed_demo_data(uuid) from public, anon;
grant execute on function public.seed_demo_data(uuid) to authenticated;
