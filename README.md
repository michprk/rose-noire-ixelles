# Rose Noire — « le bouquet devient le site »

Site de **Rose Noire**, fleuriste artisanale au Châtelain : Rue Américaine 160, 1050 Ixelles
(Fleur Concept SRL, BCE 0891.549.170). Sophie compose bouquets de fleurs fraîches, fleurs
d’anniversaire, fleurs séchées et artificielles, plantes vertes, fleurs de mariage, gerbes et
couronnes ; fleurs d’accueil, événements et cadeaux d’affaires pour les entreprises. Livraison 15 €
dans les 19 communes de Bruxelles, du mardi au dimanche.

**En ligne : https://michprk.github.io/rose-noire-ixelles/**

Troisième proposition pour Rose Noire (les deux autres restent en ligne :
https://michprk.github.io/rose-noire.be/ avec la rose en verre 3D, et
https://michprk.github.io/rose-noire-bruxelles/ en version cinématique). Objectif : **convertir**,
particuliers et entreprises. Proposition de valeur dès le héros, une action principale
(« Commander un bouquet ») et une action B2B (« Devis entreprise ») répétées partout, réassurance
visible tout de suite (livraison, réponse de Sophie, facture société, Maison Blanche, ELLE…).

## L’idée : le bouquet de Sophie devient le site

À l’ouverture, Sophie tient son bouquet dans une rue ensoleillée du Châtelain (photo plein écran,
version portrait sur téléphone). Quelques pétales s’en échappent déjà au vent. Puis, au premier geste
(molette, glissé au doigt, flèche du clavier, clic sur « Faites défiler ») ou après 2,6 secondes :

1. le bouquet **se décompose pétale par pétale**, du cœur vers l’extérieur, d’abord quelques-uns
   puis très vite tous : environ 1 000 (téléphone) à 3 000 (grand écran) pétales, chacun de la
   **vraie couleur de la photo** à cet endroit, avivée une fois détaché ;
2. les pétales **tourbillonnent** autour du bouquet qui s’ouvre, pendant que la photo se dissout ;
3. chaque pétale vole vers **la tuile du site qui a sa couleur** (rose → Bouquets du jour,
   vert eucalyptus → Entreprises, mauve → Mariages & événements, crème/pêche → Livraison) : les
   tuiles se remplissent de couleur à mesure que les pétales arrivent, et le titre monte.

Environ 2,7 s en tout. Tout en haut de la page, un geste vers le haut **rejoue l’animation à
l’envers** : les pétales repartent et le bouquet se recompose dans les mains de Sophie.

Technique : `assets/js/bloom.js`, WebGL 2 écrit pour ce site (aucune bibliothèque, ~20 Ko). Toute
l’animation est une fonction d’un seul temps (secondes) : elle se joue dans les deux sens et peut
s’inspecter image par image (`__rnBloom.set(1.2)` dans la console). Sans WebGL (vieux navigateur),
la photo s’efface en fondu et les tuiles se remplissent en CSS ; avec « Réduire les animations »,
le site s’affiche directement.

## Direction artistique

- **Référence : pages produit Apple** (comme Studio 124) : grands titres serrés, beaucoup d’air,
  tuiles arrondies, une seule idée par écran — mais en couleurs, pour une fleuriste, et sans effet
  « street » : crédible pour un hôtel ou un bureau.
- **Couleurs tirées du bouquet de Sophie** : rose pivoine `#f9d3dc`, sauge `#cde4d4`, lilas
  `#e4d8fb`, pêche `#ffd8c0`, beurre `#ffeeb8`, sur un fond crème `#fff8f2`. Texte et boutons en
  aubergine presque noir `#2a0b19` (la « rose noire »), accent pivoine `#c42a6b` pour les italiques.
  Section entreprises en vert forêt `#15392c`, références en aubergine.
- **Typographies** : titres en **Instrument Sans**, mots en italique en **Instrument Serif**, et
  **toutes les petites écritures en Inria Serif** (sur-titres, étiquettes, légendes, champs du
  formulaire, mentions, pied de page). Auto-hébergées, licences dans `licenses/`.
- Contrastes vérifiés (texte secondaire 7:1, petites mentions 5:1, pivoine 5:1 sur crème).

## Structure

```
index.html              accueil : héros « bouquet → site », références, chiffres, bouquets (8 produits
                        + commande en 3 étapes), entreprises, Sophie & l’atelier, Maison Blanche et avis,
                        galerie, questions, contact (commande ou devis)
confidentialite.html    politique de confidentialité (RGPD) et cookies
cgu.html                conditions d’utilisation, mentions légales, crédits
404.html                « Cette page s’est fanée » : retrouve la bonne section depuis les anciennes
                        adresses WordPress (livraison-de-fleurs-bruxelles, cactus-bruxelles, nl/…)
partials/               blocs communs (en-tête, pied de page, cookies, icônes, <head>)
assets/css/main.css     tout le style
assets/js/boot.js       copié en ligne dans le <head> : HTTPS forcé, préférence d’animation, rideau
assets/js/bloom.js      moteur WebGL du héros (pétales)
assets/js/app.js        héros (gestes, lecture auto, retour arrière), révélations, formulaire, cookies…
assets/js/sound.js      ambiance sonore synthétisée (Web Audio), toujours active, très discrète
assets/vendor/          Lenis (défilement amorti, licence MIT)
assets/img/             photos en WebP, plusieurs tailles (srcset)
api/                    API des formulaires, hors du site : PHP (Hostinger) ou Cloudflare Workers
favicon.svg/.ico/-32.png, apple-touch-icon.png, icon-*.png, site.webmanifest, og.jpg (partage)
robots.txt, sitemap.xml, .well-known/security.txt, .htaccess, _headers
scripts/                build.sh, check-links.sh, export-hostinger.sh
```

## Modifier le site

Les blocs communs sont écrits **une seule fois** dans `partials/` puis recopiés dans chaque page
entre `<!--#include nom-->` et `<!--/include-->`. Après toute modification :

```bash
bash scripts/build.sh        # blocs communs, empreinte CSP de boot.js, versions des fichiers (?v=)
bash scripts/check-links.sh  # aucun lien ni aucune image cassés
```

Photos : originaux dans `GitHub/_rose-noire-src/wp/` ; l’outil `_rose-noire-src/tool-ix.html`
(servi en local) recadre, agrandit avec netteté, compresse en WebP et dessine `og.jpg`.
La position du bouquet dans chaque photo du héros est donnée par `data-bouquet-l` (paysage) et
`data-bouquet-p` (portrait) sur l’image : centre x, centre y, rayon x, rayon y (de 0 à 1).

## Le reste des animations

- Rideau d’ouverture « Rose Noire » (une fois par visite), qui attend que la photo soit prête.
- Défilement amorti (Lenis) ; titres qui montent ligne par ligne, cartes qui se soulèvent, chiffres
  qui comptent, lettre de la Maison Blanche qui se redresse, galerie continue qui suit le défilement,
  « Rose Noire » géant du pied de page.
- Mobile : photo portrait, pétales plus fins qui filent vers les tuiles en bas de l’écran, produits
  en carrousel au doigt, barre « Appeler / Commander » collée en bas.

Toutes les animations sont actives par défaut. « Réduire les animations » (pied de page) passe en
version statique, mémorisée (`rni_motion`). Aussi : `?motion=reduce`.

Ambiance sonore : toujours active, très basse, sans bouton (volume de l’appareil), démarre au premier
geste ; un frôlement doux quand le bouquet se décompose. Lien discret « Couper le son » en pied de page
(WCAG 1.4.2).

## Formulaire, anti-spam, API

- Deux onglets : **Commander un bouquet** (occasion, livraison 15 € ou retrait, budget, date,
  adresse, style) et **Entreprise & événement** (besoin, société, date ou rythme). Tuiles et cartes
  produits présélectionnent le bon onglet.
- Validation en français sous chaque champ (pas de livraison le lundi, date passée…), correction des
  fautes de frappe d’e-mail, erreurs annoncées aux lecteurs d’écran.
- Anti-spam : champ piège invisible, envoi refusé en moins de 3 s, une demande par minute, un seul
  lien ; côté API : contrôle d’origine, limite par adresse IP, validation serveur.
- Sans API, la messagerie du visiteur s’ouvre avec la demande pré-remplie vers
  rosenoire160@hotmail.com. Avec l’API (`api/`), renseigner `data-api` sur la balise `<html>`.

## Cookies, sécurité, référencement, vitesse

- Aucun cookie publicitaire ; bannière « Tout refuser / Personnaliser / Tout accepter » (affichée
  après l’animation du héros), « Gérer les cookies » dans le pied de page. Google Analytics 4
  seulement après accord (`data-ga`, vide pour l’instant).
- HTTPS forcé (`boot.js`, `.htaccess`, `_headers`), HSTS, CSP stricte, anti-iframe.
- Titres et descriptions uniques, Open Graph + `og.jpg` 1200 × 630, données structurées `Florist`
  et `FAQPage`, `sitemap.xml` avec images, `robots.txt`, textes alternatifs.
- Photo du héros préchargée (WebP 122 Ko en 1600 px, version portrait sur mobile), autres images
  en WebP à la bonne taille et chargées au dernier moment, aucun framework.

> La maquette est en `noindex` tant que la boutique n’a pas validé le site.
> `bash scripts/export-hostinger.sh` prépare la version finale pour rose-noire.be.

## À confirmer avec la boutique

- Photos : accord donné par Sophie ; idéalement les originaux haute définition du reportage
  (Delphine Leriche Photography) pour un héros encore plus net.
- Frais de livraison 15 €, rythmes possibles des fleurs d’accueil (hebdomadaire, mensuel).
- Hôtels fleuris par Rose Noire : noms utilisables comme références ?
- Version néerlandaise, identifiant Google Analytics, nom de domaine.
