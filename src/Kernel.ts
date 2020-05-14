import {Adapter} from '@secretary/aws-secrets-manager-adapter';
import {Manager} from '@secretary/core';
import {Adapter as JsonAdapter} from '@secretary/json-file-adapter';
import {Client, ClientOptions} from 'eris';
import {
    AbstractPlugin,
    CommandContext,
    CommandFramework,
    CommandHandler,
    types as CFTypes,
} from 'eris-command-framework';
import * as express from 'express';
import {Express} from 'express';
import {existsSync} from 'fs';
import * as hookcord from 'hookcord';
import {Container} from 'inversify';
import {resolve} from 'path';
import {Connection, createConnection} from 'typeorm';
import {createLogger, format, Logger, transports} from 'winston';

import Types from './types';
import SecretsManager = require('aws-sdk/clients/secretsmanager');

export default class Kernel {
    public readonly container: Container = new Container({defaultScope: 'Singleton'});

    private readonly logger: Logger;

    private secrets: Manager;

    // tslint:disable-next-line:no-shadowed-variable
    constructor(private readonly environment: string, private readonly debug: boolean) {
        this.logger = createLogger({
            level:      debug ? 'debug' : 'info',
            format:     format.combine(
                format.splat(),
                format.colorize(),
                format.timestamp(),
                format.align(),
                format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
            ),
            transports: [
                new transports.Console(),
            ],
        });
    }

    public async run(): Promise<void> {
        this.logger.info('Booting Kernel. environment: %s, Debug: %s', this.environment, this.debug);

        await this.boot();
    }

    private async boot(): Promise<void> {
        await this.initializeContainer();

        const commandHandler                = this.container.get<CommandHandler>(CFTypes.command.handler);
        commandHandler.events.beforeExecute = (context: CommandContext) => {
            const hotline = context.client.guilds.get('204100839806205953');
            try {
                const member = hotline.members.get(context.user.id);
                if (!member) {
                    return false;
                }

                // Only allow members who are in the Member role.
                return member.roles.indexOf('531617261077790720') >= 0;
            } catch (e) {
                return false;
            }
        };

        await this.initializeDiscordClient(this.container.get<Client>(Types.discord.client));
        this.container.get<Express>(Types.webserver)
            .listen(
                process.env.PORT || 3000,
                () => this.logger.info('Webserver listening on port ' + (process.env.PORT || 3000)),
            );
    }

