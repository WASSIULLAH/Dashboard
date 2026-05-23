const app = require('./app');
const { initDb } = require('./db');

const PORT = process.env.PORT || 5000;

initDb().then(database => {
    app.setDb(database);
    console.log('Database connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
