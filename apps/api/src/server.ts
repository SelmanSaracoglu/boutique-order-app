import 'dotenv/config'
import { app } from './app.js'
import { pool } from './db.js'


const port = Number(process.env.PORT ?? 3001)

const result = await pool.query('SELECT current_database(), current_user')

console.log('Database connection:', result.rows[0])

app.listen(port, () => {
  console.log(`API listening on port ${port}`)
})