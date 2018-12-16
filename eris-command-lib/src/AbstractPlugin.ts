import {
    Channel,
    Client,
    Message,
} from "eris";
import {
    Container,
    inject,
    injectable,
} from "inversify";
import {
    Connection,
    Repository,
} from "typeorm";
import {LoggerInstance} from "winston";
import MessageBuffer from "../Buffer/MessageBuffer";
import CommandContext from "../Command/CommandContext";
import Configuration from "../Configuration/Configuration";
import Embed from "../Model/Embed";
import TYPES from "../types";
import {IPlugin} from "./IPlugin";
import moment = require("moment");
import serialize = require("json-typescript-mapper");

@injectable()
abstract class AbstractPlugin implements IPlugin {
    public static AddToContainer(container: Container): void {
    }

    protected static RGBToHex(r: number, g: number, b: number): number {
        let num: string = "0x";
        num += [r, g, b].map(
            (x) => {
                const hex: string = x.toString(16);

                return hex.length === 1 ? "0" + hex : hex;
            },
        ).join("");

        return parseInt(num, 10);
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
        const rgb: string[] = this.Configuration.GetByGuildMember(
            this.Context.Guild,
            this.Context.User,
            "info.color",
            this.Configuration.GetByGuild(
                this.Context.Guild,
                "info.color",
                this.Configuration.GetGlobal(
                    "info.color",
                    "66, 139, 202",
                ),
            ),
        ).split(", ");

        return AbstractPlugin.RGBToHex(parseInt(rgb[0], 10), parseInt(rgb[1], 10), parseInt(rgb[2], 10));
    }

    protected async ReactOk(): Promise<void> {
        return this.Context.Message.addReaction("👍🏻");
    }

    protected async ReactNotOk(): Promise<void> {
        return this.Context.Message.addReaction("👎🏻");
    }

    protected async Reply(content: string): Promise<void> {
        await this.SendMessage(this.Context.Channel, content);
    }

    protected async SendMessage(channel: Channel, content: string): Promise<void> {
        this.MessageBuffer.AddItem(channel, content);
    }

    protected async SendEmbed(embed: Embed): Promise<void> {
        try {
            let jsonEmbed: any = embed.Serialize();
            this.Logger.data("Creating embed: ", jsonEmbed);

            await this.Context.Channel.createMessage({embed: jsonEmbed});
        } catch (error) {
            this.Logger.error("Error sending message: ", error.response);
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
        return <Repository<T>> this.Database.getRepository<T>(entityClass);
    }
}

export default AbstractPlugin;
