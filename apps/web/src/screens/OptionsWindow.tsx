import { useRef, useState, type ReactNode } from 'react';
import { content } from '../combat/session';
import { fullscreenAvailable, isFullscreen, toggleFullscreen } from '../game/fullscreen';
import { useOptions, type Options } from '../game/options';
import { Button, Window } from '../game/ui';
import { t, tk } from '../i18n';
import { exportSave, parseSave } from '../save/storage';
import { useProfile } from '../state/profile';

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="options__row">
      <span className="options__label">{label}</span>
      <div className="options__control">{children}</div>
    </div>
  );
}

function Choice<V extends string | boolean>({
  value,
  choices,
  onChange,
  label,
}: {
  readonly value: V;
  readonly choices: readonly { readonly value: V; readonly label: string }[];
  readonly onChange: (value: V) => void;
  readonly label: string;
}) {
  return (
    <div className="choice" role="radiogroup" aria-label={label}>
      {choices.map((c) => (
        <button
          key={String(c.value)}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          className={['choice__item', c.value === value ? 'choice__item--on' : ''].join(' ')}
          onClick={() => {
            onChange(c.value);
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** Options : affichage, vitesse, animations, son, sauvegarde. */
export function OptionsWindow({ onClose }: { readonly onClose: () => void }) {
  const { options, set } = useOptions();
  const { profile, replace, reset } = useProfile();
  const [full, setFull] = useState(isFullscreen);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const test = profile.testMode;

  const download = (): void => {
    const blob = new Blob([exportSave(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outlaw-thesis-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const load = (input: HTMLInputElement): void => {
    const picked = input.files?.[0];
    input.value = '';
    if (picked === undefined) return;
    void picked
      .text()
      .then((raw) => {
        replace(parseSave(raw, content));
        setMessage(t('options.import.ok'));
      })
      .catch(() => {
        setMessage(t('options.import.bad'));
      });
  };

  return (
    <Window title={t('options.title')} onClose={onClose} className="options">
      <Row label={t('options.fullscreen')}>
        {fullscreenAvailable() ? (
          <Button
            variant="quiet"
            size="small"
            icon="fullscreen"
            onClick={() => {
              void toggleFullscreen().then(() => {
                setFull(isFullscreen());
              });
            }}
          >
            {full ? t('options.fullscreen.on') : t('options.fullscreen.off')}
          </Button>
        ) : (
          <p className="hint">{t('options.fullscreen.unavailable')}</p>
        )}
      </Row>
      <Row label={t('options.speed')}>
        <Choice<Options['speed']>
          label={t('options.speed')}
          value={options.speed}
          choices={(['normal', 'fast', 'instant'] as const).map((v) => ({
            value: v,
            label: tk(`options.speed.${v}`),
          }))}
          onChange={(speed) => {
            set({ speed });
          }}
        />
      </Row>
      <Row label={t('options.animations')}>
        <Choice<boolean>
          label={t('options.animations')}
          value={options.animations}
          choices={[
            { value: true, label: t('options.animations.on') },
            { value: false, label: t('options.animations.off') },
          ]}
          onChange={(animations) => {
            set({ animations });
          }}
        />
      </Row>
      <Row label={t('options.audio')}>
        <p className="hint">{t('options.audio.none')}</p>
      </Row>
      <Row label={t('options.save')}>
        {test ? (
          <p className="hint">{t('options.testMode')}</p>
        ) : (
          <div className="options__buttons">
            <Button variant="quiet" size="small" onClick={download}>
              {t('options.export')}
            </Button>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                file.current?.click();
              }}
            >
              {t('options.import')}
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label={t('options.import')}
              onChange={(e) => {
                load(e.target);
              }}
            />
            <Button
              variant="danger"
              size="small"
              onClick={() => {
                setConfirmReset(true);
              }}
            >
              {t('options.reset')}
            </Button>
          </div>
        )}
      </Row>
      {message !== null && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {confirmReset && (
        <Window
          title={t('options.reset')}
          onClose={() => {
            setConfirmReset(false);
          }}
          actions={
            <>
              <Button
                variant="quiet"
                onClick={() => {
                  setConfirmReset(false);
                }}
              >
                {t('ui.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  reset();
                  setConfirmReset(false);
                  setMessage(null);
                }}
              >
                {t('options.reset.yes')}
              </Button>
            </>
          }
        >
          <p>{t('options.reset.confirm')}</p>
        </Window>
      )}
    </Window>
  );
}
