import { type FormEvent, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
} from 'lucide-react';
import {
  sendFirebasePasswordReset,
  signInWithEmailPassword,
} from '../firebase';
import type { Language } from '../types/trading';

interface LoginScreenProps {
  lang: Language;
  onLanguageChange: (nextLang: Language) => void;
}

type AuthView = 'login' | 'reset';

function mapFirebaseAuthError(code: string, lang: Language): string {
  const isEn = lang === 'en';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return isEn
        ? 'Invalid email or password.'
        : 'Email o password non valide.';
    case 'auth/invalid-email':
      return isEn
        ? 'Please enter a valid email address.'
        : 'Inserisci un indirizzo email valido.';
    case 'auth/user-disabled':
      return isEn
        ? 'This account has been disabled.'
        : 'Questo account è stato disabilitato.';
    case 'auth/too-many-requests':
      return isEn
        ? 'Too many attempts. Please wait and try again.'
        : 'Troppi tentativi. Attendi qualche minuto e riprova.';
    case 'auth/operation-not-allowed':
      return isEn
        ? 'Email/Password sign-in is not enabled in Firebase Console yet.'
        : 'L’accesso Email/Password non è ancora attivo nella Firebase Console.';
    case 'auth/network-request-failed':
      return isEn
        ? 'Network error. Check your internet connection.'
        : 'Errore di rete. Controlla la connessione internet.';
    default:
      return isEn
        ? 'Operation failed. Verify your email and try again.'
        : 'Operazione non riuscita. Verifica i dati e riprova.';
  }
}

export function LoginScreen({ lang, onLanguageChange }: LoginScreenProps) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset Password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const isEn = lang === 'en';

  const switchToResetView = () => {
    setErrorMessage(null);
    setResetSentTo(null);
    setResetEmail(email.trim());
    setView('reset');
  };

  const switchToLoginView = () => {
    setErrorMessage(null);
    setResetSentTo(null);
    if (resetEmail.trim()) {
      setEmail(resetEmail.trim());
    }
    setView('login');
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage(
        isEn
          ? 'Enter both email and password.'
          : 'Inserisci sia email che password.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailPassword(trimmedEmail, password);
    } catch (err) {
      const code =
        typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      setErrorMessage(mapFirebaseAuthError(code, lang));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setResetSentTo(null);

    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) {
      setErrorMessage(
        isEn
          ? 'Please enter your registered email address.'
          : 'Inserisci il tuo indirizzo email registrato.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await sendFirebasePasswordReset(trimmedEmail);
      setResetSentTo(trimmedEmail);
    } catch (err) {
      const code =
        typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      setErrorMessage(mapFirebaseAuthError(code, lang));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0E14] px-4 py-8 text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-[#1E2634] bg-[#121721] p-7 shadow-2xl transition-all">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
              {view === 'login' ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              <span>
                {view === 'login'
                  ? isEn
                    ? 'Private Access'
                    : 'Accesso Riservato'
                  : isEn
                    ? 'Account Recovery'
                    : 'Recupero Account'}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-100">
              {view === 'login'
                ? 'Performance · DiarioTrade'
                : isEn
                  ? 'Reset Password'
                  : 'Reimposta Password'}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {view === 'login'
                ? isEn
                  ? 'Sign in with your authorized email and password to access your trading journal.'
                  : 'Accedi con email e password autorizzate per aprire il tuo diario di trading.'
                : isEn
                  ? 'Enter your registered email address to receive a Firebase password recovery link.'
                  : 'Inserisci il tuo indirizzo email registrato per ricevere il link Firebase di recupero password.'}
            </p>
          </div>

          <div
            role="group"
            aria-label="Language switcher"
            className="flex shrink-0 items-center rounded-md border border-[#1E2634] bg-[#0B0E14] p-0.5 text-[11px] font-semibold"
          >
            {(['it', 'en'] as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onLanguageChange(code)}
                className={`rounded px-2 py-1 uppercase transition-colors ${
                  lang === code
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {view === 'login' ? (
          <form onSubmit={(e) => void handleLoginSubmit(e)} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@esempio.com"
                  disabled={submitting}
                  className="w-full rounded-lg border border-[#263042] bg-[#0B0E14] py-2.5 pr-3 pl-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full rounded-lg border border-[#263042] bg-[#0B0E14] py-2.5 pr-10 pl-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={switchToResetView}
                  className="text-xs font-medium text-sky-400 transition-colors hover:text-sky-300 hover:underline focus:outline-none"
                >
                  {isEn ? 'Forgot Password?' : 'Password dimenticata?'}
                </button>
              </div>
            </div>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              <span>
                {submitting
                  ? isEn
                    ? 'Signing in...'
                    : 'Accesso in corso...'
                  : isEn
                    ? 'Sign In'
                    : 'Accedi'}
              </span>
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleResetSubmit(e)} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="reset-email"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                {isEn ? 'Registered Email' : 'Email Registrata'}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="nome@esempio.com"
                  disabled={submitting}
                  className="w-full rounded-lg border border-[#263042] bg-[#0B0E14] py-2.5 pr-3 pl-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300"
              >
                {errorMessage}
              </div>
            ) : null}

            {resetSentTo ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-xs leading-relaxed text-emerald-200"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  <div className="font-semibold">
                    {isEn
                      ? `Recovery instructions sent to ${resetSentTo}`
                      : `Istruzioni di recupero inviate a ${resetSentTo}`}
                  </div>
                  <div className="mt-1 text-emerald-300/85">
                    {isEn
                      ? 'Open the link in your email (check spam if needed) to choose a new password, then return to login.'
                      : 'Apri il link ricevuto via email (controlla anche nello spam) per impostare la nuova password, poi torna al login.'}
                  </div>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail className="h-4 w-4" />
              <span>
                {submitting
                  ? isEn
                    ? 'Sending reset link...'
                    : 'Invio link in corso...'
                  : isEn
                    ? 'Send Reset Link'
                    : 'Invia link di reset'}
              </span>
            </button>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={switchToLoginView}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-sky-300"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{isEn ? 'Back to Login' : 'Torna al Login'}</span>
              </button>
            </div>
          </form>
        )}

        <p className="mt-5 border-t border-[#1E2634] pt-4 text-center text-[11px] text-slate-500">
          {isEn
            ? 'Access is restricted to existing accounts configured in Firebase Console.'
            : 'Accesso consentito esclusivamente agli account creati in Firebase Console.'}
        </p>
      </div>
    </div>
  );
}
