import { PSEUDO_MAX, type SaveEnvelope } from '@outlaw/accounts';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Button, Window } from '../game/ui';
import { names_, t, tk } from '../i18n';
import { readLocal, useAccount, type ErrorInfo } from './AccountProvider';
import './account.css';

/** Fenêtres des comptes : connexion, création, confidentialité, conflit, compte (Options). */

function errorText(info: ErrorInfo): string {
  const key = `account.error.${info.error}`;
  const text = tk(key, { seconds: info.retryAfter ?? 0 });
  return text === key ? t('account.error.other') : text;
}

function Field({
  label,
  hint,
  ...input
}: {
  readonly label: string;
  readonly hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" spellCheck={false} {...input} />
      {hint !== undefined && <span className="field__hint">{hint}</span>}
    </label>
  );
}

function Contact({ always = true }: { readonly always?: boolean }) {
  const contact = useAccount()?.contact ?? '';
  if (contact === '' && !always) return null;
  return (
    <p className="hint">
      {contact === ''
        ? t('account.recovery.noContact')
        : t('account.recovery.contact', { contact })}
    </p>
  );
}

function Form({
  onSubmit,
  children,
  error,
  submit,
  busy,
}: {
  readonly onSubmit: () => Promise<void>;
  readonly children: ReactNode;
  readonly error: string | null;
  readonly submit: string;
  readonly busy: boolean;
}) {
  const send = (event: { preventDefault: () => void }): void => {
    event.preventDefault();
    if (!busy) void onSubmit();
  };
  return (
    <form className="account-form" onSubmit={send} noValidate>
      {children}
      {error !== null && (
        <p className="account-form__error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? t('account.busy') : submit}
      </Button>
    </form>
  );
}

/** Connexion ou création de compte, depuis l'écran-titre. */
export function AuthWindow({
  initial,
  onClose,
  onPrivacy,
}: {
  readonly initial: 'login' | 'register';
  readonly onClose: () => void;
  readonly onPrivacy: () => void;
}) {
  const account = useAccount();
  const [mode, setMode] = useState(initial);
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  const submit = async (): Promise<void> => {
    if (account === null) return;
    if (register && !accept) {
      setError(t('account.error.accept'));
      return;
    }
    setBusy(true);
    const failure = await (register ? account.register : account.login)(pseudo.trim(), password);
    setBusy(false);
    if (failure === null) onClose();
    else setError(errorText(failure));
  };

  return (
    <Window
      title={register ? t('account.register') : t('account.login')}
      onClose={onClose}
      className="account-window"
    >
      <Form
        onSubmit={submit}
        error={error}
        busy={busy}
        submit={register ? t('account.submit.register') : t('account.submit.login')}
      >
        <Field
          label={t('account.pseudo')}
          hint={register ? t('account.pseudo.hint') : undefined}
          autoComplete="username"
          maxLength={PSEUDO_MAX}
          value={pseudo}
          onChange={(e) => {
            setPseudo(e.target.value);
          }}
        />
        <Field
          label={t('account.password')}
          hint={register ? t('account.password.hint') : undefined}
          type="password"
          autoComplete={register ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        {register && (
          <label className="check">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => {
                setAccept(e.target.checked);
              }}
            />
            <span>{t('account.recovery')}</span>
          </label>
        )}
        {register ? <Contact always={false} /> : null}
      </Form>
      <div className="account-window__links">
        <Button
          variant="ghost"
          size="small"
          onClick={() => {
            setMode(register ? 'login' : 'register');
            setError(null);
          }}
        >
          {register ? t('account.switch.toLogin') : t('account.switch.toRegister')}
        </Button>
        <Button variant="ghost" size="small" onClick={onPrivacy}>
          {t('account.privacy')}
        </Button>
      </div>
    </Window>
  );
}

const SECTIONS = ['what', 'logs', 'rights', 'recovery', 'terms'] as const;

/** Page « Confidentialité et conditions » (brouillon à faire valider). */
export function PrivacyWindow({ onClose }: { readonly onClose: () => void }) {
  return (
    <Window title={t('privacy.title')} onClose={onClose} className="privacy">
      <p className="privacy__draft">{t('privacy.draft')}</p>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h3>{tk(`privacy.${section}.title`)}</h3>
          {section === 'what' ? (
            <>
              <p>{t('privacy.what.guest')}</p>
              <p>{t('privacy.what.account')}</p>
              <p>{t('privacy.what.admin')}</p>
              <p>{t('privacy.what.session')}</p>
              <p>{t('privacy.what.none')}</p>
            </>
          ) : (
            <p>{tk(`privacy.${section}.text`)}</p>
          )}
        </section>
      ))}
      <Contact />
    </Window>
  );
}

const dateFormat = new Intl.DateTimeFormat('fr', { dateStyle: 'short', timeStyle: 'short' });

