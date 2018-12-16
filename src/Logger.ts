import logger from 'debug';

export default (namespace) => {
    namespace  = 'app:' + namespace;
    const base = logger(namespace);

    const log = base.extend('LOG');
    log.log   = console.log.bind(console);

    const info = base.extend('INFO');
    info.log   = console.info.bind(console);

    const debug = base.extend('DEBUG');
    debug.log   = console.debug.bind(console);

    const error = base.extend('ERROR');
    error.log   = console.error.bind(console);

    return {log, info, debug, error};
};
