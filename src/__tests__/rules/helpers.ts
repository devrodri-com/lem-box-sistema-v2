import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function setupEnv(): Promise<RulesTestEnvironment> {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8')
  const env = await initializeTestEnvironment({
    projectId: 'lem-box-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080
    }
  })
  return env
}