const Types = {
    secrets:   {
        manager: Symbol('secrets.manager'),
    },
    database:  Symbol('database'),
    discord:   {
        token:      Symbol('discord.token'),
        options:    Symbol('discord.options'),
        client:     Symbol('discord.client'),
        restClient: Symbol('discord.client.rest'),
    },
    logger:    Symbol('logger'),
    plugins:   {},
    webserver: Symbol('webserver'),
};

export default Types;
