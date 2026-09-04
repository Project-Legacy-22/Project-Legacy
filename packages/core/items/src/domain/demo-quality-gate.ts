// Fichier jetable pour la demo de #121 : prouve que le quality gate bloque
// reellement un merge. A ne jamais merger dans dev -- voir #121.
// Sonar ignore les conditions de couverture sous 20 lignes a couvrir (fudge
// factor) : ce fichier en depasse volontairement le nombre pour que la
// condition s applique reellement.

export function demoSeverityLabel(count: number): string {
    if (count <= 0) {
        return 'aucun';
    }
    if (count < 5) {
        return 'faible';
    }
    if (count < 20) {
        return 'moyen';
    }
    return 'eleve';
}

export function demoClampPercentage(value: number): number {
    if (value < 0) {
        return 0;
    }
    if (value > 100) {
        return 100;
    }
    return value;
}

export function demoPluralize(count: number, singular: string, plural: string): string {
    if (count === 0) {
        return `aucun ${singular}`;
    }
    if (count === 1) {
        return `1 ${singular}`;
    }
    return `${count} ${plural}`;
}

export function demoSummarize(counts: number[]): { total: number; max: number; min: number } {
    if (counts.length === 0) {
        return { total: 0, max: 0, min: 0 };
    }

    let total = 0;
    let max = counts[0]!;
    let min = counts[0]!;

    for (const value of counts) {
        total += value;
        if (value > max) {
            max = value;
        }
        if (value < min) {
            min = value;
        }
    }

    return { total, max, min };
}
