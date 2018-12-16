import {Message, User} from 'eris';
import {AbstractPlugin, CommandService, types as CFTypes} from 'eris-command-framework';
import StringBuilder from 'eris-command-framework/Builder/StringBuilder';
import Decorator from 'eris-command-framework/Decorator';
import CommandInfo from 'eris-command-framework/Info/CommandInfo';
import SearchResult from 'eris-command-framework/Result/SearchResult';
import Authorizer from 'eris-command-framework/Security/Authorizer';

import {Container, inject, injectable} from 'inversify';
import {List} from 'linqts';
import {Dictionary} from 'typescript-collections';

import Evaluator from './Evaluator/Evaluator';
import CustomTypes from './types';

@injectable()
export default class CorePlugin extends AbstractPlugin {
    public static AddToContainer(container: Container): void {
        container.bind<Evaluator>(CustomTypes.Evaluator).to(Evaluator);
    }

    @inject(CFTypes.Command.Service)
    private commands: CommandService;

    @inject(CFTypes.Security.Authorizer)
    private authorizer: Authorizer;

    @inject(CustomTypes.Evaluator)
    private evaluator: Evaluator;

    private repls: string[] = [];

    @Decorator.Command('ping', 'Pings the bot!')
    @Decorator.Permission('ping')
    public async PingCommand(): Promise<void> {
        await this.ReactOk();
    }

    @Decorator.Command('restart', 'Restarts the bot')
    @Decorator.Permission('restart')
    public async RestartCommand(): Promise<void> {
        await this.ReactOk();
        await this.Client.editStatus('dnd', {name: 'Restarting'});

        setTimeout(
            () => {
                process.exit(1);
            },
            1000,
        );
    }

    @Decorator.Command('help', 'Replies with this. If a command is specified, returns specific help.')
    public async HelpCommand(@Decorator.Remainder commandName: string = null): Promise<any> {
        let builder: StringBuilder = new StringBuilder();

        if (commandName !== null) {
            const searchResult: SearchResult = await this.commands.SearchAsync(this.Context, commandName);
            if (!searchResult.IsSuccess) {
                return await this.Reply('There is no command with that name.');
            }

            return await this.EmbedMessage(
                (x) => {
                    const command: CommandInfo = searchResult.Commands[0];
                    command.ShortDescription   = command.ShortDescription.replace(/{p(refix)?}/g, this.prefix);
                    command.LongDescription    = command.LongDescription.replace(/{p(refix)?}/g, this.prefix);

                    x.Title = command.Aliases[0];
                    if (command.ShortDescription) {
                        x.Description = command.ShortDescription;
                    }

                    if (command.LongDescription && command.LongDescription !== command.ShortDescription) {
                        x.Fields.push({Inline: true, Name: '__Long Description__', Value: command.LongDescription});
                    }

                    const syntax: StringBuilder = new StringBuilder();
                    searchResult.Commands.forEach(
                        (cmd) => {
                            syntax.AppendLine('`' + cmd.Syntax.replace(/{p(refix)?}/g, this.prefix) + '`');
                        },
                    );

                    x.Fields.push({Inline: true, Name: '__Syntax__', Value: syntax.toString()});
                },
            );
        }

        builder.Append(`${this.Client.user.username}\n`);
        const searchResult: SearchResult = await this.commands.SearchAsync(this.Context);
        if (!searchResult.IsSuccess || searchResult.Commands.length === 0) {
            return await this.Reply(builder.toString());
        }

        const plugins: Dictionary<string, CommandInfo[]> = new Dictionary<string, CommandInfo[]>();
        searchResult.Commands.filter(
            (command) => this.authorizer.IsAuthorized(
                command.PermissionNode,
                this.Context.Member || this.Context.User,
                command.PermissionStrict,
            ),
        ).forEach(
            (command: CommandInfo) => {
                const plugin: string = command.Plugin.constructor.name;
                if (!plugins.containsKey(plugin)) {
                    plugins.setValue(plugin, []);
                }

                plugins.getValue(plugin).push(command);
            },
        );

        builder.AppendLine();
        for (let plugin of plugins.keys()) {
            let commands: any = new List<CommandInfo>(plugins.getValue(plugin))
                .GroupBy((cmd) => cmd.Aliases[0], (cmd) => cmd);

            const pluginBuilder: StringBuilder = new StringBuilder();

            pluginBuilder.AppendLine(`\n__*${plugin.replace('Plugin', '')}*__`);
            for (let cmdName in commands) {
                if (!commands.hasOwnProperty(cmdName)) {
                    continue;
                }
                const command: any = commands[cmdName][0];

                pluginBuilder.Append(` **${this.prefix}${command.Aliases[0]}**`);
                if (command.ShortDescription) {
                    pluginBuilder.Append(' - ' + command.ShortDescription);
                }
                pluginBuilder.AppendLine();
            }

            if (pluginBuilder.toString().length + builder.toString().length > 1900) {
                await this.Reply(builder.toString());
                builder.Clear();
            }

            builder.Append(pluginBuilder.toString());
        }

        builder.Append(`\n\nType \`${this.prefix}help <command>\` for more info on a command.`);

        await this.Reply(builder.toString());
    }

