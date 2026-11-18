import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useRefresh, useSalon } from '../../app/salon';
import { ReasonSheet } from '../../components/salon';
import { Field, Loading, Notice, Sheet, useToast } from '../../components/ui';
import { addDays, formatDate, formatDay, todayInSalon } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR, parseINR } from '../../lib/money';
import { rpc, supabase } from '../../lib/supabase';
import { METHOD_LABEL, METHODS, type Method } from '../../lib/types';
import { BarList, ChartCard, ColumnChart, ShareBar } from '../analytics/charts';
import '../analytics/analytics.css';

type Report = {
  totals: { bills: number; gross: number; discount: number; tax: number; net: number; tips: number; avg_bill: number; due: number };
  service_revenue: number; product_revenue: number; expenses: number;
  by_day: { d: string; v: number; n: number }[]; by_method: { method: Method; amount: number }[];
  by_staff: { id: string; name: string; color: string; revenue: number; services: number | null; products: number | null; commission: number | null; bills: number }[];
  top_services: { name: string; qty: number; revenue: number }[]; top_products: { name: string; qty: number; revenue: number }[];
  new_clients: number; appointments: Record<string, number>;
};
type Expense = { id: string; category: string; amount_paise: number; expense_date: string; method: Method; description: string | null };
const EXP_CATS = ['Rent', 'Salaries', 'Electricity', 'Products & supplies', 'Marketing', 'Maintenance', 'Internet & phone', 'Other'];
const METHOD_COLOR: Record<Method, string> = { upi: 'var(--viz-1)', cash: 'var(--viz-3)', card: 'var(--viz-2)', bank: 'var(--viz-4)', other: 'var(--viz-other)' };
const short = (p: number) => { const r = p / 100; return r >= 1e5 ? `₹${(r / 1e5).toFixed(1)}L` : r >= 1e3 ? `₹${Math.round(r / 1e3)}k` : `₹${Math.round(r)}`; };

