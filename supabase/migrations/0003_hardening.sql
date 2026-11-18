-- Applied after 0001/0002: lock search_path on helper, restrict column updates, default function privileges.
alter function public.normalize_phone(text) set search_path = public;
revoke insert, update on public.clients, public.salons from authenticated;
grant update (name, phone, email, address, city, gstin, gst_enabled, gst_rate_bp, prices_include_tax, open_time, close_time,
  slot_minutes, booking_enabled, booking_note, invoice_prefix, updated_at) on public.salons to authenticated;
grant update (full_name, email, gender, date_of_birth, anniversary, notes, tags, marketing_opt_in, status) on public.clients to authenticated;

-- Dashboard: today's collections by payment method (applied as an in-place patch).
do $$ declare d text; begin
  d := pg_get_functiondef('public.dashboard_summary(uuid)'::regprocedure);
  if position('methods_today' in d) = 0 then
    d := replace(d, $r$'bills_today',$r$, $r$'methods_today', (select coalesce(jsonb_object_agg(method, s),'{}') from (select method, sum(amount_paise) s from payments where salon_id = p_salon and status = 'ok' and created_at >= v_start and created_at < v_end group by method) m),
    'bills_today',$r$);
    execute d;
  end if;
end $$;
