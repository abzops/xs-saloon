import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, ChevronRight, Gift, IndianRupee, Link2, Package, Plus, Search, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useCatalog, useSalon } from '../../app/salon';
import { Empty, Loading, Notice, PushLink, StatusBadge, initials, useToast } from '../../components/ui';
import { dateOf, formatDay, formatTime } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import type { Appointment } from '../../lib/types';
import './dashboard.css';

type Summary = {
  today: string; revenue_today: number; collected_today: number; bills_today: number; methods_today: Record<string, number>;
  revenue_month: number; expenses_month: number; appts_today: number; appts_by_status: Record<string, number>; online_today: number;
  new_clients_month: number; clients_total: number; dues_paise: number; low_stock: number;
  birthdays_week: { id: string; name: string; phone: string; date: string }[]; last7: { d: string; v: number }[];
};

function greeting(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard() {
  const { salon, can } = useSalon();
  const { staffName } = useCatalog();
  const toast = useToast();
  const base = `/s/${salon.slug}`;
  const summary = useQuery({
    queryKey: ['dashboard', salon.id],
    queryFn: () => rpc<Summary>('dashboard_summary', { p_salon: salon.id }),
    refetchInterval: 60_000,
  });
  const upNext = useQuery({
    queryKey: ['appointments', salon.id, 'up-next'],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments')
        .select('id, start_at, end_at, status, source, staff_id, clients(id, full_name, phone, visit_count), appointment_services(name)')
        .eq('salon_id', salon.id).gte('end_at', new Date().toISOString()).lte('start_at', new Date(Date.now() + 36 * 3600e3).toISOString())
        .in('status', ['booked', 'confirmed', 'arrived', 'in_service']).order('start_at').limit(8);
      if (error) throw error;
      return data as unknown as Appointment[];
    },
    refetchInterval: 60_000,
  });

  if (summary.isPending) return <Loading rows={6} />;
  if (summary.error) return <Notice tone="bad">{errorMessage(summary.error)}</Notice>;
  const s = summary.data;
  const day = formatDay(s.today, { weekday: 'long', day: 'numeric', month: 'long' });
  const m = s.methods_today ?? {};
  const cash = m.cash ?? 0, upi = m.upi ?? 0, other = (m.card ?? 0) + (m.bank ?? 0) + (m.other ?? 0);
  const total = cash + upi + other;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  const st = s.appts_by_status ?? {};
  const upcoming = (st.booked ?? 0) + (st.confirmed ?? 0);
  const link = `${window.location.origin}/book/${salon.slug}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Booking link copied'); }
    catch { window.prompt('Copy your booking link', link); }
  };

  return (
    <div className="dash">
      <header className="dash-head">
        <p>{day}</p>
        <h1>{greeting(salon.timezone)}</h1>
      </header>

      <nav className="quick" aria-label="Quick actions">
        {can('billing.create') && <Link className="q primary" to={`${base}/sales/new`}><span className="q-ico"><Plus size={22} /></span><span>New bill</span></Link>}
        {can('calendar.manage') && <Link className="q" to={`${base}/calendar?new=1`}><span className="q-ico"><CalendarPlus size={21} /></span><span>Book</span></Link>}
        <Link className="q" to={`${base}/clients`}><span className="q-ico"><Search size={21} /></span><span>Find client</span></Link>
        <button type="button" className="q" onClick={copy} style={{ border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }}>
          <span className="q-ico"><Link2 size={21} /></span><span>Share link</span>
        </button>
      </nav>

      <PushLink className="hero-card" to={can('billing.create') ? `${base}/sales` : `${base}/calendar`}>
        <span className="hc-top"><span>Sales today · {s.bills_today} bill{s.bills_today === 1 ? '' : 's'}</span><ChevronRight size={18} /></span>
        <span className="hc-value num">{formatINR(s.revenue_today)}</span>
        <span className="paybar" aria-hidden>
          <i className="s-cash" style={{ width: pct(cash) }} />
          <i className="s-upi" style={{ width: pct(upi) }} />
          <i className="s-other" style={{ width: pct(other) }} />
        </span>
        <span className="legend">
          <span><i className="s-cash" />Cash <b className="num">{formatINR(cash)}</b></span>
          <span><i className="s-upi" />UPI <b className="num">{formatINR(upi)}</b></span>
          {other > 0 && <span><i className="s-other" />Card & other <b className="num">{formatINR(other)}</b></span>}
        </span>
      </PushLink>

      <section className="stats" aria-label="Today at a glance">
        <PushLink className="stat" to={`${base}/calendar`}>
          <span className="st-label"><CalendarDays size={16} />Appointments</span>
          <span className="st-value num">{s.appts_today}</span>
          <span className="st-sub">{upcoming} upcoming · {s.online_today} online</span>
        </PushLink>
        <PushLink className="stat" to={`${base}/clients`}>
          <span className="st-label"><UserPlus size={16} />New clients</span>
          <span className="st-value num">{s.new_clients_month}</span>
          <span className="st-sub">this month · {s.clients_total} total</span>
        </PushLink>
        <PushLink className="stat" to={`${base}/sales?filter=due`}>
          <span className="st-label"><IndianRupee size={16} className={s.dues_paise > 0 ? 'tone-bad' : undefined} />Dues</span>
          <span className={`st-value num ${s.dues_paise > 0 ? 'due' : ''}`}>{formatINR(s.dues_paise)}</span>
          <span className="st-sub">balance to collect</span>
        </PushLink>
        <PushLink className="stat" to={`${base}/inventory?low=1`}>
          <span className="st-label"><Package size={16} className={s.low_stock > 0 ? 'tone-warn' : undefined} />Low stock</span>
          <span className="st-value num">{s.low_stock}</span>
          <span className="st-sub">products to reorder</span>
        </PushLink>
      </section>

      <section className="month">
        <h2>This month</h2>
        <ul className="ios-list">
          <li><span>Sales</span><b className="num">{formatINR(s.revenue_month)}</b></li>
          <li><span>Expenses</span><b className="num neg">−{formatINR(s.expenses_month)}</b></li>
          <li className="total"><span>Net</span><b className="num">{formatINR(s.revenue_month - s.expenses_month)}</b></li>
          {can('reports.view') && <li><Link to={`${base}/reports`}><span>Reports</span><ChevronRight size={16} /></Link></li>}
        </ul>
        {s.birthdays_week.length > 0 && (
          <>
            <h2 style={{ marginTop: 22 }}>Birthdays this week</h2>
            <ul className="ios-list people">
              {s.birthdays_week.map((b) => (
                <li key={b.id}>
                  <PushLink to={`${base}/clients/${b.id}`}>
                    <span className="avatar" aria-hidden><Gift size={17} /></span>
                    <span className="who"><b>{b.name}</b><small>{b.phone}</small></span>
                    <span className="when num">{formatDay(`${s.today.slice(0, 4)}${b.date.slice(4)}`, { day: 'numeric', month: 'short' })}</span>
                  </PushLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="recent">
        <h2>Up next</h2>
        {upNext.isPending ? <Loading rows={3} /> : !upNext.data?.length ? (
          <div className="ios-list"><Empty title="Nothing booked for the next day">
            {can('calendar.manage') && <Link className="btn small" to={`${base}/calendar?new=1`}><Users size={16} /> Book a client</Link>}
          </Empty></div>
        ) : (
          <ul className="ios-list people">
            {upNext.data.map((a) => (
              <li key={a.id}>
                <PushLink to={`${base}/calendar?d=${dateOf(a.start_at, salon.timezone)}&a=${a.id}`}>
                  <span className="avatar" aria-hidden>{initials(a.clients?.full_name ?? '?')}</span>
                  <span className="who"><b>{a.clients?.full_name}</b>
                    <small>{a.appointment_services.map((x) => x.name).join(', ')} · {staffName(a.staff_id)}</small></span>
                  <span className="when" style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                    <span className="num">{formatTime(a.start_at, salon.timezone)}</span>
                    <StatusBadge status={a.status} />
                  </span>
                </PushLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
