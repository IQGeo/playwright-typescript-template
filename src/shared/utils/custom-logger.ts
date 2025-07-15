import test from "@playwright/test";
import fs from "fs";
import path from "path";
import { LogLevel } from "shared/types";

export class Logger {
	private static logFilePath = path.resolve("logs", "automation.log");

	public static write(level: LogLevel, message: string) {
		const timestamp = new Date().toLocaleString();
		const logMessage = `${timestamp} ${level}: ${message}`;
		console.log(logMessage);
		fs.appendFileSync(Logger.logFilePath, logMessage + "\n");
	}
}

// Logger.write("INFO", "Validate ADMS event shows up in the details panel");

// await test.step("Validate ADMS event shows up in the details panel", async () => {
//   await expect(page.locator("#feature-header").getByText("ADMS Event", { exact: true })).toBeVisible();
// });
