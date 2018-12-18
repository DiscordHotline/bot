import {readFileSync} from 'fs';
import {inject, injectable} from 'inversify';
import * as NodeVault from 'node-vault';
import {Logger} from 'winston';

import Types from '../types';
import Config from './Config';

interface Path {
    insert: number;
    data: {
        [key: string]: string,
    };
}

@injectable()
export default class Vault {
    private vault: NodeVault.client;

    private paths: { [key: string]: Path } = {};

    constructor(
        @inject(Types.logger) private logger: Logger,
        @inject(Types.vault.config) private config: Config,
    ) {
        if (config.address) {
            this.vault = NodeVault({endpoint: config.address, token: config.rootToken});
        }
    }

    public async initialize() {
        if (this.config.address && this.config.roleId && this.config.secretId) {
            await this.vault.approleLogin({role_id: this.config.roleId, secret_id: this.config.secretId});
        }
    }

    public async getSecret(
        path: string,
        field: string,
        cache: boolean      = true,
        withPrefix: boolean = true,
        ttl: number         = 60 * 5,
    ): Promise<string> {
        try {
            return (await this.getSecrets(path, cache, withPrefix, ttl))[field];
        } catch (e) {
            this.logger.error(
                'Failed fetching secret %s from path %s. Original Error: %s\n%s',
                field,
                withPrefix ? 'secret/hotline/' + path : path,
                e.message,
                e.stack,
            );

            throw e;
        }
    }

    public async getSecrets(
        path: string,
        cache: boolean      = true,
        withPrefix: boolean = true,
        ttl: number         = 60 * 5,
    ): Promise<{ [key: string]: string }> {
        try {
            return await this.getPath(withPrefix ? 'secret/hotline/' + path : path, cache, ttl);
        } catch (e) {
            this.logger.error(
                'Failed fetching secret path %s. Original Error: %s\n%s',
                withPrefix ? 'secret/hotline/' + path : path,
                e.message,
                e.stack,
            );

            throw e;
        }
    }

    private async getPath(path: string, cache: boolean = false, ttl: number = 60 * 5) {
        if (cache && this.paths[path] && this.paths[path].insert + (ttl * 1000) < Date.now()) {
            return this.paths[path];
        }

        let value;
        if (this.config.vaultFile) {
            const fileContents = JSON.parse(readFileSync(this.config.vaultFile, 'utf8'));
            value = fileContents[path];
        } else {
            value = (await this.vault.read(path)).data;
        }

        if (cache) {
            this.paths[path] = {insert: Date.now(), data: value};
        }

        return value;
    }
}
