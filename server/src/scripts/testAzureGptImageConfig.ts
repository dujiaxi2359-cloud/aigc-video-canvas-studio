import { resolveAzureImageEndpoint } from "../services/providers/azureOpenAIImage.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rootGeneration = resolveAzureImageEndpoint({
  endpoint: "https://demo.openai.azure.com",
  deploymentName: "gpt-image-2",
  apiVersion: "preview",
  kind: "generations"
});
assert(rootGeneration === "https://demo.openai.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=preview", "root endpoint should map to deployment generations path");

const rootEdit = resolveAzureImageEndpoint({
  endpoint: "https://demo.openai.azure.com/",
  deploymentName: "image2-prod",
  apiVersion: "2025-04-01-preview",
  kind: "edits"
});
assert(rootEdit === "https://demo.openai.azure.com/openai/deployments/image2-prod/images/edits?api-version=2025-04-01-preview", "root endpoint should map to deployment edits path");

const completeGeneration = resolveAzureImageEndpoint({
  endpoint: "https://demo.openai.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=preview",
  deploymentName: "ignored",
  apiVersion: "preview",
  kind: "generations"
});
assert(completeGeneration.includes("/images/generations"), "complete generation endpoint should stay generation endpoint");

const switchedEdit = resolveAzureImageEndpoint({
  endpoint: "https://demo.openai.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=preview",
  deploymentName: "ignored",
  apiVersion: "preview",
  kind: "edits"
});
assert(switchedEdit.includes("/images/edits"), "complete generation endpoint should switch to edits when needed");

let rejectedOpenAI = false;
try {
  resolveAzureImageEndpoint({ endpoint: "https://api.openai.com/v1", deploymentName: "gpt-image-2", kind: "generations" });
} catch {
  rejectedOpenAI = true;
}
assert(rejectedOpenAI, "Azure endpoint resolver must reject api.openai.com");

let rejectedProxy = false;
try {
  resolveAzureImageEndpoint({ endpoint: "http://127.0.0.1:7891", deploymentName: "gpt-image-2", kind: "generations" });
} catch {
  rejectedProxy = true;
}
assert(rejectedProxy, "Azure endpoint resolver must reject local proxy addresses");

console.log("test:azure-gpt-image-config ok");

