import { DEFAULT_API_BASE_URL, DEFAULT_API_KEYS, DEFAULT_API_PLATFORM, DEFAULT_PROXY_URL } from "../config/appConfig";

// Keeps non-React helpers synchronized with live app config
// without leaking state through window globals.
const runtimeConfig = {
  proxyUrl: DEFAULT_PROXY_URL,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiPlatform: DEFAULT_API_PLATFORM,
  apiKeys: { ...DEFAULT_API_KEYS },
};

export function getRuntimeConfig() {
  return runtimeConfig;
}

export function setRuntimeConfig(partial = {}) {
  if (!partial || typeof partial !== "object") return runtimeConfig;
  if (Object.prototype.hasOwnProperty.call(partial, "proxyUrl")) {
    runtimeConfig.proxyUrl = typeof partial.proxyUrl === "string" ? partial.proxyUrl : runtimeConfig.proxyUrl;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "apiBaseUrl")) {
    runtimeConfig.apiBaseUrl = typeof partial.apiBaseUrl === "string" ? partial.apiBaseUrl : runtimeConfig.apiBaseUrl;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "apiPlatform")) {
    runtimeConfig.apiPlatform = typeof partial.apiPlatform === "string" ? partial.apiPlatform : runtimeConfig.apiPlatform;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "apiKeys")) {
    runtimeConfig.apiKeys = partial.apiKeys && typeof partial.apiKeys === "object"
      ? { ...partial.apiKeys }
      : { ...DEFAULT_API_KEYS };
  }
  return runtimeConfig;
}
