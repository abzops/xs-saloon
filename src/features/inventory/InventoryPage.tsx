import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRefresh, useSalon } from '../../app/salon';
import { Empty, Field, Loading, Notice, Segmented, Sheet, useToast } from '../../components/ui';
import { formatDateTime } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR, paiseToInput, parseINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import type { Product } from '../../lib/types';

type Kind = 'all' | 'retail' | 'consumable';
const MOVE_LABEL: Record<string, string> = { purchase: 'Stock in', use: 'Used in salon', adjust: 'Correction', return: 'Returned', sale: 'Sold', void: 'Bill voided' };

export function InventoryPage() {
  const { salon, can } = useSalon();
  const manage = can('inventory.manage');
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>('all');
  const [low, setLow] = useState(params.get('low') === '1');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [stock, setStock] = useState<Product | null>(null);
  const products = useQuery({
    queryKey: ['products', salon.id, 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('salon_id', salon.id).eq('status', 'active').order('name');
      if (error) throw error;
      return data as Product[];
    },
  });
  const all = products.data ?? [];
  const isLow = (p: Product) => Number(p.stock_qty) <= Number(p.reorder_level);
  const list = all.filter((p) => (kind === 'all' || p.kind === kind) && (!low || isLow(p)) && (!term || `${p.name} ${p.brand ?? ''} ${p.sku ?? ''}`.toLowerCase().includes(term.toLowerCase())));
  const value = all.reduce((a, p) => a + Math.max(Number(p.stock_qty), 0) * p.cost_paise, 0);

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Inventory</h1>
        {manage && <button className="btn primary" onClick={() => setEditing({})} aria-label="Add product"><Plus size={18} /> <span className="btn-text">Add product</span></button>}
      </div>
      <div className="tiles">
        <div className="tile"><span className="label">Products</span><span className="value num">{all.length}</span><span className="sub">{all.filter((p) => p.kind === 'retail').length} for sale</span></div>
        <div className="tile"><span className="label">Low on stock</span><span className="value num">{all.filter(isLow).length}</span><span className="sub">at or below alert level</span></div>
        <div className="tile"><span className="label">Stock value</span><span className="value num">{formatINR(Math.round(value))}</span><span className="sub">at cost price</span></div>
      </div>
      <div className="stack">
        <div className="search"><Search size={18} /><input className="input" type="search" placeholder="Name, brand or code" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <div className="row">
          <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'retail', label: 'For sale' }, { value: 'consumable', label: 'Salon use' }]} />
          <button type="button" className="chip" aria-pressed={low} onClick={() => setLow((v) => !v)}>Low stock only</button>
        </div>
      </div>
      {products.isPending ? <Loading /> : products.error ? <Notice tone="bad">{errorMessage(products.error)}</Notice> : !list.length ? (
        <div className="card"><Empty title={all.length ? 'Nothing matches' : 'No products yet'}>{!all.length && <p>Track retail products and salon consumables like colour tubes.</p>}</Empty></div>
      ) : (
        <ul className="list card flush">
          {list.map((p) => (
            <li key={p.id}>
              <button className="item" disabled={!manage} onClick={() => setStock(p)}>
                <span className="main-col"><span className="title">{p.name}</span>
                  <span className="meta">{p.brand && <span>{p.brand}</span>}<span>{p.kind === 'retail' ? formatINR(p.price_paise) : 'Salon use'}</span></span></span>
                <span className="end-col">
                  <b className="num">{Number(p.stock_qty)} {p.unit}</b>
                  {isLow(p) && <span className="badge warn">Low</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ProductSheet p={editing} onClose={() => setEditing(null)} />}
      {stock && <StockSheet p={stock} onClose={() => setStock(null)} onEdit={() => { setEditing(stock); setStock(null); }} />}
    </div>
  );
}

function ProductSheet({ p, onClose }: { p: Partial<Product>; onClose: () => void }) {
  const { salon } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [f, setF] = useState({
    name: p.name ?? '', brand: p.brand ?? '', sku: p.sku ?? '', kind: p.kind ?? 'retail', price: p.price_paise ? paiseToInput(p.price_paise) : '',
    cost: p.cost_paise ? paiseToInput(p.cost_paise) : '', reorder: String(p.reorder_level ?? 2), unit: p.unit ?? 'pc', opening: '',
  });
  const money = (v: string) => (v.trim() === '' ? 0 : parseINR(v));
  const save = useMutation({
    mutationFn: async (status: 'active' | 'archived') => {
      const row = { salon_id: salon.id, name: f.name.trim(), brand: f.brand.trim() || null, sku: f.sku.trim() || null, kind: f.kind,
        price_paise: f.kind === 'retail' ? money(f.price) ?? 0 : 0, cost_paise: money(f.cost) ?? 0, reorder_level: Number(f.reorder) || 0, unit: f.unit, status };
      if (p.id) { const r = await supabase.from('products').update(row).eq('id', p.id); if (r.error) throw r.error; return; }
      const r = await supabase.from('products').insert(row).select('id').single();
      if (r.error) throw r.error;
      if (Number(f.opening) > 0) await rpc('adjust_stock', { p_salon: salon.id, p_product: r.data.id, p_qty: Number(f.opening), p_reason: 'purchase', p_note: 'Opening stock' });
    },
    onSuccess: async (_, status) => { await refresh('products', 'dashboard'); toast(status === 'archived' ? 'Product removed' : 'Product saved'); onClose(); },
  });
  return (
    <Sheet title={p.id ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate('active'); }}>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Argan Oil Shampoo 250 ml" /></Field>
        <div className="grid-2">
          <Field label="Brand"><input className="input" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Product['kind'] })}>
            <option value="retail">For sale</option><option value="consumable">Salon use</option></select></Field>
        </div>
        <div className="grid-2">
          {f.kind === 'retail' && <Field label="Selling price (₹)" error={money(f.price) === null ? 'Enter a valid price' : null}><input className="input num" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>}
          <Field label="Cost price (₹)"><input className="input num" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Alert when stock is at or below"><input className="input num" inputMode="decimal" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} /></Field>
          <Field label="Unit"><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            {['pc', 'bottle', 'tube', 'box', 'ml', 'g', 'kg', 'l'].map((u) => <option key={u}>{u}</option>)}</select></Field>
        </div>
        {!p.id && <Field label="Opening stock"><input className="input num" inputMode="decimal" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} placeholder="0" /></Field>}
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || !f.name.trim()}>Save product</button>
        {p.id && <button type="button" className="btn danger block" disabled={save.isPending} onClick={() => save.mutate('archived')}>Remove product</button>}
      </form>
    </Sheet>
  );
}

