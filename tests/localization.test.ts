import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CharacterAssetWorkspace,
  CharacterStudio,
} from "../src/components/character-studio";
import {
  LANGUAGE_STORAGE_KEY,
  LanguageProvider,
  persistLanguage,
  readPreferredLanguage,
} from "../src/components/language-provider";
import {
  createTranslator,
  resolveLanguage,
} from "../src/lib/i18n";
import { en } from "../src/locales/en";
import { zh } from "../src/locales/zh";

test("English and Chinese dictionaries expose the same translation keys", () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test("stored language wins, then browser language, then English", () => {
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage(null, "zh-CN"), "zh");
  assert.equal(resolveLanguage(null, "zh-Hans"), "zh");
  assert.equal(resolveLanguage(null, "fr-FR"), "en");
  assert.equal(resolveLanguage(null, undefined), "en");
});

test("language preference reads from and writes to storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };

  assert.equal(readPreferredLanguage(storage, "zh-CN"), "zh");
  persistLanguage(storage, "en");
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "en");
  assert.equal(readPreferredLanguage(storage, "zh-CN"), "en");
});

test("the language switch is in-place and visibly marks the active language", () => {
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  const provider = readFileSync(
    new URL("../src/components/language-provider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.atlas-language-switcher button\[aria-pressed="true"\][\s\S]*?var\(--atlas-accent-strong\)/,
  );
  assert.match(provider, /localStorage/);
  assert.doesNotMatch(provider, /location\.reload|window\.location/);
});

test("translator switches language and interpolates user-owned values", () => {
  const english = createTranslator("en");
  const chinese = createTranslator("zh");

  assert.equal(english("generation.generate"), "Generate");
  assert.equal(chinese("generation.generate"), "生成");
  assert.equal(
    chinese("character.deleteTitle", { name: "Mira" }),
    "删除 Mira？",
  );
});

test("the studio and production workspace render completely in Chinese", () => {
  const studio = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { initialLanguage: "zh" },
      React.createElement(CharacterStudio),
    ),
  );
  const workspace = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { initialLanguage: "zh" },
      React.createElement(CharacterAssetWorkspace, {
        character: {
          id: "character-1",
          name: "Mira",
          description: "A storm scout.",
          personality: "Resolute",
          species: "Human",
          createdAt: "2026-07-25T12:00:00.000Z",
        },
        characters: [],
      }),
    ),
  );

  assert.match(studio, /角色库/);
  assert.match(studio, /角色制作系统/);
  assert.match(studio, /设定一次，/);
  assert.match(studio, /持续生成。/);
  assert.match(
    studio,
    /基于角色设定与视觉参考，稳定产出风格一致的游戏资产。/,
  );
  assert.match(studio, /新建角色/);
  assert.match(studio, /aria-label="语言"/);
  assert.match(studio, /aria-label="简体中文" aria-pressed="true"/);
  assert.doesNotMatch(studio, /Character library|One character\.|New character/);

  assert.match(workspace, /视觉参考/);
  assert.match(workspace, /持续的创意上下文/);
  assert.match(workspace, /创建游戏资产/);
  assert.match(workspace, /资产类型/);
  assert.match(workspace, /风格来源/);
  assert.match(workspace, /视觉风格/);
  assert.match(workspace, /镜头／视角/);
  assert.match(workspace, /透明背景且不添加地面阴影/);
  assert.match(workspace, />生成</);
  assert.doesNotMatch(
    workspace,
    /Visual references|Persistent creative context|Create game asset|>Generate</,
  );
});
