import type { DataCenter } from "./types";
import type { Role, SessionUser } from "./auth";

export interface PublicAccount {
  id: string;
  username: string;
  role: Role;
}

export interface CenterDocument {
  revision: number;
  dataCenters: DataCenter[];
  conflict?: boolean;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Le serveur Hallplan est injoignable.");
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string; revision?: number; dataCenters?: DataCenter[] };
  if (!response.ok) {
    const error = new Error(body.error || "Le serveur a refusé l'opération.") as Error & { status?: number; revision?: number; dataCenters?: DataCenter[] };
    error.status = response.status;
    error.revision = body.revision;
    error.dataCenters = body.dataCenters;
    throw error;
  }
  return body;
}

export function fetchSession() {
  return request<{ needsSetup: boolean; user: SessionUser | null }>("/api/session");
}

export function setupAdmin(username: string, password: string) {
  return request<{ user: SessionUser }>("/api/setup", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function loginAccount(username: string, password: string) {
  return request<{ user: SessionUser }>("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logoutAccount() {
  return request<{ ok: boolean }>("/api/logout", { method: "POST" });
}

export function fetchAccounts() {
  return request<{ accounts: PublicAccount[] }>("/api/accounts");
}

export function createAccount(username: string, password: string, role: Exclude<Role, "admin">) {
  return request<{ accounts: PublicAccount[] }>("/api/accounts", { method: "POST", body: JSON.stringify({ username, password, role }) });
}

export function patchAccount(id: string, patch: { role?: Role; password?: string }) {
  return request<{ accounts: PublicAccount[]; user: SessionUser | null }>(`/api/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteAccount(id: string) {
  return request<{ accounts: PublicAccount[] }>(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchCenters() {
  return request<CenterDocument>("/api/centers");
}

export async function saveCenters(revision: number, dataCenters: DataCenter[]): Promise<CenterDocument> {
  try {
    const saved = await request<{ revision: number }>("/api/centers", {
      method: "PUT",
      body: JSON.stringify({ revision, dataCenters }),
    });
    return { revision: saved.revision, dataCenters };
  } catch (error) {
    const conflict = error as Error & { status?: number; revision?: number; dataCenters?: DataCenter[] };
    if (conflict.status === 409 && conflict.dataCenters && typeof conflict.revision === "number") {
      return { revision: conflict.revision, dataCenters: conflict.dataCenters, conflict: true, error: conflict.message };
    }
    throw error;
  }
}
