import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { atlasUrl, sprite } from '../art';
import { ATLAS_SIZE } from '../art/sprites';
import { t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { useEscape } from './keys';

/** Icône 12 × 12 de l'atlas, teintée par la couleur du texte (currentColor). */
export function Icon({
  name,
  size = 12,
  className,
}: {
  readonly name: string;
  readonly size?: number;
  readonly className?: string;
}) {
  const info = sprite(`icon_${name}`);
  if (info === undefined) return null;
  const [x = 0, y = 0] = info.frames[0] ?? [];
  const k = size / info.w;
  const style = {
    width: size,
    height: size,
    maskImage: `url(${atlasUrl})`,
    maskPosition: `-${x * k}px -${y * k}px`,
    maskSize: `${ATLAS_SIZE.w * k}px ${ATLAS_SIZE.h * k}px`,
    WebkitMaskImage: `url(${atlasUrl})`,
    WebkitMaskPosition: `-${x * k}px -${y * k}px`,
    WebkitMaskSize: `${ATLAS_SIZE.w * k}px ${ATLAS_SIZE.h * k}px`,
  } as CSSProperties;
  return <span aria-hidden="true" className={['icon', className ?? ''].join(' ')} style={style} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'quiet' | 'danger' | 'ghost';
  readonly size?: 'small' | 'normal' | 'large';
  readonly icon?: string;
};

/** Bouton du jeu : cadre pixel, retour visuel à l'appui. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'normal', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['gbtn', `gbtn--${variant}`, `gbtn--${size}`, className ?? ''].join(' ')}
      {...rest}
    >
      {icon !== undefined && <Icon name={icon} size={size === 'large' ? 24 : 12} />}
      {children !== undefined && <span className="gbtn__label">{children}</span>}
    </button>
  );
});

export function Panel({
  children,
  className,
  label,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
}) {
  return (
    <section className={['panel', className ?? ''].join(' ')} aria-label={label}>
      {children}
    </section>
  );
}

/** Fenêtre modale : Échap ou le bouton ✕ la ferment ; le focus va au premier bouton. */
export function Window({
  title,
  onClose,
  children,
  className,
  actions,
}: {
  readonly title: string;
  readonly onClose?: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly actions?: ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEscape(onClose ?? null);
  useEffect(() => {
    box.current
      ?.querySelector<HTMLElement>('.window__body button, .window__actions button')
      ?.focus();
  }, []);
  return (
    <div className="window-backdrop">
      <div
        ref={box}
        className={['window', className ?? ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header className="window__head">
          <h2 id={id}>{title}</h2>
          {onClose !== undefined && (
            <Button variant="ghost" icon="close" aria-label={t('ui.close')} onClick={onClose} />
          )}
        </header>
        <div className="window__body">{children}</div>
        {actions !== undefined && <footer className="window__actions">{actions}</footer>}
      </div>
    </div>
  );
}

/** Onglets : un seul panneau visible à la fois. */
export function Tabs<K extends string>({
  tabs,
  current,
  onChange,
  label,
}: {
  readonly tabs: readonly { readonly key: K; readonly label: string; readonly badge?: string }[];
  readonly current: K;
  readonly onChange: (key: K) => void;
  readonly label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === current}
          className={['tabs__tab', tab.key === current ? 'tabs__tab--on' : ''].join(' ')}
          onClick={() => {
            onChange(tab.key);
          }}
        >
          {tab.label}
          {tab.badge !== undefined && <span className="tabs__badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Sélecteur de nombre du jeu (remplace les menus déroulants natifs). */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
}) {
  const step = (delta: number, big = false): void => {
    const next = Math.min(max, Math.max(min, value + delta * (big ? 5 : 1)));
    if (next !== value) onChange(next);
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper__arrow"
        aria-label={t('ui.less', { what: label })}
        disabled={value <= min}
        onClick={(e) => {
          step(-1, e.shiftKey);
        }}
      >
        ◀
      </button>
      <output className="stepper__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="stepper__arrow"
        aria-label={t('ui.more', { what: label })}
        disabled={value >= max}
        onClick={(e) => {
          step(1, e.shiftKey);
        }}
      >
        ▶
      </button>
    </div>
  );
}

/** Or et matériaux, toujours visibles en haut à droite. */
export function Resources() {
  const { profile } = useProfile();
  if (profile.testMode) return <span className="resources resources--test">{t('test.badge')}</span>;
  return (
    <p
      className="resources"
      aria-label={t('hub.materials.label', {
        t1: profile.materials[0],
        t2: profile.materials[1],
        t3: profile.materials[2],
      })}
    >
      <span className="resources__gold">
        <Icon name="gold" />
        {t('hub.gold', { gold: profile.gold })}
      </span>
      {profile.materials.map((amount, tier) => (
        <span key={tier} className={`resources__mat resources__mat--${tier + 1}`}>
          <Icon name="points" />
          {amount}
        </span>
      ))}
    </p>
  );
}

/** Message d'un refus du moteur, en bandeau au-dessus de l'écran. */
export function RefusalToast() {
  const { refusal, dismiss } = useProfile();
  useEffect(() => {
    if (refusal === null) return;
    const timer = window.setTimeout(dismiss, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refusal, dismiss]);
  if (refusal === null) return null;
  return (
    <p className="toast toast--refusal" role="alert">
      {tk(`refusal.${refusal}`)}
      <Button
        variant="ghost"
        size="small"
        icon="close"
        aria-label={t('ui.close')}
        onClick={dismiss}
      />
    </p>
  );
}

/**
 * Écran du jeu : barre du haut (retour, titre, ressources), contenu à hauteur fixe.
 * Échap revient en arrière.
 */
export function Screen({
  title,
  onBack,
  children,
  className,
  backLabel,
  resources = true,
  aside,
}: {
  readonly title: string;
  readonly onBack?: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly backLabel?: string;
  readonly resources?: boolean;
  readonly aside?: ReactNode;
}) {
  useEscape(onBack ?? null);
  return (
    <main className={['screen', className ?? ''].join(' ')}>
      <header className="screen__bar">
        {onBack !== undefined && (
          <Button variant="quiet" size="small" onClick={onBack}>
            ◀ {backLabel ?? t('nav.back')}
          </Button>
        )}
        <h1 className="screen__title">{title}</h1>
        {aside}
        {resources && <Resources />}
      </header>
      <div className="screen__body">{children}</div>
      <RefusalToast />
    </main>
  );
}
