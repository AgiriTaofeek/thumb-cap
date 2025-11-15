import dotenv from 'dotenv';
import app from './core/app.js';
dotenv.config();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => { });
