import type { TalentNode } from '@outlaw/data';

/**
 * Mise en page d'une page de talents (affichage seulement, aucune règle de jeu) : chaque nœud est
 * placé sous son prérequis, chaque lien `requires` devient un trait du parent vers l'enfant.
 */

/** Plateau de l'arbre, en pixels CSS (voir `.tree__board`). */
export const BOARD = { width: 144, height: 210 } as const;
const STEP_X = 36;
const STEP_Y = 54;
const TOP = 22;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TreeLink {
  readonly from: string;
  readonly to: string;
}

export interface TreeLayout {
  readonly pos: ReadonlyMap<string, Point>;
  /** Un lien par nœud dont le prérequis est sur la page, dans l'ordre du contenu. */
  readonly links: readonly TreeLink[];
  /** Choix exclusifs : les nœuds d'un même `group`, dans l'ordre du contenu. */
  readonly choices: readonly (readonly string[])[];
}

/**
 * Rangée = profondeur de prérequis ; colonne : chaque feuille prend la suivante et un parent se
 * centre au-dessus de ses enfants, si bien qu'une chaîne reste verticale et qu'aucun trait n'en
 * croise un autre.
 */
export function treeLayout(nodes: readonly TalentNode[]): TreeLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, TalentNode[]>();
  const roots: TalentNode[] = [];
  const links: TreeLink[] = [];
  for (const n of nodes) {
    if (n.requires !== undefined && ids.has(n.requires)) {
      kids.set(n.requires, [...(kids.get(n.requires) ?? []), n]);
      links.push({ from: n.requires, to: n.id });
    } else {
      roots.push(n);
    }
  }

  const column = new Map<string, number>();
  const depth = new Map<string, number>();
  let leaves = 0;
  const place = (n: TalentNode, d: number): number => {
    depth.set(n.id, d);
    // Le schéma refuse les cycles ; la garde évite seulement de boucler sur un contenu invalide.
    const children = (kids.get(n.id) ?? []).filter((k) => !depth.has(k.id));
    let c = leaves;
    if (children.length === 0) {
      leaves += 1;
    } else {
      const cols = children.map((k) => place(k, d + 1));
      c = (Math.min(...cols) + Math.max(...cols)) / 2;
    }
    column.set(n.id, c);
    return c;
  };
  for (const root of roots) place(root, 0);

  const pos = new Map<string, Point>();
  for (const [id, c] of column) {
    pos.set(id, {
      x: BOARD.width / 2 + (c - (leaves - 1) / 2) * STEP_X,
      y: TOP + (depth.get(id) ?? 0) * STEP_Y,
    });
  }

  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.group !== undefined) groups.set(n.group, [...(groups.get(n.group) ?? []), n.id]);
  }
  return { pos, links, choices: [...groups.values()].filter((g) => g.length > 1) };
}
