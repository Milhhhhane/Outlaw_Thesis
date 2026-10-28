import { MAP_SIZE, type Dungeon } from '@outlaw/data';
import {
  dungeonOpen,
  essencesOpen,
  lootRates,
  masteryNext,
  masteryRank,
  chestOdds,
  tierCleared,
  tierCount,
  tierLevel,
  tierNumeral,
  tierOpen,
  tierReached,
  tierTargetLevel,
} from '@outlaw/engine';
import { useState } from 'react';
import { backgroundUrl } from '../art';
import { PixelSprite } from '../art/Pixel';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen } from '../game/ui';
import { describeTrigger } from '../i18n/describe';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { Glossed } from '../game/Glossed';

/** Agrandissement de la carte (320 × 180 natifs par chapitre). */
const MAP_SCALE = 2;
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Point d'un donjon sur la carte, en pixels d'écran. */
const at = (d: Dungeon): readonly [number, number] => [d.map.x * MAP_SCALE, d.map.y * MAP_SCALE];

/** Tronçon de sentier entre deux donjons : courbe légèrement bombée. */
function segment(from: Dungeon, to: Dungeon): string {
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  const mx = (x0 + x1) / 2 + 12;
  const my = (y0 + y1) / 2;
  return `M ${String(x0)} ${String(y0)} Q ${String(mx)} ${String(my)} ${String(x1)} ${String(y1)}`;
}

/** Décor de carte d'un chapitre : `world_map` pour le premier, `world_map_<n>` ensuite. */
const boardOf = (chapter: number): string =>
  backgroundUrl(chapter === 1 ? 'world_map' : `world_map_${String(chapter)}`);

/**
 * Carte : les donjons dans l'ordre, reliés par un sentier, chacun posé sur son repère ; la fiche
 * du donjon choisi dans le panneau de droite. Tout vient de dungeons.json (champ `map`) : ajouter
 * un donjon n'exige ni retouche de la carte ni code. Un chapitre = une carte ; les chapitres
 * s'affichent en onglets dès qu'il y en a plusieurs.
 */
