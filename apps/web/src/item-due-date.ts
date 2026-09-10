function localDate(dueDate: string): Date {
    const [year, month, day] = dueDate.split('-').map(Number);
    // Noon avoids the rare local-time transition that can make midnight an
    // invalid instant. The interface renders only the calendar date.
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

function localToday(now: Date): string {
    const year = String(now.getFullYear()).padStart(4, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDueDate(dueDate: string, locales?: Intl.LocalesArgument): string {
    return new Intl.DateTimeFormat(locales, { dateStyle: 'medium' }).format(localDate(dueDate));
}

export function isOverdue(dueDate: string, now = new Date()): boolean {
    return dueDate < localToday(now);
}
