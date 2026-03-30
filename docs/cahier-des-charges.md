# Cahier des charges - Extension VS Code Laravel Logs

## 1) Objectif produit
Construire une extension VS Code qui permet de visualiser et analyser les logs Laravel de manière fluide, lisible et performante, même sur de gros volumes.

## 2) Principes de conception
- SOLID: séparation claire entre domaine, application, infrastructure et UI.
- DRY: mutualiser parsing, filtrage, tri, indexation et formats d'affichage.
- YAGNI: implémenter uniquement les besoins validés de la roadmap.
- Least Astonishment: comportements prévisibles, raccourcis et actions explicites.
- Testability: logique métier testable hors UI VS Code.

## 3) Périmètre fonctionnel (MVP+)

### 3.1 Vue principale unique
L'interface contient 3 zones:
- Barre de filtres (haut):
  - Recherche texte
  - Niveau (ERROR, WARNING, INFO)
  - Date début / fin
  - Presets de date: 15 min, 1h, 24h, Custom
- Liste de logs (centre):
  - Virtualisée
  - Défilement ultra fluide
  - Compteur live de résultats
- Panneau de détail (droite):
  - Stack trace
  - Contexte JSON
  - Action de copie inline au survol de chaque bloc de détail
- Sidebar VS Code:
  - Action `Open Logs Viewer`
  - Barre de recherche au-dessus de la liste
  - Liste live des logs du plus recent au plus ancien
  - Clic sur une entree pour ouvrir un onglet UI de details

### 3.2 Recherche, filtres, tri
- Filtre combiné: texte + niveau + plage de date.
- Recherche instantanée avec debounce 150-200 ms.
- Compteur de résultats en temps réel (ex: "324 résultats").
- Tri ascendant / descendant par date.
- Highlight des termes recherchés.
- Highlight d'identifiants utiles (request id, user id, job id).

### 3.3 Temps réel et persistance
- Mode tail avec auto-refresh.
- Réouverture sans friction sur le dernier fichier actif.
- Import manuel d'un fichier de log hors workspace.
- Collage direct de logs bruts pour formatage et inspection.
- Lors du passage a une source importee ou collee, ne pas masquer les entrees avec le preset date workspace par defaut; restaurer le filtre date workspace au retour.

### 3.4 Gestion multi-fichiers
- Support de `laravel.log` et `laravel-*.log`.
- Fusion chronologique des entrées issues de plusieurs fichiers.

### 3.5 États UX explicites
- `indexing...`
- `live`
- `file too large`
- `no match`

## 4) Exigences techniques et performance

### 4.1 Parsing et indexation
- Parsing en streaming (pas de chargement complet en mémoire).
- Index local léger:
  - index date/level/offset
  - FTS optionnel pour gros volumes
- Worker thread dédié parsing/indexation pour éviter de bloquer l'UI.
- Invalidation incrémentale quand les fichiers grandissent (append-only optimisé).

### 4.2 UI
- Webview VS Code avec virtualisation de liste (ex: react-window).
- Temps de réponse cible interaction (filtre/recherche) perçu comme instantané.
- Design sobre et contrasté; niveaux colorés cohérents.
- Feedback visuel explicite sur les actions utilisateur critiques (copie, source active).

## 5) Architecture cible
- `domain`: entités log, règles de filtrage, tri, modèles de vue.
- `application`: cas d'usage (charger, filtrer, trier, tail, charger depuis fichier ou texte).
- `infrastructure`:
  - lecture fichiers
  - parser Laravel
  - index local
  - import et parsing de texte colle
- `presentation`:
  - extension host (commands, lifecycle)
  - webview UI
  - pont de messages extension <-> webview

## 6) Contraintes qualité
- Code TypeScript strict.
- Linting et formatage automatisés.
- Tests unitaires sur parser, filtres, tri, merge multi-fichiers.
- Tests d'intégration sur workflow principal (open -> index -> filter -> detail).
- Logging interne de diagnostic (niveau debug configurable).

## 7) Critères d'acceptation MVP
- Ouvrir un fichier Laravel et afficher les logs en moins de 2 s sur fichier moyen.
- Rechercher un terme avec debounce et mettre à jour résultats sans freeze.
- Filtrer par niveau et plage de date correctement.
- Basculer tri asc/desc immédiatement.
- Afficher détail complet d'une ligne sélectionnée.
- Mode tail fonctionnel sur append de nouvelles lignes.

## 8) Hors périmètre immédiat
- Alerting externe (Slack, email).
- Édition des logs.
- Agrégation distante (S3/ELK/CloudWatch) en première version.

## 9) Roadmap indicative
- Phase 1: socle extension + UI 3 panneaux + parser simple + filtres basiques.
- Phase 2: indexation performante + worker + virtualisation complète.
- Phase 3: tail live + import manuel/collage + multi-fichiers fusionnés.
- Phase 4: optimisation gros volumes + FTS optionnel + stabilisation tests.
