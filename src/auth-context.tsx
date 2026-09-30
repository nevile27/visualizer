import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createAccount,
  deleteAccount,
  fetchAccounts,
  fetchSession,
  loginAccount,
  logoutAccount,
  patchAccount,
  setupAdmin,
  type PublicAccount,
} from "./api";
import { canEdit, passwordError, usernameError, type Role, type SessionUser } from "./auth";

interface AuthValue {
  ready: boolean;
  serverError: string | null;
  user: SessionUser | null;
  accounts: PublicAccount[];
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  createAdmin: (username: string, password: string) => Promise<string | null>;
  createUser: (username: string, password: string, role: Exclude<Role, "admin">) => Promise<string | null>;
  setUserRole: (id: string, role: Role) => Promise<string | null>;
  setUserPassword: (id: string, password: string) => Promise<string | null>;
  removeUser: (id: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);

  useEffect(() => {
    let cancel = false;
    fetchSession()
      .then(async (session) => {
        if (cancel) return;
        if (typeof session.needsSetup !== "boolean") {
          throw new Error("L'API Hallplan ne répond pas. Le service hallplan-api n'est pas démarré.");
        }
        setNeedsSetup(session.needsSetup);
        setUser(session.user);
        if (session.user?.role === "admin") setAccounts((await fetchAccounts()).accounts);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancel) return;
        setServerError(error instanceof Error ? error.message : "Le serveur Hallplan est injoignable.");
        setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const api = useMemo<AuthValue>(() => ({
    ready,
    serverError,
    user,
    accounts,
    needsSetup,
    login: async (username, password) => {
      try {
        const session = await loginAccount(username, password);
        setUser(session.user);
        setNeedsSetup(false);
        setServerError(null);
        if (session.user.role === "admin") setAccounts((await fetchAccounts()).accounts);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Identifiant ou mot de passe incorrect.";
      }
    },
    logout: () => {
      void logoutAccount().catch(() => undefined);
      setUser(null);
      setAccounts([]);
    },
    createAdmin: async (username, password) => {
      const error = usernameError(username) ?? passwordError(password);
      if (error) return error;
      try {
        const session = await setupAdmin(username, password);
        setUser(session.user);
        setNeedsSetup(false);
        setAccounts([session.user]);
        setServerError(null);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "Le compte n'a pas pu être créé.";
      }
    },
    createUser: async (username, password, role) => {
      const error = usernameError(username) ?? passwordError(password);
      if (error) return error;
      try {
        setAccounts((await createAccount(username, password, role)).accounts);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "Le compte n'a pas pu être créé.";
      }
    },
    setUserRole: async (id, role) => {
      try {
        const result = await patchAccount(id, { role });
        setAccounts(result.accounts);
        if (result.user && user?.id === result.user.id) setUser(result.user);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "Le rôle n'a pas pu être modifié.";
      }
    },
    setUserPassword: async (id, password) => {
      const error = passwordError(password);
      if (error) return error;
      try {
        setAccounts((await patchAccount(id, { password })).accounts);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "Le mot de passe n'a pas pu être modifié.";
      }
    },
    removeUser: async (id) => {
      try {
        setAccounts((await deleteAccount(id)).accounts);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "Le compte n'a pas pu être retiré.";
      }
    },
  }), [accounts, needsSetup, ready, serverError, user]);

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
