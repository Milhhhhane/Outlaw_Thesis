import {
  atStarGate,
  chestCount,
  chestSize,
  fragmentRates,
  heroStars,
  openChest,
  setFocus,
  starCost,
  starUp,
  summonHero,
  type ChestReport,
} from '@outlaw/engine';
import { useEffect, useState, type CSSProperties } from 'react';
import { PixelSprite } from '../art/Pixel';
import { Portrait } from '../combat/InitiativeTrack';
import { content } from '../combat/session';
import { useGame } from '../game/nav';
import { useOptions } from '../game/options';
import { Button, Icon, Panel, Screen, Window } from '../game/ui';
import { names, t, tk } from '../i18n';
import { useProfile } from '../state/profile';
import './chests.css';

/** Un coffre en pixel art : image 0 fermé, 1 entrouvert, 2 ouvert. */
export function ChestArt({
  tier,
  frame = 0,
  className,
}: {
  readonly tier: string;
  readonly frame?: number;
  readonly className?: string;
}) {
  return (
    <span className={['chest-art', className ?? ''].join(' ')} aria-hidden="true">
      <PixelSprite name={`chest_${tier}`} frame={frame} />
    </span>
  );
}

const rate = (pct: number): string =>
  pct.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** Fragments d'un coffre ouvert, regroupés par héros dans l'ordre du tirage. */
function grouped(report: ChestReport): { hero: string; n: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const hero of report.fragments) {
    if (!counts.has(hero)) order.push(hero);
    counts.set(hero, (counts.get(hero) ?? 0) + 1);
  }
  return order.map((hero) => ({ hero, n: counts.get(hero) ?? 0 }));
}

/**
 * Ouverture : le coffre s'entrouvre puis s'ouvre, les fragments apparaissent un à un. Sans
 * animations (réglage ou mouvement réduit), le contenu est montré tout de suite.
 */
