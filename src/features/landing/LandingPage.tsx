import {
  BarChart3, CalendarDays, Check, ChevronDown, IndianRupee, Minus, Package, Plus, Receipt, Scissors, Settings, UserRound, Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/ui';
import { waText } from '../../components/salon';
import { formatINR } from '../../lib/money';
import './landing.css';

const BRAND = `${import.meta.env.BASE_URL}brand/`;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------- demo salon
   One made-up salon used across the page, with the same stylists and
   colours as the "Load demo data" button inside the app. */

const TEAM = [
  { id: 'anu', name: 'Anu', role: 'Senior stylist', color: '#f9a8d4' },
  { id: 'rinu', name: 'Rinu', role: 'Hair colour', color: '#93c5fd' },
  { id: 'sajith', name: 'Sajith', role: 'Barber', color: '#86efac' },
  { id: 'meghna', name: 'Meghna', role: 'Skin and bridal', color: '#c4b5fd' },
] as const;
type StylistId = (typeof TEAM)[number]['id'];
const colorOf = (id: StylistId) => TEAM.find((t) => t.id === id)!.color;

const OPEN_MIN = 10 * 60; // calendar starts 10:00
const HOURS = 9; // 10:00 – 19:00

function hhmm(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
const hourLabel = (h: number) => `${h > 12 ? h - 12 : h} ${h >= 12 ? 'pm' : 'am'}`;

// [stylist, start (minutes from 10:00), length, client, service]
const DAY: [StylistId, number, number, string, string][] = [
  ['anu', 0, 45, 'Lakshmi Nair', 'Haircut + blow-dry'],
  ['anu', 60, 60, 'Fathima Rizwan', 'Hair spa'],
  ['anu', 180, 45, 'Divya Mathew', 'Haircut'],
  ['anu', 300, 90, 'Anjali Varma', 'Smoothening'],
  ['rinu', 30, 120, 'Aparna Pillai', 'Global colour'],
  ['rinu', 210, 150, 'Gayathri Krishnan', 'Keratin'],
  ['rinu', 420, 60, 'Reshma Sunil', 'Root touch-up'],
  ['sajith', 0, 30, 'Arjun Das', 'Beard trim'],
  ['sajith', 45, 30, 'Nikhil Varghese', 'Haircut'],
  ['sajith', 120, 30, 'Vishnu Rajan', 'Haircut'],
  ['sajith', 180, 45, 'Rahul Menon', 'Haircut + beard'],
  ['sajith', 300, 30, 'Kevin Joseph', 'Haircut'],
  ['sajith', 390, 30, 'Abhijith P', 'Beard trim'],
  ['meghna', 15, 60, 'Meera Menon', 'Facial'],
  ['meghna', 120, 45, 'Sneha Thomas', 'Manicure'],
  ['meghna', 240, 120, 'Neethu Babu', 'Bridal trial'],
];
const ONLINE: [StylistId, number, number, string, string] = ['anu', 390, 45, 'Haritha S', 'Haircut'];

/* --------------------------------------------------------------- hero */

function HeroDay() {
  const [online, setOnline] = useState(() => reduced());
  useEffect(() => {
    if (reduced()) return;
    const t = setTimeout(() => setOnline(true), 2600);
    return () => clearTimeout(t);
  }, []);
  const items = online ? [...DAY, ONLINE] : DAY;

  return (
    <div className="lp-win" aria-label="XS Salon calendar for a busy Saturday">
      <aside className="lp-win-side" aria-hidden="true">
        <img src={`${BRAND}badge-white.svg`} alt="" width={26} height={26} />
        {[CalendarDays, Receipt, Users, Scissors, UserRound, Package, BarChart3, Settings].map((I, i) => (
          <span key={i} className={i === 0 ? 'on' : ''}><I size={18} strokeWidth={1.8} /></span>
        ))}
      </aside>
      <div className="lp-win-main">
        <div className="lp-win-bar">
          <div>
            <b>Saturday, 21 November</b>
            <span className="lp-win-stats">
              <span><b className="num">{online ? 17 : 16}</b> appointments</span>
              <span><b className="num">{online ? 7 : 6}</b> booked online</span>
            </span>
          </div>
          <span className="lp-win-new"><Plus size={16} /> New booking</span>
        </div>
        <div className="lp-day" style={{ ['--hours' as string]: HOURS }}>
          <div className="lp-day-head">
            <span />
            {TEAM.map((t) => (
              <span key={t.id}><i className="dot" style={{ background: t.color }} />{t.name}</span>
            ))}
          </div>
          <div className="lp-day-grid">
            <div className="lp-day-times">
              {Array.from({ length: HOURS }, (_, i) => <span key={i}>{hourLabel(10 + i)}</span>)}
            </div>
            {TEAM.map((t, col) => (
              <div key={t.id} className="lp-day-col">
                {items.filter(([s]) => s === t.id).map(([s, start, len, client, svc], i) => {
                  const isNew = online && client === ONLINE[3];
                  return (
                    <div
                      key={client}
                      className={`lp-blk ${isNew ? 'new' : ''} ${len <= 30 ? 'short' : ''}`}
                      style={{
                        top: `calc(${start} / 60 * var(--hh))`, height: `calc(${len} / 60 * var(--hh) - 3px)`,
                        ['--c' as string]: colorOf(s), ['--d' as string]: `${700 + col * 90 + i * 70}ms`,
                      }}
                    >
                      <b>{client}</b>
                      {len > 30 && <span>{svc}</span>}
                      {isNew && <em>Booked online</em>}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="lp-now" style={{ top: `calc(${(16 * 60 + 10 - OPEN_MIN)} / 60 * var(--hh))` }} />
          </div>
        </div>
      </div>
      <div className={`lp-win-toast ${online ? 'show' : ''}`} role="status">
        <span className="dot" style={{ background: colorOf('anu') }} />
        <span><b>New online booking</b>Haritha S, haircut with Anu at 4:30 pm</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- booking demo */

const SERVICES = [
  { id: 'cut', name: 'Haircut', min: 30, price: 30000 },
  { id: 'spa', name: 'Hair spa', min: 60, price: 150000 },
  { id: 'colour', name: 'Global colour', min: 120, price: 250000 },
  { id: 'mani', name: 'Manicure', min: 45, price: 60000 },
] as const;
const SLOTS = [600, 630, 660, 720, 750, 870, 900, 960, 990, 1050];
const TAKEN = new Set([630, 720, 900, 990]);

function BookingDemo() {
  const [svc, setSvc] = useState<(typeof SERVICES)[number] | null>(null);
  const [who, setWho] = useState<StylistId | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const step = done ? 4 : !svc ? 1 : !who ? 2 : at === null ? 3 : 3;
  const reset = () => { setSvc(null); setWho(null); setAt(null); setDone(false); };

  return (
    <div className="lp-bk">
      <div className="lp-bk-phone">
        <div className="lp-bk-screen">
          <div className="lp-bk-top">
            <span className="lp-bk-logo">GS</span>
            <div><b>Glow Studio</b><small>Kadavanthra, Kochi</small></div>
          </div>
          <ol className="lp-bk-steps" aria-label="Booking steps">
            {['Service', 'Stylist', 'Time'].map((s, i) => (
              <li key={s} className={step > i + 1 ? 'done' : step === i + 1 ? 'on' : ''}>{s}</li>
            ))}
          </ol>

          {done ? (
            <div className="lp-bk-done" role="status">
              <span className="lp-bk-tick"><Check size={26} strokeWidth={2.4} /></span>
              <h4>You’re booked</h4>
              <p>{svc!.name} with {TEAM.find((t) => t.id === who)!.name}<br />Saturday, 21 November at {hhmm(at!)}</p>
              <p className="lp-bk-where">At the salon, it’s already in {TEAM.find((t) => t.id === who)!.name}’s column. Nobody had to pick up the phone.</p>
              <button className="lp-bk-link" onClick={reset}>Book another</button>
            </div>
          ) : (
            <div className="lp-bk-body">
              {step === 1 && (
                <>
                  <h4>What would you like?</h4>
                  {SERVICES.map((s) => (
                    <button key={s.id} className="lp-bk-opt" onClick={() => setSvc(s)}>
                      <span><b>{s.name}</b><small>{s.min} min</small></span>
                      <span className="num">{formatINR(s.price)}</span>
                    </button>
                  ))}
                </>
              )}
              {step === 2 && (
                <>
                  <button className="lp-bk-back" onClick={() => setSvc(null)}>{svc!.name}, change</button>
                  <h4>Who should do it?</h4>
                  {TEAM.map((t) => (
                    <button key={t.id} className="lp-bk-opt" onClick={() => setWho(t.id)}>
                      <span className="lp-bk-who"><i style={{ background: t.color }}>{t.name[0]}</i><span><b>{t.name}</b><small>{t.role}</small></span></span>
                    </button>
                  ))}
                </>
              )}
              {step === 3 && (
                <>
                  <button className="lp-bk-back" onClick={() => { setWho(null); setAt(null); }}>
                    {svc!.name} with {TEAM.find((t) => t.id === who)!.name}, change
                  </button>
                  <h4>Saturday, 21 November</h4>
                  <div className="lp-bk-slots">
                    {SLOTS.map((m) => (
                      <button key={m} disabled={TAKEN.has(m)} aria-pressed={at === m} onClick={() => setAt(m)}>{hhmm(m)}</button>
                    ))}
                  </div>
                  <button className="lp-bk-cta" disabled={at === null} onClick={() => setDone(true)}>
                    {at === null ? 'Pick a time' : `Book ${hhmm(at)}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lp-bk-cal" aria-live="polite">
        <div className="lp-bk-cal-head">Your calendar, at the front desk</div>
        <div className="lp-bk-cal-cols">
          {TEAM.map((t) => (
            <div key={t.id} className={`lp-bk-cal-col ${who === t.id ? 'pick' : ''}`}>
              <span className="lp-bk-cal-name"><i className="dot" style={{ background: t.color }} />{t.name}</span>
              <div className="lp-bk-cal-track">
                {done && who === t.id && (
                  <div className="lp-bk-cal-blk" style={{ ['--c' as string]: t.color, top: `calc(${(at! - 600) / 60} * 52px + 6px)`, height: `calc(${svc!.min / 60} * 52px - 6px)` }}>
                    <b>{hhmm(at!)}</b><span>{svc!.name}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="lp-bk-cal-note">
          {done
            ? `It’s in ${TEAM.find((t) => t.id === who)!.name}’s column now. Nobody picked up the phone.`
            : 'Try the booking page. The booking shows up here the moment it’s made.'}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the bill */

const LINES = [
  { what: 'Global hair colour', who: 'rinu' as StylistId, amount: 250000 },
  { what: 'Hair spa', who: 'anu' as StylistId, amount: 150000 },
  { what: 'Argan oil shampoo', who: null, amount: 95000 },
];
const SUB = LINES.reduce((s, l) => s + l.amount, 0);
const DISC = Math.round(SUB * 0.1);
const TOTAL = SUB - DISC;
const TAXABLE = Math.round(TOTAL / 1.18);
const GST = TOTAL - TAXABLE;

function Receipt_() {
  return (
    <div className="lp-rc" aria-label="Sample bill">
      <div className="lp-rc-head">
        <div><b>Glow Studio</b><small>Bill GS-0418 · 21 Nov 2026, 5:42 pm</small></div>
        <span className="lp-rc-paid">Paid</span>
      </div>
      <div className="lp-rc-client">Aparna Pillai</div>
      {LINES.map((l) => (
        <div key={l.what} className="lp-rc-line">
          <span>{l.what}{l.who && <small><i className="dot" style={{ background: colorOf(l.who) }} />{TEAM.find((t) => t.id === l.who)!.name}</small>}</span>
          <span className="num">{formatINR(l.amount)}</span>
        </div>
      ))}
      <div className="lp-rc-line sub"><span>Discount 10%</span><span className="num">−{formatINR(DISC)}</span></div>
      <div className="lp-rc-tax">
        <div><span>Taxable value</span><span className="num">{formatINR(TAXABLE)}</span></div>
        <div><span>CGST 9%</span><span className="num">{formatINR(GST / 2)}</span></div>
        <div><span>SGST 9%</span><span className="num">{formatINR(GST / 2)}</span></div>
      </div>
      <div className="lp-rc-total"><span>Total, GST included</span><span className="num">{formatINR(TOTAL)}</span></div>
      <div className="lp-rc-pay">
        <span>UPI <b className="num">{formatINR(400000)}</b></span>
        <span>Cash <b className="num">{formatINR(TOTAL - 400000)}</b></span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ owner's phone */

function OwnerPhone() {
  const methods: [string, number][] = [['UPI', 1135000], ['Cash', 620000], ['Card', 90000]];
  return (
    <div className="lp-own" aria-label="The owner's home screen in XS Salon">
      <div className="lp-own-screen">
        <small>Saturday, 21 November</small>
        <b className="lp-own-hi">Good evening</b>
        <div className="lp-own-sales">
          <span>Sales today · 23 bills</span>
          <b className="num">{formatINR(methods.reduce((t, [, v]) => t + v, 0))}</b>
          <div className="lp-own-methods">
            {methods.map(([k, v]) => <span key={k}>{k} <b className="num">{formatINR(v)}</b></span>)}
          </div>
        </div>
        <div className="lp-own-stats">
          <div><span><CalendarDays size={15} />Appointments</span><b className="num">17</b><small>3 still to come · 7 online</small></div>
          <div><span><IndianRupee size={15} />Dues</span><b className="num due">{formatINR(120000)}</b><small>2 clients</small></div>
          <div><span><Package size={15} />Low stock</span><b className="num">2</b><small>items to reorder</small></div>
          <div><span><Users size={15} />New clients</span><b className="num">38</b><small>this month</small></div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- WhatsApp */

function WhatsAppDemo() {
  const [lang, setLang] = useState<'en' | 'ml'>('en');
  const tz = 'Asia/Kolkata';
  const msgs = [
    { k: 'reminder' as const, f: { name: 'Lakshmi Nair', start: '2026-11-21T11:00:00Z', services: 'Haircut' }, t: 'Fri, 7:30 pm' },
    { k: 'thanks' as const, f: { name: 'Lakshmi Nair' }, t: 'Sat, 5:50 pm' },
    { k: 'birthday' as const, f: { name: 'Lakshmi Nair' }, t: '3 Dec, 9:00 am' },
  ];
  return (
    <div className="lp-wa">
      <div className="lp-wa-switch" role="group" aria-label="Message language">
        <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        <button aria-pressed={lang === 'ml'} onClick={() => setLang('ml')} lang="ml">മലയാളം</button>
      </div>
      <div className="lp-wa-chat" lang={lang}>
        <div className="lp-wa-top"><span className="lp-bk-logo">GS</span><b>Glow Studio</b></div>
        <div className="lp-wa-msgs">
          {msgs.map((m) => (
            <div key={m.k + lang} className="lp-wa-msg">
              <p>{waText(m.k, lang, m.f, 'Glow Studio', tz)}</p>
              <small>{m.t}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- reference */

const ROLES = ['Owner', 'Manager', 'Reception', 'Stylist'] as const;
const MATRIX: [string, boolean[]][] = [
  ['See the calendar and book clients', [true, true, true, true]],
  ['Create bills and take payments', [true, true, true, false]],
  ['Add and edit clients', [true, true, true, false]],
  ['Cancel bills, see reports and expenses', [true, true, false, false]],
  ['Edit services and prices', [true, true, false, false]],
  ['Manage team, commissions and settings', [true, false, false, false]],
];

const GROUPS: [string, string[]][] = [
  ['At the front desk', [
    'A calendar column for every stylist, with working days and hours',
    'A warning before anyone is double-booked',
    'Confirm, check in, reschedule, cancel or mark a no-show',
    'Your own online booking page, no login for clients',
    'Client profiles with visits, favourite services, notes and birthdays',
  ]],
  ['On the bill', [
    'Services, products and custom items on one bill',
    'GST included or added on top, with CGST and SGST shown',
    'Cash, UPI, card or bank, split across methods',
    'Tips, discounts and part-payments that become dues',
    'Print the bill or send it on WhatsApp',
  ]],
  ['For the owner', [
    'Sales by day, top services and payment methods',
    'Commission for every stylist, worked out bill by bill',
    'Stock in and out, with low-stock alerts',
    'Expenses and estimated profit, downloadable as a spreadsheet',
    'A record of every bill, void and change, and who made it',
  ]],
];

const FAQ = [
  ['How much does it cost?', 'The first 14 days are free, with every feature and no card needed. Before your trial ends we’ll share the monthly plan, and you decide then. If you don’t continue, nothing is charged.'],
  ['I’m not registered for GST. Can I still use it?', 'Yes. GST is off unless you turn it on in Settings, so your bills show just the total. If you register later, switch it on and add your GSTIN.'],
  ['Do I need to install anything?', 'No. It runs in the browser on any phone, tablet or laptop. On a phone, choose Add to Home Screen and it opens full-screen like an app.'],
  ['How do clients book online?', 'You get a link like salon.xelorsoft.com/book/your-salon. Put it in your Instagram bio, Google profile and WhatsApp status. Bookings appear in your calendar straight away.'],
  ['Can my stylists have their own login?', 'Yes. Add their email in Team and they sign up with it. Their role decides what they can see and do, so a stylist sees the calendar but not your reports.'],
  ['Does it send WhatsApp messages by itself?', 'No. XS Salon writes the message in English or Malayalam, and one tap opens WhatsApp with it filled in. You or your staff press send, from the salon’s own number.'],
  ['Is my salon’s data kept separate?', 'Yes. Every record belongs to one salon, and the database itself refuses any request that crosses salons. Your data is stored in India.'],
  ['Is my data safe if I stop using it?', 'Nothing is deleted. Your clients, bills and reports stay in your account, and you can download your reports as a spreadsheet any time.'],
  ['Who do I contact if I get stuck?', 'Write to support@xelorsoft.com. A person from our team reads every message and replies.'],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {FAQ.map(([q, a], i) => (
        <div key={q} className={`faq-item ${open === i ? 'open' : ''}`}>
          <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span>{q}</span><ChevronDown size={20} />
          </button>
          <div className="faq-a"><div><p>{a}</p></div></div>
        </div>
      ))}
    </div>
  );
}

function Mark({ dark = true }: { dark?: boolean }) {
  return (
    <span className={`lp-mark ${dark ? 'on-dark' : ''}`}>
      <img src={`${BRAND}${dark ? 'badge-white' : 'badge-black'}.svg`} alt="" width={30} height={30} />
      <span>Salon</span>
    </span>
  );
}

/* ---------------------------------------------------------------- page */

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    document.title = 'XS Salon — Appointments, billing and online booking for salons';
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/" aria-label="XS Salon home"><Mark /></Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#booking">Online booking</a><a href="#billing">Billing</a><a href="#owner">For owners</a><a href="#start">Getting started</a><a href="#faq">Questions</a>
          </nav>
          <div className="row">
            <Link className="btn ghost on-dark" to="/login">Sign in</Link>
            <Link className="btn primary on-dark hide-phone" to="/login?mode=signup">Start free trial</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-hero-copy">
            <h1 className="rise" style={{ ['--d' as string]: '40ms' }}>Your salon, fully booked.</h1>
            <div className="lp-hero-side">
              <p className="rise" style={{ ['--d' as string]: '160ms' }}>
                Bookings, bills and your team in one app. Fewer calls at the front desk, no more paper diary, and today’s sales on your phone wherever you are.
              </p>
              <div className="row rise" style={{ ['--d' as string]: '260ms' }}>
                <Link className="btn primary on-dark lg" to="/login?mode=signup">Start 14-day free trial</Link>
                <a className="btn on-dark lg" href="#booking">Try the booking page</a>
              </div>
              <p className="lp-hero-note rise" style={{ ['--d' as string]: '320ms' }}>No card needed. Nothing to install.</p>
            </div>
          </div>
          <div className="lp-hero-app rise-up" style={{ ['--d' as string]: '300ms' }}>
            <HeroDay />
          </div>
        </div>
      </section>

      <section className="lp-facts" aria-label="At a glance">
        <div className="lp-wrap lp-facts-in">
          <p><b>Nothing to install</b>Works on the phone, tablet or laptop you have</p>
          <p><b>GST only if you need it</b>Leave it off if you’re not registered</p>
          <p><b>English and Malayalam</b>For client messages on WhatsApp</p>
          <p><b>Stored in India</b>Each salon’s records kept separate</p>
        </div>
      </section>

      <section id="booking" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Clients book themselves. Even at midnight.</h2>
            <p>Share one link on Instagram, Google and WhatsApp. Clients choose a service, a stylist and a free time, and it lands straight in your calendar. Try it.</p>
          </div>
          <BookingDemo />
        </div>
      </section>

      <section id="billing" className="lp-section dark">
        <div className="lp-wrap split">
          <div className="lp-head">
            <h2>Bills that add up, to the paisa.</h2>
            <p>Tap the services and products, add a discount, take cash or UPI. XS Salon does the maths and notes which stylist did what.</p>
            <ul className="ticks">
              <li><Check size={18} /> Each stylist’s commission adds up by itself, so month-end has no arguments</li>
              <li><Check size={18} /> If a client pays part now, the rest is saved as due</li>
              <li><Check size={18} /> GST is optional, and only shows when you switch it on</li>
            </ul>
          </div>
          <Receipt_ />
        </div>
      </section>

      <section id="whatsapp" className="lp-section">
        <div className="lp-wrap split">
          <div className="lp-head">
            <h2>The right message, in their language.</h2>
            <p>Reminders, thank-yous, birthday wishes and dues, already written in English or Malayalam with the client’s name and time filled in. One tap opens WhatsApp on your salon’s number.</p>
          </div>
          <WhatsAppDemo />
        </div>
      </section>

      <section id="owner" className="lp-section tint">
        <div className="lp-wrap">
          <div className="split">
            <div className="lp-head">
              <h2>Not at the salon? You still know.</h2>
              <p>Open the app at home and see today’s sales, cash and UPI, who’s booked and what’s still due.</p>
              <ul className="ticks dark-ink">
                <li><Check size={18} /> Every bill shows who made it</li>
                <li><Check size={18} /> Only you or your manager can cancel a bill, and the reason is kept</li>
                <li><Check size={18} /> Expenses and profit for the month, without a notebook</li>
              </ul>
            </div>
            <OwnerPhone />
          </div>
          <h3 className="lp-sub">Who can do what</h3>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead><tr><th />{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
              <tbody>
                {MATRIX.map(([what, allowed]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    {allowed.map((ok, i) => (
                      <td key={i} aria-label={ok ? 'Allowed' : 'Not allowed'}>{ok ? <Check size={18} className="yes" /> : <Minus size={18} className="no" />}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="start" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Set up in one afternoon.</h2>
            <p>No installation and no technician visit. If you can use WhatsApp, you can set this up.</p>
          </div>
          <ol className="lp-steps">
            <li><b>Sign up and name your salon</b><span>Add your address and opening hours.</span></li>
            <li><b>Add your menu and your team</b><span>Services with price and time, and each stylist’s working days. Or tap Load sample data to look around first.</span></li>
            <li><b>Share your booking link</b><span>Put it in your Instagram bio and WhatsApp status. Bookings start landing in your calendar.</span></li>
          </ol>
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2>Everything a salon runs on, nothing it doesn’t.</h2>
          </div>
          <div className="lp-groups">
            {GROUPS.map(([title, items]) => (
              <div key={title} className="lp-group">
                <h3>{title}</h3>
                <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="lp-section tint">
        <div className="lp-wrap narrow">
          <div className="lp-head"><h2>Questions owners ask</h2></div>
          <Faq />
        </div>
      </section>

      <section className="lp-section dark cta">
        <div className="lp-wrap">
          <div className="cta-in">
            <h2>Try it on this weekend’s rush.</h2>
            <p>14 days, every feature, your own salon. Load sample data in one tap to see it full.</p>
            <div className="row">
              <Link className="btn primary on-dark lg" to="/login?mode=signup">Start free trial</Link>
              <Link className="btn on-dark lg" to="/login">Sign in</Link>
            </div>
            <p className="cta-note">Questions first? Write to <a href="mailto:support@xelorsoft.com">support@xelorsoft.com</a></p>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <Mark dark={false} />
            <p>Appointments, billing and online booking for salons in India.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#booking">Online booking</a>
            <a href="#billing">Billing</a>
            <a href="#features">Features</a>
            <a href="#faq">Questions</a>
            <Link to="/login">Sign in</Link>
          </nav>
          <nav aria-label="Xelorsoft">
            <a href="https://xelorsoft.com">Xelorsoft</a>
            <a href="https://xsconnect.xelorsoft.com">XS Connect</a>
            <a href="mailto:support@xelorsoft.com">support@xelorsoft.com</a>
          </nav>
        </div>
        <div className="lp-wrap lp-foot-base">
          <a href="https://xelorsoft.com" aria-label="Xelorsoft"><Logo width={96} /></a>
          <span>© 2026 Xelorsoft</span>
        </div>
      </footer>
    </div>
  );
}
