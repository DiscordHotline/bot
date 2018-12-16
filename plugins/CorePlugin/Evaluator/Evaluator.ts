import {Client} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import {Container, inject, injectable} from 'inversify';
import * as requireContext from 'require-context';
import * as vm from 'vm';
import {Logger as LoggerInterface} from 'winston';

import TYPES from '../../../src/types';
import IEvaluationResult from './IEvaluationResult';

const req = requireContext(__dirname, true);

@injectable()
export default class Evaluator {
    private static WrapCode(code: string): string {
        return `'use strict';
async function run() {
    try {
        this.response = await (async () => {
            ${code.replace(/(var|let|const) /g, 'this.')};
        })();
        
        this.callback(null);
    } catch(error) {
        this.callback(error);
    }
};
run.apply(this)`;
    }

    @inject('Container')
    private _container: Container;

    @inject(CFTypes.Logger)
    private _logger: LoggerInterface;

    public async Evaluate(code: string, customContext: any = {}): Promise<IEvaluationResult> {
        await (async () => {

        })();

        return new Promise(
            (resolve, reject) => {
                try {
                    let contextBuilder: any = Object.assign({}, this.GetDefaultContext(), customContext);
                    contextBuilder.callback = function (error) {
                        if (error) {
                            return reject(error);
                        }

                        resolve(this.response);
                    };

                    const context: vm.Context = vm.createContext(contextBuilder);
                    const asyncCode = Evaluator.WrapCode(code);
                    const script: vm.Script = new vm.Script(asyncCode);

                    script.runInContext(context, {displayErrors: true, timeout: 600000});
                } catch (error) {
                    this._logger.error(error);
                    reject(error);
                }
            },
        );
    }

    private GetDefaultContext(): any {
        return {
            require: req,
            container: this._container,
            client: this._container.get<Client>(CFTypes.DiscordClient),
            TYPES,
        };
    }
};
