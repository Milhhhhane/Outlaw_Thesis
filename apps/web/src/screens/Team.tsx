import { dungeonOpen, heroBuild, setLevel, setTeam } from '@outlaw/engine';
import { useState } from 'react';
import { PixelSprite } from '../art/Pixel';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Panel, Screen, Stepper } from '../game/ui';
import { names, t, tk } from '../i18n';
import { shareUrl } from '../save/share';
import { useProfile } from '../state/profile';

const MAX_TEAM = 3;

/** Composition : trois emplacements, les héros débloqués en dessous. */
export function Team({ dungeon }: { readonly dungeon?: string }) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const [copied, setCopied] = useState(false);
  const test = profile.testMode;
  const back = (): void => {
    go(dungeon === undefined ? { name: 'hub' } : { name: 'map', dungeon });
  };
  const toggle = (id: string): void => {
    const team = profile.team.includes(id)
      ? profile.team.filter((h) => h !== id)
      : [...profile.team, id];
    apply(setTeam(profile, team));
  };
  const full = profile.team.length >= MAX_TEAM;
  const link = test
    ? shareUrl(
        profile.team.map((id) => heroBuild(profile, id)),
        `${window.location.origin}${window.location.pathname}`,
      )
    : '';
  const canGo =
    dungeon !== undefined && profile.team.length > 0 && dungeonOpen(content, profile, dungeon);

  return (
    <Screen
      title={
        dungeon === undefined ? t('team.title') : t('team.for', { dungeon: names.dungeon(dungeon) })
      }
      onBack={back}
      className="team"
    >
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
              className={`team__slot element-${def?.element ?? 'fire'}`}
              aria-label={t('team.remove', { hero: names.hero(id) })}
              onClick={() => {
                toggle(id);
              }}
            >
              <span className="team__sprite">
                <PixelSprite name={id} idle />
              </span>
              <span className="team__name">{names.hero(id)}</span>
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

      <Panel className="team__roster" label={t('team.roster')}>
        <ul className="roster">
          {profile.unlocked.map((id) => {
            const def = content.heroById.get(id);
            const hero = profile.heroes[id];
            if (def === undefined || hero === undefined) return null;
            const inTeam = profile.team.includes(id);
            return (
              <li
                key={id}
                className={[
                  'roster__card',
                  `element-${def.element}`,
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
                    <PixelSprite name={id} />
                  </span>
                  <span className="roster__name">{names.hero(id)}</span>
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
        {dungeon !== undefined && (
          <Button
            size="large"
            disabled={!canGo}
            onClick={() => {
              go({ name: 'dungeon', id: dungeon });
            }}
          >
            {t('team.go', { dungeon: names.dungeon(dungeon) })} ▶
          </Button>
        )}
      </footer>
    </Screen>
  );
}
