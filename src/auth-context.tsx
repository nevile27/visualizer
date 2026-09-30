import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  canEdit,
  hashPassword,
  loadAccounts,
  loadSessionId,
  passwordError,
  sameUsername,
  saveAccounts,
  saveSessionId,
  usernameError,
  verifyPassword,
  type Account,
  type Role,
  type SessionUser,
} from "./auth";
import { uid } from "./model";

interface AuthValue {
  ready: boolean;
  user: SessionUser | null;
  accounts: Account[];
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  createAdmin: (username: string, password: string) => Promise<string | null>;
  createUser: (username: string, password: string, role: Exclude<Role, "admin">) => Promise<string | null>;
  setUserRole: (id: string, role: Role) => string | null;
  setUserPassword: (id: string, password: string) => Promise<string | null>;
  removeUser: (id: string) => string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [user, setUser] = useState<SessionUser | null>(() => {
    const id = loadSessionId();
    const account = loadAccounts().find((entry) => entry.id === id);
    return account ? publicUser(account) : null;
  });

  const api = useMemo<AuthValue>(() => {
    const persist = (next: Account[]) => {
      saveAccounts(next);
      setAccounts(next);
    };

    return {
      ready: true,
      user,
      accounts,
      needsSetup: accounts.length === 0,
      login: async (username, password) => {
        const account = accounts.find((entry) => sameUsername(entry.username, username));
        if (!account || !(await verifyPassword(password, account.salt, account.hash))) {
          return "Identifiant ou mot de passe incorrect.";
        }
        saveSessionId(account.id);
        setUser(publicUser(account));
        return null;
      },
      logout: () => {
        saveSessionId(null);
        setUser(null);
      },
      createAdmin: async (username, password) => {
        if (accounts.length > 0) return "Un administrateur existe déjà.";
        const error = usernameError(username) ?? passwordError(password);
        if (error) return error;
        const secret = await hashPassword(password);
        const account: Account = { id: uid("user"), username: username.trim(), role: "admin", ...secret };
        persist([account]);
        saveSessionId(account.id);
        setUser(publicUser(account));
        return null;
      },
      createUser: async (username, password, role) => {
        if (user?.role !== "admin") return "Seul un administrateur peut créer un compte.";
        const error = usernameError(username) ?? passwordError(password);
        if (error) return error;
        if (accounts.some((entry) => sameUsername(entry.username, username))) return "Cet identifiant est déjà utilisé.";
        const secret = await hashPassword(password);
        persist([...accounts, { id: uid("user"), username: username.trim(), role, ...secret }]);
        return null;
      },
      setUserRole: (id, role) => {
        if (user?.role !== "admin") return "Seul un administrateur peut modifier un rôle.";
        const target = accounts.find((entry) => entry.id === id);
        if (!target) return "Compte introuvable.";
        if (target.role === "admin" && role !== "admin" && countAdmins(accounts) < 2) {
          return "Il doit rester au moins un administrateur.";
        }
        const next = accounts.map((entry) => (entry.id === id ? { ...entry, role } : entry));
        persist(next);
        if (user.id === id) setUser({ ...user, role });
        return null;
      },
      setUserPassword: async (id, password) => {
        if (user?.role !== "admin") return "Seul un administrateur peut changer un mot de passe.";
        const error = passwordError(password);
        if (error) return error;
        if (!accounts.some((entry) => entry.id === id)) return "Compte introuvable.";
        const secret = await hashPassword(password);
        persist(accounts.map((entry) => (entry.id === id ? { ...entry, ...secret } : entry)));
        return null;
      },
      removeUser: (id) => {
        if (user?.role !== "admin") return "Seul un administrateur peut retirer un compte.";
        if (user.id === id) return "Vous ne pouvez pas retirer votre propre compte.";
        const target = accounts.find((entry) => entry.id === id);
        if (!target) return "Compte introuvable.";
        if (target.role === "admin" && countAdmins(accounts) < 2) return "Il doit rester au moins un administrateur.";
        persist(accounts.filter((entry) => entry.id !== id));
        return null;
      },
    };
  }, [accounts, user]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
}

export function useCanEdit() {
  const { user } = useAuth();
  return user ? canEdit(user.role) : false;
}

function publicUser(account: Account): SessionUser {
  return { id: account.id, username: account.username, role: account.role };
}

function countAdmins(accounts: Account[]) {
  return accounts.filter((entry) => entry.role === "admin").length;
}
