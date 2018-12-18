const Types = {
    vault:    {
        client: Symbol('vault.client'),
        config: Symbol('vault.config'),
    },
    database: Symbol('database'),
    discord:  {
        token:   Symbol('discord.token'),
        options: Symbol('discord.options'),
        client:  Symbol('discord.client'),
    },
    logger:   Symbol('logger'),
};

export default Types;
