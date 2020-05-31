import {AxiosInstance} from 'axios';
import {Client, Message, PrivateChannel, TextableChannel} from 'eris';
import {InteractiveHelper} from 'eris-command-framework';
import CommandContext from 'eris-command-framework/CommandContext';
import Embed from 'eris-command-framework/Model/Embed';
import {EventEmitter} from 'events';
import {Logger} from 'winston';
import ReportPlugin from './index';

import * as interfaces from './interfaces';
import Report from './Model/Report';

enum Step {
    START,
    REPORTED_USERS,
    REASON,
    LINKS,
    FINISHED,
}

export default class ReportCreator extends EventEmitter {
    private report: Report = new Report();

    private dm: PrivateChannel | TextableChannel;

    private step: Step = Step.START;

    private categories: Array<{id: number, name: string, tags: interfaces.Tag[]}> = [];

    private emitters: EventEmitter[] = [];

    // @ts-ignore
    private emojis = {
        numbers: ['1⃣', '2⃣', '3⃣', '4⃣', '5⃣', '6⃣', '7⃣', '8⃣', '9⃣'],
        letters: [
            '🇦',
            '🇧',
            '🇨',
            '🇩',
            '🇪',
            '🇫',
            '🇬',
            '🇭',
            '🇮',
            '🇯',
            '🇰',
            '🇱',
            '🇲',
            '🇳',
            '🇴',
            '🇵',
            '🇶',
            '🇷',
            '🇸',
            '🇹',
            '🇺',
            '🇻',
            '🇼',
            '🇽',
            '🇾',
            '🇿',
        ],
    };

    private interactive: boolean = true;

    constructor(
        // @ts-ignore
        private client: Client,
        private interactiveHelper: InteractiveHelper,
        // @ts-ignore
        private logger: Logger,
        private api: AxiosInstance,
        private context: CommandContext,
        init?: Partial<Report>,
    ) {
        super();

        this.report.reporter = context.user.id;
        if (context.guild && context.guild.id !== ReportPlugin.Config.hotlineGuildId) {
            this.report.guildId = context.guild.id;
        }
        if (init) {
            if ((init.reason || init.tags) && !init.links) {
                init.noLinks = true;
            }
            Object.assign(this.report, init);
            this.interactive = this.setInteractive();
        }

        this.initialize();
    }

    public async close(inactive = false) {
        if (inactive) {
            await this.dm.createMessage('Seems like you forgot about this. Closing out your report.');
        }
        this.step = Step.FINISHED;
        this.emit('close');
        this.emitters.forEach((x) => x.emit('close'));
    }

    private setInteractive(): boolean {
        if (!this.report.reportedUsers) {
            return true;
        }

        if (!this.report.reason && !this.report.tags) {
            return true;
        }

        if (!this.report.noLinks && (!this.report.links || this.report.links.length === 0)) {
            return true;
        }

        return false;
    }

    private async initialize(): Promise<void> {
        await this.setTagsAndCategories();
        if (this.interactive) {
            this.dm = await this.context.user.getDMChannel();
        }

        await this.next();
    }

    private async setTagsAndCategories(): Promise<void> {
        const tags = await this.api.get<{count: number, results: interfaces.Tag[]}>('/tag');
        for (const tag of tags.data.results) {
            let index = this.categories.findIndex((x) => x.id === tag.category.id);
            if (index === -1) {
                this.categories.push({id: tag.category.id, name: tag.category.name, tags: []});
                index = this.categories.length - 1;
            }
            this.categories[index].tags.push(tag);
        }
    }

    private async next() {
        this.step = this.getCurrentStep();
        await this.askQuestion();
    }

    private async askQuestion(): Promise<void> {
        let msg: Message;
        switch (this.step) {
            case Step.REPORTED_USERS:
                msg = await this.dm.createMessage('Who would you like to report? Please provide user ids or mentions');
                this.listenForReplies(msg, null, {messageCreate: this.setReportedUsers});
                break;
            case Step.REASON:
                msg = await this.createTagsMessage();
                this.listenForReplies(msg, {messageCreate: this.setReportReason});
                break;
            case Step.LINKS:
                msg = await this.dm.createMessage('Do you have any links to attach to this report?');
                this.listenForReplies(msg, {messageCreate: this.setReportLinks});
                break;
            case Step.FINISHED:
                const content = 'Report is being created, please wait.';
                if (this.interactive) {
                    msg = await this.dm.createMessage(content);
                } else {
                    msg = await this.context.channel.createMessage(content);
                }
                try {
                    const response = await this.api.post<interfaces.Report>('/report', this.report);
                    await msg.edit('Report Created. ID: ' + response.data.id);
                } catch (e) {
                    const errorResponse = e.response ? e.response.data : e;
                    switch (errorResponse.message) {
                        case 'Matching report already exists.':
                            await msg.edit(errorResponse.message);
                            break;

                        default:
                            await msg.edit('There was an error creating the report. Try again later!');
                            console.error(JSON.stringify(
                                {response: errorResponse, request: this.report},
                                null,
                                2,
                            ));
                    }
                }
                this.emit('close');
                break;
            default:
                throw new Error('Step with no action:' + this.step);
        }
    }

