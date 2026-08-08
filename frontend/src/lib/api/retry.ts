/**
 * Retry logic for transient failures
 */

import { AxiosError, InternalAxiosRequestConfig } from "axios";

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  shouldRetry?: (error: AxiosError, retryCount: number) => boolean;
}

/**
 * Get retry delay with exponential backoff and jitter
 */
export function getRetryDelayMs(retryCount: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffFactor, retryCount - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  // Add jitter (±20%)
  const jitter = cappedDelay * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Track retry count on axios request config
 */
export function getRetryCount(config: InternalAxiosRequestConfig): number {
  return (config as any).__retryCount ?? 0;
}

/**
 * Set retry count on axios request config
 */
export function setRetryCount(config: InternalAxiosRequestConfig, count: number): void {
  (config as any).__retryCount = count;
}