function StockSheet({ p, onClose, onEdit }: { p: Product; onClose: () => void; onEdit: () => void }) {
  const { salon } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [reason, setReason] = useState<'purchase' | 'use' | 'adjust' | 'return'>('purchase');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const moves = useQuery({
    queryKey: ['products', salon.id, 'moves', p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_moves').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(12);
      if (error) throw error;
      return data as { id: string; qty: number; reason: string; note: string | null; created_at: string }[];
    },
  });
  const n = Number(qty);
  const signed = reason === 'use' ? -Math.abs(n) : reason === 'adjust' ? n : Math.abs(n);
  const save = useMutation({
    mutationFn: () => rpc('adjust_stock', { p_salon: salon.id, p_product: p.id, p_qty: signed, p_reason: reason, p_note: note || null }),
    onSuccess: async () => { await refresh('products', 'dashboard'); toast('Stock updated'); onClose(); },
  });
  return (
    <Sheet title={p.name} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="total-line big" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}><span>In stock</span><span className="num">{Number(p.stock_qty)} {p.unit}</span></div>
        <div className="scroll-x"><Segmented label="Change" value={reason} onChange={setReason}
          options={[{ value: 'purchase', label: 'Stock in' }, { value: 'use', label: 'Used' }, { value: 'return', label: 'Returned' }, { value: 'adjust', label: 'Correct ±' }]} /></div>
        <div className="grid-2">
          <Field label={reason === 'adjust' ? 'Quantity (use − to reduce)' : 'Quantity'}><input className="input num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier, bill no…" /></Field>
        </div>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || !n}>Update stock</button>
        <button type="button" className="btn block" onClick={onEdit}>Edit product details</button>
        {moves.data && moves.data.length > 0 && (
          <ul className="list grouped">{moves.data.map((m) => (
            <li key={m.id} className="item" style={{ cursor: 'default', minHeight: 52 }}>
              <span className="main-col"><span className="title">{MOVE_LABEL[m.reason] ?? m.reason}</span><span className="meta"><span>{formatDateTime(m.created_at, salon.timezone)}</span>{m.note && <span>{m.note}</span>}</span></span>
              <b className="num" style={{ color: Number(m.qty) > 0 ? 'var(--ok)' : 'var(--bad)' }}>{Number(m.qty) > 0 ? '+' : ''}{Number(m.qty)}</b>
            </li>
          ))}</ul>
        )}
      </form>
    </Sheet>
  );
}
