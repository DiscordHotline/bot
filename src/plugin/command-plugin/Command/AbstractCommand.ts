import axios from 'axios';
import { AllowedMentions, Client, Embed } from 'eris';
import {Logger} from 'winston';
import { InteractionCreate } from '../index';

const { pluginConfigs: { CommandPlugin } } = require('../../../../package.json');

export default abstract class AbstractCommand<
  N extends string,
  O extends { name: string; value: any } = { name: string; value: any }> {
  public constructor(protected client: Client, protected logger: Logger) {
  }

  public abstract get schema();
  public get guildId(): string | null {
    return null;
  }

  public async register() {
    const requestHandler: any = (this.client as any).requestHandler;
    const original            = requestHandler.baseUrl;
    requestHandler.baseUrl    = '/api/v10';
    this.logger.info('Registering command: ' + this.schema.name);

    let url = `/applications/${CommandPlugin.applicationId}`;
    if (this.guildId) {
      url += `/guilds/${this.guildId}`;
    }

    await requestHandler.request(
      'POST',
      `${url}/commands`,
      true,
      this.schema,
    );

    (this.client as any).requestHandler.baseUrl = original;
  }

  public abstract process(interaction: InteractionCreate<{ name: N; id: string; options: O[] }>): Promise<void>;

  public async acknowledge(
    { id, token }: InteractionCreate,
    type: number,
    data?: { tts?: boolean; content: string; embeds?: Embed[]; allowed_mentions?: AllowedMentions; flags?: number },
  ) {
    await axios.post(`https://discord.com/api/v8/interactions/${id}/${token}/callback`, { type, data });
  }
}
