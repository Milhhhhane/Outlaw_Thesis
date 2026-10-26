import type { Profile } from '@outlaw/data';
import { newProfile, type Outcome, type Refusal } from '@outlaw/engine';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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

export function ProfileProvider({ children, initial }: { children: ReactNode; initial?: Profile }) {
  const [loaded] = useState(() =>
    initial === undefined
      ? loadProfile(content, Date.now())
      : { profile: initial, recovered: false },
  );
  const [profile, setProfile] = useState<Profile>(loaded.profile);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const apply = useCallback((outcome: Outcome): boolean => {
    if (!outcome.ok) {
      setRefusal(outcome.reason);
      return false;
    }
    setRefusal(null);
    setProfile(outcome.value);
    return true;
  }, []);

  const api = useMemo<ProfileApi>(
    () => ({
      profile,
      apply,
      replace: setProfile,
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
