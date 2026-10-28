import type {
  Balance,
  BaseStats,
  Effect,
  Element,
  EnemyTargetRule,
  EventKind,
  ModifiableStat,
  Role,
  SpellSlot,
  StatusKind,
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
  /** Identifiant de contenu de l'origine (passif, modificateur…), affiché par l'interface. */
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
  /** Identifiant de contenu (héros ou type d'ennemi) : plusieurs unités peuvent le partager. */
  readonly kind: string;
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

/** Ce qui se passe quand la limite d'actions est atteinte. */
export type LimitRule = 'enemy_wins' | 'hp_ratio';

/**
 * Règles optionnelles d'un combat. Absentes (PvE), elles valent DEFAULT_RULES :
 * les héros jouent d'abord et la limite d'actions est une défaite des héros.
 */
export interface BattleRules {
  /** Camp qui joue en premier à égalité d'instant (et dont les unités sont triées en tête). */
  readonly firstSide: Side;
  /** « enemy_wins » : la limite est une défaite des héros. « hp_ratio » : le plus fort ratio de PV gagne. */
  readonly limit: LimitRule;
}

export interface BattleSetup {
  readonly units: readonly UnitDef[];
  /** Règles du combat ; absentes, DEFAULT_RULES s'applique. */
  readonly rules?: BattleRules;
}

/** Altération en cours. « stun_immunity » protège d'un nouvel étourdissement juste après le premier. */
export interface StatusState {
  readonly kind: StatusKind | 'stun_immunity';
  /** Tours restants de l'unité (étourdissement : tours à sauter). */
  readonly turns: number;
  /** Numéro d'action lors de la pose : une altération posée pendant le tour du porteur ne s'use pas ce tour-là. */
  readonly since: number;
  /** Marque : bonus de dégâts subis en %. Brûlure : dégâts par tour, calculés à la pose. */
  readonly power: number;
  readonly source: string;
}

export interface StatModState {
  /** Une même origine sur une même stat remplace au lieu de cumuler. */
  readonly key: string;
  readonly stat: ModifiableStat;
  readonly percent: number;
  readonly turns: number;
  readonly since: number;
  readonly source: string;
}

export interface TriggerState {
  readonly key: string;
  readonly source: string;
  readonly trigger: Trigger;
  /** Tours restants du porteur, ou null jusqu'à la fin du combat. */
  readonly turns: number | null;
  readonly since: number;
  /** Utilisations depuis le début du combat. */
  readonly uses: number;
  /** Utilisations pendant l'action numéro turnStamp. */
  readonly turnUses: number;
  readonly turnStamp: number;
}

export interface UnitState {
  readonly def: UnitDef;
  readonly hp: number;
  readonly alive: boolean;
  /** Instant du prochain tour, en centièmes d'unité de temps (voir TIME_SCALE). */
  readonly nextTime: number;
  /** Position dans le script (unités « script »). */
  readonly scriptIndex: number;
  readonly shield: number;
  readonly shieldTurns: number;
  readonly shieldSince: number;
  readonly statuses: readonly StatusState[];
  readonly mods: readonly StatModState[];
  readonly triggers: readonly TriggerState[];
}

export type BattleEndReason = 'annihilation' | 'action_limit';

export interface BattleResult {
  /**
   * Camp vainqueur. Par défaut, la limite d'actions est une défaite des héros (vainqueur « enemy »).
   * Null : anéantissement simultané des deux camps (compté comme une défaite par le jeu en PvE),
   * ou, avec la règle de limite « hp_ratio », égalité de ratio de PV à la limite d'actions.
   */
  readonly winner: Side | null;
  readonly reason: BattleEndReason;
}

export interface BattleState {
  /** Paramètres d'équilibrage du combat (partagés, jamais modifiés). */
  readonly balance: Balance;
  /** Règles du combat, si le setup en fixait ; lire avec rulesOf. */
  readonly rules?: BattleRules;
  /** Triées par camp (le camp qui joue d'abord en tête ; les héros par défaut) puis par emplacement. */
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

/** Origine d'un coup ou d'un soin : un sort, une brûlure ou un déclencheur. */
export type Cause = 'spell' | 'burn' | 'trigger';

export type ExpiringEffect = 'shield' | StatusState['kind'] | 'stat_mod' | 'trigger';

/** Le journal d'événements : l'interface le rejoue pour animer, elle ne calcule rien. */
export type BattleEvent =
  | { readonly type: 'battle_start'; readonly units: readonly UnitSummary[] }
  | { readonly type: 'turn_start'; readonly unit: string; readonly time: number }
  | { readonly type: 'turn_skipped'; readonly unit: string; readonly reason: 'stun' }
  | { readonly type: 'turn_end'; readonly unit: string }
  | {
      readonly type: 'cast';
      readonly unit: string;
      readonly spell: string;
      readonly slot: SpellSlot;
      readonly targets: readonly string[];
    }
  | {
      readonly type: 'trigger_fired';
      readonly unit: string;
      readonly source: string;
      readonly on: EventKind;
    }
  | {
      readonly type: 'damage';
      readonly source: string;
      readonly target: string;
      readonly cause: Cause;
      /** Dégâts du coup, avant absorption par le bouclier. */
      readonly amount: number;
      readonly absorbed: number;
      /** Multiplicateur d'élément appliqué (1, avantage ou désavantage). */
      readonly multiplier: number;
      readonly hpAfter: number;
      readonly shieldAfter: number;
      readonly killed: boolean;
    }
  | {
      readonly type: 'heal';
      readonly source: string;
      readonly target: string;
      readonly cause: Cause;
      readonly amount: number;
      readonly hpAfter: number;
    }
  | {
      readonly type: 'shield';
      readonly source: string;
      readonly target: string;
      readonly amount: number;
      readonly total: number;
      readonly turns: number;
    }
  | {
      readonly type: 'tempo';
      readonly source: string;
      readonly target: string;
      /** Décalage réellement appliqué, en centièmes (négatif = avance). */
      readonly delta: number;
      readonly nextTime: number;
    }
  | {
      readonly type: 'stat_mod';
      readonly source: string;
      readonly target: string;
      readonly stat: ModifiableStat;
      readonly percent: number;
      readonly turns: number;
      /** Modification totale de la stat après cumul et bornes, en %. */
      readonly total: number;
    }
  | {
      readonly type: 'status';
      readonly source: string;
      readonly target: string;
      readonly status: StatusKind;
      readonly turns: number;
      /** Vrai si l'altération n'a pas pris (immunité à l'étourdissement). */
      readonly resisted: boolean;
    }
  | {
      readonly type: 'trigger_added';
      readonly source: string;
      readonly target: string;
      readonly key: string;
      readonly turns: number | null;
    }
  | {
      readonly type: 'points';
      readonly side: Side;
      readonly delta: number;
      readonly total: number;
      readonly reason: PointsReason;
    }
  | { readonly type: 'expired'; readonly unit: string; readonly effect: ExpiringEffect }
  | { readonly type: 'unit_down'; readonly unit: string }
  | {
      readonly type: 'battle_end';
      readonly winner: Side | null;
      readonly reason: BattleEndReason;
    };

export interface UnitSummary {
  readonly id: string;
  readonly kind: string;
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

/** Prochaine action annoncée d'un ennemi scripté. */
export interface Intent {
  readonly unit: string;
  readonly spell: string;
  readonly slot: SpellSlot;
  readonly targets: readonly string[];
  /** L'unité est étourdie : cette action sera reportée. */
  readonly stunned: boolean;
}