function Version({
  title,
  save,
  date,
  onKeep,
}: {
  readonly title: string;
  readonly save: SaveEnvelope | null;
  readonly date: number | null;
  readonly onKeep: () => void;
}) {
  const profile = save?.profile;
  const heroes = Object.entries(profile?.heroes ?? {})
    .map(([id, h]) => `${names_.hero(id)} ${String(h.level)}`)
    .join(', ');
  const clears = Object.values(profile?.dungeons ?? {}).reduce((n, d) => n + d.clears, 0);
  return (
    <section className="version" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {date === null
          ? t('account.conflict.noDate')
          : t('account.conflict.date', { date: dateFormat.format(date) })}
      </p>
      <p>{t('account.conflict.heroes', { heroes: heroes === '' ? '—' : heroes })}</p>
      <p>
        {t('account.conflict.resources', {
          gold: profile?.gold ?? 0,
          materials: (profile?.materials ?? [0, 0, 0]).join(' / '),
        })}
      </p>
      <p>{t('account.conflict.clears', { count: clears })}</p>
      <Button onClick={onKeep}>{t('account.conflict.keep')}</Button>
    </section>
  );
}

/** Changement de mot de passe ; `forced` après une réinitialisation par le créateur. */
function PasswordForm({
  forced,
  onDone,
}: {
  readonly forced: boolean;
  readonly onDone: () => void;
}) {
  const account = useAccount();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (account === null) return;
    setBusy(true);
    const failure = await account.changePassword(oldPassword, newPassword);
    setBusy(false);
    if (failure === null) onDone();
    else setError(errorText(failure));
  };
  return (
    <Form onSubmit={submit} error={error} busy={busy} submit={t('account.changePassword')}>
      {forced && <p>{t('account.changePassword.forced')}</p>}
      <Field
        label={t('account.password.old')}
        type="password"
        autoComplete="current-password"
        value={oldPassword}
        onChange={(e) => {
          setOld(e.target.value);
        }}
      />
      <Field
        label={t('account.password.new')}
        hint={t('account.password.hint')}
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => {
          setNew(e.target.value);
        }}
      />
    </Form>
  );
}

/** Fenêtres imposées : nouveau mot de passe exigé, migration ou conflit de sauvegarde. */
export function AccountOverlays() {
  const account = useAccount();
  if (account === null || account.status !== 'signed') return null;
  if (account.mustChangePassword) {
    return (
      <Window title={t('account.changePassword')} className="account-window">
        <PasswordForm forced onDone={() => undefined} />
      </Window>
    );
  }
  const { decision } = account;
  if (decision === null) return null;
  if (decision.kind === 'migrate') {
    return (
      <Window title={t('account.migrate.title')}>
        <p>{t('account.migrate.text')}</p>
        <div className="options__buttons">
          <Button
            onClick={() => {
              account.resolve('upload');
            }}
          >
            {t('account.migrate.upload')}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              account.resolve('fresh');
            }}
          >
            {t('account.migrate.fresh')}
          </Button>
        </div>
      </Window>
    );
  }
  return (
    <Window title={t('account.conflict.title')} className="conflict">
      <p>{t('account.conflict.text')}</p>
      <div className="versions">
        <Version
          title={t('account.conflict.cloud')}
          save={decision.cloud.save}
          date={decision.cloud.updatedAt}
          onKeep={() => {
            account.resolve('cloud');
          }}
        />
        <Version
          title={t('account.conflict.device')}
          save={readLocal()}
          date={account.localUpdatedAt}
          onKeep={() => {
            account.resolve('device');
          }}
        />
      </div>
    </Window>
  );
}

/** Indicateur de synchronisation, affiché au camp et sur l'écran-titre. */
export function SyncBadge() {
  const account = useAccount();
  if (account?.status !== 'signed' || account.mustChangePassword) return null;
  const state = tk(`account.sync.${account.sync}`);
  return (
    <span
      className={`sync-badge sync-badge--${account.sync}`}
      role="status"
      aria-label={t('account.sync.label', { state })}
    >
      {state}
    </span>
  );
}

/** Section « Compte » des Options. */
export function AccountSection() {
  const account = useAccount();
  const [panel, setPanel] = useState<'password' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (account === null || account.status !== 'signed' || account.pseudo === null) {
    return <p className="hint">{t('account.notSigned')}</p>;
  }
  const close = (): void => {
    setPanel(null);
    setPassword('');
    setError(null);
  };
  return (
    <div className="account-section">
      <p>{t('account.signedAs', { pseudo: account.pseudo })}</p>
      <div className="options__buttons">
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            setPanel('password');
          }}
        >
          {t('account.changePassword')}
        </Button>
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            void account.exportData().then((failure) => {
              if (failure !== null) setMessage(errorText(failure));
            });
          }}
        >
          {t('account.export')}
        </Button>
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            void account.logout();
          }}
        >
          {t('account.logout')}
        </Button>
        <Button
          variant="danger"
          size="small"
          onClick={() => {
            setPanel('delete');
          }}
        >
          {t('account.delete')}
        </Button>
      </div>
      {message !== null && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {panel === 'password' && (
        <Window title={t('account.changePassword')} onClose={close} className="account-window">
          <PasswordForm
            forced={false}
            onDone={() => {
              close();
              setMessage(t('account.changePassword.done'));
            }}
          />
        </Window>
      )}
      {panel === 'delete' && (
        <Window title={t('account.delete')} onClose={close} className="account-window">
          <Form
            busy={busy}
            error={error}
            submit={t('account.delete.yes')}
            onSubmit={async () => {
              setBusy(true);
              const failure = await account.deleteAccount(password);
              setBusy(false);
              if (failure !== null) setError(errorText(failure));
            }}
          >
            <p>{t('account.delete.confirm')}</p>
            <Field
              label={t('account.password')}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </Form>
        </Window>
      )}
    </div>
  );
}
