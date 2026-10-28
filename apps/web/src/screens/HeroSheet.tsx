import type { Hero, TalentNode } from '@outlaw/data';
import {
  awaken,
  awakenCost,
  setAwakened,
  atStarGate,
  canLevelUp,
  compileHero,
  equip,
  heroBuild,
  heroStars,
  levelUp,
  levelUpCost,
  levelUpMax,
  respec,
  respecCost,
  setLevel,
  setUpgrade,
  starCost,
  starUp,
  takeTalent,
  talentPoints,
  unlockedPages,
  xpToNext,
  type HeroBuild,
  type UnitDef,
} from '@outlaw/engine';
import { useState } from 'react';
import { HeroSprite } from '../art/HeroSprite';
import { PixelSprite } from '../art/Pixel';
import { content } from '../combat/session';
import { Rarity } from '../game/Rarity';
import { Button, Icon, Panel, Screen, Stepper, Tabs, Window } from '../game/ui';
import { describeItem, describeNode, describeSpell, describeTrigger } from '../i18n/describe';
import { dustName, names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import { UpgradePips } from './Workshop';
import { Glossed } from '../game/Glossed';

type Tab = 'stats' | 'talents' | 'items' | 'awakening';

const STAT_ICON = { hp: 'hp', atk: 'damage', def: 'shield', vit: 'spd' } as const;

/** Icône d'un nœud selon ce qu'il touche (une douzaine d'icônes, teintées par l'élément). */
export function nodeIcon(node: TalentNode): string {
  const mod = node.mods[0];
  if (mod === undefined) return 'trigger';
  const byKind = (kind: string, status?: string): string => {
    switch (kind) {
      case 'damage':
      case 'heal':
      case 'shield':
      case 'tempo':
        return kind;
      case 'statMod':
        return 'stat';
      case 'status':
        return status === 'stun' ? 'stun' : status === 'mark' ? 'mark' : 'burn';
      case 'teamPoints':
        return 'points';
      default:
        return 'trigger';
    }
  };
  switch (mod.type) {
    case 'scaleEffect':
      return byKind(mod.kind);
    case 'addEffect':
      return byKind(mod.effect.kind, 'status' in mod.effect ? mod.effect.status : undefined);
    case 'cost':
    case 'gain':
      return 'points';
    case 'delay':
      return 'tempo';
    case 'retarget':
      return 'mark';
  }
}

/** Lignes qui diffèrent entre deux versions compilées d'un héros, sort par sort. */
export function previewDiff(before: UnitDef, after: UnitDef): { spell: string; lines: string[] }[] {
  const out: { spell: string; lines: string[] }[] = [];
  for (const spell of after.spells) {
    const old = before.spells.find((s) => s.slot === spell.slot);
    if (old === undefined) continue;
    const lines: string[] = [];
    const num = (what: string, a: number, b: number): void => {
      if (a !== b) lines.push(t('sheet.cost.change', { what, before: a, after: b }));
    };
    num(t('sheet.cost'), old.cost, spell.cost);
    num(t('sheet.gain'), old.gain, spell.gain);
    num(t('sheet.delay'), old.delay, spell.delay);
    if (old.targeting !== spell.targeting) {
      lines.push(
        `${tk(`combat.target.${old.targeting}`)} → ${tk(`combat.target.${spell.targeting}`)}`,
      );
    }
    const a = describeSpell(old);
    const b = describeSpell(spell);
    for (const line of a) if (!b.includes(line)) lines.push(`− ${line}`);
    for (const line of b) if (!a.includes(line)) lines.push(`+ ${line}`);
    if (lines.length > 0) out.push({ spell: names.spell(spell.id), lines });
  }
  return out;
}

/** Talents d'un nœud et de toute sa chaîne de prérequis. */
function withChain(def: Hero, talents: readonly string[], nodeId: string): string[] {
  const all = def.pages.flatMap((p) => p.nodes);
  const result = new Set(talents);
  for (let id: string | undefined = nodeId; id !== undefined;) {
    const node = all.find((n) => n.id === id);
    if (node === undefined) break;
    // Un nœud exclusif chasse son rival.
    if (node.group !== undefined) {
      for (const rival of all.filter((n) => n.group === node.group && n.id !== node.id)) {
        result.delete(rival.id);
      }
    }
    result.add(node.id);
    id = node.requires;
  }
  return [...result];
}

function compileSafe(build: HeroBuild): UnitDef | null {
  try {
    return compileHero(content, build, { side: 'player', slot: 0 });
  } catch {
    return null;
  }
}

function TalentTree({ def, heroId }: { readonly def: Hero; readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const hero = profile.heroes[heroId];
  const [picked, setPicked] = useState<string | null>(null);
  if (hero === undefined) return null;
  const { balance } = content;
  const total = talentPoints(hero.level, balance);
  const free = total - hero.talents.length;
  const pages = unlockedPages(hero.level, balance);
  const cost = respecCost(content, profile, heroId);
  const allNodes = def.pages.flatMap((p) => p.nodes);

  const stateOf = (node: TalentNode, pageIndex: number): 'taken' | 'ready' | 'locked' => {
    if (hero.talents.includes(node.id)) return 'taken';
    const rival = node.group
      ? allNodes.find((n) => n.group === node.group && n.id !== node.id)
      : undefined;
    const blocked = rival !== undefined && hero.talents.includes(rival.id);
    const ok =
      pageIndex < pages &&
      !blocked &&
      free > 0 &&
      (node.requires === undefined || hero.talents.includes(node.requires));
    return ok ? 'ready' : 'locked';
  };

  const node = allNodes.find((n) => n.id === picked);
  const pageIndex = def.pages.findIndex((p) => p.nodes.some((n) => n.id === picked));
  let diff: { spell: string; lines: string[] }[] = [];
  if (node !== undefined) {
    const base = heroBuild(profile, heroId);
    const max = balance.progression.maxLevel;
    const without = base.talents.filter((id) => id !== node.id);
    const before = compileSafe({ ...base, level: max, talents: without });
    const after = compileSafe({ ...base, level: max, talents: withChain(def, without, node.id) });
    if (before !== null && after !== null) diff = previewDiff(before, after);
  }
  const rival = node?.group
    ? allNodes.find((n) => n.group === node.group && n.id !== node.id)
    : undefined;

  return (
    <div className="talents">
      <div className="talents__pages">
        {def.pages.map((page, index) => {
          const locked = index >= pages;
          // Rangées par profondeur de prérequis ; chaque rangée est centrée.
          const byId = new Map(page.nodes.map((n) => [n.id, n] as const));
          const depthOf = (n: TalentNode): number => {
            let d = 0;
            let cursor = n.requires === undefined ? undefined : byId.get(n.requires);
            while (cursor !== undefined && d < 8) {
              d += 1;
              cursor = cursor.requires === undefined ? undefined : byId.get(cursor.requires);
            }
            return d;
          };
          const rows = new Map<number, TalentNode[]>();
          for (const n of page.nodes) {
            const d = depthOf(n);
            rows.set(d, [...(rows.get(d) ?? []), n]);
          }
          const pos = new Map<string, { x: number; y: number }>();
          for (const [d, list] of rows) {
            list.forEach((n, i) => {
              pos.set(n.id, { x: 72 + (i - (list.length - 1) / 2) * 36, y: 22 + d * 54 });
            });
          }
          const at = (id: string): { x: number; y: number } => pos.get(id) ?? { x: 72, y: 22 };
          const children = rows.get(1) ?? [];
          return (
            <section
              key={page.id}
              className={['tree', locked ? 'tree--locked' : ''].join(' ')}
              aria-label={names.page(page.id)}
            >
              <h3 className="tree__name">{names.page(page.id)}</h3>
              {locked && (
                <p className="tree__lock">
                  <Icon name="lock" />{' '}
                  {t('hero.page.locked', {
                    level: balance.progression.pageUnlockLevels[index] ?? '?',
                  })}
                </p>
              )}
              <div className="tree__board">
                <svg className="tree__links" width="144" height="210" aria-hidden="true">
                  {page.nodes
                    .filter((n) => n.requires !== undefined)
                    .map((n) => {
                      const a = at(n.requires ?? '');
                      const b = at(n.id);
                      const lit = hero.talents.includes(n.id);
                      return (
                        <path
                          key={n.id}
                          d={`M${a.x} ${a.y} V${(a.y + b.y) / 2} H${b.x} V${b.y}`}
                          className={lit ? 'tree__link tree__link--on' : 'tree__link'}
                        />
                      );
                    })}
                </svg>
                {(() => {
                  const pair = children.filter((c) => c.group !== undefined);
                  if (pair.length !== 2) return null;
                  const a = at(pair[0]?.id ?? '');
                  const b = at(pair[1]?.id ?? '');
                  // Sous la paire, à mi-chemin de la rangée suivante (54 px plus bas) : entre les
                  // deux nœuds, 4 px séparent les pastilles, le mot y serait caché.
                  return (
                    <span className="tree__or" style={{ left: (a.x + b.x) / 2, top: a.y + 27 }}>
                      {t('sheet.or')}
                    </span>
                  );
                })()}
                {page.nodes.map((n) => {
                  const { x, y } = at(n.id);
                  const state = stateOf(n, index);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={[
                        'node',
                        `node--${state}`,
                        n.group !== undefined ? 'node--choice' : '',
                        picked === n.id ? 'node--picked' : '',
                      ].join(' ')}
                      style={{ left: x, top: y }}
                      aria-label={t('sheet.node.label', {
                        node: names.node(n.id),
                        state: tk(`sheet.node.state.${state}`),
                      })}
                      aria-current={picked === n.id}
                      onClick={() => {
                        setPicked(n.id);
                      }}
                    >
                      <Icon name={nodeIcon(n)} size={18} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Panel className="talents__side" label={t('sheet.preview')}>
        <p className="talents__points">{t('hero.points', { free, total })}</p>
        {node === undefined ? (
          <p className="hint">{t('sheet.pick')}</p>
        ) : (
          <>
            <h3 className="talents__node">
              <Icon name={nodeIcon(node)} size={24} />
              {names.node(node.id)}
            </h3>
            <ul className="effects">
              {describeNode(node, def).map((line, i) => (
                <li key={i}>
                  <Glossed text={line} />
                </li>
              ))}
            </ul>
            {node.requires !== undefined && (
              <p className="hint">{t('hero.node.requires', { node: names.node(node.requires) })}</p>
            )}
            {rival !== undefined && (
              <p className="hint">{t('hero.node.excludes', { node: names.node(rival.id) })}</p>
            )}
            <h4 className="talents__preview-title">{t('sheet.preview')}</h4>
            {diff.length === 0 ? (
              <p className="hint">{t('sheet.preview.none')}</p>
            ) : (
              <ul className="preview">
                {diff.map((d) => (
                  <li key={d.spell}>
                    <span className="preview__spell">{d.spell}</span>
                    <ul>
                      {d.lines.map((line, i) => (
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
                  </li>
                ))}
              </ul>
            )}
            {stateOf(node, pageIndex) === 'ready' && (
              <Button onClick={() => apply(takeTalent(content, profile, heroId, node.id))}>
                {t('sheet.take')}
              </Button>
            )}
            {stateOf(node, pageIndex) === 'taken' && (
              <p className="gold-text">
                <Icon name="check" /> {t('hero.node.taken')}
              </p>
            )}
          </>
        )}
        <Button
          variant="quiet"
          size="small"
          className="talents__respec"
          disabled={hero.talents.length === 0}
          onClick={() => apply(respec(content, profile, heroId))}
        >
          {cost === 0 ? t('hero.respec.free') : t('hero.respec.cost', { cost })}
        </Button>
      </Panel>
    </div>
  );
}

function ItemSlots({ heroId }: { readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const [choosing, setChoosing] = useState<number | null>(null);
  const hero = profile.heroes[heroId];
  if (hero === undefined) return null;
  const max = content.balance.progression.items.maxUpgradeLevel;
  const ownerOf = (uid: number): string | null =>
    Object.entries(profile.heroes).find(([, h]) => h.items.includes(uid))?.[0] ?? null;
  /** En mode test, un seul exemplaire libre de chaque objet est proposé. */
  const choices = (current: number | null) => {
    if (!profile.testMode) return profile.items;
    const seen = new Set<string>();
    return profile.items.filter((o) => {
      const owner = ownerOf(o.uid);
      if (o.uid !== current && (seen.has(o.item) || (owner !== null && owner !== heroId))) {
        return false;
      }
      seen.add(o.item);
      return true;
    });
  };

  return (
    <div className="slots">
      {hero.items.map((uid, slot) => {
        const owned = profile.items.find((i) => i.uid === uid);
        const item = owned ? content.itemById.get(owned.item) : undefined;
        return (
          <Panel key={slot} className="slot" label={t('sheet.slot.title', { n: slot + 1 })}>
            <button
              type="button"
              className={['slot__box', item ? `slot__box--${item.rarity}` : ''].join(' ')}
              aria-label={t('sheet.slot.choose', { n: slot + 1 })}
              onClick={() => {
                setChoosing(slot);
              }}
            >
              <Icon name={owned !== undefined ? `item_${owned.item}` : 'item'} size={36} />
              <span className="slot__name">
                {owned !== undefined ? names.item(owned.item) : t('hero.slot.empty')}
              </span>
              {owned !== undefined && <UpgradePips level={owned.upgrade} max={max} />}
            </button>
            {item !== undefined && (
              <ul className="effects">
                {describeItem(item).map((line, i) => (
                  <li key={i}>
                    <Glossed text={line} />
                  </li>
                ))}
              </ul>
            )}
            {owned !== undefined && profile.testMode && (
              <Stepper
                label={t('test.upgrade', { item: names.item(owned.item) })}
                value={owned.upgrade}
                min={0}
                max={max}
                onChange={(n) => {
                  apply(setUpgrade(content, profile, owned.uid, n));
                }}
              />
            )}
          </Panel>
        );
      })}
      <p className="hint slots__hint">{t('mod.upgrade')}</p>
      {choosing !== null && (
        <Window
          title={t('sheet.slot.title', { n: choosing + 1 })}
          onClose={() => {
            setChoosing(null);
          }}
          className="picker"
        >
          {choices(hero.items[choosing] ?? null).length === 0 ? (
            <p className="hint">{t('sheet.slot.none')}</p>
          ) : (
            <ul className="picker__list">
              {choices(hero.items[choosing] ?? null).map((o) => {
                const it = content.itemById.get(o.item);
                const owner = ownerOf(o.uid);
                return (
                  <li key={o.uid}>
                    <button
                      type="button"
                      className={[
                        'item-card',
                        `item-card--${it?.rarity ?? 'common'}`,
                        hero.items[choosing] === o.uid ? 'item-card--on' : '',
                      ].join(' ')}
                      onClick={() => {
                        if (apply(equip(content, profile, heroId, choosing, o.uid))) {
                          setChoosing(null);
                        }
                      }}
                    >
                      <Icon name={`item_${o.item}`} size={24} />
                      <span className="item-card__name">{names.item(o.item)}</span>
                      <UpgradePips
                        level={o.upgrade}
                        max={content.balance.progression.items.maxUpgradeLevel}
                      />
                      {owner !== null && owner !== heroId && (
                        <span className="hint">
                          {t('sheet.slot.wornBy', { hero: names.hero(owner) })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hero.items[choosing] !== null && hero.items[choosing] !== undefined && (
            <Button
              variant="danger"
              size="small"
              onClick={() => {
                if (apply(equip(content, profile, heroId, choosing, null))) setChoosing(null);
              }}
            >
              {t('sheet.slot.remove')}
            </Button>
          )}
        </Window>
      )}
    </div>
  );
}

/**
 * Fiche d'un héros en un écran : portrait à gauche, onglets à droite. Tout ce qui est affiché
 * vient de l'unité compilée par le moteur (talents et objets compris).
 */
/**
 * Éveil d'un héros : effets (formule commune de `balance.awakening`), coût en essences de son
 * élément et en or, condition de niveau ; en mode test, une case l'active sans rien payer.
 */
function AwakeningPanel({ heroId }: { readonly heroId: string }) {
  const { profile, apply } = useProfile();
  const hero = profile.heroes[heroId];
  const cost = awakenCost(content, heroId);
  if (hero === undefined || cost === null) return null;
  const { awakening } = content.balance;
  const effects = [
    t('awakening.stats', { pct: awakening.statPct }),
    ...describeItem({ id: 'awakening', rarity: 'common', mods: awakening.mods }),
  ];
  const [low, mid, high] = profile.essences[cost.element];
  const element = tk(`essence.of.${cost.element}`);
  return (
    <div className="sheet__awakening">
      <p>
        <strong>{t('awakening.title')}</strong>
        {hero.awakened && <span className="awakened-badge">{t('awakening.badge')}</span>}
      </p>
      <p>
        <Glossed text={t('awakening.effects', { lines: effects.join(' ; ') })} />
      </p>
      {hero.awakened && <p className="hint">{t('awakening.done')}</p>}
      {!hero.awakened && !profile.testMode && (
        <>
          <p>
            {t('awakening.cost', {
              essences: t('awakening.cost.essences', {
                low: cost.essences[0],
                mid: cost.essences[1],
                high: cost.essences[2],
                element,
              }),
              gold: cost.gold,
            })}
          </p>
          <p className="hint">
            {t('awakening.have', { low, mid, high, element, gold: profile.gold })}
          </p>
          <p className={hero.level >= cost.minLevel ? 'hint' : 'warn'}>
            {t('awakening.level', { level: cost.minLevel })}
          </p>
          <p className="hint">{t('awakening.where')}</p>
          <Button
            size="small"
            disabled={!awaken(content, profile, heroId).ok}
            onClick={() => {
              apply(awaken(content, profile, heroId));
            }}
          >
            {t('awakening.buy')}
          </Button>
        </>
      )}
      {profile.testMode && (
        <label>
          <input
            type="checkbox"
            checked={hero.awakened}
            onChange={(event) => {
              apply(setAwakened(profile, heroId, event.target.checked));
            }}
          />{' '}
          {t('awakening.test')}
        </label>
      )}
    </div>
  );
}

export function HeroSheet({
  heroId,
  onBack,
}: {
  readonly heroId: string;
  readonly onBack: () => void;
}) {
  const { profile, apply } = useProfile();
  const [tab, setTab] = useState<Tab>('stats');
  const hero = profile.heroes[heroId];
  const def = content.heroById.get(heroId);
  if (hero === undefined || def === undefined) return null;
  const { balance } = content;
  const unit = compileHero(content, heroBuild(profile, heroId), { side: 'player', slot: 0 });
  const free = talentPoints(hero.level, balance) - hero.talents.length;
  const maxed = hero.level >= balance.progression.maxLevel;
  const next = xpToNext(hero.level, content);
  const gate = atStarGate(hero, content);
  const cost = levelUpCost(content, hero);
  const gateCost = starCost(content, hero);
  const fragments = profile.fragments[heroId] ?? 0;

  return (
    <Screen title={names.hero(heroId)} onBack={onBack} className={`sheet element-${def.element}`}>
      <div className="sheet__layout">
        <aside className={`sheet__id rarity-${String(def.tier)}`}>
          <Rarity tier={def.tier} />
          <PixelSprite name="pedestal" className="pedestal" />
          <span className={`sheet__sprite${hero.awakened ? ' sheet__sprite--awakened' : ''}`}>
            <HeroSprite name={heroId} idle />
          </span>
          <p className="sheet__level">
            {t('hero.level', { level: hero.level })}
            {hero.awakened && <span className="awakened-badge">{t('awakening.badge')}</span>}
            <span className="hint">
              {' '}
              · {t('sheet.element', { element: tk(`element.${def.element}`) })}
            </span>
          </p>
          {!maxed ? (
            <span className="sheet__xp" role="img" aria-label={t('hero.xp', { xp: hero.xp, next })}>
              <span style={{ width: `${Math.min(100, Math.round((hero.xp / next) * 100))}%` }} />
            </span>
          ) : (
            <span className="hint">{t('hero.xp.max')}</span>
          )}
          <p className="hint">
            {t('hero.stars', {
              n: heroStars(hero, content),
              max: balance.chests.starCosts.length,
            })}
          </p>
          {!maxed && !gate && !profile.testMode && cost !== null && (
            <div className="sheet__gate">
              <p className="hint">
                {t('hero.levelUp.cost', {
                  level: hero.level + 1,
                  xp: cost.xp,
                  dust: t('dust.amount', {
                    amount: cost.dust.amount,
                    dust: dustName(cost.dust.tier),
                  }),
                })}
              </p>
              {hero.xp >= cost.xp &&
                (profile.materials[cost.dust.tier - 1] ?? 0) < cost.dust.amount && (
                  <p className="hint">
                    {t('hero.levelUp.missingDust', {
                      dust: dustName(cost.dust.tier),
                      have: profile.materials[cost.dust.tier - 1] ?? 0,
                      need: cost.dust.amount,
                    })}
                  </p>
                )}
              <Button
                size="small"
                disabled={!canLevelUp(content, profile, hero)}
                onClick={() => {
                  apply(levelUp(content, profile, heroId));
                }}
              >
                {t('hero.levelUp')}
              </Button>
              {canLevelUp(content, profile, hero) && (
                <Button
                  size="small"
                  variant="quiet"
                  onClick={() => {
                    apply(levelUpMax(content, profile, heroId));
                  }}
                >
                  {t('hero.levelUp.max')}
                </Button>
              )}
            </div>
          )}
          {gate && gateCost !== null && !profile.testMode && (
            <div className="sheet__gate">
              <p>{t('hero.gate', { level: hero.level })}</p>
              <Button
                size="small"
                disabled={fragments < gateCost}
                onClick={() => {
                  apply(starUp(content, profile, heroId));
                }}
              >
                {t('hero.gate.buy')}
              </Button>
              <p className="hint">{t('hero.gate.count', { have: fragments, cost: gateCost })}</p>
            </div>
          )}
          <p className="sheet__thesis">{names.heroThesis(heroId)}</p>
          {profile.testMode && (
            <Stepper
              label={t('test.level', { hero: names.hero(heroId) })}
              value={hero.level}
              min={1}
              max={balance.progression.maxLevel}
              onChange={(level) => {
                apply(setLevel(content, profile, heroId, level));
              }}
            />
          )}
        </aside>
        <div className="sheet__main">
          <Tabs<Tab>
            label={t('sheet.tabs', { hero: names.hero(heroId) })}
            current={tab}
            onChange={setTab}
            tabs={[
              { key: 'stats', label: t('sheet.tab.stats') },
              {
                key: 'talents',
                label: t('sheet.tab.talents'),
                badge: free > 0 ? String(free) : undefined,
              },
              { key: 'items', label: t('sheet.tab.items') },
              {
                key: 'awakening',
                label: t('awakening.title'),
                badge: !hero.awakened && awaken(content, profile, heroId).ok ? '!' : undefined,
              },
            ]}
          />
          <div className="sheet__panel" role="tabpanel">
            {tab === 'stats' && (
              <div className="stats-tab">
                <dl className="stats">
                  {(['hp', 'atk', 'def', 'vit'] as const).map((stat) => (
                    <div key={stat}>
                      <dt>
                        <Icon name={STAT_ICON[stat]} size={12} />
                        <Glossed text={tk(`stat.${stat}`)} />
                      </dt>
                      <dd>{unit.stats[stat]}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="spell-cards">
                  {unit.spells.map((spell, i) => (
                    <li key={spell.id} className={`spell-card spell-card--${spell.slot}`}>
                      <p className="spell-card__name">
                        <span className="spell-card__key">{i + 1}</span>
                        {names.spell(spell.id)}
                      </p>
                      <p className="spell-card__meta">
                        <Glossed
                          text={`${
                            spell.cost > 0
                              ? t('combat.spell.cost', { cost: spell.cost })
                              : t('combat.spell.gain', { gain: spell.gain })
                          } · ${t('combat.spell.delay', { delay: spell.delay })} · ${tk(`combat.target.${spell.targeting}`)}`}
                        />
                      </p>
                      <ul>
                        {describeSpell(spell).map((line, j) => (
                          <li key={j}>
                            <Glossed text={line} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <div className="passive-card">
                  <p className="spell-card__name">
                    <Icon name="trigger" /> {t('hero.passive')} : {names.passive(def.passive.id)}
                  </p>
                  <ul>
                    {unit.triggers.map((resolved, i) => (
                      <li key={i}>
                        <Glossed text={describeTrigger(resolved.trigger)} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {tab === 'talents' && <TalentTree def={def} heroId={heroId} />}
            {tab === 'items' && <ItemSlots heroId={heroId} />}
            {tab === 'awakening' && <AwakeningPanel heroId={heroId} />}
          </div>
        </div>
      </div>
    </Screen>
  );
}
