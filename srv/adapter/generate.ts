import { AIAdapter } from '../../common/adapters'
import {
  mapPresetsToAdapter,
  defaultPresets,
  isDefaultPreset,
  getFallbackPreset,
} from '../../common/presets'
import { store } from '../db'
import { AppSchema } from '../db/schema'
import { AppLog, logger } from '../logger'
import { errors, StatusError } from '../api/wrap'
import { handleChai } from './chai'
import { handleHorde } from './horde'
import { createImagePrompt } from './image'
import { handleKobold } from './kobold'
import { handleLuminAI } from './luminai'
import { handleNovel } from './novel'
import { handleOoba } from './ooba'
import { handleOAI } from './openai'
import { GenerateRequestV2, ModelAdapter } from './type'
import { createPromptWithParts, getAdapter } from '../../common/prompt'
import { handleScale } from './scale'
import { getMemoryPrompt } from '../../common/memory'

const handlers: { [key in AIAdapter]: ModelAdapter } = {
  chai: handleChai,
  novel: handleNovel,
  kobold: handleKobold,
  ooba: handleOoba,
  horde: handleHorde,
  luminai: handleLuminAI,
  openai: handleOAI,
  scale: handleScale,
}

export async function createTextStreamV2(
  opts: GenerateRequestV2,
  log: AppLog,
  guestSocketId?: string
) {
  /**
   * We need to ensure the prompt is always generated using the correct version of the memory book.
   * If a non-owner initiates generation, they will not have the memory book.
   *
   * Everything else should be update to date at this point
   */
  if (!guestSocketId) {
    const entities = await getResponseEntities(opts.chat, opts.sender.userId)
    const memory = getMemoryPrompt({ ...opts, book: entities.book })
    opts.user = entities.user
    opts.parts.memory = memory
    opts.settings = entities.gen
    opts.char = entities.char
  }

  const { adapter } = getAdapter(opts.chat, opts.user)
  const handler = handlers[adapter]

  const prompt = createPromptWithParts(opts, opts.parts, opts.lines)

  const gen = opts.settings || getFallbackPreset(adapter)
  const settings = mapPresetsToAdapter(gen, adapter)
  const stream = handler({
    char: opts.char,
    chat: opts.chat,
    gen: opts.settings || {},
    log,
    members: opts.members.concat(opts.sender),
    prompt: prompt.prompt,
    parts: prompt.parts,
    sender: opts.sender,
    settings,
    user: opts.user,
    guest: guestSocketId,
    lines: opts.lines,
  })

  return { stream, adapter }
}

// export async function createImageStream(opts: { chatId: string; senderId: string }) {
//   const { chat, char, members } = await getResponseEntities(opts.chatId, opts.senderId)

//   const isOwnerOrMember = opts.senderId === chat.userId || chat.memberIds.includes(opts.senderId)
//   if (!isOwnerOrMember) {
//     throw errors.Forbidden
//   }

//   const sender = members.find((mem) => mem.userId === opts.senderId)
//   if (!sender) {
//     throw new StatusError('Sender not found in chat members', 400)
//   }

//   const prompt = await createImagePrompt({ char, members, chat })
//   logger.debug({ prompt }, 'Image prompt')

//   return prompt
// }

export async function getResponseEntities(chat: AppSchema.Chat, senderId: string) {
  const isOwnerOrMember = senderId === chat.userId || chat.memberIds.includes(senderId)
  if (!isOwnerOrMember) {
    throw errors.Forbidden
  }

  const user = await store.users.getUser(chat.userId)
  if (!user) {
    throw errors.Forbidden
  }

  const book = chat.memoryId ? await store.memory.getBook(chat.memoryId) : undefined

  const char = await store.characters.getCharacter(chat.userId, chat.characterId)
  if (!char) {
    throw new StatusError('Character not found', 404)
  }

  const { adapter, model } = getAdapter(chat, user)
  const gen = await getGenerationSettings(user, chat, adapter)
  const settings = mapPresetsToAdapter(gen, adapter)

  return { char, user, adapter, settings, gen, model, book }
}

async function getGenerationSettings(
  user: AppSchema.User,
  chat: AppSchema.Chat,
  adapter: AIAdapter,
  guest?: boolean
): Promise<Partial<AppSchema.GenSettings>> {
  if (chat.genPreset) {
    if (isDefaultPreset(chat.genPreset)) {
      return { ...defaultPresets[chat.genPreset], src: 'user-chat-genpreset-default' }
    }

    if (guest) {
      if (chat.genSettings) return { ...chat.genSettings, src: 'guest-chat-gensettings' }
      return { ...getFallbackPreset(adapter), src: 'guest-fallback' }
    }

    const preset = await store.presets.getUserPreset(chat.genPreset)
    if (preset) {
      preset.src = 'user-chat-genpreset-custom'
      return preset
    }
  }

  if (chat.genSettings) {
    const src = guest ? 'guest-chat-gensettings' : 'user-chat-gensettings'
    return { ...chat.genSettings, src }
  }

  const servicePreset = user.defaultPresets?.[adapter]
  if (servicePreset) {
    if (isDefaultPreset(servicePreset)) {
      return {
        ...defaultPresets[servicePreset],
        src: `${guest ? 'guest' : 'user'}-service-defaultpreset`,
      }
    }

    // No user presets are persisted for anonymous users
    // Do not try to check the database for them
    if (guest) {
      return { ...getFallbackPreset(adapter), src: 'guest-fallback' }
    }

    const preset = await store.presets.getUserPreset(servicePreset)
    if (preset) {
      preset.src = 'user-service-custom'
      return preset
    }
  }

  return {
    ...getFallbackPreset(adapter),
    src: guest ? 'guest-fallback-last' : 'user-fallback-last',
  }
}
