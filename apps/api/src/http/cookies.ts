// express does not parse cookies, and no dependency was taken to do it: the
// header is a semicolon-separated list of name=value pairs (RFC 6265 section
// 4.2.1), and exactly one name is ever read here.
//
// The value is percent-decoded because res.cookie percent-encodes on the way
// out. A reader that skipped the decoding would work for a JWT, whose alphabet
// needs no encoding, and quietly fail for anything else.
function decode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        // Not an error being swallowed: a cookie that is not percent-encoded is
        // a legitimate cookie set by somebody else, and its raw value is what
        // the caller should see. Letting this throw would turn a stray cookie
        // in the browser into a 500 on every request.
        return value;
    }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
    if (header === undefined) return undefined;

    for (const pair of header.split(';')) {
        const separator = pair.indexOf('=');

        if (separator === -1) continue;
        if (pair.slice(0, separator).trim() !== name) continue;

        return decode(pair.slice(separator + 1).trim());
    }

    return undefined;
}
