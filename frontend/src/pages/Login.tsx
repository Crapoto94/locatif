import { useState, type FormEvent } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/api';
import { Field, Input, Btn, Notice } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(username, password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-space-md">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-lg p-space-xl flex flex-col gap-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="p-2 bg-surface-container-low rounded-lg"><Landmark className="text-primary" size={24} /></div>
          <div>
            <h1 className="text-headline-md text-primary font-bold leading-tight">Patrimoine & Gestion Locative</h1>
            <p className="text-body-sm text-on-surface-variant">Ville d'Ivry-sur-Seine</p>
          </div>
        </div>
        <Field label="Identifiant"><Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></Field>
        <Field label="Mot de passe"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Btn type="submit" variant="primary" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Se connecter</Btn>
        <p className="text-body-sm text-outline text-center">Connexion avec votre compte de la Ville (Active Directory).</p>
      </form>
    </div>
  );
}
