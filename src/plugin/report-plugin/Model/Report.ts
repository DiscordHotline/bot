export default class Report {
    public reporter: string;

    public guildId: string;

    public reportedUsers: string[];

    public reason: string;

    public links: string[];

    public tags: number[];

    public messageIds: string[];

    public noLinks = false;
}
