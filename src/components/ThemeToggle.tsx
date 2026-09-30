import { useTheme } from "../theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={light}
      aria-label={light ? "Passer en mode sombre" : "Passer en mode clair"}
      title={light ? "Mode clair" : "Mode sombre"}
      onClick={() => setTheme(light ? "dark" : "light")}
    >
      <span className="theme-switch-knob" aria-hidden="true">
        {light ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="2.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M6 1.1v1.2M6 9.7v1.2M1.1 6h1.2M9.7 6h1.2M2.5 2.5l.9.9M8.6 8.6l.9.9M9.5 2.5l-.9.9M3.4 8.6l-.9.9" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        fill="currentColor"
        d="M7.2 1.2a4.6 4.6 0 1 0 3.6 7.2 3.7 3.7 0 0 1-3.6-7.2Z"
      />
    </svg>
  );
}
