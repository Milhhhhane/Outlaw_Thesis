import type { CloudSave, SaveEnvelope } from '@outlaw/accounts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { content } from '../combat/session';
import { clearSave, parseSave, SAVE_KEY } from '../save/storage';
import { api, loadContact } from './api';

/**
 * Compte et synchronisation. La partie reste locale d'abord (jouable hors ligne) ; quand un
 * joueur est connecté, chaque changement de profil est envoyé au serveur après une courte
 * temporisation. Le serveur refuse une écriture faite sur une version périmée (409) : le joueur
 * choisit alors la version à garder, rien n'est jamais écrasé en silence.
 */

export type AccountStatus = 'loading' | 'unavailable' | 'guest' | 'signed';
export type SyncState = 'synced' | 'pending' | 'offline';

export type Decision =
  { readonly kind: 'migrate' } | { readonly kind: 'conflict'; readonly cloud: CloudSave };

/** Lien entre la sauvegarde locale et un compte (aucun secret : le jeton reste dans le cookie). */
interface SyncMeta {
  readonly pseudo: string;
  /** Révision du cloud sur laquelle la partie locale est basée. */
  readonly baseRev: number;
  /** Des changements locaux n'ont pas encore été envoyés. */
  readonly dirty: boolean;
  readonly localUpdatedAt: number | null;
}

export const META_KEY = 'outlaw-thesis/account';
const PUSH_DELAY = 2_000;
const RETRY_DELAY = 30_000;

function readMeta(): SyncMeta | null {
  try {
    const raw = window.localStorage.getItem(META_KEY);
    return raw === null ? null : (JSON.parse(raw) as SyncMeta);
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null): void {
  try {
    if (meta === null) window.localStorage.removeItem(META_KEY);
    else window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Stockage bloqué : la synchronisation repartira de zéro au prochain lancement.
  }
}

/** Sauvegarde locale validée, au format de l'enveloppe envoyée au serveur. */
export function readLocal(): SaveEnvelope | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const profile = parseSave(raw, content);
    return { version: profile.version, profile };
  } catch {
    return null;
  }
}

/**
 * La partie locale a-t-elle avancé ? Le jeu enregistre un profil neuf dès l'ouverture : sans ce
 * test, chaque appareil proposerait de « migrer » une partie jamais jouée.
 */
function hasProgress(save: SaveEnvelope): boolean {
  const p = save.profile;
  return (
    p.gold > 0 ||
    p.materials.some((m) => m > 0) ||
    p.items.length > 0 ||
    Object.values(p.dungeons).some((d) => d.clears > 0) ||
    Object.values(p.heroes).some((h) => h.level > 1 || h.xp > 0 || h.talents.length > 0)
  );
}

