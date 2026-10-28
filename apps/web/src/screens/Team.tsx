import {
  dungeonOpen,
  FARM_RUNS,
  heroBuild,
  setLevel,
  setTeam,
  tierOpen,
  type FarmRuns,
} from '@outlaw/engine';
import { useState } from 'react';
import { HeroSprite } from '../art/HeroSprite';
import { PixelSprite } from '../art/Pixel';
import { content } from '../combat/session';
import { HeroFilters } from '../game/HeroFilters';
import { heroList } from '../game/heroList';
import { useGame } from '../game/nav';
import { useOptions } from '../game/options';
import { Rarity } from '../game/Rarity';
import { Button, Choice, Panel, Screen, Stepper } from '../game/ui';
import { dungeonTitle, names, t, tk } from '../i18n';
import { Presets } from './Presets';
import { shareUrl } from '../save/share';
import { useProfile } from '../state/profile';

const MAX_TEAM = content.balance.progression.teamSize;

const runsText = (runs: FarmRuns): string =>
  runs === 'energy' ? t('farm.runs.energy') : String(runs);
const runsLong = (runs: FarmRuns): string =>
  runs === 'energy' ? t('farm.runs.energy.long') : t('farm.runs.n', { n: runs });

/**
 * Composition : `teamSize` emplacements et les équipes enregistrées, les héros débloqués en
 * dessous (triés et filtrés). Avant un donjon : le nombre de passages joués d'affilée en Auto.
 */
export function Team({ dungeon, tier }: { readonly dungeon?: string; readonly tier?: number }) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const { options, set } = useOptions();
  const roster = heroList(
    content,
    profile,
    options.heroView,
    names.hero,
    content.heroes.filter((h) => profile.unlocked.includes(h.id)),
  );
  const [copied, setCopied] = useState(false);
  const test = profile.testMode;
  const back = (): void => {
    go(dungeon === undefined ? { name: 'hub' } : { name: 'map', dungeon, tier });
  };
  const toggle = (id: string): void => {
    const team = profile.team.includes(id)
      ? profile.team.filter((h) => h !== id)
      : [...profile.team, id];
    apply(setTeam(content, profile, team));
  };
  const full = profile.team.length >= MAX_TEAM;
  const link = test
    ? shareUrl(
        profile.team.map((id) => heroBuild(profile, id)),
        `${window.location.origin}${window.location.pathname}`,
      )
    : '';
  const canGo =
    dungeon !== undefined &&
    profile.team.length > 0 &&
    dungeonOpen(content, profile, dungeon) &&
    tierOpen(content, profile, dungeon, tier ?? 1);

  return (
    <Screen
      title={
        dungeon === undefined
          ? t('team.title')
          : t('team.for', { dungeon: dungeonTitle(dungeon, tier) })
      }
      onBack={back}
      className="team"
    >
      <div className="team__top">
        <div className="team__slots">
          {Array.from({ length: MAX_TEAM }, (_, slot) => {
            const id = profile.team[slot];
            if (id === undefined) {
              return (
                <div key={slot} className="team__slot team__slot--empty">
                  <span>{t('team.slot.empty')}</span>
                  <span className="hint">{t('team.slot.hint')}</span>
                </div>
              );
            }
            const def = content.heroById.get(id);
            return (
              <button
                key={id}
                type="button"
                className={`team__slot element-${def?.element ?? 'fire'} rarity-${String(def?.tier ?? 1)}`}
                aria-label={t('team.remove', { hero: names.hero(id) })}
                onClick={() => {
                  toggle(id);
                }}
              >
                <PixelSprite name="pedestal" className="pedestal" />
                <span className="team__sprite">
                  <HeroSprite name={id} idle />
                </span>
                <span className="team__name">
                  {names.hero(id)} <Rarity tier={def?.tier ?? 1} short />
                </span>
                <span className="team__meta">
                  {t('hub.level', { level: profile.heroes[id]?.level ?? 1 })} ·{' '}
                  {tk(`element.${def?.element ?? 'fire'}`)}
                </span>
                <span className="team__remove" aria-hidden="true">
                  ✕
                </span>
              </button>
            );
          })}
        </div>
        <Presets />
      </div>

      <HeroFilters shown={roster.length} ownedFilter={false} />

      <Panel className="team__roster" label={t('team.roster')}>
        <ul className="roster">
          {roster.length === 0 && <li className="hint">{t('filter.none')}</li>}
          {roster.map((def) => {
            const { id } = def;
            const hero = profile.heroes[id];
            if (hero === undefined) return null;
            const inTeam = profile.team.includes(id);
            return (
              <li
                key={id}
                className={[
                  'roster__card',
                  `element-${def.element}`,
                  `rarity-${String(def.tier)}`,
                  inTeam ? 'roster__card--in' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  className="roster__pick"
                  aria-pressed={inTeam}
                  aria-label={
                    inTeam
                      ? t('team.remove', { hero: names.hero(id) })
                      : t('team.add', { hero: names.hero(id) })
                  }
                  disabled={!inTeam && full}
                  title={!inTeam && full ? t('team.full') : undefined}
                  onClick={() => {
                    toggle(id);
                  }}
                >
                  <span className="roster__portrait">
                    <HeroSprite name={id} />
                  </span>
                  <span className="roster__name">
                    {names.hero(id)} <Rarity tier={def.tier} short />
                  </span>
                  <span className="roster__level">{t('hub.level', { level: hero.level })}</span>
                </button>
                {test && (
                  <Stepper
                    label={t('test.level', { hero: names.hero(id) })}
                    value={hero.level}
                    min={1}
                    max={content.balance.progression.maxLevel}
                    onChange={(level) => {
                      apply(setLevel(content, profile, id, level));
                    }}
                  />
                )}
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    go({ name: 'hero', id });
                  }}
                >
                  {t('team.sheet')} ▸
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <footer className="team__foot">
        {test && (
          <div className="share">
            <label htmlFor="share-link">{t('test.share.label')}</label>
            <input
              id="share-link"
              readOnly
              value={link}
              onFocus={(e) => {
                e.target.select();
              }}
            />
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => {
                    setCopied(true);
                  })
                  .catch(() => {
                    setCopied(false);
                  });
              }}
            >
              {copied ? t('test.share.copied') : t('test.share.copy')}
            </Button>
          </div>
        )}
        {dungeon !== undefined && !test && (
          <div className="team__runs">
            <span className="hint">{t('farm.runs')}</span>
            <Choice
              label={t('farm.runs.label')}
              options={FARM_RUNS}
              value={options.runs}
              onChange={(runs) => {
                set({ runs });
              }}
              text={runsText}
              describe={runsLong}
            />
          </div>
        )}
        {dungeon !== undefined && (
          <Button
            size="large"
            disabled={!canGo}
            onClick={() => {
              // Une série se joue en Auto : le mode est coché pour elle (et reste réglé ensuite).
              const runs = test ? 1 : options.runs;
              if (runs !== 1) set({ auto: true });
              go({ name: 'dungeon', id: dungeon, tier, runs });
            }}
          >
            {t('team.go', { dungeon: dungeonTitle(dungeon, tier) })} ▶
          </Button>
        )}
      </footer>
    </Screen>
  );
}
