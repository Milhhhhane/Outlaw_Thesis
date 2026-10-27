import { useEffect, useRef, useState } from 'react';
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
          {saved && (
            <Button
              ref={first}
              size="large"
              onClick={() => {
                go({ name: 'hub' });
              }}
            >
              {t('title.continue')}
            </Button>
          )}
          <Button
            ref={saved ? undefined : first}
            size="large"
            variant={saved ? 'quiet' : 'primary'}
            onClick={() => {
              if (saved) setConfirm(true);
              else go({ name: 'hub' });
            }}
          >
            {t('title.new')}
          </Button>
          <Button variant="quiet" onClick={toggleTestMode}>
            {t('title.test')}
          </Button>
          <Button variant="quiet" icon="gear" onClick={openOptions}>
            {t('title.options')}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              go({ name: 'credits' });
            }}
          >
            {t('title.credits')}
          </Button>
        </nav>
      </div>
      <footer className="title__foot">
        <span>{t('home.version', { version })}</span>
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
