import {AxiosInstance} from 'axios';
import {Client, Guild, GuildChannel, Member, Message, TextChannel} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import Embed from 'eris-command-framework/Model/Embed';
import {Express} from 'express';
import {parse} from 'flatted';
import {inject, injectable} from 'inversify';
import * as moment from 'moment';
import {Connection, Repository} from 'typeorm';
import {Logger} from 'winston';

import ReportMessage from '../Entity/ReportMessage';
import Subscription from '../Entity/Subscription';
import * as interfaces from '../interfaces';
import Types from '../types';

@injectable()
export default class ReportListener {
    private reportMessageRepo: Repository<ReportMessage>;

    private subscriptionRepo: Repository<Subscription>;

    public constructor(
        @inject(Types.webserver) private webserver: Express,
        @inject(CFTypes.logger) private logger: Logger,
        @inject(CFTypes.connection) private database: Connection,
        @inject(CFTypes.discordClient) private client: Client,
        @inject(Types.api.client) private api: AxiosInstance,
    ) {
        this.reportMessageRepo = this.database.getRepository<ReportMessage>(ReportMessage);
        this.subscriptionRepo  = this.database.getRepository<Subscription>(Subscription);

        this.client.off('guildMemberAdd', this.onGuildMemberAdd.bind(this));
        this.client.on('guildMemberAdd', this.onGuildMemberAdd.bind(this));
        this.client.on('messageReactionAdd', this.onMessageReaction.bind(this));
    }

    public async initialize() {
        this.webserver.post('/subscription/global', async (req, res) => {
            const subscriptions                = await this.subscriptionRepo.find();
            const report: interfaces.Report    = parse(req.body.report);
            const oldReport: interfaces.Report = req.body.oldReport ? parse(req.body.report) : null;

            const shouldHaveMessage: number[] = [];

            // Loop through all the subscriptions
            const promises = subscriptions.map(async (subscription) => {
                // Grab all the tags for this subscription
                const tags = subscription.tags.map((x) => parseInt('' + x, 10));
                // Loop through all the report's tags
                for (const tag of report.tags) {
                    // If the subscription tags include the current tag
                    if (tags.includes(tag.id)) {
                        // Send it, mark as it shouldHaveMessage
                        shouldHaveMessage.push(subscription.id);

                        return this.sendReportToSubscription(req.body.action, report, subscription);
                    }
                }

                // If none of the tags matched, delete it!
                await this.sendReportToSubscription('delete', report, subscription);
            });

            // If there is an old report
            if (oldReport) {
                // Loop through all the subscriptions
                promises.push(...subscriptions
                    .filter((x) => !shouldHaveMessage.includes(x.id))
                    .map(async (subscription) => {
                        // Grab all the tags for this subscription
                        const tags        = subscription.tags.map((x) => parseInt('' + x, 10));
                        // Find all tags that are no longer in the new report
                        const removedTags = oldReport.tags.filter((x) => {
                            return report.tags.findIndex((y) => x.id === y.id) === -1;
                        });
                        // Loop through the removed tags
                        for (const tag of removedTags) {
                            // If the current removed tag matches a subscription's tags
                            if (tags.includes(tag.id)) {
                                // Delete it!
                                return this.sendReportToSubscription('delete', report, subscription);
                            }
                        }
                    }));
            }

            try {
                await Promise.all(promises);
                res.status(204).send();
            } catch (e) {
                console.log(e);
                res.status(500).json(e);
            }
        });
    }

