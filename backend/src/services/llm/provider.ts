import { LLMProvider } from './LLMProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { CloudflareAIProvider } from './CloudflareAIProvider';
import { LocalLLMProvider } from './LocalLLMProvider';
let providerInstance: LLMProvider | null = null;
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    const providerType = process.env.LLM_PROVIDER || 'openrouter';
    if (providerType === 'cloudflare') {
      providerInstance = new CloudflareAIProvider();
    } else if (providerType === 'local' || providerType === 'local-llm' || providerType === 'selfhosted') {
      providerInstance = new LocalLLMProvider();
    } else {
      providerInstance = new OpenRouterProvider();
    }
  }
  return providerInstance!;
}
export function setLLMProvider(provider: LLMProvider): void {
  providerInstance = provider;
}