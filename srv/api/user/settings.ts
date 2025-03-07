import { assertValid } from 'frisker'
import needle from 'needle'
import { NOVEL_BASEURL } from '../../adapter/novel'
import { config } from '../../config'
import { store } from '../../db'
import { AppSchema } from '../../db/schema'
import { encryptText } from '../../db/util'
import { personaValidator } from '../chat/common'
import { findUser, HORDE_GUEST_KEY } from '../horde'
import { get } from '../request'
import { getAppConfig } from '../settings'
import { handleUpload } from '../upload'
import { errors, handle, StatusError } from '../wrap'
import { sendAll } from '../ws'

export const getInitialLoad = handle(async ({ userId }) => {
  const [profile, user, presets, config, books] = await Promise.all([
    store.users.getProfile(userId!),
    getSafeUserConfig(userId!),
    store.presets.getUserPresets(userId!),
    getAppConfig(),
    store.memory.getBooks(userId!),
  ])

  return { profile, user, presets, config, books }
})

export const getProfile = handle(async ({ userId, params }) => {
  const id = params.id ? params.id : userId!
  const profile = await store.users.getProfile(id!)
  return profile
})

export const getConfig = handle(async ({ userId }) => {
  const user = await getSafeUserConfig(userId!)
  return user
})

export const deleteScaleKey = handle(async ({ userId }) => {
  await store.users.updateUser(userId!, {
    scaleApiKey: '',
  })

  return { success: true }
})

export const deleteHordeKey = handle(async ({ userId }) => {
  await store.users.updateUser(userId!, {
    hordeKey: '',
    hordeName: '',
  })

  return { success: true }
})

export const deleteNovelKey = handle(async ({ userId }) => {
  await store.users.updateUser(userId!, {
    novelApiKey: '',
    novelVerified: false,
  })

  return { success: true }
})

export const deleteOaiKey = handle(async ({ userId }) => {
  await store.users.updateUser(userId!, {
    oaiKey: '',
  })

  return { success: true }
})

export const updateConfig = handle(async ({ userId, body }) => {
  assertValid(
    {
      novelApiKey: 'string?',
      novelModel: 'string?',
      koboldUrl: 'string?',
      hordeApiKey: 'string?',
      hordeModel: 'string?',
      luminaiUrl: 'string?',
      hordeWorkers: ['string'],
      oaiKey: 'string?',
      defaultAdapter: config.adapters,
      defaultPresets: 'any',
      scaleUrl: 'string?',
      scaleApiKey: 'string?',
    },
    body
  )

  const prevUser = await store.users.getUser(userId!)
  if (!prevUser) {
    throw errors.Forbidden
  }

  const update: Partial<AppSchema.User> = {
    defaultAdapter: body.defaultAdapter,
    hordeWorkers: body.hordeWorkers,
    defaultPresets: body.defaultPresets,
  }

  if (body.hordeApiKey) {
    const prevKey = prevUser.hordeKey
    const isNewKey =
      body.hordeApiKey !== '' &&
      body.hordeApiKey !== HORDE_GUEST_KEY &&
      body.hordeApiKey !== prevKey

    if (isNewKey) {
      const user = await findUser(body.hordeApiKey).catch(() => null)
      if (!user) {
        throw new StatusError('Cannot set Horde API Key: Could not validate API key', 400)
      }
      update.hordeName = user.result?.username
    }

    update.hordeKey = encryptText(body.hordeApiKey)
  }

  const validKoboldUrl = await verifyKobldUrl(prevUser, body.koboldUrl)

  if (validKoboldUrl !== undefined) update.koboldUrl = validKoboldUrl
  if (body.luminaiUrl !== undefined) update.luminaiUrl = body.luminaiUrl

  if (body.hordeModel) {
    update.hordeModel = body.hordeModel!
  }

  if (body.novelModel) {
    update.novelModel = body.novelModel
  }

  if (body.novelApiKey) {
    const verified = await verifyNovelKey(body.novelApiKey)

    if (!verified) {
      throw new StatusError(`Cannot set Novel API key: Provided key failed to validate`, 400)
    }

    update.novelVerified = true
    update.novelApiKey = encryptText(body.novelApiKey!)
  }

  if (body.oaiKey) {
    update.oaiKey = encryptText(body.oaiKey!)
  }

  if (body.scaleUrl !== undefined) update.scaleUrl = body.scaleUrl
  if (body.scaleApiKey) {
    update.scaleApiKey = encryptText(body.scaleApiKey)
  }

  await store.users.updateUser(userId!, update)
  const user = await getSafeUserConfig(userId!)
  return user
})

export const updateProfile = handle(async (req) => {
  const form = await handleUpload(req, { handle: 'string' } as const)

  const [file] = form.attachments

  const previous = await store.users.getProfile(req.userId!)
  if (!previous) {
    throw errors.Forbidden
  }

  const update: Partial<AppSchema.Profile> = {
    handle: form.handle,
  }

  if (file) {
    update.avatar = file.filename
  }

  const profile = await store.users.updateProfile(req.userId!, update)

  if (previous.handle !== form.handle) {
    sendAll({ type: 'profile-handle-changed', userId: req.userId!, handle: form.handle })
  }

  return profile
})

async function verifyKobldUrl(user: AppSchema.User, incomingUrl?: string) {
  if (!incomingUrl) return
  if (user.koboldUrl === incomingUrl) return

  const url = incomingUrl.match(/(http(s{0,1})\:\/\/)([a-z0-9\.\-]+)(\:[0-9]+){0,1}/gm)
  if (!url || !url[0]) {
    throw new StatusError(
      `Kobold URL provided could not be verified: Invalid URL format. Use a fully qualified URL, e.g.: http://127.0.0.1:5000`,
      400
    )
  }

  const res = await get({ host: url[0], url: '/api/v1/model' })
  if (res.error) {
    throw new StatusError(`Kobold URL could not be verified: ${res.error.message}`, 400)
  }

  return url[0]
}

async function verifyNovelKey(key: string) {
  const res = await needle('get', `${NOVEL_BASEURL}/user/data`, {
    headers: { Authorization: `Bearer ${key}` },
    json: true,
    response_timeout: 5000,
  })

  return res.statusCode && res.statusCode <= 400
}

async function getSafeUserConfig(userId: string) {
  const user = await store.users.getUser(userId!)
  if (user) {
    user.novelApiKey = ''
    user.hordeKey = ''

    if (user.oaiKey) {
      user.oaiKeySet = true
      user.oaiKey = ''
    }

    if (user.scaleApiKey) {
      user.scaleApiKeySet = true
      user.scaleApiKey = ''
    }
  }
  return user
}

function isSamePersona(left?: AppSchema.Persona, right?: AppSchema.Persona) {
  if (!left || !right) {
    if (!left && !right) return true
    return false
  }

  if (left.kind === 'text' || right.kind === 'text') {
    if (left.kind !== right.kind) return false
    return left.attributes.text?.[0] === right.attributes.text?.[0]
  }

  const [keys, values] = Object.keys(left.attributes)

  const leftSet = new Set(keys)
  for (const key in right.attributes) {
    leftSet.add(key)
  }

  if (leftSet.size !== keys.length) return false

  for (const key of keys) {
    const l = left.attributes[key]
    const r = right.attributes[key]

    const set = new Set(...l, ...r)
    if (set.size !== l.length) return false
  }

  return true
}
