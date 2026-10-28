import type { Element, EssenceDungeon, Profile } from '@outlaw/data';
import {
  enterEssence,
  essenceDrop,
  essenceEncounter,
  essenceTierOpen,
  essenceTierReached,
  essencesOpen,
  tierCount,
  tierNumeral,
  tierTargetLevel,
} from '@outlaw/engine';
import { useState } from 'react';
import { backgroundUrl } from '../art';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { Button, Icon, Panel, Screen } from '../game/ui';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import './awakening.css';

/** « 3 essence(s) faible(s) de feu ». */
export function essenceAmount(element: Element, quality: number, amount: number): string {
  return t('essence.amount', {
    amount,
    quality: tk(`essence.quality.${String(quality)}`),
    element: tk(`essence.of.${element}`),
  });
}

/** Stock d'essences d'un élément, en une ligne. */
export function essenceStock(profile: Profile, element: Element): string {
  const [low, mid, high] = profile.essences[element];
  return t('essence.stock.line', { element: tk(`element.${element}`), low, mid, high });
}

/**
 * Sanctuaires d'essence, ouverts depuis la carte : à gauche les trois sanctuaires et le stock
 * d'essences, à droite la fiche du sanctuaire choisi (palier, ennemis, essences par victoire) et le
 * bouton Combattre. Tout vient du moteur (`essenceTierOpen`, `essenceEncounter`, `essenceDrop`).
 */
export function Essences({ initial }: { readonly initial?: string }) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const list = content.essenceDungeons;
  const [selected, setSelected] = useState(initial ?? list[0]?.id ?? '');
  const dungeon = list.find((d) => d.id === selected);
  const max = tierCount(content);
  const reached = (d: EssenceDungeon): number =>
    profile.testMode ? max : Math.min(max, essenceTierReached(profile, d.id));
  const [tiers, setTiers] = useState<Readonly<Record<string, number>>>({});
  const tier = dungeon === undefined ? 1 : Math.min(tiers[dungeon.id] ?? reached(dungeon), max);
  const open = essencesOpen(content, profile);
  const drop = essenceDrop(content, tier);
  const enemies =
    dungeon === undefined
      ? []
      : dungeon.encounters.flatMap((_, room) => {
          const e = essenceEncounter(content, dungeon, tier, room);
          return e === null ? [] : [...new Set(e.enemies)];
        });

  return (
    <Screen
      title={t('essence.title')}
      onBack={() => {
        go({ name: 'map' });
      }}
      className="essences"
    >
      <div className="essences__layout">
        <Panel className="essences__column" label={t('essence.list')}>
          <ul className="essences__list">
            {list.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={[
                    'essences__item',
                    `element-${d.element}`,
                    d.id === selected ? 'essences__item--on' : '',
                  ].join(' ')}
                  aria-pressed={d.id === selected}
                  onClick={() => {
                    setSelected(d.id);
                  }}
                >
                  {open ? <Icon name="trigger" /> : <Icon name="lock" />}{' '}
                  {tk(`essence.name.${d.element}`)}
                </button>
              </li>
            ))}
          </ul>
          <h3 className="essences__sub">{t('essence.stock')}</h3>
          <ul className="essences__stock">
            {list.map((d) => (
              <li key={d.id} className={`element-${d.element}`}>
                {essenceStock(profile, d.element)}
              </li>
            ))}
          </ul>
        </Panel>

        {dungeon !== undefined && (
          <Panel className="essences__panel" label={tk(`essence.name.${dungeon.element}`)}>
            <div
              className="map__thumb"
              style={{ backgroundImage: `url(${backgroundUrl(dungeon.scene)})` }}
            />
            <div className="essences__info">
              <h2 className="detail__title">{tk(`essence.name.${dungeon.element}`)}</h2>
              <p className="hint">
                {t('essence.text', { element: tk(`essence.of.${dungeon.element}`) })}
              </p>
              {open && (
                <div className="map__tiers" role="group" aria-label={t('tier.choose')}>
                  <span className="hint">{t('tier.choose')} :</span>
                  {Array.from({ length: max }, (_, i) => i + 1).map((k) => {
                    const ok = essenceTierOpen(content, profile, dungeon.id, k);
                    return (
                      <button
                        key={k}
                        type="button"
                        className={['map__tier', k === tier ? 'map__tier--on' : ''].join(' ')}
                        aria-pressed={k === tier}
                        disabled={!ok}
                        aria-label={t('tier.name', { tier: tierNumeral(k) })}
                        onClick={() => {
                          setTiers((all) => ({ ...all, [dungeon.id]: k }));
                        }}
                      >
                        {ok ? tierNumeral(k) : <Icon name="lock" />}
                      </button>
                    );
                  })}
                  <span className="map__tier-text">
                    {t('essence.level', { level: tierTargetLevel(content, dungeon, tier) })}
                  </span>
                </div>
              )}
              <h3 className="essences__sub">{t('essence.enemies')}</h3>
              <ul className="essences__enemies">
                {[...new Set(enemies)].map((id) => (
                  <li key={id}>
                    <Portrait kind={id} size={32} />
                    <span>{names.enemy(id)}</span>
                  </li>
                ))}
              </ul>
              <p>
                <span className="hint">{t('essence.reward')} : </span>
                {essenceAmount(dungeon.element, drop.quality, drop.amount)}
              </p>
              {open && tier === essenceTierReached(profile, dungeon.id) && tier < max && (
                <p className="hint">{t('essence.tier.next')}</p>
              )}
            </div>
            <footer className="essences__foot">
              <span className="essences__team">
                {profile.team.map((id) => (
                  <Portrait key={id} kind={id} size={32} />
                ))}
              </span>
              <Button
                variant="quiet"
                size="small"
                onClick={() => {
                  go({ name: 'team' });
                }}
              >
                {t('essence.team')}
              </Button>
              {open ? (
                <Button
                  size="large"
                  onClick={() => {
                    if (apply(enterEssence(content, profile, dungeon.id, tier, Date.now())))
                      go({ name: 'essence_run', id: dungeon.id, tier });
                  }}
                >
                  {t('essence.fight')} ▶
                </Button>
              ) : (
                <p className="essences__locked">
                  <Icon name="lock" />{' '}
                  {t('essence.locked', {
                    dungeon: names.dungeon(content.balance.awakening.openAfter),
                  })}
                </p>
              )}
            </footer>
          </Panel>
        )}
      </div>
    </Screen>
  );
}
