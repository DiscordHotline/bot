import 'dotenv/config';
import 'reflect-metadata';
import 'source-map-support/register';
import Kernel from './Kernel';

const kernel = new Kernel(process.env.ENVIRONMENT, process.env.DEBUG);

kernel.run().catch(console.error);
