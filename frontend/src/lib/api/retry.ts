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

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffFactor: 2,
  shouldRetry: (error, retryCount) => {
    if (retryCount <= 0) return false;

    // Don't retry client errors (4xx). Rate limits are intentional back-pressure;
    // retrying them here amplifies request bursts during UI toggles.
    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    // Retry server errors (5xx)
    if (error.response?.status && error.response.status >= 500) {
      return true;
    }

    // Retry network errors (timeout, connection refused, etc.)
    if (error.code === "ECONNABORTED" || error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return true;
    }

    // Retry on network timeout
    if (error.message === "Network Error" || error.message?.includes("timeout")) {
      return true;
    }

    return false;
  }
};

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
