import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Category, Role, Salon, Service, Staff, Subscription } from '../lib/types';
import { useAuth } from './auth';

export type SalonContextValue = {
  salon: Salon;
  role: Role;
  me: Staff;
  subscription: Subscription | null;
  canWrite: boolean;
  /** UI hint only — the database enforces every permission. */
  can: (permission: string) => boolean;
};

const SalonContext = createContext<SalonContextValue | null>(null);

export function useSalon(): SalonContextValue {
  const value = useContext(SalonContext);
  if (!value) throw new Error('useSalon must be used inside a salon route');
  return value;
}

export function SalonProvider({ value, children }: { value: SalonContextValue; children: ReactNode }) {
  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

/** Salons the signed-in user works at (also links pending staff invites to this account). */
export function useMySalons() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-salons', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      await supabase.rpc('claim_invites');
      const { data, error } = await supabase.rpc('my_salons');
      if (error) throw error;
      return (data ?? []) as { salon_id: string; name: string; slug: string; role: Role; city: string | null }[];
    },
  });
}

/** Loads a salon by slug plus the caller's role, permissions and subscription. */
export function useSalonBySlug(slug: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['salon', slug, session?.user.id],
    enabled: !!slug && !!session,
    queryFn: async (): Promise<SalonContextValue | null> => {
      const { data: salon, error } = await supabase.from('salons').select('*').eq('slug', slug!).maybeSingle();
      if (error) throw error;
      if (!salon) return null;
      const [staff, sub] = await Promise.all([
        supabase.from('salon_staff').select('*').eq('salon_id', salon.id).eq('user_id', session!.user.id).single(),
        supabase.from('salon_subscriptions').select('*').eq('salon_id', salon.id).maybeSingle(),
      ]);
      if (staff.error) throw staff.error;
      const me = staff.data as Staff;
      const perms = await supabase.from('role_permissions').select('permission').eq('role', me.role);
      if (perms.error) throw perms.error;
      const set = new Set(perms.data.map((p) => p.permission as string));
      const subscription = (sub.data ?? null) as Subscription | null;
      // Billing for XS Salon is not live yet: an active salon can always work.
      const canWrite = salon.status === 'active';
      return { salon: salon as Salon, role: me.role, me, subscription, canWrite, can: (p) => set.has(p) };
    },
  });
}

/** Team, service menu and categories: small, shared by most screens. */
export function useCatalog() {
  const { salon } = useSalon();
  const team = useQuery({
    queryKey: ['team', salon.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('salon_staff').select('*').eq('salon_id', salon.id).order('sort').order('display_name');
      if (error) throw error;
      return data as Staff[];
    },
  });
  const services = useQuery({
    queryKey: ['services', salon.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').eq('salon_id', salon.id).order('sort').order('name');
      if (error) throw error;
      return data as Service[];
    },
  });
  const categories = useQuery({
    queryKey: ['categories', salon.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_categories').select('*').eq('salon_id', salon.id).order('sort').order('name');
      if (error) throw error;
      return data as Category[];
    },
  });
  const allTeam = team.data ?? [];
  return {
    loading: team.isPending || services.isPending || categories.isPending,
    error: team.error || services.error || categories.error,
    team: allTeam,
    activeTeam: allTeam.filter((s) => s.status === 'active'),
    bookable: allTeam.filter((s) => s.status === 'active' && s.bookable),
    services: services.data ?? [],
    activeServices: (services.data ?? []).filter((s) => s.status === 'active'),
    categories: categories.data ?? [],
    staffName: (id: string | null | undefined) => allTeam.find((s) => s.id === id)?.display_name ?? '',
    staffColor: (id: string | null | undefined) => allTeam.find((s) => s.id === id)?.color ?? '#8E8E93',
  };
}

/** Invalidates everything that a sale, booking or edit can change. */
export function useRefresh() {
  const qc = useQueryClient();
  const { salon } = useSalon();
  return (...keys: string[]) => Promise.all((keys.length ? keys : ['dashboard', 'appointments', 'invoices', 'clients', 'client', 'report', 'products'])
    .map((k) => qc.invalidateQueries({ queryKey: [k, salon.id] })));
}
