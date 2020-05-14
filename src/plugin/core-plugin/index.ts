import {Member, Message, Role, User} from 'eris';
import {AbstractPlugin, CommandService, types as CFTypes} from 'eris-command-framework';
import StringBuilder from 'eris-command-framework/Builder/StringBuilder';
import Decorator from 'eris-command-framework/Decorator';
import {default as Permission, PermissionType} from 'eris-command-framework/Entity/Permission';
import CommandInfo from 'eris-command-framework/Info/CommandInfo';
import SearchResult from 'eris-command-framework/Result/SearchResult';
import Authorizer from 'eris-command-framework/Security/Authorizer';
import {Container, inject, injectable} from 'inversify';
import {List} from 'linqts';
import {Dictionary} from 'typescript-collections';

import Evaluator from './Evaluator/Evaluator';

@injectable()
export default class extends AbstractPlugin {
    public static addToContainer(container: Container): void {
        container.bind<Evaluator>('Evaluator').to(Evaluator);
    }

    public static getEntities(): any[] {
        return [];
    }

    @inject(CFTypes.command.service)
    private commands: CommandService;
    @inject(CFTypes.security.authorizer)
    private authorizer: Authorizer;
    @inject('Evaluator')
    private evaluator: Evaluator;
    private repls: string[] = [];

    @Decorator.Command('ping', 'Pings the bot!')
    @Decorator.Permission('ping')
    public async PingCommand(): Promise<void> {
        await this.reactOk();
    }

    @Decorator.Command('restart', 'Restarts the bot')
    @Decorator.Permission('restart')
    public async RestartCommand(): Promise<void> {
        await this.reactOk();
        await this.client.editStatus('dnd', {type: 0, name: 'Restarting'});

        setTimeout(
            () => {
                process.exit(1);
            },
            1000,
        );
    }

    @Decorator.Command('help', 'Replies with this. If a command is specified, returns specific help.')
    public async HelpCommand(@Decorator.Remainder() commandName: string = null): Promise<any> {
        let builder: StringBuilder = new StringBuilder();

        if (commandName !== null) {
            const searchResult: SearchResult = await this.commands.searchAsync(this.context, commandName);
            if (!searchResult.isSuccess) {
                return await this.reply('There is no command with that name.');
            }

            return await this.embedMessage(
                (x) => {
                    const command: CommandInfo = searchResult.commands[0];
                    command.shortDescription   = command.shortDescription.replace(/{p(refix)?}/g, this.prefix);
                    command.longDescription    = command.longDescription.replace(/{p(refix)?}/g, this.prefix);

                    x.title = command.aliases[0];
                    if (command.shortDescription) {
                        x.description = command.shortDescription;
                    }

                    if (command.longDescription && command.longDescription !== command.shortDescription) {
                        x.fields.push({inline: true, name: '__Long Description__', value: command.longDescription});
                    }

                    const syntax: string = '`' + command.syntax.replace(/{p(refix)?}/g, this.prefix) + '`';

                    x.fields.push({inline: true, name: '__Syntax__', value: syntax});
                },
            );
        }

        builder.append(`${this.client.user.username}\n`);
        const searchResult: SearchResult = await this.commands.searchAsync(this.context);
        if (!searchResult.isSuccess || searchResult.commands.length === 0) {
            return await this.reply(builder.toString());
        }

        const plugins: Dictionary<string, CommandInfo[]> = new Dictionary<string, CommandInfo[]>();
        searchResult.commands.filter(
            (command) => this.authorizer.isAuthorized(
                this.context,
                command,
                this.context.member || this.context.user,
                command.permissionStrict,
            ),
        ).forEach(
            (command: CommandInfo) => {
                const plugin: string = (command.plugin.constructor as any).Name;
                if (!plugins.containsKey(plugin)) {
                    plugins.setValue(plugin, []);
                }

                plugins.getValue(plugin).push(command);
            },
        );

        builder.appendLine();
        for (let plugin of plugins.keys()) {
            let commands: any = new List<CommandInfo>(plugins.getValue(plugin))
                .GroupBy((cmd) => cmd.aliases[0], (cmd) => cmd);

            const pluginBuilder: StringBuilder = new StringBuilder();

            pluginBuilder.appendLine(`\n__*${plugin.replace('Plugin', '')}*__`);
            for (let cmdName in commands) {
                if (!commands.hasOwnProperty(cmdName)) {
                    continue;
                }
                const command: CommandInfo = commands[cmdName][0];

                pluginBuilder.append(` **${this.prefix}${command.aliases[0]}**`);
                if (command.shortDescription) {
                    pluginBuilder.append(' - ' + command.shortDescription);
                }
                pluginBuilder.appendLine();
            }

            if (pluginBuilder.toString().length + builder.toString().length > 1900) {
                await this.reply(builder.toString());
                builder.clear();
            }

            builder.append(pluginBuilder.toString());
        }

        builder.append(`\n\nType \`${this.prefix}help <command>\` for more info on a command.`);

        await this.reply(builder.toString());
    }

