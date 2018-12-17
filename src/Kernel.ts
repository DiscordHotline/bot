import {Client, ClientOptions} from 'eris';
import {CommandFramework, Interfaces, types as CFTypes} from 'eris-command-framework';
import {Container} from 'inversify';
import {resolve} from 'path';
import {Connection, createConnection} from 'typeorm';

import Logger from './Logger';
import TYPES from './types';
import Vault from './Vault';
import PluginInterface = Interfaces.PluginInterface;

const {debug, info, error} = Logger('Kernel');

export default class Kernel {
    public readonly container: Container = new Container({defaultScope: 'Singleton'});

    private readonly vault: Vault = new Vault(
        process.env.VAULT_ADDR,
        process.env.VAULT_ROLE_ID,
        process.env.VAULT_SECRET_ID,
    );

    // tslint:disable-next-line:no-shadowed-variable
    constructor(private readonly environment: string, private readonly debug: string) {
    }

    public async run(): Promise<void> {
        info('Booting Kernel. Environment: %s, Debug: %s', this.environment, this.debug);

        await this.boot();
    }

    private async boot(): Promise<void> {
        await this.vault.initialize();
        await this.initializeContainer();

        await this.initializeDiscordClient(this.container.get<Client>(TYPES.discord.client));
    }

    private async initializeContainer(): Promise<void> {
        this.container.bind<Container>('Container').toConstantValue(this.container);

        const commandFramework = new CommandFramework(
            this.container,
            {prefix: '|', onMessageUpdate: true},
            await this.findPlugins(),
        );
        const connection       = await createConnection({
            synchronize:       true,
            database:          await this.vault.getSecret('bot/database', 'name'),
            host:              await this.vault.getSecret('database', 'host'),
            port:              3306,
            username:          await this.vault.getSecret('bot/database', 'user'),
            password:          await this.vault.getSecret('bot/database', 'password'),
            type:              'mysql',
            supportBigNumbers: true,
            bigNumberStrings:  true,
            entities:          [
                ...commandFramework.GetEntities(),
            ],
        });
        this.container.bind<Connection>(TYPES.database).toConstantValue(connection);
        this.container.bind<Connection>(CFTypes.Connection).toConstantValue(connection);

        this.container.bind<Vault>(TYPES.vault.client).toConstantValue(this.vault);
        this.container.bind<string>(TYPES.discord.token)
            .toConstantValue(await this.vault.getSecret('discord', 'token'));
        this.container.bind<ClientOptions>(TYPES.discord.options).toConstantValue({});

        this.container.bind<Client>(TYPES.discord.client).toDynamicValue((ctx) => {
            return new Client(
                ctx.container.get<string>(TYPES.discord.token),
                ctx.container.get<ClientOptions>(TYPES.discord.options),
            );
        });
        this.container.bind<Client>(CFTypes.DiscordClient).toService(TYPES.discord.client);

        await commandFramework.Initialize();
    }

    private async findPlugins(): Promise<{[name: string]: PluginInterface}> {
        const plugins: { [name: string]: PluginInterface } = {};
        const packagePlugins = require('../package.json').plugins;
        for (const name of Object.keys(packagePlugins)) {
            let pkg: string = packagePlugins[name];
            if (pkg.indexOf('.') === 0) {
                pkg = resolve(__dirname, '..', pkg);
            }

            // plugins[name] = (await import(pkg)).default;
        }

        return plugins;
    }

    private async initializeDiscordClient(client: Client): Promise<void> {
        info('Initializing Discord Client');

        client.on('ready', async () => {
            info('Discord Client is ready');
        });

        if (this.debug) {
            client.on('debug', debug);
        }

        client.on('error', error);

        await client.connect();
        info('Discord Client is connecting');
    }
}
