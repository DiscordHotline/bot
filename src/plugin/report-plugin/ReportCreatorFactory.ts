import {AxiosInstance} from 'axios';
import {Client} from 'eris';
import {CommandContext, InteractiveHelper, types as CFTypes} from 'eris-command-framework';
import {inject, injectable} from 'inversify';
import {Logger} from 'winston';

import Report from './Model/Report';
import ReportCreator from './ReportCreator';
import Types from './types';

@injectable()
export default class ReportCreatorFactory {
    public constructor(
        @inject(CFTypes.discordClient) private client: Client,
        @inject(CFTypes.interactiveHelper) private interactiveHelper: InteractiveHelper,
        @inject(CFTypes.logger) private logger: Logger,
        @inject(Types.api.client) private api: AxiosInstance,
    ) {
    }

    public create(context: CommandContext, init?: Partial<Report>): ReportCreator {
        return new ReportCreator(this.client, this.interactiveHelper, this.logger, this.api, context, init);
    }
}
