import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Phone, Receipt } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCatalog, useRefresh, useSalon } from '../../app/salon';
import { ClientPicker, ReasonSheet, ServicePicker, WhatsAppButton, type ClientLite } from '../../components/salon';
import { Empty, Field, Loading, Notice, Segmented, Sheet, StatusBadge, initials, useToast } from '../../components/ui';
import { addDays, dateOf, dayOfWeek, formatDay, formatTime, minutesOfDay, time12, todayInSalon, zoned } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import { SOURCE_LABEL, type Appointment, type Staff } from '../../lib/types';

const HH = 72; // px per hour
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const CLOSED = ['cancelled', 'no_show'];

export function CalendarPage() {
  const { salon, can } = useSalon();
  const { activeTeam, loading: catLoading } = useCatalog();
  const tz = salon.timezone;
  const [params, setParams] = useSearchParams();
  const today = todayInSalon(tz);
  const date = params.get('d') || today;
  const openId = params.get('a');
  const [form, setForm] = useState<FormInit | null>(params.get('new') ? {} : null);
  const [staffFilter, setStaffFilter] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const set = (k: string, v: string | null) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); p.delete('new'); return p; }, { replace: true });

  const appts = useQuery({
    queryKey: ['appointments', salon.id, 'day', date],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments')
        .select('*, clients(id, full_name, phone, visit_count, tags, notes), appointment_services(*)')
        .eq('salon_id', salon.id).gte('start_at', zoned(date, '00:00', tz).toISOString()).lt('start_at', zoned(addDays(date, 1), '00:00', tz).toISOString())
        .order('start_at');
      if (error) throw error;
      return data as unknown as Appointment[];
    },
    refetchInterval: 60_000,
  });

  const open = toMin(salon.open_time), close = toMin(salon.close_time);
  const list = appts.data ?? [];
  const cols = activeTeam.filter((s) => (s.bookable || list.some((a) => a.staff_id === s.id)) && (!staffFilter || s.id === staffFilter));
  const isToday = date === today;
  const nowMin = minutesOfDay(new Date(), tz);
  const slots: number[] = []; for (let m = open; m < close; m += 15) slots.push(m);
  const dow = dayOfWeek(date);
  const off = (s: Staff, m: number) => !s.work_days.includes(dow) || (!!s.work_start && m < toMin(s.work_start)) || (!!s.work_end && m >= toMin(s.work_end));
  const counts = list.reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] ?? 0) + 1), acc), {});
  const current = list.find((a) => a.id === openId);

  useLayoutEffect(() => {
    if (scroller.current && appts.data) {
      const target = isToday ? nowMin : list.length ? minutesOfDay(list[0].start_at, tz) : open;
      scroller.current.scrollTop = Math.max(0, ((target - open) / 60) * HH - 90);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, !!appts.data]);

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Calendar</h1>
        {can('calendar.manage') && (
          <button className="btn primary" onClick={() => setForm({ date })} aria-label="New appointment">
            <CalendarPlus size={18} /> <span className="btn-text">New appointment</span>
          </button>
        )}
      </div>

      <div className="cal-bar">
        <span className="day-title">{formatDay(date, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        <button className="btn icon-btn" onClick={() => set('d', addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={20} /></button>
        <button className="btn small" disabled={isToday} onClick={() => set('d', null)}>Today</button>
        <button className="btn icon-btn" onClick={() => set('d', addDays(date, 1))} aria-label="Next day"><ChevronRight size={20} /></button>
        <input type="date" className="input" value={date} onChange={(e) => e.target.value && set('d', e.target.value)} aria-label="Pick a date" />
        <select className="input" style={{ width: 'auto', minHeight: 42 }} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Team member">
          <option value="">Whole team</option>
          {activeTeam.filter((s) => s.bookable).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
      </div>

      <div className="cal-summary">
        <span className="badge neutral">{(() => { const n = list.filter((a) => !CLOSED.includes(a.status)).length; return `${n} appointment${n === 1 ? '' : 's'}`; })()}</span>
        {(['booked', 'confirmed', 'arrived', 'in_service', 'completed', 'cancelled', 'no_show'] as const).filter((k) => counts[k]).map((k) => (
          <span key={k} className="row" style={{ gap: 4 }}><StatusBadge status={k} /><span className="muted num" style={{ fontSize: 'var(--t-sm)' }}>{counts[k]}</span></span>
        ))}
      </div>

      {appts.error ? <Notice tone="bad">{errorMessage(appts.error)}</Notice> : (appts.isPending || catLoading) ? <Loading rows={6} /> : !cols.length ? (
        <div className="card"><Empty title="No bookable team members">Add stylists in <Link to={`/s/${salon.slug}/team`}>Team</Link> to start booking.</Empty></div>
      ) : (
        <div className="cal" ref={scroller} style={{ ['--hh' as string]: `${HH}px` }}>
          <div className="cal-head">
            <div className="cal-corner" />
            {cols.map((s) => (
              <div key={s.id} className="cal-colh"><span className="dot" style={{ background: s.color }} />{s.display_name}
                <span className="count num">{list.filter((a) => a.staff_id === s.id && !CLOSED.includes(a.status)).length}</span></div>
            ))}
          </div>
          <div className="cal-body">
            <div className="cal-times">{slots.map((m) => <div key={m}>{m % 60 === 0 && <span>{time12(hhmm(m)).replace(':00', '')}</span>}</div>)}</div>
            {cols.map((s) => (
              <div key={s.id} className="cal-col">
                {slots.map((m) => {
                  const closed = off(s, m);
                  return <div key={m} className={`cal-slot${(m + 15) % 60 === 0 ? ' hour' : ''}${closed ? ' off' : can('calendar.manage') ? ' open' : ''}`}
                    onClick={() => !closed && can('calendar.manage') && setForm({ staff_id: s.id, date, time: hhmm(m) })} />;
                })}
                {list.filter((a) => a.staff_id === s.id).map((a) => {
                  const st = minutesOfDay(a.start_at, tz), en = minutesOfDay(a.end_at, tz) || 24 * 60;
                  const top = ((st - open) / 60) * HH, h = Math.max(((en - st) / 60) * HH - 3, 24);
                  return (
                    <button key={a.id} className={`appt ${a.status}`} style={{ top, height: h, ['--staff' as string]: s.color }} onClick={() => set('a', a.id)}>
                      <b>{a.clients?.full_name}</b>
                      <span className="s">{formatTime(a.start_at, tz)} · {a.appointment_services.map((x) => x.name).join(', ')}</span>
                      {h > 62 && <StatusBadge status={a.status} />}
                    </button>
                  );
                })}
                {isToday && nowMin >= open && nowMin <= close && <div className="now-line" style={{ top: ((nowMin - open) / 60) * HH }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {form && <AppointmentSheet init={form} onClose={() => setForm(null)} onSaved={(d) => { setForm(null); if (d !== date) set('d', d); }} />}
      {current && !form && <AppointmentDetail a={current} onClose={() => set('a', null)}
        onEdit={() => { setForm({ id: current.id, client: current.clients as ClientLite, staff_id: current.staff_id, date: dateOf(current.start_at, tz),
          time: hhmm(minutesOfDay(current.start_at, tz)), service_ids: current.appointment_services.map((x) => x.service_id).filter(Boolean) as string[], notes: current.notes ?? '' }); set('a', null); }} />}
    </div>
  );
}

export type FormInit = { id?: string; client?: ClientLite | null; staff_id?: string; date?: string; time?: string; service_ids?: string[]; notes?: string };

export function AppointmentSheet({ init, onClose, onSaved }: { init: FormInit; onClose: () => void; onSaved: (date: string) => void }) {
  const { salon } = useSalon();
  const { bookable, services } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const tz = salon.timezone;
  const step = salon.slot_minutes || 15;
  const now = minutesOfDay(new Date(), tz);
  const [client, setClient] = useState<ClientLite | null>(init.client ?? null);
  const [serviceIds, setServiceIds] = useState<string[]>(init.service_ids ?? []);
  const [staff, setStaff] = useState(init.staff_id ?? bookable[0]?.id ?? '');
  const [date, setDate] = useState(init.date ?? todayInSalon(tz));
  const [time, setTime] = useState(init.time ?? hhmm(Math.min(Math.max(Math.ceil(now / step) * step, toMin(salon.open_time)), toMin(salon.close_time) - step)));
  const [source, setSource] = useState('walk_in');
  const [notes, setNotes] = useState(init.notes ?? '');
  const [conflict, setConflict] = useState(false);
  const chosen = serviceIds.map((id) => services.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  const minutes = chosen.reduce((a, s) => a + s.duration_min, 0), total = chosen.reduce((a, s) => a + s.price_paise, 0);
  const times: string[] = []; for (let m = toMin(salon.open_time); m < toMin(salon.close_time); m += step) times.push(hhmm(m));
  if (!times.includes(time)) times.unshift(time);

  const save = useMutation({
    mutationFn: (force: boolean) => rpc<string>('book_appointment', {
      p_salon: salon.id, p_client: client!.id, p_staff: staff, p_start: zoned(date, time, tz).toISOString(), p_service_ids: serviceIds,
      p_source: source, p_notes: notes || null, p_appointment: init.id ?? null, p_force: force,
    }),
    onSuccess: async () => { await refresh('appointments', 'dashboard', 'client'); toast(init.id ? 'Appointment updated' : 'Appointment booked'); onSaved(date); },
    onError: (e) => { if (/already has an appointment/.test(errorMessage(e))) setConflict(true); },
  });

  return (
    <Sheet title={init.id ? 'Edit appointment' : 'New appointment'} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate(false); }}>
        <Field label="Client"><ClientPicker value={client} onChange={setClient} /></Field>
        <div className="field"><span>Services</span><ServicePicker value={serviceIds} onChange={setServiceIds} /></div>
        <Field label="Stylist">
          <select className="input" value={staff} onChange={(e) => { setStaff(e.target.value); setConflict(false); }}>
            {bookable.map((s) => <option key={s.id} value={s.id}>{s.display_name}{s.title ? ` — ${s.title}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setConflict(false); }} /></Field>
          <Field label="Time"><select className="input" value={time} onChange={(e) => { setTime(e.target.value); setConflict(false); }}>
            {times.map((t) => <option key={t} value={t}>{time12(t)}</option>)}</select></Field>
        </div>
        {!init.id && (
          <div className="field"><span>Booked via</span>
            <div className="scroll-x"><Segmented label="Booked via" value={source} onChange={setSource}
              options={['walk_in', 'phone', 'whatsapp', 'instagram'].map((k) => ({ value: k, label: SOURCE_LABEL[k] }))} /></div></div>
        )}
        <Field label="Notes (optional)"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferences, allergies, colour formula…" /></Field>
        {conflict && <Notice tone="warn">This stylist is already booked at that time. Pick another time or stylist — or double-book if you're sure.</Notice>}
        {save.error && !conflict && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        {chosen.length > 0 && <div className="total-line"><span className="muted">{minutes} min</span><b className="num">{formatINR(total)}</b></div>}
        <div className="stack">
          <button className="btn primary block xl" disabled={save.isPending || !client || !serviceIds.length || !staff}>
            {save.isPending ? <span className="spinner" /> : init.id ? 'Save changes' : 'Book appointment'}
          </button>
          {conflict && <button type="button" className="btn danger block" disabled={save.isPending} onClick={() => save.mutate(true)}>Double-book anyway</button>}
        </div>
      </form>
    </Sheet>
  );
}

function AppointmentDetail({ a, onClose, onEdit }: { a: Appointment; onClose: () => void; onEdit: () => void }) {
  const { salon, can } = useSalon();
  const { team } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const [closing, setClosing] = useState<null | 'cancelled' | 'no_show'>(null);
  const s = team.find((t) => t.id === a.staff_id);
  const total = a.appointment_services.reduce((x, y) => x + y.price_paise, 0);
  const isOpen = !['completed', 'cancelled', 'no_show'].includes(a.status);
  const canEdit = can('calendar.manage');
  const base = `/s/${salon.slug}`;
  const setStatus = useMutation({
    mutationFn: (p: { status: string; reason?: string }) => rpc('set_appointment_status', { p_salon: salon.id, p_appointment: a.id, p_status: p.status, p_reason: p.reason ?? null }),
    onSuccess: async () => { await refresh('appointments', 'dashboard'); toast('Updated'); },
    onError: (e) => toast(errorMessage(e), 'bad'),
  });
  useEffect(() => { /* keep sheet in sync after refetch */ }, [a.status]);

  return (
    <Sheet title="Appointment" onClose={onClose}>
      <div className="stack lg">
        <div className="detail-head">
          <span className="avatar" aria-hidden>{initials(a.clients?.full_name ?? '?')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link to={`${base}/clients/${a.client_id}`} style={{ textDecoration: 'none' }}><h2 style={{ fontSize: 'var(--t-lg)' }}>{a.clients?.full_name}</h2></Link>
            <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{a.clients?.phone} · {a.clients?.visit_count ? `${a.clients.visit_count} visits` : 'New client'}</p>
          </div>
          <a className="btn icon-btn" href={`tel:${a.clients?.phone}`} aria-label="Call"><Phone size={18} /></a>
        </div>
        <ul className="list grouped">
          <li className="item" style={{ cursor: 'default' }}><span className="main-col"><span className="meta">When</span>
            <span className="title">{formatDay(dateOf(a.start_at, salon.timezone))}, {formatTime(a.start_at, salon.timezone)} – {formatTime(a.end_at, salon.timezone)}</span></span></li>
          <li className="item" style={{ cursor: 'default' }}><span className="main-col"><span className="meta">With</span>
            <span className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="dot" style={{ background: s?.color }} />{s?.display_name}</span></span>
            <span className="end-col"><StatusBadge status={a.status} /><span className="tag">{SOURCE_LABEL[a.source] ?? a.source}</span></span></li>
          {a.appointment_services.map((x) => (
            <li key={x.id} className="item" style={{ cursor: 'default', minHeight: 50 }}><span className="main-col"><span className="title">{x.name}</span></span>
              <span className="muted num">{x.duration_min} min</span><b className="num" style={{ width: 84, textAlign: 'right' }}>{formatINR(x.price_paise)}</b></li>
          ))}
          <li className="item" style={{ cursor: 'default', minHeight: 50 }}><span className="main-col"><span className="title">Estimated total</span></span><b className="num">{formatINR(total)}</b></li>
        </ul>
        {(a.notes || a.clients?.notes) && (
          <Notice tone="info">{a.notes && <div><b>Booking note:</b> {a.notes}</div>}{a.clients?.notes && <div><b>Client note:</b> {a.clients.notes}</div>}</Notice>
        )}
        {a.cancel_reason && <p className="muted">Reason: {a.cancel_reason}</p>}

        {isOpen && canEdit && (
          <div className="row">
            {a.status === 'booked' && <button className="btn" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'confirmed' })}>Confirm</button>}
            {['booked', 'confirmed'].includes(a.status) && <button className="btn" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'arrived' })}>Mark arrived</button>}
            {a.status === 'arrived' && <button className="btn" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'in_service' })}>Start service</button>}
            <button className="btn" onClick={onEdit}><Pencil size={16} /> Reschedule</button>
            {a.clients?.phone && <WhatsAppButton phone={a.clients.phone} kind="reminder" label="Reminder"
              facts={{ name: a.clients.full_name, start: a.start_at, services: a.appointment_services.map((x) => x.name).join(', ') }} />}
          </div>
        )}
        {isOpen && can('billing.create') && (
          <button className="btn primary block xl" onClick={() => navigate(`${base}/sales/new?appt=${a.id}`)}><Receipt size={18} /> Checkout</button>
        )}
        {a.invoice_id && <Link className="btn block" to={`${base}/sales/${a.invoice_id}`}><Receipt size={18} /> View bill</Link>}
        {isOpen && canEdit && (
          <div className="row">
            <button className="btn ghost small" onClick={() => setClosing('no_show')}>Mark no-show</button>
            <button className="btn danger small" onClick={() => setClosing('cancelled')}>Cancel appointment</button>
          </div>
        )}
      </div>
      {closing && <ReasonSheet title={closing === 'cancelled' ? 'Cancel appointment' : 'Mark as no-show'} required={false}
        warning={closing === 'cancelled' ? 'The slot opens up for other bookings.' : 'The client did not come. This is kept on their history.'}
        confirmLabel={closing === 'cancelled' ? 'Cancel appointment' : 'Mark no-show'} onClose={() => setClosing(null)}
        onConfirm={(reason) => setStatus.mutateAsync({ status: closing, reason })} />}
    </Sheet>
  );
}