    @Decorator.Command('invite', 'Outputs an invite url for this bot.')
    public async InviteCommand(): Promise<void> {
        return this.reply(
            `<https://discordapp.com/api/oauth2/authorize?client_id=305140278480863233&scope=bot>`,
        );
    }

    @Decorator.Command('stats', 'Gets information about the bot')
    @Decorator.Permission('stats')
    public async StatsCommand(): Promise<void> {
        const app: {owner: User} = await this.client.getOAuthApplication() as any;

        await this.embedMessage(
            (x) => {
                x.author    = {
                    iconUrl: this.client.user.avatarURL
                             || 'https://canary.discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png',
                    name:    this.client.user.username,
                };
                x.title     = `By: ${app.owner.username} (${app.owner.id})`;
                x.thumbnail = {
                    url: this.client.user.avatarURL
                         || 'https://canary.discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png',
                };
                x.footer    = {
                    text: `Uptime: ${format(this.client.uptime / 1000)} | ` +
                          `Memory Usage: ${formatSizeUnits(process.memoryUsage().heapUsed)}`,
                };
                x.fields.push(
                    {
                        inline: true,
                        name:   '__Servers__:',
                        value:  '' + this.client.guilds.size,
                    },
                );
                x.fields.push(
                    {
                        inline: true,
                        name:   '__Channels__:',
                        value:  '' + this.client.guilds.map((y) => (y).channels.size).reduce((a, b) => a + b, 0),
                    },
                );
                x.fields.push(
                    {
                        inline: true,
                        name:   '__Users__:',
                        value:  '' + this.client.users.size,
                    },
                );
                x.fields.push(
                    {
                        inline: true,
                        name:   '__Servers__:',
                        value:  '' + this.client.guilds.map((y) => `${y.name}#${y.id}`).join('\n'),
                    },
                );
            },
        );
    }

