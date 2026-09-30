import type { ReactNode, SelectHTMLAttributes } from "react";

export function Field({
  label,
  children,
  className = "",
  hint,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  list,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  disabled?: boolean;
}) {
  return <input value={value} placeholder={placeholder} list={list} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  value: number | string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

export function ConfirmButton({
  label,
  confirmLabel = "Supprimer",
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      className="danger"
      onClick={() => {
        if (window.confirm(label.endsWith("?") ? label : `${label} ?`)) onConfirm();
      }}
    >
      {confirmLabel}
    </button>
  );
}
