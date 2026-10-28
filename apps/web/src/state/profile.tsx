import type { Profile } from '@outlaw/data';
import { mergeItems, newProfile, rollQuests, type Outcome, type Refusal } from '@outlaw/engine';
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
import { useAccount } from '../account/AccountProvider';
import { content } from '../combat/session';
import { clearSave, loadProfile, saveProfile } from '../save/storage';

interface ProfileApi {
  readonly profile: Profile;
  /** Applique un changement calculé par le moteur ; un refus est gardé pour l'affichage. */
  readonly apply: (outcome: Outcome) => boolean;
  readonly replace: (profile: Profile) => void;
  readonly refusal: Refusal | null;
  readonly dismiss: () => void;
  readonly recovered: boolean;
  readonly reset: () => void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileProvider({
  children,
  initial,
  persist = true,
}: {
  children: ReactNode;
  initial?: Profile;
  /** Faux en mode test : rien n'est sauvegardé. */
  persist?: boolean;
}) {
  const [loaded] = useState(() =>
    initial === undefined
      ? loadProfile(content, Date.now())
      : { profile: initial, recovered: false },
  );
  // Les anciennes sauvegardes avaient plusieurs exemplaires par objet : ils deviennent des copies.
  // Les quêtes passent à la période courante au chargement, puis toutes les 30 s et à chaque action.
  const [profile, setProfile] = useState<Profile>(() =>
    rollQuests(content, mergeItems(loaded.profile), Date.now()),
  );
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const account = useAccount();
  const changed = account?.changed;
  const synced = useRef(profile);
  useEffect(() => {
    if (!persist) return;
    saveProfile(profile);
    // Le profil chargé au montage n'est pas un changement : seuls les suivants se synchronisent.
    if (profile !== synced.current) {
      synced.current = profile;
      changed?.();
    }
  }, [profile, persist, changed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProfile((current) => rollQuests(content, current, Date.now()));
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const apply = useCallback((outcome: Outcome): boolean => {
    if (!outcome.ok) {
      setRefusal(outcome.reason);
      return false;
    }
    setRefusal(null);
    // Une action faite après minuit compte pour le nouveau jour : départ = profil d'avant l'action.
    setProfile((before) => rollQuests(content, outcome.value, Date.now(), before));
    return true;
  }, []);

  const api = useMemo<ProfileApi>(
    () => ({
      profile,
      apply,
      replace: (next) => {
        setProfile(mergeItems(next));
      },
      refusal,
      dismiss: () => {
        setRefusal(null);
      },
      recovered: loaded.recovered,
      reset: () => {
        clearSave();
        setProfile(newProfile(content, Math.floor(Date.now() % 2 ** 31), Date.now()));
      },
    }),
    [profile, apply, refusal, loaded.recovered],
  );
  return <ProfileContext.Provider value={api}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const api = useContext(ProfileContext);
  if (api === null) throw new Error('useProfile hors de ProfileProvider');
  return api;
}
