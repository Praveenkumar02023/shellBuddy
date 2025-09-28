import { GoogleGenAI } from "@google/genai";
import { Command } from "commander";
import * as dotenv from "dotenv";
import * as os from "os";
import { exec, spawn } from "child_process";
import * as readline from "readline";
import { promises as fsPromises } from "fs";
import { join } from "path";
import { tmpdir } from "os";

dotenv.config();

const TEMP_FILE_NAME = `shellgen-command-${process.pid}.sh`;

const ai = new GoogleGenAI({});
const program = new Command();

// create prompt for ai model according to the system.
function getSystemConfig(): { shell: string; systemInstruction: string } {
  const platform = os.platform();
  let shellName: string;
  let specificRules: string;

  if (platform == "win32") {
    shellName = "Windows PowerShell";
    specificRules = `Prefer standard, widely available Windows PowerShell cmdlets (e.g., 'Get-ChildItem', 'Select-Object', 'Remove-Item', 'Where-Object', 'Move-Item').
For destructive operations, generate a non-destructive alternative (e.g., 'Get-ChildItem ...' or a command using the '-WhatIf' parameter).`;
  } else {
    // Linux ('linux') or macOS ('darwin') platform: Use Bash/Zsh
    shellName = "Bash/Zsh";
    specificRules = `Prefer standard, widely available Linux/macOS utilities (e.g., 'grep', 'find', 'ls', 'rm', 'mv').
For destructive operations, generate a non-destructive alternative (e.g., 'find ... -print').`;
  }

  const systemInstruction = `You are an expert ${shellName} command generator.
A user will provide a request in natural language. Your ONLY task is to convert this request 
into a single, executable, syntactically correct ${shellName} command.

Crucial Rules:
1. Output MUST be ONLY the shell command. Do not include any explanations, surrounding text, 
   markdown formatting (like \`\`\`bash\`\`).
2. The output must be ready to be copied and pasted directly into a terminal.
3. ${specificRules}
`;

  return { shell: shellName, systemInstruction };
}

// generate cmd from the userPrompt by using gemini model.
async function generateCommand(userPrompt: string): Promise<string | null> {
  //check if the gemini key is present or not.
  if (!process.env.GEMINI_API_KEY) {
    console.error("\n Error: GEMINI_API_KEY not found. Check your .env file.");
    return null;
  }

  //get system configuration to support cross-platform.
  const config = getSystemConfig();

  const model = "gemini-2.5-flash";

  try {
    // console.log(
    //   `Processing request for ${config.shell} : ${config.systemInstruction}...`
    // );

    //get response from the gemini model.
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        // Pass the dynamic system instruction
        systemInstruction: {
          parts: [{ text: config.systemInstruction }], // <--- NEW: Use dynamic prompt
        },
      },
    });

    //convert reponse to text and return.
    const command = response.text!.trim();
    return command;
  } catch (error) {
    console.log("An error occurred during the API call:", error);
    return null;
  }
}

async function editCommandInEditor(initialCommand: string): Promise<void> {
  const tempFilePath = join(tmpdir(), TEMP_FILE_NAME);

  const editor =
    process.env.EDITOR || (os.platform() === "win32" ? "notepad" : "nano");

  console.log(`\n📝 Opening command in editor: ${editor}`);
  console.log(`(Temp file: ${tempFilePath})`);

  try {
    // 1. Write the initial command to a temporary file
    await fsPromises.writeFile(tempFilePath, initialCommand);

    // 2. Spawn the editor process, inheriting stdio so user can interact
    const editorProcess = spawn(editor, [tempFilePath], {
      stdio: "inherit",
      shell: true, // Important for cross-platform editor execution
    });

    // 3. Wait for the editor to close (using a Promise)
    await new Promise<void>((resolve, reject) => {
      editorProcess.on("error", (err) => {
        console.error(`\n❌ Error starting editor (${editor}):`, err.message);
        reject(err);
      });
      editorProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
    });

    // 4. Read the modified command back
    const modifiedCommand = (
      await fsPromises.readFile(tempFilePath, "utf-8")
    ).trim();

    // 5. Clean up the temp file
    await fsPromises.unlink(tempFilePath);

    // 6. Restart the execution prompt with the modified command
    await handleCommandExecution(modifiedCommand);
  } catch (error) {
    console.error(`\n❌ Failed to edit or read command:`, error);
    // Fallback: Re-prompt with original command if editing failed
    await handleCommandExecution(initialCommand);
  }
}

async function handleCommandExecution(command: string): Promise<void> {
  // Re-display the command for clarity, especially after editing
  console.log("------------------------------------------");
  console.log("✅ Generated Command:");
  console.log(`\n   $ ${command}\n`);
  console.log("------------------------------------------");

  // readline for interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptForAction = () => {
    // Ask the user for confirmation
    rl.question(
      "Action? (y: execute / n: cancel / e: edit): ",
      async (answer: string) => {
        rl.close();
        const action = answer.toLowerCase().trim();

        if (action === "y") {
          console.log(`\n🚀 Executing command...`);

          // Determine the correct shell for execution
          const shell = os.platform() === "win32" ? "powershell" : "/bin/bash";

          // Execute the command in the appropriate shell
          exec(command, { shell: shell }, (error, stdout, stderr) => {
            if (error) {
              console.error(
                `\n❌ Execution Error (${error.code}):\n${stderr.trim()}`
              );
            } else if (stderr) {
              console.warn(`\n⚠️ Command Warnings/Errors:\n${stderr.trim()}`);
              console.log(`\n✅ Output:\n${stdout.trim()}`);
            } else {
              console.log(`\n✅ Command Succeeded.`);
              if (stdout.trim()) {
                console.log(`\nOutput:\n${stdout.trim()}`);
              }
            }
          });
        } else if (action === "e") {
          await editCommandInEditor(command);
        } else if (action === "n") {
          console.log("\n🛑 Command cancelled by user.");
        } else {
          // Invalid input, prompt again
          console.log("Invalid action. Please enter y, n, or e.");
          promptForAction(); // Recursive call until valid input
        }
      }
    );
  };

  promptForAction();
}

async function main() {
  //Commander metadata
  program
    .version("1.0.0")
    .name("shellgen")
    .description(
      `ShellGen: Natural language to ${
        getSystemConfig().shell
      } command generator.`
    )
    .argument(
      "<instruction...>",
      "The natural language instruction for the command to generate."
    );

  //main action handler
  program.action(async (instruction: string[]) => {
    const userPrompt = instruction.join(" ");

    if (!userPrompt) {
      program.help();
      return;
    }

    const generatedCommand = await generateCommand(userPrompt);

    if (generatedCommand) {
      await handleCommandExecution(generatedCommand);
    }
  });

  // Parse the command line arguments
  program.parse(process.argv);
}

main();
