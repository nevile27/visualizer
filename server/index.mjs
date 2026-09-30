import { createServer } from "node:http";
import { pbkdf2, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const PORT = Number(process.env.HALLPLAN_PORT || 8091);
const HOST = process.env.HALLPLAN_HOST || "127.0.0.1";
const DATA_PATH = process.env.HALLPLAN_DATA || "/var/lib/hallplan/state.json";
const ITERATIONS = 120_000;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const ROLES = new Set(["admin", "setter", "viewer"]);

let queue = Promise.resolve();

function update(task) {
  const run = queue.then(task);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function emptyState() {
  return { revision: 0, accounts: [], sessions: [], dataCenters: [] };
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(DATA_PATH, "utf8"));
    return {
      revision: Number(parsed.revision) || 0,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      dataCenters: Array.isArray(parsed.dataCenters) ? parsed.dataCenters : [],
    };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeState(state) {
  await mkdir(dirname(DATA_PATH), { recursive: true });
  const temporary = `${DATA_PATH}.tmp`;
  await writeFile(temporary, JSON.stringify(state));
  await rename(temporary, DATA_PATH);
}

function publicUser(account) {
  return { id: account.id, username: account.username, role: account.role };
}

function canEdit(role) {
  return role === "admin" || role === "setter";
}

function usernameError(value) {
  const name = String(value ?? "").trim();
  if (name.length < 2 || name.length > 40) return "L'identifiant doit contenir entre 2 et 40 caractères.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(name)) return "Utilisez des lettres, des chiffres, un point, un tiret ou un underscore.";
  return null;
}

function passwordError(value) {
  const password = String(value ?? "");
  if (password.length < 6) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (password.length > 128) return "Le mot de passe est trop long.";
  return null;
}

function sameUsername(a, b) {
  return String(a).trim().toLocaleLowerCase("fr") === String(b).trim().toLocaleLowerCase("fr");
}

function uid(prefix) {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await pbkdf2Async(password, salt, ITERATIONS, 32, "sha256");
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}

async function passwordMatches(password, salt, hash) {
  const next = await pbkdf2Async(password, Buffer.from(salt, "base64"), ITERATIONS, 32, "sha256");
  const current = Buffer.from(hash, "base64");
  return next.length === current.length && timingSafeEqual(next, current);
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieToken(req) {
  const header = req.headers.cookie ?? "";
  const match = header.match(/(?:^|;\s*)hallplan=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `hallplan=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearCookie() {
  return "hallplan=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function currentUser(state, req) {
  const token = cookieToken(req);
  if (!token) return null;
  const now = Date.now();
  state.sessions = state.sessions.filter((session) => session.expires > now);
  const session = state.sessions.find((entry) => entry.tokenHash === tokenHash(token));
  if (!session) return null;
  return state.accounts.find((account) => account.id === session.userId) ?? null;
}

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(Object.assign(new Error("Fichier trop volumineux."), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Requête illisible."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function openSession(state, account) {
  const token = randomBytes(32).toString("base64url");
  state.sessions.push({ tokenHash: tokenHash(token), userId: account.id, expires: Date.now() + SESSION_MS });
  return token;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/$/, "") || "/";
  try {
    if (req.method === "GET" && path === "/api/session") {
      const state = await update(async () => {
        const current = await readState();
        currentUser(current, req);
        await writeState(current);
        return current;
      });
      const account = currentUser(state, req);
      send(res, 200, { needsSetup: state.accounts.length === 0, user: account ? publicUser(account) : null });
      return;
    }

    if (req.method === "POST" && path === "/api/setup") {
      const body = await readBody(req);
      const result = await update(async () => {
        const state = await readState();
        if (state.accounts.length > 0) return { status: 409, body: { error: "Un administrateur existe déjà." } };
        const error = usernameError(body.username) ?? passwordError(body.password);
        if (error) return { status: 400, body: { error } };
        const account = { id: uid("user"), username: String(body.username).trim(), role: "admin", ...(await hashPassword(body.password)) };
        state.accounts.push(account);
        const token = openSession(state, account);
        await writeState(state);
        return { status: 200, body: { user: publicUser(account) }, cookie: sessionCookie(token) };
      });
      send(res, result.status, result.body, result.cookie ? { "Set-Cookie": result.cookie } : {});
      return;
    }

    if (req.method === "POST" && path === "/api/login") {
      const body = await readBody(req);
      const result = await update(async () => {
        const state = await readState();
        const account = state.accounts.find((entry) => sameUsername(entry.username, body.username));
        if (!account || !(await passwordMatches(String(body.password ?? ""), account.salt, account.hash))) {
          return { status: 401, body: { error: "Identifiant ou mot de passe incorrect." } };
        }
        const token = openSession(state, account);
        await writeState(state);
        return { status: 200, body: { user: publicUser(account) }, cookie: sessionCookie(token) };
      });
      send(res, result.status, result.body, result.cookie ? { "Set-Cookie": result.cookie } : {});
      return;
    }

    if (req.method === "POST" && path === "/api/logout") {
      await update(async () => {
        const state = await readState();
        const token = cookieToken(req);
        if (token) state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash(token));
        await writeState(state);
      });
      send(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
      return;
    }

    const state = await readState();
    const account = currentUser(state, req);
    if (!account) {
      send(res, 401, { error: "Connexion requise." });
      return;
    }

    if (req.method === "GET" && path === "/api/accounts") {
      if (account.role !== "admin") {
        send(res, 403, { error: "Seul un administrateur peut gérer les comptes." });
        return;
      }
      send(res, 200, { accounts: state.accounts.map(publicUser) });
      return;
    }

    if (req.method === "POST" && path === "/api/accounts") {
      const body = await readBody(req);
      const result = await update(async () => {
        const current = await readState();
        const actor = currentUser(current, req);
        if (!actor || actor.role !== "admin") return { status: 403, body: { error: "Seul un administrateur peut créer un compte." } };
        const error = usernameError(body.username) ?? passwordError(body.password);
        if (error) return { status: 400, body: { error } };
        if (body.role !== "viewer" && body.role !== "setter") return { status: 400, body: { error: "Rôle invalide." } };
        if (current.accounts.some((entry) => sameUsername(entry.username, body.username))) {
          return { status: 409, body: { error: "Cet identifiant est déjà utilisé." } };
        }
        current.accounts.push({
          id: uid("user"),
          username: String(body.username).trim(),
          role: body.role,
          ...(await hashPassword(body.password)),
        });
        await writeState(current);
        return { status: 200, body: { accounts: current.accounts.map(publicUser) } };
      });
      send(res, result.status, result.body);
      return;
    }

    const accountMatch = path.match(/^\/api\/accounts\/([^/]+)$/);
    if (accountMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      const targetId = decodeURIComponent(accountMatch[1]);
      const body = req.method === "PATCH" ? await readBody(req) : {};
      const result = await update(async () => {
        const current = await readState();
        const actor = currentUser(current, req);
        if (!actor || actor.role !== "admin") return { status: 403, body: { error: "Seul un administrateur peut modifier les comptes." } };
        const target = current.accounts.find((entry) => entry.id === targetId);
        if (!target) return { status: 404, body: { error: "Compte introuvable." } };
        const admins = current.accounts.filter((entry) => entry.role === "admin").length;
        if (req.method === "DELETE") {
          if (actor.id === target.id) return { status: 400, body: { error: "Vous ne pouvez pas retirer votre propre compte." } };
          if (target.role === "admin" && admins < 2) return { status: 400, body: { error: "Il doit rester au moins un administrateur." } };
          current.accounts = current.accounts.filter((entry) => entry.id !== target.id);
          current.sessions = current.sessions.filter((session) => session.userId !== target.id);
        } else if (body.password != null && body.password !== "") {
          const error = passwordError(body.password);
          if (error) return { status: 400, body: { error } };
          Object.assign(target, await hashPassword(body.password));
        } else if (body.role) {
          if (!ROLES.has(body.role)) return { status: 400, body: { error: "Rôle invalide." } };
          if (target.role === "admin" && body.role !== "admin" && admins < 2) {
            return { status: 400, body: { error: "Il doit rester au moins un administrateur." } };
          }
          target.role = body.role;
          if (actor.id === target.id) actor.role = body.role;
        }
        await writeState(current);
        const self = current.accounts.find((entry) => entry.id === actor.id);
        return { status: 200, body: { accounts: current.accounts.map(publicUser), user: self ? publicUser(self) : null } };
      });
      send(res, result.status, result.body);
      return;
    }

    if (req.method === "GET" && path === "/api/centers") {
      send(res, 200, { revision: state.revision, dataCenters: state.dataCenters });
      return;
    }

    if (req.method === "PUT" && path === "/api/centers") {
      if (!canEdit(account.role)) {
        send(res, 403, { error: "Ce compte est en consultation." });
        return;
      }
      const body = await readBody(req);
      const result = await update(async () => {
        const current = await readState();
        const actor = currentUser(current, req);
        if (!actor || !canEdit(actor.role)) return { status: 403, body: { error: "Ce compte est en consultation." } };
        if (!Array.isArray(body.dataCenters)) return { status: 400, body: { error: "Salles illisibles." } };
        if (Number(body.revision) !== current.revision) {
          return { status: 409, body: { error: "Les salles ont été modifiées ailleurs.", revision: current.revision, dataCenters: current.dataCenters } };
        }
        current.dataCenters = body.dataCenters;
        current.revision += 1;
        await writeState(current);
        return { status: 200, body: { revision: current.revision } };
      });
      send(res, result.status, result.body);
      return;
    }

    send(res, 404, { error: "Introuvable." });
  } catch (error) {
    const status = error?.status || 500;
    send(res, status, { error: status === 500 ? "Erreur du serveur." : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Hallplan API on http://${HOST}:${PORT}`);
});