    @Decorator.Command('stats', 'Gets information about the bot')
    @Decorator.Permission('stats')
    public async StatsCommand(): Promise<void> {
        const app: { owner: User } = await this.Client.getOAuthApplication() as any;

        await this.EmbedMessage(
            (x) => {
                x.Author      = {
                    IconUrl: this.Client.user.avatarURL
                             || 'https://canary.discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png',
                    Name:    this.Client.user.username,
                };
                x.Title       = `By: ${app.owner.username} (${app.owner.id})`;
                x.Thumbnail   = {
                    Url: this.Client.user.avatarURL
                         || 'https://canary.discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png',
                };
                x.Footer      = {
                    Text: `Uptime: ${format(this.Client.uptime / 1000)} | ` +
                          `Memory Usage: ${formatSizeUnits(process.memoryUsage().heapUsed)}`,
                };
                x.Fields.push(
                    {
                        Inline: true,
                        Name:   '__Servers__:',
                        Value:  '' + this.Client.guilds.size,
                    },
                );
                x.Fields.push(
                    {
                        Inline: true,
                        Name:   '__Channels__:',
                        Value:  '' + this.Client.guilds.map((y) => (y).channels.size).reduce((a, b) => a + b, 0),
                    },
                );
                x.Fields.push(
                    {
                        Inline: true,
                        Name:   '__Users__:',
                        Value:  '' + this.Client.users.size,
                    },
                );
                x.Fields.push(
                    {
                        Inline: true,
                        Name:   '__Servers__:',
                        Value:  '' + this.Client.guilds.map((y) => `${y.name}#${y.id}`).join('\n'),
                    },
                );
            },
        );
    }

    @Decorator.Command('eval', 'Runs code')
    @Decorator.Permission('Owner')
    public async EvalCommand(@Decorator.Remainder code: string): Promise<void> {
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
            response = await this.evaluator.Evaluate(code, {Context: this.Context});
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
            return await this.EmbedMessage(
                (x) => {
                    x.Author      = Object.assign({}, x.Author, {Name: 'Error executing eval!'});
                    x.Title       = error.message;
                    x.Description = error.stack || error;
                    x.Color       = 0xFF0000;
                },
            );
        }

        await this.EmbedMessage(
            (x) => {
                x.Author      = Object.assign({}, x.Author, {Name: 'Execution Success!'});
                x.Title       = 'Response: ';
                x.Description = '' + response;
                x.Color       = 0x00FF00;
            },
        );
    }

    @Decorator.Command('repl', 'Opens a read–eval–print loop')
    @Decorator.Permission('Owner')
    public async REPLCommand(): Promise<void> {
        if (this.repls[this.Context.User.id]) {
            return await this.Reply(`REPL already open. Type ${this.prefix}quitRepl to quit.`);
        }

        this.repls.push(this.Context.User.id);

        let context: any[] = [];
        await this.Reply(`REPL is now open. Type ${this.prefix}quitRepl to quit.`);
        let repl: Function = async (message: Message) => {
            if (message.author.id !== this.Context.User.id) {
                return;
            }

            if (message.content === `${this.prefix}quitRepl`) {
                this.repls.slice(this.repls.findIndex((x) => x === this.Context.User.id), 1);
                this.Client.removeListener('messageCreate', repl as any);

                return await this.Reply('REPL is now closed.');
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
                response              = await this.evaluator.Evaluate(allCode, {Context: this.Context});
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
                return await this.EmbedMessage(
                    (x) => {
                        x.Author      = Object.assign({}, x.Author, {name: 'Error executing eval!'});
                        x.Title       = error.message;
                        x.Description = error.stack || error;
                        x.Color       = 0xFF0000;
                    },
                );
            }

            context.push(code);

            await this.EmbedMessage(
                (x) => {
                    x.Author      = Object.assign({}, x.Author, {name: 'Execution Success!'});
                    x.Title       = 'Response: ';
                    x.Description = '' + response;
                    x.Color       = 0x00FF00;
                },
            );
        };
        this.Client.on('messageCreate', repl);
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
