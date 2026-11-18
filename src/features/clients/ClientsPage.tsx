import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useRefresh, useSalon } from '../../app/salon';
import { Collapse, Empty, Field, Loading, Notice, PushLink, Segmented, Sheet, initials, useToast } from '../../components/ui';
import { todayInSalon } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import type { Client } from '../../lib/types';

type Filter = 'all' | 'new' | 'regular' | 'lapsed' | 'birthday';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'regular', label: 'Regulars' },
  { value: 'lapsed', label: 'Not seen 60d' }, { value: 'birthday', label: 'Birthdays' },
];

export function lastSeen(iso: string | null) {
  if (!iso) return 'No visits yet';
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  if (d < 1) return 'Today';
  if (d < 2) return 'Yesterday';
  if (d < 30) return `${Math.floor(d)} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

export function ClientsPage() {
  const { salon, can } = useSalon();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) || 'all';
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const base = `/s/${salon.slug}`;

  const clients = useQuery({
    queryKey: ['clients', salon.id, filter, q],
    queryFn: async () => {
      let query = supabase.from('clients').select('id, client_no, full_name, phone, visit_count, total_spent_paise, last_visit_at, tags, date_of_birth, created_at')
        .eq('salon_id', salon.id).neq('status', 'archived');
      if (filter === 'new') query = query.gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString());
      if (filter === 'regular') query = query.gte('visit_count', 5);
      if (filter === 'lapsed') query = query.lt('last_visit_at', new Date(Date.now() - 60 * 864e5).toISOString());
      if (filter === 'birthday') query = query.not('date_of_birth', 'is', null);
      const s = q.replace(/[%,()]/g, '');
      if (s) { const digits = s.replace(/\D/g, ''); query = digits.length >= 3 ? query.ilike('phone', `%${digits}%`) : query.ilike('full_name', `%${s}%`); }
      const { data, error } = await query.order(filter === 'regular' ? 'total_spent_paise' : 'created_at', { ascending: false }).limit(300);
      if (error) throw error;
      let rows = data as Client[];
      if (filter === 'birthday') { const m = todayInSalon(salon.timezone).slice(5, 7); rows = rows.filter((r) => r.date_of_birth?.slice(5, 7) === m); }
      return rows;
    },
  });

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Clients</h1>
        {can('clients.manage') && <button className="btn primary" onClick={() => setAdding(true)} aria-label="Add client"><Plus size={18} /> <span className="btn-text">Add client</span></button>}
      </div>
      <div className="stack">
        <div className="search"><Search size={18} />
          <input className="input" type="search" placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" /></div>
        <div className="scroll-x"><Segmented label="Filter clients" value={filter} options={FILTERS}
          onChange={(v) => setParams((p) => { p.set('filter', v); return p; }, { replace: true })} /></div>
      </div>
      {clients.isPending ? <Loading /> : clients.error ? <Notice tone="bad">{errorMessage(clients.error)}</Notice> : clients.data.length === 0 ? (
        <div className="card"><Empty title={search ? 'No clients match' : 'No clients here yet'}>
          {!search && filter === 'all' && <p>Clients are added when you book or bill — or add one now.</p>}</Empty></div>
      ) : (
        <ul className="list card flush">
          {clients.data.map((c) => (
            <li key={c.id}>
              <PushLink className="item" to={`${base}/clients/${c.id}`}>
                <span className="avatar" aria-hidden>{initials(c.full_name)}</span>
                <span className="main-col">
                  <span className="title">{c.full_name}{c.tags.includes('VIP') && <span className="tag" style={{ marginLeft: 8 }}>VIP</span>}</span>
                  <span className="meta"><span>{c.phone}</span><span>{c.visit_count} visit{c.visit_count === 1 ? '' : 's'}</span></span>
                </span>
                <span className="end-col">
                  <b className="num">{formatINR(c.total_spent_paise)}</b>
                  <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{lastSeen(c.last_visit_at)}</span>
                </span>
              </PushLink>
            </li>
          ))}
        </ul>
      )}
      {clients.data?.length === 300 && <p className="muted">Showing the first 300. Search to narrow down.</p>}
      {adding && <Sheet title="New client" onClose={() => setAdding(false)}>
        <ClientForm onDone={(id) => { setAdding(false); if (id) navigate(`${base}/clients/${id}`); }} />
      </Sheet>}
    </div>
  );
}

export function ClientForm({ client, onDone }: { client?: Client; onDone: (id?: string) => void }) {
  const { salon } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [f, setF] = useState({
    full_name: client?.full_name ?? '', phone: client?.phone ?? '', email: client?.email ?? '', gender: client?.gender ?? '',
    date_of_birth: client?.date_of_birth ?? '', anniversary: client?.anniversary ?? '', notes: client?.notes ?? '',
    tags: (client?.tags ?? []).join(', '), marketing_opt_in: client?.marketing_opt_in ?? true,
  });
  const [more, setMore] = useState(!!client);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => rpc<string>('save_client', {
      p_salon: salon.id, p_client: client?.id ?? null, p_full_name: f.full_name.trim(), p_phone: f.phone, p_email: f.email || null,
      p_gender: f.gender || null, p_date_of_birth: f.date_of_birth || null, p_anniversary: f.anniversary || null, p_notes: f.notes || null,
      p_tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), p_source: 'walk_in', p_marketing_opt_in: f.marketing_opt_in,
    }),
    onSuccess: async (id) => { await refresh('clients', 'client', 'dashboard'); toast('Client saved'); onDone(id); },
  });
  return (
    <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label="Full name"><input className="input" value={f.full_name} onChange={set('full_name')} autoComplete="off" /></Field>
      <Field label="Phone" hint="10-digit mobile; +91 is added automatically"><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
      {!client && <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={() => setMore((v) => !v)}>{more ? 'Fewer details' : 'More details'}</button>}
      <Collapse open={more}>
        <div className="stack lg">
          <div className="grid-2">
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Gender"><select className="input" value={f.gender} onChange={set('gender')}><option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
          </div>
          <div className="grid-2">
            <Field label="Birthday"><input className="input" type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></Field>
            <Field label="Anniversary"><input className="input" type="date" value={f.anniversary} onChange={set('anniversary')} /></Field>
          </div>
          <Field label="Tags" hint="Comma separated, e.g. VIP, Bridal"><input className="input" value={f.tags} onChange={set('tags')} /></Field>
          <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} placeholder="Hair type, colour formula, allergies…" /></Field>
          <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.marketing_opt_in} onChange={(e) => setF({ ...f, marketing_opt_in: e.target.checked })} />
            <span className="grow">Happy to receive offers on WhatsApp</span></label>
        </div>
      </Collapse>
      {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
      <button className="btn primary block xl" disabled={save.isPending || !f.full_name.trim() || f.phone.replace(/\D/g, '').length < 10}>Save client</button>
    </form>
  );
}
