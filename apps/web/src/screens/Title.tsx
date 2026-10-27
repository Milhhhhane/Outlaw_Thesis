import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../account/AccountProvider';
import { AuthWindow, PrivacyWindow, SyncBadge } from '../account/windows';
import { Diorama } from '../art/Diorama';
import { fullscreenAvailable, isInstalled, toggleFullscreen } from '../game/fullscreen';
import { useGame } from '../game/nav';
import { Button, Window } from '../game/ui';
import { t } from '../i18n';
import { hasSave } from '../save/storage';
import { useProfile } from '../state/profile';

/** Écran-titre : le camp au crépuscule, le logo et le menu principal. */
export function Title() {
  const { go, openOptions, toggleTestMode, version } = useGame();
  const { profile, reset } = useProfile();
  const [saved] = useState(hasSave);
  const [confirm, setConfirm] = useState(false);
  const account = useAccount();
  const status = account?.status ?? 'unavailable';
  const signed = status === 'signed' && account?.pseudo != null;
  const [auth, setAuth] = useState<'login' | 'register' | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const canFullscreen = fullscreenAvailable();

  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <main className="title">
      <div className="title__scene">
        <Diorama scene="ember_wastes" heroes={profile.team} cropTop={0} campfire offsetX={84} />
      </div>
      <div className="title__veil" />
      <div className="title__content">
        <h1 className="title__logo">
          <span>Outlaw</span> <span>Thesis</span>
        </h1>
        <p className="title__tagline">{t('app.tagline')}</p>
        <nav className="title__menu" aria-label={t('hub.menu.title')}>
          {signed ? (
            <Button
              ref={first}
              size="large"
              onClick={() => {
                go({ name: 'hub' });
              }}
            >
              {t('account.continue', { pseudo: account.pseudo })}
            </Button>
          ) : (
            <Button
              ref={first}
              size="large"
              onClick={() => {
                go({ name: 'hub' });
              }}
            >
              {saved ? t('title.continue') : t('account.guest')}
            </Button>
          )}
          {status === 'guest' && (
            <div className="title__row">
              <Button
                variant="quiet"
                onClick={() => {
                  setAuth('login');
                }}
              >
                {t('account.login')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setAuth('register');
                }}
              >
                {t('account.register')}
              </Button>
            </div>
          )}
          {saved && !signed && (
            <Button
              variant="quiet"
              onClick={() => {
                setConfirm(true);
              }}
            >
              {t('title.new')}
            </Button>
          )}
          <div className="title__small">
            <Button variant="quiet" size="small" onClick={toggleTestMode}>
              {t('title.test')}
            </Button>
            <Button variant="quiet" size="small" icon="gear" onClick={openOptions}>
              {t('title.options')}
            </Button>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                go({ name: 'credits' });
              }}
            >
              {t('title.credits')}
            </Button>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                setPrivacy(true);
              }}
            >
              {t('account.privacy.short')}
            </Button>
          </div>
        </nav>
        {status === 'unavailable' && <p className="hint">{t('account.unavailable')}</p>}
      </div>
      <footer className="title__foot">
        <span>{t('home.version', { version })}</span>
        <SyncBadge />
        {canFullscreen ? (
          <Button
            variant="quiet"
            size="small"
            icon="fullscreen"
            onClick={() => {
              void toggleFullscreen();
            }}
          >
            {t('title.fullscreen')}
          </Button>
        ) : (
          !isInstalled() && <span className="title__install">{t('title.install')}</span>
        )}
      </footer>
      {auth !== null && (
        <AuthWindow
          initial={auth}
          onClose={() => {
            setAuth(null);
          }}
          onPrivacy={() => {
            setPrivacy(true);
          }}
        />
      )}
      {privacy && (
        <PrivacyWindow
          onClose={() => {
            setPrivacy(false);
          }}
        />
      )}
      {confirm && (
        <Window
          title={t('title.new')}
          onClose={() => {
            setConfirm(false);
          }}
          actions={
            <>
              <Button
                variant="quiet"
                onClick={() => {
                  setConfirm(false);
                }}
              >
                {t('ui.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  reset();
                  go({ name: 'hub' });
                }}
              >
                {t('title.new.yes')}
              </Button>
            </>
          }
        >
          <p>{t('title.new.confirm')}</p>
        </Window>
      )}
    </main>
  );
}
