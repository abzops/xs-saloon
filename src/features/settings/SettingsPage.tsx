import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, LogOut, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useSalon } from '../../app/salon';
import { AppearanceControl } from '../../components/Appearance';
import { Field, Notice, Sheet, useToast } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { rpc, supabase } from '../../lib/supabase';
import { ROLE_LABEL } from '../../lib/types';

export function SettingsPage() {
  const { salon, can, role } = useSalon();
  const qc = useQueryClient();
  const toast = useToast();
  const owner = can('settings.manage');
  const [f, setF] = useState({
    name: salon.name, phone: salon.phone ?? '', email: salon.email ?? '', address: salon.address ?? '', city: salon.city ?? '',
    open_time: salon.open_time.slice(0, 5), close_time: salon.close_time.slice(0, 5), slot_minutes: salon.slot_minutes,
    booking_enabled: salon.booking_enabled, booking_note: salon.booking_note ?? '', gst_enabled: salon.gst_enabled, gstin: salon.gstin ?? '',
    gst_pct: String(salon.gst_rate_bp / 100), prices_include_tax: salon.prices_include_tax, invoice_prefix: salon.invoice_prefix,
  });
  const [demo, setDemo] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const link = `${window.location.origin}/book/${salon.slug}`;

  const save = useMutation({
    mutationFn: async () => {
      if (f.gst_enabled && f.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gstin.toUpperCase())) throw new Error('GSTIN looks invalid');
      if (f.close_time <= f.open_time) throw new Error('Closing time must be after opening time');
      const { error } = await supabase.from('salons').update({
        name: f.name.trim(), phone: f.phone || null, email: f.email || null, address: f.address || null, city: f.city || null,
        open_time: f.open_time, close_time: f.close_time, slot_minutes: Number(f.slot_minutes), booking_enabled: f.booking_enabled,
        booking_note: f.booking_note || null, gst_enabled: f.gst_enabled, gstin: f.gstin ? f.gstin.toUpperCase() : null,
        gst_rate_bp: Math.round(Number(f.gst_pct) * 100), prices_include_tax: f.prices_include_tax,
        invoice_prefix: f.invoice_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'INV', updated_at: new Date().toISOString(),
      }).eq('id', salon.id);
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['salon'] }); toast('Settings saved'); },
  });
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Booking link copied'); } catch { window.prompt('Copy your booking link', link); } };

  return (
    <div className="stack xl">
      <div className="page-head"><h1>Settings</h1></div>

      <div className="card appearance-row"><h2>Appearance</h2><AppearanceControl /></div>

      <section className="card stack lg">
        <h2>Online booking</h2>
        <p className="muted">Share this link on your Instagram bio, Google profile and WhatsApp. Clients choose services, a stylist and a free slot; the booking lands in your calendar instantly.</p>
        <div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" readOnly value={link} aria-label="Booking link" />
          <button className="btn icon-btn" onClick={copy} aria-label="Copy link"><Copy size={18} /></button>
          <a className="btn icon-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open booking page"><ExternalLink size={18} /></a></div>
        <a className="btn wa" style={{ justifySelf: 'start' }} target="_blank" rel="noopener noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`Book your next appointment at ${salon.name}: ${link}`)}`}><MessageCircle size={18} /> Share on WhatsApp</a>
        {owner && <>
          <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.booking_enabled} onChange={(e) => setF({ ...f, booking_enabled: e.target.checked })} />
            <span className="grow">Accept online bookings</span></label>
          <Field label="Note shown to clients (optional)"><input className="input" value={f.booking_note} onChange={set('booking_note')} placeholder="e.g. Please arrive 5 minutes early" /></Field>
        </>}
      </section>

      {owner ? (
        <>
          <section className="card stack lg">
            <h2>Salon</h2>
            <div className="grid-2">
              <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
              <Field label="Phone"><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
              <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
            </div>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          </section>
          <section className="card stack lg">
            <h2>Hours and calendar</h2>
            <div className="grid-2">
              <Field label="Opens"><input className="input" type="time" value={f.open_time} onChange={set('open_time')} /></Field>
              <Field label="Closes"><input className="input" type="time" value={f.close_time} onChange={set('close_time')} /></Field>
            </div>
            <Field label="Booking slots"><select className="input" value={f.slot_minutes} onChange={(e) => setF({ ...f, slot_minutes: Number(e.target.value) })}>
              {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>Every {m} minutes</option>)}</select></Field>
          </section>
          <section className="card stack lg">
            <h2>GST and bills</h2>
            <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.gst_enabled} onChange={(e) => setF({ ...f, gst_enabled: e.target.checked })} />
              <span className="grow">Charge GST on bills</span></label>
            {f.gst_enabled && (
              <div className="grid-2">
                <Field label="GSTIN"><input className="input" value={f.gstin} onChange={set('gstin')} placeholder="32ABCDE1234F1Z5" /></Field>
                <Field label="Rate"><select className="input" value={f.gst_pct} onChange={set('gst_pct')}>{['5', '12', '18', '28'].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
                <Field label="Menu prices"><select className="input" value={f.prices_include_tax ? '1' : '0'} onChange={(e) => setF({ ...f, prices_include_tax: e.target.value === '1' })}>
                  <option value="1">Include GST</option><option value="0">Exclude GST (added on bill)</option></select></Field>
              </div>
            )}
            <Field label="Bill number prefix" hint={`Next bill: ${(f.invoice_prefix || 'INV').toUpperCase()}-YYMM-${String(salon.invoice_seq + 1).padStart(4, '0')}`}>
              <input className="input" style={{ maxWidth: 180 }} value={f.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
          </section>
          {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
          <button className="btn primary block xl" disabled={save.isPending || f.name.trim().length < 2} onClick={() => save.mutate()}>Save settings</button>
          <section className="card stack">
            <h2>Demo data</h2>
            <p className="muted">Fill a new salon with a sample team, 60+ clients, six weeks of bills and upcoming appointments — for walkthroughs and sales demos. Only works on a fresh salon.</p>
            <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setDemo(true)}>Load demo data</button>
          </section>
        </>
      ) : <Notice tone="info">Only the salon owner can change salon settings. You are signed in as {ROLE_LABEL[role]}.</Notice>}

      <section className="card row" style={{ justifyContent: 'space-between' }}>
        <div><h2>Account</h2><p className="muted" style={{ fontSize: 'var(--t-sm)' }}>XS Salon by Xelorsoft · support@xelorsoft.com</p></div>
        <button className="btn" onClick={() => supabase.auth.signOut()}><LogOut size={18} /> Sign out</button>
      </section>
      {demo && <DemoSheet onClose={() => setDemo(false)} />}
    </div>
  );
}

function DemoSheet({ onClose }: { onClose: () => void }) {
  const { salon } = useSalon();
  const qc = useQueryClient();
  const toast = useToast();
  const run = useMutation({
    mutationFn: () => rpc('seed_demo_data', { p_salon: salon.id }),
    onSuccess: async () => { await qc.invalidateQueries(); toast('Demo data added'); onClose(); },
  });
  return (
    <Sheet title="Load demo data" onClose={onClose}>
      <div className="stack lg">
        <Notice tone="warn">Adds sample stylists, services, products, clients, bills and appointments to {salon.name}. Use it on a demo salon, not a live one.</Notice>
        {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        <button className="btn primary block xl" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <span className="spinner" /> : 'Add demo data'}</button>
      </div>
    </Sheet>
  );
}
