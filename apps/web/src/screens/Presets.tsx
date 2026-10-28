import { PRESET_NAME_MAX } from '@outlaw/data';
import { loadPreset, presetMissing, presetSlots, savePreset } from '@outlaw/engine';
import { useId, useState } from 'react';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { Button, Window } from '../game/ui';
import { joinNames, names, t } from '../i18n';
import { useProfile } from '../state/profile';
import './farm.css';

/** Fenêtre de nom avant d'enregistrer l'équipe courante dans un emplacement. */
function SaveWindow({
  slot,
  initial,
  onClose,
}: {
  readonly slot: number;
  readonly initial: string;
  readonly onClose: () => void;
}) {
  const { profile, apply } = useProfile();
  const [name, setName] = useState(initial);
  const form = useId();
  const input = useId();
  const submit = (): void => {
    if (apply(savePreset(content, profile, slot, name))) onClose();
  };
  return (
    <Window
      title={t('preset.save.title', { n: slot + 1 })}
      className="preset-window"
      onClose={onClose}
      actions={
        <>
          <Button type="submit" form={form}>
            {t('preset.save')}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t('ui.close')}
          </Button>
        </>
      }
    >
      <form
        id={form}
        className="preset-window__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={input}>{t('preset.name')}</label>
        <input
          id={input}
          value={name}
          maxLength={PRESET_NAME_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </form>
      <p className="preset-window__team">
        {profile.team.map((id) => (
          <Portrait key={id} kind={id} size={32} />
        ))}
        <span>{joinNames(profile.team.map((id) => names.hero(id)))}</span>
      </p>
    </Window>
  );
}

/**
 * Équipes enregistrées : un clic charge l'équipe (refus du moteur si un héros manque), « Enregistrer »
 * y range l'équipe courante sous un nom. Tout passe par les fonctions du moteur.
 */
export function Presets() {
  const { profile, apply } = useProfile();
  const [saving, setSaving] = useState<number | null>(null);
  const slots = presetSlots(profile);
  return (
    <section className="presets" aria-label={t('preset.title')}>
      <h2 className="presets__title">{t('preset.title')}</h2>
      <ol className="presets__list">
        {slots.map((preset, slot) => {
          const missing = presetMissing(content, profile, slot);
          return (
            <li key={slot} className="preset">
              <button
                type="button"
                className={['preset__load', missing.length > 0 ? 'preset__load--missing' : ''].join(
                  ' ',
                )}
                disabled={preset === null}
                aria-label={
                  preset === null
                    ? t('preset.load.empty', { n: slot + 1 })
                    : t('preset.load', { name: preset.name })
                }
                onClick={() => {
                  apply(loadPreset(content, profile, slot));
                }}
              >
                <span className="preset__name">{preset?.name ?? t('preset.empty')}</span>
                {preset !== null && missing.length === 0 && (
                  <span className="preset__team" aria-hidden="true">
                    {preset.team.map((id) => (
                      <Portrait key={id} kind={id} size={20} />
                    ))}
                  </span>
                )}
                {missing.length > 0 && (
                  <span className="preset__missing">
                    {t('preset.missing', {
                      heroes: joinNames(missing.map((id) => names.hero(id))),
                    })}
                  </span>
                )}
              </button>
              <Button
                size="small"
                variant="quiet"
                aria-label={t('preset.save.aria', { n: slot + 1 })}
                onClick={() => {
                  setSaving(slot);
                }}
              >
                {t('preset.save')}
              </Button>
            </li>
          );
        })}
      </ol>
      {saving !== null && (
        <SaveWindow
          slot={saving}
          initial={slots[saving]?.name ?? t('preset.default', { n: saving + 1 })}
          onClose={() => {
            setSaving(null);
          }}
        />
      )}
    </section>
  );
}
