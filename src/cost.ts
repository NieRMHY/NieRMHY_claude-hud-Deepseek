import type { SessionTokenUsage, StdinData } from './types.js';
import { isBedrockModelId, isVertexModelId } from './stdin.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

type AnthropicModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

// Modify by MHY: DeepSeek pricing with separate cache hit rate
type DeepSeekModelPricing = {
  inputPerM: number;
  cacheHitPerM: number;
  outputPerM: number;
  currency: string;
};

type ModelPricingEntry =
  | { type: 'anthropic'; pricing: AnthropicModelPricing }
  | { type: 'deepseek'; pricing: DeepSeekModelPricing };

export interface SessionCostEstimate {
  totalUsd: number;
  inputUsd: number;
  cacheCreationUsd: number;
  cacheReadUsd: number;
  outputUsd: number;
  _currency?: string;
}

export interface SessionCostDisplay {
  totalUsd: number;
  source: 'native' | 'estimate';
  _currency?: string;
}

const TOKENS_PER_MILLION = 1_000_000;
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

const ANTHROPIC_MODEL_PRICING: Array<{ pattern: RegExp; pricing: AnthropicModelPricing }> = [
  { pattern: /\bopus 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 15, outputUsdPerMillion: 75 } },
  { pattern: /\bsonnet 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
  { pattern: /\bsonnet 3 7\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
  { pattern: /\bsonnet 3 5\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
  { pattern: /\bhaiku 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 5 } },
  { pattern: /\bhaiku 3 5\b/i, pricing: { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 } },
  { pattern: /\bopusplan\b/i, pricing: { inputUsdPerMillion: 15, outputUsdPerMillion: 75 } },
  { pattern: /\bsonnetplan\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
  { pattern: /\bhaikuplan\b/i, pricing: { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 } },
];

// Modify by MHY: DeepSeek default pricing (¥ / 1M tokens)
const DEEPSEEK_DEFAULT_PRICING: Array<{ pattern: RegExp; pricing: DeepSeekModelPricing }> = [
  { pattern: /\bdeepseek.*flash\b/i, pricing: { inputPerM: 1, cacheHitPerM: 0.02, outputPerM: 2, currency: '¥' } },
  { pattern: /\bdeepseek.*pro\b/i, pricing: { inputPerM: 3, cacheHitPerM: 0.025, outputPerM: 6, currency: '¥' } },
  { pattern: /\bdeepseek/i, pricing: { inputPerM: 3, cacheHitPerM: 0.025, outputPerM: 6, currency: '¥' } },
];

interface CustomPricingEntry {
  pattern: string;
  inputPerM: number;
  cacheHitPerM: number;
  outputPerM: number;
  currency?: string;
}

function loadCustomPricing(): Array<{ pattern: RegExp; pricing: DeepSeekModelPricing }> | null {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR
      || path.join(os.homedir(), '.claude');
    const configPath = path.join(configDir, 'plugins', 'claude-hud', 'config.json');
    if (!fs.existsSync(configPath)) return null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const custom: CustomPricingEntry[] | undefined = config?.customPricing;
    if (!custom || !Array.isArray(custom) || custom.length === 0) return null;
    return custom.map(entry => ({
      pattern: new RegExp(entry.pattern, 'i'),
      pricing: {
        inputPerM: entry.inputPerM,
        cacheHitPerM: entry.cacheHitPerM,
        outputPerM: entry.outputPerM,
        currency: entry.currency || '¥',
      },
    }));
  } catch {
    return null;
  }
}

function getDeepseekPricingEntries(): Array<{ pattern: RegExp; pricing: DeepSeekModelPricing }> {
  const custom = loadCustomPricing();
  return custom ?? DEEPSEEK_DEFAULT_PRICING;
}

function normalizeModelName(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/^claude\s+/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAnthropicPricing(modelName: string): AnthropicModelPricing | null {
  const normalized = normalizeModelName(modelName);
  for (const entry of ANTHROPIC_MODEL_PRICING) {
    if (entry.pattern.test(normalized)) return entry.pricing;
  }
  return null;
}

// Modify by MHY
function matchDeepseekPricing(modelName: string): DeepSeekModelPricing | null {
  if (!modelName) return null;
  const entries = getDeepseekPricingEntries();
  for (const entry of entries) {
    if (entry.pattern.test(modelName)) return entry.pricing;
  }
  return null;
}

// Modify by MHY: check if model is DeepSeek (for skipping native cost)
function isDeepseekModel(stdin: StdinData): boolean {
  const candidates = [
    stdin.model?.display_name?.trim(),
    stdin.model?.id?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (/\bdeepseek/i.test(candidate)) return true;
  }
  return false;
}

function calculateUsd(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / TOKENS_PER_MILLION;
}

function calculateCost(tokens: number, perMillion: number): number {
  return (tokens * perMillion) / TOKENS_PER_MILLION;
}

function getAnthropicPricing(stdin: StdinData): AnthropicModelPricing | null {
  const candidates = [
    stdin.model?.display_name?.trim(),
    stdin.model?.id?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const pricing = matchAnthropicPricing(candidate);
    if (pricing) return pricing;
  }
  return null;
}

export function estimateSessionCost(
  stdin: StdinData,
  sessionTokens: SessionTokenUsage | undefined,
): SessionCostEstimate | null {
  if (!sessionTokens) return null;
  if (isBedrockModelId(stdin.model?.id)) return null;
  if (isVertexModelId(stdin.model?.id)) return null;

  // Try Anthropic first
  const anthropicPricing = getAnthropicPricing(stdin);
  if (anthropicPricing) {
    const totalTokens = sessionTokens.inputTokens
      + sessionTokens.cacheCreationTokens
      + sessionTokens.cacheReadTokens
      + sessionTokens.outputTokens;
    if (totalTokens === 0) return null;

    const inputUsd = calculateUsd(sessionTokens.inputTokens, anthropicPricing.inputUsdPerMillion);
    const cacheCreationUsd = calculateUsd(sessionTokens.cacheCreationTokens, anthropicPricing.inputUsdPerMillion * CACHE_WRITE_MULTIPLIER);
    const cacheReadUsd = calculateUsd(sessionTokens.cacheReadTokens, anthropicPricing.inputUsdPerMillion * CACHE_READ_MULTIPLIER);
    const outputUsd = calculateUsd(sessionTokens.outputTokens, anthropicPricing.outputUsdPerMillion);

    return { totalUsd: inputUsd + cacheCreationUsd + cacheReadUsd + outputUsd, inputUsd, cacheCreationUsd, cacheReadUsd, outputUsd };
  }

  // Modify by MHY: Try DeepSeek pricing
  const deepseekPricing = getDeepseekModelPricing(stdin);
  if (deepseekPricing) {
    const totalTokens = sessionTokens.inputTokens
      + sessionTokens.cacheCreationTokens
      + sessionTokens.cacheReadTokens
      + sessionTokens.outputTokens;
    if (totalTokens === 0) return null;

    const inputCost = calculateCost(sessionTokens.inputTokens, deepseekPricing.inputPerM);
    const cacheReadCost = calculateCost(sessionTokens.cacheReadTokens, deepseekPricing.cacheHitPerM);
    const cacheCreationCost = calculateCost(sessionTokens.cacheCreationTokens, deepseekPricing.inputPerM * CACHE_WRITE_MULTIPLIER);
    const outputCost = calculateCost(sessionTokens.outputTokens, deepseekPricing.outputPerM);
    const total = inputCost + cacheCreationCost + cacheReadCost + outputCost;

    return { totalUsd: total, inputUsd: inputCost, cacheCreationUsd: cacheCreationCost, cacheReadUsd: cacheReadCost, outputUsd: outputCost, _currency: deepseekPricing.currency };
  }

  return null;
}

function getDeepseekModelPricing(stdin: StdinData): DeepSeekModelPricing | null {
  const candidates = [
    stdin.model?.display_name?.trim(),
    stdin.model?.id?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const pricing = matchDeepseekPricing(candidate);
    if (pricing) return pricing;
  }
  return null;
}

// Modify by MHY: skip native cost for third-party models (DeepSeek)
function getNativeCostUsd(stdin: StdinData): number | null {
  if (isDeepseekModel(stdin)) return null;

  const nativeCost = stdin.cost?.total_cost_usd;
  if (typeof nativeCost !== 'number' || !Number.isFinite(nativeCost)) return null;
  if (isBedrockModelId(stdin.model?.id)) return null;
  if (isVertexModelId(stdin.model?.id)) return null;
  return nativeCost;
}

export function resolveSessionCost(
  stdin: StdinData,
  sessionTokens: SessionTokenUsage | undefined,
): SessionCostDisplay | null {
  const nativeCostUsd = getNativeCostUsd(stdin);
  if (nativeCostUsd !== null) {
    return { totalUsd: nativeCostUsd, source: 'native' };
  }

  const estimate = estimateSessionCost(stdin, sessionTokens);
  if (!estimate) return null;

  return {
    totalUsd: estimate.totalUsd,
    source: 'estimate',
    _currency: estimate._currency,
  };
}

// Modify by MHY: currency-aware formatting
export function formatUsd(amount: number, currency?: string): string {
  const symbol = currency || '$';
  if (amount >= 100) return `${symbol}${amount.toFixed(0)}`;
  if (amount >= 1) return `${symbol}${amount.toFixed(2)}`;
  if (amount >= 0.1) return `${symbol}${amount.toFixed(3)}`;
  if (amount > 0) return `${symbol}${amount.toFixed(4)}`;
  return `${symbol}0`;
}
