import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const VALID_ENV = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key',
    REDIS_URL: 'redis://127.0.0.1:6379',
    SUPABASE_ANON_KEY: 'an-anon-key',
};

describe('loadConfig', () => {
    it('lit les coordonnees de la base depuis l environnement', () => {
        const config = loadConfig(VALID_ENV);

        expect(config.supabaseUrl).toBe(VALID_ENV.SUPABASE_URL);
        expect(config.supabaseServiceRoleKey).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    });

    // Le critere de EN-30 : un demarrage impossible doit dire laquelle des
    // variables manque. Un processus qui demarre et echoue a la premiere
    // requete est plus difficile a diagnostiquer qu un qui ne demarre pas.
    it('refuse de demarrer en nommant la variable absente', () => {
        expect(() =>
            loadConfig({
                SUPABASE_URL: VALID_ENV.SUPABASE_URL,
                SUPABASE_ANON_KEY: VALID_ENV.SUPABASE_ANON_KEY,
            }),
        ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it('lit la cle publique que l authentification utilise', () => {
        expect(loadConfig(VALID_ENV).supabaseAnonKey).toBe(VALID_ENV.SUPABASE_ANON_KEY);
    });

    // Le cookie de session est marque Secure en production et ne l est pas
    // ailleurs : un navigateur jette un cookie Secure servi en http simple, ce
    // qui est le cas en developpement.
    it('ne marque pas le cookie de session hors production', () => {
        expect(loadConfig(VALID_ENV).secureCookies).toBe(false);
    });

    it('marque le cookie de session en production', () => {
        expect(loadConfig({ ...VALID_ENV, NODE_ENV: 'production' }).secureCookies).toBe(true);
    });

    it('refuse un environnement inconnu plutot que de le deviner', () => {
        expect(() => loadConfig({ ...VALID_ENV, NODE_ENV: 'preprod' })).toThrow(/NODE_ENV/);
    });

    it('nomme toutes les variables absentes, pas seulement la premiere', () => {
        expect(() => loadConfig({})).toThrow(
            /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*SUPABASE_ANON_KEY/,
        );
    });

    it('refuse une URL qui n en est pas une, en la nommant', () => {
        expect(() => loadConfig({ ...VALID_ENV, SUPABASE_URL: 'pas-une-url' })).toThrow(
            /SUPABASE_URL/,
        );
    });

    it('applique le niveau de journal par defaut quand la variable est absente', () => {
        expect(loadConfig(VALID_ENV).logLevel).toBe('info');
    });

    it('retient le niveau de journal demande', () => {
        expect(loadConfig({ ...VALID_ENV, LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    });

    it('refuse un niveau de journal inconnu plutot que de le transmettre a pino', () => {
        expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbeux' })).toThrow(/LOG_LEVEL/);
    });

    // EN-29 : l origine autorisee et la confiance proxy sont optionnelles, avec
    // un defaut adapte au developpement direct.
    it('autorise le front de developpement quand WEB_ORIGIN est absente', () => {
        expect(loadConfig(VALID_ENV).webOrigin).toBe('http://localhost:5173');
    });

    it('retient l origine autorisee demandee', () => {
        expect(loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'https://todo.example' }).webOrigin).toBe(
            'https://todo.example',
        );
    });

    it('refuse une origine autorisee qui n est pas une URL, en la nommant', () => {
        expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'todo.example' })).toThrow(/WEB_ORIGIN/);
    });

    it('ne fait confiance a aucun proxy quand TRUST_PROXY est absente', () => {
        expect(loadConfig(VALID_ENV).trustProxy).toBe(0);
    });

    it('retient le nombre de sauts de proxy demande', () => {
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    });

    it('refuse une confiance proxy negative ou non entiere, en la nommant', () => {
        expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
        expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '1.5' })).toThrow(/TRUST_PROXY/);
    });
});
