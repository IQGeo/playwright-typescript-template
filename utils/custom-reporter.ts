import { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";
import { JIRA_PROJECT_ID, JIRA_PROJECT_ISSUE_TYPE_ID } from "./constants";

interface TestResultData {
	suite: string;
	name: string;
	id: string;
	status: string;
	duration: string;
	steps: string[];
	screenshotPath?: string;
	videoPath?: string;
	tracePath?: string;
	error?: string;
	detailsPath?: string;
}

export default class CustomReporter implements Reporter {
	private readonly isJenkins: boolean = !!process.env.JENKINS;
	private readonly jenkinsTestResultsPath = process.env.JENKINS_TEST_RESULTS;
	private readonly jenkinsReportsPath = process.env.JENKINS_URL;
	private readonly results: TestResultData[] = [];
	private readonly environment: string = process.env.ENVIRONMENT?.toUpperCase() ?? "UNKNOWN";

	removeAppFromFilePath = (url: string) => {
		return url.replace(/^\/app\//, "");
	};
	generatePathForTestResults = (url: string | undefined) => {
		if (this.isJenkins && this.jenkinsTestResultsPath && url) {
			const testResultsUrl = this.removeAppFromFilePath(url);
			return `${this.jenkinsTestResultsPath}/${testResultsUrl}`;
		}
		return url;
	};

	onTestEnd = (test: TestCase, result: TestResult): void => {
		const cleanError = (msg: string): string => msg.replace(/\x1b\[[0-9;]*m/g, "");

		if (["failed", "timedOut", "interrupted"].includes(result.status)) {
			result.status = "failed";
		}

		const errorSnippet = result.errors?.map((err) => cleanError(err.stack!)).join("\n") || "";

		const playwrightReportDir = this.jenkinsReportsPath
			? this.removeAppFromFilePath(this.jenkinsReportsPath)
			: path.resolve(__dirname, "../reports");
		const details = `${playwrightReportDir}/playwright-report/index.html#?testId=${test.id}`;
		const screenshot = this.generatePathForTestResults(
			result.attachments.find((a) => a.name === "screenshot" && a.path)?.path,
		);
		const video = this.generatePathForTestResults(result.attachments.find((a) => a.name === "video" && a.path)?.path);
		const trace = this.generatePathForTestResults(result.attachments.find((a) => a.name === "trace" && a.path)?.path);

		const steps = result.steps
			.filter((step) => step.category === "test.step")
			.map((step) => step.title)
			.filter(Boolean);

		this.results.push({
			suite: test.parent?.title ?? "Unknown",
			name: test.title,
			id: test.id,
			status: result.status,
			duration: `${(result.duration / 1000).toFixed(2)}s`,
			steps: steps,
			screenshotPath: screenshot,
			videoPath: video,
			tracePath: trace,
			error: errorSnippet,
			detailsPath: details,
		});
	};

	// Generate HTML report based on collected results
	private generateReport = (): void => {
		const passed = this.results.filter((r) => r.status === "passed").length;
		const failed = this.results.filter((r) => r.status === "failed").length;
		const skipped = this.results.filter((r) => r.status === "skipped").length;
		const total = this.results.length;

		const generateRows = (includeActionButtons: boolean) =>
			this.results
				.sort((a, b) => {
					// Sort by suite
					return a.suite.localeCompare(b.suite);
				})
				.map((r, idx) => this.generateReportRow(r, idx, includeActionButtons))
				.join("");

		const customerReport = this.generateHTMLContent(generateRows(false), passed, failed, skipped, total, false);

		const detailedReport = this.isJenkins
			? this.generateHTMLContent(generateRows(true), passed, failed, skipped, total, true)
			: "";

		this.saveReports(detailedReport, customerReport);
	};

	// Helper function to generate an individual row for the table
	private generateReportRow = (r: TestResultData, idx: number, includeActionButtons: boolean): string => {
		const projectId = JIRA_PROJECT_ID ?? null;
		const issueTypeId = JIRA_PROJECT_ISSUE_TYPE_ID ?? null;

		const encodedData = Buffer.from(
			JSON.stringify({
				name: r.name,
				steps: r.steps,
				screenshot: r.screenshotPath ?? "",
				video: r.videoPath ?? "",
				trace: r.tracePath ?? "",
				error: r.error || "",
				details: r.detailsPath,
			}),
		).toString("base64");

		const bugButtonColumn = includeActionButtons
			? r.status === "failed"
				? `<td>
    <button onclick="createBug(${idx}, '${projectId}', '${issueTypeId}')">Create Bug</button>
		<input type="hidden" id="bug-data-${idx}" value="${encodedData}" />
      </td>`
				: "<td></td>"
			: "";

		const viewBtn = includeActionButtons
			? `<td><a href="playwright-report/index.html#?testId=${r.id}" target="_blank" style="text-decoration: none;">
    <button>
     View details
    </button>
  </a>`
			: ` <td><button onclick="toggleSteps(${idx})">View Steps</button></td>`;

		return `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.suite}</td>
        <td>${r.name}</td>
        <td><span class="badge ${r.status}">${r.status.toUpperCase()}</span></td>
        <td>${r.duration}</td>
       ${viewBtn}
       ${bugButtonColumn}
      </tr>
		
      <tr id="steps-${idx}" class="steps-row">
        <td colspan="9">
          <div class="steps-content">
            <strong>Steps:</strong>
            <ul>${r.steps.map((step) => `<li>${step}</li>`).join("")}</ul>
          </div>
        </td>
      </tr>
    `;
	};

	// Helper function to generate the complete HTML structure for the report
	private generateHTMLContent = (
		rows: string,
		passed: number,
		failed: number,
		skipped: number,
		total: number,
		includeActionButtons: boolean,
	): string => {
		// Calculate percentage for each status
		const passedPercentage = ((passed / total) * 100).toFixed(2);
		const failedPercentage = ((failed / total) * 100).toFixed(2);
		const skippedPercentage = ((skipped / total) * 100).toFixed(2);

		const downloadAndLinksSection = includeActionButtons
			? `
  <div class="report-buttons">
    
     <a href="playwright-report/index.html" target="_blank" style="text-decoration: none;">
    <button>
      Open Playwright Report
    </button>
  </a>
    <a href="index.html" download="custom-report.html">
    <button>Download Report</button>
  </a>
  </div>
  `
			: "";

		return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>IQGeo Test Report</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: 'Arial', sans-serif; background: #f4f6f8; padding: 20px; }
          .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .header-container img { height: 50px; }
          .header-info { text-align: center; }
          .top-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            gap: 40px;
          }
          .project-info {
            flex: 1;
            background: #fff;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
            border-radius: 8px;
          }
          .summary-and-chart {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            background: #fff;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
            border-radius: 8px;
          }
          .chart-container {
            width: 300px;
            height: 300px;
            margin-top: 20px;
          }
            .report-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 0px;
}
            .report-buttons > a > button {
  padding: 12px;
}

          table { width: 100%; border-collapse: collapse; margin-top: 30px; background: #fff; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05); }
          th, td { padding: 12px 15px; border: 1px solid #ddd; text-align: center; }
          th { background-color: #3f51b5; color: white; }
          .badge { padding: 4px 8px; border-radius: 5px; color: white; font-size: 12px; }
          .badge.passed { background: #4caf50; }
          .badge.failed { background: #f44336; }
          .badge.skipped { background: #ff9800; }
          button { padding: 6px 12px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; }
          button:hover { background: #1976d2; }
          .steps-row { display: none; background: #eef; }
          .steps-content { padding: 15px; text-align: left; }
        </style>
      </head>
      <body>
  
      <div class="header-container">
        <img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxzdmcgaWQ9IkxheWVyXzIiIGRhdGEtbmFtZT0iTGF5ZXIgMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgOTk3LjgyIDMyMi4zNyI+DQogIDxkZWZzPg0KICAgIDxzdHlsZT4NCiAgICAgIC5jbHMtMSwgLmNscy0yIHsNCiAgICAgICAgc3Ryb2tlLXdpZHRoOiAwcHg7DQogICAgICB9DQoNCiAgICAgIC5jbHMtMiB7DQogICAgICAgIGZpbGw6ICM2ZmI5Njk7DQogICAgICB9DQogICAgPC9zdHlsZT4NCiAgPC9kZWZzPg0KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPg0KICAgIDxnPg0KICAgICAgPGc+DQogICAgICAgIDxnIGlkPSJHcm91cF8zIiBkYXRhLW5hbWU9Ikdyb3VwIDMiPg0KICAgICAgICAgIDxnIGlkPSJHcm91cF8yIiBkYXRhLW5hbWU9Ikdyb3VwIDIiPg0KICAgICAgICAgICAgPHJlY3QgaWQ9IlJlY3RhbmdsZV8xIiBkYXRhLW5hbWU9IlJlY3RhbmdsZSAxIiBjbGFzcz0iY2xzLTEiIHg9IjUuNjciIHk9IjQyLjM1IiB3aWR0aD0iMjgiIGhlaWdodD0iMTM5LjkiLz4NCiAgICAgICAgICAgIDxwYXRoIGlkPSJQYXRoXzEiIGRhdGEtbmFtZT0iUGF0aCAxIiBjbGFzcz0iY2xzLTEiIGQ9Ik0xODguOTcsMTUyLjE1YzguMS0xMS43LDEyLjUtMjUuNiwxMi42LTM5LjksMC0zOC42LTMxLjMtNzAtNzAtNzBzLTcwLDMxLjMtNzAsNzAsMzEuMyw3MCw3MCw3MGgwYzEzLjEtLjEsMjUuOS0zLjcsMzcuMS0xMC41bDMyLjksMzAuOCwxOS42LTE5LjYtMzIuMi0zMC44Wk04OS41NywxMTIuMzVjMC0yMy4yLDE4LjgtNDIsNDItNDJzNDIsMTguOCw0Miw0Mi0xOC44LDQyLTQyLDQyLTQyLTE4LjktNDItNDJoMFoiLz4NCiAgICAgICAgICAgIDxwYXRoIGlkPSJQYXRoXzIiIGRhdGEtbmFtZT0iUGF0aCAyIiBjbGFzcz0iY2xzLTEiIGQ9Ik0zNjguMDcsOTguMzVoLTY4LjZ2MjhoMzkuMmMtNy43LDIyLTMxLjcsMzMuNS01My42LDI1LjktMjEuOS03LjYtMzMuNS0zMS43LTI1LjktNTMuNiw1LjktMTYuOSwyMS44LTI4LjIsMzkuNi0yOC4yaDEuNGMxMC41LDAsMjAuMyw0LjksMjgsMTEuOWwyMC4zLTIwLjNjLTctNi44LTE1LjMtMTItMjQuNS0xNS40LTcuOS0yLjgtMTYuMS00LjItMjQuNS00LjItMzguNiwwLTcwLDMxLjMtNjkuOSw3MCwwLDM4LjYsMzEuMyw2OS45LDY5LjksNjkuOSw4LjQuMSwxNi44LTEuNSwyNC41LTQuOSw5LjItMy4zLDE3LjUtOC42LDI0LjUtMTUuNCwxMC05LjksMTYuOC0yMi42LDE5LjYtMzYuNC44LTQuNiwxLjMtOS4zLDEuNC0xNC0uMS00LjUtLjYtOC45LTEuNC0xMy4zWiIvPg0KICAgICAgICAgICAgPHBhdGggaWQ9IlBhdGhfMyIgZGF0YS1uYW1lPSJQYXRoIDMiIGNsYXNzPSJjbHMtMSIgZD0iTTUyOC45Nyw5OC4zNWMtMi44LTEzLjgtOS42LTI2LjUtMTkuNi0zNi40LTctNi44LTE1LjMtMTItMjQuNS0xNS40LTcuOS0yLjgtMTYuMS00LjItMjQuNS00LjItMzguNiwwLTcwLDMxLjMtNjkuOSw3MCwwLDM4LjYsMzEuMyw2OS45LDY5LjksNjkuOSw4LjQuMSwxNi44LTEuNSwyNC41LTQuOSw5LjItMy4zLDE3LjUtOC42LDI0LjUtMTUuNGwtMTkuNi0xOS42Yy03LDctMTYuOCwxMS4yLTI4LDExLjloLTEuNGMtMTguMiwwLTMzLjYtMTEuOS0zOS45LTI4aDEwNy43Yy44LTQuNiwxLjMtOS4zLDEuNC0xNCwuMi00LjYsMC05LjMtLjYtMTMuOVpNNDIwLjU3LDk4LjM1YzUuOS0xNi45LDIyLTI4LjEsMzkuOS0yOCwxOC45LDAsMzMuNiwxMS45LDM5LjksMjhoLTc5LjhaIi8+DQogICAgICAgICAgICA8cGF0aCBpZD0iUGF0aF80IiBkYXRhLW5hbWU9IlBhdGggNCIgY2xhc3M9ImNscy0xIiBkPSJNNjIxLjI3LDQyLjM1Yy0zOC42LDAtNzAsMzEuMy03MCw3MHMzMS4zLDcwLDcwLDcwLDcwLTMxLjMsNzAtNzBoMGMtLjEtMzguNi0zMS40LTY5LjktNzAtNzBaTTYyMS4yNywxNTQuMjVjLTIzLjIsMC00Mi0xOC44LTQyLTQyczE4LjgtNDIsNDItNDIsNDIsMTguOCw0Miw0Mi0xOC44LDQyLTQyLDQyaDBaIi8+DQogICAgICAgICAgICA8ZyBpZD0iR3JvdXBfNSIgZGF0YS1uYW1lPSJHcm91cCA1Ij4NCiAgICAgICAgICAgICAgPGcgaWQ9Ikdyb3VwXzUtMiIgZGF0YS1uYW1lPSJHcm91cCA1LTIiPg0KICAgICAgICAgICAgICAgIDxwYXRoIGlkPSJQYXRoXzciIGRhdGEtbmFtZT0iUGF0aCA3IiBjbGFzcz0iY2xzLTEiIGQ9Ik02OTAuNzMsMTU2LjY3Yy02LjgsMC0xMi4zLDUuNS0xMi4zLDEyLjNzNS41LDEyLjMsMTIuMywxMi4zLDEyLjMtNS41LDEyLjMtMTIuM2MwLTMuMi0xLjMtNi4zLTMuNS04LjYtMi40LTIuNC01LjUtMy43LTguOC0zLjdoMFpNNjkwLjczLDE3OS43N2MtNS45LDAtMTAuNi00LjctMTAuNi0xMC42czQuNy0xMC42LDEwLjYtMTAuNiwxMC42LDQuNywxMC42LDEwLjZjMCwyLjgtMS4xLDUuNS0zLjEsNy41LTIsMS45LTQuNywzLTcuNSwzLjFoMFoiLz4NCiAgICAgICAgICAgICAgICA8cGF0aCBpZD0iUGF0aF84IiBkYXRhLW5hbWU9IlBhdGggOCIgY2xhc3M9ImNscy0xIiBkPSJNNjk1LjYzLDE2Ni42N2MuMS0yLTEuNC0zLjgtMy40LTMuOWgtNS4ydjEyLjNoMS44di00LjNoMmwzLDQuM2gybC0zLjEtNC40YzItLjUsMi45LTEuOSwyLjktNFpNNjg4LjgzLDE2OS4wN3YtNC43aDIuOGMxLjIsMCwyLjIuOSwyLjIsMi4xdi4zYy4xLDEuMi0uOCwyLjItMiwyLjNoLTNaIi8+DQogICAgICAgICAgICAgIDwvZz4NCiAgICAgICAgICAgICAgPHBhdGggaWQ9IlBhdGhfOSIgZGF0YS1uYW1lPSJQYXRoIDkiIGNsYXNzPSJjbHMtMSIgZD0iTTY5MC43MywxNTYuNjdjLTYuOCwwLTEyLjMsNS41LTEyLjMsMTIuM3M1LjUsMTIuMywxMi4zLDEyLjMsMTIuMy01LjUsMTIuMy0xMi4zYzAtMy4yLTEuMy02LjMtMy41LTguNi0yLjQtMi40LTUuNS0zLjctOC44LTMuN2gwWk02OTAuNzMsMTc5Ljc3Yy01LjksMC0xMC42LTQuNy0xMC42LTEwLjZzNC43LTEwLjYsMTAuNi0xMC42LDEwLjYsNC43LDEwLjYsMTAuNmMwLDIuOC0xLjEsNS41LTMuMSw3LjUtMiwxLjktNC43LDMtNy41LDMuMWgwWiIvPg0KICAgICAgICAgICAgPC9nPg0KICAgICAgICAgIDwvZz4NCiAgICAgICAgPC9nPg0KICAgICAgICA8cGF0aCBpZD0iUGF0aF8xMCIgZGF0YS1uYW1lPSJQYXRoIDEwIiBjbGFzcz0iY2xzLTIiIGQ9Ik03MjYuMTYsNy4xMmMtOS41LTkuNS0yNC45LTkuNS0zNC41LDAtOS42LDkuNS05LjUsMjQuOSwwLDM0LjUsOS41LDkuNSwyNC45LDkuNSwzNC41LDBoMGM5LjUtOS41LDkuNS0yNSwwLTM0LjVaTTcxNi4yNiwzMS43M2MtNC4xLDQuMS0xMC43LDQuMS0xNC44LDBzLTQuMS0xMC43LDAtMTQuOGM0LjEtNC4xLDEwLjctNC4xLDE0LjgsMCw0LjEsNC4yLDQuMSwxMC44LDAsMTQuOGgwWiIvPg0KICAgICAgPC9nPg0KICAgICAgPGc+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTUxLjg3LDI4MS44NmMwLDguNTQtNi4wOCwxNy4yNi0xOC42NywxNy4yNkg3Ljc1di02MC42N2gyMy42YzEwLjU3LDAsMTcuMjYsNi4zNCwxNy4yNiwxNS41OSwwLDQuNzUtMS43NiwxMC40OC03LjkzLDEyLjY4LDcuNCwxLjUsMTEuMTgsOC40NSwxMS4xOCwxNS4xNVpNMzAuOTEsMjQ4LjA1aC0xMi40MnYxNC44OGgxMi40MmM0LjQ5LDAsNi45Ni0yLjk5LDYuOTYtNy40cy0yLjI5LTcuNDktNi45Ni03LjQ5Wk0zMS41MiwyODkuNTJjNi4yNSwwLDkuNTEtNC4xNCw5LjUxLTguNzIsMC00LjMxLTIuODItOC44MS05LjI1LTguODFoLTEzLjN2MTcuNTJoMTMuMDNaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTkwLjA4LDI1OGgxMC4yMXY0MS4xMmgtMTAuMjF2LTYuNDNjLTIuMTEsNS4yLTguNjMsNy40OS0xMi43Nyw3LjQ5LTEwLjU3LDAtMTYuNDctNy4xMy0xNi40Ny0xOS4xMXYtMjMuMDdoMTAuMjF2MjIuNjNjMCw2LjYsMy45NiwxMC4wNCw4LjU0LDEwLjA0czEwLjQ4LTIuNjQsMTAuNDgtMTAuNjZ2LTIyLjAxWiIvPg0KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMTAuODcsMjQzLjQ3YzAtMy42MSwzLjA4LTYuMjUsNi42OS02LjI1czYuNiwyLjY0LDYuNiw2LjI1LTIuOTEsNi4yNS02LjYsNi4yNS02LjY5LTIuNzMtNi42OS02LjI1Wk0xMTIuNDUsMjk5LjEydi00MS4xMmgxMC4yMXY0MS4xMmgtMTAuMjFaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzNC44MiwyOTkuMTJ2LTYzLjQ5aDEwLjIxdjYzLjQ5aC0xMC4yMVoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTg4LjYyLDIzNS42M2gxMC4yMXY2My40OWgtMTAuMjF2LTUuNDZjLTIuODIsNC4zMi04LjYzLDYuNTItMTMuNjUsNi41Mi0xMC44MywwLTIwLjI1LTguNTQtMjAuMjUtMjEuNjZzOS4zMy0yMS41NywyMC4xNy0yMS41N2M1LjIsMCwxMC45MiwyLjExLDEzLjc0LDYuNDN2LTI3Ljc0Wk0xODguNDUsMjc4LjQzYzAtNy4yMi01Ljk5LTExLjk4LTExLjg5LTExLjk4LTYuMzQsMC0xMS41NCw1LjExLTExLjU0LDExLjk4czUuMiwxMi4yNCwxMS41NCwxMi4yNCwxMS44OS01LjAyLDExLjg5LTEyLjI0WiIvPg0KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0yMDkuNDEsMjQzLjQ3YzAtMy42MSwzLjA4LTYuMjUsNi42OS02LjI1czYuNiwyLjY0LDYuNiw2LjI1LTIuOTEsNi4yNS02LjYsNi4yNS02LjY5LTIuNzMtNi42OS02LjI1Wk0yMTAuOTksMjk5LjEydi00MS4xMmgxMC4yMXY0MS4xMmgtMTAuMjFaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI3Mi44MSwyNzYuMDV2MjMuMDdoLTEwLjIxdi0yMi4zN2MwLTYuNi0zLjk2LTEwLjEzLTguNTQtMTAuMTNzLTEwLjQ4LDIuNzMtMTAuNDgsMTAuNjV2MjEuODRoLTEwLjIxdi00MS4xMmgxMC4yMXY2LjUyYzIuMTEtNS4yLDguNTQtNy41NywxMi43Ny03LjU3LDEwLjU3LDAsMTYuNDcsNy4xMywxNi40NywxOS4xMVoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMzE1Ljg3LDI1OGgxMC4yMXYzNS43NWMwLDE4LjQ5LTguOTgsMjYuNS0yMy4wNywyNi41LTguNDUsMC0xNS44NS00LjU4LTE5LjQ2LTExLjk4bDguNDUtMy44OGMyLjAzLDMuOTYsNi41Miw2LjYsMTEuMDEsNi42LDcuOTIsMCwxMi44Ni00LjQ5LDEyLjg2LTE2LjI5di0uOTdjLTIuOTEsNC4yMy04LjYzLDYuNDMtMTMuNjUsNi40My0xMC44MywwLTIwLjI1LTguNTQtMjAuMjUtMjEuNjZzOS4zMy0yMS41NywyMC4xNy0yMS41N2M1LjI4LDAsMTAuODMsMi4yLDEzLjc0LDYuNDN2LTUuMzdaTTMxNS43LDI3OC40M2MwLTcuMjItNS45OS0xMS45OC0xMS44OS0xMS45OC02LjM0LDAtMTEuNTQsNS4xMS0xMS41NCwxMS45OHM1LjIsMTIuMjQsMTEuNTQsMTIuMjQsMTEuODktNS4wMiwxMS44OS0xMi4yNFoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNDA1LjUyLDI4MS44NmMwLDguNTQtNi4wOCwxNy4yNi0xOC42NywxNy4yNmgtMjUuNDV2LTYwLjY3aDIzLjZjMTAuNTcsMCwxNy4yNiw2LjM0LDE3LjI2LDE1LjU5LDAsNC43NS0xLjc2LDEwLjQ4LTcuOTMsMTIuNjgsNy40LDEuNSwxMS4xOCw4LjQ1LDExLjE4LDE1LjE1Wk0zODQuNTYsMjQ4LjA1aC0xMi40MnYxNC44OGgxMi40MmM0LjQ5LDAsNi45Ni0yLjk5LDYuOTYtNy40cy0yLjI5LTcuNDktNi45Ni03LjQ5Wk0zODUuMTcsMjg5LjUyYzYuMjUsMCw5LjUxLTQuMTQsOS41MS04LjcyLDAtNC4zMS0yLjgyLTguODEtOS4yNS04LjgxaC0xMy4zdjE3LjUyaDEzLjAzWiIvPg0KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik00NTUuNDUsMjgyLjEzaC0zMS44OGMxLjE0LDUuNzIsNS41NSw4LjgxLDExLjcxLDguODEsNC40LDAsOC43Mi0xLjk0LDExLjEtNS4yOGw2Ljg3LDUuMmMtMy43OSw1Ljk5LTExLjA5LDkuMzMtMTguNTgsOS4zMy0xMi4yNCwwLTIxLjU3LTguODEtMjEuNTctMjEuNjZzOS43OC0yMS41NywyMS41Ny0yMS41NywyMC45Niw4LjM3LDIwLjk2LDIxLjIyYzAsMS4xNC0uMDksMi40Ny0uMTgsMy45NlpNNDQ1LjUsMjc0Ljk5Yy0uNjItNS42NC01LjAyLTguOTgtMTAuNzQtOC45OHMtOS45NSwyLjczLTExLjE4LDguOThoMjEuOTNaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTQ4Ny4wNiwyNTh2OC4xaC04LjcydjMzLjAyaC0xMC4yMXYtMzMuMDJoLTcuNHYtOC4xaDcuNHYtMTUuMTVoMTAuMjF2MTUuMTVoOC43MloiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNTE3LjUzLDI1OHY4LjFoLTguNzJ2MzMuMDJoLTEwLjIydi0zMy4wMmgtNy40di04LjFoNy40di0xNS4xNWgxMC4yMnYxNS4xNWg4LjcyWiIvPg0KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik01NjQuMzgsMjgyLjEzaC0zMS44OGMxLjE1LDUuNzIsNS41NSw4LjgxLDExLjcxLDguODEsNC40LDAsOC43Mi0xLjk0LDExLjEtNS4yOGw2Ljg3LDUuMmMtMy43OSw1Ljk5LTExLjA5LDkuMzMtMTguNTgsOS4zMy0xMi4yNCwwLTIxLjU3LTguODEtMjEuNTctMjEuNjZzOS43Ny0yMS41NywyMS41Ny0yMS41NywyMC45Niw4LjM3LDIwLjk2LDIxLjIyYzAsMS4xNC0uMDksMi40Ny0uMTgsMy45NlpNNTU0LjQzLDI3NC45OWMtLjYyLTUuNjQtNS4wMi04Ljk4LTEwLjc0LTguOThzLTkuOTUsMi43My0xMS4xOCw4Ljk4aDIxLjkzWiIvPg0KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik02MDIuNjksMjU4LjM1bC0yLjAzLDkuNjljLTIuMzgtMS4yMy00LjQ5LTEuNS01Ljk5LTEuNS02LjY5LDAtMTAuMzksNi42OS0xMC4zOSwxOC4yM3YxNC4zNWgtMTAuM3YtNDEuMTJoMTAuMjF2OC44MWMyLjItNi44Nyw2LjY5LTkuODYsMTEuOC05Ljg2LDIuNDcsMCw1LjExLjUzLDYuNjksMS40MVoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNjY0LjMzLDIzOC40NWgxMC43NHY2MC42N2gtOS43N2wtMjQuMjItNDAuODZ2NDAuODZoLTEwLjc0di02MC42N2gxMC4xM2wyMy44Niw0MC41MXYtNDAuNTFaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTcyNy43MywyODIuMTNoLTMxLjg4YzEuMTQsNS43Miw1LjU1LDguODEsMTEuNzEsOC44MSw0LjQsMCw4LjcyLTEuOTQsMTEuMS01LjI4bDYuODcsNS4yYy0zLjc5LDUuOTktMTEuMDksOS4zMy0xOC41OCw5LjMzLTEyLjI0LDAtMjEuNTctOC44MS0yMS41Ny0yMS42NnM5Ljc3LTIxLjU3LDIxLjU3LTIxLjU3LDIwLjk2LDguMzcsMjAuOTYsMjEuMjJjMCwxLjE0LS4wOSwyLjQ3LS4xOCwzLjk2Wk03MTcuNzgsMjc0Ljk5Yy0uNjItNS42NC01LjAyLTguOTgtMTAuNzQtOC45OHMtOS45NSwyLjczLTExLjE4LDguOThoMjEuOTNaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTc1OS4zNSwyNTh2OC4xaC04LjcydjMzLjAyaC0xMC4yMXYtMzMuMDJoLTcuNHYtOC4xaDcuNHYtMTUuMTVoMTAuMjF2MTUuMTVoOC43MloiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNODE2Ljc2LDI1OGgxMS4wMWwtMTQuNzksNDEuMTJoLTguNjNsLTkuNi0yOC4wOS05LjE2LDI4LjA5aC04LjU0bC0xNS4yMy00MS4xMmgxMS4wMWw4LjcyLDI2LjUsOC43Mi0yNi41aDkuMDdsOC43MiwyNi41LDguNzItMjYuNVoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNODMxLjU2LDI3OC41MmMwLTEzLjAzLDEwLjEzLTIxLjU3LDIxLjg0LTIxLjU3czIxLjkzLDguNTQsMjEuOTMsMjEuNTctMTAuMjEsMjEuNjYtMjEuOTMsMjEuNjYtMjEuODQtOC42My0yMS44NC0yMS42NlpNODY1LjAyLDI3OC41MmMwLTcuMDQtNS4yOC0xMi4wNi0xMS42Mi0xMi4wNnMtMTEuNTQsNS4wMi0xMS41NCwxMi4wNiw1LjIsMTIuMTUsMTEuNTQsMTIuMTUsMTEuNjItNC45MywxMS42Mi0xMi4xNVoiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNOTEzLjYzLDI1OC4zNWwtMi4wMyw5LjY5Yy0yLjM4LTEuMjMtNC40OS0xLjUtNS45OS0xLjUtNi42OSwwLTEwLjM5LDYuNjktMTAuMzksMTguMjN2MTQuMzVoLTEwLjN2LTQxLjEyaDEwLjIxdjguODFjMi4yLTYuODcsNi42OS05Ljg2LDExLjgtOS44NiwyLjQ3LDAsNS4xMS41Myw2LjY5LDEuNDFaIi8+DQogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTk1OS42LDI5OS4xMmgtMTIuOTRsLTE2LjAzLTE4LjY3djE4LjY3aC0xMC4yMXYtNjMuNDloMTAuMjF2MzUuNDlsMTEuOC0xMy4xMmgxMy4zbC0xNi43MywxNy45NiwyMC42MSwyMy4xNloiLz4NCiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNOTYxLjEsMjg2LjQ0aDkuNmMwLDIuODIsMi40Nyw1LjQ2LDYuNzgsNS40Niw0LjA1LDAsNi42OS0yLjAzLDYuNjktNC42NywwLTIuMjktMS43Ni0zLjM1LTQuODQtNC4wNWwtNS40Ni0xLjQxYy05LjI1LTIuNDctMTEuNjItNy40LTExLjYyLTEyLjU5LDAtNi40Myw2LjM0LTEyLjI0LDE1LjMyLTEyLjI0LDcuMzEsMCwxNS41OSwzLjcsMTUuNSwxMi44NmgtOS43N2MwLTIuODItMi41NS00LjU4LTUuNDYtNC41OC0zLjE3LDAtNS4zNywxLjg1LTUuMzcsNC40LDAsMi4xMSwyLjAyLDMuMzUsNC40LDMuODhsNi42LDEuNzZjOS4yNSwyLjM4LDEwLjkyLDguMTksMTAuOTIsMTEuOTgsMCw4LjM3LTguMzcsMTIuOTQtMTYuNzMsMTIuOTRzLTE2LjM4LTQuOTMtMTYuNTYtMTMuNzRaIi8+DQogICAgICA8L2c+DQogICAgPC9nPg0KICA8L2c+DQo8L3N2Zz4=" alt="Company Logo" />
        <div class="header-info">
          <h1>IQGeo Test Report</h1>
        </div>
        ${downloadAndLinksSection}
      </div>
  
      <div class="top-section">
        <div class="project-info">
          <h3>Project Info</h3>
          <p><strong>Environment:</strong> ${this.environment}</p>
          <p><strong>Execution Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
  
        <div class="summary-and-chart">
          <div class="summary">
            <h2>Test Results Summary</h2>
            <p><strong>Total:</strong> ${total} | <strong>Passed:</strong> ${passed} | <strong>Failed:</strong> ${failed} | <strong>Skipped:</strong> ${skipped}</p>
          </div>
          <div class="chart-container">
            <canvas id="donutChart" width="300" height="300"></canvas>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Suite</th>
            <th>Test Name</th>
            <th>Status</th>
            <th>Duration</th>
            ${includeActionButtons ? "<th>Details</th>" : "<th>Steps</th>"}
            ${includeActionButtons ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
  
      <script>
      const centerTextPlugin = {
  id: 'centerText',
  beforeDraw(chart) {
    const { width } = chart;
    const { height } = chart;
    const ctx = chart.ctx;
    ctx.restore();
    ctx.font = 1.25 + 'em Arial';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const x = width / 2;
    const y = height / 2;

    ctx.fillStyle = '#4caf50'; // Passed color
    ctx.fillText("${passedPercentage}%", x, y - 40);

    ctx.fillStyle = '#f44336'; // Failed color
    ctx.fillText("${failedPercentage}%", x, y - 10);

    ctx.fillStyle = '#ff9800'; // Skipped color
    ctx.fillText("${skippedPercentage}%", x, y + 20);

    ctx.save();
  }
};

      const ctx = document.getElementById('donutChart').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Passed', 'Failed', 'Skipped'],
          datasets: [{
            data: [${passed}, ${failed}, ${skipped}],
            backgroundColor: ['#4caf50', '#f44336', '#ff9800'],
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: function(tooltipItem) {
                  const percentage = ((tooltipItem.raw / ${total}) * 100).toFixed(2);
                  return ' ' + tooltipItem.label + ': ' + percentage + '%';
                }
              }
            }
          }
        },
          plugins: [centerTextPlugin]
      });
        function toggleSteps(idx) {
        const row = document.getElementById('steps-' + idx);
        row.style.display = row.style.display === 'table-row' ? 'none' : 'table-row';
      }
</script>
     
 <script>
  function createBug(index, projectId, issueTypeId) {
   const element = document.getElementById('bug-data-' + index);
    const encoded = element.value;
    const data = JSON.parse(atob(encoded));

    const summary = encodeURIComponent('Bug: ' + data.name);

    let description = '{code}Steps to Reproduce:\\n\\n' + data.steps.map((s, i) => (i + 1) + '. ' + s).join('\\n\\n')+ '\\n{code}';

    if (data.screenshot) description += '\\n\\n*Screenshot:* (' + data.screenshot + ')';
    if (data.video) description += '\\n\\n*Video:* (' + data.video + ')';
    if (data.trace) description += '\\n\\n*Trace:* (' + data.trace + ')';
    if (data.details) description += '\\n\\n*Details:* (' + data.details + ')';
    
    if (data.error) {
      description += '\\n\\n{code}\\n' + data.error + '\\n{code}';
    }

  const jiraBaseUrl = "https://your-domain.atlassian.net";

	const jiraUrl = jiraBaseUrl + '/secure/CreateIssueDetails%21init.jspa?pid=' + projectId + '&issuetype=' + issueTypeId + '&summary=' + summary + '&description='+ encodeURIComponent(description);
    window.open(jiraUrl, '_blank');
  }
</script>


      </body>
      </html>
    `;
	};

	private displayGeneratedReportHelperInfo = (reportPath: string) => {
		console.log(`> Custom test Report Generated: ${reportPath}`);
		if (!this.isJenkins) {
			console.log(`> To open custom test report run:

		  npm run test:report:custom
		  `);
		}
	};

	// Save generated report to disk
	private async saveReports(detailedReport: string, customerReport: string): Promise<void> {
		const reportDir = process.env.CUSTOM_REPORT_DIR || "reports";

		fs.mkdirSync(reportDir, { recursive: true });

		fs.writeFileSync(path.join(reportDir, "index.html"), customerReport);
		if (this.isJenkins && detailedReport !== "") {
			fs.writeFileSync(path.join(reportDir, "detailed-report.html"), detailedReport);
			this.displayGeneratedReportHelperInfo(`${reportDir}/detailed-report.html`);
		} else {
			this.displayGeneratedReportHelperInfo(`${reportDir}/index.html`);
		}
	}

	// Called when tests are complete
	onEnd(): void {
		this.generateReport();
	}
}
