import { Db, MongoClient } from 'mongodb'
import { config } from '../config'
import { logger } from '../logger'
import { AllDoc, Doc } from './schema'

const uri = `mongodb://${config.db.host}:${config.db.port}`
let connected = false

logger.debug({ uri }, 'MongoDB URI')
let database: Db | null = null

export async function connect() {
  const cli = new MongoClient(uri, { ignoreUndefined: true })
  try {
    await cli.connect()
    database = cli.db(config.db.name)

    logger.info('Connected to MongoDB')
    connected = true
    return database
  } catch (ex) {
    logger.warn(`Could not connect to database: Running in anonymous-only mode`)
  }
}

export function getDb() {
  if (!database) throw new Error('Database not yet initialised')
  return database!
}

export function db<T extends AllDoc['kind']>(kind: T) {
  return getDb().collection<Doc<T>>(kind)
}

// export function db<T extends AllDoc['kind'] = AllDoc['kind']>(_kind?: T) {
//   return client as Nedb<Doc<T>>
// }

export function catchErr(err?: any): null {
  return null
}

export function isConnected() {
  return connected
}

export async function createIndexes() {
  await db('chat-member').createIndex({ chatId: 1 }, { name: 'chat-messages_chatId' })
  await db('profile').createIndex({ userId: 1 }, { name: 'profiles_userId' })
  await db('character').createIndex({ userId: 1 }, { name: 'characters_userId' })
  await db('chat').createIndex({ userId: 1 }, { name: 'chats_userId' })
  await db('memory').createIndex({ userId: 1 }, { name: 'memory_userId' })
  await db('gen-setting').createIndex({ userId: 1 }, { name: 'gen-setting_userId' })
  await db('chat-message').createIndex({ chatId: 1 }, { name: 'chatmessages_chatId' })
}
