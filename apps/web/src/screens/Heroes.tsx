import { heroStars, talentPoints } from '@outlaw/engine';
import { HeroSprite } from '../art/HeroSprite';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Screen } from '../game/ui';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';

/** Galerie des héros : les débloqués s'ouvrent sur leur fiche, les autres restent dans l'ombre. */
export function Heroes() {
  const { go } = useGame();
  const { profile } = useProfile();
  return (
    <Screen
      title={t('heroes.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="heroes"
    >
      <ul className="heroes__grid">
        {content.heroes.map((def) => {
          const hero = profile.heroes[def.id];
          const unlocked = profile.unlocked.includes(def.id) && hero !== undefined;
          const free = unlocked
            ? talentPoints(hero.level, content.balance) - hero.talents.length
            : 0;
          return (
            <li key={def.id}>
              <button
                type="button"
                className={[
                  'hero-card',
                  `element-${def.element}`,
                  unlocked ? '' : 'hero-card--locked',
                ].join(' ')}
                disabled={!unlocked}
                onClick={() => {
                  go({ name: 'hero', id: def.id });
                }}
              >
                <span className="hero-card__sprite">
                  <HeroSprite name={def.id} idle={unlocked} />
                </span>
                <span className="hero-card__name">{unlocked ? names.hero(def.id) : '???'}</span>
                {unlocked ? (
                  <>
                    <span className="hero-card__meta">
                      {t('hub.level', { level: hero.level })} · {tk(`element.${def.element}`)} ·{' '}
                      {t('hero.starsShort', { n: heroStars(hero, content) })}
                    </span>
                    <span className="hero-card__thesis">{names.heroThesis(def.id)}</span>
                    {free > 0 && (
                      <span className="hero-card__badge">{t('heroes.points', { n: free })}</span>
                    )}
                  </>
                ) : (
                  <span className="hero-card__thesis">
                    {t('heroes.locked', { n: content.balance.chests.summonCost })}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
