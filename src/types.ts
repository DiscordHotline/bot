const TYPES = {
    vault:    {
        client: Symbol('vault.client'),
    },
    database: Symbol('database'),
    discord:  {
        token:   Symbol('discord.token'),
        options: Symbol('discord.options'),
        client:  Symbol('discord.client'),
    },
};

export default TYPES;
