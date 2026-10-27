"""Enrichit les arbres de talents : 5 → 8 nœuds par page (lot 10).

Structure d'une page après enrichissement :
  core (T1) → [A | B (choix), C, X] (T2) → [D (après C), Y (après X)] (T3) → Z (après D, sommet).
X, Y et Z sont ajoutés ici ; les cinq nœuds d'origine ne changent pas. Idempotent : une page qui
a déjà 8 nœuds est laissée telle quelle. Usage : python3 tools/content/enrich_talents.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HEROES = ROOT / 'packages' / 'data' / 'content' / 'heroes'
TEXTS = ROOT / 'apps' / 'web' / 'src' / 'i18n' / 'content.fr.json'


def scale(slot, kind, field, **kw):
    return {'type': 'scaleEffect', 'slot': slot, 'kind': kind, 'field': field, **kw}


def add(slot, effect):
    return {'type': 'addEffect', 'slot': slot, 'effect': effect}


def cost(slot, delta):
    return {'type': 'cost', 'slot': slot, 'delta': delta}


def delay(slot, delta):
    return {'type': 'delay', 'slot': slot, 'delta': delta}


def gain(delta):
    return {'type': 'gain', 'delta': delta}


def retarget(slot, targeting):
    return {'type': 'retarget', 'slot': slot, 'targeting': targeting}


# Par page : (X, Y, Z) = (suffixe, nom, mods). Y requiert X, Z requiert D (le 5e nœud d'origine).
NEW = {
    # ---- Pyra : dégâts feu ; a = tempo+statMod (soi), b = dégâts+brûlure, ult = dégâts+brûlure (tous)
    'pyra_page_execution': [
        ('mark', 'Œil du tireur', [scale('b', 'damage', 'power', mulPct=15), delay('b', 10)]),
        ('volley', 'Salve', [add('b', {'kind': 'damage', 'power': 45}), cost('b', 1)]),
        ('judgment', 'Jugement', [scale('ult', 'damage', 'power', mulPct=25), cost('ult', 1)]),
    ],
    'pyra_page_tempo': [
        ('spark', 'Étincelle rapide', [gain(1), scale('basic', 'damage', 'power', mulPct=-15)]),
        ('chain', 'Enchaînement', [delay('a', -25)]),
        ('overdrive', 'Surchauffe', [add('ult', {'kind': 'tempo', 'target': 'self', 'amount': -40})]),
    ],
    'pyra_page_embers': [
        ('tinder', 'Amadou', [scale('basic', 'status', 'duration', add=1), scale('basic', 'status', 'power', mulPct=-20)]),
        ('ashfall', 'Pluie de cendres', [add('b', {'kind': 'status', 'status': 'burn', 'target': 'all_enemies', 'duration': 1, 'power': 20}), delay('b', 15)]),
        ('inferno', 'Brasier', [scale('ult', 'status', 'duration', add=1), scale('ult', 'damage', 'power', mulPct=-10)]),
    ],
    # ---- Marée : gardienne ; a = bouclier, b = soin+tempo, ult = soin+statMod
    'maree_page_bastion': [
        ('brace', 'Appui ferme', [scale('a', 'shield', 'power', mulPct=20), delay('a', 10)]),
        ('rampart', 'Rempart partagé', [retarget('a', 'all_allies'), scale('a', 'shield', 'power', mulPct=-40)]),
        ('citadel', 'Citadelle', [add('ult', {'kind': 'shield', 'target': 'all_allies', 'power': 60, 'duration': 2}), cost('ult', 1)]),
    ],
    'maree_page_source': [
        ('trickle', 'Filet d’eau', [add('basic', {'kind': 'heal', 'target': 'self', 'power': 15})]),
        ('tide', 'Marée haute', [scale('b', 'heal', 'power', mulPct=25), cost('b', 1)]),
        ('deluge', 'Déluge', [retarget('ult', 'all_allies'), scale('ult', 'heal', 'power', mulPct=-30)]),
    ],
    'maree_page_current': [
        ('eddy', 'Remous', [scale('b', 'tempo', 'amount', mulPct=40), scale('b', 'heal', 'power', mulPct=-15)]),
        ('riptide', 'Contre-courant', [add('b', {'kind': 'tempo', 'amount': 15})]),
        ('tidal', 'Raz-de-marée', [add('ult', {'kind': 'tempo', 'target': 'all_allies', 'amount': -20})]),
    ],
    # ---- Ronce : contrôle ; a = marque+dégâts, b = dégâts+statut, ult = dégâts+statut+tempo
    'ronce_page_snare': [
        ('barb', 'Barbelé', [scale('a', 'damage', 'power', mulPct=30), cost('a', 1)]),
        ('net', 'Filet', [retarget('a', 'all_enemies'), scale('a', 'damage', 'power', mulPct=-35)]),
        ('pin', 'Clouage', [add('ult', {'kind': 'status', 'status': 'stun', 'duration': 1}), cost('ult', 1)]),
    ],
    'ronce_page_brand': [
        ('scent', 'Flair', [delay('a', -15), scale('a', 'damage', 'power', mulPct=-10)]),
        ('quarry', 'Gibier', [scale('b', 'damage', 'power', mulPct=20), delay('b', 10)]),
        ('cull', 'Curée', [scale('ult', 'damage', 'power', mulPct=30), delay('ult', 20)]),
    ],
    'ronce_page_venom': [
        ('thorns', 'Épines', [add('basic', {'kind': 'damage', 'power': 20}), gain(-1)]),
        ('blight', 'Flétrissure', [scale('b', 'status', 'power', mulPct=35), cost('b', 1)]),
        ('plague', 'Pestilence', [scale('ult', 'status', 'duration', add=1)]),
    ],
    # ---- Cendre : soutien feu ; basic = dégâts+tempo, a = statMod+tempo, b = 3 effets, ult = tempo+statut
    'cendre_page_haze': [
        ('smolder', 'Fumerolles', [scale('a', 'statMod', 'percent', mulPct=30), delay('a', 10)]),
        ('fog', 'Brouillard', [scale('a', 'tempo', 'amount', mulPct=50), scale('a', 'statMod', 'percent', mulPct=-20)]),
        ('eclipse', 'Éclipse', [scale('ult', 'tempo', 'amount', mulPct=35), cost('ult', 1)]),
    ],
    'cendre_page_embers': [
        ('kindle', 'Petit bois', [gain(1), delay('basic', 10)]),
        ('scorch', 'Roussissure', [scale('b', 'damage', 'power', mulPct=25), delay('b', 15)]),
        ('firestorm', 'Tempête de feu', [scale('b', 'status', 'power', mulPct=30), cost('b', 1)]),
    ],
    'cendre_page_offbeat': [
        ('skip', 'Syncope', [scale('basic', 'tempo', 'amount', mulPct=50), scale('basic', 'damage', 'power', mulPct=-20)]),
        ('lag', 'Retard', [add('a', {'kind': 'tempo', 'amount': 10})]),
        ('freeze', 'Temps figé', [scale('ult', 'tempo', 'amount', mulPct=25), delay('ult', 20)]),
    ],
    # ---- Ressac : frappeur eau ; a = dégâts+tempo, b = dégâts, ult = dégâts+tempo
    'ressac_page_breaker': [
        ('hammer', 'Marteau', [scale('b', 'damage', 'power', mulPct=25), delay('b', 15)]),
        ('surge', 'Houle', [retarget('b', 'all_enemies'), scale('b', 'damage', 'power', mulPct=-40)]),
        ('tsunami', 'Tsunami', [scale('ult', 'damage', 'power', mulPct=30), cost('ult', 1)]),
    ],
    'ressac_page_ebb': [
        ('lap', 'Clapotis', [add('basic', {'kind': 'tempo', 'target': 'self', 'amount': -8}), scale('basic', 'damage', 'power', mulPct=-10)]),
        ('backwash', 'Reflux', [scale('a', 'tempo', 'amount', mulPct=40), cost('a', 1)]),
        ('lowtide', 'Marée basse', [add('ult', {'kind': 'tempo', 'target': 'all_enemies', 'amount': 12})]),
    ],
    'ressac_page_current': [
        ('drift', 'Dérive', [delay('a', -15), scale('a', 'damage', 'power', mulPct=-10)]),
        ('whirl', 'Tourbillon', [scale('a', 'damage', 'power', mulPct=30), delay('a', 20)]),
        ('abyss', 'Abysse', [scale('ult', 'tempo', 'amount', mulPct=40), scale('ult', 'damage', 'power', mulPct=-15)]),
    ],
    # ---- Sève : soigneuse ; basic = dégâts+soin, a = bouclier+statMod, b = soin+statMod, ult = soin+bouclier+points
    'seve_page_bark': [
        ('sap', 'Résine', [scale('a', 'shield', 'power', mulPct=25), delay('a', 10)]),
        ('ring', 'Cercle d’écorce', [retarget('a', 'all_allies'), scale('a', 'shield', 'power', mulPct=-35)]),
        ('oak', 'Chêne', [scale('ult', 'shield', 'power', mulPct=40), cost('ult', 1)]),
    ],
    'seve_page_bloom': [
        ('petal', 'Pétale', [scale('basic', 'heal', 'power', mulPct=50), scale('basic', 'damage', 'power', mulPct=-20)]),
        ('nectar', 'Nectar', [scale('b', 'heal', 'power', mulPct=25), delay('b', 15)]),
        ('harvest', 'Moisson', [scale('ult', 'heal', 'power', mulPct=30), cost('ult', 1)]),
    ],
    'seve_page_roots': [
        ('sprout', 'Pousse', [gain(1), scale('basic', 'heal', 'power', mulPct=-25)]),
        ('vigor', 'Vigueur', [scale('b', 'statMod', 'percent', mulPct=40), cost('b', 1)]),
        ('seed', 'Graine', [scale('ult', 'teamPoints', 'amount', add=1), delay('ult', 25)]),
    ],
}


def main():
    texts = json.loads(TEXTS.read_text(encoding='utf-8'))
    for path in sorted(HEROES.glob('*.json')):
        hero = json.loads(path.read_text(encoding='utf-8'))
        changed = False
        for page in hero['pages']:
            if len(page['nodes']) >= 8:
                continue
            core = next(n for n in page['nodes'] if 'requires' not in n)
            fifth = page['nodes'][4]  # D : le nœud profond d'origine
            prefix = page['nodes'][0]['id'].rsplit('_', 1)[0]
            (xs, xn, xm), (ys, yn, ym), (zs, zn, zm) = NEW[page['id']]
            x = {'id': f'{prefix}_{xs}', 'requires': core['id'], 'mods': xm}
            y = {'id': f'{prefix}_{ys}', 'requires': x['id'], 'mods': ym}
            z = {'id': f'{prefix}_{zs}', 'requires': fifth['id'], 'mods': zm}
            page['nodes'] += [x, y, z]
            texts['nodes'][x['id']] = xn
            texts['nodes'][y['id']] = yn
            texts['nodes'][z['id']] = zn
            changed = True
        if changed:
            path.write_text(json.dumps(hero, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print('enrichi', path.name)
    TEXTS.write_text(json.dumps(texts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
