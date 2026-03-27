# Codex Instructions - Laravel Logs Viewer

## Mission
Développer une extension VS Code de visualisation de logs Laravel, orientée performance et testabilité.

## Principes d'implémentation
- Respecter SOLID, DRY, YAGNI, Least Astonishment.
- Préférer petits incréments testables.
- Isoler la logique métier du code UI/VS Code.
- Éviter les dépendances lourdes sans besoin validé.

## Architecture attendue
- `src/domain`: modèles et règles métier pures.
- `src/application`: cas d'usage et orchestration.
- `src/infrastructure`: accès fichiers, parsing, index.
- `src/presentation`: extension host + webview.

## Règles de qualité
- TypeScript strict; pas de `any` gratuit.
- Fonctions courtes, responsabilités uniques.
- Ajouter des tests unitaires lors de l'ajout de logique métier.
- Documenter les décisions techniques importantes dans `docs/`.

## Checklist avant livraison
- Build TypeScript OK.
- Lint OK.
- Pas de régression UX évidente.
- Documentation à jour (`README.md`, `todo.md`, `docs/cahier-des-charges.md`).
