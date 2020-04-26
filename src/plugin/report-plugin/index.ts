import {AxiosInstance, default as axios} from 'axios';
import {GuildChannel, Permission as ErisPermission, TextChannel} from 'eris';
import {AbstractPlugin} from 'eris-command-framework';
import Decorator from 'eris-command-framework/Decorator';
import Embed from 'eris-command-framework/Model/Embed';
import Permission from 'eris-command-framework/Util/Permission';
import {Express} from 'express';
import {Container, inject, injectable} from 'inversify';
import Guild from '../application-plugin/Entity/Guild';

import ConfirmCreator from './ConfirmCreator';
import ReportMessage from './Entity/ReportMessage';
import Subscription from './Entity/Subscription';
import * as interfaces from './interfaces';
import ReportListener from './Listener/ReportListener';
import Report from './Model/Report';
import ReportConfirmFactory from './ReportConfirmFactory';
import ReportCreator from './ReportCreator';
import ReportCreatorFactory from './ReportCreatorFactory';
import Types from './types';

@injectable()
export default class ReportPlugin extends AbstractPlugin {
    public static Config: interfaces.Config;

    public static async addToContainer(container: Container, types: any): Promise<void> {
        const {value: {key: apiKey}} = await container.get<any>(types.secrets.manager).getSecret('hotline/bot/api');

        container.bind<string>(Types.api.url).toConstantValue(this.Config.apiUrl || 'https://api.hotline.gg/');
        container.bind<AxiosInstance>(Types.api.client).toDynamicValue((ctx) => axios.create({
            baseURL: ctx.container.get(Types.api.url),
            timeout: 30000,
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Accepts':       'application/json',
                'Content-Type':  'application/json',
            },
        }));
        container.bind<ReportCreatorFactory>(Types.factory.interactiveReport).to(ReportCreatorFactory);
        container.bind<ReportConfirmFactory>(Types.factory.confirmReport).to(ReportConfirmFactory);
        container.bind<Express>(Types.webserver).toService(types.webserver);
        container.bind<ReportListener>(Types.listener.report).to(ReportListener);
    }

    public static getEntities(): any[] {
        return [ReportMessage, Subscription];
    }

    private reportConversations: {[key: string]: ReportCreator} = {};
    private confirmMessages: {[key: string]: ConfirmCreator}    = {};
    @inject(Types.api.client)
    private api: AxiosInstance;
    @inject(Types.listener.report)
    private reportListener: ReportListener;
    @inject(Types.factory.interactiveReport)
    private reportCreatorFactory: ReportCreatorFactory;
    @inject(Types.factory.confirmReport)
    private reportConfirmFactory: ReportConfirmFactory;

    public async initialize(): Promise<void> {
        this.client.once(
            'ready',
            () => this.reportListener.initialize().then(() => this.logger.info('Webhook Listener Initialized')),
        );
    }

    @Decorator.Command('report confirm', 'Confirms a report')
    @Decorator.Alias('confirm', 'Confirms a report')
    public async ConfirmCommand(id: number): Promise<void> {
        const channel = this.context.channel as TextChannel;

        if (channel.guild.id !== ReportPlugin.Config.hotlineGuildId) {
            return this.reply('This command currently only works in Hotline');
        }

        let report: interfaces.Report;
        try {
            report = (await this.api.get<interfaces.Report>('/report/' + id)).data;
        } catch (error) {
            console.log(error);

            return this.reply('Unknown report');
        }

        this.confirmMessages[this.context.message.id] = this.reportConfirmFactory.create(report, this.context);
    }

    @Decorator.Command('report get', 'Gets a report')
    @Decorator.Alias('show', 'show report')
    public async GetCommand(id: number): Promise<void> {
        const report = (await this.api.get<interfaces.Report>('/report/' + id)).data;
        const embed  = await this.createReportEmbed(report);

        return this.sendEmbed(embed);
    }

    @Decorator.Command('alert')
    public async AlertCommand(@Decorator.Remainder() _: string) {
        return this.reply(`Please use ${this.prefix}report`);
    }

    @Decorator.Command('report delete', 'Delete a report')
    @Decorator.Permission('report.delete')
    public async DeleteReportCommand(id: number): Promise<void> {
        const message = await this.context.channel.createMessage('Deleting Report... Please wait.');
        try {
            await this.api.delete('/report/' + id);

            await message.edit('Successfully deleted report: ' + id);
        } catch (e) {
            this.logger.error('Error deleting report: %s', e.message);

            await message.edit('There was an error deleting the report.');
        }
    }

    @Decorator.Command(
        'report ids',
        'Get a report\'s ids',
        'Space delimited by default. If you want to delimit by another character, pass it as the last argument\n' +
        'If you pass \`mention\`, it will create mentions (space delimited)',
    )
    public async GetReportIdsCommand(id: number, delimiter: string = null): Promise<void> {
        let report: interfaces.Report;
        try {
            const reportRequest = await this.api.get<interfaces.Report>('/report/' + id);
            report              = reportRequest.data;
        } catch (e) {
            return this.reply('There was no report with that id.');
        }

        let ids = report.reportedUsers.map((x) => x.id);
        if (delimiter === 'mention') {
            ids       = ids.map((x) => '<@' + x + '>');
            delimiter = null;
        }

        return this.reply(ids.join(delimiter || ' '));
    }

    @Decorator.Command('report edit', 'Edit a report', 'Passing IDs, tags, and links act as a toggle.')
    public async EditReportCommand(id: number, field: string, @Decorator.Remainder() value: string): Promise<any> {
        const message = await this.context.channel.createMessage('Editing Report... Please wait.');

        const mapping = {
            id:     'ids',
            ids:    'ids',
            user:   'ids',
            users:  'ids',
            reason: 'reason',
            tag:    'tags',
            tags:   'tags',
            link:   'links',
            links:  'links',
            guild:  'guild',
            server: 'guild',
        };

        let report: interfaces.Report;
        try {
            const reportRequest = await this.api.get<interfaces.Report>('/report/' + id);
            report              = reportRequest.data;
        } catch (e) {
            await message.edit('Could not find a report with that id.');
        }

        let body: {tags?: number[], reason?: string, links?: string[], reportedUsers?: string[], guildId?: string};
        switch (mapping[field.toString().toLowerCase()]) {
            default:
                return message.edit(
                    `\`${field}\` is not a valid field. Pick from: ids, reason, tags, links, or guild`,
                );
            case 'reason':
                body = {reason: value};
                break;
            case 'ids':
                const ids = value.toString().match(/(\d+)/g);
                if (!ids) {
                    return message.edit('Those don\'t look like valid ids.');
                }

                const users: string[] = report.reportedUsers.map((x) => x.id);
                ids.forEach((x) => {
                    const index = users.indexOf(x);
                    if (index >= 0) {
                        users.splice(index, 1);
                    } else {
                        users.push(x);
                    }
                });

                body = {reportedUsers: users};
                break;
            case 'tags':
                const tags = value.toString().match(/(\d+)/g).map((x) => parseInt(x, 10));
                if (!tags) {
                    return message.edit('Those don\'t look like valid tags.');
                }
                const validTags = await this.getAllTags();
                for (const tag of tags) {
                    if (validTags.findIndex((vt) => vt.id === tag) === -1) {
                        return this.reply(`\`${tag}\` is not a valid tag.`);
                    }
                }

                const newTags: number[] = report.tags.map((x) => x.id);
                tags.forEach((x) => {
                    const index = newTags.indexOf(x);
                    if (index >= 0) {
                        newTags.splice(index, 1);
                    } else {
                        newTags.push(x);
                    }
                });

                body = {tags: newTags};
                break;
            case 'links':
                const links = value.toString().split(' ').filter((x) => x.length > 1);
                if (!links || links.length === 0) {
                    return message.edit('Those don\'t look like valid links.');
                }

                const newLinks: string[] = report.links;
                links.forEach((x) => {
                    const index = newLinks.indexOf(x);
                    if (index >= 0) {
                        newLinks.splice(index, 1);
                    } else {
                        newLinks.push(x);
                    }
                });

                body = {links: newLinks};
                break;
            case 'guild':
                if (!/\d+/.test(value)) {
                    return message.edit('That doesn\'t look like a valid guild id');
                }

                body = {guildId: value};
                break;
        }

        try {
            await this.api.post(`/report/${id}`, body);

            return message.edit('Report has been edited.');
        } catch (e) {
            if (e.response && e.response.data) {
                this.logger.error('Error editing report: %j', e.response.data);
            } else {
                this.logger.error('Error editing report: %O', e);
            }

            return message.edit('There was an error editing the report.');
        }
    }

    @Decorator.Command('report close', 'Closes an open report')
    public async CloseReportCommand(): Promise<void> {
        const report = this.reportConversations[this.context.user.id];
        if (!report) {
            return this.reactOk().catch(() => {
                this.reply('You do not have a report open.');
            });
        }

        await report.close(false);
        delete this.reportConversations[this.context.user.id];

        return this.reactOk().catch(() => {
            this.reply('Closed your report.');
        });
    }

    // tslint:disable-next-line
    @Decorator.Command(
        'setup',
        'Set up reports to go to a channel the bot is in.',
        `Set up reports to go to a channel the bot is in.

onlyUsersInGuild should be \`true\` or \`yes\` (anything else is no). If set to no, will alert you to ALL reports.

tags should be \`all\` or a list (comma or space delimited) list of tags from: {prefix}tags
`,
    )
    @Decorator.Types({channel: GuildChannel})
    public async SetupCommand(
        channel: GuildChannel,
        onlyUsersInGuild: string            = null,
        @Decorator.Remainder() tags: string = null,
    ) {
        onlyUsersInGuild = onlyUsersInGuild || 'true';
        tags             = tags || 'all';

        const repo    = this.database.getRepository<Guild>(Guild);
        const dbGuild = await repo.findOne({guildId: channel.guild.id});
        if (!dbGuild) {
            // tslint:disable-next-line:max-line-length
            return this.reply(
                'This channel belongs to a unknown guild. Double check to make sure that this guild belongs to Hotline and else contact the admins with the admin ping.');
        }
        if (!dbGuild.owners.includes(this.context.member.id)) {
            // tslint:disable-next-line:max-line-length
            return this.reply(
                'You are not listed as one of the owners/representatives for this guild. You can claim the guild with the claim command if you are a owner/representative of this guild.');
        }

        const member        = channel.guild.members.get(this.client.user.id);
        const perms         = Permission.getEffectivePermission(member, channel);
        const requiredPerms = 85056;

        // tslint:disable-next-line
        if ((perms & requiredPerms) != requiredPerms) {
            const perm = new ErisPermission(requiredPerms, 0);

            return this.reply(
                'Failed to set up the channel. Required Permissions: ' +
                Object.keys(perm.json).join(', '),
            );
        }

        const subscription      = new Subscription();
        subscription.guildId    = channel.guild.id;
        subscription.channelId  = channel.id;
        subscription.insertDate = new Date();
        subscription.updateDate = new Date();
        subscription.tags       = [];

        onlyUsersInGuild             = onlyUsersInGuild.toLowerCase();
        subscription.onUsersInServer = ['true', 'yes'].includes(onlyUsersInGuild);

        const validTags = await this.getAllTags();
        let parsedTags: number[];
        if (tags === 'all') {
            parsedTags = validTags.map((tag) => tag.id);
        } else {
            parsedTags = tags.replace(/\s+/g, ',')
                .split(',')
                .map((x) => parseInt(x, 10));
        }
        for (const tag of parsedTags) {
            if (validTags.findIndex((vt) => vt.id === tag) === -1) {
                return this.reply(`\`${tag}\` is not a valid tag.`);
            }
            subscription.tags.push(tag);
        }
        await (channel as TextChannel).createMessage('Watcher is now set up to post in this channel.');

        await subscription.save();

        return this.reactOk();
    }

    @Decorator.Command('requeue', 'Requeues a report')
    @Decorator.Permission('report.requeue')
    public async requeue(id: number) {
        await this.api.post(`/report/${id}/requeue`);

        return this.reactOk();
    }

    @Decorator.Command(
        'report create',
        'Creates a report',
        'If reason or tags aren\'t passed, this command becomes interactive, and will ask you to fill out the report.',
    )
    public async CreateCommand(@Decorator.Remainder() content: string = null): Promise<void> {
        // TODO: Replacing this in the future with a better way of disabling features
        if (process.env.maintenance) {
            return this.reply('Creating reports is currently not possible as maintenance mode is enabled.');
        }

        const init: Partial<Report> = {};
        if (content !== null) {
            // Some shitty logic here. Feel free to clean this up

            // Split the content on |
            const splitContent = content.toString().split('|');

            // Grab all the user ids in the first section
            const userIds = splitContent.shift().match(/(\d+)/g);
            // If there are none, the command is probably malformed
            if (userIds.length === 0) {
                // tslint:disable-next-line
                return await this.reply(
                    'Malformed message. Format is: `report ...user_ids | Links?: ...links | Reason?: reason | Tags?: ...tags');
            }
            init.reportedUsers = userIds;

            // Loop through all the sections
            for (const section of splitContent) {
                if (/Links:\s+/i.test(section)) {
                    init.links = section.replace(/Links:\s+/i, '')
                        .split(' ')
                        .map((link) => link.trim().replace(/(^<)|(>$)/, ''))
                        .filter((x) => !!x);
                }

                if (this.context.message.attachments.length > 0) {
                    const links = this.context.message.attachments.map((x) => x.url);
                    init.links  = init.links ? init.links.concat(...links) : links;
                }

                if (/Reason:\s/.test(section)) {
                    init.reason = section.replace(/Reason:\s+/i, '').trim();
                }

                if (/Tags:\s/.test(section)) {
                    init.tags = section.replace(/Tags:\s+/i, '')
                        .split(' ')
                        .map((x) => parseInt(x, 10))
                        .filter((x) => !!x);
                }
            }
        }

        if (this.reportConversations[this.context.user.id]) {
            return this.reply(
                'You already have an open report. Please finish or close that one before creating another one.',
            );
        }

        this.reportConversations[this.context.user.id] = this.reportCreatorFactory.create(
            this.context,
            init,
        );
        await this.context.message.addReaction('📫').catch(() => {
            this.reply('Started the report process in your DMs.');
        });
        this.reportConversations[this.context.user.id].on('close', () => {
            delete this.reportConversations[this.context.user.id];
        });
    }

    @Decorator.Command('tag create', 'Creates a tag')
    @Decorator.Permission('tag.create')
    public async CreateTagCommand(category: number, @Decorator.Remainder() name: string): Promise<void> {
        const message = await this.context.channel.createMessage('Creating Tag... Please wait.');
        await this.api.post<interfaces.Tag>('/tag', {name, category});

        await message.edit('Tag Created!');
    }

    @Decorator.Command('tag list', 'Lists tags')
    @Decorator.Alias('tags')
    public async ListTagCommand(category: number = null): Promise<void> {
        const message = await this.context.channel.createMessage('Fetching Tag... Please wait.');
        try {
            let url = '/tag';
            if (category !== null) {
                url += '?category=' + category;
            }
            const categories: {[category: string]: interfaces.Tag[]} = {};

            const tags = await this.api.get<{count: number, results: interfaces.Tag[]}>(url);
            if (tags.data.count === 0) {
                await message.edit('There are no tags matching your query.');

                return;
            }

            for (const tag of tags.data.results) {
                if (!categories[tag.category.name]) {
                    categories[tag.category.name] = [];
                }
                categories[tag.category.name].push(tag);
            }

            let content = '';
            for (const cat of Object.keys(categories)) {
                content += `**${cat}:**\n`;
                for (const tag of categories[cat]) {
                    content += `    ${tag.id}) ${tag.name}\n`;
                }
            }

            await message.edit(content);
        } catch (e) {
            this.logger.error('Error fetching tags: %s', e.message);

            await message.edit('There was an error fetching the tags.');
        }
    }

    @Decorator.Command('tag edit', 'Edit a tag')
    @Decorator.Permission('tag.edit')
    public async EditTagCommand(id: number, @Decorator.Remainder() name: string): Promise<void> {
        const message = await this.context.channel.createMessage('Editing Tag... Please wait.');
        try {
            await this.api.post('/tag/' + id, {name});

            await message.edit('Successfully edited tag: ' + id);
        } catch (e) {
            this.logger.error('Error editing tags: %s', e.message);

            await message.edit('There was an error editing the tag.');
        }
    }

    @Decorator.Command('tag delete', 'Delete a tag')
    @Decorator.Permission('tag.delete')
    public async DeleteTagCommand(id: number): Promise<void> {
        const message = await this.context.channel.createMessage('Deleting Tag... Please wait.');
        try {
            await this.api.delete('/tag/' + id);

            await message.edit('Successfully deleted tag: ' + id);
        } catch (e) {
            this.logger.error('Error deleting tag: %s', e.message);

            await message.edit('There was an error deleting the tag.');
        }
    }

    private async createReportEmbed(report: interfaces.Report): Promise<Embed> {
        const reporter      = this.client.users.get(report.reporter.id);
        const reportedUsers = report.reportedUsers.map((x) => `<@${x.id}> (${x.id})`);
        const links         = report.links.map((x) => `<${x}>`);
        const tags          = report.tags.map((x) => x.name);

        const embed = new Embed();

        embed.author      = {name: `Report ID: ${report.id}`};
        embed.description =
            `**Users:** ${reportedUsers.length > 10 ? `${reportedUsers.slice(0, 10)
                .join(', ')} (limited to 10 out of ${reportedUsers.length})` : reportedUsers.slice(0, 10).join(', ')}

**Reason:** ${report.reason}

**Links:** ${links.length === 0 ? 'None' : links.join('\n')}

**Tags:** ${tags.length === 0 ? 'None' : tags.join(', ')}`;
        embed.footer      = {
            text: `Reporter: ${reporter.username}#${reporter.discriminator}` +
                  ` | Confirmations: ${report.confirmations.length + 1}`,
        };

        return embed;
    }

    private async getAllTags(): Promise<interfaces.Tag[]> {
        const result = await this.api.get<{count: number, results: interfaces.Tag[]}>('/tag');

        return result.data.results;
    }
};
