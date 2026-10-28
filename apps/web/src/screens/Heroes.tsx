import { canLevelUp, heroStars, summonCost, talentPoints } from '@outlaw/engine';
import { HeroSprite } from '../art/HeroSprite';
import { content } from '../combat/session';
import { HeroFilters } from '../game/HeroFilters';
import { heroList } from '../game/heroList';
import { useGame } from '../game/nav';
import { useOptions } from '../game/options';
import { Rarity } from '../game/Rarity';
import { Screen } from '../game/ui';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';

/** Héros offerts par un donjon : leur fiche verrouillée le dit. */
const fromDungeon = new Set(content.dungeons.flatMap((d) => d.unlocksHero ?? []));

/**
 * Galerie des héros : les débloqués s'ouvrent sur leur fiche, les autres restent dans l'ombre (leur
 * rareté et leur coût d'invocation restent lisibles). La grille défile dans son cadre ; tri et
 * filtres sont retenus sur l'appareil.
 */
export function Heroes() {
  const { go } = useGame();
  const { profile } = useProfile();
  const { options } = useOptions();
  const shown = heroList(content, profile, options.heroView, names.hero);
  const owned = content.heroes.filter((h) => profile.unlocked.includes(h.id)).length;
  return (
    <Screen
      title={t('heroes.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="heroes"
    >
      <div className="heroes__tools">
        <p className="hint heroes__count">
          {t('heroes.count', { n: owned, total: content.heroes.length })}
        </p>
        <HeroFilters shown={shown.length} />
      </div>
      <ul className="heroes__grid">
        {shown.length === 0 && <li className="hint heroes__none">{t('filter.none')}</li>}
        {shown.map((def) => {
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
                  `rarity-${String(def.tier)}`,
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
                <span className="hero-card__name">
                  {unlocked ? names.hero(def.id) : '???'}
                  <Rarity tier={def.tier} short />
                </span>
                {unlocked ? (
                  <>
                    <span className="hero-card__meta">
                      {t('hub.level', { level: hero.level })} · {tk(`element.${def.element}`)} ·{' '}
                      {t('hero.starsShort', { n: heroStars(hero, content) })}
                    </span>
                    <span className="hero-card__thesis">{names.heroThesis(def.id)}</span>
                    {free > 0 ? (
                      <span className="hero-card__badge">{t('heroes.points', { n: free })}</span>
                    ) : (
                      canLevelUp(content, profile, hero) && (
                        <span className="hero-card__badge">{t('hero.levelUp.ready')}</span>
                      )
                    )}
                  </>
                ) : (
                  <span className="hero-card__thesis">
                    {fromDungeon.has(def.id)
                      ? t('heroes.locked', { n: summonCost(content, def.id) })
                      : t('heroes.locked.summon', { n: summonCost(content, def.id) })}
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
