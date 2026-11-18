import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useCatalog, useRefresh, useSalon } from '../../app/salon';
import { Empty, Field, Loading, Notice, Sheet, useToast } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { formatINR, paiseToInput, parseINR } from '../../lib/money';
import { supabase } from '../../lib/supabase';
import type { Category, Service } from '../../lib/types';

const DURATIONS = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const fmtDur = (d: number) => (d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ''}`);

export function ServicesPage() {
  const { can } = useSalon();
  const { services, categories, loading, error, activeServices } = useCatalog();
  const manage = can('services.manage');
  const [term, setTerm] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [cat, setCat] = useState<Partial<Category> | null>(null);
  if (loading) return <Loading rows={5} />;
  if (error) return <Notice tone="bad">{errorMessage(error)}</Notice>;
  const list = services.filter((s) => (archived || s.status === 'active') && (!term || s.name.toLowerCase().includes(term.toLowerCase())));
  const groups = [...categories, { id: null as string | null, name: 'Uncategorised', salon_id: '', sort: 999 }]
    .map((c) => ({ c, items: list.filter((s) => (s.category_id ?? null) === c.id) })).filter((g) => g.c.id || g.items.length);

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Services</h1>
        {manage && <button className="btn" onClick={() => setCat({})} aria-label="Add category"><Plus size={18} /> <span className="btn-text">Category</span></button>}
        {manage && <button className="btn primary" onClick={() => setEditing({})} aria-label="Add service"><Plus size={18} /> <span className="btn-text">Service</span></button>}
      </div>
      <p className="muted">{activeServices.length} active services. Prices and durations here drive the calendar, bills and online booking.</p>
      <div className="row">
        <div className="search" style={{ flex: 1, minWidth: 220 }}><Search size={18} /><input className="input" placeholder="Search services" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <button type="button" className="chip" aria-pressed={archived} onClick={() => setArchived((v) => !v)}>Show archived</button>
      </div>
      {!services.length && <div className="card"><Empty title="No services yet">{manage && <button className="btn primary" onClick={() => setEditing({})}><Plus size={18} /> Add a service</button>}</Empty></div>}
      {groups.map((g) => (
        <section key={g.c.id ?? 'none'} className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{g.c.name} <span className="muted num">{g.items.length}</span></h2>
            {manage && g.c.id && <button className="btn ghost small" onClick={() => setCat(g.c as Category)}><Pencil size={15} /> Rename</button>}
          </div>
          {g.items.length ? (
            <ul className="list card flush">{g.items.map((s) => (
              <li key={s.id}>
                <button className="item" disabled={!manage} onClick={() => setEditing(s)}>
                  <span className="main-col">
                    <span className="title">{s.name}</span>
                    <span className="meta"><span>{fmtDur(s.duration_min)}</span>{s.gender !== 'unisex' && <span>{s.gender === 'women' ? 'Women' : 'Men'}</span>}
                      {!s.online_bookable && <span>In-salon only</span>}{s.status === 'archived' && <span>Archived</span>}</span>
                  </span>
                  <span className="end-col"><b className="num">{formatINR(s.price_paise)}</b></span>
                </button>
              </li>
            ))}</ul>
          ) : <p className="muted">No services in this category yet.</p>}
        </section>
      ))}
      {editing && <ServiceSheet s={editing} onClose={() => setEditing(null)} />}
      {cat && <CategorySheet c={cat} onClose={() => setCat(null)} />}
    </div>
  );
}

function ServiceSheet({ s, onClose }: { s: Partial<Service>; onClose: () => void }) {
  const { salon } = useSalon();
  const { categories } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const [f, setF] = useState({
    name: s.name ?? '', category_id: s.category_id ?? categories[0]?.id ?? '', duration_min: s.duration_min ?? 30,
    price: s.price_paise ? paiseToInput(s.price_paise) : '', gender: s.gender ?? 'unisex', description: s.description ?? '', online_bookable: s.online_bookable ?? true,
  });
  const price = f.price === '' || f.price === '0' ? 0 : parseINR(f.price);
  const save = useMutation({
    mutationFn: async (status: 'active' | 'archived') => {
      const row = { salon_id: salon.id, name: f.name.trim(), category_id: f.category_id || null, duration_min: Number(f.duration_min), price_paise: price ?? 0,
        gender: f.gender, description: f.description.trim() || null, online_bookable: f.online_bookable, status };
      const r = s.id ? await supabase.from('services').update(row).eq('id', s.id) : await supabase.from('services').insert(row);
      if (r.error) throw r.error;
    },
    onSuccess: async (_, status) => { await refresh('services'); toast(status === 'archived' ? 'Service archived' : 'Service saved'); onClose(); },
  });
  return (
    <Sheet title={s.id ? 'Edit service' : 'New service'} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate('active'); }}>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Keratin Treatment" /></Field>
        <div className="grid-2">
          <Field label="Price (₹)" error={price === null ? 'Enter a valid price' : null}><input className="input num" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Duration"><select className="input" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })}>
            {[...new Set([...DURATIONS, f.duration_min])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
        </div>
        <div className="grid-2">
          <Field label="Category"><select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">Uncategorised</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="For"><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as Service['gender'] })}>
            <option value="unisex">Everyone</option><option value="women">Women</option><option value="men">Men</option></select></Field>
        </div>
        <Field label="Description (shown on the booking page)"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.online_bookable} onChange={(e) => setF({ ...f, online_bookable: e.target.checked })} />
          <span className="grow">Clients can book this online</span></label>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || !f.name.trim() || price === null}>Save service</button>
        {s.id && <button type="button" className={s.status === 'archived' ? 'btn block' : 'btn danger block'} disabled={save.isPending}
          onClick={() => save.mutate(s.status === 'archived' ? 'active' : 'archived')}>{s.status === 'archived' ? 'Restore service' : 'Archive service'}</button>}
      </form>
    </Sheet>
  );
}

function CategorySheet({ c, onClose }: { c: Partial<Category>; onClose: () => void }) {
  const { salon } = useSalon();
  const { categories } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const [name, setName] = useState(c.name ?? '');
  const save = useMutation({
    mutationFn: async () => {
      const r = c.id ? await supabase.from('service_categories').update({ name: name.trim() }).eq('id', c.id)
        : await supabase.from('service_categories').insert({ salon_id: salon.id, name: name.trim(), sort: categories.length + 1 });
      if (r.error) throw r.error;
    },
    onSuccess: async () => { await refresh('categories'); toast('Category saved'); onClose(); },
  });
  return (
    <Sheet title={c.id ? 'Rename category' : 'New category'} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridal" /></Field>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || !name.trim()}>Save</button>
      </form>
    </Sheet>
  );
}
