const Types = {
    Command:            {
        EnabledPluginChecker: Symbol("EnabledPluginChecker"),
        Handler:              Symbol("Command.Handler"),
        Parser:               Symbol("Command.Parser"),
        Service:              Symbol("Command.Service"),
    },
    Configuration:      Symbol("Configuration"),
    Controller:         Symbol("Controller"),
    Connection:         Symbol("Connection"),
    DiscordClient:      Symbol("DiscordClient"),
    Environment:        Symbol("Environment"),
    SocketServer:       Symbol("SocketServer"),
    WebServer:          Symbol("WebServer"),
    EventSubscribers:   {
        DiscordClient: {
            Log:     Symbol("EventSubscriber.DiscordClient.LogSubscriber"),
            Message: Symbol("EventSubscriber.DiscordClient.MessageSubscriber"),
            Ready:   Symbol("EventSubscriber.DiscordClient.ReadySubscriber"),
        },
    },
    Logger:             Symbol("Logger"),
    MessageBuffer:      Symbol("MessageBuffer"),
    UserTrackingBuffer: Symbol("UserTrackingBuffer"),
    Plugin:             Symbol("Plugin"),
    Security:           {
        Authorizer: Symbol("Security.Authorizer"),
    },
    WebhookHelper:      Symbol("WebhookHelper"),
};

export default Types;
