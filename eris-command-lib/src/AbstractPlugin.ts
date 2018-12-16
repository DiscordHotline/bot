import {Client, TextableChannel} from 'eris';
import {Container, inject, injectable} from 'inversify';
import * as moment from 'moment';
import {Connection, Repository} from 'typeorm';
import {Logger as LoggerInstance} from 'winston';

import MessageBuffer from './Buffer/MessageBuffer';
import CommandContext from './CommandContext';
import Configuration from './Configuration';
import {Interfaces} from './Interfaces';
import Embed from './Model/Embed';
import TYPES from './types';
import PluginInterface = Interfaces.PluginInterface;

@injectable()
abstract class AbstractPlugin implements PluginInterface {
    public static AddToContainer(container: Container): void {
        throw new Error('Plugin must implement AddToContainer, even if its empty.');
    }

    public static GetEntities(): any[] {
        throw new Error('Plugin must implement GetEntities, even if its empty.');
    }

    protected static RGBToHex(r: number, g: number, b: number): number {
        let num: string = '0x';
        num += [r, g, b].map(
            (x) => {
                const hex: string = x.toString(16);

                return hex.length === 1 ? '0' + hex : hex;
            },
        ).join('');

        return parseInt(num, 10);
    }

    protected get prefix() {
        return this.Configuration.prefix;
    }

    @inject(TYPES.DiscordClient)
    public Client: Client;

    @inject(TYPES.Configuration)
    public Configuration: Configuration;

    @inject(TYPES.MessageBuffer)
    public MessageBuffer: MessageBuffer;

    @inject(TYPES.Connection)
    public Database: Connection;

    @inject(TYPES.Logger)
    public Logger: LoggerInstance;

    public Context: CommandContext;

    public async Initialize(): Promise<void> {
    }

    protected GetDefaultColor(): number {
        return AbstractPlugin.RGBToHex(66, 139, 202);
    }

    protected async ReactOk(): Promise<void> {
        return this.Context.Message.addReaction('👍🏻');
    }

    protected async ReactNotOk(): Promise<void> {
        return this.Context.Message.addReaction('👎🏻');
    }

    protected async Reply(content: string): Promise<void> {
        await this.SendMessage(this.Context.Channel, content);
    }

    protected async SendMessage(channel: TextableChannel, content: string): Promise<void> {
        this.MessageBuffer.AddItem(channel, content);
    }

    protected async SendEmbed(embed: Embed): Promise<void> {
        try {
            let jsonEmbed: any = embed.Serialize();
            this.Logger.data('Creating embed: ', jsonEmbed);

            await this.Context.Channel.createMessage({embed: jsonEmbed});
        } catch (error) {
            this.Logger.error('Error sending message: ', error.response);
            throw error;
        }
    }

    protected async EmbedMessage(action: ((x: Embed) => any)): Promise<void> {
        const embed: Embed = new Embed(
            {
                Author:    {
                    IconUrl: this.Client.user.avatarURL,
                    Name:    this.Client.user.username,
                },
                Color:     this.GetDefaultColor(),
                Fields:    [],
                Timestamp: moment().utc().toDate(),
            },
        );

        action(embed);

        return await this.SendEmbed(embed);
    }

    protected GetRepository<T>(entityClass: any): Repository<T> {
        return this.Database.getRepository<T>(entityClass) as Repository<T>;
    }
}

export default AbstractPlugin;
