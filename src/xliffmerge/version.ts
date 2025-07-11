/**
 * Created by martin on 19.02.2017.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let version = 'unknown';

try {
    // Try to read from the compiled dist directory first
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const packageContent = readFileSync(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent) as { version: string };
    version = packageJson.version;
} catch (e) {
    try {
        // Fallback to reading from src directory during development
        const packagePath = join(__dirname, '..', '..', '..', 'package.json');
        const packageContent = readFileSync(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent) as { version: string };
        version = packageJson.version;
    } catch (err) {
        // Keep default 'unknown' version
    }
}

export const VERSION = version;
