import {Client} from 'eris';

import CommandContext from './CommandContext';
import CommandError from './CommandError';
import ParameterInfo from './Info/ParameterInfo';
import TypeReaderResult from './Result/TypeReaderResult';

export namespace Interfaces {
    export interface PluginInterface {
        Context: CommandContext;

        Initialize();
    }

    export interface CommandInterface {
        Plugin: PluginInterface;
        Aliases: string[];
        ShortDescription?: string;
        LongDescription?: string;
        Syntax?: string;
        PermissionNode?: string;
        PermissionStrict: boolean;
        Parameters: ParameterInfo[];
        Code: Function;
        Types: Object;
        RemainderFields: number[];
        RequiredFields: number[];
    }

    export interface TypeReaderInterface {
        Read(client: Client, context: CommandContext, input: string): TypeReaderResult;

        GetTypes(): any[];
    }

    export interface ResultInterface {
        Error?: CommandError;
        ErrorReason?: string;
        IsSuccess: boolean;
    }
}
