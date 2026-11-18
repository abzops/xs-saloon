import {
  BarChart3, CalendarDays, Home, LogOut, Menu, Package, Receipt, Scissors, Settings, Users, UsersRound,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AppearanceButton, AppearanceControl } from '../components/Appearance';
import { Logo, Notice, Sheet } from '../components/ui';
import { daysBetween, todayInSalon } from '../lib/dates';
import { setTransition } from '../lib/motion';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL } from '../lib/types';
import { useSalon } from './salon';

type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; perm?: string };

const NAV: NavItem[] = [
  { to: '', label: 'Home', icon: Home },
  { to: 'calendar', label: 'Calendar', icon: CalendarDays },
  { to: 'sales', label: 'Sales', icon: Receipt, perm: 'billing.create' },
  { to: 'clients', label: 'Clients', icon: Users },
  { to: 'services', label: 'Services', icon: Scissors },
  { to: 'team', label: 'Team', icon: UsersRound },
  { to: 'inventory', label: 'Inventory', icon: Package },
  { to: 'reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: 'settings', label: 'Settings', icon: Settings },
];

// Transparent badge: black on light backgrounds, white on dark (brand rule).
const mark = `${import.meta.env.BASE_URL}brand/badge-black.svg`;
const markOnDark = `${import.meta.env.BASE_URL}brand/badge-white.svg`;

export function Shell() {
  const { salon, role, can, canWrite, subscription } = useSalon();
  const [more, setMore] = useState(false);
  const location = useLocation();
  const items = NAV.filter((n) => !n.perm || can(n.perm));
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);
  const base = `/s/${salon.slug}`;
  const link = (n: NavItem) => (n.to ? `${base}/${n.to}` : base);
  const onOverflowRoute = overflow.some((n) => location.pathname.startsWith(link(n)));
  const trialDays = subscription?.status === 'trialing'
    ? Math.max(0, daysBetween(todayInSalon(salon.timezone), subscription.trial_ends_at.slice(0, 10)))
    : null;
  const tab = () => setTransition('tab');

  // Liquid Glass tab bar: an indicator glides to the active tab.
  const tabbar = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const active = tabbar.current?.querySelector<HTMLElement>('a.active, button.active');
      const ind = indicator.current;
      if (!ind) return;
      if (!active) { ind.style.opacity = '0'; return; }
      ind.style.opacity = '1';
      ind.style.width = `${active.offsetWidth}px`;
      ind.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [location.pathname, more]);

  return (
    <div className="shell">
      {/* Laptop and tablet landscape: full sidebar. Tablet portrait: icon rail. */}
      <nav className="sidebar" aria-label="Main">
        <Logo onDark width={148} className="logo full" />
        <img className="rail-mark" src={markOnDark} alt="Xelorsoft" width={36} height={36} />
        <div className="gym-block">
          <strong>{salon.name}</strong>
          <span>XS Salon · {ROLE_LABEL[role]}</span>
          {trialDays !== null && <span>Trial ends in {trialDays} day{trialDays === 1 ? '' : 's'}</span>}
        </div>
        {items.map((n) => (
          <NavLink key={n.label} to={link(n)} end={!n.to} onClick={tab} title={n.label}>
            <n.icon size={20} strokeWidth={1.9} /> <span className="nav-label">{n.label}</span>
          </NavLink>
        ))}
        <div className="grow" />
        <AppearanceButton className="signout" />
        <button className="signout" onClick={() => supabase.auth.signOut()} title="Sign out">
          <LogOut size={20} strokeWidth={1.9} /> <span className="nav-label">Sign out</span>
        </button>
      </nav>

      <div className="content">
        <header className="topbar">
          <img className="brand-mark only-light" src={mark} alt="" width={26} height={26} />
          <img className="brand-mark only-dark" src={markOnDark} alt="" width={26} height={26} />
          <span className="gym">{salon.name}</span>
        </header>
        <main className="main">
          {!canWrite && (
            <div style={{ marginBottom: 20 }}>
              <Notice tone="warn">This salon is suspended. You can view and export, but changes are paused.</Notice>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Phone: iOS-style tab bar */}
      <nav className="tabbar" aria-label="Main" ref={tabbar}>
        <span className="tab-indicator" ref={indicator} aria-hidden />
        {primary.map((n) => (
          <NavLink key={n.label} to={link(n)} end={!n.to} onClick={tab}>
            <n.icon size={23} strokeWidth={1.8} /> <span>{n.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className={onOverflowRoute || more ? 'active' : ''} aria-haspopup="dialog">
          <Menu size={23} strokeWidth={1.8} /> <span>More</span>
        </button>
      </nav>

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="appearance-row">
            <span>Appearance</span>
            <AppearanceControl />
          </div>
          <ul className="list grouped">
            {overflow.map((n) => (
              <li key={n.label}>
                <NavLink className="item" to={link(n)} onClick={() => { tab(); setMore(false); }}>
                  <n.icon size={20} /> <span className="main-col"><span className="title">{n.label}</span></span>
                </NavLink>
              </li>
            ))}
            <li>
              <button className="item" onClick={() => supabase.auth.signOut()}>
                <LogOut size={20} /> <span className="main-col"><span className="title">Sign out</span></span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </div>
  );
}
