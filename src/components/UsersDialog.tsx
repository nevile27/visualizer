import { useState, type FormEvent } from "react";
import type { Role } from "../auth";
import { useAuth } from "../auth-context";
import { Field, SelectInput, TextInput } from "./fields";

export function UsersDialog({ onClose }: { onClose: () => void }) {
  const { user, accounts, createUser, setUserRole, setUserPassword, removeUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Exclude<Role, "admin">>("viewer");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resets, setResets] = useState<Record<string, string>>({});

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const error = await createUser(username, password, role);
    setPending(false);
    setMessage(error);
    if (!error) {
      setUsername("");
      setPassword("");
      setRole("viewer");
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal wide" role="dialog" aria-labelledby="users-title" onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <p className="kicker">Administrateur</p>
          <h2 id="users-title">Comptes</h2>
        </div>
        <p>Chaque compte créé ici est en consultation, ou autorisé à ajouter et modifier les salles. La gestion des comptes reste réservée à l'administrateur.</p>
        <table className="user-table">
          <thead>
            <tr>
              <th>Identifiant</th>
              <th>Rôle</th>
              <th>Mot de passe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const self = account.id === user?.id;
              const onlyAdmin = account.role === "admin" && accounts.filter((entry) => entry.role === "admin").length < 2;
              return (
                <tr key={account.id}>
                  <td>{account.username}</td>
                  <td>
                    <SelectInput
                      aria-label={`Rôle de ${account.username}`}
                      value={account.role}
                      disabled={self || onlyAdmin}
                      onChange={(event) => {
                        const error = setUserRole(account.id, event.target.value as Role);
                        setMessage(error);
                      }}
                    >
                      <option value="admin">Administrateur</option>
                      <option value="setter">Ajout et modification</option>
                      <option value="viewer">Consultation</option>
                    </SelectInput>
                  </td>
                  <td>
                    <div className="inline-reset">
                      <input
                        type="password"
                        aria-label={`Nouveau mot de passe de ${account.username}`}
                        value={resets[account.id] ?? ""}
                        placeholder="Nouveau"
                        onChange={(event) => setResets((current) => ({ ...current, [account.id]: event.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void setUserPassword(account.id, resets[account.id] ?? "").then((error) => {
                            setMessage(error ?? `Mot de passe de ${account.username} mis à jour.`);
                            if (!error) setResets((current) => ({ ...current, [account.id]: "" }));
                          });
                        }}
                      >
                        Changer
                      </button>
                    </div>
                  </td>
                  <td>
                    {self ? null : (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (!window.confirm(`Retirer le compte ${account.username} ?`)) return;
                          setMessage(removeUser(account.id));
                        }}
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form className="form-grid" onSubmit={(event) => void create(event)}>
          <Field label="Nouvel identifiant">
            <TextInput value={username} onChange={setUsername} placeholder="operateur" />
          </Field>
          <Field label="Mot de passe">
            <input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Rôle" className="span-2">
            <SelectInput value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "admin">)}>
              <option value="viewer">Consultation</option>
              <option value="setter">Ajout et modification</option>
            </SelectInput>
          </Field>
          <div className="row-actions span-2">
            <button type="submit" className="primary" disabled={pending}>Créer le compte</button>
          </div>
        </form>
        {message ? <p className={message.includes("mis à jour") ? "hint" : "error"}>{message}</p> : null}
        <div className="row-actions">
          <button type="button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
