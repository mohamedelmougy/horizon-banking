import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const accessToken = "test-access-token";
const firstTransaction = {
  transaction_id: "transaction-1",
  name: "Groceries",
  payment_channel: "in store",
  account_id: "account-1",
  amount: 25,
  pending: false,
  category: ["Food and Drink", "Groceries"],
  date: "2025-01-01",
  logo_url: null,
};

function setup(respond) {
  const calls = [];
  const errors = [];
  const { getTransactions } = loadTypeScript("lib/actions/bank.actions.ts", {
    "plaid": {},
    "../plaid": {
      plaidClient: {
        async transactionsSync(request) {
          calls.push(request);
          // Bound a repeated-first-page regression instead of hanging the test.
          if (calls.length > 5) throw new Error("Pagination did not terminate");
          return { data: await respond(request) };
        },
      },
    },
    "../utils": { parseStringify: (value) => JSON.parse(JSON.stringify(value)) },
    "./user.actions": {},
    "./transaction.actions": {},
  }, { console: { error: (...args) => errors.push(args) } });
  return { getTransactions, calls, errors };
}

test("advances cursors and retains transactions across an empty intermediate page", async () => {
  const secondTransaction = { ...firstTransaction, transaction_id: "transaction-2" };
  const pages = new Map([
    [undefined, { added: [firstTransaction], next_cursor: "page-2", has_more: true }],
    ["page-2", { added: [], next_cursor: "page-3", has_more: true }],
    ["page-3", { added: [secondTransaction], next_cursor: "done", has_more: false }],
  ]);
  const { getTransactions, calls, errors } = setup(({ cursor }) => pages.get(cursor));

  const transactions = await getTransactions({ accessToken });

  assert.deepEqual(calls.map(({ cursor }) => cursor), [undefined, "page-2", "page-3"]);
  assert.deepEqual(transactions?.map(({ id }) => id), ["transaction-1", "transaction-2"]);
  assert.ok(calls.every(({ access_token }) => access_token === accessToken));
  assert.deepEqual(errors, []);
});

test("preserves the transaction fields and handles a missing category", async () => {
  const { getTransactions, calls } = setup(() => ({
    added: [firstTransaction, { ...firstTransaction, transaction_id: "transaction-2", category: null }],
    next_cursor: "done",
    has_more: false,
  }));

  const transactions = await getTransactions({ accessToken });

  assert.deepEqual(transactions[0], {
    id: "transaction-1",
    name: "Groceries",
    paymentChannel: "in store",
    type: "in store",
    accountId: "account-1",
    amount: 25,
    pending: false,
    category: "Food and Drink",
    date: "2025-01-01",
    image: null,
  });
  assert.equal(transactions[1].category, "");
  assert.equal(calls.length, 1);
});

test("returns an empty list when there are no transactions", async () => {
  const { getTransactions, calls } = setup(() => ({
    added: [], next_cursor: "done", has_more: false,
  }));

  assert.deepEqual(await getTransactions({ accessToken }), []);
  assert.equal(calls.length, 1);
});

test("does not return partial history if a later page fails", async () => {
  const failure = new Error("Plaid unavailable");
  const { getTransactions, calls, errors } = setup(({ cursor }) => {
    if (cursor === "page-2") throw failure;
    return { added: [firstTransaction], next_cursor: "page-2", has_more: true };
  });

  assert.equal(await getTransactions({ accessToken }), undefined);
  assert.equal(calls.length, 2);
  assert.equal(errors[0][1], failure);
});

test("starts a new sync without reusing a previous invocation's cursor", async () => {
  const { getTransactions, calls } = setup(() => ({
    added: [], next_cursor: "done", has_more: false,
  }));

  await getTransactions({ accessToken });
  await getTransactions({ accessToken: "another-test-token" });

  assert.deepEqual(calls.map(({ cursor }) => cursor), [undefined, undefined]);
  assert.equal(calls[1].access_token, "another-test-token");
});
