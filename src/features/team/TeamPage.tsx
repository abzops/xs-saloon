import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useCatalog, useRefresh, useSalon } from '../../app/salon';
import { Empty, Field, Loading, Notice, Sheet, initials, useToast } from '../../components/ui';
import { time12 } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { rpc } from '../../lib/supabase';
import { ROLE_LABEL, type Role, type Staff } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, including settings and team',
  manager: 'Everything except settings and team',
  receptionist: 'Calendar, billing, clients and stock',
  stylist: 'Calendar and their own bookings',
};
// Calendar colours: distinct, readable on light and dark surfaces.
const COLORS = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#9B5DE5', '#E0457B', '#00A3B4', '#6B7A8F'];

export function TeamPage() {
  const { can, me } = useSalon();
  const { team, loading, error } = useCatalog();
  const [editing, setEditing] = useState<Partial<Staff> | null>(null);
  const manage = can('staff.manage');
  if (loading) return <Loading rows={4} />;
  if (error) return <Notice tone="bad">{errorMessage(error)}</Notice>;
  const list = [...team].sort((a, b) => (a.status === b.status ? a.sort - b.sort : a.status === 'active' ? -1 : 1));
  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Team</h1>
        {manage && <button className="btn primary" onClick={() => setEditing({})} aria-label="Add team member"><Plus size={18} /> <span className="btn-text">Add member</span></button>}
      </div>
      <p className="muted">Stylists appear as columns in the calendar and on your booking page. Add an email to give someone their own login.</p>
      {!list.length ? <div className="card"><Empty title="No team yet" /></div> : (
        <ul className="list card flush">
          {list.map((s) => (
            <li key={s.id}>
              <button className="item" disabled={!manage} onClick={() => setEditing(s)} style={s.status !== 'active' ? { opacity: 0.55 } : undefined}>
                <span className="avatar" aria-hidden style={{ boxShadow: `inset 0 0 0 2px ${s.color}` }}>{initials(s.display_name)}</span>
                <span className="main-col">
                  <span className="title">{s.display_name}{s.id === me.id && <span className="muted"> (you)</span>}</span>
                  <span className="meta"><span>{s.title || ROLE_LABEL[s.role]}</span>
                    {s.bookable && <span>{s.work_days.length === 7 ? 'Every day' : s.work_days.map((d) => DAYS[d]).join(' ')}{s.work_start && s.work_end ? ` · ${time12(s.work_start.slice(0, 5))}–${time12(s.work_end.slice(0, 5))}` : ''}</span>}
                    {s.commission_bp > 0 && <span>{s.commission_bp / 100}% commission</span>}</span>
                </span>
                <span className="end-col">
                  <span className="badge neutral">{ROLE_LABEL[s.role]}</span>
                  {s.status !== 'active' ? <span className="badge bad">Inactive</span> : s.user_id ? <span className="badge ok">Has login</span> : s.email ? <span className="badge warn">Invite pending</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <StaffSheet s={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffSheet({ s, onClose }: { s: Partial<Staff>; onClose: () => void }) {
  const { salon, me } = useSalon();
  const { team } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const [f, setF] = useState({
    display_name: s.display_name ?? '', role: s.role ?? 'stylist', title: s.title ?? '', phone: s.phone ?? '', email: s.email ?? '',
    color: s.color ?? COLORS[team.length % COLORS.length], commission: s.commission_bp ? String(s.commission_bp / 100) : '',
    pcommission: s.product_commission_bp ? String(s.product_commission_bp / 100) : '', bookable: s.bookable ?? true,
    work_days: s.work_days ?? [1, 2, 3, 4, 5, 6], work_start: s.work_start?.slice(0, 5) ?? '', work_end: s.work_end?.slice(0, 5) ?? '',
  });
  const save = useMutation({
    mutationFn: (status: 'active' | 'inactive') => rpc('save_staff', {
      p_salon: salon.id, p_staff: s.id ?? null, p_display_name: f.display_name.trim(), p_role: f.role, p_title: f.title || null, p_phone: f.phone || null,
      p_email: f.email || null, p_color: f.color, p_commission_bp: Math.round((Number(f.commission) || 0) * 100),
      p_product_commission_bp: Math.round((Number(f.pcommission) || 0) * 100), p_bookable: f.bookable, p_work_days: f.work_days,
      p_work_start: f.work_start || null, p_work_end: f.work_end || null, p_status: status,
    }),
    onSuccess: async () => { await refresh('team'); toast('Team updated'); onClose(); },
  });
  const toggle = (d: number) => setF({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort() });
  return (
    <Sheet title={s.id ? 'Edit team member' : 'Add team member'} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate('active'); }}>
        <div className="grid-2">
          <Field label="Name"><input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
          <Field label="Title (optional)"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Senior Stylist" /></Field>
        </div>
        <Field label="Access" hint={ROLE_HINT[f.role as Role]}>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </Field>
        <div className="grid-2">
          <Field label="Phone (optional)"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Login email (optional)" hint={s.user_id ? 'Linked to an account' : 'They sign up with this email to get access'}>
            <input className="input" type="email" disabled={!!s.user_id} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Service commission %"><input className="input num" inputMode="decimal" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} placeholder="0" /></Field>
          <Field label="Product commission %"><input className="input num" inputMode="decimal" value={f.pcommission} onChange={(e) => setF({ ...f, pcommission: e.target.value })} placeholder="0" /></Field>
        </div>
        <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.bookable} onChange={(e) => setF({ ...f, bookable: e.target.checked })} />
          <span className="grow">Takes appointments (calendar column and online booking)</span></label>
        {f.bookable && (
          <>
            <div className="field"><span>Working days</span>
              <div className="chips">{DAYS.map((d, i) => <button key={d} type="button" className="chip" aria-pressed={f.work_days.includes(i)} onClick={() => toggle(i)}>{d}</button>)}</div></div>
            <div className="grid-2">
              <Field label="Starts" hint="Empty = salon hours"><input className="input" type="time" value={f.work_start} onChange={(e) => setF({ ...f, work_start: e.target.value })} /></Field>
              <Field label="Ends"><input className="input" type="time" value={f.work_end} onChange={(e) => setF({ ...f, work_end: e.target.value })} /></Field>
            </div>
          </>
        )}
        <div className="field"><span>Calendar colour</span>
          <div className="chips">{COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })}
              style={{ width: 34, height: 34, borderRadius: '50%', border: 0, cursor: 'pointer', background: c, boxShadow: f.color === c ? '0 0 0 3px var(--paper), 0 0 0 5px var(--ink)' : 'none' }} />
          ))}</div></div>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || !f.display_name.trim()}>Save</button>
        {s.id && s.id !== me.id && (
          <button type="button" className={s.status === 'active' ? 'btn danger block' : 'btn block'} disabled={save.isPending}
            onClick={() => save.mutate(s.status === 'active' ? 'inactive' : 'active')}>{s.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>
        )}
      </form>
    </Sheet>
  );
}
