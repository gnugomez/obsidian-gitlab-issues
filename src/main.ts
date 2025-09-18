import { addIcon, Notice, Plugin, setIcon } from "obsidian";
import Filesystem from "./filesystem";
import GitlabLoader from "./GitlabLoader/gitlab-loader";
import gitlabIcon from "./assets/gitlab-icon.svg";
import { GitlabIssuesSettingTab } from "./SettingsTab/settings-tab";
import { GitlabIssuesSettings } from "./SettingsTab/settings-types";
import { DEFAULT_SETTINGS } from "./SettingsTab/settings";
import { logger } from "./utils/utils";
import { GitlabIssuePostProcessor } from "./GitlabPostProcessor/gitlab-issue-postprocessor";

const GITLAB_ISSUE_CARD_CSS = `
/* GitLab Issue Card Styles */
.gitlab-issue-card {
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 12px;
	margin: 8px 0;
	background: var(--background-secondary);
	font-family: var(--font-text);
	font-size: 14px;
	line-height: 1.4;
}

.gitlab-issue-card .issue-header {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
	gap: 8px;
}

.gitlab-issue-card .issue-state {
	padding: 2px 6px;
	border-radius: 3px;
	font-size: 11px;
	font-weight: bold;
	color: white;
}

.gitlab-issue-card .issue-state.opened {
	background-color: #1f883d;
}

.gitlab-issue-card .issue-state.closed {
	background-color: #8250df;
}

.gitlab-issue-card .issue-title {
	color: var(--text-normal);
	text-decoration: none;
	font-weight: 600;
	flex: 1;
}

.gitlab-issue-card .issue-title:hover {
	text-decoration: underline;
}

.gitlab-issue-card .issue-metadata {
	font-size: 12px;
	color: var(--text-muted);
	margin-bottom: 8px;
}

.gitlab-issue-card .issue-labels {
	margin-bottom: 8px;
}

.gitlab-issue-card .issue-label {
	display: inline-block;
	padding: 2px 6px;
	margin-right: 4px;
	margin-bottom: 2px;
	background-color: var(--background-modifier-border);
	border-radius: 3px;
	font-size: 11px;
}

.gitlab-issue-card .issue-description {
	color: var(--text-muted);
	font-size: 13px;
	margin-top: 8px;
	border-top: 1px solid var(--background-modifier-border);
	padding-top: 8px;
}
`;

export default class GitlabIssuesPlugin extends Plugin {
	settings: GitlabIssuesSettings;
	startupTimeout: number | null = null;
	automaticRefresh: number | null = null;
	iconAdded = false;
	statusBarItem: HTMLElement | null = null;
	isLoading = false;
	gitlabPostProcessor: GitlabIssuePostProcessor | null = null;

	async onload() {
		logger("Starting plugin");

		await this.loadSettings();
		this.addSettingTab(new GitlabIssuesSettingTab(this.app, this));

		// Add CSS for GitLab issue cards
		this.addStyles();

		// Always register the post-processor, it will check for token internally
		this.registerGitlabPostProcessor();

		if (this.settings.gitlabToken) {
			this.createOutputFolder();
			this.addIconToLeftRibbon();
			this.addCommandToPalette();
			this.refreshIssuesAtStartup();
			this.scheduleAutomaticRefresh();
			this.addGitlabStatusBarItem();
		}
	}

	addGitlabStatusBarItem() {
		if (!this.statusBarItem) {
			this.statusBarItem = this.addStatusBarItem();
			this.statusBarItem.classList.add("mod-clickable");
			setIcon(this.statusBarItem, "gitlab");
			this.statusBarItem.addEventListener("click", () => {
				if (!this.isLoading) {
					this.fetchFromGitlab();
				}
			});
		}
	}

	scheduleAutomaticRefresh() {
		if (this.automaticRefresh) {
			window.clearInterval(this.automaticRefresh);
		}
		if (this.settings.intervalOfRefresh !== "off") {
			const intervalMinutes = parseInt(this.settings.intervalOfRefresh);

			this.automaticRefresh = this.registerInterval(
				window.setInterval(() => {
					this.fetchFromGitlab();
				}, intervalMinutes * 60 * 1000)
			); // every settings interval in minutes
		}
	}

	onunload() {
		// Remove CSS styles
		const styleEl = document.getElementById('gitlab-issues-plugin-styles');
		if (styleEl) {
			styleEl.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update post-processor with new settings
		if (this.gitlabPostProcessor) {
			this.gitlabPostProcessor = new GitlabIssuePostProcessor(this.settings);
		}
	}

	private addIconToLeftRibbon() {
		if (this.settings.showIcon) {
			// Ensure we did not already add an icon
			if (!this.iconAdded) {
				addIcon("gitlab", gitlabIcon);
				this.addRibbonIcon(
					"gitlab",
					"Gitlab Issues",
					(evt: MouseEvent) => {
						this.fetchFromGitlab();
					}
				);
				this.iconAdded = true;
			}
		}
	}

	private addCommandToPalette() {
		this.addCommand({
			id: "import-gitlab-issues",
			name: "Import Gitlab Issues",
			callback: () => {
				if (!this.isLoading) {
					this.fetchFromGitlab();
				}
			},
		});
	}

	private refreshIssuesAtStartup() {
		// Clear existing startup timeout
		if (this.startupTimeout) {
			window.clearTimeout(this.startupTimeout);
		}
		if (this.settings.refreshOnStartup) {
			this.startupTimeout = this.registerInterval(
				window.setTimeout(() => {
					this.fetchFromGitlab();
				}, 30 * 1000)
			); // after 30 seconds
		}
	}

	private createOutputFolder() {
		const fs = new Filesystem(this.app, this.settings);
		fs.createOutputDirectory();
	}

	private async fetchFromGitlab() {
		if (this.isLoading) {
			return; // Prevent multiple simultaneous requests
		}

		this.setLoadingState(true);

		try {
			const loader = new GitlabLoader(this.app, this.settings);
			await loader.loadIssues();
		} catch (error) {
			new Notice("Failed to update issues from Gitlab");
			logger(`Error fetching from GitLab: ${error}`);
		} finally {
			this.setLoadingState(false);
		}
	}

	private setLoadingState(loading: boolean) {
		this.isLoading = loading;

		// Update status bar icon
		if (this.statusBarItem) {
			setIcon(this.statusBarItem, loading ? "refresh-cw" : "gitlab");
			if (loading) {
				this.statusBarItem.classList.add("loading");
			} else {
				this.statusBarItem.classList.remove("loading");
			}
		}
	}

	private registerGitlabPostProcessor() {
		this.gitlabPostProcessor = new GitlabIssuePostProcessor(this.settings);
		this.registerMarkdownPostProcessor((element, context) => {
			// Post-processor should be synchronous, so we handle async operations internally
			if (this.gitlabPostProcessor) {
				this.gitlabPostProcessor.processElement(element, context);
			}
		});
	}

	private addStyles() {
		// Add CSS styles for GitLab issue cards
		const styleEl = document.createElement('style');
		styleEl.id = 'gitlab-issues-plugin-styles';
		styleEl.textContent = GITLAB_ISSUE_CARD_CSS;
		document.head.appendChild(styleEl);
	}
}
