// Shared salon pieces built on the Xelorsoft UI kit (ui.tsx): client and
// service pickers, a reason sheet, and WhatsApp messages in English or Malayalam.
import { useMutation } from '@tanstack/react-query';
import { MessageCircle, Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useCatalog, useSalon } from '../app/salon';
import { formatDay, formatTime } from '../lib/dates';
import { errorMessage } from '../lib/errors';
import { formatINR } from '../lib/money';
import { rpc, supabase } from '../lib/supabase';
import type { Client } from '../lib/types';
import { Field, Notice, Segmented, Sheet, initials } from './ui';

export type ClientLite = Pick<Client, 'id' | 'full_name' | 'phone' | 'visit_count'> & Partial<Pick<Client, 'tags' | 'notes'>>;

/** Find a client by name or phone, or add a new one inline. */
export function ClientPicker({ value, onChange }: { value: ClientLite | null; onChange: (c: ClientLite | null) => void }) {
  const { salon, can } = useSalon();
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const [results, setResults] = useState<ClientLite[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const add = useMutation({
    mutationFn: async () => {
      const id = await rpc<string>('save_client', { p_salon: salon.id, p_client: null, p_full_name: name.trim(), p_phone: phone });
      const { data, error } = await supabase.from('clients').select('id, full_name, phone, visit_count, tags, notes').eq('id', id).single();
      if (error) throw error;
      return data as ClientLite;
    },
    onSuccess: (c) => { onChange(c); setAdding(false); setName(''); setPhone(''); setTerm(''); },
  });

  useEffect(() => {
    if (!q) { setResults([]); return; }
    let live = true;
    const s = q.replace(/[%,()]/g, '');
    const digits = s.replace(/\D/g, '');
    let query = supabase.from('clients').select('id, full_name, phone, visit_count, tags, notes').eq('salon_id', salon.id).neq('status', 'archived').limit(8);
    query = digits.length >= 3 ? query.ilike('phone', `%${digits}%`) : query.ilike('full_name', `%${s}%`);
    query.then(({ data }) => { if (live) setResults((data ?? []) as ClientLite[]); });
    return () => { live = false; };
  }, [q, salon.id]);

  if (value) {
    return (
      <div className="picked">
        <span className="avatar" aria-hidden>{initials(value.full_name)}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
          <b>{value.full_name}</b>
          <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{value.phone} · {value.visit_count ? `${value.visit_count} visits` : 'New client'}</span>
        </span>
        <button type="button" className="btn small ghost" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  if (adding) {
    return (
      <div className="stack">
        <div className="grid-2">
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="input" placeholder="Phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {add.error && <Notice tone="bad">{errorMessage(add.error)}</Notice>}
        <div className="row">
          <button type="button" className="btn primary small" disabled={add.isPending || !name.trim() || phone.replace(/\D/g, '').length < 10} onClick={() => add.mutate()}>Add client</button>
          <button type="button" className="btn ghost small" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="picker">
      <div className="search">
        <Search size={18} />
        <input className="input" type="search" placeholder="Search name or phone" value={term} aria-label="Search clients"
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)} />
      </div>
      {open && (q || results.length > 0) && (
        <div className="dropdown" role="listbox">
          {results.map((c) => (
            <button type="button" key={c.id} className="item" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c); setTerm(''); setOpen(false); }}>
              <span className="avatar" aria-hidden>{initials(c.full_name)}</span>
              <span className="main-col"><span className="title">{c.full_name}</span><span className="meta"><span>{c.phone}</span><span>{c.visit_count} visits</span></span></span>
            </button>
          ))}
          {can('clients.manage') && (
            <button type="button" className="item" onMouseDown={(e) => e.preventDefault()} onClick={() => {
              setAdding(true); setOpen(false);
              if (term.replace(/\D/g, '').length >= 6) setPhone(term); else setName(term);
            }}>
              <span className="avatar" aria-hidden><Plus size={18} /></span>
              <span className="main-col"><span className="title">Add new client{term.trim() ? ` “${term.trim()}”` : ''}</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Tick one or more services, grouped by category. */
export function ServicePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { activeServices, categories } = useCatalog();
  const [term, setTerm] = useState('');
  const sel = new Set(value);
  const list = activeServices.filter((s) => !term || s.name.toLowerCase().includes(term.toLowerCase()));
  const groups = [...categories, { id: null as string | null, name: 'Other' }]
    .map((c) => ({ c, items: list.filter((s) => (s.category_id ?? null) === c.id) })).filter((g) => g.items.length);
  return (
    <div className="stack">
      <div className="search"><Search size={18} /><input className="input" placeholder="Search services" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      <div className="svc-pick">
        {groups.map((g) => (
          <div key={g.c.id ?? 'other'}>
            <div className="cat">{g.c.name}</div>
            {g.items.map((s) => (
              <label key={s.id} className="check-row">
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => onChange(sel.has(s.id) ? value.filter((x) => x !== s.id) : [...value, s.id])} />
                <span className="grow">{s.name}</span>
                <span className="muted num" style={{ fontSize: 'var(--t-sm)' }}>{s.duration_min} min</span>
                <span className="num" style={{ width: 76, textAlign: 'right', fontWeight: 600 }}>{formatINR(s.price_paise)}</span>
              </label>
            ))}
          </div>
        ))}
        {!groups.length && <p className="muted" style={{ padding: 14 }}>No services found.</p>}
      </div>
    </div>
  );
}

/** Confirm a destructive step with an optional or required reason. */
export function ReasonSheet({ title, warning, confirmLabel, required = true, onClose, onConfirm }: {
  title: string; warning: string; confirmLabel: string; required?: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const run = useMutation({ mutationFn: () => onConfirm(reason.trim()), onSuccess: onClose });
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="stack lg" onSubmit={(e) => { e.preventDefault(); if (!required || reason.trim()) run.mutate(); }}>
        <Notice tone="warn">{warning}</Notice>
        <Field label={required ? 'Reason (required)' : 'Reason (optional)'}>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        <button className="btn danger block" disabled={(required && !reason.trim()) || run.isPending}>{confirmLabel}</button>
      </form>
    </Sheet>
  );
}

/* ---------- WhatsApp ----------
   A ready message in English or Malayalam that staff can edit, then opens
   WhatsApp with it filled in. Nothing is sent automatically. */
export type WaKind = 'reminder' | 'thanks' | 'birthday' | 'dues' | 'rebook' | 'hello';
type Lang = 'en' | 'ml';
export type WaFacts = { name: string; start?: string; services?: string; amountPaise?: number };
const LANG_KEY = 'xs-wa-lang';
const readLang = (): Lang => { try { return localStorage.getItem(LANG_KEY) === 'ml' ? 'ml' : 'en'; } catch { return 'en'; } };

export function waText(kind: WaKind, lang: Lang, f: WaFacts, salon: string, timeZone: string) {
  const first = f.name.split(' ')[0];
  const when = f.start ? `${formatDay(new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(f.start)))}, ${formatTime(f.start, timeZone)}` : '';
  const svc = f.services ?? '';
  const amount = formatINR(f.amountPaise ?? 0);
  if (lang === 'ml') {
    switch (kind) {
      case 'reminder': return `ഹായ് ${first}, ${salon}-ൽ ${when}-ന് നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ് ഉണ്ട് (${svc}). കാണാം!`;
      case 'thanks': return `ഹായ് ${first}, ഇന്ന് ${salon}-ൽ വന്നതിന് നന്ദി! നിങ്ങളുടെ അഭിപ്രായം ഞങ്ങൾക്ക് വിലപ്പെട്ടതാണ്.`;
      case 'birthday': return `ജന്മദിനാശംസകൾ ${first}! 🎉 ഈ ആഴ്ച ${salon}-ൽ നിങ്ങൾക്കായി ഒരു പ്രത്യേക ഓഫർ ഉണ്ട്.`;
      case 'dues': return `ഹായ് ${first}, ${salon}-ൽ ${amount} ബാക്കി അടയ്ക്കാനുണ്ട്. UPI വഴിയോ അടുത്ത സന്ദർശനത്തിലോ അടയ്ക്കാം. നന്ദി!`;
      case 'rebook': return `ഹായ് ${first}, ${salon}-ൽ അടുത്ത അപ്പോയിന്റ്മെന്റ് ബുക്ക് ചെയ്യാൻ സമയമായി. ഏത് ദിവസം സൗകര്യപ്പെടും?`;
      case 'hello': return `ഹായ് ${first}, `;
    }
  }
  switch (kind) {
    case 'reminder': return `Hi ${first}, a reminder of your appointment at ${salon} on ${when} (${svc}). See you soon!`;
    case 'thanks': return `Hi ${first}, thank you for visiting ${salon} today! We'd love to hear how you liked it.`;
    case 'birthday': return `Happy birthday ${first}! 🎉 Here's a little treat from ${salon} — enjoy a special offer on your next visit this week.`;
    case 'dues': return `Hi ${first}, a balance of ${amount} is pending at ${salon}. You can pay by UPI or on your next visit. Thank you!`;
    case 'rebook': return `Hi ${first}, it's been a while! Would you like to book your next appointment at ${salon}? Tell us a day that suits you.`;
    case 'hello': return `Hi ${first}, `;
  }
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export function WhatsAppButton({ phone, kind, facts, label = 'WhatsApp', small = true }: {
  phone: string; kind: WaKind; facts: WaFacts; label?: string; small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn${small ? ' small' : ''} wa`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        aria-label={`${label}: message ${facts.name}`}>
        <MessageCircle size={16} aria-hidden /> <span className="btn-text">{label}</span>
      </button>
      {open && <WhatsAppSheet phone={phone} kind={kind} facts={facts} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppSheet({ phone, kind, facts, onClose }: { phone: string; kind: WaKind; facts: WaFacts; onClose: () => void }) {
  const { salon } = useSalon();
  const [lang, setLangState] = useState<Lang>(readLang);
  const [text, setText] = useState(() => waText(kind, lang, facts, salon.name, salon.timezone));
  const setLang = (l: Lang) => {
    setLangState(l);
    setText(waText(kind, l, facts, salon.name, salon.timezone));
    try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ }
  };
  return (
    <Sheet title={`Message ${facts.name}`} onClose={onClose}>
      <div className="stack lg">
        <Segmented label="Language" value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ml', label: 'മലയാളം' }]} />
        <label className="field"><span>Message</span>
          <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="muted" style={{ margin: 0 }}>Opens WhatsApp with this message to {phone}. You press send there.</p>
        <a className="btn primary block xl wa" href={waLink(phone, text)} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(onClose, 300)}>
          <MessageCircle size={18} aria-hidden /> Open WhatsApp
        </a>
      </div>
    </Sheet>
  );
}
