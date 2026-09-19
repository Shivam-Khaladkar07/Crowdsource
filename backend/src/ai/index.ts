import type { AIProvider } from "./provider.js";
import { DemoAIProvider } from "./demoProvider.js";

export function getAIProvider(): AIProvider {
  // Live providers can be added here when an API key is present.
  // Missing keys must never break flows — Demo AI Mode always works.
  if (!process.env.OPENAI_API_KEY) {
    return new DemoAIProvider();
  }
  return new DemoAIProvider();
}
