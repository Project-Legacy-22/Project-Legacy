import { v4 as uuid } from 'uuid';
import type { RequestHandler, Response } from 'express';

// Chaque reponse qui signale une erreur porte un identifiant de correlation,
// pour qu un signalement d utilisateur soit rattachable a une ligne de journal
// sans rien exposer de la requete elle-meme.
//
// Express type `res.locals` comme `LocalsObj & Locals`, ou `LocalsObj` vaut
// `Record<string, any>` par defaut. Intersecter un champ declare avec cette
// signature d index le ramene a `any` : augmenter `Express.Locals` ne suffit
// donc pas a typer `traceId`, et chaque lecture serait un acces non sur.
//
// Le passage se fait par une vue typee et un controle a l execution. Le cout
// est de deux lignes ; le gain est que plus aucun appelant ne manipule `any`,
// et qu un middleware oublie echoue immediatement au lieu de propager
// `undefined` jusque dans un journal.
interface TraceLocals {
    traceId?: unknown;
}

const MANQUANT = 'withTraceId doit etre monte avant tout usage de traceIdOf.';

export const withTraceId: RequestHandler = (_req, res, next) => {
    (res.locals as TraceLocals).traceId = uuid();
    next();
};

export function traceIdOf(res: Response): string {
    const { traceId } = res.locals as TraceLocals;

    if (typeof traceId !== 'string') {
        throw new Error(MANQUANT);
    }

    return traceId;
}
