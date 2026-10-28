import { useEffect, useState, type ReactNode } from 'react';
import { tk } from '../i18n';
import { VIEW_H, VIEW_W } from './Shell';

/**
 * Lexique : chaque mot de règle (Avance, Brûlure, ATK…) devient un terme survolable qui explique
 * ce qu'il fait. Les motifs sont ici, les explications dans `glossary.*` des traductions.
 */
const TERMS: readonly { readonly key: string; readonly pattern: string }[] = [
  { key: 'advance', pattern: 'Avance' },
  { key: 'delay_fx', pattern: 'Retarde' },
  { key: 'delay', pattern: 'Délai' },
  { key: 'cost', pattern: 'Coût' },
  { key: 'gain', pattern: 'Gagne|Gain' },
  { key: 'reserve', pattern: 'réserve' },
  { key: 'burn', pattern: 'Brûlure|brûlure|en feu' },
  { key: 'mark', pattern: 'Marque|marque|marquée' },
  { key: 'stun', pattern: 'Étourdit|Étourdi|étourdie|étourdissement' },
  { key: 'immunity', pattern: 'Immunisé' },
  { key: 'shield', pattern: 'Bouclier' },
  { key: 'atk', pattern: 'ATK' },
  { key: 'def', pattern: 'DEF' },
  { key: 'vit', pattern: 'VIT' },
  { key: 'hp', pattern: 'PV' },
  { key: 'turns', pattern: '\\d+ tours|1 tour|tout le combat' },
  { key: 'element', pattern: 'Feu|Eau|Nature' },
];

const MATCHER = new RegExp(
  TERMS.map((term) => `(?<![\\p{L}\\d])(?:${term.pattern})(?![\\p{L}])`).join('|'),
  'gu',
);

function keyOf(word: string): string | undefined {
  return TERMS.find((term) => new RegExp(`^(?:${term.pattern})$`, 'u').test(word))?.key;
}

interface Tip {
  readonly text: string;
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

type Listener = (tip: Tip | null) => void;
let current: Tip | null = null;
const listeners = new Set<Listener>();

function emit(tip: Tip | null): void {
  current = tip;
  for (const listener of listeners) listener(tip);
}

/** Position d'un élément dans l'écran logique 960 × 540, quelle que soit l'échelle de la coque. */
function logicalRect(el: HTMLElement): { x: number; top: number; bottom: number; w: number } {
  const screen = el.closest<HTMLElement>('.shell__screen');
  const r = el.getBoundingClientRect();
  if (screen === null) return { x: r.left, top: r.top, bottom: r.bottom, w: r.width };
  const s = screen.getBoundingClientRect();
  const scale = s.width / VIEW_W || 1;
  return {
    x: (r.left - s.left) / scale,
    top: (r.top - s.top) / scale,
    bottom: (r.bottom - s.top) / scale,
    w: r.width / scale,
  };
}

function Term({ word, glossaryKey }: { readonly word: string; readonly glossaryKey: string }) {
  const text = tk(`glossary.${glossaryKey}`);
  const show = (el: HTMLElement): void => {
    const rect = logicalRect(el);
    emit({ text, x: rect.x + rect.w / 2, top: rect.top, bottom: rect.bottom });
  };
  return (
    <button
      type="button"
      className="term"
      aria-label={`${word} : ${text}`}
      onPointerEnter={(e) => {
        show(e.currentTarget);
      }}
      onPointerLeave={() => {
        emit(null);
      }}
      onFocus={(e) => {
        show(e.currentTarget);
      }}
      onBlur={() => {
        emit(null);
      }}
    >
      {word}
    </button>
  );
}

/** Un texte de règle dont les termes du lexique sont survolables. */
export function Glossed({ text }: { readonly text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MATCHER)) {
    const word = match[0];
    const key = keyOf(word);
    if (key === undefined) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<Term key={`${String(match.index)}-${word}`} word={word} glossaryKey={key} />);
    last = match.index + word.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** La bulle, une seule pour tout l'écran, posée au-dessus du terme et gardée dans l'écran. */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(current);
  useEffect(() => {
    listeners.add(setTip);
    return () => {
      listeners.delete(setTip);
    };
  }, []);
  if (tip === null) return null;
  const width = 240;
  const left = Math.min(VIEW_W - width - 8, Math.max(8, tip.x - width / 2));
  const above = tip.top > VIEW_H * 0.35;
  return (
    <div
      className={['tip', above ? 'tip--above' : 'tip--below'].join(' ')}
      role="tooltip"
      style={{ left, top: above ? tip.top - 6 : tip.bottom + 6, width }}
    >
      {tip.text}
    </div>
  );
}
