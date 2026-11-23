# Casino à Boire — Copie Wireframe (Sans Design)

Copie fonctionnelle complète de **Casino à Boire** (backend Node.js / Express / Socket.io + frontend React / Vite / TypeScript + 5 mini-jeux temps réel), entièrement débarrassée de sa direction artistique (couleurs, polices, ombres, textures, confettis, vidéos) pour repartir d'une base neutre prête à designer.

---

## Structure du projet

```
casino-a-boire-blank/
├── package.json
├── shared/
│   └── types.ts                           # Contrats de données partagés (NE PAS casser pour garder la logique)
├── server/
│   └── src/
│       ├── index.ts                       # Serveur Express & événements Socket.io (port 3001)
│       └── roomManager.ts                 # Toute la logique des 5 mini-jeux, votes, distribution, grand final
└── client/
    ├── index.html                         # HTML nu (ajoutez vos Google Fonts / favicon ici)
    └── src/
        ├── index.css                      # ★ POINT D'ENTRÉE DU DESIGN (variables :root + classes UI)
        ├── App.tsx                        # Routes /host (écran TV) et / (manette mobile)
        ├── socket.ts                      # Client Socket.io
        ├── pages/
        │   ├── HostScreen.tsx             # Écran hôte / TV (wireframe neutre)
        │   └── PhoneScreen.tsx            # Écran joueur / mobile (wireframe neutre)
        └── components/
            ├── AviatorCanvas.tsx          # Courbe de vol Canvas 2D (neutre)
            ├── RouletteWheelCanvas.tsx    # Roue de roulette Canvas 2D (neutre)
            └── DerbyTutorial.tsx          # Piste ovale SVG animée (neutre)
```

---

## Démarrage rapide

```bash
npm run install:all
```

### Mode développement (2 terminaux)
```bash
npm run dev:server   # Terminal 1 — Backend sur http://localhost:3001
npm run dev:client   # Terminal 2 — Frontend sur http://localhost:5173
```
- Grand écran (Hôte) : `http://localhost:5173/host`
- Téléphones (Joueurs) : `http://<votre-ip-locale>:5173/`

### Mode un seul serveur (production locale)
```bash
npm run build:client
cd server && npm run dev
```
Puis ouvrir `http://localhost:3001/host` et `http://<votre-ip-locale>:3001/`.

---

## Comment créer votre propre design

1. **Ne touchez pas à `server/` ni `shared/`** : toute la mécanique multijoueur (salles, votes, Roulette, Aviator/Crash, Blackjack, Mines, Derby, distribution, Grand Final) y est isolée.
2. **Ajoutez vos polices** dans `client/index.html`.
3. **Personnalisez `client/src/index.css`** :
   - Modifiez les variables dans `:root` (couleurs de fond, textes, bordures, polices `--font`, `--font-display`, rayons `--r-*`).
   - Stylisez les composants de base (`.card`, `.btn`, `.btn-primary`, `.badge`, `.room-code`, `.playing-card`, `.mines-cell`, `.vote-duel-card`, etc.).
4. **Habillez les 3 composants visuels** :
   - `client/src/components/RouletteWheelCanvas.tsx` (couleurs de la roue & bille)
   - `client/src/components/AviatorCanvas.tsx` (courbe & avion)
   - `client/src/components/DerbyTutorial.tsx` + piste SVG dans `HostScreen.tsx`
5. *(Optionnel)* Ajoutez vos propres vidéos/images dans `client/public/` et remplacez la zone placeholder dans `HostScreen.tsx` (`game_tutorial` et `showIntro`).
