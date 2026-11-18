import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useCatalog, useRefresh, useSalon } from '../../app/salon';
import { ClientPicker, type ClientLite } from '../../components/salon';
import { BackLink, Empty, Field, Loading, Notice, Segmented, useToast } from '../../components/ui';
import { formatDateTime } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR, paiseToInput } from '../../lib/money';
import { newKey, rpc, supabase } from '../../lib/supabase';
import { METHOD_LABEL, METHODS, type Appointment, type Method, type Product, type Salon } from '../../lib/types';

type Line = { k: string; kind: 'service' | 'product' | 'custom'; ref_id: string | null; name: string; staff_id: string | null; qty: number; unit_price_paise: number };
type Pay = { method: Method; amount: string };

/** Same rule as the database's checkout(): bill discount, then GST included or added. */
export function totals(salon: Salon, lines: Line[], discount: number, tip: number) {
  const sub = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price_paise), 0);
  const disc = Math.min(Math.max(discount, 0), sub);
  const net = sub - disc;
  let tax = 0, total = net;
  if (salon.gst_enabled) {
    const r = salon.gst_rate_bp;
    if (salon.prices_include_tax) tax = Math.round((net * r) / (10000 + r));
    else { tax = Math.round((net * r) / 10000); total = net + tax; }
  }
  return { sub, disc, tax, total, due: total + Math.max(tip, 0) };
}

