import { LLMProvider } from './LLMProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { CloudflareAIProvider } from './CloudflareAIProvider';
let providerInstance: LLMProvider | null = null;
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    const providerType = process.env.LLM_PROVIDER || 'openrouter';
    if (providerType === 'cloudflare') {
      providerInstance = new CloudflareAIProvider();
    } else {
      providerInstance = new OpenRouterProvider();
    }
  }
  return providerInstance;
}
export function setLLMProvider(provider: LLMProvider): void {
  providerInstance = provider;
}