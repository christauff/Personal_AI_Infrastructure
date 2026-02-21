// ElevenLabs API Plugin for Gap
// Injects API key for api.elevenlabs.io requests

export default {
  name: "elevenlabs",
  version: "1.0.0",
  description: "ElevenLabs TTS API credential injection",

  // Hosts this plugin handles
  hosts: ["api.elevenlabs.io"],

  // Credentials required by this plugin
  credentials: {
    api_key: {
      description: "ElevenLabs API Key",
      required: true
    }
  },

  // Transform request before forwarding
  transformRequest(request, credentials) {
    // ElevenLabs uses xi-api-key header
    request.headers["xi-api-key"] = credentials.api_key;

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