export function ReportsPage() {
  const { salon, can } = useSalon();
  const today = todayInSalon(salon.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { k: 'today', label: 'Today', from: today, to: today },
    { k: '7', label: '7 days', from: addDays(today, -6), to: today },
    { k: 'month', label: 'This month', from: monthStart, to: today },
    { k: 'last', label: 'Last month', from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
    { k: '90', label: '90 days', from: addDays(today, -89), to: today },
  ];
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [adding, setAdding] = useState(false);
  const report = useQuery({
    queryKey: ['report', salon.id, range.from, range.to],
    queryFn: () => rpc<Report>('sales_report', { p_salon: salon.id, p_from: range.from, p_to: range.to }),
  });
  const expenses = useQuery({
    queryKey: ['report', salon.id, 'expenses', range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').eq('salon_id', salon.id).eq('status', 'ok')
        .gte('expense_date', range.from).lte('expense_date', range.to).order('expense_date', { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });
  const r = report.data;
  const commission = r ? r.by_staff.reduce((a, s) => a + (s.commission ?? 0), 0) : 0;
  const profit = r ? r.totals.net - r.totals.tax - r.expenses - commission : 0;

  function csv() {
    if (!r) return;
    const rows = [['Date', 'Bills', 'Net sales (INR)'], ...r.by_day.map((x) => [x.d, x.n, (x.v / 100).toFixed(2)]), [],
      ['Team member', 'Revenue', 'Services', 'Products', 'Commission'],
      ...r.by_staff.map((s) => [s.name, (s.revenue / 100).toFixed(2), ((s.services ?? 0) / 100).toFixed(2), ((s.products ?? 0) / 100).toFixed(2), ((s.commission ?? 0) / 100).toFixed(2)])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((x) => x.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `xs-salon-${range.from}-to-${range.to}.csv`;
    a.click();
  }

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Reports</h1>
        {r && <button className="btn" onClick={csv} aria-label="Export CSV"><Download size={18} /> <span className="btn-text">Export</span></button>}
        {can('expenses.manage') && <button className="btn primary" onClick={() => setAdding(true)} aria-label="Add expense"><Plus size={18} /> <span className="btn-text">Expense</span></button>}
      </div>
      <div className="row">
        <div className="chips">{presets.map((p) => <button key={p.k} type="button" className="chip" aria-pressed={range.from === p.from && range.to === p.to} onClick={() => setRange({ from: p.from, to: p.to })}>{p.label}</button>)}</div>
        <div className="row">
          <input type="date" className="input" style={{ width: 'auto', minHeight: 40 }} value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="From" />
          <span className="muted">to</span>
          <input type="date" className="input" style={{ width: 'auto', minHeight: 40 }} value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="To" />
        </div>
      </div>

      {report.isPending ? <Loading rows={6} /> : report.error ? <Notice tone="bad">{errorMessage(report.error)}</Notice> : r && (
        <>
          <div className="tiles analytics-kpis">
            <div className="tile"><span className="label">Net sales</span><span className="value num">{formatINR(r.totals.net)}</span><span className="sub">{r.totals.bills} bills · avg {formatINR(r.totals.avg_bill)}</span></div>
            <div className="tile"><span className="label">Services · Products</span><span className="value num">{short(r.service_revenue)} · {short(r.product_revenue)}</span><span className="sub">Discounts {formatINR(r.totals.discount)}</span></div>
            <div className="tile"><span className="label">Expenses</span><span className="value num">{formatINR(r.expenses)}</span><span className="sub">Commission {formatINR(commission)}</span></div>
            <div className="tile"><span className="label">Estimated profit</span><span className="value num">{profit < 0 ? <span className="neg">{formatINR(profit)}</span> : formatINR(profit)}</span><span className="sub">after GST, expenses, commission</span></div>
          </div>

          <div className="viz-cards">
            <ChartCard wide title="Sales by day" headline={<><b>{r.new_clients}</b> new clients · <b>{r.appointments.completed ?? 0}</b> completed visits · <b>{r.appointments.no_show ?? 0}</b> no-shows</>}
              table={{ head: ['Day', 'Bills', 'Sales'], rows: r.by_day.map((x) => [formatDate(x.d), x.n, formatINR(x.v)]) }}>
              {r.by_day.length ? <ColumnChart label="Sales by day" categories={r.by_day.map((x) => formatDay(x.d, { day: 'numeric', month: 'short' }))}
                series={[{ key: 'sales', label: 'Sales', color: 'var(--viz-1)', values: r.by_day.map((x) => x.v) }]} format={formatINR} tick={short} /> : <p className="muted">No sales in this period.</p>}
            </ChartCard>
            <ChartCard title="Team performance" headline="Revenue credited to each team member"
              table={{ head: ['Team member', 'Bills', 'Revenue', 'Commission'], rows: r.by_staff.map((s) => [s.name, s.bills, formatINR(s.revenue), formatINR(s.commission ?? 0)]) }}>
              <BarList format={formatINR} rows={r.by_staff.map((s) => ({ label: s.name, value: s.revenue, note: `${formatINR(s.commission ?? 0)} commission` }))} />
            </ChartCard>
            <ChartCard title="Payment methods" headline={`${formatINR(r.by_method.reduce((a, m) => a + m.amount, 0))} collected`}>
              <ShareBar label="Payment methods" format={formatINR} parts={r.by_method.map((m) => ({ label: METHOD_LABEL[m.method], value: m.amount, color: METHOD_COLOR[m.method] }))} />
            </ChartCard>
            <ChartCard title="Top services" table={{ head: ['Service', 'Count', 'Revenue'], rows: r.top_services.map((s) => [s.name, Number(s.qty), formatINR(s.revenue)]) }}>
              <BarList format={formatINR} rows={r.top_services.map((s) => ({ label: s.name, value: s.revenue, note: `×${Number(s.qty)}` }))} empty="No services sold in this period." />
            </ChartCard>
            <ChartCard title="Top products" table={{ head: ['Product', 'Count', 'Revenue'], rows: r.top_products.map((s) => [s.name, Number(s.qty), formatINR(s.revenue)]) }}>
              <BarList color="var(--viz-3)" format={formatINR} rows={r.top_products.map((s) => ({ label: s.name, value: s.revenue, note: `×${Number(s.qty)}` }))} empty="No products sold in this period." />
            </ChartCard>
          </div>

          <ExpenseList expenses={expenses.data ?? []} />
        </>
      )}
      {adding && <ExpenseSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function ExpenseList({ expenses }: { expenses: Expense[] }) {
  const { salon, can } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [removing, setRemoving] = useState<Expense | null>(null);
  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Expenses</h2><b className="num">{formatINR(expenses.reduce((a, e) => a + e.amount_paise, 0))}</b></div>
      {!expenses.length ? <p className="muted">No expenses recorded in this period.</p> : (
        <ul className="list card flush">{expenses.map((e) => (
          <li key={e.id} className="item" style={{ cursor: 'default' }}>
            <span className="main-col"><span className="title">{e.category}</span>
              <span className="meta"><span>{formatDate(e.expense_date)}</span><span>{METHOD_LABEL[e.method]}</span>{e.description && <span>{e.description}</span>}</span></span>
            <b className="num">{formatINR(e.amount_paise)}</b>
            {can('expenses.manage') && <button className="btn ghost icon-btn" onClick={() => setRemoving(e)} aria-label="Remove expense"><X size={18} /></button>}
          </li>
        ))}</ul>
      )}
      {removing && <ReasonSheet title="Remove expense" confirmLabel="Remove expense" warning={`${removing.category} · ${formatINR(removing.amount_paise)} will no longer count in reports.`}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) => rpc('void_expense', { p_salon: salon.id, p_expense: removing.id, p_reason: reason }).then(() => refresh('report', 'dashboard')).then(() => toast('Expense removed'))} />}
    </section>
  );
}

function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { salon } = useSalon();
  const refresh = useRefresh();
  const toast = useToast();
  const [f, setF] = useState({ category: EXP_CATS[0], amount: '', date: todayInSalon(salon.timezone), method: 'upi' as Method, description: '' });
  const paise = parseINR(f.amount);
  const save = useMutation({
    mutationFn: () => rpc('record_expense', { p_salon: salon.id, p_category: f.category, p_amount_paise: paise, p_expense_date: f.date, p_method: f.method, p_description: f.description || null }),
    onSuccess: async () => { await refresh('report', 'dashboard'); toast('Expense saved'); onClose(); },
  });
  return (
    <Sheet title="Record expense" onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid-2">
          <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXP_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Amount (₹)" error={f.amount && !paise ? 'Enter a valid amount' : null}><input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Paid by"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Method })}>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></Field>
        </div>
        <Field label="Description (optional)"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <button className="btn primary block xl" disabled={!paise || save.isPending}>Save expense</button>
      </form>
    </Sheet>
  );
}
