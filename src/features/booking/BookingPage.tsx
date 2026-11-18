// Public online booking: /book/<salon-slug>. No sign-in. Uses only the three
// public database functions (public_salon, public_slots, public_book).
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { waLink } from '../../components/salon';
import { Empty, Field, Logo, Notice } from '../../components/ui';
import { addDays, formatDay, time12 } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { supabase } from '../../lib/supabase';

type PublicSalon = {
  name: string; slug: string; phone: string | null; address: string | null; city: string | null; note: string | null;
  open_time: string; close_time: string; timezone: string; today: string;
  categories: { id: string; name: string }[];
  services: { id: string; name: string; category_id: string | null; description: string | null; duration_min: number; price_paise: number }[];
  staff: { id: string; name: string; title: string | null; color: string }[];
};
type Booked = { ref: string; salon: string; phone: string | null; start: string; staff: string; total_paise: number };

export function BookingPage() {
  const { slug = '' } = useParams();
  const [sel, setSel] = useState<string[]>([]);
  const [staff, setStaff] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [cat, setCat] = useState('all');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Booked | null>(null);

  const salon = useQuery({
    queryKey: ['public-salon', slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_salon', { p_slug: slug });
      if (error) throw error;
      return data as PublicSalon | null;
    },
  });
  const s = salon.data;
  useEffect(() => { if (s) { setDate((d) => d ?? s.today); document.title = `Book at ${s.name}`; } }, [s]);

  const slots = useQuery({
    queryKey: ['public-slots', slug, date, sel.join(','), staff],
    enabled: !!s && !!date && sel.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_slots', { p_slug: slug, p_date: date, p_service_ids: sel, p_staff: staff || null });
      if (error) throw error;
      return data as string[];
    },
  });
  useEffect(() => { setTime(null); }, [date, staff, sel.join(',')]);

  const book = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('public_book', { p_slug: slug, p_name: name.trim(), p_phone: phone, p_date: date, p_time: time,
        p_service_ids: sel, p_staff: staff || null, p_notes: note || null });
      if (error) throw error;
      return data as Booked;
    },
    onSuccess: (b) => { setDone(b); window.scrollTo(0, 0); },
    onError: () => { void slots.refetch(); },
  });

  if (salon.isPending) return <div className="center-screen" aria-busy="true"><span className="spinner" /></div>;
  if (salon.error) return <div className="center-screen"><Notice tone="bad">{errorMessage(salon.error)}</Notice></div>;
  if (!s) return <div className="center-screen"><Empty title="Booking unavailable"><p>This salon isn't taking online bookings right now.</p></Empty></div>;

  const chosen = sel.map((id) => s.services.find((x) => x.id === id)).filter((x): x is PublicSalon['services'][number] => !!x);
  const total = chosen.reduce((a, x) => a + x.price_paise, 0), minutes = chosen.reduce((a, x) => a + x.duration_min, 0);
  const days = Array.from({ length: 14 }, (_, i) => addDays(s.today, i));
  const cats = s.categories.filter((c) => s.services.some((x) => x.category_id === c.id));
  const visible = s.services.filter((x) => cat === 'all' || x.category_id === cat);
  const step = (n: number) => (s.staff.length > 1 ? n : n - 1);
  const ready = chosen.length > 0 && !!date && !!time && name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10;

  if (done) {
    const [d, t] = done.start.split('T');
    return (
      <div className="bk">
        <div className="stack lg" style={{ textAlign: 'center', paddingTop: 40 }}>
          <span className="done-mark"><Check size={34} /></span>
          <h1>You're booked</h1>
          <p className="muted">See you at {done.salon}.</p>
        </div>
        <ul className="ios-list" style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--paper)', borderRadius: 18 }}>
          {[['When', `${formatDay(d)}, ${time12(t)}`], ['With', done.staff], ['Services', chosen.map((x) => x.name).join(', ')], ['Estimated', formatINR(done.total_paise)], ['Booking ref', done.ref]]
            .map(([k, v]) => <li key={k} className="item" style={{ cursor: 'default', minHeight: 52 }}><span className="main-col"><span className="meta">{k}</span></span><b style={{ textAlign: 'right' }}>{v}</b></li>)}
        </ul>
        {done.phone && <a className="btn block wa" href={waLink(done.phone, `Hi, I just booked online (ref ${done.ref}) for ${formatDay(d)} at ${time12(t)}.`)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={18} /> Message the salon</a>}
        <button className="btn ghost block" onClick={() => { setDone(null); setSel([]); setTime(null); }}>Book another appointment</button>
        <div className="bk-foot"><Logo width={96} /></div>
      </div>
    );
  }

  return (
    <div className="bk">
      <header className="bk-hero">
        <div className="who">
          <span className="mark" aria-hidden>{s.name.slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{s.name}</h1>
            <p className="muted">{[s.address, s.city].filter(Boolean).join(', ')} · Open {time12(s.open_time.slice(0, 5))} – {time12(s.close_time.slice(0, 5))}</p>
          </div>
        </div>
        {s.note && <Notice tone="info">{s.note}</Notice>}
        {s.phone && <a className="btn small" style={{ justifySelf: 'start' }} href={`tel:${s.phone}`}><Phone size={16} /> {s.phone}</a>}
      </header>

      <section className="stack">
        <h2 className="bk-step"><i>1</i>Choose services</h2>
        {cats.length > 1 && (
          <div className="chips">
            <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
            {cats.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
        )}
        {visible.map((x) => {
          const on = sel.includes(x.id);
          return (
            <button key={x.id} type="button" className="svc-card" aria-pressed={on} onClick={() => setSel(on ? sel.filter((y) => y !== x.id) : [...sel, x.id])}>
              <span className="tick">{on && <Check size={15} />}</span>
              <span className="grow"><b>{x.name}</b><small>{x.duration_min} min{x.description ? ` · ${x.description}` : ''}</small></span>
              <b className="num">{formatINR(x.price_paise)}</b>
            </button>
          );
        })}
      </section>

      {chosen.length > 0 && (
        <>
          {s.staff.length > 1 && (
            <section className="stack">
              <h2 className="bk-step"><i>2</i>Stylist</h2>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!staff} onClick={() => setStaff('')}>Any available</button>
                {s.staff.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={staff === x.id} onClick={() => setStaff(x.id)}>{x.name}</button>)}
              </div>
            </section>
          )}
          <section className="stack">
            <h2 className="bk-step"><i>{step(3)}</i>Date and time</h2>
            <div className="days">
              {days.map((d) => (
                <button key={d} type="button" className="day" aria-pressed={d === date} onClick={() => setDate(d)}>
                  <span>{formatDay(d, { weekday: 'short' })}</span><b>{Number(d.slice(8))}</b><span>{formatDay(d, { month: 'short' })}</span>
                </button>
              ))}
            </div>
            {slots.isFetching && !slots.data ? <div className="row"><span className="spinner" /><span className="muted">Finding free times…</span></div>
              : slots.data && !slots.data.length ? <Notice tone="info">No free times on this day. Try another date{staff ? ' or “Any available”' : ''}.</Notice>
              : slots.data && <div className="slots">{slots.data.map((t) => <button key={t} type="button" className="slot" aria-pressed={time === t} onClick={() => setTime(t)}>{time12(t)}</button>)}</div>}
          </section>
          {time && (
            <section className="stack">
              <h2 className="bk-step"><i>{step(4)}</i>Your details</h2>
              <div className="card stack lg">
                <div className="grid-2">
                  <Field label="Name"><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label="Mobile number"><input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" /></Field>
                </div>
                <Field label="Anything we should know? (optional)"><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                {book.error && <Notice tone="bad">{errorMessage(book.error)}</Notice>}
              </div>
            </section>
          )}
        </>
      )}

      <div className="bk-foot"><Logo width={96} /></div>

      {chosen.length > 0 && (
        <div className="bk-bar">
          <span className="sum"><b className="num">{formatINR(total)}</b>
            <small>{chosen.length} service{chosen.length > 1 ? 's' : ''} · {minutes} min{time && date ? ` · ${formatDay(date, { day: 'numeric', month: 'short' })}, ${time12(time)}` : ''}</small></span>
          <button className="btn primary" disabled={!ready || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? <span className="spinner" /> : time ? 'Confirm booking' : 'Pick a time'}
          </button>
        </div>
      )}
    </div>
  );
}
