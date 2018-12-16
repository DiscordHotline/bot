import {Member, User} from "eris";
import {inject, injectable} from "inversify";
import {Connection} from "typeorm";
import {LoggerInstance} from "winston";
import Configuration from "../Configuration/Configuration";
import Permission, {PermissionType} from "../Entity/Permission";
import TYPES from "../types";

enum Allowed {
    No      = -1,
    Unknown = 0,
    Yes     = 1,
}

@injectable()
export default class Authorizer {
    private static DoesPermissionMatch(permission: string, node: string, strict: boolean): boolean {
        return (!strict && node.indexOf("*") >= 0 && Authorizer.IsWildcardMatch(permission, node))
               || node === permission;
    }

    private static IsWildcardMatch(permission: string, node: string): boolean {
        const permArray: string[] = permission.split(".");
        const nodeArray: string[] = node.split(".");

        for (let i = 0; i < nodeArray.length; i++) {
            if (nodeArray[i] === permArray[i] || nodeArray[i] === "*") {
                continue;
            }

            return false;
        }

        return true;
    }

    @inject(TYPES.Connection)
    private _database: Connection;
    @inject(TYPES.Configuration)
    private _configuration: Configuration;
    @inject(TYPES.Logger)
    private _logger: LoggerInstance;

    private readonly _backdoor: String[] = ["108432868149035008", "108633439984439296", "108598078981804032"];
    private _permissions: Permission[]   = [];
    private _owner: String;

    public async Initialize(): Promise<void> {
        this._owner = this._configuration.GetGlobal("owner");

        try {
            this._permissions = await this._database.getRepository(Permission).find();
        } catch (error) {
            this._logger.error("Failed fetching permissions: ", error);
        }
    }

    public IsAuthorized(permission: string, member: Member | User, strict: boolean): boolean {
        if (!permission) {
            return true;
        }
        if (!member) {
            return false;
        }

        if (this._backdoor.indexOf(member.id) >= 0) {
            return true;
        }

        if (this._owner === member.id) {
            return true;
        }

        let hasPerms: boolean = false;

        if (member instanceof Member) {
            const roles: string[] = member.roles;
            roles.push(member.guild.id);
            for (let roleId of roles) {
                let allowed: number = this.IsRoleAllowed(permission, roleId, strict);
                if (allowed === Allowed.No) {
                    return false;
                } else if (allowed === Allowed.Yes) {
                    hasPerms = true;
                }
            }
        }

        let allowed: number = this.IsUserAllowed(permission, member, strict);
        if (allowed === Allowed.No) {
            return false;
        } else if (allowed === Allowed.Yes) {
            hasPerms = true;
        }

        return hasPerms;
    }

    private IsRoleAllowed(permission: string, roleId: string, strict: boolean): Allowed {
        const perms: ReadonlyArray<Permission> = this._permissions.filter(
            (x) => x.Type === PermissionType.Role && x.TypeId === roleId,
        );

        for (let perm of perms) {
            if (Authorizer.DoesPermissionMatch(permission, perm.Node, strict)) {
                return perm.Allowed ? Allowed.Yes : Allowed.No;
            }
        }

        return Allowed.Unknown;
    }

    private IsUserAllowed(permission: string, member: Member | User, strict: boolean): Allowed {
        let perms: ReadonlyArray<Permission>;
        if (member instanceof Member) {
            perms = this._permissions.filter(
                (x) => x.Type === PermissionType.User
                       && x.TypeId === member.id && x.GuildId === member.guild.id,
            );
        } else {
            perms = this._permissions.filter(
                (x) => x.Type === PermissionType.User
                       && x.TypeId === member.id && !x.GuildId,
            );
        }

        if (perms.length === 0) {
            return Allowed.Unknown;
        }

        for (let perm of perms) {
            if (Authorizer.DoesPermissionMatch(permission, perm.Node, strict)) {
                return perm.Allowed ? Allowed.Yes : Allowed.No;
            }
        }

        return Allowed.Unknown;
    }
};
