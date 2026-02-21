// OpenAI API Plugin for Gap
// Injects API key for api.openai.com requests

export default {
  name: "openai",
  version: "1.0.0",
  description: "OpenAI API credential injection",

  // Hosts this plugin handles
  hosts: ["api.openai.com"],

  // Credentials required by this plugin
  credentials: {
    api_key: {
      description: "OpenAI API Key (sk-...)",
      required: true
    },
    organization: {
      description: "OpenAI Organization ID (optional)",
      required: false
    }
  },

  // Transform request before forwarding
  transformRequest(request, credentials) {
    // Set Authorization header with API key
    request.headers["Authorization"] = `Bearer ${credentials.api_key}`;

    // Add organization header if provided
    if (credentials.organization) {
      request.headers["OpenAI-Organization"] = credentials.organization;
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
