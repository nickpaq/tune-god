import { glideEnabled, type KeyboardOptions } from "../../audio/seq/keyboard";

export function KeyboardControls({ value, onChange }: { value: KeyboardOptions; onChange: (value: KeyboardOptions) => void }) {
  const toggle = (key: "mono" | "oneShot" | "glide") => {
    const next = { ...value, [key]: !value[key] };
    if (next.oneShot || !next.mono) next.glide = false;
    onChange(next);
  };
  const sliders = [
    { key: "attackSeconds", label: "Attack", max: 2, disabled: false },
    { key: "decaySeconds", label: "Decay", max: 2, disabled: false },
    { key: "glideSeconds", label: "Glide time", max: 2, disabled: !glideEnabled(value) },
  ] as const;
  return <section className="s-keyboard-controls" aria-label="Keyboard playback">
    <div className="s-keyboard-controls__toggles">
      {(["mono", "oneShot", "glide"] as const).map(key => <button className="live-seq__switch" key={key} type="button" aria-pressed={key === "glide" ? glideEnabled(value) : value[key]} disabled={key === "glide" && (!value.mono || value.oneShot)} onClick={() => toggle(key)}>{key === "oneShot" ? "One-shot" : key === "mono" ? "Mono" : "Glide"}<span aria-hidden="true" className="live-seq__toggle" /></button>)}
    </div>
    <div className="s-keyboard-controls__sliders">
      {sliders.map(control => <label key={control.key}>{control.label}<output>{Math.round(value[control.key] * 1000)} ms</output><input type="range" min={0} max={control.max} step={0.005} value={value[control.key]} disabled={control.disabled} onChange={event => onChange({ ...value, [control.key]: Number(event.target.value) })} /></label>)}
    </div>
  </section>;
}
