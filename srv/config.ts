import dotenv from 'dotenv'
import { assertValid } from 'frisker'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { v4 } from 'uuid'
import { AIAdapter } from '../common/adapters'

export type CustomSettings = {
  baseEndTokens?: string[]
}

const settingsValid = {
  baseEndTokens: ['string?'],
} as const

export const customSettings = tryGetSettings()

assertValid(settingsValid, customSettings)

dotenv.config({ path: '.env' })

/**
 * We always want to use a relatively safe JWT signing secret
 * If the user has not provided one:
 * - Create one
 * - Save it to a file
 * - Apply it to the environment variables
 *
 * When the application restarts we will try to retrieve the previously saved secret
 */
if (!process.env.JWT_SECRET) {
  const secret = readSecret()
  if (secret) {
    process.env.JWT_SECRET = secret
  } else if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      `JWT_SECRET not set and .token_secret file does not exist. One must be provided in production.`
    )
  } else {
    const newSecret = v4()
    writeFileSync('.token_secret', newSecret)
    process.env.JWT_SECRET = newSecret
  }
}

export const config = {
  jwtSecret: env('JWT_SECRET'),
  port: +env('PORT', '3001'),
  assetFolder: env('ASSET_FOLDER', resolve(process.cwd(), 'dist', 'assets')),
  db: {
    name: env('DB_NAME', 'agnai'),
    host: env('DB_HOST', '127.0.0.1'),
    port: env('DB_PORT', '27017'),
  },
  redis: {
    host: env('REDIS_HOST', '127.0.0.1'),
    port: +env('REDIS_PORT', '6379'),
    user: env('REDIS_USER', ''),
    pass: env('REDIS_PASSWORD', ''),
  },
  kobold: {
    maxLength: +env('KOBOLD_MAX_LENGTH', '200'),
  },
  limits: {
    upload: +env('IMAGE_SIZE_LIMIT', '2'),
    payload: +env('JSON_SIZE_LIMIT', '2'),
  },
  noRequestLogs: env('DISABLE_REQUEST_LOGGING', 'false') === 'true',
  chai: {
    url: env('CHAI_URL', ''),
    uid: env('CHAI_UID', ''),
    key: env('CHAI_KEY', ''),
  },
  classifyUrl: env('CLASSIFY_URL', 'http://localhost:5001'),
  init: {
    username: env('INITIAL_USER', 'admin'),
    password: env('INITIAL_PASSWORD', v4()),
  },
  adapters: env('ADAPTERS', 'novel,horde,kobold,chai,luminai,openai,scale')
    .split(',')
    .filter((i) => !!i) as AIAdapter[],
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] || fallback || ''

  if (value === undefined) {
    throw new Error(`Required environment variable not set: "${key}"`)
  }

  if (value.startsWith('/run/secrets/')) {
    try {
      const content = readFileSync(value, 'utf-8').toString().trim()
      return content
    } catch (ex) {
      throw new Error(`Required environment secret not available: ${value}`)
    }
  }

  return value
}

function readSecret() {
  const locations = ['.token_secret', '/run/secrets/jwt_secret']

  for (const loc of locations) {
    try {
      const secret = readFileSync(loc, { encoding: 'utf8' })
      return secret
    } catch (ex) {}
  }
}

function tryGetSettings(): CustomSettings {
  try {
    const settings = require('../settings.json')
    return settings
  } catch (ex) {
    return {}
  }
}
