import assert from "node:assert/strict";
import test from "node:test";
import {
  createCharacterHandler,
  createUpdateCharacterHandler,
} from "../src/lib/character-handler";

function characterRequest(name: string) {
  return new Request("http://localhost/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: "A careful explorer",
      personality: "Curious",
      species: "Human",
    }),
  });
}

test("rejects character names longer than 60 characters after trimming", async () => {
  let createCalls = 0;
  const handler = createCharacterHandler({
    createCharacter: async () => {
      createCalls += 1;
      return {};
    },
  });

  const response = await handler(characterRequest(`  ${"a".repeat(61)}  `));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Name must be no longer than 60 characters.",
  });
  assert.equal(createCalls, 0);
});

test("creates a character whose trimmed name is exactly 60 characters", async () => {
  const createdCharacters: Array<Record<string, string>> = [];
  const handler = createCharacterHandler({
    createCharacter: async (data) => {
      const character = { id: "character-1", ...data };
      createdCharacters.push(character);
      return character;
    },
  });

  const response = await handler(characterRequest(`  ${"a".repeat(60)}  `));

  assert.equal(response.status, 201);
  assert.deepEqual(createdCharacters, [{
    id: "character-1",
    name: "a".repeat(60),
    description: "A careful explorer",
    personality: "Curious",
    species: "Human",
  }]);
  assert.deepEqual(await response.json(), createdCharacters[0]);
});

test("rejects updating a character to a name longer than 60 characters after trimming", async () => {
  let updateCalls = 0;
  const handler = createUpdateCharacterHandler({
    updateCharacter: async () => {
      updateCalls += 1;
      return {};
    },
  });
  const request = new Request("http://localhost/api/characters/character-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `  ${"a".repeat(61)}  ` }),
  });

  const response = await handler(request, {
    params: Promise.resolve({ id: "character-1" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Name must be no longer than 60 characters.",
  });
  assert.equal(updateCalls, 0);
});
