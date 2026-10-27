import { useEffect, useState } from 'react';
import { META_KEY, useAccount } from '../account/AccountProvider';
import { useGame } from '../game/nav';
import { Button, Panel, Screen } from '../game/ui';
import { t } from '../i18n';
import { createRoom, normalizeCode } from './api';
import './pvp.css';

/** Entrée du duel en ligne : créer un salon (on reçoit un code) ou en rejoindre un. */
export function PvpMenu() {
  const { go, openOptions } = useGame();
  const account = useAccount();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = (): void => {
    go({ name: 'hub' });
  };

  // Un compte neuf n'a pas encore de sauvegarde en ligne (aucune progression à envoyer) : le salon
  // en a besoin pour vérifier les héros, on la crée donc en envoyant la partie actuelle.
  const signed = account?.status === 'signed';
  const synced = account?.sync === 'synced';
  const changed = account?.changed;
  useEffect(() => {
    if (!signed || !synced) return;
    try {
      const meta = JSON.parse(window.localStorage.getItem(META_KEY) ?? 'null') as {
        baseRev?: number;
      } | null;
      if (meta?.baseRev === 0) changed?.();
    } catch {
      // Méta illisible : la synchronisation normale s'en charge.
    }
  }, [signed, synced, changed]);

  if (account === null || account.status === 'unavailable') {
    return (
      <Screen title={t('pvp.title')} onBack={back} resources={false}>
        <Panel>
          <p>{t('pvp.unavailable')}</p>
        </Panel>
      </Screen>
    );
  }
  if (account.status !== 'signed') {
    return (
      <Screen title={t('pvp.title')} onBack={back} resources={false}>
        <Panel>
          <p>{t('pvp.intro')}</p>
          <p>{t('pvp.signin')}</p>
          <Button onClick={openOptions}>{t('pvp.signin.button')}</Button>
        </Panel>
      </Screen>
    );
  }

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const created = await createRoom();
    setBusy(false);
    if (created.ok) go({ name: 'pvp_room', code: created.code });
    else setError(created.limited ? t('pvp.menu.error.limit') : t('pvp.menu.error.create'));
  };
  const ready = account.sync === 'synced';
  const normalized = normalizeCode(code);

  return (
    <Screen title={t('pvp.title')} onBack={back} className="pvp-menu" resources={false}>
      <p className="pvp-hint">{t('pvp.intro')}</p>
      {!ready && (
        <p className="pvp-hint" role="status">
          {t('pvp.sync')}
        </p>
      )}
      <div className="pvp-menu__choices">
        <Panel label={t('pvp.create')}>
          <h2 className="pvp-title">{t('pvp.create')}</h2>
          <p className="pvp-hint">{t('pvp.create.hint')}</p>
          <Button
            size="large"
            disabled={busy || !ready}
            onClick={() => {
              void create();
            }}
          >
            {t('pvp.create.go')}
          </Button>
        </Panel>
        <Panel label={t('pvp.join')}>
          <h2 className="pvp-title">{t('pvp.join')}</h2>
          <p className="pvp-hint">{t('pvp.join.hint')}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (normalized !== null) go({ name: 'pvp_room', code: normalized });
            }}
          >
            <input
              className="pvp-code-input"
              aria-label={t('pvp.join.code')}
              value={code}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
            />
            <Button type="submit" size="large" disabled={normalized === null || !ready}>
              {t('pvp.join.go')}
            </Button>
          </form>
        </Panel>
      </div>
      {error !== null && (
        <p className="pvp-error" role="alert">
          {error}
        </p>
      )}
    </Screen>
  );
}
