#!/usr/bin/env node

import { Command } from "commander";
import { generateCommand } from "./ai.js";
import { handleCommandExecution } from "./executor.js";
import { getSystemConfig } from "./ai.js";

const program = new Command();

async function main() {
  const systemConfig = getSystemConfig();

  program
    .name("shellBuddy")
    .version("1.0.0")
    .description(
      `ShellBuddy: Natural language to ${systemConfig.shell} command generator.`
    )
    .argument(
      "<instruction...>",
      "Natural language instruction to convert into a shell command."
    )
    .action(async (instruction: string[]) => {
      const userPrompt = instruction.join(" ");

      if (!userPrompt) {
        program.help();
        return;
      }

      const generatedCommand = await generateCommand(userPrompt);

      if (generatedCommand) {
        await handleCommandExecution(generatedCommand);
      } else {
        console.error("Failed to generate command.");
      }
    });

  program.parse(process.argv);
}

main();
