import * as eris from 'eris';
import {Member, RESTChannelInvite, Role} from 'eris';
import {AbstractPlugin} from 'eris-command-framework';
import Decorator from 'eris-command-framework/Decorator';
import {Container, inject, injectable} from 'inversify';
import 'source-map-support/register';
import {In} from 'typeorm';

import {Application, Guild, Invite as HotlineInvite} from './Entity';
import {ApprovalType, VoteType} from './Entity/Application';
import ApplicationApprovalListener from './Listener/ApplicationApprovalListener';
import ApplicationVoteListener from './Listener/ApplicationVoteListener';
import ApplicationService from './Service/ApplicationService';
import Types from './types';

export interface Config {
    hotlineGuildId: string;
    approvalChannel: string;
    voteChannel: string;
    discussionCategory: string;
    inviteChannel: string;
    serverOwnerRole: string;
    serverListChannel: string;
    dividerRole: string;
}

export const Entities = {Application, Guild, Invite: HotlineInvite};
export {ApprovalType, VoteType} from './Entity/Application';

@injectable()
export default class Plugin extends AbstractPlugin {
    public static Config: Config;

    public static addToContainer(container: Container): void {
        container.bind<Config>(Types.application.config).toConstantValue(this.Config);
        container.bind<ApplicationApprovalListener>(Types.application.listener.approval)
            .to(ApplicationApprovalListener);
        container.bind<ApplicationVoteListener>(Types.application.listener.vote)
            .to(ApplicationVoteListener);
        container.bind<ApplicationService>(Types.application.service.application).to(ApplicationService);
    }

    public static getEntities(): any[] {
        return [Application, HotlineInvite, Guild];
    }

    @inject(Types.application.listener.approval)
    private applicationListener: ApplicationApprovalListener;
    @inject(Types.application.listener.vote)
    private voteListener: ApplicationVoteListener;
    @inject(Types.application.service.application)
    private appService: ApplicationService;

    public async initialize(): Promise<void> {
        this.logger.info('Initializing ApplicationPlugin');
        await this.appService.initialize();
        await this.applicationListener.initialize();
        await this.voteListener.initialize();

        this.client.on('ready', () => this.leaveBadGuilds());
        this.client.on('guildCreate', () => this.leaveBadGuilds());
        this.client.on('guildMemberAdd', this.onGuildMemberChange.bind(this, false));
        this.client.on('guildMemberRemove', this.onGuildMemberChange.bind(this, false));
        this.client.on('guildMemberUpdate', this.onGuildMemberChange.bind(this, false));
    }

