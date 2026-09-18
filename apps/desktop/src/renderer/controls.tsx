import type { JSX, ReactNode } from "react";

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ label, hint, control }: { label: string; hint?: string; control: ReactNode }): JSX.Element {
  return (
    <div className="row">
      <div className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </div>
      <div className="row-control">{control}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? " toggle-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export interface Option<T extends string> { value: T; label: string; }

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (value: T) => void }): JSX.Element {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={option.value === value ? "segment segment-active" : "segment"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min, max, step, onChange, format }: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}): JSX.Element {
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider-value">{format(value)}</span>
    </div>
  );
}
