import path from 'node:path';
import express from 'express';

import db from './persistence/index.js';
import getItems from './routes/get-items.js';
import addItem from './routes/add-item.js';
import updateItem from './routes/update-item.js';
import deleteItem from './routes/delete-item.js';

const app = express();

app.use(express.json());
// __dirname does not exist in ESM. The build copies src/static next to the
// compiled output, so this resolves to src/static when run from source and to
// dist/static when run from the build.
app.use(express.static(path.join(import.meta.dirname, 'static')));

app.get('/items', getItems);
app.post('/items', addItem);
app.put('/items/:id', updateItem);
app.delete('/items/:id', deleteItem);

db.init()
    .then(() => {
        app.listen(3000, () => console.log('Listening on port 3000'));
    })
    .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
    });

const gracefulShutdown = (): void => {
    db.teardown()
        .catch(() => {})
        .then(() => process.exit());
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
