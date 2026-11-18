import { CalendarCheck, Check, ChevronDown, Laptop, MessageCircle, Minus, Receipt, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/ui';
import { formatINR } from '../../lib/money';
import './landing.css';

/* ------------------------------------------------------------------ helpers */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds `.in` once the element scrolls into view (one-shot reveal). */
function Reveal({ children, className = '', as: Tag = 'div', delay = 0 }: {
  children: ReactNode; className?: string; as?: 'div' | 'section' | 'li' | 'article'; delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { el.classList.add('in'); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); }
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref as never} className={`reveal ${className}`} style={{ ['--d' as string]: `${delay}ms` }}>{children}</Tag>;
}

/** True while the element is on screen and the tab is visible — animations pause otherwise. */
function useActive<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    const vis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return [ref, onScreen && visible && !reduced()] as const;
}

/** Smoothly counts a number towards `value` with requestAnimationFrame. */
function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced()) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/* ------------------------------------------------------------- live hero */

// [client, service, stylist, billed paise (0 = just booked online)]
const VISITS = [
  ['Lakshmi Nair', 'Haircut · Anu', 30000], ['Meera Menon', 'Facial · Meghna', 0], ['Arjun Das', 'Beard trim · Sajith', 15000],
  ['Aparna Pillai', 'Global colour · Rinu', 250000], ['Fathima Rizwan', 'Hair spa · Anu', 0], ['Nikhil Varghese', 'Haircut · Sajith', 30000],
  ['Gayathri Krishnan', 'Keratin · Rinu', 450000], ['Sneha Thomas', 'Manicure · Meghna', 0], ['Vishnu Rajan', 'Haircut · Sajith', 30000],
  ['Divya Mathew', 'Clean-up · Meghna', 80000],
] as const;

type Row = { key: number; name: string; what: string; time: string; paid: number };

