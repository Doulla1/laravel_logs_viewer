# Laravel Logs Viewer

Extension VS Code pour visualiser les logs Laravel avec une interface 3 zones, une recherche instantanee, un tail live, un import manuel de fichiers/logs colles et une fusion chronologique multi-fichiers.

## Fonctionnalites
- Barre de filtres avec recherche texte, niveaux, dates debut/fin et presets `15 min`, `1h`, `24h`, `Custom`
- Preset `24h` actif par defaut avec plage date/heure pre-remplie
- Liste centrale virtualisee pour gros volumes
- Panneau de detail avec contexte JSON, stack trace et actions de copie
- Support de `laravel.log` et `laravel-*.log`
- Import d'un fichier `.log` / `.txt` / `.json` hors workspace
- Collage direct de logs Laravel ou JSON a formater/afficher
- Refresh manuel et mode tail
- Highlight des termes recherches et des IDs `request_id`, `user_id`, `job_id`
- Avertissement `file too large`
- Feedback visuel sur les actions de copie

## Commande
- `Laravel Logs: Open Viewer`

## Configuration
- `laravelLogs.defaultGlob`: glob de recherche des fichiers Laravel
- `laravelLogs.searchDebounceMs`: debounce de recherche
- `laravelLogs.largeFileWarningMb`: seuil d'avertissement pour les gros fichiers

## Developpement
Prerequis: Node.js 18.19+ fonctionne; Node.js 20+ reste recommande.

```bash
npm install
npm run compile
npm run lint
npm test
npm run perf
npm run package:vsix
```

Lancer ensuite l'extension dans VS Code via `.vscode/launch.json`.
