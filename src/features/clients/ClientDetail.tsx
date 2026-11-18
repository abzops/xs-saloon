import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Pencil, Phone, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCatalog, useSalon } from '../../app/salon';
import { WhatsAppButton, type ClientLite } from '../../components/salon';
import { BackLink, Empty, Loading, Notice, PushLink, Segmented, Sheet, StatusBadge, initials } from '../../components/ui';
import { dateOf, formatDate, formatDateTime, todayInSalon } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { supabase } from '../../lib/supabase';
import { SOURCE_LABEL, type Client } from '../../lib/types';
import { AppointmentSheet } from '../calendar/CalendarPage';
import { ClientForm, lastSeen } from './ClientsPage';

export function ClientDetail() {
  const { clientId = '' } = useParams();
  const { salon, can } = useSalon();
  const { staffName } = useCatalog();
  const [tab, setTab] = useState<'visits' | 'bills'>('visits');
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const base = `/s/${salon.slug}`;
  const tz = salon.timezone;

  const c = useQuery({
    queryKey: ['client', salon.id, clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
      if (error) throw error;
      return data as Client | null;
    },
  });
  const appts = useQuery({
    queryKey: ['appointments', salon.id, 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id, start_at, status, staff_id, source, appointment_services(name)')
        .eq('client_id', clientId).order('start_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as { id: string; start_at: string; status: string; staff_id: string; source: string; appointment_services: { name: string }[] }[];
    },
  });
  const bills = useQuery({
    queryKey: ['invoices', salon.id, 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('id, invoice_no, created_at, status, total_paise, tip_paise, paid_paise, invoice_items(name)')
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as { id: string; invoice_no: string; created_at: string; status: string; total_paise: number; tip_paise: number; paid_paise: number; invoice_items: { name: string }[] }[];
    },
  });

  if (c.isPending) return <Loading rows={4} />;
  if (c.error) return <Notice tone="bad">{errorMessage(c.error)}</Notice>;
  const d = c.data;
  if (!d) return <Empty title="Client not found" />;
  const upcoming = (appts.data ?? []).filter((a) => Date.parse(a.start_at) > Date.now() && ['booked', 'confirmed'].includes(a.status));
  const due = (bills.data ?? []).filter((b) => ['partial', 'unpaid'].includes(b.status)).reduce((a, b) => a + b.total_paise + b.tip_paise - b.paid_paise, 0);
  const favourites = Object.entries((bills.data ?? []).filter((b) => b.status !== 'void').flatMap((b) => b.invoice_items.map((i) => i.name))
    .reduce<Record<string, number>>((a, n) => ((a[n] = (a[n] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const isBirthdayMonth = d.date_of_birth?.slice(5, 7) === todayInSalon(tz).slice(5, 7);
  const waKind = due > 0 ? 'dues' : isBirthdayMonth ? 'birthday' : d.last_visit_at && Date.now() - Date.parse(d.last_visit_at) > 45 * 864e5 ? 'rebook' : 'hello';

  return (
    <div className="stack xl">
      <BackLink className="btn ghost small" to={`${base}/clients`} style={{ justifySelf: 'start' }}>← Clients</BackLink>
      <div className="detail-head">
        <span className="avatar" aria-hidden>{initials(d.full_name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{d.full_name}</h1>
          <p className="muted">{d.phone} · Client #{d.client_no} · {SOURCE_LABEL[d.source] ?? d.source}</p>
          {d.tags.length > 0 && <div className="row" style={{ marginTop: 6 }}>{d.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        </div>
      </div>
      <div className="row">
        {can('calendar.manage') && <button className="btn primary" onClick={() => setBooking(true)}><CalendarPlus size={18} /> Book</button>}
        {can('billing.create') && <Link className="btn" to={`${base}/sales/new`}><Receipt size={18} /> New bill</Link>}
        <a className="btn" href={`tel:${d.phone}`}><Phone size={18} /> Call</a>
        <WhatsAppButton phone={d.phone} kind={waKind} small={false} facts={{ name: d.full_name, amountPaise: due }} />
        {can('clients.manage') && <button className="btn" onClick={() => setEditing(true)}><Pencil size={18} /> Edit</button>}
      </div>

      <div className="tiles">
        <div className="tile"><span className="label">Visits</span><span className="value num">{d.visit_count}</span><span className="sub">Last: {lastSeen(d.last_visit_at)}</span></div>
        <div className="tile"><span className="label">Lifetime spend</span><span className="value num">{formatINR(d.total_spent_paise)}</span>
          <span className="sub">Avg {formatINR(d.visit_count ? Math.round(d.total_spent_paise / d.visit_count) : 0)}</span></div>
        <div className="tile"><span className="label">Upcoming</span><span className="value num">{upcoming.length}</span>
          <span className="sub">{upcoming[0] ? formatDateTime(upcoming[upcoming.length - 1].start_at, tz) : 'None booked'}</span></div>
        <div className="tile"><span className="label">Balance due</span><span className={`value num ${due > 0 ? 'amount-due' : ''}`}>{formatINR(due)}</span>
          <span className="sub">Since {formatDate(d.created_at.slice(0, 10))}</span></div>
      </div>

      {(d.notes || favourites.length > 0 || d.date_of_birth) && (
        <section className="card">
          <dl className="kv">
            {d.date_of_birth && <><dt>Birthday</dt><dd>{formatDate(d.date_of_birth)}</dd></>}
            {d.anniversary && <><dt>Anniversary</dt><dd>{formatDate(d.anniversary)}</dd></>}
            {favourites.length > 0 && <><dt>Favourites</dt><dd>{favourites.map(([n, k]) => `${n} ×${k}`).join(' · ')}</dd></>}
            {d.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</dd></>}
          </dl>
        </section>
      )}

      <section className="stack">
        <Segmented label="History" value={tab} onChange={setTab} options={[{ value: 'visits', label: 'Appointments' }, { value: 'bills', label: 'Bills' }]} />
        {tab === 'visits' ? (appts.isPending ? <Loading rows={3} /> : !appts.data?.length ? <div className="card"><Empty title="No appointments yet" /></div> : (
          <ul className="list card flush">{appts.data.map((a) => (
            <li key={a.id}><PushLink className="item" to={`${base}/calendar?d=${dateOf(a.start_at, tz)}&a=${a.id}`}>
              <span className="main-col"><span className="title">{a.appointment_services.map((x) => x.name).join(', ')}</span>
                <span className="meta"><span>{formatDateTime(a.start_at, tz)}</span><span>{staffName(a.staff_id)}</span></span></span>
              <span className="end-col"><StatusBadge status={a.status} /></span></PushLink></li>
          ))}</ul>
        )) : (bills.isPending ? <Loading rows={3} /> : !bills.data?.length ? <div className="card"><Empty title="No bills yet" /></div> : (
          <ul className="list card flush">{bills.data.map((b) => (
            <li key={b.id}><PushLink className="item" to={`${base}/sales/${b.id}`}>
              <span className="main-col"><span className="title">{b.invoice_items.map((x) => x.name).join(', ')}</span>
                <span className="meta"><span className="num">{b.invoice_no}</span><span>{formatDateTime(b.created_at, tz)}</span></span></span>
              <span className="end-col"><b className="num">{formatINR(b.total_paise + b.tip_paise)}</b><StatusBadge status={b.status} /></span></PushLink></li>
          ))}</ul>
        ))}
      </section>

      {editing && <Sheet title="Edit client" onClose={() => setEditing(false)}><ClientForm client={d} onDone={() => setEditing(false)} /></Sheet>}
      {booking && <AppointmentSheet init={{ client: d as ClientLite }} onClose={() => setBooking(false)} onSaved={() => setBooking(false)} />}
    </div>
  );
}
