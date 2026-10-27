import { dungeonOpen, lootRates } from '@outlaw/engine';
import { useState } from 'react';
import { backgroundUrl } from '../art';
import { MAP_NODES } from '../art/sprites';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen } from '../game/ui';
import { describeTrigger } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';

/** Agrandissement de la carte (320 × 180 natifs). */
const MAP_SCALE = 2;
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Carte : sept étapes reliées, la fiche du donjon choisi dans le panneau de droite. */
export function MapScreen({ initial }: { readonly initial?: string }) {
  const { go } = useGame();
  const { profile } = useProfile();
  const status = (id: string): 'locked' | 'cleared' | 'open' =>
    !dungeonOpen(content, profile, id)
      ? 'locked'
      : (profile.dungeons[id]?.clears ?? 0) > 0
        ? 'cleared'
        : 'open';
  const next = content.dungeons.find((d) => status(d.id) === 'open')?.id;
  const [selected, setSelected] = useState(initial ?? next ?? content.dungeons[0]?.id ?? '');
  // Tronçon animé du sentier : du dernier donjon terminé vers le prochain.
  const nextIndex = content.dungeons.findIndex((d) => d.id === next);
  const pathToNext = (() => {
    if (nextIndex <= 0) return null;
    const from = MAP_NODES[content.dungeons[nextIndex - 1]?.id ?? ''];
    const to = MAP_NODES[next ?? ''];
    if (from === undefined || to === undefined) return null;
    const [x0, y0] = from;
    const [x1, y1] = to;
    const mx = ((x0 + x1) / 2 + 6) * MAP_SCALE;
    const my = ((y0 + y1) / 2) * MAP_SCALE;
    return `M ${String(x0 * MAP_SCALE)} ${String(y0 * MAP_SCALE)} Q ${String(mx)} ${String(my)} ${String(x1 * MAP_SCALE)} ${String(y1 * MAP_SCALE)}`;
  })();
  const dungeon = content.dungeonById.get(selected);
  const teamLevel =
    profile.team.length === 0
      ? 0
      : Math.round(
          profile.team.reduce((sum, id) => sum + (profile.heroes[id]?.level ?? 1), 0) /
            profile.team.length,
        );

  return (
    <Screen
      title={t('map.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="map"
    >
      <div className="map__layout">
        <div className="map__left">
          <div
            className="map__board"
            style={{
              width: 320 * MAP_SCALE,
              height: 180 * MAP_SCALE,
              backgroundImage: `url(${backgroundUrl('world_map')})`,
            }}
          >
            {pathToNext !== null && (
              <svg
                className="map__path"
                viewBox={`0 0 ${String(320 * MAP_SCALE)} ${String(180 * MAP_SCALE)}`}
                aria-hidden="true"
              >
                <path className="map__path-next" d={pathToNext} />
              </svg>
            )}
            <ol className="map__nodes">
              {content.dungeons.map((d, index) => {
                const [x, y] = MAP_NODES[d.id] ?? [0, 0];
                const state = status(d.id);
                return (
                  <li
                    key={d.id}
                    className="map__node-wrap"
                    style={{ left: x * MAP_SCALE, top: y * MAP_SCALE }}
                  >
                    <button
                      type="button"
                      className={[
                        'map__node',
                        `map__node--${state}`,
                        d.id === next ? 'map__node--next' : '',
                        d.id === selected ? 'map__node--on' : '',
                        `element-${d.element === 'mixed' ? 'mixed' : d.element}`,
                      ].join(' ')}
                      aria-pressed={d.id === selected}
                      aria-label={`${t('map.step', { n: index + 1 })} : ${names.dungeon(d.id)}, ${tk(`map.${state === 'open' ? 'next' : state}`)}`}
                      onClick={() => {
                        setSelected(d.id);
                      }}
                    >
                      {state === 'locked' ? (
                        <Icon name="lock" />
                      ) : state === 'cleared' ? (
                        <Icon name="check" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </button>
                    <span className="map__label" aria-hidden="true">
                      {names.dungeon(d.id)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="map__legend" aria-hidden="true">
            <span className="map__key map__key--open">1</span> {t('map.next')}
            <span className="map__key map__key--cleared">
              <Icon name="check" />
            </span>{' '}
            {t('map.cleared')}
            <span className="map__key map__key--locked">
              <Icon name="lock" />
            </span>{' '}
            {t('map.locked')}
            <span className="map__team">
              {profile.team.map((id) => (
                <Portrait key={id} kind={id} size={32} />
              ))}
            </span>
          </p>
        </div>

        {dungeon !== undefined && (
          <Panel className="map__panel" label={names.dungeon(dungeon.id)}>
            <div
              className="map__thumb"
              style={{ backgroundImage: `url(${backgroundUrl(dungeon.id)})` }}
            />
            <div className="map__info">
              <h2 className="detail__title">{names.dungeon(dungeon.id)}</h2>
              <p className="map__level">
                {t('hub.dungeon.recommended', { level: dungeon.recommendedLevel })}
                {teamLevel > 0 && (
                  <span className={teamLevel >= dungeon.recommendedLevel ? 'ok' : 'warn'}>
                    {' '}
                    · {t('map.teamLevel', { level: teamLevel })}
                  </span>
                )}
              </p>
              <p className="map__text">{names.dungeonText(dungeon.id)}</p>
              <p className="map__modifier">
                <strong>{names.passive(dungeon.modifier.id)}</strong>{' '}
                {dungeon.modifier.rules
                  .map((rule) =>
                    t('hub.dungeon.modifier', {
                      side: tk(`hub.dungeon.side.${rule.appliesTo}`),
                      text: lowerFirst(describeTrigger(rule.trigger)),
                    }),
                  )
                  .join(' ')}
              </p>
              <p className="map__loot">
                <span className="hint">{t('map.loot')} : </span>
                {lootRates(dungeon)
                  .slice(0, 4)
                  .map((rate) => `${names.item(rate.item)} ${Math.round(rate.pct)} %`)
                  .join(', ')}
              </p>
              <p className="hint">
                {(profile.dungeons[dungeon.id]?.clears ?? 0) > 0
                  ? t('hub.dungeon.clears', { count: profile.dungeons[dungeon.id]?.clears ?? 0 })
                  : t('hub.dungeon.new')}
              </p>
            </div>
            {status(dungeon.id) === 'locked' ? (
              <p className="map__locked">
                <Icon name="lock" /> {t('hub.dungeon.locked')}
              </p>
            ) : (
              <Button
                size="large"
                className="map__go"
                onClick={() => {
                  go({ name: 'team', dungeon: dungeon.id });
                }}
              >
                {t('map.prepare')} ▶
              </Button>
            )}
          </Panel>
        )}
      </div>
    </Screen>
  );
}
