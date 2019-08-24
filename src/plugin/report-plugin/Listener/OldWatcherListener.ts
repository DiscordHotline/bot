import {AxiosInstance} from 'axios';
import {Client, Guild, Message, TextChannel} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import {inject, injectable} from 'inversify';
import {Logger} from 'winston';

import * as interfaces from '../interfaces';
import Report from '../Model/Report';
import Types from '../types';

@injectable()
export default class OldWatcherListener {
    public constructor(
        @inject(CFTypes.logger) private logger: Logger,
        @inject(CFTypes.discordClient) private client: Client,
        @inject(Types.api.client) private api: AxiosInstance,
    ) {
    }

    public async initialize() {
        this.client.off('messageCreate', this.onMessageCreate.bind(this));
        this.client.on('messageCreate', this.onMessageCreate.bind(this));
    }

    private async onMessageCreate(message: Message): Promise<void> {
        if (message.content.indexOf('<@211242690933686272>') !== 0) {
            return;
        }
        const guild: Guild | null = (message.channel as TextChannel).guild;

        const {ids, reason, links} = this.getDataFromMessage(message);
        const report               = new Report();
        report.reporter            = message.author.id;
        report.guildId             = guild ? guild.id : null;
        report.reportedUsers       = ids;
        report.reason              = reason;
        report.links               = links || [];
        report.noLinks             = report.links && report.links.length > 0;

        this.logger.info('Creating report from old watcher command: %j', {ids, reason, links});

        await this.api.post<interfaces.Report>('/report', report);
    }

    private getDataFromMessage(message: Message): {ids: string[], reason?: string, links?: string[]} | null {
        const re = {
            alert: /.+alert\s*/,
            ids:   /(\d+)/g,
            links: /(https?:\/\/[^\s]+)/g,
        };

        if (message.content.indexOf('|') === -1) {
            return;
        }

        let content = message.content.replace(re.alert, '');
        const split = content.split('|');

        const idMatch = split[0].match(re.ids);
        if (!idMatch) {
            return;
        }

        const ids = idMatch;
        content   = split[1].trim();

        const links = content.match(re.links) || [];
        content     = content.replace(re.links, '');

        const reason = content.trim() === '' ? null : content;

        return {ids, reason, links};
    }
}
