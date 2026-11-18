export type Role = 'owner' | 'manager' | 'receptionist' | 'stylist';
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', receptionist: 'Receptionist', stylist: 'Stylist' };

export type Salon = {
  id: string; name: string; slug: string; phone: string | null; email: string | null; address: string | null; city: string | null;
  timezone: string; currency: string; gstin: string | null; gst_enabled: boolean; gst_rate_bp: number; prices_include_tax: boolean;
  open_time: string; close_time: string; slot_minutes: number; booking_enabled: boolean; booking_note: string | null;
  invoice_prefix: string; invoice_seq: number; client_seq: number; status: string; onboarded_at: string | null; created_at: string;
};
export type Subscription = { salon_id: string; plan: string; status: 'trialing' | 'active' | 'past_due' | 'cancelled'; trial_ends_at: string; paid_until: string | null };
export type Staff = {
  id: string; salon_id: string; user_id: string | null; role: Role; display_name: string; title: string | null; phone: string | null; email: string | null;
  color: string; commission_bp: number; product_commission_bp: number; bookable: boolean; work_days: number[]; work_start: string | null; work_end: string | null;
  sort: number; status: 'active' | 'inactive';
};
export type Category = { id: string; salon_id: string; name: string; sort: number };
export type Service = {
  id: string; salon_id: string; category_id: string | null; name: string; description: string | null; duration_min: number; price_paise: number;
  gender: 'unisex' | 'women' | 'men'; online_bookable: boolean; sort: number; status: 'active' | 'archived';
};
export type Client = {
  id: string; salon_id: string; client_no: number; full_name: string; phone: string; email: string | null; gender: 'female' | 'male' | 'other' | null;
  date_of_birth: string | null; anniversary: string | null; notes: string | null; tags: string[]; source: string; marketing_opt_in: boolean;
  visit_count: number; total_spent_paise: number; last_visit_at: string | null; status: string; created_at: string;
};
export type ApptStatus = 'booked' | 'confirmed' | 'arrived' | 'in_service' | 'completed' | 'cancelled' | 'no_show';
export type ApptService = { id: string; service_id: string | null; name: string; duration_min: number; price_paise: number; sort: number };
export type Appointment = {
  id: string; salon_id: string; client_id: string; staff_id: string; start_at: string; end_at: string; status: ApptStatus; source: string;
  notes: string | null; cancel_reason: string | null; invoice_id: string | null; created_at: string;
  clients: Pick<Client, 'id' | 'full_name' | 'phone' | 'visit_count' | 'tags' | 'notes'> | null; appointment_services: ApptService[];
};
export type Product = {
  id: string; salon_id: string; name: string; brand: string | null; sku: string | null; kind: 'retail' | 'consumable'; price_paise: number; cost_paise: number;
  stock_qty: number; reorder_level: number; unit: string; status: 'active' | 'archived';
};
export type Method = 'cash' | 'upi' | 'card' | 'bank' | 'other';
export const METHOD_LABEL: Record<Method, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', other: 'Other' };
export const METHODS = Object.keys(METHOD_LABEL) as Method[];
export const SOURCE_LABEL: Record<string, string> = { walk_in: 'Walk-in', phone: 'Phone', online: 'Online', whatsapp: 'WhatsApp', instagram: 'Instagram', referral: 'Referral', other: 'Other' };
