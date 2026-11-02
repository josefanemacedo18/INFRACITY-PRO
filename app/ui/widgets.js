// URBIS - componentes de formulário
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { fmt, parseNum } from '../core/util.js';

export function Field({ label, children, title }) {
  return html`<label class="field" title=${title || ''}><span>${label}</span>${children}</label>`;
}

/** Campo numérico com formatação brasileira; confirma ao sair do campo ou com Enter. */
export function Num({ value, onChange, dec = 2, unit, min, max, pct = false, disabled, step }) {
  const show = (v) => (Number.isFinite(v) ? fmt(pct ? v * 100 : v, dec, { group: false }) : '');
  const [txt, setTxt] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(show(value)); }, [value, focus]);
  const commit = () => {
    let v = parseNum(txt);
    if (!Number.isFinite(v)) { setTxt(show(value)); return; }
    if (pct) v /= 100;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    if (v !== value) onChange(v);
    setTxt(show(v));
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.target.blur(); }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && step) {
      e.preventDefault();
      const cur = Number.isFinite(value) ? value : 0;
      const nv = cur + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1);
      onChange(Math.round(nv * 1e6) / 1e6);
    }
  };
  const input = html`<input value=${txt} disabled=${disabled} onFocus=${() => setFocus(true)} onBlur=${() => { setFocus(false); commit(); }} onInput=${(e) => setTxt(e.target.value)} onKeyDown=${onKey} />`;
  return unit ? html`<span class="unit">${input}<em>${unit}</em></span>` : input;
}

export function Text({ value, onChange, placeholder }) {
  const [txt, setTxt] = useState(value ?? '');
  useEffect(() => setTxt(value ?? ''), [value]);
  return html`<input value=${txt} placeholder=${placeholder || ''} onInput=${(e) => setTxt(e.target.value)} onBlur=${() => { if (txt !== value) onChange(txt); }} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`;
}

export function Select({ value, options, onChange }) {
  return html`<select value=${value} onChange=${(e) => onChange(e.target.value)}>
    ${options.map((o) => html`<option value=${o.value} selected=${String(o.value) === String(value)}>${o.label}</option>`)}
  </select>`;
}

export function Check({ label, checked, onChange }) {
  return html`<label class="field check"><input type="checkbox" checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} /><span>${label}</span></label>`;
}

export function Section({ title, actions, children }) {
  return html`<div class="section">${title ? html`<h5><span>${title}</span><span>${actions}</span></h5>` : null}${children}</div>`;
}

export function Stat({ label, value, cls = '' }) {
  return html`<div class=${'stat ' + cls}><span>${label}</span><b>${value}</b></div>`;
}

export function Modal({ title, onClose, children, foot, wide }) {
  return html`<div class="modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${'modal' + (wide ? ' wide' : '')}>
      <div class="modal-head"><h3>${title}</h3><button class="btn small" onClick=${onClose}>Fechar</button></div>
      <div class="modal-body">${children}</div>
      ${foot ? html`<div class="modal-foot">${foot}</div>` : null}
    </div>
  </div>`;
}

export function StatusBadge({ status }) {
  const label = { confirmado: 'confirmado', referencia: 'referência', pratica: 'prática' }[status] || status;
  return html`<span class=${'badge ' + status}>${label}</span>`;
}
