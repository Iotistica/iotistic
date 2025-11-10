/**
 * API Configuration
 * 
 * This module handles API endpoint configuration for both local and K8s deployments.
 * 
 * Local Development:
 *   - Uses localhost:4002 (configurable via VITE_API_URL)
 * 
 * Kubernetes Deployment:
 *   - Uses relative path "/api" (same ingress as dashboard)
 *   - Environment variables are injected at build time via Vite
 * 
 * Usage:
 *   import { getApiUrl } from '@/config/api';
 *   const response = await fetch(`${getApiUrl()}/api/v1/mqtt-monitor/stats`);
 */

/**
 * Get the base API URL based on environment
 * 
 * Priority:
 * 1. VITE_API_URL environment variable (set via Helm chart or .env)
 * 2. Check if running in production (window.location.origin)
 * 3. Fall back to localhost:4002 for local development
 */
export function getApiUrl(): string {
  // Check for explicit environment variable (set at build time for K8s)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production (K8s), use relative path since dashboard and API share same ingress
  // Dashboard: https://customer-xyz.iotistic.local/
  // API: https://customer-xyz.iotistic.local/api
  if (import.meta.env.PROD) {
    // Use window.location.origin to get the current host
    // This works because ingress routes /api to the API service
    return window.location.origin;
  }

  // Local development default
  return 'http://localhost:4002';
}

/**
 * Build a full API endpoint URL
 * @param path - API path (e.g., '/api/v1/mqtt-monitor/stats')
 * @returns Full URL
 */
export function buildApiUrl(path: string): string {
  const baseUrl = getApiUrl();
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Get the Housekeeper service URL
 * 
 * Priority:
 * 1. VITE_HOUSEKEEPER_URL environment variable
 * 2. Fall back to localhost:3400 for local development
 * 3. In production, use relative path or same host
 */
export function getHousekeeperUrl(): string {
  // Check for explicit environment variable
  if (import.meta.env.VITE_HOUSEKEEPER_URL) {
    return import.meta.env.VITE_HOUSEKEEPER_URL;
  }

  // In production (K8s), use relative path if available
  if (import.meta.env.PROD) {
    return window.location.origin;
  }

  // Local development default - housekeeper runs on port 3400
  return 'http://localhost:3400';
}

/**
 * Build a full Housekeeper API endpoint URL
 * @param path - API path (e.g., '/api/housekeeper/tasks')
 * @returns Full URL
 */
export function buildHousekeeperUrl(path: string): string {
  const baseUrl = getHousekeeperUrl();
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

// Export current configuration for debugging
export const apiConfig = {
  baseUrl: getApiUrl(),
  housekeeperUrl: getHousekeeperUrl(),
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  envApiUrl: import.meta.env.VITE_API_URL,
  envHousekeeperUrl: import.meta.env.VITE_HOUSEKEEPER_URL,
};

// Log configuration in development mode
if (import.meta.env.DEV) {
  console.log('[API Config]', apiConfig);
}
