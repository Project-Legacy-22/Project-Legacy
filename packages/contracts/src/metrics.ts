// Ce que l application mesure, vu par la couche HTTP.
//
// L interface vit ici et l implementation dans packages/infra, pour la raison
// que le garde de couches a rappelee : seule la racine de composition atteint un
// adaptateur, et prom-client en est un. La couche HTTP sait ce qu est une route
// et un code de statut ; elle n a pas a savoir dans quel format ces mesures
// sortent.
export interface Measurement {
    method: string;
    route: string;
    status: number;
    seconds: number;
}

export interface Metrics {
    observe(measurement: Measurement): void;
    render(): Promise<{ contentType: string; body: string }>;
}
