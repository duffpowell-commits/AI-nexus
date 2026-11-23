import { addUser } from './auth.js'
import { openDatabase } from './database.js'
import { databasePath } from './config.js'

const username = process.argv[2]
if (!username) throw new Error('Pass a username and provide the password on stdin.')

let password = ''
for await (const chunk of process.stdin.setEncoding('utf8')) {
  password += chunk
  if (password.length > 80) throw new Error('Password is too long.')
}
const db = openDatabase(databasePath())
try {
  await addUser(db, username, password.replace(/\r?\n$/, ''))
  console.log('Nexus account created.')
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith('Use a ') ? error.message : 'Could not create account. Check the username and database path.')
  process.exitCode = 1
} finally {
  db.close()
}
