// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

import * as fs from 'fs';

import type { Config } from './types';

interface DiscogsConfig extends Config {
  // reserved for future Discogs-specific config keys
}

const DEFAULT_CONFIG_FILE: string = '.env';

function loadConfig(configPath: string): Config {
  const content: string = fs.readFileSync(configPath, 'utf8');
  const config: Config = {
    ACCESS_TOKEN: '',
  };

  for (const line of content.split('\n')) {
    const trimmedLine: string = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue; // skip empty lines and comments
    }

    const equalsIndex: number = trimmedLine.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key: string = trimmedLine.substring(0, equalsIndex).trim();
    const value: string = trimmedLine.substring(equalsIndex + 1).trim();

    switch (key) {
      case 'ACCESS_TOKEN':
        config.ACCESS_TOKEN = value;
        break;
      default:
        console.log(`Unknown config key: ${key}`);
        break;
    }
  }

  return config;
}

function getConfigFilePath(argv: string[]): string {
  const configIndex: number = argv.indexOf('--config');
  if (configIndex !== -1 && configIndex + 1 < argv.length) {
    return argv[configIndex + 1];
  }
  return DEFAULT_CONFIG_FILE;
}

export { loadConfig, getConfigFilePath };
export type { DiscogsConfig };