    @Decorator.Command('role color', 'Updates a role color', 'Updates the role color for the given guild.')
    @Decorator.Alias('role colour')
    public async updateRoleColorCommand(guildId: string, color: string): Promise<void> {
        const colorRe = /^#?([A-Fa-f0-9]{6})$/;
        if (!colorRe.test(color)) {
            return this.reply('That doesn\'t look like a valid color. Please provide a hex color.');
        }

        const guild = await this.getRepository<Guild>(Guild).findOne({guildId});
        if (!guild) {
            return this.reply('That doesn\'t look like a valid guild. Please provide a guild id.');
        }
        if (!guild.roleId) {
            return this.reply('That guild hasn\'t been claimed yet! Please claim it first.');
        }
        if (!guild.owners.includes(this.context.user.id)) {
            return this.reply('You aren\'t the owner / representative of this guild.');
        }

        color              = color.replace(/^#/, '');
        const colorInteger = parseInt(color, 16);

        const hotline = this.client.guilds.get(Plugin.Config.hotlineGuildId);
        const role    = hotline.roles.get(guild.roleId);
        await role.edit({color: colorInteger});

        return this.reply('Your role color has been updated for: ' + role.mention);
    }

    @Decorator.Command('role name', 'Updates a role name', 'Updates the role name for the given guild.')
    public async updateRoleNameCommand(guildId: string, @Decorator.Remainder() name: string): Promise<void> {
        const nameRe = /^[0-9A-Za-z-_\s]+$/;
        if (!nameRe.test(name)) {
            // tslint:disable-next-line:max-line-length
            return this.reply(
                'That doesn\'t look like a valid name. Name should be alphanumeric and can contain spaces, dashes and underscores.');
        }

        const guild = await this.getRepository<Guild>(Guild).findOne({guildId});
        if (!guild) {
            return this.reply('That doesn\'t look like a valid guild. Please provide a guild id.');
        }
        if (!guild.roleId) {
            return this.reply('That guild hasn\'t been claimed yet! Please claim it first.');
        }
        if (!guild.owners.includes(this.context.user.id)) {
            return this.reply('You aren\'t the owner / representative of this guild.');
        }

        const hotline = this.client.guilds.get(Plugin.Config.hotlineGuildId);
        const role    = hotline.roles.get(guild.roleId);
        await role.edit({name});

        return this.reply('Your role name has been updated for: ' + role.mention);
    }

    @Decorator.Command('list update', 'Updates the servers list')
    @Decorator.Permission('list.update')
    public async updateGuildList(): Promise<void> {
        await this.appService.updateServerList();
        await this.reactOk();
    }

    @Decorator.Command('guild owner', 'Toggles a guild owner for the given guild')
    @Decorator.Permission('guild.owner')
    @Decorator.Types({user: eris.Member})
    public async updateGuildOwnerCommand(guildId: string, user: eris.Member): Promise<void> {
        const guild = await this.getRepository<Guild>(Guild).findOne(guildId);
        if (!guild) {
            return this.reply('Could not find a guild in the db with that id.');
        }

        const index = guild.owners.indexOf(user.id);
        if (index >= 0) {
            guild.owners.splice(index, 1);
        } else {
            guild.owners.push(user.id);
        }

        await guild.save();

        return this.reactOk();
    }

    @Decorator.Command('invite create', 'Creates an invite')
    @Decorator.Permission('invite.create')
    public async createInviteCommand(guildId: string, maxUses: number): Promise<void> {
        const guild = await this.getRepository<Guild>(Guild).findOne(guildId);
        if (!guild) {
            return this.reply('Could not find a guild in the db with that id.');
        }

        const invite = await this.appService.createHotlineInvite(maxUses, null, guild);

        await this.reply(`https://apply.hotline.gg/${invite.code}`);
    }

    @Decorator.Command('invite revoke', 'Revokes an invite')
    @Decorator.Permission('invite.revoke')
    public async revokeInviteCommand(inviteCode: string): Promise<void> {
        const invite = await this.getRepository<HotlineInvite>(HotlineInvite).findOne({code: inviteCode});

        if (!invite) {
            await this.reply('Unknown invite');

            return;
        }

        invite.revoked = true;
        await invite.save();

        await this.reply(`Successfully revoked invite ${inviteCode}`);
    }

    @Decorator.Command('roles sort', 'Approves an application')
    @Decorator.Permission('role.sort')
    public async SortRoles(): Promise<void> {
        await this.appService.sortRoles();
        await this.reactOk();
    }

    @Decorator.Command('app update', 'Updates an application')
    @Decorator.Permission('application.update')
    public async UpdateCommand(id: number): Promise<void> {
        const application = await this.getRepository<Application>(Application).findOne(id);
        if (!application) {
            return await this.reactNotOk();
        }

        await this.appService.postApplicationMessage(application, true);
        await this.reactOk();
    }

    @Decorator.Command('app approve', 'Approves an application')
    @Decorator.Permission('application.approve')
    public async ApproveCommand(id: number): Promise<void> {
        const application = await this.getRepository<Application>(Application).findOne(id);
        if (!application) {
            return await this.reactNotOk();
        }

        await this.appService.approveOrDeny(application, ApprovalType.APPROVED);
        await this.reactOk();
    }

    @Decorator.Command('app deny', 'Denies an application')
    @Decorator.Permission('application.approve')
    public async DenyCommand(id: number): Promise<void> {
        const application = await this.getRepository<Application>(Application).findOne(id);
        if (!application) {
            return await this.reactNotOk();
        }

        await this.appService.approveOrDeny(application, ApprovalType.DENIED);
        await this.reactOk();
    }

    @Decorator.Command('app view', 'Views an application')
    @Decorator.Permission('application.view')
    public async ViewCommand(id: number): Promise<void> {
        const application = await this.getRepository<Application>(Application).findOne(id);
        if (!application) {
            return await this.reactNotOk();
        }

        const fields  = [];
        let approvals = 0;
        let denies    = 0;
        for (const userId of Object.keys(application.votes.entries)) {
            const user = this.client.users.get(userId);
            const vote = application.votes.entries[userId];
            approvals += vote === VoteType.APPROVED ? 1 : 0;
            denies += vote === VoteType.DENIED ? 1 : 0;

            fields.push({
                name:   user.username + '#' + user.discriminator,
                value:  vote === VoteType.APPROVED ? '✅' : '❌',
                inline: true,
            });
        }

        await this.embedMessage((x) => {
            x.author = {
                name: 'Vote Results for: ' + application.guild.name,
            };
            x.fields = fields;
            x.title  = `Current Results: ${approvals} - ${denies}`;
        });
    }

    @Decorator.Command('claim', 'Claim a server')
    @Decorator.Permission('claim')
    @Decorator.Types({role: Role})
    public async ClaimCommand(inviteUrl: string, @Decorator.Remainder() role: Role): Promise<void> {
        await this.context.message.delete();

        const repo = this.getRepository<Guild>(Guild);
        const re   = /(https?:\/\/)?(discord\.gg|discordapp\.com\/invite)\//;
        let invite: RESTChannelInvite;

        try {
            invite = <any> await this.client.getInvite(inviteUrl.replace(re, ''));
        } catch (error) {
            return this.reply('An issue occured while trying to fetch your invite. Make sure it\'s correct.');
        }

        if ((invite as any).temporary) {
            return this.reply('Your invite is not permanent.');
        }

        const guild = await repo.findOne({roleId: role.id});
        if (!guild) {
            console.log(invite);

            return this.reply('There was an error. Bug someone on Staff.');
        }

        if (!guild.inviteCode) {
            guild.inviteCode = invite.code;
        }

        guild.guildId = invite.guild.id;
        guild.owners.push(this.context.member.id);
        guild.owners = [...new Set(guild.owners)];
        await repo.save(guild);

        return this.reply(this.context.member.mention + ' has claimed ' + invite.guild.name);
    }

    private async onGuildMemberChange(removed: boolean, guild: eris.Guild, member: Member): Promise<void> {
        if (guild.id !== Plugin.Config.hotlineGuildId) {
            return;
        }

        // Wait 5 seconds, then update roles
        setTimeout(this.updateMemberRoles.bind(this, member, removed), 5 * 1000);
    }

    private async updateMemberRoles(member: Member, removed = false) {
        const repo = this.getRepository<Guild>(Guild);

        const guilds = [];
        if (!removed) {
            for (const roleId of member.roles.values()) {
                const role = member.guild.roles.get(roleId);
                if (this.isServerRole(role)) {
                    const guild = await repo.findOne({roleId: role.id});
                    guild.members.push(member.id);
                    guild.members = [...new Set(guild.members)];
                    guilds.push(guild);
                }
            }
        }

        // @ts-ignore
        const results = await repo.find({members: In([member.id])});
        for (const guild of results) {
            if (removed || member.roles.indexOf(guild.roleId) === -1) {
                guild.members.splice(guild.members.indexOf(member.id), 1);
                guilds.push(guild);
            }
        }

        await repo.save(guilds);
    }

    private isServerRole(role: Role): boolean {
        const divider = role.guild.roles.get('204103172682153984'); // --Community Tags-- / Divider role

        return role.position < divider.position && role.id !== role.guild.id;
    }

    /**
     * Leave all guilds we don't have DB records for.
     */
    private async leaveBadGuilds(): Promise<void> {
        if (process.env.ENVIRONMENT === 'dev' && !process.env.LEAVE_BAD_GUILDS) {
            console.log('In development environment, not leaving bad guilds.');

            return;
        }

        const guilds = await this.getRepository<Guild>(Guild).find();

        this.logger.info(`Current a member of ${this.client.guilds.size - 1} guilds, with ${guilds.length} in the db.`);
        for (const guild of this.client.guilds.values()) {
            if (guild.id === Plugin.Config.hotlineGuildId) {
                continue;
            }

            const hasGuild = guilds.findIndex((x) => x.guildId === guild.id) >= 0;
            if (!hasGuild) {
                this.logger.info('Found a bad guild. Leaving: %s - %s', guild.name, guild.id);
                const notificationChannel = this.client.getChannel('526158510279360532') as eris.TextChannel;

                if (notificationChannel) {
                    await notificationChannel.createMessage(
                        `Found a bad guild: \`${guild.name} - ${guild.id}\`. Owner is <@${guild.ownerID}>`,
                    );
                }
                // await guild.leave();
            }
        }
    }
};
