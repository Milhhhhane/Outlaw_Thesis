import {
  autoAction,
  enemyIntent,
  legalActions,
  type Action,
  type BattleEvent,
  type BattleSetup,
  type Intent,
  type ResolvedSpell,
  type UnitDef,
} from '@outlaw/engine';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Countdown } from '../game/Countdown';
import { useEscape } from '../game/keys';
import { GameContext } from '../game/nav';
import { speedFactor, useOptions } from '../game/options';
import { Button, Icon, Window } from '../game/ui';
import { describeSpell, describeTrigger } from '../i18n/describe';
import { joinNames, names, t, tk, type TextKey } from '../i18n';
import { ActionBar } from './ActionBar';
import { InitiativeTrack } from './InitiativeTrack';
import { PvpBanner, PvpEmotes, PvpOutcome, PvpPlates, TurnTimer } from '../pvp/overlays';
import type { PvpInfo } from '../pvp/info';
import { content } from './session';
import { anchorOf, Stage } from './Stage';
import { useBattle, type BattleHandle } from './useBattle';
import type { UnitView } from './view';
import './combat.css';
import { Glossed } from '../game/Glossed';

/** Pause (ms, à vitesse normale) entre deux décisions du combat automatique. */
const AUTO_DELAY = 400;

const HELP: readonly TextKey[] = [
  'help.queue',
  'help.reserve',
  'help.elements',
  'help.statuses',
  'help.keys',
];

const STATUS_ICON: Readonly<Record<string, string>> = {
  burn: 'burn',
  stun: 'stun',
  mark: 'mark',
  stun_immunity: 'lock',
};
const STAT_ICON: Readonly<Record<string, string>> = { atk: 'damage', def: 'shield', vit: 'speed' };