function writeLocal(save: SaveEnvelope): boolean {
  try {
    const raw = JSON.stringify(save);
    parseSave(raw, content);
    window.localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export interface AccountApi {
  readonly status: AccountStatus;
  readonly pseudo: string | null;
  readonly mustChangePassword: boolean;
  /** Administrateur du jeu, d'après le serveur (`/api/me`) : seul cas où l'entrée existe. */
  readonly admin: boolean;
  readonly sync: SyncState;
  readonly decision: Decision | null;
  /** Date de la dernière modification locale (écran de conflit). */
  readonly localUpdatedAt: number | null;
  readonly contact: string;
  /** Change quand la sauvegarde locale a été remplacée : le profil est rechargé. */
  readonly generation: number;
  readonly login: (pseudo: string, password: string) => Promise<ErrorInfo | null>;
  readonly register: (pseudo: string, password: string) => Promise<ErrorInfo | null>;
  readonly logout: () => Promise<void>;
  readonly changePassword: (oldPassword: string, newPassword: string) => Promise<ErrorInfo | null>;
  readonly deleteAccount: (password: string) => Promise<ErrorInfo | null>;
  readonly exportData: () => Promise<ErrorInfo | null>;
  readonly resolve: (choice: 'upload' | 'fresh' | 'cloud' | 'device') => void;
  /** Appelé par le profil à chaque changement local. */
  readonly changed: () => void;
}

export interface ErrorInfo {
  readonly error: string;
  readonly retryAfter?: number;
}

const AccountContext = createContext<AccountApi | null>(null);

function errorOf(result: {
  readonly error: string;
  readonly body: Readonly<Record<string, unknown>> | null;
}): ErrorInfo {
  const retry = result.body?.retryAfter;
  return typeof retry === 'number'
    ? { error: result.error, retryAfter: retry }
    : { error: result.error };
}

export function AccountProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [pseudo, setPseudo] = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [sync, setSync] = useState<SyncState>('synced');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [generation, setGeneration] = useState(0);
  const [contact, setContact] = useState('');
  const [localUpdatedAt, setLocalUpdatedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  // Envoi différé (temporisation, nouvel essai) : passe par une référence pour rester à jour.
  const later = useRef<() => Promise<void>>(() => Promise.resolve());
  const schedule = useCallback((delay: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void later.current();
    }, delay);
  }, []);
  // État lu par les fonctions différées (minuteries, événements) sans les recréer.
  const live = useRef({ pseudo: null as string | null, blocked: true });

  const reload = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);

  const adopt = useCallback(
    (who: string, cloud: CloudSave) => {
      if (cloud.save !== null && !writeLocal(cloud.save)) {
        setSync('offline');
        return;
      }
      writeMeta({ pseudo: who, baseRev: cloud.rev, dirty: false, localUpdatedAt: cloud.updatedAt });
      setSync('synced');
      reload();
    },
    [reload],
  );

  const push = useCallback(async (): Promise<void> => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const meta = readMeta();
    const { pseudo: who, blocked } = live.current;
    if (who === null || blocked || meta?.pseudo !== who || !meta.dirty) return;
    const local = readLocal();
    if (local === null) return;
    const result = await api.putSave(meta.baseRev, local);
    if (result.ok) {
      // Un changement arrivé pendant l'envoi garde la sauvegarde « en attente ».
      const now = readMeta();
      const dirty = now?.localUpdatedAt !== meta.localUpdatedAt;
      writeMeta({ ...(now ?? meta), baseRev: result.value.rev, dirty });
      setSync(dirty ? 'pending' : 'synced');
      if (dirty) schedule(PUSH_DELAY);
    } else if (result.status === 409) {
      setDecision({ kind: 'conflict', cloud: result.body as unknown as CloudSave });
      setSync('pending');
    } else {
      setSync('offline');
      schedule(RETRY_DELAY);
    }
  }, [schedule]);

  useEffect(() => {
    later.current = push;
  }, [push]);

  /** Rattache la sauvegarde locale au compte qui vient de se connecter. */
  const link = useCallback(
    async (who: string): Promise<void> => {
      const result = await api.getSave();
      if (!result.ok) {
        setSync('offline');
        return;
      }
      const cloud = result.value;
      const meta = readMeta();
      const saved = readLocal();
      const local = saved !== null && hasProgress(saved) ? saved : null;
      setLocalUpdatedAt(meta?.localUpdatedAt ?? null);
      if (meta?.pseudo === who) {
        if (meta.dirty) {
          if (cloud.rev === meta.baseRev) await push();
          else setDecision({ kind: 'conflict', cloud });
        } else if (cloud.rev !== meta.baseRev) adopt(who, cloud);
        else setSync('synced');
        return;
      }
      // Partie jouée en invité (ou par un autre compte) sur cet appareil.
      if (local === null) {
        if (cloud.save !== null) adopt(who, cloud);
        else writeMeta({ pseudo: who, baseRev: cloud.rev, dirty: false, localUpdatedAt: null });
      } else if (cloud.save === null) {
        setDecision({ kind: 'migrate' });
      } else {
        setDecision({ kind: 'conflict', cloud });
      }
    },
    [adopt, push],
  );

  const signedIn = useCallback(
    async (who: string, locked: boolean, isAdmin: boolean): Promise<void> => {
      live.current = { pseudo: who, blocked: locked };
      setPseudo(who);
      setMustChange(locked);
      setAdmin(isAdmin);
      setStatus('signed');
      if (!locked) await link(who);
    },
    [link],
  );

  useEffect(() => {
    let alive = true;
    void loadContact().then((c) => {
      if (alive) setContact(c);
    });
    void api.me().then((result) => {
      if (!alive) return;
      if (result.ok) {
        const me = result.value;
        void signedIn(me.pseudo, me.mustChangePassword, me.admin);
      } else setStatus(result.error === 'offline' ? 'unavailable' : 'guest');
    });
    const online = (): void => void push();
    // En quittant la page, on tente d'envoyer ce qui attend encore.
    const hidden = (): void => {
      if (document.visibilityState === 'hidden' && timer.current !== null) void push();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive = false;
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [push, signedIn]);

  const changed = useCallback(() => {
    const { pseudo: who } = live.current;
    if (who === null) return;
    const meta = readMeta();
    const now = Date.now();
    writeMeta({
      pseudo: who,
      baseRev: meta?.pseudo === who ? meta.baseRev : 0,
      dirty: true,
      localUpdatedAt: now,
    });
    setLocalUpdatedAt(now);
    setSync('pending');
    schedule(PUSH_DELAY);
  }, [schedule]);

  const value = useMemo<AccountApi>(() => {
    const enter =
      (call: typeof api.login) =>
      async (who: string, password: string): Promise<ErrorInfo | null> => {
        const result = await call(who, password);
        if (!result.ok) return errorOf(result);
        const me = result.value;
        await signedIn(me.pseudo, me.mustChangePassword, me.admin);
        return null;
      };
    const signOut = (): void => {
      live.current = { pseudo: null, blocked: true };
      clearSave();
      writeMeta(null);
      setPseudo(null);
      setMustChange(false);
      setAdmin(false);
      setDecision(null);
      setStatus('guest');
      reload();
    };
    return {
      status,
      pseudo,
      mustChangePassword: mustChange,
      admin,
      sync,
      decision,
      localUpdatedAt,
      contact,
      generation,
      login: enter(api.login),
      register: enter(api.register),
      logout: async () => {
        await push();
        await api.logout();
        signOut();
      },
      changePassword: async (oldPassword, newPassword) => {
        const result = await api.changePassword(oldPassword, newPassword);
        if (!result.ok) return errorOf(result);
        if (mustChange && pseudo !== null) await signedIn(pseudo, false, admin);
        return null;
      },
      deleteAccount: async (password) => {
        const result = await api.deleteAccount(password);
        if (!result.ok) return errorOf(result);
        signOut();
        return null;
      },
      exportData: async () => {
        const result = await api.exportData();
        if (!result.ok) return errorOf(result);
        const blob = new Blob([JSON.stringify(result.value, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `outlaw-thesis-compte-${pseudo ?? 'export'}.json`;
        link.click();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
        return null;
      },
      resolve: (choice) => {
        if (pseudo === null || decision === null) return;
        const cloudRev = decision.kind === 'conflict' ? decision.cloud.rev : 0;
        setDecision(null);
        if (choice === 'cloud' && decision.kind === 'conflict') {
          adopt(pseudo, decision.cloud);
        } else if (choice === 'fresh') {
          clearSave();
          writeMeta({ pseudo, baseRev: cloudRev, dirty: false, localUpdatedAt: null });
          reload();
        } else {
          // « Envoyer » ou « garder cet appareil » : la version locale part sur le cloud.
          writeMeta({ pseudo, baseRev: cloudRev, dirty: true, localUpdatedAt: Date.now() });
          void push();
        }
      },
      changed,
    };
  }, [
    status,
    pseudo,
    mustChange,
    admin,
    sync,
    decision,
    localUpdatedAt,
    contact,
    generation,
    signedIn,
    push,
    adopt,
    reload,
    changed,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Compte courant ; null hors fournisseur (tests de composants isolés). */
export function useAccount(): AccountApi | null {
  return useContext(AccountContext);
}
