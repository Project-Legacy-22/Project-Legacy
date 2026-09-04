// Fichier jetable pour la demo de #121 : prouve que le quality gate bloque
// reellement un merge. A ne jamais merger dans dev -- voir #121.
export function demoSeverityLabel(count: number): string {
    if (count <= 0) {
        return 'aucun';
    }
    if (count < 5) {
        return 'faible';
    }
    return 'eleve';
}