    private async initializeContainer(): Promise<void> {
        this.container.bind<Container>('Container').toConstantValue(this.container);
        this.container.bind<any>('Types').toConstantValue(Types);
        this.container.bind<any>('CFTypes').toConstantValue(CFTypes);

        // logger
        this.container.bind<Logger>(Types.logger).toConstantValue(this.logger);
        this.container.bind<Logger>(CFTypes.logger).toService(Types.logger);

        // Secretary
        this.container.bind<Manager>(Types.secrets.manager).toDynamicValue(() => {
            if (process.env.SECRETS_FILE) {
                return new Manager(new JsonAdapter({file: process.env.SECRETS_FILE}));
            }

            const client = new SecretsManager({
                region:      'us-east-1',
                credentials: {
                    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });

            return new Manager(new Adapter(client));
        });
        this.secrets = this.container.get(Types.secrets.manager);

        // command Framework
        const commandFramework = new CommandFramework(
            this.container,
            Types,
            {
                prefix:          process.env.PREFIX || ']',
                onMessageUpdate: true,
                owners:          ['108432868149035008', '97774439319486464'],
            },
            await this.findPlugins(),
        );

        // database/TypeORM
        const dbSecret   = {
            ...(await this.secrets.getSecret('hotline/database')).value as any,
            ...(await this.secrets.getSecret('hotline/bot/database')).value as any,
        };
        const connection = await createConnection({
            synchronize:       true,
            host:              dbSecret.host,
            database:          dbSecret.name,
            port:              3306,
            username:          dbSecret.user,
            password:          dbSecret.password,
            type:              'mysql',
            supportBigNumbers: true,
            bigNumberStrings:  true,
            entities:          [
                ...commandFramework.getEntities(),
            ],
        });
        this.container.bind<Connection>(Types.database).toConstantValue(connection);
        this.container.bind<Connection>(CFTypes.connection).toConstantValue(connection);

        // Discord client
        const {value: {token}} = await this.secrets.getSecret<{token: string}>('hotline/discord');
        this.container.bind<string>(Types.discord.token).toConstantValue(token);
        this.container.bind<ClientOptions>(Types.discord.options).toConstantValue({});
        this.container.bind<Client>(Types.discord.client).toDynamicValue((ctx) => {
            return new Client(
                ctx.container.get<string>(Types.discord.token),
                {
                    intents: [
                        'guildMembers',
                        'guildMessages',
                        'directMessages',
                        'directMessageReactions',
                        'guildMessageReactions',
                    ],
                    ...ctx.container.get<ClientOptions>(Types.discord.options),
                },
            );
        });
        this.container.bind<Client>(Types.discord.restClient).toDynamicValue((ctx) => {
            return new Client(
                'Bot ' + ctx.container.get<string>(Types.discord.token),
                {
                    restMode: true,
                    intents: [
                        'guildMembers',
                        'guildMessages',
                        'directMessages',
                        'directMessageReactions',
                        'guildMessageReactions',
                    ],
                    ...ctx.container.get<ClientOptions>(Types.discord.options),
                },
            );
        });
        this.container.bind<Client>(CFTypes.discordClient).toService(Types.discord.client);
        this.container.bind<Client>(CFTypes.discordRestClient).toService(Types.discord.restClient);
        this.container.bind<Express>(Types.webserver).toDynamicValue(() => {
            const app = express();
            app.use(require('morgan')('dev'))
                .use(require('compression')())
                .use(require('body-parser').json())
                .get('/', (_, res) => res.json({status: 'ok'}));

            return app;
        });

        // initialize command Framework
        await commandFramework.initialize();
    }

    private async findPlugins(): Promise<{[name: string]: typeof AbstractPlugin}> {
        const plugins: {[name: string]: typeof AbstractPlugin} = {};

        const pkgJson        = require('../package.json');
        const packagePlugins = pkgJson.plugins;
        const packageConfigs = pkgJson.pluginConfigs;
        for (const name of Object.keys(packagePlugins)) {
            let split       = packagePlugins[name].split(':');
            let pkg         = split[0];
            const localPath = resolve(__dirname, pkg);
            let local       = false;
            if (existsSync(localPath)) {
                pkg   = localPath;
                local = true;
            }

            plugins[name] = (await import(pkg)).default;

            let types;
            try {
                types = (await import(pkg + '/types')).default;
                this.container.bind<any>('Types.' + name).toConstantValue(types);
                Types.plugins[name] = types;
            } catch (_ignored) {
            }
            this.logger.info(
                'Loading plugin: %s - %s - Local: %s - Types: %s',
                name,
                pkg,
                local ? 'yes' : 'no',
                types ? 'yes' : 'no',
            );

            plugins[name].Name = name;

            // @todo Validate config
            plugins[name].Config = packageConfigs[name] || {};
        }

        return plugins;
    }

    private async initializeDiscordClient(client: Client): Promise<void> {
        this.logger.info('Initializing Discord client');

        client.on('ready', async () => {
            this.logger.info('Discord client is ready');
            if (process.env.ENVIRONMENT !== 'dev') {
                // tslint:disable-next-line
                const {value: {webhook: link}} = await this.secrets.getSecret<{webhook: string}>('hotline/bot/discord');
                new hookcord.Hook().setOptions({link})
                    .setPayload({content: 'Bot is ready'})
                    .fire()
                    .catch(console.error);
            }
        });

        client.on('debug', (msg, ...ctx) => {
            if (!msg.includes('presence update')) {
                this.logger.debug(msg, ...ctx);
            }
        });
        client.on('error', (err) => this.logger.error('error from Discord client: %O', err));
        client.on('shardDisconnect', (err, id) => this.logger.warn(`Shard #${id} disconnected. Error: %O`, err));

        await client.connect();
        this.logger.info('Discord client is connecting');
    }
}
