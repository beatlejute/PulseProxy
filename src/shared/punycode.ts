/**
 * Punycode encoding/decoding for Internationalized Domain Names (IDN).
 * Implements RFC 3492 for converting Unicode domains to ASCII (Punycode).
 */

/**
 * Encodes a Unicode string to Punycode.
 * @param input - The Unicode string to encode
 * @returns The Punycode-encoded string (without 'xn--' prefix)
 */
export function encodePunycode(input: string): string {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = 700;
    const initialBias = 72;
    const initialN = 128;
    const delimiter = '-';

    let n = initialN;
    let delta = 0;
    let bias = initialBias;
    let output = '';

    // Copy basic code points to output
    const basicChars: string[] = [];
    const codePoints: number[] = [];
    for (const char of input) {
        const code = char.charCodeAt(0);
        codePoints.push(code);
        if (code < 128) {
            basicChars.push(char);
        }
    }
    output = basicChars.join('');

    let h = output.length;
    const b = output.length;

    // Add delimiter if there are non-basic code points to encode
    const hasNonBasic = h < input.length;
    if (hasNonBasic) {
        output += delimiter;
    }

    while (h < codePoints.length) {
        let m = Infinity;
        for (const cp of codePoints) {
            if (cp >= n && cp < m) {
                m = cp;
            }
        }

        delta += (m - n) * (h + 1);
        n = m;

        for (const cp of codePoints) {
            if (cp < n) {
                delta++;
            } else if (cp === n) {
                let q = delta;
                for (let k = base; ; k += base) {
                    const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
                    if (q < t) break;
                    output += encodeDigit(t + ((q - t) % (base - t)));
                    q = Math.floor((q - t) / (base - t));
                }
                output += encodeDigit(q);
                bias = adapt(delta, h + 1, h === b);
                delta = 0;
                h++;
            }
        }
        delta++;
        n++;
    }

    return output;
}

/**
 * Decodes a Punycode string to Unicode.
 * @param input - The Punycode-encoded string (without 'xn--' prefix)
 * @returns The decoded Unicode string
 */
export function decodePunycode(input: string): string {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const initialBias = 72;
    const initialN = 128;
    const delimiter = '-';

    // If no delimiter and all ASCII, return as-is (it's already decoded)
    const delimiterIndex = input.lastIndexOf(delimiter);
    if (delimiterIndex === -1) {
        // No delimiter - could be all-basic string or invalid Punycode
        // Return as-is (all-basic case)
        return input;
    }

    let n = initialN;
    let bias = initialBias;
    let i = 0;

    // Find the delimiter separating basic and non-basic code points
    const basicPart = delimiterIndex >= 0 ? input.substring(0, delimiterIndex) : '';
    const encodedPart = delimiterIndex >= 0 ? input.substring(delimiterIndex + 1) : input;

    // Start with basic code points
    const output: string[] = basicPart.split('');

    // Decode the non-basic code points
    for (let j = 0; j < encodedPart.length; ) {
        const oldi = i;
        let w = 1;
        let k = base;

        while (true) {
            const digit = decodeDigit(encodedPart[j++]);
            i += digit * w;
            const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
            if (digit < t) break;
            w *= base - t;
            k += base;
        }

        bias = adapt(i - oldi, output.length + 1, oldi === 0);
        n += Math.floor(i / (output.length + 1));
        i %= output.length + 1;
        output.splice(i, 0, String.fromCodePoint(n));
        i++;
    }

    return output.join('');
}

/**
 * Converts a domain name to ASCII (Punycode) format.
 * Non-ASCII labels are converted to xn-- prefixed Punycode.
 * ASCII labels are left unchanged.
 *
 * @param domain - The domain name to convert
 * @returns The ASCII-encoded domain name
 */
export function toASCII(domain: string): string {
    // Check if domain contains non-ASCII characters
    if (!/[^\x00-\x7F]/.test(domain)) {
        return domain;
    }

    // Handle wildcard prefix
    let prefix = '';
    let domainToConvert = domain;
    if (domain.startsWith('*.')) {
        prefix = '*.';
        domainToConvert = domain.slice(2);
    }

    // Split domain into labels and convert each
    const labels = domainToConvert.split('.');
    const asciiLabels = labels.map(label => {
        if (!/[^\x00-\x7F]/.test(label)) {
            return label;
        }
        const encoded = encodePunycode(label);
        // encodePunycode adds leading delimiter when there are no basic chars
        // We need to remove it since we add 'xn--' prefix
        const withoutLeadingDelimiter = encoded.startsWith('-') ? encoded.slice(1) : encoded;
        return 'xn--' + withoutLeadingDelimiter;
    });

    return prefix + asciiLabels.join('.');
}

/**
 * Encodes a digit (0-35) to its Punycode character representation.
 * @param d - The digit value (0-35)
 * @returns The corresponding character
 */
function encodeDigit(d: number): string {
    return String.fromCharCode(d + (d < 26 ? 97 : 22));
}

/**
 * Decodes a Punycode character to its digit value.
 * @param c - The character to decode
 * @returns The digit value (0-35)
 */
function decodeDigit(c: string): number {
    const code = c.charCodeAt(0);
    // A-Z: 0-25
    if (code >= 65 && code <= 90) {
        return code - 65;
    }
    // a-z: 0-25
    if (code >= 97 && code <= 122) {
        return code - 97;
    }
    // 0-9: 26-35
    if (code >= 48 && code <= 57) {
        return code - 22;
    }
    throw new Error(`Invalid Punycode character: ${c}`);
}

/**
 * Adapts the bias for the next iteration of encoding/decoding.
 * @param delta - The current delta value
 * @param numPoints - The number of code points processed
 * @param firstTime - Whether this is the first iteration
 * @returns The new bias value
 */
function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = 700;

    delta = firstTime ? Math.floor(delta / damp) : Math.floor(delta / 2);
    delta += Math.floor(delta / numPoints);

    let k = 0;
    while (delta > ((base - tMin) * tMax) / 2) {
        delta = Math.floor(delta / (base - tMin));
        k += base;
    }

    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
}