/** Lenient rupee parser for in-form amounts: "" → 0, "1,500.5" → 150050. */
const toPaise = (v: string) => { const n = Number(v.replace(/[₹,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };

export function NewBillPage() {
  const { salon, me } = useSalon();
  const { activeServices, activeTeam, bookable, categories } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const apptId = params.get('appt');
  const base = `/s/${salon.slug}`;

  const [client, setClient] = useState<ClientLite | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<'services' | 'products' | 'custom'>('services');
  const [cat, setCat] = useState<string>('all');
  const [term, setTerm] = useState('');
  const [defStaff, setDefStaff] = useState<string>(bookable[0]?.id ?? me.id);
  const [discMode, setDiscMode] = useState<'amt' | 'pct'>('amt');
  const [discVal, setDiscVal] = useState('');
  const [tip, setTip] = useState('');
  const [pays, setPays] = useState<Pay[]>([{ method: 'upi', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [key] = useState(newKey);

  // The team list may arrive after first render: default to the first stylist.
  useEffect(() => { if (!apptId && bookable.length && defStaff === me.id && !me.bookable) setDefStaff(bookable[0].id); }, [bookable, apptId, defStaff, me]);

  const appt = useQuery({
    queryKey: ['appointment', salon.id, apptId],
    enabled: !!apptId,
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('*, clients(id, full_name, phone, visit_count, tags, notes), appointment_services(*)')
        .eq('id', apptId!).single();
      if (error) throw error;
      return data as unknown as Appointment;
    },
  });
  useEffect(() => {
    const a = appt.data;
    if (!a) return;
    if (a.status === 'completed' && a.invoice_id) { navigate(`${base}/sales/${a.invoice_id}`, { replace: true }); return; }
    setClient(a.clients as ClientLite);
    setDefStaff(a.staff_id);
    setLines(a.appointment_services.map((s) => ({ k: newKey(), kind: 'service', ref_id: s.service_id, name: s.name, staff_id: a.staff_id, qty: 1, unit_price_paise: s.price_paise })));
  }, [appt.data, base, navigate]);

  const products = useQuery({
    queryKey: ['products', salon.id, 'retail'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('salon_id', salon.id).eq('status', 'active').eq('kind', 'retail').order('name');
      if (error) throw error;
      return data as Product[];
    },
  });

  const rawSub = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price_paise), 0);
  const discount = discMode === 'pct' ? Math.round(rawSub * Math.min(Number(discVal) || 0, 100) / 100) : toPaise(discVal);
  const t = totals(salon, lines, discount, toPaise(tip));
  const paid = pays.reduce((a, p) => a + toPaise(p.amount), 0);
  useEffect(() => { setPays((p) => (p.length === 1 ? [{ ...p[0], amount: t.due ? paiseToInput(t.due) : '' }] : p)); }, [t.due]);

  const add = (kind: Line['kind'], item: { id?: string; name: string; price_paise: number; stock_qty?: number }) => {
    if (kind === 'product' && (item.stock_qty ?? 0) <= 0) toast(`${item.name} shows no stock`, 'bad');
    setLines((ls) => {
      const ex = kind === 'product' && ls.find((l) => l.kind === 'product' && l.ref_id === item.id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { k: newKey(), kind, ref_id: item.id ?? null, name: item.name, staff_id: defStaff || null, qty: 1, unit_price_paise: item.price_paise }];
    });
  };
  const upd = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: () => {
      if (paid > t.due) throw new Error('Payment is more than the bill amount');
      return rpc<{ invoice_id: string }>('checkout', {
        p_salon: salon.id, p_client: client?.id ?? null, p_appointment: appt.data?.id ?? null,
        p_items: lines.map((l) => ({ kind: l.kind, ref_id: l.ref_id, name: l.name, staff_id: l.staff_id, qty: l.qty, unit_price_paise: l.unit_price_paise, discount_paise: 0 })),
        p_discount_paise: t.disc, p_tip_paise: toPaise(tip),
        p_payments: pays.filter((p) => toPaise(p.amount) > 0).map((p) => ({ method: p.method, amount_paise: toPaise(p.amount) })),
        p_notes: notes || null, p_idempotency_key: key,
      });
    },
    onSuccess: async (r) => { await refresh(); toast('Bill saved'); navigate(`${base}/sales/${r.invoice_id}?new=1`, { replace: true }); },
  });

  const svcList = useMemo(() => activeServices.filter((s) => (cat === 'all' || s.category_id === cat) && (!term || s.name.toLowerCase().includes(term.toLowerCase()))),
    [activeServices, cat, term]);
  const prodList = (products.data ?? []).filter((p) => !term || `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(term.toLowerCase()));

  if (apptId && appt.isPending) return <Loading rows={5} />;

  return (
    <div className="stack lg">
      <BackLink className="btn ghost small" to={`${base}/sales`} style={{ justifySelf: 'start' }}>← Sales</BackLink>
      <div className="page-head">
        <h1>New bill</h1>
      </div>
      {appt.data && <p className="page-sub">For appointment · {formatDateTime(appt.data.start_at, salon.timezone)}</p>}

      <div className="pos">
        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Segmented label="Add" value={tab} onChange={(v) => { setTab(v); setTerm(''); }}
              options={[{ value: 'services', label: 'Services' }, { value: 'products', label: 'Products' }, { value: 'custom', label: 'Custom' }]} />
            <label className="row" style={{ gap: 8 }}><span className="label">Stylist</span>
              <select className="input sm" style={{ width: 'auto' }} value={defStaff} onChange={(e) => setDefStaff(e.target.value)}>
                {activeTeam.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select></label>
          </div>
          {tab !== 'custom' && <div className="search"><Search size={18} /><input className="input" placeholder={`Search ${tab}`} value={term} onChange={(e) => setTerm(e.target.value)} /></div>}
          {tab === 'services' && (
            <>
              {categories.length > 1 && (
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
                  {categories.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
                </div>
              )}
              {svcList.length ? (
                <div className="menu-grid">{svcList.map((s) => (
                  <button key={s.id} type="button" className="menu-tile" onClick={() => add('service', s)}><b>{s.name}</b><span>{formatINR(s.price_paise)} · {s.duration_min} min</span></button>
                ))}</div>
              ) : <Empty title="No services found" />}
            </>
          )}
          {tab === 'products' && (products.isPending ? <Loading rows={2} /> : prodList.length ? (
            <div className="menu-grid">{prodList.map((p) => (
              <button key={p.id} type="button" className="menu-tile" onClick={() => add('product', p)}><b>{p.name}</b>
                <span>{formatINR(p.price_paise)} · <span style={Number(p.stock_qty) <= Number(p.reorder_level) ? { color: 'var(--warn)' } : undefined}>{Number(p.stock_qty)} in stock</span></span></button>
            ))}</div>
          ) : <Empty title="No retail products">Add products in Inventory to sell them here.</Empty>)}
          {tab === 'custom' && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); add('custom', { name: customName.trim(), price_paise: toPaise(customPrice) }); setCustomName(''); setCustomPrice(''); }}>
              <div className="grid-2">
                <Field label="Item"><input className="input" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Bridal trial" /></Field>
                <Field label="Price (₹)"><input className="input" inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} /></Field>
              </div>
              <button className="btn" disabled={!customName.trim() || !toPaise(customPrice)}><Plus size={18} /> Add to bill</button>
            </form>
          )}
        </section>

        <section className="card stack lg cart">
          <Field label="Client"><ClientPicker value={client} onChange={setClient} /></Field>
          {!client && <p className="muted" style={{ marginTop: -14, fontSize: 'var(--t-sm)' }}>Optional — leave empty for a quick walk-in bill.</p>}

          <div>
            {!lines.length && <p className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>Tap a service or product to add it.</p>}
            {lines.map((l) => (
              <div key={l.k} className="cart-line">
                <div className="grow">
                  <b>{l.name}</b>
                  <div className="row" style={{ gap: 6 }}>
                    <select className="input sm" style={{ width: 'auto' }} value={l.staff_id ?? ''} onChange={(e) => upd(l.k, { staff_id: e.target.value || null })} aria-label="Done by">
                      <option value="">No staff</option>
                      {activeTeam.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                    </select>
                    {l.kind === 'product' && <input className="input sm qty num" type="number" min={1} value={l.qty} aria-label="Quantity"
                      onChange={(e) => upd(l.k, { qty: Math.max(1, parseInt(e.target.value) || 1) })} />}
                  </div>
                </div>
                <input className="input sm price num" inputMode="decimal" defaultValue={paiseToInput(l.unit_price_paise)} aria-label="Price"
                  onBlur={(e) => upd(l.k, { unit_price_paise: toPaise(e.target.value) })} />
                <button type="button" className="btn ghost icon-btn" onClick={() => setLines((ls) => ls.filter((x) => x.k !== l.k))} aria-label={`Remove ${l.name}`}><X size={18} /></button>
              </div>
            ))}
          </div>

          {lines.length > 0 && (
            <>
              <div className="grid-2">
                <Field label="Discount">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input num" inputMode="decimal" placeholder="0" value={discVal} onChange={(e) => setDiscVal(e.target.value)} />
                    <Segmented label="Discount type" value={discMode} onChange={setDiscMode} options={[{ value: 'amt', label: '₹' }, { value: 'pct', label: '%' }]} />
                  </div>
                </Field>
                <Field label="Tip"><input className="input num" inputMode="decimal" placeholder="0" value={tip} onChange={(e) => setTip(e.target.value)} /></Field>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <div className="total-line"><span className="muted">Subtotal</span><span className="num">{formatINR(t.sub)}</span></div>
                {t.disc > 0 && <div className="total-line"><span className="muted">Discount</span><span className="num">−{formatINR(t.disc)}</span></div>}
                {salon.gst_enabled && <div className="total-line"><span className="muted">GST {salon.gst_rate_bp / 100}%{salon.prices_include_tax ? ' (included)' : ''}</span><span className="num">{formatINR(t.tax)}</span></div>}
                {toPaise(tip) > 0 && <div className="total-line"><span className="muted">Tip</span><span className="num">{formatINR(toPaise(tip))}</span></div>}
                <div className="total-line big"><span>Total</span><span className="num">{formatINR(t.due)}</span></div>
              </div>
              <div className="field"><span>Payment</span>
                {pays.map((p, i) => (
                  <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                    <select className="input" style={{ width: 120 }} value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as Method } : x)))}>
                      {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                    <input className="input num" inputMode="decimal" value={p.amount} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount" />
                    {pays.length > 1 && <button type="button" className="btn ghost icon-btn" onClick={() => setPays(pays.filter((_, j) => j !== i))} aria-label="Remove payment"><X size={18} /></button>}
                  </div>
                ))}
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button type="button" className="btn ghost small" onClick={() => setPays([...pays, { method: 'cash', amount: paiseToInput(Math.max(t.due - paid, 0)) }])}><Plus size={16} /> Split payment</button>
                  <span className={paid < t.due ? 'amount-due' : 'muted'} style={{ fontSize: 'var(--t-sm)' }}>{paid < t.due ? `${formatINR(t.due - paid)} will be due` : paid > t.due ? 'More than the bill' : 'Fully paid'}</span>
                </div>
              </div>
              <Field label="Note on bill (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
              <button className="btn primary block xl" disabled={save.isPending || paid > t.due} onClick={() => save.mutate()}>
                {save.isPending ? <span className="spinner" /> : `Complete bill · ${formatINR(t.due)}`}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
