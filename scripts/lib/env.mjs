import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** CLI도 프로세스 환경변수 → .env.local → .env 순서로 읽는다. 키 값은 출력하지 않는다. */
export function loadScriptEnv(root = path.resolve(import.meta.dirname, '../..'), env = process.env) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
      if (!Object.hasOwn(env, key)) env[key] = value;
    }
  }
}
