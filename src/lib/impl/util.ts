/**
 * Utility functions to replace deprecated Node.js util functions
 */

/**
 * Check if a value is null or undefined
 * @param value the value to check
 * @return true if null or undefined
 */
export function isNullOrUndefined(value: any): value is null | undefined {
    return value === null || value === undefined;
}

/**
 * Check if a value is a string
 * @param value the value to check
 * @return true if string
 */
export function isString(value: any): value is string {
    return typeof value === 'string';
}

/**
 * Format a string with placeholders
 * @param formatString the format string
 * @param args the arguments
 * @return formatted string
 */
export function format(formatString: string, ...args: any[]): string {
    let i = 0;
    return formatString.replace(/%[sdj%]/g, (match) => {
        if (match === '%%') {
            return '%';
        }
        if (i >= args.length) {
            return match;
        }
        switch (match) {
            case '%s': return String(args[i++]);
            case '%d': return Number(args[i++]).toString();
            case '%j':
                try {
                    return JSON.stringify(args[i++]);
                } catch (_) {
                    return '[Circular]';
                }
            default:
                return match;
        }
    });
}