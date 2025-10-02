import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { handleCommandExecution } from "./executor.js";

const TEMP_FILE_NAME = `shellgen-command-${process.pid}.sh`;

export async function editCommandInEditor(
  initialCommand: string
): Promise<void> {
  const tempFilePath = join(tmpdir(), TEMP_FILE_NAME);
  const editor =
    process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");

  console.log(`Opening command in editor: ${editor}`);
  console.log(`Temp file: ${tempFilePath}`);

  try {
    await fs.writeFile(tempFilePath, initialCommand);

    await new Promise<void>((resolve, reject) => {
      const editorProcess = spawn(editor, [tempFilePath], {
        stdio: "inherit",
        shell: true,
      });
      editorProcess.on("error", (err) => reject(err));
      editorProcess.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Editor exited with code ${code}`));
      });
    });

    const modifiedCommand = (await fs.readFile(tempFilePath, "utf-8")).trim();
    await fs.unlink(tempFilePath);

    await handleCommandExecution(modifiedCommand);
  } catch (error) {
    console.error("Failed to edit or read command:", error);
    await handleCommandExecution(initialCommand);
  }
}
