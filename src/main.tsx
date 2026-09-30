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
  const { user } = useAuth();
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
