---
name: Sobriété Institutionnelle Territoriale
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444650'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757681'
  outline-variant: '#c5c6d1'
  surface-tint: '#465c9a'
  primary: '#001645'
  on-primary: '#ffffff'
  primary-container: '#0f2a66'
  on-primary-container: '#7e93d5'
  inverse-primary: '#b3c5ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#0b1a2c'
  on-tertiary: '#ffffff'
  tertiary-container: '#212f41'
  on-tertiary-container: '#8897ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#00184a'
  on-primary-fixed-variant: '#2d4480'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  numeric-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

Ce système de design s'adresse aux gestionnaires fonciers, directeurs des finances et administrateurs du patrimoine au sein des collectivités territoriales (villes, métropoles, départements, régions). Il régit des opérations administratives et juridiques à fort enjeu : conventions d'occupation, baux emphytéotiques, suivi des charges locatives, ventilation budgétaire et révisions d'indices (ILC/ICC/ILAT).

La posture esthétique repose sur une **sobriété institutionnelle contemporaine**, inspirée de la rigueur fonctionnelle du Système de Design de l'État (DSFR) sans son austérité brute. L'interface incarne la fiabilité de la puissance publique : calme, prévisible, hautement dense et exempte de fioritures décoratives. 

Principes stylistiques cardinaux :
- **Clarté documentaire :** L'interface traite les données comme des documents d'archives vivants. Les hiérarchies visuelles sont nettes et les découpages fonctionnels immédiats.
- **Densité d'information maîtrisée :** Optimisation stricte des hauteurs de ligne et des marges pour afficher des fiches complexes et des répertoires patrimoniaux sans défilement superflu.
- **Précision juridique et statutaire :** Traitement scrupuleux des états administratifs, des incertitudes techniques (réserves DSF / transmissions comptables) et de la traçabilité des modifications.

## Colors

La palette chromatique est résolument institutionnelle, dominée par des tonalités froides et stables, compensées par des neutres ardoisés et des signaux d'alerte métier rigoureusement proportionnés.

### Rôles des couleurs
- **Primaire (`#0F2A66`) :** Bleu institutionnel profond. Réservé aux éléments directeurs d'autorité : barre de navigation supérieure, boutons d'action principale, en-têtes de fiches dossiers et jalons temporels majeurs.
- **Secondaire (`#2563EB`) :** Bleu ardoise actif. Dévolu aux hyperliens interactifs, aux onglets actifs, aux sélections de lignes dans les grilles et aux états de focus accessibles.
- **Tertiaire (`#475569`) :** Gris ardoise médian. Utilisé pour les étiquettes de métadonnées, le texte secondaire, les sous-titres et les bordures de niveau supérieur.
- **Neutre & Surfaces :**
  - Fond d'application (Canvas) : `#F8FAFC` (ardoise ultra-léger).
  - Fond de surface (Cartes, Tableaux) : `#FFFFFF`.
  - Fond d'alternance et en-têtes : `#F1F5F9`.
  - Bordures de structure : `#E2E8F0`.
  - Bordures d'accentuation / séparateurs internes : `#CBD5E1`.

### Accents d'état et d'alerte métier
Ces couleurs ne sont jamais utilisées à des fins décoratives. Elles portent une valeur juridique ou opérationnelle :
- **Succès / Validé (`#16A34A`) :** Baux signés, quittances générées, contrôles conformes. Fond de pastille : `#DCFCE7`.
- **Avertissement / Réserves d'instruction (`#D97706`) :** Règle métier à confirmer, révision d'indice imminente, délai d'échéance à 90 jours. Fond de pastille : `#FEF3C7`.
- **Anomalie / Contentieux (`#DC2626`) :** Impayés, forclusion, validation DSF bloquée, incohérence comptable. Fond de pastille : `#FEE2E2`.
- **Note technique / Interfaçage (`#4F46E5`) :** Encarts réservés aux échanges tiers (ex. DSF, progiciels comptables type SEDIT-FILIEN). Fond de pastille : `#EEF2FF`.

## Typography

Le système utilise **Inter** sur l'ensemble de ses niveaux hiérarchiques. Sa neutralité géométrique, ses compte-poinçons ouverts et la richesse de ses fonctionnalités OpenType en font l'équivalent numérique standardisé de la typographie administrative contemporaine.

### Règles typographiques impératives
- **Chiffres tabulaires :** Pour les montants monétaires (loyers, charges, garanties, dépôts), surfaces cadastrales et dates d'échéance, la fonction CSS `font-variant-numeric: tabular-nums` est strictement obligatoire.
- **Alignements financiers :** Tout nombre représentant un montant ou une superficie dans un tableau doit être justifié à droite, avec son en-tête aligné de façon identique.
- **Sensibilité à la casse :** Les acronymes et références légales (ex. *ERP, DSF, SEDIT, TACS, CCF*) sont maintenus en capitales avec espacement normalisé (`letter-spacing: 0.02em`). Les intitulés de statut n'utilisent jamais de tout-en-capitales agressif, mais une casse de phrase (*Sentence case*) ou de titre mesurée.

