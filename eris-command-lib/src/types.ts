const Types = {
    Command:       {
        Handler: Symbol('Command.Handler'),
        Parser:  Symbol('Command.Parser'),
        Service: Symbol('Command.Service'),
    },
    Configuration: Symbol('Configuration'),
    Connection:    Symbol('Connection'),
    DiscordClient: Symbol('DiscordClient'),
    Environment:   Symbol('Environment'),
    Logger:        Symbol('Logger'),
    MessageBuffer: Symbol('MessageBuffer'),
    Plugin:        Symbol('Plugin'),
    Security:      {
        Authorizer: Symbol('Security.Authorizer'),
    },
};

export default Types;
