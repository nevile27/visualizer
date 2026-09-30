import { pbkdf2Sha256 } from "./pbkdf2";

export type Role = "admin" | "setter" | "viewer";

export interface Account {
  id: string;
  username: string;
  role: Role;
  salt: string;
  hash: string;
}

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

export const ACCOUNTS_KEY = "hallplan-accounts-v1";
export const SESSION_KEY = "hallplan-session-v1";

const ROLES: Role[] = ["admin", "setter", "viewer"];

export function roleLabel(role: Role) {
  if (role === "admin") return "Administrateur";
  if (role === "setter") return "Ajout et modification";
  return "Consultation";
}

export function canEdit(role: Role) {
  return role === "admin" || role === "setter";
}

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { accounts?: Account[] };
    if (!Array.isArray(parsed.accounts)) return [];
    return parsed.accounts.filter(isAccount);
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ version: 1, accounts }));
}

export function loadSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

export function saveSessionId(id: string | null) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}

export function usernameError(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 40) return "L'identifiant doit contenir entre 2 et 40 caractères.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(name)) return "Utilisez des lettres, des chiffres, un point, un tiret ou un underscore.";
  return null;
}

export function passwordError(value: string) {
  if (value.length < 6) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (value.length > 128) return "Le mot de passe est trop long.";
  return null;
}

export function sameUsername(a: string, b: string) {
  return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
}

const ITERATIONS = 120_000;

export async function hashPassword(password: string, salt?: Uint8Array) {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = new TextEncoder().encode(password);
  const bits = await deriveKey(passwordBytes, saltBytes);
  return { salt: bytesToB64(saltBytes), hash: bytesToB64(bits) };
}

async function deriveKey(password: Uint8Array, salt: Uint8Array) {
  try {
    const subtle = crypto.subtle;
    if (subtle) {
      const key = await subtle.importKey("raw", password.buffer as ArrayBuffer, "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits(
        { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: "SHA-256" },
        key,
        256,
      );
      return new Uint8Array(bits);
    }
  } catch {
    /* Sur http://IP, le navigateur refuse SubtleCrypto. */
  }
  return pbkdf2Sha256(password, salt, ITERATIONS, 32);
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const next = await hashPassword(password, b64ToBytes(salt));
  return sameText(next.hash, hash);
}

function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== "object") return false;
  const account = value as Account;
  return typeof account.id === "string"
    && typeof account.username === "string"
    && ROLES.includes(account.role)
    && typeof account.salt === "string"
    && typeof account.hash === "string";
}

function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
