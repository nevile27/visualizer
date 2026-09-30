import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { canEdit, roleLabel } from "./auth";
import { useAuth } from "./auth-context";
import { Builder } from "./components/Builder";
import { FloorPlan } from "./components/FloorPlan";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import { UsersDialog } from "./components/UsersDialog";
import { dataCenterFromSpreadsheet, describeImport } from "./inventory";
import { JSON_EXAMPLE, parseDocument, safeFileName } from "./model";
import { downloadText } from "./download";
import { useStore } from "./store";

const Scene3D = lazy(() => import("./components/Scene3D"));

export function App() {
  const store = useStore();
  const { user, logout } = useAuth();
  const edit = user ? canEdit(user.role) : false;
  const fileRef = useRef<HTMLInputElement>(null);
  const [builder, setBuilder] = useState(false);
  const [help, setHelp] = useState(false);
  const [users, setUsers] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") store.select(null);
      if (event.key === "1") store.setView("2d");
      if (event.key === "2") store.setView("3d");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      if (!edit) return;
      const file = event.dataTransfer?.files?.[0];
      if (file) void importFile(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  });

  async function importFile(file: File) {
    if (!edit) {
      store.notify("Ce compte est en consultation : l'import est réservé à l'ajout et à la modification.");
      return;
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      store.notify("Le format .xls n'est pas pris en charge. Enregistrez le classeur en .xlsx.");
      return;
    }
    if (lower.endsWith(".xlsx")) {
      const parsed = await dataCenterFromSpreadsheet(await file.arrayBuffer(), file.name);
      if (typeof parsed === "string") {
        store.notify(parsed);
        return;
      }
      const summary = describeImport(parsed.dc);
      const sideNote = parsed.assumedSide ? "\nSans colonne Côté, tout est placé à gauche de l'allée." : "";
      const warningNote = parsed.warnings.length
        ? `\n${parsed.warnings.length} avertissement${parsed.warnings.length > 1 ? "s seront signalés" : " sera signalé"}.`
        : "";
      if (!window.confirm(`Ajouter le centre « ${parsed.dc.name} » ?\n${summary}.${sideNote}\nLes centres déjà ouverts sont conservés.${warningNote}`)) return;
      store.addGenerated(parsed.dc);
      const details = parsed.warnings.slice(0, 6).join("\n");
      const more = parsed.warnings.length > 6 ? `\n… et ${parsed.warnings.length - 6} autre${parsed.warnings.length - 6 > 1 ? "s" : ""}.` : "";
      store.notify(`Importé « ${parsed.dc.name} » : ${summary}.${details ? `\n${details}${more}` : ""}`);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      store.notify("Ce fichier n'est pas un JSON Hallplan ni un classeur Excel (.xlsx).");
      return;
    }
    const parsed = parseDocument(data);
    if (typeof parsed === "string") {
      store.notify(parsed);
      return;
    }
    const label = parsed.length > 1 ? `${parsed.length} centres` : parsed[0]?.name ?? "ce centre";
    if (!window.confirm(`Importer ${label} et remplacer les données actuelles ?`)) return;
    store.replaceAll(parsed);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="2" y="3" width="8" height="16" rx="1" fill="#1e3d34" stroke="#3ddea0" />
            <rect x="12" y="3" width="8" height="16" rx="1" fill="#14323c" stroke="#5ec8f0" />
          </svg>
          <div>
            <strong>Hallplan</strong>
            <span>{user ? roleLabel(user.role) : "Centres de données"}</span>
          </div>
        </div>
        <select
          className="dc-select"
          value={store.activeDcId ?? ""}
          onChange={(event) => store.setActive(event.target.value)}
          aria-label="Centre de données"
        >
          {store.dataCenters.map((dc) => (
            <option key={dc.id} value={dc.id}>{dc.name}{dc.location ? ` — ${dc.location}` : ""}</option>
          ))}
        </select>
        <div className="top-actions">
          <div className="segment" role="tablist" aria-label="Mode de vue">
            <button type="button" className={store.view === "2d" ? "active" : ""} onClick={() => store.setView("2d")}>Plan 2D</button>
            <button type="button" className={store.view === "3d" ? "active" : ""} onClick={() => store.setView("3d")}>Vue 3D</button>
          </div>
          {edit ? <button type="button" className="primary" onClick={() => setBuilder(true)}>Nouveau centre</button> : null}
          {edit ? <button type="button" onClick={() => fileRef.current?.click()}>Importer</button> : null}
          <button
            type="button"
            onClick={() => downloadText(JSON.stringify({ version: 1, dataCenters: store.dataCenters }, null, 2), `${safeFileName(store.activeDc?.name ?? "hallplan")}.json`)}
          >
            Exporter
          </button>
          <button type="button" onClick={() => setHelp(true)}>Format</button>
          {edit ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Recharger l'exemple PAR1 / MRS1 ? Les données actuelles seront remplacées.")) store.loadExample();
              }}
            >
              Exemple
            </button>
          ) : null}
          {user?.role === "admin" ? <button type="button" onClick={() => setUsers(true)}>Comptes</button> : null}
          <ThemeToggle />
          <div className="session">
            <span>{user?.username}</span>
            <button type="button" onClick={logout}>Déconnexion</button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </header>
      <div className="workspace">
        <Sidebar />
        <main className="stage">
          {store.view === "2d" ? (
            <FloorPlan />
          ) : (
            <Suspense fallback={<div className="empty-view">Ouverture de la vue 3D…</div>}>
              <Scene3D />
            </Suspense>
          )}
        </main>
        <Inspector />
      </div>
      {builder && edit ? <Builder onClose={() => setBuilder(false)} /> : null}
      {users && user?.role === "admin" ? <UsersDialog onClose={() => setUsers(false)} /> : null}
      {help ? (
        <div className="modal-back" onMouseDown={() => setHelp(false)}>
          <div className="modal wide" role="dialog" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <p className="kicker">Import</p>
              <h2 id="help-title">Format des données</h2>
            </div>
            <ul className="help-list">
              <li>Un classeur Excel (.xlsx) avec les feuilles Racks, Cooling et Équipements. La colonne Position place la baie ou le froid dans l'allée. La feuille Équipements rattache chaque ligne à l'ID du rack.</li>
              <li>La position U accepte un U seul, une paire (« 35 & 34 ») ou une plage (« 17 à 12 »). U1 reste en bas. Sans colonne Côté, tout est placé à gauche.</li>
              <li>L'import Excel ajoute un centre et conserve ceux déjà ouverts. Le JSON, lui, les remplace.</li>
              <li>Un centre contient des allées. Chaque allée a deux côtés : gauche et droite.</li>
              <li>La position commence à 1, séparément sur chaque côté. Les numéros du haut du plan sont ces positions.</li>
              <li>positionDirection vaut "ltr" (position 1 à gauche) ou "rtl" (position 1 à droite).</li>
              <li>Dans un rack, U1 est en bas. positionU est le U de départ, heightU la hauteur occupée.</li>
              <li>kind vaut "rack" ou "cooling". Les types d'équipement : server, storage, switch, router, firewall, pdu, patch, blank, other.</li>
              <li>Vous pouvez aussi déposer un fichier JSON ou Excel sur la fenêtre.</li>
            </ul>
            <pre className="json">{JSON_EXAMPLE}</pre>
            <div className="row-actions">
              <button type="button" onClick={() => downloadText(JSON_EXAMPLE, "hallplan-exemple.json")}>Télécharger l'exemple</button>
              <button type="button" className="primary" onClick={() => setHelp(false)}>Fermer</button>
            </div>
          </div>
        </div>
      ) : null}
      {store.notice ? (
        <div className={store.notice.startsWith("Importé ") ? "toast success" : "toast"} role="status">
          <p>{store.notice}</p>
          <button type="button" onClick={() => store.notify(null)}>Fermer</button>
        </div>
      ) : null}
    </div>
  );
}