function Reveal({
  report,
  remaining,
  onAgain,
  onClose,
}: {
  readonly report: ChestReport;
  readonly remaining: number;
  readonly onAgain: () => void;
  readonly onClose: () => void;
}) {
  const { profile } = useProfile();
  const { options } = useOptions();
  const [phase, setPhase] = useState(options.animations ? 0 : 2);
  useEffect(() => {
    if (phase >= 2) return;
    const timer = window.setTimeout(
      () => {
        setPhase(phase + 1);
      },
      phase === 0 ? 650 : 350,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  const groups = grouped(report);
  const { summonCost } = content.balance.chests;
  return (
    <Window
      title={tk(`chest.tier.${report.tier}`)}
      className="chest-reveal"
      onClose={onClose}
      actions={
        <>
          {remaining > 0 && (
            <Button variant="primary" onClick={onAgain}>
              {t('chests.reveal.again', { n: remaining })}
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            {t('chests.reveal.close')}
          </Button>
        </>
      }
    >
      <div className="chest-reveal__stage">
        <ChestArt
          tier={report.tier}
          frame={phase}
          className={phase === 0 && options.animations ? 'chest-art--shake' : ''}
        />
      </div>
      {phase < 2 ? (
        <p className="hint chest-reveal__wait">{t('chests.reveal.opening')}</p>
      ) : (
        <>
          <p className="chest-reveal__total">
            {t('chests.reveal.total', { n: report.fragments.length })}
          </p>
          <ul className="chest-reveal__list" aria-label={t('chests.fragments')}>
            {groups.map(({ hero, n }, i) => {
              const owned = profile.fragments[hero] ?? 0;
              const state = profile.unlocked.includes(hero) ? profile.heroes[hero] : undefined;
              const unlocked = state !== undefined;
              const cost = state === undefined ? summonCost : starCost(content, state);
              const ready =
                state === undefined
                  ? owned >= summonCost
                  : atStarGate(state, content) && cost !== null && owned >= cost;
              return (
                <li
                  key={hero}
                  className={['chest-reveal__row', ready ? 'chest-reveal__row--ready' : ''].join(
                    ' ',
                  )}
                  style={{ '--i': i } as CSSProperties}
                >
                  <Portrait kind={hero} size={36} />
                  <span className="chest-reveal__who">
                    <span className="chest-reveal__name">{names.hero(hero)}</span>
                    {ready ? (
                      <span className="chest-reveal__ready">
                        {unlocked ? t('chests.reveal.gate') : t('chests.reveal.ready')}
                      </span>
                    ) : (
                      <span className="hint">{t('chests.reveal.owned', { n: owned })}</span>
                    )}
                  </span>
                  <span className="chest-reveal__gain">+{n}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Window>
  );
}

/** Coffres : ouvrir, voir ses fragments, invoquer un héros, payer une étoile, cibler un héros. */
export function Chests() {
  const { go } = useGame();
  const { profile, apply } = useProfile();
  const [reveal, setReveal] = useState<ChestReport | null>(null);
  const { chests } = content.balance;
  const rates = fragmentRates(content, profile);
  const total = chestCount(profile);

  function open(tier: string): void {
    const result = openChest(content, profile, tier);
    if (!result.ok) {
      apply(result);
      return;
    }
    apply({ ok: true, value: result.value.profile });
    setReveal(result.value.report);
  }

  const revealTier = reveal?.tier ?? '';
  // Après l'ouverture, `profile` est déjà à jour : il reste ce qu'il reste.
  const remainingSameTier = reveal === null ? 0 : (profile.chests[revealTier] ?? 0);

  return (
    <Screen
      title={t('chests.title')}
      onBack={() => {
        go({ name: 'hub' });
      }}
      className="chests"
    >
      <div className="chests__layout">
        <Panel className="chests__boxes" label={t('chests.boxes')}>
          <h2 className="chests__heading">{t('chests.boxes')}</h2>
          <ul className="chest-list">
            {chests.tiers.map((tier) => {
              const count = profile.chests[tier.id] ?? 0;
              return (
                <li
                  key={tier.id}
                  className={['chest-card', count === 0 ? 'chest-card--none' : ''].join(' ')}
                >
                  <ChestArt tier={tier.id} />
                  <span className="chest-card__name">{tk(`chest.tier.${tier.id}`)}</span>
                  <span className="hint">
                    {t('chests.size', { n: chestSize(content, tier.id) ?? 0 })} ·{' '}
                    {t('chests.owned', { n: count })}
                  </span>
                  <Button
                    size="small"
                    disabled={count === 0}
                    onClick={() => {
                      open(tier.id);
                    }}
                  >
                    {t('chests.open')}
                  </Button>
                </li>
              );
            })}
          </ul>
          {total === 0 && <p className="hint chests__empty">{t('chests.empty')}</p>}
        </Panel>

        <Panel className="chests__heroes" label={t('chests.fragments')}>
          <h2 className="chests__heading">{t('chests.fragments')}</h2>
          <p className="hint chests__target-hint">
            {profile.focus === null
              ? t('chests.target.none')
              : t('chests.target.hint', { pct: Math.round(chests.focusRate * 100) })}
          </p>
          <ul className="frag-list">
            {content.heroes.map((def) => {
              const hero = profile.heroes[def.id];
              const unlocked = profile.unlocked.includes(def.id) && hero !== undefined;
              const owned = profile.fragments[def.id] ?? 0;
              const gate = unlocked && atStarGate(hero, content);
              const cost = unlocked ? starCost(content, hero) : chests.summonCost;
              const target = profile.focus === def.id;
              const pct = rates.find((r) => r.hero === def.id)?.pct ?? 0;
              return (
                <li
                  key={def.id}
                  className={[
                    'frag-row',
                    `element-${def.element}`,
                    unlocked ? '' : 'frag-row--locked',
                    target ? 'frag-row--target' : '',
                  ].join(' ')}
                >
                  <Portrait kind={def.id} size={36} />
                  <span className="frag-row__id">
                    <span className="frag-row__name">
                      {names.hero(def.id)}
                      {target && <span className="frag-row__tag">{t('chests.target.badge')}</span>}
                    </span>
                    <span className="hint frag-row__status">
                      {!unlocked
                        ? t('chests.hero.locked')
                        : gate
                          ? t('chests.hero.gate', { level: hero.level })
                          : t('chests.hero.line', {
                              level: hero.level,
                              stars: heroStars(hero, content),
                              max: chests.starCosts.length,
                            })}
                    </span>
                  </span>
                  <span className="frag-row__bar">
                    {cost !== null && (
                      <span className="frag-row__meter">
                        <span
                          className={['bar', owned >= cost ? 'bar--full' : ''].join(' ')}
                          role="img"
                          aria-label={t('chests.progress', { n: owned, cost })}
                        >
                          <span
                            style={{ width: `${Math.min(100, Math.round((owned / cost) * 100))}%` }}
                          />
                        </span>
                        <span className="frag-row__count">
                          {owned} / {cost}
                        </span>
                      </span>
                    )}
                    <span className="hint">{t('chests.rate', { pct: rate(pct) })}</span>
                  </span>
                  <span className="frag-row__actions">
                    {!unlocked ? (
                      <Button
                        size="small"
                        disabled={owned < chests.summonCost}
                        onClick={() => {
                          apply(summonHero(content, profile, def.id));
                        }}
                      >
                        {t('chests.summon')}
                      </Button>
                    ) : gate ? (
                      <Button
                        size="small"
                        disabled={cost === null || owned < cost}
                        onClick={() => {
                          apply(starUp(content, profile, def.id));
                        }}
                      >
                        {t('chests.star')}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="small"
                      aria-pressed={target}
                      aria-label={
                        target
                          ? t('chests.target.on', { hero: names.hero(def.id) })
                          : t('chests.target.set', { hero: names.hero(def.id) })
                      }
                      onClick={() => {
                        apply(setFocus(content, profile, target ? null : def.id));
                      }}
                    >
                      <Icon name="mark" size={12} />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hint chests__rules">
            {t('chests.rules', {
              summon: chests.summonCost,
              levels: content.balance.progression.levelsPerStar,
            })}
          </p>
        </Panel>
      </div>
      {reveal !== null && (
        <Reveal
          key={`${reveal.tier}-${String(profile.seed)}`}
          report={reveal}
          remaining={remainingSameTier}
          onAgain={() => {
            open(revealTier);
          }}
          onClose={() => {
            setReveal(null);
          }}
        />
      )}
    </Screen>
  );
}
