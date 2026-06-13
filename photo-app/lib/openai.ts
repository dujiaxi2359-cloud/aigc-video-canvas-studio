import dns from "node:dns";
import OpenAI, { AzureOpenAI } from "openai";
import { Agent } from "undici";

const officialBaseURL = "https://api.openai.com/v1";
const defaultOpenAIIps = ["104.18.7.192", "104.18.6.192"];

let cursor = 0;

export const openAIBaseURL = process.env.OPENAI_BASE_URL || officialBaseURL;
export const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

export const azureOpenAIEndpoint =
  process.env.AZURE_OPENAI_ENDPOINT ||
  process.env.AZURE_OPENAI_IMAGE_ENDPOINT?.split("/openai/")[0]?.replace(/\/?$/, "/");
export const azureOpenAIApiKey = process.env.AZURE_OPENAI_API_KEY;
export const azureOpenAIApiVersion =
  process.env.OPENAI_API_VERSION || process.env.AZURE_OPENAI_API_VERSION || "2025-04-01-preview";
export const azureOpenAIDeployment =
  process.env.DEPLOYMENT_NAME ||
  process.env.AZURE_OPENAI_DEPLOYMENT ||
  process.env.OPENAI_IMAGE_MODEL ||
  "gpt-image-2";

function getOverrideIps() {
  return (process.env.OPENAI_DNS_OVERRIDE || defaultOpenAIIps.join(","))
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export function createOpenAIDispatcher() {
  if (process.env.OPENAI_BASE_URL) {
    return undefined;
  }

  const overrideIps = getOverrideIps();

  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname === "api.openai.com" && overrideIps.length > 0) {
          const address = overrideIps[cursor % overrideIps.length];
          cursor += 1;
          if (options.all) {
            callback(null, [{ address, family: 4 }]);
          } else {
            callback(null, address, 4);
          }
          return;
        }

        dns.lookup(hostname, options, callback);
      },
    },
  });
}

export function createOpenAIClient(timeout = 300_000) {
  const dispatcher = createOpenAIDispatcher();

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: openAIBaseURL,
    timeout,
    fetchOptions: dispatcher ? ({ dispatcher } as never) : undefined,
  });
}

export function hasAzureImageConfig() {
  return Boolean(azureOpenAIEndpoint && azureOpenAIApiKey && azureOpenAIDeployment);
}

export function createAzureOpenAIClient(timeout = 300_000) {
  return new AzureOpenAI({
    endpoint: azureOpenAIEndpoint,
    apiKey: azureOpenAIApiKey,
    apiVersion: azureOpenAIApiVersion,
    deployment: azureOpenAIDeployment,
    timeout,
  });
}
