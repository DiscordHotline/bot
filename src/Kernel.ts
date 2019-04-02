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
import Config from './Vault/Config';
import Vault from './Vault/Vault';

export default class Kernel {
    public readonly container: Container = new Container({defaultScope: 'Singleton'});

    private readonly logger: Logger;

    private vault: Vault;

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

        // Vault
        this.container.bind<Config>(Types.vault.config).toConstantValue({
            vaultFile: process.env.VAULT_FILE,
            address:   process.env.VAULT_ADDR,
            rootToken: process.env.VAULT_TOKEN,
            roleId:    process.env.VAULT_ROLE_ID,
            secretId:  process.env.VAULT_SECRET_ID,
        });
        this.container.bind<Vault>(Types.vault.client).to(Vault);
        this.vault = this.container.get<Vault>(Types.vault.client);
        await this.vault.initialize();

        // command Framework
        const commandFramework = new CommandFramework(
            this.container,
            Types,
            {
                prefix: process.env.PREFIX || ']', 
                onMessageUpdate: true,
                owners: ['97774439319486464', '108432868149035008']
            },
            await this.findPlugins(),
        );

        // database/TypeORM
        const connection = await createConnection({
            synchronize:       true,
            host:              await this.vault.getSecret('database', 'host'),
            database:          await this.vault.getSecret('bot/database', 'name'),
            port:              3306,
            username:          await this.vault.getSecret('bot/database', 'user'),
            password:          await this.vault.getSecret('bot/database', 'password'),
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
        this.container.bind<string>(Types.discord.token)
            .toConstantValue(await this.vault.getSecret('discord', 'token'));
        this.container.bind<ClientOptions>(Types.discord.options).toConstantValue({});
        this.container.bind<Client>(Types.discord.client).toDynamicValue((ctx) => {
            return new Client(
                ctx.container.get<string>(Types.discord.token),
                ctx.container.get<ClientOptions>(Types.discord.options),
            );
        });
        this.container.bind<Client>(Types.discord.restClient).toDynamicValue((ctx) => {
            return new Client(
                'Bot ' + ctx.container.get<string>(Types.discord.token),
                {restMode: true, ...ctx.container.get<ClientOptions>(Types.discord.options)},
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

    private async findPlugins(): Promise<{ [name: string]: typeof AbstractPlugin }> {
        const plugins: { [name: string]: typeof AbstractPlugin } = {};

        const pkgJson        = require('../package.json');
        const packagePlugins = pkgJson.plugins;
        const packageConfigs = pkgJson.pluginConfigs;
        for (const name of Object.keys(packagePlugins)) {
            let split       = packagePlugins[name].split(':');
            let pkg         = split[0];
            const localPath = resolve(__dirname, '..', 'plugins', ...pkg.split('/'));
            let local       = false;
            if (existsSync(localPath)) {
                pkg   = resolve(localPath, 'src');
                local = true;
            }

            plugins[name] = (await import(pkg)).default;
            const info    = require(local ? resolve(pkg, '..', 'package.json') : pkg + '/package.json');

            let types;
            try {
                types = (await import(pkg + '/types')).default;
                this.container.bind<any>('Types.' + name).toConstantValue(types);
                Types.plugins[name] = types;
            } catch (_ignored) {
            }
            this.logger.info(
                'Loading plugin: %s%s - %s - Local: %s - Types: %s',
                name,
                local ? '' : ` v${info.version}`,
                pkg,
                local ? 'yes' : 'no',
                types ? 'yes' : 'no',
            );

            plugins[name].Name = info.pluginTitle || info.name;

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
                new hookcord.Hook().setOptions({link: await this.vault.getSecret('bot', 'webhook')})
                                   .setPayload({content: 'Bot is ready'})
                                   .fire()
                                   .catch(console.error);
            }
        });

        client.on('debug', (msg, ...ctx) => this.logger.debug(msg, ...ctx));
        client.on('error', (err) => this.logger.error('error from Discord client: %O', err));

        await client.connect();
        this.logger.info('Discord client is connecting');
    }
}
