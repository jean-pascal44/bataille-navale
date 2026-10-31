# ⚓ Bataille Navale — en famille

Bataille navale à deux joueurs, en ligne, directement dans le navigateur.
Les joueurs sont reliés en **pair-à-pair via WebRTC** (bibliothèque [PeerJS](https://peerjs.com)).
Il n'y a aucun serveur à maintenir : le serveur public PeerJS sert seulement à mettre
les deux navigateurs en relation. Ensuite, toute la partie passe directement de l'un à l'autre.

## Jouer

1. Un joueur clique sur **Créer** et envoie le code (ou le lien) à son adversaire.
2. L'autre ouvre le lien, ou saisit le code puis clique sur **Rejoindre**.
3. Chacun place sa flotte (clic, `R` ou clic droit pour pivoter, ou **Aléatoire**), puis clique sur **Prêt**.
4. Le premier joueur est tiré au sort. Les messages et les émojis sont dans le panneau 💬.

Option à la création : **rejouer après un tir touché**.

## Lancer en local

Les modules JavaScript ne fonctionnent pas en ouvrant `index.html` directement (`file://`), il faut un petit serveur :

```bash
python3 -m http.server 8080
# puis http://localhost:8080
```

## Mettre en ligne (pour jouer à distance)

C'est un site 100 % statique : il suffit d'héberger le dossier tel quel, en **HTTPS**.

- **Netlify Drop** : glissez le dossier sur <https://app.netlify.com/drop>.
- **GitHub Pages** : poussez le dossier dans un dépôt, puis activez Pages (Settings → Pages).
- Ou n'importe quel hébergement de fichiers statiques.

## Si la connexion échoue

WebRTC traverse la plupart des box internet grâce aux serveurs STUN. Certains réseaux stricts
(réseau d'entreprise, certains forfaits 4G/5G) demandent un serveur **TURN** pour relayer le trafic.
Dans ce cas, ajoutez-en un dans `iceServers` dans [js/net.js](js/net.js).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Écrans : accueil, attente, jeu |
| `css/style.css` | Thème visuel et animations |
| `js/main.js` | Interface et déroulement de la partie |
| `js/game.js` | Logique du plateau (placement, tirs) |
| `js/net.js` | Connexion WebRTC (PeerJS), code de partie, détection de déconnexion |
| `js/sound.js` | Effets sonores générés par le navigateur (Web Audio) |
