import 'dotenv/config'
import passwordPrompt from '@inquirer/password'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import {
  provisionUser,
  UserProvisioningError,
} from '../auth/provisionUser.js'
import {
  userRoleSchema,
  usernameSchema,
} from '../auth/user.js'
import { pool } from '../db.js'

const identityArgumentsSchema = z
  .object({
    username: usernameSchema,
    role: userRoleSchema,
  })
  .strict()

function readIdentityArguments(): {
  username: string
  role: string
} {
  const { values } = parseArgs({
    options: {
      username: {
        type: 'string',
      },
      role: {
        type: 'string',
      },
    },
    strict: true,
    allowPositionals: false,
  })

  if (!values.username || !values.role) {
    throw new UserProvisioningError(
      'INVALID_INPUT',
      'Both --username and --role are required.',
    )
  }

  return {
    username: values.username,
    role: values.role,
  }
}

async function main(): Promise<void> {
  const identityArguments = readIdentityArguments()

  const identityValidationResult =
    identityArgumentsSchema.safeParse(identityArguments)

  if (!identityValidationResult.success) {
    throw new UserProvisioningError(
      'INVALID_INPUT',
      identityValidationResult.error.issues[0]?.message ??
        'User identity input is invalid.',
      identityValidationResult.error,
    )
  }

  const password = await passwordPrompt({
    message: 'Password:',
    mask: '*',
  })

  const passwordConfirmation = await passwordPrompt({
    message: 'Confirm password:',
    mask: '*',
  })

  if (password !== passwordConfirmation) {
    throw new UserProvisioningError(
      'INVALID_INPUT',
      'Password confirmation does not match.',
    )
  }

  const user = await provisionUser({
    ...identityValidationResult.data,
    password,
  })

  console.log(
    `Provisioned user ${user.username} with role ${user.role}.`,
  )
}

try {
  await main()
} catch (error) {
  if (error instanceof UserProvisioningError) {
    console.error(error.message)
  } else {
    console.error('Unable to provision user.')
  }

  process.exitCode = 1
} finally {
  await pool.end()
}