    @Decorator.Command('eval', 'Runs code')
    @Decorator.Permission('Owner')
    public async EvalCommand(@Decorator.Remainder() code: string): Promise<void> {
        let found: RegExpMatchArray = code.match(/^```[a-z]*\n([\s\S]*)?\n```$/);
        if (found) {
            code = found[1];
        } else {
            found = code.match(/^`?([^`]*)?`?$/);
            if (found) {
                code = found[1];
            }
        }

        let response;
        let error;
        try {
            response = await this.evaluator.Evaluate(code, {context: this.context});
        } catch (e) {
            error = e;
        }

        if (Array.isArray(response) || typeof response === 'object') {
            try {
                response = '```json\n' + JSON.stringify(response, null, 4).replace(/","/g, '\", \"') + '\n```';
            } catch (e) {
                error = e;
            }
        }

        if (error) {
            return await this.embedMessage(
                (x) => {
                    x.author      = Object.assign({}, x.author, {Name: 'error executing eval!'});
                    x.title       = error.message;
                    x.description = error.stack || error;
                    x.color       = 0xFF0000;
                },
            );
        }

        await this.embedMessage(
            (x) => {
                x.author      = Object.assign({}, x.author, {Name: 'Execution Success!'});
                x.title       = 'Response: ';
                x.description = '' + response;
                x.color       = 0x00FF00;
            },
        );
    }

    @Decorator.Command('repl', 'Opens a read–eval–print loop')
    @Decorator.Permission('Owner')
    public async REPLCommand(): Promise<void> {
        if (this.repls[this.context.user.id]) {
            return await this.reply(`REPL already open. Type ${this.prefix}quitRepl to quit.`);
        }

        this.repls.push(this.context.user.id);

        let context: any[] = [];
        await this.reply(`REPL is now open. Type ${this.prefix}quitRepl to quit.`);
        let repl: Function = async (message: Message) => {
            if (message.author.id !== this.context.user.id) {
                return;
            }

            if (message.content === `${this.prefix}quitRepl`) {
                this.repls.slice(this.repls.findIndex((x) => x === this.context.user.id), 1);
                this.client.removeListener('messageCreate', repl as any);

                return await this.reply('REPL is now closed.');
            }

            let code: string = message.content;
            let found: any   = code.match(/^```[a-z]*\n([\s\S]*)?\n```$/);
            if (found) {
                code = found[1];
            } else {
                found = code.match(/^`?([^`]*)?`?$/);
                if (found) {
                    code = found[1];
                }
            }

            let response;
            let error;
            try {
                const allCode: string = context.join('\n') + '\n' + code;
                response              = await this.evaluator.Evaluate(allCode, {Context: this.context});
            } catch (e) {
                error = e;
            }

            if (Array.isArray(response) || typeof response === 'object') {
                try {
                    response = '```json\n' + JSON.stringify(response, null, 4).replace(/","/g, '\", \"') + '\n```';
                } catch (e) {
                    error = e;
                }
            }

            if (error) {
                return await this.embedMessage(
                    (x) => {
                        x.author      = Object.assign({}, x.author, {name: 'error executing eval!'});
                        x.title       = error.message;
                        x.description = error.stack || error;
                        x.color       = 0xFF0000;
                    },
                );
            }

            context.push(code);

            await this.embedMessage(
                (x) => {
                    x.author      = Object.assign({}, x.author, {name: 'Execution Success!'});
                    x.title       = 'Response: ';
                    x.description = '' + response;
                    x.color       = 0x00FF00;
                },
            );
        };
        this.client.on('messageCreate', repl);
    }

    @Decorator.Command('permnodes', 'Lists all permission nodes')
    @Decorator.Permission('Owner')
    public async PermissionNodesCommand(): Promise<void> {
        const builder: StringBuilder     = new StringBuilder(['```\n']);
        const searchResult: SearchResult = await this.commands.searchAsync(this.context);

        if (!searchResult.isSuccess) {
            return await this.reactNotOk();
        }

        const nodes: string[] = [];
        for (let command of searchResult.commands) {
            if (command.permissionNode && !nodes.find((x) => x === command.permissionNode)) {
                nodes.push(command.permissionNode);
                builder.appendLine(command.permissionNode);
            }
        }

        await this.reply(builder.toString() + '\n```');
    }

    @Decorator.Command('perms', 'Lists all current permissions')
    @Decorator.Permission('Owner')
    public async ListPermissionsCommand(): Promise<void> {
        const perms: Permission[] = (await this.getRepository<Permission>(Permission)
            .find({guildId: this.context.guild.id}))
            .sort((a, b) => a.typeId > b.typeId ? 1 : -1);

        if (perms.length === 0) {
            return await this.reply('There are currently no permissions here.');
        }

        const builder: StringBuilder = new StringBuilder();
        builder.appendLine('Index,type,Discord ID,node,allowed');
        for (let i: number = 0; i < perms.length; i++) {
            let perm: any = perms[i];
            builder.appendLine(`${i + 1},${perm.Type},="${perm.TypeId}",${perm.Node},${perm.Allowed ? 'Yes' : 'No'}`);
        }

        await this.context.channel.createMessage(
            'Here are the current permissions:\n', {
                file: new Buffer(builder.toString(), 'utf8'),
                name: `${this.context.guild.name} (${this.context.guild.id}) Permissions {DateTime.Now}.csv`,
            },
        );
    }

    @Decorator.Command('grant member', 'Grants a user a permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({user: Member})
    public async GrantMemberPermission(user: Member, node: string): Promise<void> {
        await this.FindAndChangeAllowed(PermissionType.User, user.id, node, true);

        return await this.reactOk();
    }

    @Decorator.Command('grant role', 'Grants a role a permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({role: Role})
    public async GrantRolePermission(role: Role, @Decorator.Remainder() node: string): Promise<void> {
        await this.FindAndChangeAllowed(PermissionType.Role, role.id, node, true);

        return await this.reactOk();
    }

    @Decorator.Command('revoke member', 'Revokes a user from a permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({user: Member})
    public async RevokeMemberPermission(user: Member, @Decorator.Remainder() node: string): Promise<void> {
        await this.FindAndChangeAllowed(PermissionType.User, user.id, node, false);

        return await this.reactOk();
    }

    @Decorator.Command('revoke role', 'Revokes a role from a permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({role: Role})
    public async RevokeRolePermission(role: Role, node: string): Promise<void> {
        await this.FindAndChangeAllowed(PermissionType.Role, role.id, node, false);

        return await this.reactOk();
    }

    @Decorator.Command('delperm member', 'Deletes a user\'s permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({user: Member})
    public async DeleteMemberPermission(user: Member, node: string): Promise<void> {
        const perm: Permission = await this.getRepository<Permission>(Permission).findOne(
            {
                guildId: this.context.guild.id,
                type:    PermissionType.User,
                typeId:  user.id,
                node,
            },
        );

        if (perm) {
            await this.getRepository(Permission).remove(perm);
            await this.authorizer.initialize();
        }

        return await this.reactOk();
    }

    @Decorator.Command('delperm role', 'Deletes a role\'s permission')
    @Decorator.Permission('Owner')
    @Decorator.Types({role: Role})
    public async DeleteRolePermission(role: Role, node: string): Promise<void> {
        const perm: Permission = await this.getRepository<Permission>(Permission).findOne(
            {
                guildId: this.context.guild.id,
                type:    PermissionType.Role,
                typeId:  role.id,
                node,
            },
        );

        if (perm) {
            await this.getRepository(Permission).remove(perm);
            await this.authorizer.initialize();
        }

        return await this.reactOk();
    }

    private async FindAndChangeAllowed(
        type: PermissionType, id: string, node: string, allowed: boolean,
    ): Promise<void> {
        let perm: Permission = await this.getRepository<Permission>(Permission).findOne(
            {
                guildId: this.context.guild.id,
                typeId:  id,
                type,
                node,
            },
        );

        if (!perm) {
            perm         = new Permission();
            perm.type    = type;
            perm.typeId  = id;
            perm.guildId = this.context.guild.id;
            perm.node    = node;
        }

        perm.allowed = allowed;

        await this.getRepository(Permission).save(perm);
        await this.authorizer.initialize();
    }
};

function format(seconds: number): string {
    function pad(s): any {
        return (s < 10 ? '0' : '') + s;
    }

    const hours: number   = Math.floor(seconds / (60 * 60));
    const minutes: number = Math.floor(seconds % (60 * 60) / 60);
    seconds               = Math.floor(seconds % 60);

    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}

function formatSizeUnits(bytes: number): string {
    if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + ' GB';
    }

    if (bytes >= 1048576) {
        return (bytes / 1048576).toFixed(2) + ' MB';
    }

    if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }

    if (bytes > 1) {
        return bytes + ' bytes';
    }

    if (bytes === 1) {
        return bytes + ' byte';
    }

    return '0 byte';
}
