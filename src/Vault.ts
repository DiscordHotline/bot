import * as NodeVault from 'node-vault';

import Logger from './Logger';

const {error} = Logger('Vault');

export default class Vault {
    private vault: NodeVault.client;
    private paths: {[key: string]: {[key: string]: string}} = {};

    constructor(private endpoint: string, private roleId: string, private secretId: string) {
        this.vault = NodeVault({endpoint: this.endpoint});
    }

    public async initialize() {
        await this.vault.approleLogin({role_id: this.roleId, secret_id: this.secretId});
    }

    public async getSecret(
        path: string,
        field: string,
        cache: boolean = true,
        withPrefix: boolean = true,
    ): Promise<string> {
        try {
            return (await this.getSecrets(path, cache, withPrefix))[field];
        } catch (e) {
            error(
                'Failed fetching secret %s from path %s. Original Error: %s\n%s',
                field,
                withPrefix ? 'secrets/hotline/' + path : path,
                e.message,
                e.stack,
            );

            throw e;
        }
    }

    public async getSecrets(
        path: string,
        cache: boolean = false,
        withPrefix: boolean = true,
    ): Promise<{ [key: string]: string }> {
        try {
            const result = await this.vault.read(withPrefix ? 'secret/hotline/' + path : path);
            if (cache) {
                this.paths[path] = result.data;
            }

            return result.data;
        } catch (e) {
            error(
                'Failed fetching secret path %s. Original Error: %s\n%s',
                withPrefix ? 'secret/hotline/' + path : path,
                e.message,
                e.stack,
            );

            throw e;
        }
    }
}
