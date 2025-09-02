import { addIcon, Notice, Plugin, setIcon } from "obsidian";
import Filesystem from "./filesystem";
import GitlabLoader from "./GitlabLoader/gitlab-loader";
import gitlabIcon from "./assets/gitlab-icon.svg";
import { GitlabIssuesSettingTab } from "./SettingsTab/settings-tab";
import { GitlabIssuesSettings } from "./SettingsTab/settings-types";
import { DEFAULT_SETTINGS } from "./SettingsTab/settings";
import { logger } from "./utils/utils";

export default class GitlabIssuesPlugin extends Plugin {
	settings: GitlabIssuesSettings;
	startupTimeout: number | null = null;
	automaticRefresh: number | null = null;
	iconAdded = false;
	statusBarItem: HTMLElement | null = null;
	isLoading = false;

	async onload() {
		logger("Starting plugin");

		await this.loadSettings();
		this.addSettingTab(new GitlabIssuesSettingTab(this.app, this));

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

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
}
