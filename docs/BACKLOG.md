# Hors MVP

Idées notées, non codées.

- Serveur, comptes, synchronisation de sauvegarde entre appareils.
- Monétisation (l'énergie existe dès le MVP avec un coût de 0).
- JcJ (PvP) asynchrone.
- Stats aléatoires sur les objets.
- Éléments supplémentaires au-delà de feu, eau, nature.
- Héros au-delà des 6 du MVP.
- Application installable (PWA), mode hors ligne explicite.
- Coffres : raretés de héros (poids de tirage), garantie après n coffres sans fragment utile,
  coffres hors donjons (quêtes, événements), niveau maximum 100 avec d'autres étoiles.
- Langues autres que le français (l'i18n est prête).
- Tests de bout en bout Playwright (optionnels pour le MVP).

# À faire (demandé par le propriétaire, non codé)

## Enchaînement automatique des donjons

Demande du 28 octobre 2026, à prendre par un agent dans son propre worktree, PR avec CI verte.

1. **Supprimer la vitesse « Instantanée »** des options de combat (`options.speed`) : ne garder
   que normale et ×2. Le mode Auto reste. Une sauvegarde d'options qui dit encore `instant`
   retombe sur `fast`. Les tests e2e qui posent `speed: 'instant'` passent en `fast` (vérifier
   leur durée) ; `useBattle` / `speedFactor` perdent la branche instantanée.
2. **En mode Auto, enchaîner sans clic.** Quand Auto est actif :
   - à la fin d'un combat, la fenêtre de résultat affiche un décompte de 5 secondes puis passe
     à la salle suivante toute seule ;
   - à la fin du donjon, l'écran de récompenses affiche le même décompte de 5 secondes puis
     relance **le même donjon** (farming), avec l'équipe telle quelle ;
   - toute interaction (clic, touche, Échap) interrompt le décompte et rend la main ; une défaite
     arrête l'enchaînement ;
   - le décompte est visible (chiffre qui descend, bouton « Continuer maintenant ») et lisible
     par un lecteur d'écran (`aria-live`).
3. Garde-fous : respecter les règles de rejeu existantes (`replayRewardRate`,
   `replayChestRate`) sans les contourner ; pas d'enchaînement si l'énergie ne suffit pas ;
   Auto reste mémorisé comme aujourd'hui. Documenter dans `docs/DECISIONS.md` pourquoi 5 s et
   pourquoi on relance le même donjon plutôt que le suivant.
4. Vérifier : typecheck, lint, tests, e2e (ajouter un test « Auto enchaîne deux salles sans
   clic et relance le donjon »), `CHANGELOG.md`, `PROGRESS.md`.