interface Props {
  readonly setup: BattleSetup;
  readonly onExit: () => void;
  /** Titre affiché (par défaut « Combat »). */
  readonly title?: string;
  /** Série de passages : « passage 2 sur 5 », sous le titre. */
  readonly pass?: string;
  /** Décor du champ de bataille : identifiant du donjon. */
  readonly scene?: string;
  /**
   * Dans un donjon : un seul bouton de fin, qui mène à la suite. En mode Auto, une victoire y
   * mène seule après un décompte ; `last` : la suite est l'écran de récompenses.
   */
  readonly finish?: {
    readonly label: (won: boolean) => string;
    /** `journal` : tout le journal du combat (le boss de la semaine en tire ses dégâts). */
    readonly onClick: (won: boolean, journal: readonly BattleEvent[]) => void;
    readonly last: boolean;
    /** Titre du résultat à la place de victoire / défaite (boss de la semaine : les dégâts). */
    readonly heading?: (journal: readonly BattleEvent[]) => string;
  };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

type SideOf = (id: string) => UnitDef['side'] | undefined;

/**
 * Règle de cible « devant / derrière » du script, dite en clair (héros adverse ou allié du lanceur) ;
 * null pour les autres règles. `short` : un mot, pour la bulle au-dessus de l'ennemi.
 */
function ruleText(
  intent: Intent,
  side: UnitDef['side'],
  sideOf: SideOf,
  short = false,
): string | null {
  const { rule } = intent;
  if (rule !== 'first' && rule !== 'last') return null;
  if (short) return t(`combat.intent.short.${rule}`);
  const ally = intent.targets.some((id) => sideOf(id) === side);
  return t(ally ? `combat.intent.rule.${rule}.ally` : `combat.intent.rule.${rule}`);
}

function intentText(
  intent: Intent,
  unit: Pick<UnitView, 'id' | 'side'>,
  nameOf: (id: string) => string,
  sideOf: SideOf,
): string {
  if (intent.stunned) return t('combat.intent.stunned', { spell: names.spell(intent.spell) });
  if (intent.targets.length > 0 && intent.targets.every((id) => id !== unit.id)) {
    const spell = names.spell(intent.spell);
    const targets = joinNames(intent.targets.map(nameOf));
    const rule = ruleText(intent, unit.side, sideOf);
    return rule === null
      ? t('combat.intent.targets', { spell, targets })
      : t('combat.intent.rule', { spell, targets, rule });
  }
  return t('combat.intent', { spell: names.spell(intent.spell) });
}

/** Ce qui flotte au-dessus d'une unité : nom, PV, bouclier, altérations, intention. */
function UnitHud({
  unit,
  intent,
  active,
  nameOf,
  sideOf,
}: {
  readonly unit: UnitView;
  readonly intent: Intent | null;
  readonly active: boolean;
  readonly nameOf: (id: string) => string;
  readonly sideOf: SideOf;
}) {
  const { x, head } = anchorOf(unit);
  const hpPct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const shieldPct = Math.min(100, Math.round((unit.shield / unit.maxHp) * 100));
  return (
    <div
      className={[
        'hud',
        `hud--${unit.side}`,
        `element-${unit.element}`,
        active ? 'hud--active' : '',
        unit.alive ? '' : 'hud--down',
      ].join(' ')}
      style={{ left: x, top: head - 4 }}
    >
      {intent !== null && unit.alive && (
        <span className="hud__intent" title={intentText(intent, unit, nameOf, sideOf)}>
          <Icon name={intent.stunned ? 'stun' : 'damage'} />
          {intent.stunned
            ? names.spell(intent.spell)
            : intent.targets.length > 0 && intent.targets.every((id) => id !== unit.id)
              ? `→ ${joinNames(intent.targets.map(nameOf))}`
              : names.spell(intent.spell)}
          {!intent.stunned && ruleText(intent, unit.side, sideOf, true) !== null && (
            <span className="hud__rule">{ruleText(intent, unit.side, sideOf, true)}</span>
          )}
        </span>
      )}
      <span className="hud__name">
        {active && <span className="hud__marker" aria-hidden="true" />}
        {names.unit(unit.kind)}
      </span>
      {unit.alive ? (
        <>
          <span className="hud__bar">
            <span className="hud__hp" style={{ width: `${hpPct}%` }} />
            {unit.shield > 0 && <span className="hud__shield" style={{ width: `${shieldPct}%` }} />}
          </span>
          <span className="hud__numbers">
            {unit.hp}/{unit.maxHp}
            {unit.shield > 0 && <span className="hud__shield-value"> +{unit.shield}</span>}
          </span>
          <span className="hud__tags">
            {unit.statuses.map((s) => (
              <span key={s.kind} className={`hud__tag hud__tag--${s.kind}`}>
                <Icon name={STATUS_ICON[s.kind] ?? 'trigger'} />
                {s.kind === 'stun' ? '' : s.turns}
              </span>
            ))}
            {Object.entries(unit.mods)
              .filter(([, v]) => v !== 0)
              .map(([stat, v]) => (
                <span
                  key={stat}
                  className={`hud__tag ${v > 0 ? 'hud__tag--up' : 'hud__tag--down'}`}
                >
                  <Icon name={STAT_ICON[stat] ?? 'stat'} />
                  {v > 0 ? '▲' : '▼'}
                </span>
              ))}
          </span>
        </>
      ) : (
        <span className="hud__numbers">{t('combat.down')}</span>
      )}
    </div>
  );
}

/** Description complète d'une unité, pour le panneau de détail et les lecteurs d'écran. */
function unitDetail(
  unit: UnitView,
  def: UnitDef | undefined,
  intent: Intent | null,
  nameOf: (id: string) => string,
  sideOf: SideOf,
): string[] {
  const lines = [
    unit.alive ? t('combat.hp', { hp: unit.hp, max: unit.maxHp }) : t('combat.down'),
    ...(unit.shield > 0 ? [t('combat.shield', { shield: unit.shield })] : []),
    ...unit.statuses.map((s) =>
      s.kind === 'stun'
        ? tk(`status.${s.kind}`)
        : t('combat.statusTurns', { status: tk(`status.${s.kind}`), turns: s.turns }),
    ),
    ...Object.entries(unit.mods)
      .filter(([, v]) => v !== 0)
      .map(([stat, v]) => `${tk(`stat.${stat}`)} ${signed(v)} %`),
  ];
  const passive = def?.triggers[0];
  if (passive !== undefined && unit.side === 'player') {
    lines.push(
      `${t('combat.passive', { name: names.passive(passive.source) })} : ${describeTrigger(passive.trigger)}`,
    );
  }
  if (intent !== null && unit.alive) lines.push(intentText(intent, unit, nameOf, sideOf));
  return lines;
}

/** Combat contre l'ordinateur : le moteur tourne ici, dans le navigateur. */
export function CombatScreen(props: Props) {
  const { options } = useOptions();
  const battle = useBattle(props.setup, speedFactor(options.speed));
  return <CombatView {...props} battle={battle} />;
}

interface ViewProps extends Props {
  readonly battle: BattleHandle;
  /** Partie en ligne : les actions viennent du serveur, les deux camps sont des joueurs. */
  readonly pvp?: PvpInfo;
}

/** L'écran de combat lui-même, indifférent à l'origine des actions (local ou serveur). */
export function CombatView({ onExit, title, pass, scene, finish, battle, pvp }: ViewProps) {
  const { options, set: setOptions } = useOptions();
  const fast = options.speed !== 'normal';
  const toggleSpeed = (): void => {
    setOptions({ speed: fast ? 'normal' : 'fast' });
  };
  // Le combat automatique est un réglage du solo : en ligne, chaque joueur joue lui-même (le chrono du serveur joue à sa place s'il tarde).
  const auto = pvp === undefined && options.auto;
  const game = useContext(GameContext);
  const { model, busy, act, skip, reset } = battle;
  const { state, view } = model;
  const mySide = pvp?.you ?? 'player';
  const [leaving, setLeaving] = useState(false);
  // La sélection est liée au héros actif : elle disparaît d'elle-même quand le tour passe.
  const [selection, setSelection] = useState<{ unit: string; spell: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [focusSpell, setFocusSpell] = useState<string | null>(null);
  const [focusUnit, setFocusUnit] = useState<string | null>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const firstTarget = useRef<HTMLButtonElement>(null);

  // Unité dont c'est le tour (surlignée pour les deux joueurs) ; les commandes ne sont à vous que si elle est à vous.
  const turnUnit = busy ? null : state.active;
  const turnSide = state.units.find((u) => u.def.id === turnUnit)?.def.side ?? null;
  const mine =
    pvp === undefined ||
    (turnSide === mySide && !pvp.pending && pvp.result === null && !pvp.offline);
  const active = mine ? turnUnit : null;
  const selected = selection !== null && selection.unit === active ? selection.spell : null;
  const setSelected = (spell: string | null): void => {
    setSelection(spell === null || active === null ? null : { unit: active, spell });
  };
  // En ligne, la barre montre aussi les sorts de l'adversaire à son tour (sans pouvoir les lancer).
  const caster =
    state.units.find((u) => u.def.id === (pvp === undefined ? active : turnUnit)) ?? null;
  const legal = active === null ? [] : legalActions(state);
  const targets = new Set<string>(
    legal.filter((a) => a.spell === selected && a.target !== undefined).map((a) => a.target ?? ''),
  );
  const result = busy ? null : pvp === undefined ? state.result : pvp.result;
  const finished = result !== null;
  const defOf = (id: string): UnitDef | undefined => state.units.find((u) => u.def.id === id)?.def;
  const nameOf = (id: string): string => {
    const def = defOf(id);
    return def ? names.unit(def.kind) : id;
  };
  const sideOf: SideOf = (id) => defOf(id)?.side;
  const intents = new Map(
    view.units
      .filter((u) => u.side === 'enemy' && pvp === undefined)
      .map((u) => [u.id, busy ? null : enemyIntent(state, u.id)] as const),
  );

  useEffect(() => {
    if (finished) resultRef.current?.focus();
  }, [finished]);

  // Combat automatique : une décision à la fois, quand rien ne s'anime et que le jeu n'est pas en pause.
  useEffect(() => {
    if (!auto || paused || busy || finished || state.active === null) return;
    const timer = window.setTimeout(
      () => {
        act(autoAction(state));
      },
      AUTO_DELAY * speedFactor(options.speed),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [auto, paused, busy, finished, state, act, options.speed]);

  useEffect(() => {
    // En ciblage, le focus va à la première cible : Entrée valide, Tab passe à la suivante.
    if (selected !== null) firstTarget.current?.focus();
  }, [selected]);

  useEscape(() => {
    if (selected !== null) setSelected(null);
    else if (!finished) setPaused(true);
  });

  const doAct = (action: Action): void => {
    if (pvp === undefined) act(action);
    else pvp.send(action);
  };

  const toggleAuto = (): void => {
    if (pvp !== undefined) return;
    setSelection(null);
    setOptions({ auto: !auto });
  };

  const castSpell = (spell: ResolvedSpell): void => {
    if (caster === null) return;
    if (spell.targeting === 'enemy' || spell.targeting === 'ally') {
      setSelected(selected === spell.id ? null : spell.id);
      return;
    }
    doAct({ type: 'cast', unit: caster.def.id, spell: spell.id });
  };

  const onTarget = (id: string): void => {
    if (caster === null || selected === null) return;
    doAct({ type: 'cast', unit: caster.def.id, spell: selected, target: id });
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (paused) return;
      if (event.key === 'x' || event.key === 'X') {
        toggleSpeed();
        return;
      }
      if (event.key === 'a' || event.key === 'A') {
        toggleAuto();
        return;
      }
      if (event.key === ' ' && busy) {
        event.preventDefault();
        skip();
        return;
      }
      const index = Number(event.key) - 1;
      const spell = caster?.def.spells[index];
      if (
        spell !== undefined &&
        caster !== null &&
        !busy &&
        mine &&
        !auto &&
        spell.cost <= state.points[caster.def.side]
      ) {
        castSpell(spell);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const lastLine = model.log.at(-1)?.text ?? '';
  const shownSpell =
    caster?.def.spells.find((s) => s.id === (focusSpell ?? selected)) ??
    (focusUnit === null ? caster?.def.spells[0] : undefined);
  const hovered = view.units.find((u) => u.id === focusUnit);
  let detail: ReactNode = null;
  if (hovered !== undefined) {
    detail = (
      <>
        <p className="detail__name">{names.unit(hovered.kind)}</p>
        <ul>
          {unitDetail(
            hovered,
            defOf(hovered.id),
            intents.get(hovered.id) ?? null,
            nameOf,
            sideOf,
          ).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </>
    );
  } else if (shownSpell !== undefined) {
    detail = (
      <>
        <p className="detail__name">
          {names.spell(shownSpell.id)} <span>{tk(`combat.target.${shownSpell.targeting}`)}</span>
        </p>
        <ul>
          {describeSpell(shownSpell).map((line, i) => (
            <li key={i}>
              <Glossed text={line} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  const firstTargetId = view.units.find((u) => targets.has(u.id))?.id;
  return (
    <main className="battle">
      <Stage
        view={view}
        scene={scene ?? 'ember_wastes'}
        active={turnUnit}
        targets={targets}
        pace={speedFactor(options.speed)}
      />

      <header className="battle__top">
        <Button
          variant="quiet"
          size="small"
          icon="gear"
          aria-label={t('combat.pause')}
          onClick={() => {
            setPaused(true);
          }}
        />
        <h1 className="battle__title">
          {title ?? t('combat.title')}
          {pass !== undefined && (
            <>
              {' '}
              <span className="battle__pass">{pass}</span>
            </>
          )}
        </h1>
        <InitiativeTrack state={state} />
        {pvp !== undefined && <TurnTimer deadline={busy || finished ? null : pvp.deadline} />}
        <Button
          variant={fast ? 'primary' : 'quiet'}
          size="small"
          icon="speed"
          aria-pressed={fast}
          aria-keyshortcuts="X"
          title={t('combat.speed.hint')}
          onClick={toggleSpeed}
        >
          {fast ? '×2' : '×1'}
        </Button>
        {pvp === undefined && (
          <Button
            variant={auto ? 'primary' : 'quiet'}
            size="small"
            aria-pressed={auto}
            aria-keyshortcuts="A"
            title={t('combat.auto.hint')}
            onClick={toggleAuto}
          >
            {t('combat.auto')}
          </Button>
        )}
      </header>

      {pvp !== undefined && <PvpPlates pvp={pvp} />}
      {pvp !== undefined && <PvpBanner pvp={pvp} />}
      {pvp !== undefined && <PvpEmotes pvp={pvp} />}

      <section className="battle__units" aria-label={t('combat.units')}>
        {view.units.map((unit) => {
          const targetable = targets.has(unit.id);
          const { x, head, feet } = anchorOf(unit);
          const intent = intents.get(unit.id) ?? null;
          const isFirst = unit.id === firstTargetId;
          return (
            <div key={unit.id}>
              <UnitHud
                unit={unit}
                intent={intent}
                active={unit.id === active}
                nameOf={nameOf}
                sideOf={sideOf}
              />
              <button
                ref={isFirst ? firstTarget : undefined}
                type="button"
                className={['hitbox', targetable ? 'hitbox--target' : ''].join(' ')}
                style={{ left: x - 36, top: head, height: feet - head + 6 }}
                aria-label={
                  targetable
                    ? t('combat.target', { unit: names.unit(unit.kind) })
                    : `${t('combat.details', { unit: names.unit(unit.kind) })}. ${unitDetail(unit, defOf(unit.id), intent, nameOf, sideOf).join('. ')}`
                }
                aria-disabled={!targetable}
                tabIndex={targetable ? 0 : -1}
                onClick={() => {
                  if (targetable) onTarget(unit.id);
                }}
                onMouseEnter={() => {
                  setFocusUnit(unit.id);
                }}
                onMouseLeave={() => {
                  setFocusUnit(null);
                }}
                onFocus={() => {
                  setFocusUnit(unit.id);
                }}
                onBlur={() => {
                  setFocusUnit(null);
                }}
              />
            </div>
          );
        })}
      </section>

      {selected !== null && caster !== null && (
        <p className="battle__prompt" role="status">
          {t('combat.chooseTarget', { spell: names.spell(selected) })}
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              setSelected(null);
            }}
          >
            {t('combat.cancel')}
          </Button>
        </p>
      )}

      <p className="battle__log" aria-live="polite">
        {lastLine}
      </p>

      <ActionBar
        caster={finished ? null : caster}
        points={view.points[caster?.def.side ?? mySide]}
        cap={content.balance.combat.teamPoints.cap}
        selected={selected}
        busy={busy || finished || !mine}
        locked={auto}
        onSpell={castSpell}
        onFocusSpell={setFocusSpell}
        detail={detail}
        {...(pvp === undefined
          ? {}
          : {
              waiting:
                turnSide !== null && turnSide !== mySide
                  ? t('pvp.theirTurn', { name: pvp.names.opponent })
                  : t('pvp.resolving'),
            })}
      />

      {result !== null && pvp !== undefined && <PvpOutcome pvp={pvp} result={result} />}

      {result !== null && pvp === undefined && (
        <section
          className={`outcome outcome--${result.winner === 'player' ? 'win' : 'loss'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-heading"
        >
          <h2 id="result-heading" className="outcome__title">
            {finish?.heading !== undefined
              ? finish.heading(model.journal)
              : result.winner === 'player'
                ? t('combat.result.victory')
                : result.reason === 'action_limit'
                  ? t('combat.result.limit')
                  : t('combat.result.defeat')}
          </h2>
          <p className="outcome__sub">{t('combat.result.actions', { count: state.actionCount })}</p>
          <div className="outcome__buttons">
            {finish !== undefined ? (
              <Button
                ref={resultRef}
                size="large"
                onClick={() => {
                  finish.onClick(result.winner === 'player', model.journal);
                }}
              >
                {finish.label(result.winner === 'player')}
              </Button>
            ) : (
              <>
                <Button ref={resultRef} size="large" onClick={reset}>
                  {t('combat.again')}
                </Button>
                <Button variant="quiet" size="large" onClick={onExit}>
                  {t('combat.home')}
                </Button>
              </>
            )}
          </div>
          {finish !== undefined && result.winner === 'player' && (
            <Countdown
              enabled={auto && !paused}
              text={(s) => t(finish.last ? 'combat.auto.claim' : 'combat.auto.next', { s })}
              onDone={() => {
                finish.onClick(true, model.journal);
              }}
            />
          )}
        </section>
      )}

      {paused && (
        <Window
          title={pvp === undefined ? t('combat.pause') : t('pvp.menu')}
          className="pause"
          onClose={() => {
            setPaused(false);
            setHelp(false);
            setLeaving(false);
          }}
        >
          {help ? (
            <ul className="pause__help">
              {HELP.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          ) : (
            <div className="pause__menu">
              <Button
                size="large"
                onClick={() => {
                  setPaused(false);
                }}
              >
                {t('combat.resume')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setHelp(true);
                }}
              >
                {t('combat.help')}
              </Button>
              {game !== null && (
                <Button variant="quiet" icon="gear" onClick={game.openOptions}>
                  {t('combat.options')}
                </Button>
              )}
              {pvp === undefined ? (
                <Button variant="danger" onClick={onExit}>
                  {t('combat.quit')}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (leaving) pvp.onLeave();
                    else setLeaving(true);
                  }}
                >
                  {leaving ? t('pvp.leave.confirm') : t('pvp.leave')}
                </Button>
              )}
            </div>
          )}
          {help && (
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                setHelp(false);
              }}
            >
              ◀ {t('nav.back')}
            </Button>
          )}
        </Window>
      )}
    </main>
  );
}
