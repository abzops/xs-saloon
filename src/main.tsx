import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import './styles/app.css';
import './styles/elevation.css';
import './styles/salon.css';
import './lib/theme';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter, createRoutesFromElements, Link, Navigate, Outlet, Route, RouterProvider, useParams,
} from 'react-router';
import { AuthProvider, useAuth } from './app/auth';
import { SalonProvider, useMySalons, useSalon, useSalonBySlug } from './app/salon';
import { Shell } from './app/Shell';
import { Empty, Loading, Notice, ToastProvider } from './components/ui';
import { LoginPage, SetNewPassword, SetupSalon } from './features/auth/AuthPages';
import { Dashboard } from './features/dashboard/Dashboard';
import { CalendarPage } from './features/calendar/CalendarPage';
import { LandingPage } from './features/landing/LandingPage';
import { errorMessage } from './lib/errors';

const SalesPage = lazy(() => import('./features/sales/SalesPage').then((m) => ({ default: m.SalesPage })));
const NewBillPage = lazy(() => import('./features/sales/NewBillPage').then((m) => ({ default: m.NewBillPage })));
const InvoicePage = lazy(() => import('./features/sales/InvoicePage').then((m) => ({ default: m.InvoicePage })));
const ClientsPage = lazy(() => import('./features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ClientDetail = lazy(() => import('./features/clients/ClientDetail').then((m) => ({ default: m.ClientDetail })));
const ServicesPage = lazy(() => import('./features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const TeamPage = lazy(() => import('./features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BookingPage = lazy(() => import('./features/booking/BookingPage').then((m) => ({ default: m.BookingPage })));

// Refuse to render inside a frame.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  throw new Error('Framing is not allowed');
}

window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { name?: string; message?: string } | undefined;
  if ((r?.name === 'InvalidStateError' || r?.name === 'AbortError') && /transition/i.test(r.message ?? '')) e.preventDefault();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

function Splash() {
  return <div className="center-screen" aria-busy="true"><span className="spinner" /></div>;
}

function RequireAuth() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <Splash />;
  if (recovering) return <SetNewPassword />;
  if (!session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Signed out: landing page. Signed in: straight to the salon. */
function Root() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <Splash />;
  if (recovering) return <SetNewPassword />;
  if (!session) return <LandingPage />;
  return <Home />;
}

function Home() {
  const salons = useMySalons();
  if (salons.isPending) return <Splash />;
  if (salons.error) return <div className="center-screen"><Notice tone="bad">{errorMessage(salons.error)}</Notice></div>;
  if (salons.data.length === 0) return <Navigate to="/setup" replace />;
  const saved = localStorage.getItem('xs-salon');
  const pick = salons.data.find((s) => s.slug === saved) ?? salons.data[0];
  return <Navigate to={`/s/${pick.slug}`} replace />;
}

function SalonLayout() {
  const { slug } = useParams();
  const ctx = useSalonBySlug(slug);
  if (ctx.isPending) return <Splash />;
  if (ctx.error) return <div className="center-screen"><Notice tone="bad">{errorMessage(ctx.error)}</Notice></div>;
  if (!ctx.data) {
    return <div className="center-screen"><Empty title="Salon not found"><Link className="btn" to="/">Go home</Link></Empty></div>;
  }
  try { localStorage.setItem('xs-salon', ctx.data.salon.slug); } catch { /* storage blocked */ }
  return <SalonProvider value={ctx.data}><Shell /></SalonProvider>;
}

function Allow({ perm, children }: { perm?: string; children: ReactNode }) {
  const { can } = useSalon();
  if (perm && !can(perm)) return <Empty title="No access">Ask the salon owner for access.</Empty>;
  return <Suspense fallback={<Loading rows={5} />}>{children}</Suspense>;
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book/:slug" element={<Suspense fallback={<Splash />}><BookingPage /></Suspense>} />
      <Route element={<RequireAuth />}>
        <Route path="/setup" element={<SetupSalon />} />
        <Route path="/s/:slug" element={<SalonLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="sales" element={<Allow perm="billing.create"><SalesPage /></Allow>} />
          <Route path="sales/new" element={<Allow perm="billing.create"><NewBillPage /></Allow>} />
          <Route path="sales/:invoiceId" element={<Allow><InvoicePage /></Allow>} />
          <Route path="clients" element={<Allow><ClientsPage /></Allow>} />
          <Route path="clients/:clientId" element={<Allow><ClientDetail /></Allow>} />
          <Route path="services" element={<Allow><ServicesPage /></Allow>} />
          <Route path="team" element={<Allow><TeamPage /></Allow>} />
          <Route path="inventory" element={<Allow><InventoryPage /></Allow>} />
          <Route path="reports" element={<Allow perm="reports.view"><ReportsPage /></Allow>} />
          <Route path="settings" element={<Allow><SettingsPage /></Allow>} />
          <Route path="*" element={<Empty title="Page not found" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