    /**
     * Listen for new members on every guild (except hotline).
     *
     * Find reports on new members. If there are no reports, return early.
     * If there are reports, find all subscriptions for that guild, then make sure the reports match the subscriptions.
     *
     * Finally, take the matching subscriptions and edit them. This ensures that if there is already a message,
     * it wont post another one.
     */
    private async onGuildMemberAdd(guild: Guild, member: Member): Promise<void> {
        if (guild.id === '204100839806205953') {
            return;
        }

        const reportCall = await this.api.get<interfaces.ApiReportList>('/report?reported=' + member.id);
        if (reportCall.data.count === 0) {
            return;
        }

        const reports       = reportCall.data.results;
        const subscriptions = await this.subscriptionRepo.find({guildId: guild.id});
        for (const subscription of subscriptions) {
            const tags = subscription.tags.map((x) => parseInt('' + x, 10));
            for (const report of reports) {
                for (const tag of report.tags) {
                    if (tags.includes(tag.id)) {
                        // Edit any existing messages, if there are any, otherwise, add a new one.
                        return this.sendReportToSubscription('edit', report, subscription);
                    }
                }
            }
        }
    }

    private async onMessageReaction(
        message: Message,
        emoji: {id: string, name: string},
        userId: string,
    ): Promise<void> {
        if (!message.author) {
            try {
                message = await message.channel.getMessage(message.id);
            } catch (e) {
                return;
            }
        }
        if (message.author.id !== this.client.user.id || userId === this.client.user.id) {
            return;
        }

        // Only allow Hotline members to react
        const hotline = this.client.guilds.get('204100839806205953');
            
        try {
            const member = hotline.members.get(userId);
            if (!member) {
                return;
            }

            // Only allow members who are in the Member role.
            if (member.roles.indexOf('531617261077790720') == -1) {
                return;
            }
        } catch (e) {
            return;
        }

        const reportMessage = await this.reportMessageRepo.findOne({messageId: message.id});
        if (!reportMessage) {
            return;
        }

        const guild = (message.channel as GuildChannel).guild;
        if (!guild || guild.id === '204100839806205953') {
            return;
        }

        switch (emoji.name) {
            default:
                return;
            case '➕':
                await this.updateConfirmation(reportMessage.reportId, guild.id, userId, true);
                await message.removeReactions();
                await message.addReaction('❌');
                break;
            case '❌':
                await this.updateConfirmation(reportMessage.reportId, guild.id, userId, false);
                await message.removeReactions();
                await message.addReaction('➕');
                break;
        }
    }

    private async updateConfirmation(report: number, guild: string, user: string, confirmed: boolean): Promise<void> {
        const url = `/report/${report}/confirm`;
        try {
            await this.api.post(url, {guild, user, confirmed});
        } catch (e) {
            if (!e.response || !e.response.data || !e.response.data.message) {
                console.log(e.response && e.response.data ? e.response.data : e.response);

                throw e;
            }

            if (e.response.data.message === 'report already confirmed') {
                return;
            }

            throw e;
        }
    }