export function MapScreen({
  initial,
  initialTier,
}: {
  readonly initial?: string;
  readonly initialTier?: number;
}) {
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
  const dungeon = content.dungeonById.get(selected);
  // Palier choisi par donjon : le plus haut ouvert par défaut (celui qu'on vient d'ouvrir).
  const [tiers, setTiers] = useState<Readonly<Record<string, number>>>(
    initialTier === undefined ? {} : { [selected]: initialTier },
  );
  const tier =
    dungeon === undefined
      ? 1
      : Math.min(
          tiers[dungeon.id] ?? tierReached(content, profile, dungeon.id),
          profile.testMode ? tierCount(content) : tierReached(content, profile, dungeon.id),
        );
  const { tiers: tierRules } = content.balance;
  const chapters = [...new Set(content.dungeons.map((d) => d.map.chapter))].sort((a, b) => a - b);
  const [chapter, setChapter] = useState(dungeon?.map.chapter ?? 1);
  const shown = content.dungeons.filter((d) => d.map.chapter === chapter);
  // Sentier : chaque tronçon relie un donjon au suivant (même chapitre) ; celui qui mène au
  // prochain donjon à faire est animé.
  const segments = content.dungeons.flatMap((d, i) => {
    const prev = content.dungeons[i - 1];
    if (prev === undefined || prev.map.chapter !== chapter || d.map.chapter !== chapter) return [];
    return [{ key: d.id, d: segment(prev, d), next: d.id === next }];
  });
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
          {chapters.length > 1 && (
            <div className="map__chapters" role="tablist" aria-label={t('map.chapters')}>
              {chapters.map((c) => (
                <Button
                  key={c}
                  role="tab"
                  aria-selected={c === chapter}
                  variant={c === chapter ? 'primary' : 'quiet'}
                  size="small"
                  onClick={() => {
                    setChapter(c);
                  }}
                >
                  {t('map.chapter', { n: c })}
                </Button>
              ))}
            </div>
          )}
          <div
            className="map__board"
            style={{
              width: MAP_SIZE.w * MAP_SCALE,
              height: MAP_SIZE.h * MAP_SCALE,
              backgroundImage: `url(${boardOf(chapter)})`,
            }}
          >
            <svg
              className="map__path"
              viewBox={`0 0 ${String(MAP_SIZE.w * MAP_SCALE)} ${String(MAP_SIZE.h * MAP_SCALE)}`}
              aria-hidden="true"
            >
              {segments.map((s) => (
                <path
                  key={s.key}
                  className={s.next ? 'map__path-next' : 'map__path-done'}
                  d={s.d}
                />
              ))}
            </svg>
            {shown.map((d) => (
              <span
                key={`lm${d.id}`}
                className="map__landmark"
                style={{ left: at(d)[0], top: at(d)[1] }}
                aria-hidden="true"
              >
                <PixelSprite name={`landmark_${d.map.landmark}`} />
              </span>
            ))}
            <ol className="map__nodes">
              {shown.map((d) => {
                const index = content.dungeons.indexOf(d);
                const [x, y] = at(d);
                const state = status(d.id);
                return (
                  <li
                    key={d.id}
                    className={[
                      'map__node-wrap',
                      d.id === next || d.id === selected ? 'map__node-wrap--named' : '',
                    ].join(' ')}
                    style={{ left: x, top: y }}
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
                    {state === 'cleared' && tierReached(content, profile, d.id) > 1 && (
                      <span className="map__tier-badge" aria-hidden="true">
                        {tierNumeral(tierReached(content, profile, d.id))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="map__foot">
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
            <Button
              size="small"
              variant="quiet"
              className="map__essences"
              title={t('essence.open.hint')}
              onClick={() => {
                go({ name: 'essences' });
              }}
            >
              <Icon name={essencesOpen(content, profile) ? 'trigger' : 'lock'} />{' '}
              {t('essence.open')}
            </Button>
          </div>
        </div>

        {dungeon !== undefined && (
          <Panel className="map__panel" label={names.dungeon(dungeon.id)}>
            <div
              className="map__thumb"
              style={{ backgroundImage: `url(${backgroundUrl(dungeon.scene ?? dungeon.id)})` }}
            />
            <div className="map__info">
              <h2 className="detail__title">{names.dungeon(dungeon.id)}</h2>
              <p className="map__level">
                {t('hub.dungeon.recommended', {
                  level: tierTargetLevel(content, dungeon, tier),
                })}
                {teamLevel > 0 && (
                  <span
                    className={teamLevel >= tierTargetLevel(content, dungeon, tier) ? 'ok' : 'warn'}
                  >
                    {' '}
                    · {t('map.teamLevel', { level: teamLevel })}
                  </span>
                )}
              </p>
              {status(dungeon.id) !== 'locked' && (
                <div className="map__tiers" role="group" aria-label={t('tier.choose')}>
                  <span className="hint">{t('tier.choose')} :</span>
                  {Array.from({ length: tierCount(content) }, (_, i) => i + 1).map((k) => {
                    const open = tierOpen(content, profile, dungeon.id, k);
                    const done = tierCleared(profile, dungeon.id, k);
                    return (
                      <button
                        key={k}
                        type="button"
                        className={[
                          'map__tier',
                          k === tier ? 'map__tier--on' : '',
                          done ? 'map__tier--done' : '',
                        ].join(' ')}
                        aria-pressed={k === tier}
                        disabled={!open}
                        title={open ? undefined : t('tier.locked')}
                        aria-label={t('tier.state', {
                          name: t('tier.name', { tier: tierNumeral(k) }),
                          state: !open
                            ? t('map.locked')
                            : done
                              ? t('tier.cleared')
                              : t('tier.open'),
                        })}
                        onClick={() => {
                          setTiers((all) => ({ ...all, [dungeon.id]: k }));
                        }}
                      >
                        {open ? tierNumeral(k) : <Icon name="lock" />}
                      </button>
                    );
                  })}
                  <span className="map__tier-text">
                    {tier === 1
                      ? t('tier.base')
                      : t('tier.effects', {
                          level: tierLevel(content, dungeon, tier),
                          pct: Math.round((tier - 1) * tierRules.enemyPctPerTier.atk),
                          gold: Math.round((tier - 1) * tierRules.rewardPctPerTier.gold),
                          dust: Math.round((tier - 1) * tierRules.rewardPctPerTier.materials),
                          rare: (tier - 1) * tierRules.rareWeightPerTier,
                        })}{' '}
                    {t('tier.chests', {
                      odds: chestOdds(content, dungeon, tier)
                        .filter((o) => o.pct > 0)
                        .map(
                          (o) =>
                            `${tk(`chest.short.${o.chest}`)}\u00a0${String(Math.round(o.pct))}`,
                        )
                        .join(', '),
                    })}
                  </span>
                </div>
              )}
              <p className="map__text">{names.dungeonText(dungeon.id)}</p>
              <p className="map__modifier">
                <strong>{names.passive(dungeon.modifier.id)}</strong>{' '}
                <Glossed
                  text={dungeon.modifier.rules
                    .map((rule) =>
                      t('hub.dungeon.modifier', {
                        side: tk(`hub.dungeon.side.${rule.appliesTo}`),
                        text: lowerFirst(describeTrigger(rule.trigger)),
                      }),
                    )
                    .join(' ')}
                />
              </p>
              <p className="map__loot">
                <span className="hint">{t('map.loot')} : </span>
                {lootRates(
                  content,
                  dungeon,
                  masteryRank(content, profile.dungeons[dungeon.id]?.clears ?? 0),
                  tier,
                ).map((rate, i) => (
                  <span
                    key={rate.item}
                    className={
                      content.itemById.get(rate.item)?.rarity === 'rare' ? 'map__loot-rare' : ''
                    }
                  >
                    {i > 0 ? ' · ' : ''}
                    <Icon name={`item_${rate.item}`} />{' '}
                    {t('map.itemRate', { item: names.item(rate.item), pct: Math.round(rate.pct) })}
                  </span>
                ))}
                {!tierCleared(profile, dungeon.id, tier) &&
                  content.balance.economy.loot.firstClearRare && (
                    <span className="hint"> · {t('map.firstRare')}</span>
                  )}
              </p>
              <p
                className="hint"
                title={t('map.pity', { count: content.balance.economy.loot.rarePity })}
              >
                {(profile.dungeons[dungeon.id]?.clears ?? 0) > 0
                  ? t('hub.dungeon.clears', { count: profile.dungeons[dungeon.id]?.clears ?? 0 })
                  : t('hub.dungeon.new')}
                {' · '}
                {t('map.mastery', {
                  rank: masteryRank(content, profile.dungeons[dungeon.id]?.clears ?? 0),
                  max: content.balance.economy.loot.mastery.clears.length,
                })}
                {masteryNext(content, profile.dungeons[dungeon.id]?.clears ?? 0) !== null &&
                  ` (${t('map.mastery.next', {
                    next: masteryNext(content, profile.dungeons[dungeon.id]?.clears ?? 0) ?? 0,
                  })})`}
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
                  go({ name: 'team', dungeon: dungeon.id, tier });
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
