import {Client, ClientOptions} from 'eris';
import {AbstractPlugin, CommandFramework, types as CFTypes} from 'eris-command-framework';
import {existsSync} from 'fs';
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

        await this.initializeDiscordClient(this.container.get<Client>(Types.discord.client));
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
        const vault: Vault = this.container.get<Vault>(Types.vault.client);
        await vault.initialize();

        // command Framework
        const commandFramework = new CommandFramework(
            this.container,
            {prefix: process.env.PREFIX || '>', onMessageUpdate: true},
            await this.findPlugins(),
        );

        // database/TypeORM
        const connection = await createConnection({
            synchronize:       true,
            host:              await vault.getSecret('database', 'host'),
            database:          await vault.getSecret('bot/database', 'name'),
            port:              3306,
            username:          await vault.getSecret('bot/database', 'user'),
            password:          await vault.getSecret('bot/database', 'password'),
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
            .toConstantValue(await vault.getSecret('discord', 'token'));
        this.container.bind<ClientOptions>(Types.discord.options).toConstantValue({});
        this.container.bind<Client>(Types.discord.client).toDynamicValue((ctx) => {
            return new Client(
                ctx.container.get<string>(Types.discord.token),
                ctx.container.get<ClientOptions>(Types.discord.options),
            );
        });
        this.container.bind<Client>(CFTypes.discordClient).toService(Types.discord.client);

        // initialize command Framework
        await commandFramework.initialize();
    }

    private async findPlugins(): Promise<{ [name: string]: typeof AbstractPlugin }> {
        const plugins: { [name: string]: typeof AbstractPlugin } = {};

        const pkgJson        = require('../package.json');
        const packagePlugins = pkgJson.plugins;
        const packageConfigs = pkgJson.pluginConfigs;
        for (const name of Object.keys(packagePlugins)) {
            let pkg: string = packagePlugins[name];
            const localPath = resolve(__dirname, '..', 'plugins', ...pkg.split('/'));
            let local       = false;
            if (existsSync(localPath)) {
                pkg   = resolve(localPath, 'src');
                local = true;
            }

            this.logger.info('Loading plugin: %s - %s - Local: %s', name, pkg, local ? 'yes' : 'no');
            plugins[name] = (await import(pkg)).default;
            const info    = require(
                existsSync(resolve(pkg, 'package.json'))
                ? resolve(pkg, 'package.json')
                : resolve(pkg, '..', 'package.json'),
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
        });

        client.on('debug', this.logger.debug.bind(this.debug));
        client.on('error', (err) => this.logger.error('error from Discord client: %s', err));

        await client.connect();
        this.logger.info('Discord client is connecting');
    }
}
