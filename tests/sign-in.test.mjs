import assert from "node:assert/strict";
import test from "node:test";
import * as appwrite from "node-appwrite";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const credentials = { email: "test@example.com", password: "test-password" };
const user = { $id: "profile-id", userId: "user-id", firstName: "Test" };

function setup({ previousSession, authenticationError } = {}) {
  const calls = { authenticate: [], cookies: [], queries: [], errors: [] };
  const cookieStore = {
    get: () => previousSession && { value: previousSession },
    set: (...args) => calls.cookies.push(args),
  };
  const globals = {
    process: {
      env: {
        NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://example.invalid/v1",
        NEXT_PUBLIC_APPWRITE_PROJECT: "test-project",
        NEXT_APPWRITE_KEY: "test-key",
        APPWRITE_DATABASE_ID: "test-database",
        APPWRITE_USER_COLLECTION_ID: "test-users",
      },
    },
    console: { error: (...args) => calls.errors.push(args) },
  };
  const sdk = {
    ...appwrite,
    Account: class {
      constructor(client) {
        this.client = client;
      }

      async createEmailPasswordSession(email, password) {
        calls.authenticate.push([email, password]);
        assert.equal(this.client.config.session, "");
        assert.equal(this.client.config.key, "test-key");
        if (authenticationError) throw authenticationError;
        return { secret: "new-session-secret", userId: user.userId };
      }
    },
    Databases: class {
      async listDocuments(...args) {
        calls.queries.push(args);
        return { documents: [user] };
      }
    },
  };
  const headers = { cookies: async () => cookieStore };
  const clients = loadTypeScript("lib/appwrite.ts", {
    "node-appwrite": sdk,
    "next/headers": headers,
  }, globals);
  const actions = loadTypeScript("lib/actions/user.actions.ts", {
    "node-appwrite": sdk,
    "../appwrite": clients,
    "next/headers": headers,
    "../utils": { parseStringify: (value) => JSON.parse(JSON.stringify(value)) },
    "plaid": {},
    "../plaid": {},
    "next/cache": {},
    "./dwolla.actions": {},
  }, globals);
  return { signIn: actions.signIn, calls };
}

for (const previousSession of [undefined, "expired-session"]) {
  test(`signs in with ${previousSession ? "an expired" : "no"} session cookie`, async () => {
    const { signIn, calls } = setup({ previousSession });

    assert.deepEqual(await signIn(credentials), user);
    assert.deepEqual(calls.authenticate, [[credentials.email, credentials.password]]);
    assert.deepEqual(calls.cookies, [["appwrite-session", "new-session-secret", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    }]]);
    assert.deepEqual(calls.queries, [[
      "test-database",
      "test-users",
      [appwrite.Query.equal("userId", [user.userId])],
    ]]);
    assert.equal(calls.errors.length, 0);
  });
}

test("rethrows invalid credentials without setting a cookie or loading a profile", async () => {
  const authenticationError = new Error("Invalid credentials");
  const { signIn, calls } = setup({ authenticationError });

  await assert.rejects(signIn(credentials), (error) => error === authenticationError);
  assert.equal(calls.authenticate.length, 1);
  assert.deepEqual(calls.cookies, []);
  assert.deepEqual(calls.queries, []);
  assert.equal(calls.errors.length, 1);
});