    private listenForReplies(
        message: Message,
        onListeners?: {[event: string]: Function},
        onceListeners?: {[event: string]: Function},
    ) {
        const emitter = this.interactiveHelper.listenForReplies(message, this.context.user);
        emitter.on('close', this.close.bind(this));
        if (onListeners) {
            for (const event of Object.keys(onListeners)) {
                emitter.on(event, onListeners[event].bind(this, emitter));
            }
        }
        if (onceListeners) {
            for (const event of Object.keys(onceListeners)) {
                emitter.once(event, onceListeners[event].bind(this, emitter));
            }
        }

        this.emitters.push(emitter);
    }

    private async createTagsMessage(): Promise<Message> {
        const embed       = new Embed();
        embed.title       = 'Pick the tags for this report, or type your own reason: ';
        embed.description = `You can specify multiple combinations in a single message (space or comma delimited).
        
Examples:

\`1a\`
\`2b, 3a, 4a\`

`;
        embed.fields      = [];
        const alphabet    = 'abcdefghijklmnopqrstuvwxyz';
        for (const category of this.categories) {
            const tags  = category.tags;
            const field = {name: `__**${category.id}) ${category.name}**__`, value: '', inline: true};
            let i       = 0;
            for (const tag of tags) {
                field.value += `${alphabet[i++]}) ${tag.name}\n`;
            }
            embed.fields.push(field);
        }

        return await this.dm.createMessage({embed: embed.serialize()});
    }

    private async setReportedUsers(emitter: EventEmitter, message: Message): Promise<void> {
        this.report.reportedUsers = [...new Set(message.content.match(/(\d+)/gm))];

        emitter.emit('close');
        await this.next();
    }

    private async setReportReason(emitter: EventEmitter, message: Message): Promise<void> {
        const content = message.content.replace(/^-/, '');

        const regex      = /(\d+[a-z])/g;
        const firstRegex = /^(\d+[a-z])/;
        if (!firstRegex.test(content)) {
            if (message.content.length <= 5) {
                await this.dm.createMessage('That message is too short. Please specify a longer reason.');

                return;
            }

            this.report.reason = content;
        } else {
            const alphabet               = 'abcdefghijklmnopqrstuvwxyz';
            const matches                = content.match(regex);
            const tags: interfaces.Tag[] = [];
            for (const match of matches) {
                const category = this.categories.find((x) => x.id === parseInt(match.match(/\d+/)[0], 10));
                const tag      = category.tags[alphabet.indexOf(match.match(/[a-z]/)[0])];

                tags.push(tag);
            }

            this.report.tags = tags.filter((x) => !!x).map((x) => x.id);
        }

        emitter.emit('close');
        await this.next();
    }

    // @ts-ignore
    private async setReportLinks(emitter: EventEmitter, message: Message): Promise<void> {
        if (require('yes-no').parse(message.content || '') !== false) {
            this.report.links = message.content
                .replace(/,/g, '')
                .replace(/\s+/g, ' ')
                .split(' ')
                .map((link) => link.trim().replace(/(^<)|(>$)/, ''))
                .filter((x) => !!x);
        }

        if (message.attachments.length > 0) {
            const links       = message.attachments.map((x) => x.url);
            this.report.links = this.report.links ? this.report.links.concat(...links) : links;
        }

        if (!this.report.links || this.report.links.length === 0) {
            this.report.noLinks = true;
        }

        emitter.emit('close');
        await this.next();
    }

    private getCurrentStep(): Step {
        if (!this.report.reportedUsers || this.report.reportedUsers.length === 0) {
            return Step.REPORTED_USERS;
        }

        if (!this.report.reason && (!this.report.tags || this.report.tags.length === 0)) {
            return Step.REASON;
        }

        if (!this.report.noLinks && (!this.report.links || this.report.links.length === 0)) {
            return Step.LINKS;
        }

        return Step.FINISHED;
    }
}
