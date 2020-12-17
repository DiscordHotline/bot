import axios from 'axios';
import { Member } from 'eris';
import { AbstractPlugin } from 'eris-command-framework';
import { Container, injectable } from 'inversify';
import 'source-map-support/register';
import ColorCommand from './Command/ColorCommand';
import VouchCommand from './Command/VouchCommand';

import { Vouch } from './Entity';
import Types from './types';

export interface Config {
  hotlineGuildId: string;
}

export const Entities = { Vouch };

export interface InteractionCreate<D = any> {
  version: 1;
  id: string;
  type: 1 | 2;
  data?: D;
  guild_id: string;
  channel_id: string;
  member: Member;
  token: string;
}

@injectable()
export default class Plugin extends AbstractPlugin {
  public static Config: Config;

  public static addToContainer(container: Container): void {
    container.bind<Config>(Types.application.config).toConstantValue(this.Config);
  }

  public static getEntities(): any[] {
    return [Vouch];
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing CommandPlugin');
    const commands = {
      [VouchCommand.Name]: new VouchCommand(this.client),
      [ColorCommand.Name]: new ColorCommand(this.client),
    };

    this.client.on('ready', async () => {
      await Promise.all(Object.values(commands).map((x) => x.register()));
    });

    this.client.on('unknown', async (packet) => {
      if (packet.t !== 'INTERACTION_CREATE') {
        return;
      }
      const data = packet.d as InteractionCreate;

      if (!commands[data.data.name]) {
        await axios.post(`https://discord.com/api/v8/interactions/${data.id}/${data.token}/callback`, { type: 5 });

        return console.error('Invalid command');
      }

      await commands[data.data.name].process(data);
    });
  }

};
