import { ELEMENTS, MAX_HERO_TIER, ROLES } from '@outlaw/data';
import { useState, type ReactNode } from 'react';
import { t, tk } from '../i18n';
import { activeFilters, DEFAULT_HERO_VIEW, HERO_SORTS, type HeroView } from './heroList';
import { useOptions } from './options';
import { rarityName } from './Rarity';
import { Button, Choice, Window } from './ui';
import '../screens/farm.css';

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="filters__row">
      <span className="hint">{label}</span>
      {children}
    </div>
  );
}

const RARITIES = Array.from({ length: MAX_HERO_TIER }, (_, i) => i + 1);

/**
 * Barre de tri et filtres des héros : le tri en un clic, les filtres dans une fenêtre. Le réglage
 * est retenu sur l'appareil (options) et partagé par la galerie et le vivier de l'équipe.
 */
export function HeroFilters({
  shown,
  ownedFilter = true,
}: {
  readonly shown: number;
  /** Proposer « Possédés seulement » (inutile quand la liste ne montre que des héros débloqués). */
  readonly ownedFilter?: boolean;
}) {
  const { options, set } = useOptions();
  const view = options.heroView;
  const [open, setOpen] = useState(false);
  const change = (patch: Partial<HeroView>): void => {
    set({ heroView: { ...view, ...patch } });
  };
  const active = activeFilters(ownedFilter ? view : { ...view, owned: false });
  return (
    <div className="filters">
      <Choice
        label={t('filter.sort')}
        options={HERO_SORTS}
        value={view.sort}
        onChange={(sort) => {
          change({ sort });
        }}
        text={(sort) => t(`filter.sort.${sort}`)}
      />
      <Button
        size="small"
        variant={active > 0 ? 'primary' : 'quiet'}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        {active > 0 ? t('filter.active', { n: active }) : t('filter.button')}
      </Button>
      <span className="hint filters__count">{t('filter.shown', { n: shown })}</span>
      {open && (
        <Window
          title={t('filter.title')}
          className="filters__window"
          onClose={() => {
            setOpen(false);
          }}
          actions={
            <>
              <Button
                variant="quiet"
                onClick={() => {
                  set({ heroView: { ...DEFAULT_HERO_VIEW, sort: view.sort } });
                }}
              >
                {t('filter.reset')}
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t('ui.close')}
              </Button>
            </>
          }
        >
          <Row label={t('filter.element')}>
            <Choice
              label={t('filter.element')}
              options={[null, ...ELEMENTS]}
              value={view.element}
              onChange={(element) => {
                change({ element });
              }}
              text={(e) => (e === null ? t('filter.all') : tk(`element.${e}`))}
            />
          </Row>
          <Row label={t('filter.role')}>
            <Choice
              label={t('filter.role')}
              options={[null, ...ROLES]}
              value={view.role}
              onChange={(role) => {
                change({ role });
              }}
              text={(r) => (r === null ? t('filter.all') : tk(`role.${r}`))}
            />
          </Row>
          <Row label={t('filter.rarity')}>
            <Choice
              label={t('filter.rarity')}
              options={[null, ...RARITIES]}
              value={view.rarity}
              onChange={(rarity) => {
                change({ rarity });
              }}
              text={(r) => (r === null ? t('filter.all') : rarityName(r))}
            />
          </Row>
          {ownedFilter && (
            <Row label={t('filter.ownership')}>
              <Choice
                label={t('filter.ownership')}
                options={[false, true]}
                value={view.owned}
                onChange={(owned) => {
                  change({ owned });
                }}
                text={(o) => (o ? t('filter.owned') : t('filter.all'))}
              />
            </Row>
          )}
        </Window>
      )}
    </div>
  );
}
