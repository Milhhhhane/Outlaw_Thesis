import type {
  Balance,
  BaseStats,
  Effect,
  Element,
  EnemyTargetRule,
  Role,
  SpellSlot,
  Targeting,
  Trigger,
} from '@outlaw/data';

/** Camp d'une unité. Les héros sont « player », les ennemis « enemy ». */
export type Side = 'player' | 'enemy';

/** Qui décide des actions de l'unité : un humain ou une politique (policy), ou le script d'un ennemi (script). */
export type Controller = 'policy' | 'script';

/** Un sort une fois résolu : coût, gain et délai tiennent compte de balance.json et des talents. */
export interface ResolvedSpell {
  readonly id: string;
  readonly slot: SpellSlot;
  readonly targeting: Targeting;
  readonly element: Element;
  /** Points d'équipe dépensés (compétences et ultime). */
  readonly cost: number;
  /** Points d'équipe générés (attaque de base). */
  readonly gain: number;
  /** Délai de base, en unités de temps. */
  readonly delay: number;
  readonly effects: readonly Effect[];
}

/** Un déclencheur posé sur une unité : passif, objet ou modificateur de donjon. */
export interface ResolvedTrigger {
  readonly source: string;
  readonly trigger: Trigger;
}

export interface ScriptStep {
  readonly spell: string;
  readonly target: EnemyTargetRule;
}

/** Description complète d'une unité au début d'un combat. Immuable, partagée entre les états. */
export interface UnitDef {
  readonly id: string;
  readonly side: Side;
  /** Emplacement dans le camp, de 0 à 2 (de gauche à droite). */
  readonly slot: number;
  readonly element: Element;
  readonly role: Role | null;
  readonly boss: boolean;
  /** Statistiques au niveau de l'unité, bonus d'objets compris. */
  readonly stats: BaseStats;
  readonly spells: readonly ResolvedSpell[];
  readonly triggers: readonly ResolvedTrigger[];
  readonly controller: Controller;
  /** Script d'actions des unités « script » ; il tourne en boucle. */
  readonly script: readonly ScriptStep[];
}

export interface BattleSetup {
  readonly units: readonly UnitDef[];
}

export interface UnitState {
  readonly def: UnitDef;
  readonly hp: number;
  readonly alive: boolean;
  /** Instant du prochain tour, en centièmes d'unité de temps (voir TIME_SCALE). */
  readonly nextTime: number;
  /** Position dans le script (unités « script »). */
  readonly scriptIndex: number;
}

export type BattleEndReason = 'annihilation' | 'action_limit';

export interface BattleResult {
  /**
   * Camp vainqueur. La limite d'actions est une défaite des héros (vainqueur « enemy »).
   * Null : anéantissement simultané des deux camps, compté comme une défaite par le jeu.
   */
  readonly winner: Side | null;
  readonly reason: BattleEndReason;
}

export interface BattleState {
  /** Paramètres d'équilibrage du combat (partagés, jamais modifiés). */
  readonly balance: Balance;
  /** Triées par camp (héros d'abord) puis par emplacement. */
  readonly units: readonly UnitState[];
  /** Instant du dernier tour joué. */
  readonly clock: number;
  /** Réserve de points d'équipe de chaque camp. */
  readonly points: Readonly<Record<Side, number>>;
  /** Nombre de tours joués depuis le début du combat. */
  readonly actionCount: number;
  /** Unité qui attend une action extérieure, ou null si le combat est terminé. */
  readonly active: string | null;
  /** Null tant que le combat est en cours. */
  readonly result: BattleResult | null;
}

/** Action d'une unité contrôlée par une politique : lancer un de ses sorts. */
export interface CastAction {
  readonly type: 'cast';
  readonly unit: string;
  readonly spell: string;
  /** Obligatoire pour les sorts à cible choisie (ennemi, allié) ; interdit sinon. */
  readonly target?: string;
}
export type Action = CastAction;

export type PointsReason = 'cost' | 'gain' | 'effect';

/** Le journal d'événements : l'interface le rejoue pour animer, elle ne calcule rien. */
export type BattleEvent =
  | { readonly type: 'battle_start'; readonly units: readonly UnitSummary[] }
  | { readonly type: 'turn_start'; readonly unit: string; readonly time: number }
  | {
      readonly type: 'cast';
      readonly unit: string;
      readonly spell: string;
      readonly slot: SpellSlot;
      readonly targets: readonly string[];
    }
  | {
      readonly type: 'damage';
      readonly source: string;
      readonly target: string;
      readonly amount: number;
      /** Multiplicateur d'élément appliqué (1, avantage ou désavantage). */
      readonly multiplier: number;
      readonly hpAfter: number;
      readonly killed: boolean;
    }
  | {
      readonly type: 'heal';
      readonly source: string;
      readonly target: string;
      readonly amount: number;
      readonly hpAfter: number;
    }
  | {
      readonly type: 'points';
      readonly side: Side;
      readonly delta: number;
      readonly total: number;
      readonly reason: PointsReason;
    }
  | { readonly type: 'unit_down'; readonly unit: string }
  | {
      readonly type: 'battle_end';
      readonly winner: Side | null;
      readonly reason: BattleEndReason;
    };

export interface UnitSummary {
  readonly id: string;
  readonly side: Side;
  readonly slot: number;
  readonly element: Element;
  readonly hp: number;
  readonly maxHp: number;
}

export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

/** Une entrée de la file d'initiative visible. */
export interface QueueEntry {
  readonly unit: string;
  readonly time: number;
}
