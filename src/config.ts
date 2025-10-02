import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as readline from "readline";

const CONFIG_PATH = join(homedir(), ".shellgen", "config.json");

export async function getConfig(): Promise<{
  [key: string]: string | undefined;
}> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function setConfig(key: string, value: string) {
  try {
    const dir = join(homedir(), ".shellgen");
    await fs.mkdir(dir, { recursive: true });

    const config = await getConfig();
    config[key] = value;

    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Error writing config:", err);
  }
}

export async function ensureApiKey(): Promise<string> {
  const config = await getConfig();
  if (config.geminiApiKey) return config.geminiApiKey;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const apiKey: string = await new Promise((resolve) => {
    rl.question("Enter your GEMINI API key: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  await setConfig("geminiApiKey", apiKey);
  console.log("API key saved for future use.\n");

  return apiKey;
}
