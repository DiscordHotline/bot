import {AxiosInstance} from 'axios';
import {Client} from 'eris';
import {CommandContext, types as CFTypes} from 'eris-command-framework';
import {inject, injectable} from 'inversify';
import {Connection} from 'typeorm';
import ConfirmCreator from './ConfirmCreator';
import {Report} from './interfaces';
import Types from './types';

@injectable()
export default class ReportConfirmFactory {
    public constructor(
        @inject(CFTypes.connection) private connection: Connection,
        @inject(CFTypes.discordClient) private client: Client,
        @inject(Types.api.client) private api: AxiosInstance,
    ) {
    }

    public create(report: Report, context: CommandContext) {
        return new ConfirmCreator(report, context, this.connection, this.client, this.api);
    }
}
