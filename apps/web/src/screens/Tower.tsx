import {
  enterTower,
  towerCleared,
  towerFloor,
  towerFloors,
  towerOpen,
  towerReward,
} from '@outlaw/engine';
import { useEffect, useRef, useState } from 'react';
import { PixelSprite } from '../art/Pixel';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { Glossed } from '../game/Glossed';
import { useGame } from '../game/nav';
import { useOptions } from '../game/options';
import { Button, Icon, Panel, Screen } from '../game/ui';
import { describeTrigger } from '../i18n/describe';
import { dustName, names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import './tower.css';

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * La tour : à gauche la colonne des étages (le sommet en haut, la colonne défile dans son cadre),
 * à droite la fiche de l'étage choisi : ennemis annoncés, modificateur, équipement visé,
 * récompense de première victoire et bouton Combattre. Tout vient du moteur (`towerFloor`,
 * `towerReward`, `towerOpen`) : l'écran ne calcule rien.
 */
export function Tower({ initial }: { readonly initial?: number }) {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const { options, set } = useOptions();
  const max = towerFloors(content);
  const cleared = towerCleared(profile);
  const current = Math.min(max, cleared + 1);
  const [selected, setSelected] = useState(initial ?? current);
  const floor = towerFloor(content, selected);
  const list = useRef<HTMLOListElement>(null);

  // L'étage choisi est amené dans le cadre de la colonne, sans faire défiler la page.
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const box = list.current;
    if (row === null || row === undefined || box === null) return;
    box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }, []);

  const state = (n: number): 'cleared' | 'next' | 'locked' =>
    n <= cleared ? 'cleared' : towerOpen(content, profile, n) ? 'next' : 'locked';
  const floors = Array.from({ length: max }, (_, i) => max - i);
  const reward = floor === null ? null : towerReward(content, floor.floor);
  const open = floor !== null && towerOpen(content, profile, floor.floor);
  const teamLevel =
    profile.team.length === 0
      ? 0
      : Math.round(
          profile.team.reduce((sum, id) => sum + (profile.heroes[id]?.level ?? 1), 0) /
            profile.team.length,
        );

  return (
    <Screen
      title={t('tower.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="tower"
    >
      <div className="tower__layout">
        <Panel className="tower__column" label={t('tower.floors')}>
          <p className="tower__best">{t('tower.best', { n: cleared, max })}</p>
          <ol ref={list} className="tower__floors">
            {floors.map((n) => {
              const s = state(n);
              const boss = n % content.balance.tower.bossEvery === 0;
              return (
                <li key={n}>
                  <button
                    type="button"
                    className={[
                      'tower__floor',
                      `tower__floor--${s}`,
                      boss ? 'tower__floor--boss' : '',
                      n === selected ? 'tower__floor--on' : '',
                      `element-${towerFloor(content, n)?.element ?? 'fire'}`,
                    ].join(' ')}
                    aria-current={n === selected}
                    aria-label={t('tower.floorState', {
                      name: t('tower.floor', { n }),
                      state: tk(`tower.state.${s}`),
                    })}
                    onClick={() => {
                      setSelected(n);
                    }}
                  >
                    <span className="tower__floor-n">{n}</span>
                    {boss && <span className="tower__floor-boss">{t('tower.boss')}</span>}
                    <span className="tower__floor-state" aria-hidden="true">
                      {s === 'cleared' ? (
                        <Icon name="check" />
                      ) : s === 'locked' ? (
                        <Icon name="lock" />
                      ) : (
                        <Icon name="mark" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Panel>

        {floor !== null && reward !== null && (
          <Panel className="tower__panel" label={t('tower.floor', { n: floor.floor })}>
            <header className="tower__head">
              <PixelSprite name="landmark_tower" />
              <h2 className="detail__title">
                {t('tower.floor', { n: floor.floor })}
                {floor.boss && <span className="tower__tag">{t('tower.boss')}</span>}
              </h2>
            </header>
            <div className="tower__info">
              <p>
                {t('tower.level', { level: floor.level, hp: floor.hpPct, atk: floor.atkPct })}
                {teamLevel > 0 && (
                  <span className={teamLevel >= floor.level ? 'ok' : 'warn'}>
                    {' '}
                    · {t('map.teamLevel', { level: teamLevel })}
                  </span>
                )}
              </p>
              <p className="hint">
                {floor.gear.items === 0
                  ? t('tower.gear.none')
                  : t('tower.gear', { items: floor.gear.items, upgrade: floor.gear.upgrade })}
              </p>
              <h3 className="tower__sub">{t('tower.enemies')}</h3>
              <ul className="tower__enemies">
                {floor.enemies.map((id, i) => (
                  <li key={`${id}-${String(i)}`} className="tower__enemy">
                    <Portrait kind={id} size={32} />
                    <span>{names.enemy(id)}</span>
                  </li>
                ))}
              </ul>
              {floor.modifier !== undefined && (
                <p className="map__modifier">
                  <strong>{names.passive(floor.modifier.id)}</strong>{' '}
                  <Glossed
                    text={floor.modifier.rules
                      .map((rule) =>
                        t('hub.dungeon.modifier', {
                          side: tk(`hub.dungeon.side.${rule.appliesTo}`),
                          text: lowerFirst(describeTrigger(rule.trigger)),
                        }),
                      )
                      .join(' ')}
                  />
                </p>
              )}
              {floor.floor <= cleared ? (
                <p className="hint">{t('tower.replay')}</p>
              ) : (
                <>
                  <h3 className="tower__sub">{t('tower.reward')}</h3>
                  <ul className="tower__reward">
                    <li>
                      <Icon name="points" /> {reward.materials.amount}{' '}
                      {dustName(reward.materials.tier)}
                    </li>
                    {reward.fragments > 0 && (
                      <li>
                        <Icon name="star" />{' '}
                        {t('tower.reward.fragments', {
                          n: reward.fragments,
                          chest: lowerFirst(
                            tk(`chest.tier.${content.balance.tower.rewards.fragmentChest}`),
                          ),
                        })}
                      </li>
                    )}
                    {reward.chest !== null && (
                      <li>
                        <Icon name="chest" />{' '}
                        {t('tower.reward.chest', { chest: tk(`chest.tier.${reward.chest}`) })}
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
            <footer className="tower__foot">
              <label className="tower__climb" title={t('tower.climb.hint')}>
                <input
                  type="checkbox"
                  checked={options.towerClimb}
                  onChange={(event) => {
                    set({ towerClimb: event.target.checked });
                  }}
                />{' '}
                {t('tower.climb')}
              </label>
              <span className="tower__team">
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
                {t('tower.team')}
              </Button>
              {open ? (
                <Button
                  size="large"
                  onClick={() => {
                    if (apply(enterTower(content, profile, floor.floor, Date.now())))
                      go({ name: 'tower_run', floor: floor.floor });
                  }}
                >
                  {t('tower.fight')} ▶
                </Button>
              ) : (
                <p className="tower__locked">
                  <Icon name="lock" /> {t('tower.locked', { n: floor.floor - 1 })}
                </p>
              )}
            </footer>
          </Panel>
        )}
      </div>
    </Screen>
  );
}