## Layout & Spacing

Le modèle d'agencement est conçu pour des postes de travail bureautiques professionnels (écrans 1080p et 1440p en environnement double écran de collectivité) tout en garantissant une consultation fonctionnelle sur ordinateur portable (13-14 pouces).

### Grille et structure
- **Architecture d'écran :**
  - Rail ou colonne latérale gauche fixe (navigation modulaire de la collectivité) : largeur 260px.
  - Bandeau contextuel supérieur fixe (recherche de tiers, sélecteur d'exercice budgétaire, notifications) : hauteur 56px.
  - Conteneur de travail : grille fluide à 12 colonnes, marge externe fixe de `2rem` sur grand écran et `1rem` sur petit écran.
- **Régularité des pas :** Basé sur une grille stricte de 4px / 8px.
  - `space-xs` (4px) : Écart entre icônes et étiquettes, micro-espacement de pastilles.
  - `space-sm` (8px) : Rapprochement étiquette/champ de saisie, espacement des puces de filtres.
  - `space-md` (12px) : Remplissage interne standard des cellules de tableaux denses et contrôles de saisie.
  - `space-lg` (20px) : Remplissage interne des panneaux d'information et cartes de gestion.
  - `space-xl` (32px) : Séparation nette entre grands ensembles fonctionnels (ex. bloc contractuel vs historique d'audit).

## Elevation & Depth

Le design system privilégie une **profondeur plate à contours structurels** (*Low-contrast outlines & tonal layering*), évitant les ombres portées douces ou floues qui encombrent visuellement les interfaces de gestion à haute concentration de données.

- **Niveau 0 (Fond de toile) :** `#F8FAFC`. Fond général de l'espace de travail.
- **Niveau 1 (Surfaces de travail - Cartes, tableaux, volets) :** Fond `#FFFFFF` ceinturé d'une bordure fine de 1px `#E2E8F0`. Aucune ombre portée au repos.
- **Niveau 2 (Surfaces interactives et survol) :** Fond `#FFFFFF` avec bordure `#CBD5E1` et une ombre de contact très atténuée : `0 1px 3px 0 rgba(15, 42, 102, 0.06), 0 1px 2px -1px rgba(15, 42, 102, 0.04)`.
- **Niveau 3 (Menus contextuels, sélecteurs déroulants, popovers d'audit) :** Fond `#FFFFFF`, bordure `#CBD5E1`, ombre portée nette : `0 4px 6px -1px rgba(15, 42, 102, 0.08), 0 2px 4px -2px rgba(15, 42, 102, 0.06)`.
- **Niveau 4 (Fenêtres modales d'approbation et tiroirs latéraux de saisie) :** Fond `#FFFFFF`, bordure `#94A3B8`, ombre d'élévation institutionnelle : `0 10px 15px -3px rgba(15, 42, 102, 0.12), 0 4px 6px -4px rgba(15, 42, 102, 0.08)`.

## Shapes

Le langage des formes adopte un niveau **doux et structuré (Soft - `1`)**, garantissant un aspect net, ordonné et institutionnel. Les formes circulaires ou trop arrondies ("pill-shaped") sont exclues des conteneurs fonctionnels pour préserver l'alignement géométrique strict des tableaux et formulaires administratifs.

- Rayon par défaut (`rounded-sm` / 2px) : Badges de statut, barres de progression, indicateurs techniques.
- Rayon standard (`rounded` / 4px) : Champs de formulaire, boutons d'action, onglets, en-têtes de table.
- Rayon conteneur (`rounded-md` / 6px) : Cartes d'information, panneaux d'audit, blocs d'alerte métier.
- Rayon maximal (`rounded-lg` / 8px) : Uniquement pour les fenêtres modales et les conteneurs d'écrans autonomes.

## Components

### 1. Boutons & Actions de validation
- **Bouton Primaire :** Fond `#0F2A66`, texte blanc, rayon 4px, typographie `label-md`. Hauteur : 36px (taille standard métier) ou 30px (en ligne dans un tableau). Au survol : fond `#1E3A8A`. Au focus : anneau double de 2px en `#2563EB`.
- **Bouton Secondaire :** Fond `#FFFFFF`, bordure 1px `#CBD5E1`, texte `#0F2A66`. Au survol : fond `#F1F5F9`.
- **Bouton Tertiaire / Discret :** Fond transparent, texte `#475569`. Au survol : fond `#F1F5F9`.
- **Bouton Destructeur (Contentieux / Résiliation) :** Fond `#FFFFFF`, bordure `#DC2626`, texte `#DC2626`. Au survol : fond `#FEE2E2`.

### 2. Tableaux de données denses (Data Grids patrimoniaux)
- **Structure :** En-têtes sur fond `#F1F5F9`, bordure basse 2px `#CBD5E1`. Typographie des colonnes : `label-sm` en majuscules discrètes (`color: #475569`). Hauteur de ligne d'en-tête : 36px.
- **Lignes de données :** Hauteur de 40px en mode dense. Séparateur horizontal 1px `#E2E8F0`. Survol de ligne : `#F8FAFC`. Sélection de ligne : bande bleue de 3px à gauche (`#2563EB`) et fond `#EFF6FF`.
- **Colonnes financières et cadastrales :** Typographie `numeric-tabular`, alignement strict à droite. Les symboles monétaires (€) et d'unités (m²) sont grisés (`#64748B`) pour faciliter le balayage visuel des montants.

### 3. Cartes d'information de dossier
- Conteneurs blancs avec bordure 1px `#E2E8F0`.
- **En-tête structuré :** Bande supérieure distincte avec fond `#F8FAFC`, séparateur 1px `#E2E8F0`, hauteur de 44px. Comprend l'intitulé de la section (ex. *Référence Cadastrale*, *Preneur Principal*) en `headline-sm`, complété à droite par une action contextuelle discrète ou un badge de statut.
- **Disposition interne :** Grille de clés/valeurs sur 2 ou 3 colonnes. Étiquette en `label-sm` (`#64748B`), valeur en `body-md` (`#0F172A`).

### 4. Badges de statut & Pastilles administratives
- Format compact : hauteur 22px, padding horizontal 8px, rayon 2px, police `label-sm`.
- **Bail Actif / À jour :** Texte `#15803D`, fond `#DCFCE7`, bordure 1px `#BBF7D0`.
- **En Révision / Préavis :** Texte `#B45309`, fond `#FEF3C7`, bordure 1px `#FDE68A`.
- **Impayé / Contentieux :** Texte `#B91C1C`, fond `#FEE2E2`, bordure 1px `#FECACA`.
- **Archivé / Échu :** Texte `#475569`, fond `#F1F5F9`, bordure 1px `#E2E8F0`.

### 5. Bandeaux d'avertissement & Mentions contractuelles ouvertes
Composants destinés aux règles de gestion non consolidées ou aux ponts applicatifs :
- **Bandeau de réserve métier (« Règle métier à confirmer ») :** 
  - Bordure gauche de 4px pleine en `#D97706`, fond `#FFFBEB`, bordure générale 1px `#FDE68A`.
  - Contenu : Icône de vigilance 16px, texte explicatif en `body-md` avec mention du service instructeur responsable.
- **Encart d'intégration comptable (« À spécifier avec DSF / FILIEN-SEDIT ») :**
  - Bordure gauche de 4px pleine en `#4F46E5`, fond `#EEF2FF`, bordure générale 1px `#C7D2FE`.
  - Typographie monospace légère pour les variables de flux ou codes budgétaires M57/M71 en attente de mappage.

### 6. Fil d'Ariane & Onglets de dossier
- **Fil d'Ariane :** Positionné au-dessus du titre principal. Séparateurs `/` discrets en `#94A3B8`. Liens en `body-sm` `#475569`, dernier segment actif en gras `#0F2A66`.
- **Système d'onglets :** Disposition horizontale à ras du conteneur supérieur. Pas de bordure arrondie type « capsules ». L'onglet actif se distingue par une bordure inférieure épaisse de 2px `#0F2A66`, un texte en `headline-sm` `#0F2A66`. Onglets inactifs : texte `#64748B`, survol `#0F172A`. Compteurs numériques intégrés dans une pastille neutre `#F1F5F9`.

### 7. Bloc d'audit historique & Traçabilité (Timeline)
- Fil d'Ariane vertical fin de 2px `#CBD5E1`.
- Nœuds d'événements : pastilles de 10px circulaires pleines (`#0F2A66` pour modification d'avenant, `#D97706` pour réévaluation, `#64748B` pour simple consultation).
- Structure de chaque jalon : Horodatage précis (format JJ/MM/AAAA - HH:mm) en `body-sm` gris, nom et matricule de l'agent public, description synthétique de l'acte juridique accompli avec lien vers le document PDF scellé.

### 8. Champs de saisie & Formulaires
- Hauteur 36px, fond `#FFFFFF`, bordure 1px `#CBD5E1`, rayon 4px, padding horizontal 10px.
- Étiquette positionnée systématiquement au-dessus du champ en `label-md` `#334155`, accompagnée d'un astérisque brique pour les données obligatoires.
- Indicateur de champ verrouillé par interfaçage DSF : fond `#F1F5F9`, curseur non autorisé, icône de verrou 14px à droite.