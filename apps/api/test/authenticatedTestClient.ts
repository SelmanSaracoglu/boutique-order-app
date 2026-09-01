import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { app } from '../src/app.js'
import { provisionUser } from '../src/auth/provisionUser.js'
import { CSRF_HEADER_NAME } from '../src/auth/requireCsrf.js'
import type { UserRole } from '../src/auth/user.js'


const TEST_PASSWORD = 'a memorable test passphrase'

export async function createAuthenticatedTestClient(
    role: UserRole = 'ADMIN',
) {
    const username = `api.test.${randomUUID()
        .replaceAll('-', '')
        .slice(0, 16)}`

    await provisionUser({
        username,
        password: TEST_PASSWORD,
        role,
    })

    const agent = request.agent(app)

    const loginResponse = await agent
        .post('/api/auth/login')
        .send({
            username,
            password: TEST_PASSWORD,
        })

    if (loginResponse.status !== 200) {
        throw new Error(
            `Test client login failed with status ${loginResponse.status}`,
        )
    }

    const csrfToken: unknown = loginResponse.body.csrfToken

    if (typeof csrfToken !== 'string') {
        throw new Error(
            'Test client login returned no CSRF token',
        )
    }

    return {
        agent,
        csrfToken,

        get(path: string) {
            return agent.get(path)
        },
        post(path: string) {
            return agent
                .post(path)
                .set(CSRF_HEADER_NAME, csrfToken)
        },

        patch(path: string) {
            return agent
                .patch(path)
                .set(CSRF_HEADER_NAME, csrfToken)
        },
    }
}

export type AuthenticatedTestClient = Awaited<
  ReturnType<typeof createAuthenticatedTestClient>
>
