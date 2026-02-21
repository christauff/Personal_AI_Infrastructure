// Bright Data API Plugin for Gap
// Injects API token for api.brightdata.com requests

export default {
  name: "brightdata",
  version: "1.0.0",
  description: "Bright Data scraping API credential injection",

  // Hosts this plugin handles
  hosts: ["api.brightdata.com"],

  // Credentials required by this plugin
  credentials: {
    api_token: {
      description: "Bright Data API Token",
      required: true
    }
  },

  // Transform request before forwarding
  transformRequest(request, credentials) {
    // Bright Data uses Authorization: Bearer
    request.headers["Authorization"] = `Bearer ${credentials.api_token}`;

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
