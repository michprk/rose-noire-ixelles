# API des formulaires (hors du site)

Le site est 100 % statique : il ne contient **aucune clé secrète**. Les deux formulaires
(**devis** pour les entreprises et les événements, **commande** de bouquet pour les particuliers)
envoient leur demande en JSON à une petite API hébergée à part, qui revérifie tout et envoie
l’e-mail à la boutique.

```
Visiteur ──(formulaire)──▶ site statique ──(POST /contact)──▶ API ──▶ e-mail à rosenoire160@hotmail.com
                                                              (clés ici seulement)
```

Deux versions, au choix selon l’hébergement :

- **`contact.php`** — hébergement avec PHP (**Hostinger**, OVH, one.com…). Rien à installer :
  `scripts/export-hostinger.sh` l’inclut et relie les formulaires à `/api/contact`.
  Réglages en haut du fichier (adresse qui reçoit les demandes, expéditeur du domaine).
- **`contact-worker.js`** — site statique (GitHub Pages, Cloudflare Pages) : API séparée sur
  **Cloudflare Workers** (gratuit), décrite ci-dessous.

Ce que font les deux versions :

- n’acceptent que les demandes venant du site (CORS strict / même origine) ;
- revalident tous les champs côté serveur (on ne fait jamais confiance au navigateur) :
  e-mail, téléphone, budget, date (pas dans le passé, pas de livraison le lundi), adresse ;
- anti-spam : champ piège, envoi trop rapide (moins de 3 s), 5 demandes / 10 min par adresse IP,
  un seul lien par message ;
- envoient un e-mail texte à la boutique, avec « répondre à » = le client ;
- renvoient des erreurs en français que le site affiche sous les bons champs.

Tant que l’API n’est pas branchée, les formulaires fonctionnent quand même : la messagerie du
visiteur s’ouvre avec la demande pré-remplie (aucune donnée ne passe par un serveur).

## Mise en route Cloudflare (environ 15 minutes)

1. Créer un compte gratuit sur [resend.com](https://resend.com), vérifier le domaine de la
   boutique et copier la clé API.
2. Créer un compte gratuit sur [cloudflare.com](https://dash.cloudflare.com).
3. Dans ce dossier `api/` :

   ```bash
   npx wrangler login
   npx wrangler secret put RESEND_API_KEY
   npx wrangler deploy
   ```

4. Copier l’adresse obtenue (ex. `https://rose-noire-ixelles-contact.<compte>.workers.dev`) dans
   l’attribut `data-api` de la balise `<html>` de **chaque page**, puis lancer `bash scripts/build.sh`.
5. Vérifier `ALLOWED_ORIGIN`, `SHOP_EMAIL` et `FROM_EMAIL` dans `wrangler.toml`.

La politique de sécurité du site (CSP) autorise déjà les adresses `*.workers.dev`.
