import { providers, type ProviderId, type ProviderReply } from '@nexus/contracts'

export interface ProviderAdapter<Id extends ProviderId = ProviderId> {
  readonly id: Id
  readonly capabilities: { streaming: boolean; usageEstimates: boolean }
  listModels(): Promise<readonly string[]>
  sendMessage(prompt: string): Promise<ProviderReply & { provider: Id }>
  estimateUsage(prompt: string): Promise<number | null>
  normalizeError(error: unknown): { message: string }
}

type ProviderRegistry = { [Id in ProviderId]: ProviderAdapter<Id> }

function mock<Id extends ProviderId>(id: Id, guidance: string): ProviderAdapter<Id> {
  return {
    id,
    capabilities: { streaming: false, usageEstimates: false },
    async listModels() { return ['mock'] },
    async sendMessage(prompt) {
      return {
        provider: id,
        mode: 'mock',
        text: `Mock reply for “${prompt}”\n\n${guidance}`,
      }
    },
    async estimateUsage() { return null },
    normalizeError() { return { message: `${providers[id].name} could not respond.` } },
  }
}

export const adapters: ProviderRegistry = {
  gpt: mock('gpt', 'Start by defining the outcome and breaking the work into small, testable steps.'),
  claude: mock('claude', 'Write down the assumptions and consider who might be affected by the decision.'),
  grok: mock('grok', 'Challenge the main assumption and identify what evidence would change your mind.'),
  gemini: mock('gemini', 'Compare the options using the same criteria and note where more information is needed.'),
}
