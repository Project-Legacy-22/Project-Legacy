// Point d'entree de l'API sur Vercel.
//
// Le front appelle l'API en chemins relatifs pour que le navigateur porte de
// lui-meme le cookie de session (voir apps/web/vite.config.ts). Servir l'API
// sur une autre origine mettrait ce cookie hors d'atteinte. La fonction vit
// donc dans le meme projet que le front, et `vercel.json` y reecrit `/auth` et
// `/items` : une seule origine vue du navigateur.
//
// Vercel attend une application Express exportee par defaut. Rien n'est mis en
// ecoute ici : la plateforme s'en charge, contrairement a apps/api/src/index.ts
// qui garde son `listen` pour l'execution locale et pour l'image publiee.
//
// `application.start()` n'est pas appele. Il faisait un controle de sante de la
// base, utile a un processus long qui refuse de demarrer mal configure, et une
// fonction n'a pas ce cycle de vie.
//
// Depuis US-10b il fait aussi demarrer le relais de l'outbox, et cela change la
// portee de cette absence : sur cette cible, les evenements s'accumulent sans
// que personne ne les publie, donc aucune notification n'apparait. Une fonction
// qui se termine avec sa reponse ne peut pas tenir un intervalle de toute
// facon. Le choix appartient a `D-12`, la cible de deploiement, encore ouverte
// au backlog ; les options sont listees dans
// docs/features/127-event-consumer-and-notifications.md.
import { compose } from '../apps/api/dist/composition-root.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { createServer } from '../apps/api/dist/http/server.js';

const config = loadConfig();
const application = compose(config);

export default createServer(config, application.useCases, application.logger);