function clock(minutesAfterTen: number) {
  const h = 10 + Math.floor(minutesAfterTen / 60);
  const m = minutesAfterTen % 60;
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

function LiveDesk() {
  const [ref, active] = useActive<HTMLDivElement>();
  const counter = useRef(4);
  const [rows, setRows] = useState<Row[]>(() =>
    [3, 2, 1, 0].map((i) => ({ key: i, name: VISITS[i][0], what: VISITS[i][1], time: clock(i * 25), paid: VISITS[i][2] })));
  const [sales, setSales] = useState(1845000);
  const [booked, setBooked] = useState(23);
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const n = counter.current++;
      const v = VISITS[n % VISITS.length];
      const row: Row = { key: n, name: v[0], what: v[1], time: clock(100 + n * 15), paid: v[2] };
      setRows((r) => [row, ...r].slice(0, 5));
      if (v[2] > 0) { setSales((c) => c + v[2]); setFlash(n); } else setBooked((b) => b + 1);
    }, 2600);
    return () => clearInterval(id);
  }, [active]);

  const shownSales = useCountUp(sales);
  const shownBooked = useCountUp(booked, 400);

  return (
    <div className="phone" ref={ref} aria-label="XS Salon, live preview">
      <div className="phone-screen">
        <div className="ph-top"><img src={`${import.meta.env.BASE_URL}brand/favicon.svg`} alt="" width={18} height={18} /> Glow Studio</div>
        <div className="ph-today">
          <span className="ph-date">Saturday, 21 November</span>
          <span className="ph-lead num">{formatINR(shownSales)}</span>
          <span className="ph-cap">Sales today</span>
          <div className="ph-figs">
            <span><b className="num">{shownBooked}</b>Appointments</span>
            <span><b className="num">6</b>Booked online</span>
            <span><b className="num">4</b>Stylists</span>
          </div>
        </div>
        <div className="ph-list" style={{ height: 5 * 52 }}>
          {rows.map((r, i) => (
            <div key={r.key} className={`ph-row ${i === 0 ? 'enter' : ''}`} style={{ transform: `translateY(${i * 52}px)`, opacity: i === 4 ? 0 : 1 }}>
              <span className="ph-av">{r.name.split(' ').map((s) => s[0]).join('')}</span>
              <span className="ph-name">{r.name}<small>{r.what}</small></span>
              <span className="ph-end">
                <span className="ph-time num">{r.time}</span>
                {r.paid > 0 ? <span className={`ph-paid ${flash === r.key ? 'pop' : ''}`}>+{formatINR(r.paid)}</span> : <span className="ph-time">Booked online</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ sections */

const STEPS = [
  { title: 'They book themselves', body: 'Your link on Instagram and WhatsApp. Clients pick a service, a stylist and a free slot — at midnight if they like.', ui: <MiniBook /> },
  { title: 'It lands in your calendar', body: 'A column per stylist. No double bookings, no lost diary pages.', ui: <MiniCalendar /> },
  { title: 'Bill in a few taps', body: 'Services already on the bill. Cash, UPI or split. The receipt goes on WhatsApp.', ui: <MiniBill /> },
];

function MiniBook() {
  return <div className="mini"><div className="mini-hit"><b>Haircut</b><small>30 min</small><span className="tag ok">₹300</span></div><div className="mini-btn"><CalendarCheck size={14} /> Sat 21 Nov, 4:30 pm</div></div>;
}
function MiniCalendar() {
  return <div className="mini"><div className="mini-hit"><b>Lakshmi Nair</b><small>4:30 pm · Anu</small><span className="tag ok">Confirmed</span></div><div className="mini-hit"><b>Arjun Das</b><small>5:00 pm · Sajith</small><span className="tag">Online</span></div></div>;
}
function MiniBill() {
  return <div className="mini"><div className="mini-btn"><Receipt size={14} /> Complete bill · ₹1,800</div><div className="mini-toast"><MessageCircle size={14} /> Bill sent to Lakshmi on WhatsApp</div></div>;
}

const BILL = [
  { what: 'Global hair colour · Rinu', amount: 250000, kind: 'charge' },
  { what: 'Hair spa · Anu', amount: 150000, kind: 'charge' },
  { what: 'Argan oil shampoo', amount: 95000, kind: 'charge' },
  { what: 'Discount 10%', amount: -49500, kind: 'pay' },
] as const;

function Bill() {
  let running = 0;
  return (
    <div className="ledger">
      {BILL.map((l, i) => {
        running += l.amount;
        return (
          <Reveal key={i} className="ledger-row" delay={i * 90}>
            <span>{l.what}</span>
            <span className={`num ${l.kind}`}>{l.amount > 0 ? '' : '−'}{formatINR(Math.abs(l.amount))}</span>
            <span className="num bal">{formatINR(running)}</span>
          </Reveal>
        );
      })}
      <Reveal className="ledger-total" delay={BILL.length * 90}>
        <span>Total incl. 18% GST</span><span className="num">{formatINR(running)}</span>
      </Reveal>
    </div>
  );
}

const ROLES = ['Owner', 'Manager', 'Reception', 'Stylist'] as const;
const MATRIX: [string, boolean[]][] = [
  ['See the calendar and book clients', [true, true, true, true]],
  ['Create bills and take payments', [true, true, true, false]],
  ['Add and edit clients', [true, true, true, false]],
  ['Void bills, see reports and expenses', [true, true, false, false]],
  ['Edit services and prices', [true, true, false, false]],
  ['Manage team, commissions and settings', [true, false, false, false]],
];

const FEATURES = [
  ['Appointments', 'A column per stylist, working hours, reschedule, no-shows and a double-booking guard.'],
  ['Online booking', 'Your own booking page. Clients choose services, stylist and a free time slot.'],
  ['Billing and GST', 'Services, products and custom items. GST included or added, CGST and SGST shown.'],
  ['Payments', 'Cash, UPI, card or bank. Split payments, tips and part-payments with dues tracked.'],
  ['Clients', 'Visit history, favourite services, notes, tags and birthdays — all in one profile.'],
  ['WhatsApp', 'Reminders, thank-yous, birthday wishes and bills in English or Malayalam.'],
  ['Team and commission', 'Roles for every person, and commission worked out on every bill.'],
  ['Inventory', 'Retail and salon-use products, stock in and out, low-stock alerts.'],
  ['Reports', 'Sales by day, top services, team performance, expenses and profit. CSV export.'],
  ['Audit trail', 'Every bill, void and change is recorded with who did it.'],
];

const FAQ = [
  ['Is my salon’s data kept separate?', 'Yes. Every record belongs to one salon, and the database itself refuses any request that crosses salons — not just the app screens.'],
  ['Do I need to install anything?', 'No. Open it in the browser on any phone, tablet or laptop. On a phone, Add to Home Screen and it opens full-screen like an app.'],
  ['How do clients book online?', 'You get a link like salon.xelorsoft.com/book/your-salon. Put it in your Instagram bio, Google profile and WhatsApp. Bookings appear in your calendar instantly.'],
  ['Can my stylists have their own login?', 'Yes. Add their email in Team and they sign up with it. Their role decides what they can see and do.'],
  ['What happens after the 14-day trial?', 'Nothing is deleted. Your data stays yours, and you can export it any time.'],
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

/* ---------------------------------------------------------------- page */

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    document.title = 'XS Salon — Salon software by Xelorsoft';
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/" aria-label="XS Salon home"><Logo onDark width={132} /></Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#how">How it works</a><a href="#billing">Billing</a><a href="#features">Features</a><a href="#faq">Questions</a>
          </nav>
          <div className="row">
            <Link className="btn ghost on-dark" to="/login">Sign in</Link>
            <Link className="btn primary on-dark hide-phone" to="/login?mode=signup">Start free trial</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <h1>
              <span className="line" style={{ ['--d' as string]: '60ms' }}>Your salon, fully booked.</span>
              <span className="line" style={{ ['--d' as string]: '160ms' }}>Every bill, every stylist,</span>
              <span className="line" style={{ ['--d' as string]: '260ms' }}>in one place.</span>
            </h1>
            <p className="rise" style={{ ['--d' as string]: '380ms' }}>
              Online booking, a calendar for your team, GST bills, client history and WhatsApp — on the phone, tablet or laptop you already have.
            </p>
            <div className="row rise" style={{ ['--d' as string]: '480ms' }}>
              <Link className="btn primary on-dark lg" to="/login?mode=signup">Start 14-day free trial</Link>
              <Link className="btn on-dark lg" to="/login">Sign in</Link>
            </div>
            <p className="lp-fine rise" style={{ ['--d' as string]: '560ms' }}>Every feature included in the trial. No card needed.</p>
          </div>
          <div className="lp-hero-device rise-up" style={{ ['--d' as string]: '200ms' }}>
            <LiveDesk />
          </div>
        </div>
      </section>

      <section id="how" className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <h2>From booking to bill, without the diary.</h2>
            <p>The whole visit, in three steps.</p>
          </Reveal>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} className="step" delay={i * 120}>
                <div className="step-ui">{s.ui}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="billing" className="lp-section dark">
        <div className="lp-wrap split">
          <Reveal className="lp-head">
            <h2>Bills that add up. To the paisa.</h2>
            <p>Services, products and discounts on one bill, GST worked out for you, and each line credited to the stylist who did it.</p>
            <ul className="ticks">
              <li><Check size={18} /> Commission calculated on every bill, per stylist</li>
              <li><Check size={18} /> Part-payments become dues you can collect later</li>
              <li><Check size={18} /> A mistake is voided with a reason — never silently edited</li>
            </ul>
          </Reveal>
          <Reveal delay={120}><Bill /></Reveal>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <h2>Everyone signs in as themselves.</h2>
            <p>Reception can bill. Only you can void it.</p>
          </Reveal>
          <Reveal className="matrix-wrap" delay={100}>
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
          </Reveal>
        </div>
      </section>

      <section className="lp-section tint">
        <div className="lp-wrap">
          <Reveal className="lp-head center">
            <h2>Built for the chair, the counter and the owner’s desk.</h2>
          </Reveal>
          <div className="devices">
            {[
              { icon: Smartphone, t: 'Phone', d: 'A real app feel: tab bar, swipe-down sheets, add to home screen.' },
              { icon: Tablet, t: 'Tablet', d: 'The reception screen. The day’s calendar and fast billing.' },
              { icon: Laptop, t: 'Laptop', d: 'Reports, team commission and CSV exports at the owner’s desk.' },
            ].map((d, i) => (
              <Reveal key={d.t} className="device-card" delay={i * 110}>
                <d.icon size={28} strokeWidth={1.6} />
                <h3>{d.t}</h3>
                <p>{d.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <h2>Everything a salon runs on, nothing it doesn’t.</h2>
          </Reveal>
          <dl className="features">
            {FEATURES.map(([t, d], i) => (
              <Reveal key={t} className="feature" delay={(i % 2) * 80}>
                <dt>{t}</dt><dd>{d}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-wrap narrow">
          <Reveal className="lp-head"><h2>Questions owners ask</h2></Reveal>
          <Reveal delay={80}><Faq /></Reveal>
        </div>
      </section>

      <section className="lp-section dark cta">
        <div className="lp-wrap">
          <Reveal className="cta-in">
            <h2>Try it on this weekend’s rush.</h2>
            <p>14 days, every feature, your own salon.</p>
            <Link className="btn primary on-dark lg" to="/login?mode=signup">Start free trial</Link>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <Logo width={110} />
          <span>XS Salon by Xelorsoft</span>
          <span>© 2026 Xelorsoft · <a href="mailto:info@xelorsoft.com">info@xelorsoft.com</a></span>
        </div>
      </footer>
    </div>
  );
}
