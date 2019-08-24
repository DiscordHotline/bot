const Types = {
    api:       {
        url:    Symbol('report.api.url'),
        client: Symbol('report.api.client'),
    },
    factory:   {
        interactiveReport: Symbol('report.factory.interactiveReport'),
        confirmReport:     Symbol('report.confirm'),
    },
    listener:  {
        report: Symbol('report.listener.report'),
    },
    webserver: Symbol('webserver'),
};

export default Types;