    private async sendReportToSubscription(
        action: 'new' | 'edit' | 'delete',
        report: interfaces.Report,
        subscription: Subscription,
    ): Promise<void> {
        const guild = this.client.guilds.get(subscription.guildId);
        if (!guild) {
            this.logger.error('Subscription found for unavailable guild: %s', subscription.guildId);

            return;
        }

        const channel: TextChannel = guild.channels.get(subscription.channelId) as TextChannel;
        if (!channel) {
            this.logger.error(
                'Subscription found for unavailable channel. Guild: %s, Channel: %s',
                guild.id,
                subscription.channelId,
            );

            return;
        }

        let message: Message;
        let reportMessage: ReportMessage = await this.reportMessageRepo.findOne({
            reportId:  report.id,
            guildId:   subscription.guildId,
            channelId: subscription.channelId,
        });
        const embed                      = await this.createReportEmbed(report);

        /**
         * If we are editing an existing report, go through here. (We should also test to see if somehow a new has
         * happened AFTER an edit.
         *
         * If there is no report message, just treat this as a new message
         */
        if (['edit', 'new'].indexOf(action) >= 0 && reportMessage) {
            try {
                message = await channel.getMessage(reportMessage.messageId);
            } catch (_) {
            }
            if (message) {
                await message.edit({embed: embed.serialize()});
                reportMessage.updateDate = new Date();
                await reportMessage.save();
            } else {
                try {
                    message = await channel.createMessage({embed: embed.serialize()});
                    this.addReactions(message);
                    reportMessage.messageId = message.id;
                    await reportMessage.save();
                } catch (e) {
                    console.error('Failed to create message: ' + JSON.stringify({
                        error:   e.message,
                        guild:   guild.id,
                        channel: channel.id,
                        report:  report.id,
                    }));

                    return;
                }
            }

            return;
        }

        /**
         * If we are deleting an existing report, go through here.
         *
         * If there is no report message, just skip this whole process. Nothing to do.
         */
        if (action === 'delete') {
            if (!reportMessage) {
                this.logger.warn('Deleting report with no reportMessage: %d %d', report.id, subscription.id);

                return;
            }

            try {
                message = await channel.getMessage(reportMessage.messageId);
            } catch (_) {
            }
            reportMessage.deleted = true;
            if (message) {
                await message.delete('Deleted Report');
                reportMessage.updateDate = new Date();
                await reportMessage.save();
            }

            return;
        }

        let hasUsers = false;
        if (subscription.onUsersInServer) {
            for (const user of report.reportedUsers) {
                if (guild.members.get(user.id)) {
                    hasUsers = true;
                }
            }
        }

        if (subscription.onUsersInServer && !hasUsers) {
            return;
        }

        /**
         * If we are creating a new report message, go through here
         *
         * Create a new reportMessage if there isn't one. This should usually happen here. Will only not happen if the
         * edit fires before a message is created
         */
        try {
            message = await channel.createMessage({embed: embed.serialize()});
            this.addReactions(message);
            if (!reportMessage) {
                reportMessage            = new ReportMessage();
                reportMessage.reportId   = report.id;
                reportMessage.guildId    = guild.id;
                reportMessage.channelId  = channel.id;
                reportMessage.insertDate = new Date();
            }

            reportMessage.messageId  = message.id;
            reportMessage.updateDate = new Date();

            await reportMessage.save();
        } catch (e) {
            console.error('Failed to create message: ' + JSON.stringify({
                error:   e.message,
                guild:   guild.id,
                channel: channel.id,
                report:  report.id,
            }));
        }

        return;
    }

    private async addReactions(message: Message): Promise<void> {
        if ((message.channel as TextChannel).guild.id !== '204100839806205953') {
            return message.addReaction('➕');
        }
    }

    private async createReportEmbed(report: interfaces.Report): Promise<Embed> {
        const reportedUsers = report.reportedUsers.map((x) => `<@${x.id}> (${x.id})`);
        const links         = report.links.map((x) => `<${x}>`);
        const tags          = report.tags.map((x) => x.name);

        let description = '**Users:**\n';
        if (reportedUsers.length > 10) {
            description += `${reportedUsers.slice(0, 10).join(', ')} (limited to 10 out of ${reportedUsers.length})`;
        } else {
            description += reportedUsers.join(', ');
        }

        if (report.reason) {
            description += `\n\n**Reason:**\n${report.reason}`;
        }

        if (report.tags.length > 0) {
            description += `\n\n**Tags:**\n${tags.join(', ')}`;
        }

        if (report.links.length > 0) {
            description += `\n\n**Links:**\n${links.join('\n')}`;
        }

        // description += `\n\n**Reporter:**\n${this.getReporter(report)}`;

        const created    = moment(report.insertDate).format('YYYY-MM-DD HH:mm');
        const footerText = `Confirmations: ${report.confirmations.length + 1} | Created: ${created}`;

        const embed = new Embed();

        embed.author      = {name: `Report ID: ${report.id}`};
        embed.description = description;
        embed.footer      = {text: footerText};
        embed.timestamp   = report.updateDate;

        return embed;
    }

    // private async getReporter(report: interfaces.Report): Promise<string> {}
}
