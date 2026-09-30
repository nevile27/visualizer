import { useState, type FormEvent } from "react";
import { useAuth } from "../auth-context";
import { ThemeToggle } from "./ThemeToggle";
import { Field, TextInput } from "./fields";

export function LoginScreen() {
  const { needsSetup, login, createAdmin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const message = needsSetup
        ? password !== confirm
          ? "Les deux mots de passe ne correspondent pas."
          : await createAdmin(username, password)
        : await login(username, password);
      setError(message);
      if (!message && !needsSetup) setPassword("");
    } catch {
      setError("Le mot de passe n'a pas pu être enregistré. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="gate">
      <div className="theme-corner">
        <ThemeToggle />
      </div>
      <form className="gate-card" onSubmit={(event) => void submit(event)}>
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="2" y="3" width="8" height="16" rx="1" fill="#1e3d34" stroke="#3ddea0" />
            <rect x="12" y="3" width="8" height="16" rx="1" fill="#14323c" stroke="#5ec8f0" />
          </svg>
          <div>
            <strong>Hallplan</strong>
            <span>{needsSetup ? "Premier démarrage" : "Connexion"}</span>
          </div>
        </div>
        <p>
          {needsSetup
            ? "Créez le compte administrateur. Il pourra ensuite ouvrir des comptes en consultation, ou autorisés à ajouter et modifier les salles."
            : "Connectez-vous pour consulter ou modifier les salles, selon le rôle de votre compte."}
        </p>
        <Field label="Identifiant">
          <TextInput value={username} onChange={setUsername} placeholder="admin" />
        </Field>
        <Field label="Mot de passe">
          <input type="password" value={password} autoComplete={needsSetup ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {needsSetup ? (
          <Field label="Confirmer le mot de passe">
            <input type="password" value={confirm} autoComplete="new-password" onChange={(event) => setConfirm(event.target.value)} />
          </Field>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Veuillez patienter…" : needsSetup ? "Créer l'administrateur" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
