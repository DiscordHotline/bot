import 'reflect-metadata';
import 'source-map-support/register';
import Kernel from './Kernel';

const kernel = new Kernel(process.env.ENVIRONMENT, process.env.DEBUG === '1');

kernel.run().catch(console.error);
