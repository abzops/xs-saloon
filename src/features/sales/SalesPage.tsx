import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSalon } from '../../app/salon';
import { Empty, Loading, Notice, PushLink, Segmented, StatusBadge } from '../../components/ui';
import { addDays, formatDateTime, todayInSalon, zoned } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { formatINR } from '../../lib/money';
import { supabase } from '../../lib/supabase';

type Row = { id: string; invoice_no: string; created_at: string; status: string; total_paise: number; tip_paise: number; paid_paise: number;
  clients: { full_name: string; phone: string } | null };
type Filter = 'all' | 'due' | 'void';

export function SalesPage() {
  const { salon } = useSalon();
  const tz = salon.timezone;
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) || 'all';
  const today = todayInSalon(tz);
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim().toLowerCase());
  const base = `/s/${salon.slug}`;

  const rows = useQuery({
    queryKey: ['invoices', salon.id, filter, from, to],
    queryFn: async () => {
      let query = supabase.from('invoices').select('id, invoice_no, created_at, status, total_paise, tip_paise, paid_paise, clients(full_name, phone)')
        .eq('salon_id', salon.id).order('created_at', { ascending: false }).limit(400);
      if (filter === 'due') query = query.in('status', ['partial', 'unpaid']);
      else {
        query = query.gte('created_at', zoned(from, '00:00', tz).toISOString()).lt('created_at', zoned(addDays(to, 1), '00:00', tz).toISOString());
        if (filter === 'void') query = query.eq('status', 'void');
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  const list = (rows.data ?? []).filter((r) => !q || `${r.invoice_no} ${r.clients?.full_name ?? ''} ${r.clients?.phone ?? ''}`.toLowerCase().includes(q));
  const sum = list.filter((r) => r.status !== 'void').reduce((a, r) => a + r.total_paise + r.tip_paise, 0);
  const due = (r: Row) => r.total_paise + r.tip_paise - r.paid_paise;

  return (
    <div className="stack lg">
      <div className="page-head">
        <h1>Sales</h1>
        <Link className="btn primary" to={`${base}/sales/new`} aria-label="New bill"><Plus size={18} /> <span className="btn-text">New bill</span></Link>
      </div>
      <div className="stack">
        <div className="search"><Search size={18} />
          <input className="input" type="search" placeholder="Bill number, client or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search bills" /></div>
        <div className="row">
          <Segmented label="Filter bills" value={filter} onChange={(v) => setParams((p) => { p.set('filter', v); return p; }, { replace: true })}
            options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Dues' }, { value: 'void', label: 'Void' }]} />
          {filter !== 'due' && (
            <div className="row">
              <input type="date" className="input" style={{ width: 'auto', minHeight: 42 }} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
              <span className="muted">to</span>
              <input type="date" className="input" style={{ width: 'auto', minHeight: 42 }} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
            </div>
          )}
        </div>
      </div>

      {rows.isPending ? <Loading /> : rows.error ? <Notice tone="bad">{errorMessage(rows.error)}</Notice> : list.length === 0 ? (
        <div className="card"><Empty title={filter === 'due' ? 'No pending dues' : 'No bills in this period'}>
          {filter === 'all' && <Link className="btn primary" to={`${base}/sales/new`}><Plus size={18} /> Create a bill</Link>}</Empty></div>
      ) : (
        <>
          <p className="muted">{list.length} bill{list.length === 1 ? '' : 's'} · <b className="num" style={{ color: 'var(--ink)' }}>{formatINR(sum)}</b></p>
          <ul className="list card flush">
            {list.map((r) => (
              <li key={r.id}>
                <PushLink className="item" to={`${base}/sales/${r.id}`}>
                  <span className="main-col">
                    <span className="title">{r.clients?.full_name ?? 'Walk-in customer'}</span>
                    <span className="meta"><span className="num">{r.invoice_no}</span><span>{formatDateTime(r.created_at, tz)}</span></span>
                  </span>
                  <span className="end-col">
                    <b className="num">{formatINR(r.total_paise + r.tip_paise)}</b>
                    {['partial', 'unpaid'].includes(r.status) ? <span className="amount-due num" style={{ fontSize: 'var(--t-sm)' }}>{formatINR(due(r))} due</span> : <StatusBadge status={r.status} />}
                  </span>
                </PushLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
