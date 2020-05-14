import {Client, Message, TextableChannel} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import {inject, injectable} from 'inversify';
import {Connection, Repository} from 'typeorm';
import {Logger} from 'winston';

import Application, {ApprovalType} from '../Entity/Application';
import {Config} from '../index';
import ApplicationService from '../Service/ApplicationService';
import Types from '../types';

interface ApplicationMessage {
    application: Application;
    approvalMessage: Message;
}

@injectable()
export default class ApplicationApprovalListener {
    private messages: ApplicationMessage[] = [];

    private repo: Repository<Application>;

    private approvalChannel: TextableChannel;

    private voteChannel: TextableChannel;

    public constructor(
        @inject(CFTypes.connection) connection: Connection,
        @inject(CFTypes.logger) private logger: Logger,
        @inject(Types.application.service.application) private appService: ApplicationService,
        @inject(CFTypes.discordClient) private client: Client,
        @inject(Types.application.config) private config: Config,
    ) {
        this.repo = connection.getRepository(Application);
        client.once('ready', this.initialize.bind(this));
        client.on('messageCreate', this.onMessageCreate.bind(this));
        client.on('messageReactionAdd', this.onMessageReactionAdd.bind(this));
    }

    public async initialize(): Promise<void> {
        this.logger.info('Initializing ApplicationApprovalListener');
        setTimeout(
            async () => {
                if (!this.config.approvalChannel) {
                    throw new Error('Approval channel not set!');
                }

                if (!this.config.voteChannel) {
                    throw new Error('Vote channel not set!');
                }

                this.approvalChannel = this.client.getChannel(this.config.approvalChannel) as TextableChannel;
                if (!this.approvalChannel) {
                    throw new Error('Approval channel not found!');
                }
                this.voteChannel = this.client.getChannel(this.config.voteChannel) as TextableChannel;
                if (!this.voteChannel) {
                    throw new Error('Vote channel not found!');
                }

                await this.loadMessages();
            },
            10000,
        );
    }

    private async onMessageCreate(appMessage: Message): Promise<void> {
        if (!appMessage.channel || !this.approvalChannel || appMessage.channel.id !== this.approvalChannel.id) {
            this.logger.info('No appMessage, or this.approvalChannel in ApplicationApprovalListener');

            await this.initialize();
        }
        setTimeout(
            async () => {
                const approvalMessageId = appMessage.channel.id + ':' + appMessage.id;
                const application       = await this.repo.findOne({approvalMessageId});
                if (!application) {
                    this.logger.warn(
                        'Approval - message Create: Found a message without an application: %j',
                        {
                            id:      appMessage.id,
                            content: appMessage.content,
                            embeds:  appMessage.embeds[0].title,
                        },
                    );

                    return;
                }

                this.messages.push({application, approvalMessage: appMessage});
            },
            5000,
        );
    }

    private async onMessageReactionAdd(
        appMessage: Message,
        _emoji: { id: string, name: string },
        userId: string,
    ): Promise<void> {
        if (!appMessage || !appMessage.channel || !this.approvalChannel) {
            this.logger.info('No appMessage, or this.approvalChannel in ApplicationApprovalListener');
            await this.initialize();
        }

        try {
            appMessage = await this.client.getMessage(appMessage.channel.id, appMessage.id);
        } catch (e) {
            return;
        }
        if (!appMessage.channel || appMessage.channel.id !== this.config.approvalChannel) {
            return;
        }

        if (userId === this.client.user.id) {
            return;
        }

        const approvalMessageId = appMessage.channel.id + ':' + appMessage.id;
        const application       = await this.repo.findOne({approvalMessageId});
        if (!application) {
            this.logger.warn(
                'Approval - Reaction: Found a message without an application: %j',
                {id: appMessage.id, content: appMessage.content, embeds: appMessage.embeds[0].title},
            );

            return;
        }

        if (await this.updateApplication(appMessage, application)) {
            const index = this.messages.findIndex((x) => (
                x.approvalMessage.id === appMessage.id && x.application.id === application.id
            ));

            this.messages.splice(index, 1);
        }
    }

    private async loadMessages(): Promise<void> {
        this.logger.info('Loading application approval messages!');

        const applications: Application[] = await this.repo.find({voteApproved: ApprovalType.AWAITING});
        for (const application of applications) {
            const [channelId, messageId] = application.approvalMessageId.split(':');
            try {
                const message: Message = await this.client.getMessage(channelId, messageId);
                if (!await this.updateApplication(message, application)) {
                    continue;
                }

                this.messages.push({application, approvalMessage: message});
            } catch (e) {
                this.logger.warn(
                    'Approval - Load: Found an application without a message, denying: %j',
                    application,
                );

                application.voteApproved = ApprovalType.DENIED;
                await application.save();
            }
        }
    }

    private async updateApplication(
        message: Message,
        application: Application,
    ): Promise<boolean> {
        const reactions = message.reactions;
        if (Object.keys(reactions).length === 0) {
            try {
                await message.addReaction('✅');
                await message.addReaction('❌');
            } catch (ignored) {
            }
        }

        let approved = ApprovalType.AWAITING;
        for (const name of Object.keys(reactions)) {
            if (['✅', '❌'].indexOf(name) === -1) {
                return false;
            }

            const stats = reactions[name];
            if (name === '✅' && stats.count > (stats.me ? 1 : 0)) {
                approved = ApprovalType.APPROVED;
            }
            if (name === '❌' && stats.count > (stats.me ? 1 : 0)) {
                approved = ApprovalType.DENIED;
            }
        }

        if (approved === ApprovalType.AWAITING) {
            this.logger.info('Approval vote is still awaiting for "%s"', application.guild.name);

            return false;
        }

        application.approvedDate = new Date();
        application.voteApproved = approved;
        await application.save();

        if (approved === ApprovalType.DENIED) {
            this.logger.info('Approval vote has been denied for "%s"', application.guild.name);

            // Attempt notifying the requestee that their application has been denied
            try {
                const requester = await this.client.users.get(application.requestUser);
                const dm        = await requester.getDMChannel();
                await dm.createMessage({content: `Your application for ${application.guild.name} has been denied`});
            } catch (err) {
                this.logger.warn(
                    'Failed to send a notification to the requestee that their application got denied: %j',
                    err,
                );
            }

            return true;
        }

        this.logger.info('Approval vote has been approved for "%s"', application.guild.name);

        const voteMessage             = await this.appService.postApplicationMessage(application, false);
        application.voteMessageId     = voteMessage.channel.id + ':' + voteMessage.id;
        application.discussionChannel = (await this.appService.createDiscussionChannel(application)).id;

        await application.save();
        await sleep(500);

        await message.addReaction('☑');

        return true;
    }
}

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
