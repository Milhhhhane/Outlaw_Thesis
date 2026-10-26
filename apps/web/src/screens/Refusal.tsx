import { t, tk } from '../i18n';
import { useProfile } from '../state/profile';

/** Message d'un refus du moteur (pas assez d'or, talent indisponible…), annoncé aux lecteurs d'écran. */
export function Refusal() {
  const { refusal, dismiss } = useProfile();
  if (refusal === null) return null;
  return (
    <p className="notice notice--refusal" role="alert">
      {tk(`refusal.${refusal}`)}{' '}
      <button type="button" className="link-button" onClick={dismiss}>
        {t('combat.cancel')}
      </button>
    </p>
  );
}
