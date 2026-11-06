// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

/** XML・SVG・HTML に文字を入れるときに、特別な記号(& < > ")を書きかえる */
export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
