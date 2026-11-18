import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, Plus, Printer, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useCatalog, useRefresh, useSalon } from '../../app/salon';
import { ReasonSheet, waLink } from '../../components/salon';
import { BackLink, Empty, Field, Loading, Notice, Sheet, StatusBadge, useToast } from '../../components/ui';
import { formatDateTime } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR, paiseToInput, parseINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import { METHOD_LABEL, METHODS, type Method } from '../../lib/types';

type Inv = {
  id: string; invoice_no: string; created_at: string; status: string; subtotal_paise: number; discount_paise: number; taxable_paise: number;
  tax_paise: number; total_paise: number; tip_paise: number; paid_paise: number; gst_rate_bp: number; notes: string | null; void_reason: string | null;
  client_id: string | null;
  clients: { full_name: string; phone: string; client_no: number } | null;
  invoice_items: { id: string; kind: string; name: string; qty: number; total_paise: number; staff_id: string | null }[];
  payments: { id: string; method: Method; amount_paise: number; status: string; created_at: string }[];
};

export function InvoicePage() {
  const { invoiceId = '' } = useParams();
  const [params] = useSearchParams();
  const fresh = params.get('new') === '1';
  const { salon, can } = useSalon();
  const { staffName } = useCatalog();
  const refresh = useRefresh();
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [collect, setCollect] = useState(false);
  const base = `/s/${salon.slug}`;
  const inv = useQuery({
    queryKey: ['invoices', salon.id, 'one', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*, clients(full_name, phone, client_no), invoice_items(*), payments(*)').eq('id', invoiceId).maybeSingle();
      if (error) throw error;
      return data as unknown as Inv | null;
    },
  });

  if (inv.isPending) return <Loading rows={4} />;
  if (inv.error) return <Notice tone="bad">{errorMessage(inv.error)}</Notice>;
  const d = inv.data;
  if (!d) return <Empty title="Bill not found" />;
  const grand = d.total_paise + d.tip_paise;
  const due = grand - d.paid_paise;
  const text = [
    `${salon.name} — Bill ${d.invoice_no}`,
    ...d.invoice_items.map((i) => `• ${i.name}${Number(i.qty) > 1 ? ` ×${Number(i.qty)}` : ''}: ${formatINR(i.total_paise)}`),
    d.discount_paise > 0 ? `Discount: −${formatINR(d.discount_paise)}` : '',
    `Total: ${formatINR(grand)}`,
    due > 0 && d.status !== 'void' ? `Balance due: ${formatINR(due)}` : 'Paid. Thank you!',
  ].filter(Boolean).join('\n');

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `Bill ${d!.invoice_no}`, text });
      else { await navigator.clipboard.writeText(text); toast('Bill copied'); }
    } catch { /* cancelled */ }
  }

  return (
    <div className="stack lg">
      <BackLink className="btn ghost small" to={`${base}/sales`} style={{ justifySelf: 'start' }}>← Sales</BackLink>
      {fresh && <Notice tone="ok"><b>Bill saved.</b> {d.invoice_no}</Notice>}
      <div className="page-head">
        <h1 className="num">{d.invoice_no}</h1>
        <StatusBadge status={d.status} />
      </div>

      <div className="two-col">
        <section className="card receipt">
          <div className="r-head">
            <div><h2>{salon.name}</h2>
              <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{[salon.address, salon.city].filter(Boolean).join(', ')}{salon.phone ? ` · ${salon.phone}` : ''}</p>
              {salon.gst_enabled && salon.gstin && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>GSTIN {salon.gstin}</p>}</div>
            <div style={{ textAlign: 'right' }}><b>{d.gst_rate_bp > 0 ? 'Tax invoice' : 'Bill'}</b>
              <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{formatDateTime(d.created_at, salon.timezone)}</p></div>
          </div>
          <p style={{ fontSize: 'var(--t-sm)' }}>{d.clients ? <>Billed to <b>{d.clients.full_name}</b> · {d.clients.phone}</> : 'Walk-in customer'}</p>
          <table><tbody>
            {d.invoice_items.map((i) => (
              <tr key={i.id}><td>{i.name}{Number(i.qty) > 1 ? ` × ${Number(i.qty)}` : ''}<div className="muted" style={{ fontSize: 'var(--t-xs)' }}>{staffName(i.staff_id)}</div></td>
                <td className="r num">{formatINR(i.total_paise)}</td></tr>
            ))}
          </tbody></table>
          <div className="stack" style={{ gap: 4 }}>
            <div className="total-line"><span className="muted">Subtotal</span><span className="num">{formatINR(d.subtotal_paise)}</span></div>
            {d.discount_paise > 0 && <div className="total-line"><span className="muted">Discount</span><span className="num">−{formatINR(d.discount_paise)}</span></div>}
            {d.gst_rate_bp > 0 && <>
              <div className="total-line"><span className="muted">Taxable value</span><span className="num">{formatINR(d.taxable_paise)}</span></div>
              <div className="total-line"><span className="muted">CGST {d.gst_rate_bp / 200}%</span><span className="num">{formatINR(Math.floor(d.tax_paise / 2))}</span></div>
              <div className="total-line"><span className="muted">SGST {d.gst_rate_bp / 200}%</span><span className="num">{formatINR(d.tax_paise - Math.floor(d.tax_paise / 2))}</span></div>
            </>}
            {d.tip_paise > 0 && <div className="total-line"><span className="muted">Tip</span><span className="num">{formatINR(d.tip_paise)}</span></div>}
            <div className="total-line big"><span>Total</span><span className="num">{formatINR(grand)}</span></div>
            {d.payments.filter((p) => p.status === 'ok').map((p) => (
              <div key={p.id} className="total-line"><span className="muted">{METHOD_LABEL[p.method]} · {formatDateTime(p.created_at, salon.timezone)}</span><span className="num">{formatINR(p.amount_paise)}</span></div>
            ))}
            {due > 0 && d.status !== 'void' && <div className="total-line"><span className="amount-due">Balance due</span><span className="amount-due num">{formatINR(due)}</span></div>}
          </div>
          {d.notes && <p className="muted">Note: {d.notes}</p>}
          {d.status === 'void' && <Notice tone="bad">Voided — {d.void_reason}</Notice>}
          <p className="muted" style={{ textAlign: 'center', fontSize: 'var(--t-xs)' }}>Thank you! · XS Salon by Xelorsoft</p>
        </section>

        <div className="stack no-print">
          {due > 0 && d.status !== 'void' && can('billing.create') && (
            <button className="btn primary block xl" onClick={() => setCollect(true)}><CheckCircle2 size={18} /> Collect {formatINR(due)}</button>
          )}
          {d.clients?.phone && (
            <a className="btn block wa" href={waLink(d.clients.phone, `Hi ${d.clients.full_name.split(' ')[0]}, thank you for visiting ${salon.name}!\n\n${text}`)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} /> Send on WhatsApp</a>
          )}
          <div className="row">
            <button className="btn" onClick={() => window.print()}><Printer size={18} /> Print</button>
            <button className="btn" onClick={share}><Share2 size={18} /> Share</button>
            {d.client_id && <Link className="btn" to={`${base}/clients/${d.client_id}`}>Client profile</Link>}
          </div>
          {fresh && <Link className="btn block" to={`${base}/sales/new`}><Plus size={18} /> New bill</Link>}
          {d.status !== 'void' && can('billing.void') && <button className="btn danger small" style={{ justifySelf: 'start' }} onClick={() => setVoiding(true)}>Void bill</button>}
        </div>
      </div>

      {voiding && <ReasonSheet title="Void bill" confirmLabel="Void bill"
        warning="Voiding cancels this bill: payments are reversed, sold products go back to stock and the client's visit is removed."
        onClose={() => setVoiding(false)}
        onConfirm={(reason) => rpc('void_invoice', { p_salon: salon.id, p_invoice: d.id, p_reason: reason }).then(() => refresh()).then(() => toast('Bill voided'))} />}
      {collect && <CollectSheet invoiceId={d.id} due={due} onClose={() => setCollect(false)} />}
    </div>
  );
}

function CollectSheet({ invoiceId, due, onClose }: { invoiceId: string; due: number; onClose: () => void }) {
  const { salon } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [method, setMethod] = useState<Method>('upi');
  const [amount, setAmount] = useState(paiseToInput(due));
  const paise = parseINR(amount);
  const run = useMutation({
    mutationFn: () => rpc('add_payment', { p_salon: salon.id, p_invoice: invoiceId, p_method: method, p_amount_paise: paise }),
    onSuccess: async () => { await refresh(); toast('Payment recorded'); onClose(); },
  });
  return (
    <Sheet title="Collect payment" onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
        <div className="grid-2">
          <Field label="Method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></Field>
          <Field label="Amount (₹)" error={amount && !paise ? 'Enter a valid amount' : null}><input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        <button className="btn primary block xl" disabled={!paise || paise > due || run.isPending}>Record payment</button>
      </form>
    </Sheet>
  );
}
