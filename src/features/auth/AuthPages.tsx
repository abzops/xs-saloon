import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../app/auth';
import { Collapse, Logo, Notice, Segmented, useToast } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { rpc, supabase } from '../../lib/supabase';
import './auth.css';

const appUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
const icon = `${import.meta.env.BASE_URL}brand/icon-512.png`;

/** Apple-style centred column: app icon, large title, grouped fields. */
function AuthLayout({ children, back = true }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="ios-auth">
      {back && (
        <Link className="ios-back" to="/" aria-label="Back to home"><ChevronLeft size={22} /> Home</Link>
      )}
      <main className="ios-auth-col">
        <img className="app-icon" src={icon} alt="XS Salon" width={76} height={76} />
        {children}
      </main>
      <footer className="ios-auth-foot"><Logo width={96} /></footer>
    </div>
  );
}

/** One row of an iOS grouped form; the label floats up while typing. */
function Row({ label, type = 'text', value, onChange, autoComplete, inputMode, trailing, tabIndex }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string;
  inputMode?: 'email' | 'tel' | 'text'; trailing?: ReactNode; tabIndex?: number;
}) {
  const id = useId();
  return (
    <div className="g-row">
      <input id={id} className="g-input" type={type} value={value} placeholder=" " autoComplete={autoComplete}
        inputMode={inputMode} onChange={(e) => onChange(e.target.value)} tabIndex={tabIndex} />
      <label htmlFor={id}>{label}</label>
      {trailing}
    </div>
  );
}

function PasswordRow({ value, onChange, autoComplete, tabIndex }: {
  value: string; onChange: (v: string) => void; autoComplete: string; tabIndex?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <Row label="Password" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} tabIndex={tabIndex}
      trailing={
        <button type="button" className="g-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} tabIndex={tabIndex}>
          {show ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      } />
  );
}

export function LoginPage() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password should be at least 8 characters');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: appUrl() },
        });
        if (error) throw error;
        if (!data.session) setSent(`Check ${email.trim()} for a confirmation link, then sign in.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
        if (error) throw error;
        setSent(`If ${email.trim()} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'signin' ? 'Sign in to XS Salon' : mode === 'signup' ? 'Create your account' : 'Reset password';
  const sub = mode === 'signin' ? 'Welcome back.' : mode === 'signup' ? '14 days free. Every feature.' : 'We’ll email you a link.';
  const action = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link';
  const ready = !!email && (mode === 'reset' || !!password) && (mode !== 'signup' || !!name.trim());

  return (
    <AuthLayout>
      <div className="ios-titles">
        <h1 key={title} className="swap">{title}</h1>
        <p key={sub} className="swap muted">{sub}</p>
      </div>

      {mode !== 'reset' && (
        <Segmented
          label="Account"
          value={mode}
          onChange={(v) => { setMode(v); setError(null); setSent(null); }}
          options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
        />
      )}

      {sent ? (
        <Notice tone="ok">{sent}</Notice>
      ) : (
        <form className="ios-form" onSubmit={submit} noValidate>
          <div className="group">
            <Collapse open={mode === 'signup'}>
              <Row label="Your name" value={name} onChange={setName} autoComplete="name" tabIndex={mode === 'signup' ? 0 : -1} />
            </Collapse>
            <Row label="Email" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="email" />
            <Collapse open={mode !== 'reset'}>
              <PasswordRow value={password} onChange={setPassword} tabIndex={mode !== 'reset' ? 0 : -1}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Collapse>
          </div>
          {mode === 'signup' && <p className="g-note">Use at least 8 characters.</p>}
          {error && <Notice tone="bad">{error}</Notice>}
          <button className="btn primary block xl" disabled={busy || !ready}>
            {busy ? <span className="spinner" /> : <span key={action} className="swap">{action}</span>}
          </button>
        </form>
      )}

      {mode === 'signin' && !sent && (
        <button type="button" className="text-link" onClick={() => { setMode('reset'); setError(null); }}>Forgot password?</button>
      )}
      {mode === 'reset' && (
        <button type="button" className="text-link" onClick={() => { setMode('signin'); setSent(null); }}>Back to sign in</button>
      )}
    </AuthLayout>
  );
}

export function SetNewPassword() {
  const { clearRecovery } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error('Password should be at least 8 characters');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => { toast('Password updated'); clearRecovery(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthLayout back={false}>
      <div className="ios-titles"><h1>New password</h1><p className="muted">Use at least 8 characters.</p></div>
      <form className="ios-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="group"><PasswordRow value={password} onChange={setPassword} autoComplete="new-password" /></div>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn primary block xl" disabled={save.isPending || password.length < 8}>Save password</button>
      </form>
    </AuthLayout>
  );
}

export function SetupSalon() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const id = await rpc<string>('create_salon', { p_name: name.trim(), p_phone: phone || null, p_city: city || null });
      const { data, error } = await supabase.from('salons').select('slug').eq('id', id).single();
      if (error) throw error;
      return data.slug as string;
    },
    onSuccess: async (slug) => {
      await qc.invalidateQueries({ queryKey: ['my-salons'] });
      navigate(`/s/${slug}`, { replace: true });
    },
  });
  return (
    <AuthLayout back={false}>
      <div className="ios-titles"><h1>Set up your salon</h1><p className="muted">Your 14-day trial starts now. We add a starter menu you can edit.</p></div>
      <form className="ios-form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="group">
          <Row label="Salon name" value={name} onChange={setName} autoComplete="organization" />
          <Row label="Salon phone (optional)" type="tel" inputMode="tel" value={phone} onChange={setPhone} autoComplete="tel" />
          <Row label="City (optional)" value={city} onChange={setCity} autoComplete="address-level2" />
        </div>
        {create.error && <Notice tone="bad">{errorMessage(create.error)}</Notice>}
        <button className="btn primary block xl" disabled={create.isPending || name.trim().length < 2}>
          {create.isPending ? <span className="spinner" /> : 'Create salon'}
        </button>
      </form>
      <button type="button" className="text-link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </AuthLayout>
  );
}
