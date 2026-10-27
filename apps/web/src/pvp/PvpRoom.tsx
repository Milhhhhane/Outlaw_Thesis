import { useCallback } from 'react';
import { useAccount } from '../account/AccountProvider';
import { useGame } from '../game/nav';
import { Button, Panel, Screen } from '../game/ui';
import { t, tk } from '../i18n';
import { Lobby } from './Lobby';
import { PvpBattle } from './PvpBattle';
import { usePvpSession } from './session';

/** Un salon, de la connexion à la revanche. Il faut un compte : le salon lit la sauvegarde en ligne. */
export function PvpRoom({ code }: { readonly code: string }) {
  const { go } = useGame();
  const account = useAccount();
  if (account?.status === 'signed') return <LiveRoom code={code} pseudo={account.pseudo ?? ''} />;
  const back = (): void => {
    go({ name: 'pvp' });
  };
  return (
    <Screen title={t('pvp.room.title', { code })} onBack={back} resources={false}>
      {account === null || account.status === 'loading' ? (
        <p role="status">{t('pvp.room.connecting')}</p>
      ) : (
        <Panel>
          <p>{account.status === 'unavailable' ? t('pvp.unavailable') : t('pvp.signin')}</p>
          <Button onClick={back}>{t('pvp.closed.back')}</Button>
        </Panel>
      )}
    </Screen>
  );
}

/** Salle d'attente, combat, fin : tout ce qui se passe une fois connecté. */
function LiveRoom({ code, pseudo }: { readonly code: string; readonly pseudo: string }) {
  const { go } = useGame();
  const { state, send, emote, dismiss } = usePvpSession(code);

  const leave = useCallback((): void => {
    send({ type: 'leave' });
    go({ name: 'pvp' });
  }, [send, go]);

  if (state.link === 'closed') {
    const cause = state.cause ?? 'unreachable';
    return (
      <Screen
        title={t('pvp.closed.title')}
        onBack={() => {
          go({ name: 'pvp' });
        }}
        resources={false}
      >
        <Panel>
          <p role="alert">{tk(`pvp.closed.${cause}`)}</p>
          <Button
            onClick={() => {
              go({ name: 'pvp' });
            }}
          >
            {t('pvp.closed.back')}
          </Button>
        </Panel>
      </Screen>
    );
  }

  const room = state.room;
  if (room === null) {
    return (
      <Screen title={t('pvp.room.title', { code })} onBack={leave} resources={false}>
        <p role="status">{t('pvp.room.connecting')}</p>
      </Screen>
    );
  }

  if (room.phase === 'lobby') {
    return (
      <Lobby
        code={code}
        state={state}
        room={room}
        send={send}
        onDismiss={dismiss}
        onLeave={leave}
        pseudo={pseudo}
      />
    );
  }

  if (state.start === null) {
    return (
      <Screen title={t('pvp.room.title', { code })} onBack={leave} resources={false}>
        <p role="status">{t('pvp.room.loading')}</p>
      </Screen>
    );
  }

  return (
    <PvpBattle
      key={state.battleId}
      state={state}
      send={send}
      onEmote={emote}
      onDismiss={dismiss}
      onLeave={leave}
      pseudo={pseudo}
    />
  );
}
