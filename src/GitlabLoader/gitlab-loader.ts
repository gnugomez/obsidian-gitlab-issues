import GitlabApi from "./gitlab-api";
import { GitlabIssue } from "./issue";
import { App } from "obsidian";
import Filesystem from "../filesystem";
import { Issue } from "./issue-types";
import { GitlabIssuesSettings } from "../SettingsTab/settings-types";
import { logger } from "../utils/utils";

export default class GitlabLoader {
	private fs: Filesystem;
	private settings: GitlabIssuesSettings;

	constructor(app: App, settings: GitlabIssuesSettings) {
		this.fs = new Filesystem(app, settings);
		this.settings = settings;
	}

	getUrl() {
		switch (this.settings.gitlabIssuesLevel) {
			case "project":
				return `${this.settings.gitlabApiUrl()}/projects/${
					this.settings.gitlabAppId
				}/issues?${this.settings.filter}`;
			case "group":
				return `${this.settings.gitlabApiUrl()}/groups/${
					this.settings.gitlabAppId
				}/issues?${this.settings.filter}`;
			case "personal":
			default:
				return `${this.settings.gitlabApiUrl()}/issues?${
					this.settings.filter
				}`;
		}
	}

	private parseCustomSources(
		customString: string
	): Array<{ type: "project" | "group"; id: string }> {
		return customString
			.split(",")
			.map((source) => source.trim())
			.filter((source) => source.length > 0)
			.map((source) => {
				const [typePrefix, id] = source.split(":");
				const type = typePrefix.trim().toUpperCase();

				if (type === "G") {
					return { type: "group" as const, id: id.trim() };
				} else if (type === "P") {
					return { type: "project" as const, id: id.trim() };
				} else {
					throw new Error(
						`Invalid source type: ${type}. Use G for group or P for project.`
					);
				}
			});
	}

	private getUrlForSource(type: "project" | "group", id: string): string {
		const baseUrl = this.settings.gitlabApiUrl();
		const filter = this.settings.filter;

		if (type === "project") {
			return `${baseUrl}/projects/${id}/issues?${filter}`;
		} else {
			return `${baseUrl}/groups/${id}/issues?${filter}`;
		}
	}

	async loadIssues() {
		if (this.settings.gitlabIssuesLevel === "custom") {
			await this.loadCustomIssues();
		} else {
			await this.loadSingleSourceIssues();
		}
	}

	private processIssuesData(issues: Array<Issue>) {
		const gitlabIssues = issues.map(
			(rawIssue: Issue) => new GitlabIssue(rawIssue)
		);

		if (this.settings.purgeIssues) {
			this.fs.purgeExistingIssues();
		}
		this.fs.processIssues(gitlabIssues);
	}

	private async loadSingleSourceIssues() {
		try {
			const issues = await GitlabApi.load<Array<Issue>>(
				encodeURI(this.getUrl()),
				this.settings.gitlabToken
			);
			this.processIssuesData(issues);
		} catch (error) {
			logger(error.message);
		}
	}

	private async loadCustomIssues() {
		try {
			const sources = this.parseCustomSources(this.settings.gitlabAppId);
			const requests = sources.map((source) =>
				GitlabApi.load<Array<Issue>>(
					encodeURI(this.getUrlForSource(source.type, source.id)),
					this.settings.gitlabToken
				)
			);

			const allIssuesArrays = await Promise.all(requests);
			// Flatten all issues arrays into a single array
			const allIssues = allIssuesArrays.flat();
			this.processIssuesData(allIssues);
		} catch (error) {
			logger(error.message);
		}
	}
}
