export interface User {
    id: string;
    insertDate: Date;
}

export interface Tag {
    id: number;
    name: string;
    category: TagCategory;
    insertDate: Date;
}

export interface TagCategory {
    id: number;
    name: string;
    insertDate: Date;
}

export interface Report {
    id: number;
    reporter: User;
    guildId?: string;
    reportedUsers: User[];
    confirmations: Confirmation[];
    reason: string;
    tags: Tag[];
    links: string[];
    messageIds: string[];
    insertDate: Date;
    updateDate: Date;
}

export interface Confirmation {
    report?: Report;
    user: User;
    guild: string;
    insertDate: Date;
}

export interface Config {
    apiUrl?: string;
    hotlineGuildId: string;
    reportChannel: string;
    subscriptions: string[];
}

export interface Tag {
    id: number;
    name: string;
    insertDAte: Date;
}

export interface ApiReportList {
    count: number;
    results: Report[];
}
