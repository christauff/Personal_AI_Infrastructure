// Perplexity API Plugin for Gap
// Injects API key for api.perplexity.ai requests

export default {
  name: "perplexity",
  version: "1.0.0",
  description: "Perplexity AI API credential injection",

  // Hosts this plugin handles
  hosts: ["api.perplexity.ai"],

  // Credentials required by this plugin
  credentials: {
    api_key: {
      description: "Perplexity API Key (pplx-...)",
      required: true
    }
  },

  // Transform request before forwarding
  transformRequest(request, credentials) {
    // Set Authorization header with API key
    request.headers["Authorization"] = `Bearer ${credentials.api_key}`;

    // Ensure content type is set for JSON APIs
    if (!request.headers["Content-Type"]) {
      request.headers["Content-Type"] = "application/json";
    }

    return request;
  },

  // Optional: transform response (logging, metrics, etc.)
  transformResponse(response, context) {
    // Pass through unchanged
    return response;
  }
};
