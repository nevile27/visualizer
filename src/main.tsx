import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { canEdit } from "./auth";
import { AuthProvider, useAuth } from "./auth-context";
import { App } from "./App";
import { LoginScreen } from "./components/LoginScreen";
import { StoreProvider } from "./store";
import { ThemeProvider } from "./theme";
import "./index.css";

function Gate() {
  const { ready, serverError, user } = useAuth();
  if (!ready) return <div className="empty-view">Connexion au serveur…</div>;
  if (serverError && !user) {
    return <div className="empty-view">{serverError} Vérifiez que le service hallplan-api est démarré.</div>;
  }
  if (!user) return <LoginScreen />;
  return (
    <StoreProvider canEdit={canEdit(user.role)}>
      <App />
    </StoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
