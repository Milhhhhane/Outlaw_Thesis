import { SPELL_SLOTS, type SpellSlot } from '@outlaw/data';
import {
  compileHero,
  heroBuild,
  setSpellLevel,
  spellPowerPct,
  spellUp,
  spellUpCost,
} from '@outlaw/engine';
import { content } from '../combat/session';
import { Button, Icon, Stepper } from '../game/ui';
import { names, t } from '../i18n';
import { useProfile } from '../state/profile';
import { previewDiff } from './HeroSheet';
import { UpgradePips } from './Workshop';
import './spells.css';

const signed = (n: number): string => (n > 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

/** Bonus du dernier niveau d'un emplacement, en texte (« délai −10 »). */
function capstoneText(slot: SpellSlot): string {
  const bonus = content.balance.spellLevels.capstone[slot];
  const parts = [
    bonus.cost !== 0 ? t('spells.capstone.cost', { signed: signed(bonus.cost) }) : '',
    bonus.delay !== 0 ? t('spells.capstone.delay', { signed: signed(bonus.delay) }) : '',
  ].filter((p) => p !== '');
  return parts.length > 0 ? parts.join(', ') : t('spells.capstone.none');
}

/**
 * Onglet « Grimoire » de la fiche : niveau de chaque sort, gain actuel, aperçu du niveau suivant
 * (calculé par le moteur sur l'unité compilée), coût et bouton. Mode test : niveaux réglables.
 */
export function SpellLevels({ heroId }: { readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const hero = profile.heroes[heroId];
  if (hero === undefined) return null;
  const { max } = content.balance.spellLevels;
  const build = heroBuild(profile, heroId);
  const before = compileHero(content, build, { side: 'player', slot: 0 });
  const fragments = profile.fragments[heroId] ?? 0;

  return (
    <div className="spell-levels">
      <p className="spell-levels__intro hint">
        {t('spells.intro', { pct: content.balance.spellLevels.powerPctPerLevel })}
      </p>
      {!profile.testMode ? (
        <p className="spell-levels__stock">
          <Icon name="trigger" />{' '}
          {t('spells.stock', { grimoires: profile.grimoires, hero: names.hero(heroId), fragments })}
        </p>
      ) : (
        <Button
          size="small"
          variant="quiet"
          onClick={() => apply(setSpellLevel(content, profile, heroId, null, max))}
        >
          {t('spells.test.all')}
        </Button>
      )}
      <ul className="spell-levels__list">
        {SPELL_SLOTS.map((slot) => {
          const spell = before.spells.find((s) => s.slot === slot);
          if (spell === undefined) return null;
          const level = hero.spells[slot];
          const cost = spellUpCost(content, level);
          const pct = spellPowerPct(content.balance, level);
          const name = names.spell(spell.id);
          const after =
            cost === null
              ? null
              : compileHero(
                  content,
                  { ...build, spells: { ...hero.spells, [slot]: level + 1 } },
                  { side: 'player', slot: 0 },
                );
          const diff = after === null ? [] : previewDiff(before, after).flatMap((d) => d.lines);
          const affordable =
            cost !== null && profile.grimoires >= cost.grimoires && fragments >= cost.fragments;
          return (
            <li key={slot} className={`spell-level spell-card--${slot}`}>
              <p className="spell-level__head">
                <span className="spell-level__name">{name}</span>
                <span className="hint">{t(`spells.slot.${slot}`)}</span>
              </p>
              <p className="spell-level__state">
                <UpgradePips level={level - 1} max={max - 1} />{' '}
                <span>{t('spells.level', { level, max })}</span>
                {' · '}
                <span className="gold-text">
                  {pct > 0 ? t('spells.gain', { pct }) : t('spells.gain.none')}
                </span>
              </p>
              <p className="hint">{t('spells.capstone', { max, bonus: capstoneText(slot) })}</p>
              {profile.testMode ? (
                <Stepper
                  label={t('spells.test', { spell: name })}
                  value={level}
                  min={1}
                  max={max}
                  onChange={(n) => {
                    apply(setSpellLevel(content, profile, heroId, slot, n));
                  }}
                />
              ) : cost === null ? (
                <p className="hint">{t('spells.max')}</p>
              ) : (
                <>
                  <p className="spell-level__next">{t('spells.next', { level: level + 1 })}</p>
                  <ul className="preview">
                    {diff.map((line, i) => (
                      <li
                        key={i}
                        className={
                          line.startsWith('+')
                            ? 'preview__add'
                            : line.startsWith('−')
                              ? 'preview__del'
                              : 'preview__num'
                        }
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                  <div className="spell-level__buy">
                    <span className="hint">
                      {t('spells.cost', { grimoires: cost.grimoires, fragments: cost.fragments })}
                    </span>
                    <Button
                      size="small"
                      disabled={!affordable}
                      aria-label={t('spells.up', { spell: name })}
                      onClick={() => apply(spellUp(content, profile, heroId, slot))}
                    >
                      {t('spells.up.short')}
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
