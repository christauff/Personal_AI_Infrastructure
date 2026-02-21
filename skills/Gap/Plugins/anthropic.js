// Anthropic API Plugin for Gap
// Injects API key for api.anthropic.com requests

export default {
  name: "anthropic",
  version: "1.0.0",
  description: "Anthropic API credential injection",

  // Hosts this plugin handles
  hosts: ["api.anthropic.com"],

  // Credentials required by this plugin
  credentials: {
    api_key: {
      description: "Anthropic API Key (sk-ant-...)",
      required: true
    }
  },

  // Transform request before forwarding
  transformRequest(request, credentials) {
    // Anthropic uses x-api-key header, not Authorization
    request.headers["x-api-key"] = credentials.api_key;

    // Anthropic requires anthropic-version header
    if (!request.headers["anthropic-version"]) {
      request.headers["anthropic-version"] = "2023-06-01";
    }

    // Ensure content type is set for JSON APIs
    if (!request.headers["Content-Type"]) {
      request.headers["Content-Type"] = "application/json";
    }

    return request;
  },

  transformResponse(response, context) {
    return response;
  }
};
