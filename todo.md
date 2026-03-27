# TODO - Extension VS Code Laravel Logs

## Phase 0 - Cadrage et socle
- [x] Rédiger le cahier des charges produit/technique.
- [x] Définir les principes qualité: SOLID, DRY, YAGNI, testabilité.
- [x] Initialiser le projet extension VS Code TypeScript.
- [x] Configurer CI locale minimale (lint + build + tests).

## Phase 1 - Fondations backend (extension host)
- [x] Modéliser le domaine (`LogEntry`, `LogLevel`, `LogFilter`, `SavedView`).
- [x] Implémenter le parser Laravel (lignes multi-lignes, stack traces).
- [x] Implémenter la lecture streaming et extraction append-only.
- [x] Implémenter un index léger (date/level/offset).
- [x] Exposer les cas d'usage applicatifs (charger, filtrer, trier, tail).

## Phase 2 - UI webview
- [x] Créer la vue principale 3 zones (filtres / liste / détail).
- [x] Ajouter recherche avec debounce 150-200 ms.
- [x] Ajouter chips de niveaux + presets de dates.
- [x] Intégrer virtualisation de la liste (gros volumes).
- [x] Implémenter panneau détail (stack trace, JSON, copy).

## Phase 3 - Fonctionnalités avancées
- [x] Ajouter fusion chronologique multi-fichiers (`laravel.log`, `laravel-*.log`).
- [x] Ajouter mode live tail avec auto-refresh.
- [x] Ajouter highlights (termes + IDs request/user/job).
- [x] Ajouter import manuel de fichier log.
- [x] Ajouter collage direct de logs a formater.
- [x] Corriger le preset par defaut sur `24h` avec plages pre-remplies.
- [x] Ajouter feedback visuel sur les actions de copie.
- [x] Rendre la webview plus robuste en responsive.

## Phase 4 - Qualité et robustesse
- [x] Écrire tests unitaires parser/filtres/tri/fusion.
- [x] Écrire tests d'intégration flux principal.
- [x] Mesurer performance (latence filtre, mémoire, fps scroll).
- [x] Gérer états explicites (`indexing`, `live`, `file too large`, `no match`).
- [x] Finaliser packaging VSIX et documentation utilisateur.
