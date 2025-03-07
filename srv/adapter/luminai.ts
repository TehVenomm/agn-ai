import needle from 'needle'
import { logger } from '../logger'
import { getEndTokens, trimResponse, trimResponseV2 } from '../api/chat/common'
import { ModelAdapter } from './type'
import { defaultPresets } from '../../common/presets'

const REQUIRED_SAMPLERS = defaultPresets.basic.order

const base = {
  use_story: false,
  use_memory: false,
  use_authors_note: false,
  use_world_info: false,
}

export const handleLuminAI: ModelAdapter = async function* ({
  char,
  members,
  user,
  prompt,
  settings,
  log,
}) {
  const endTokens = ['END_OF_DIALOG']
  const stopTokens = getEndTokens(char, members, ['END_OF_DIALOG'])
  const body = { koboldUrl: user.koboldUrl, stopTokens, ...base, ...settings, prompt }

  // Kobold sampler order parameter must contain all 6 samplers to be valid
  // If the sampler order is provided, but incomplete, add the remaining samplers.
  if (body.sampler_order && body.sampler_order.length !== 6) {
    for (const sampler of REQUIRED_SAMPLERS) {
      if (body.sampler_order.includes(sampler)) continue

      body.sampler_order.push(sampler)
    }
  }

  log.debug(body, 'LuminAI payload')

  const resp = await needle('post', `${user.luminaiUrl}/api/v1/generate`, body, {
    json: true,
  }).catch((err) => ({ error: err }))

  if ('error' in resp) {
    yield { error: `Kobold request failed: ${resp.error?.message || resp.error}` }
    return
  }

  if (resp.statusCode && resp.statusCode >= 400) {
    yield { error: `Kobold request failed: ${resp.statusMessage}` }
    return
  }

  const text = resp.body.results?.[0]?.text as string
  if (text) {
    const trimmed = trimResponseV2(text, char, members, endTokens)
    yield trimmed || text
    return
  } else {
    logger.error({ err: resp.body }, 'Failed to generate text using Kobold adapter')
    yield { error: resp.body }
    return
  }
}
