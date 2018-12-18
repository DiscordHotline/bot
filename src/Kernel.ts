import {Client, ClientOptions} from 'eris';
import {CommandFramework, Interfaces, types as CFTypes} from 'eris-command-framework';
import {Container} from 'inversify';
import {resolve} from 'path';
import {Connection, createConnection} from 'typeorm';
import {createLogger, format, Logger, transports} from 'winston';

import Types from './types';
import Config from './Vault/Config';
import Vault from './Vault/Vault';
import PluginInterface = Interfaces.PluginInterface;

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
        this.logger.info('Booting Kernel. Environment: %s, Debug: %s', this.environment, this.debug);

        await this.boot();
    }

    private async boot(): Promise<void> {
        await this.initializeContainer();

        await this.initializeDiscordClient(this.container.get<Client>(Types.discord.client));
    }

    private async initializeContainer(): Promise<void> {
        this.container.bind<Container>('Container').toConstantValue(this.container);

        // Logger
        this.container.bind<Logger>(Types.logger).toConstantValue(this.logger);
        this.container.bind<Logger>(CFTypes.Logger).toService(Types.logger);

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

        // Command Framework
        const commandFramework = new CommandFramework(
            this.container,
            {prefix: '|', onMessageUpdate: true},
            await this.findPlugins(),
        );

        // Database/TypeORM
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
                ...commandFramework.GetEntities(),
            ],
        });
        this.container.bind<Connection>(Types.database).toConstantValue(connection);
        this.container.bind<Connection>(CFTypes.Connection).toConstantValue(connection);

        // Discord Client
        this.container.bind<string>(Types.discord.token)
            .toConstantValue(await vault.getSecret('discord', 'token'));
        this.container.bind<ClientOptions>(Types.discord.options).toConstantValue({});
        this.container.bind<Client>(Types.discord.client).toDynamicValue((ctx) => {
            return new Client(
                ctx.container.get<string>(Types.discord.token),
                ctx.container.get<ClientOptions>(Types.discord.options),
            );
        });
        this.container.bind<Client>(CFTypes.DiscordClient).toService(Types.discord.client);

        // Initialize Command Framework
        await commandFramework.Initialize();
    }

    private async findPlugins(): Promise<{ [name: string]: PluginInterface }> {
        const plugins: { [name: string]: PluginInterface } = {};
        const packagePlugins                               = require('../package.json').plugins;
        for (const name of Object.keys(packagePlugins)) {
            let pkg: string = packagePlugins[name];
            if (pkg.indexOf('.') === 0) {
                pkg = resolve(__dirname, '..', pkg);
            }

            plugins[name] = (await import(pkg)).default;
            let info;
            try {
                info = require(resolve(pkg, 'package.json'));
            } catch (e) {
                info = require(resolve(pkg, '..', 'package.json'));
            }

            (plugins[name] as any).Name = info.pluginTitle || info.name;
        }

        return plugins;
    }

    private async initializeDiscordClient(client: Client): Promise<void> {
        this.logger.info('Initializing Discord Client');

        client.on('ready', async () => {
            this.logger.info('Discord Client is ready');
        });

        client.on('debug', this.logger.debug.bind(this.debug));
        client.on('error', (err) => this.logger.error('Error from Discord Client: %s', err));

        await client.connect();
        this.logger.info('Discord Client is connecting');
    }
}
